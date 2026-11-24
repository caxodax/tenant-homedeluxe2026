import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { broadcastTenantOrderEvent } from '@/lib/realtime/tenant-orders-channel';
import { invalidateTenantCache } from '@/lib/tenant';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const saleSchema = z.object({
  store_id: z.string().min(1, 'ID de sucursal requerido'),
  customer_name: z.string().min(1),
  customer_phone: z.string().optional().default('0000000000'),
  items: z.array(z.object({
    product_id: z.string().min(1, 'ID de producto requerido'),
    product_name: z.string(),
    quantity: z.number().positive(),
    unit_price_primary: z.number().nonnegative().optional(),
    unit_price_usd: z.number().nonnegative().optional(),
    total_price_primary: z.number().nonnegative().optional(),
    total_price_usd: z.number().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  subtotal_primary: z.number().nonnegative().optional(),
  subtotal_usd: z.number().nonnegative().optional(),
  discount_primary: z.number().nonnegative().default(0).optional(),
  discount_usd: z.number().nonnegative().default(0).optional(),
  tax_primary: z.number().nonnegative().default(0).optional(),
  tax_usd: z.number().nonnegative().default(0).optional(),
  shipping_primary: z.number().nonnegative().default(0).optional(),
  shipping_usd: z.number().nonnegative().default(0).optional(),
  total_primary: z.number().nonnegative().optional(),
  total_usd: z.number().nonnegative().optional(),
  total_secondary: z.number().nonnegative().optional().nullable(),
  exchange_rate_applied: z.number().positive().default(1.0),
  offline_ticket_ref: z.string().min(1),
  is_offline_sale: z.literal(true),
  payment: z.object({
    method: z.string().min(2),
    amount: z.number().nonnegative(),
    currency: z.string().default('USD'),
    reference_number: z.string().optional(),
  }),
  cxc_data: z.object({
    account_type: z.enum(['LAYAWAY', 'BNPL_FINANCING', 'DIRECT_CREDIT']),
    document_type: z.enum(['FISCAL_INVOICE', 'COMMERCIAL_NOTE']).default('COMMERCIAL_NOTE'),
    financing_provider: z.string().optional().nullable(),
    external_reference: z.string().optional().nullable(),
    down_payment_usd: z.number().min(0).default(0),
    down_payment_method: z.string().optional(),
    term_days: z.number().int().positive().default(30),
    notes: z.string().optional().nullable(),
    customer_id_number: z.string().optional().nullable(),
  }).optional().nullable(),
  sales_rep_id: z.string().uuid().optional().nullable(),
  quote_id: z.string().uuid().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  notes: z.string().optional(),
});

const syncRequestSchema = z.object({
  tenant_slug: z.string().min(3),
  sales_batch: z.array(saleSchema).min(1).max(50),
  batch_hash: z.string().min(32).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = syncRequestSchema.safeParse(body);
    
    if (!parsed.success) {
      console.error('POS sync validation error:', parsed.error.flatten());
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    
    const { tenant_slug, sales_batch, batch_hash } = parsed.data;
    
    // Obtener schema_name del tenant
    const tenantRes = await pool.query(
      `SELECT db_schema_name FROM platform.tenants WHERE slug = $1 AND status IN ('active', 'trial')`,
      [tenant_slug]
    );
    
    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    
    const schemaName = tenantRes.rows[0].db_schema_name;

    // Resolver la sucursal principal real para rescatar ventas con store_id 'default' o vacío
    const defaultStoreId = await withTenantDb(schemaName, null, async (client) => {
      const sRes = await client.query(
        `SELECT id FROM stores WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
      );
      return sRes.rows[0]?.id || null;
    });

    const normalizedBatch = sales_batch.map((sale) => {
      const resolvedStoreId = UUID_REGEX.test(sale.store_id)
        ? sale.store_id
        : defaultStoreId || sale.store_id;
      const phone = sale.customer_phone?.trim();
      const resolvedPhone = phone && phone.length >= 7 ? phone : '0000000000';
      const tot = sale.total_primary ?? sale.total_usd ?? 0;
      const sub = sale.subtotal_primary ?? sale.subtotal_usd ?? tot;
      const disc = sale.discount_primary ?? sale.discount_usd ?? 0;

      return {
        ...sale,
        total_primary: tot,
        total_usd: tot,
        subtotal_primary: sub,
        subtotal_usd: sub,
        discount_primary: disc,
        discount_usd: disc,
        store_id: resolvedStoreId,
        customer_phone: resolvedPhone,
        items: sale.items.map((i) => {
          const up = i.unit_price_primary ?? i.unit_price_usd ?? 0;
          const tp = i.total_price_primary ?? i.total_price_usd ?? Number((up * i.quantity).toFixed(2));
          return {
            ...i,
            unit_price_primary: up,
            unit_price_usd: up,
            total_price_primary: tp,
            total_price_usd: tp,
          };
        }),
      };
    });
    
    // Llamar al RPC canónico de reconciliación
    const result = await pool.query(
      `SELECT platform.rpc_core_reconcile_offline_sales($1, $2::jsonb, $3)`,
      [schemaName, JSON.stringify(normalizedBatch), batch_hash]
    );

    const syncResult = result.rows[0]?.rpc_core_reconcile_offline_sales;
    const reconciledCount = Number(syncResult?.reconciled_count || 0);

    if (reconciledCount > 0) {
      const details = Array.isArray(syncResult?.details) ? syncResult.details : [];
      const firstReconciled = details.find(
        (d: { status?: string; order_id?: string }) => d.status === 'RECONCILED'
      );
      const batchTotalUsd = normalizedBatch.reduce(
        (sum, sale) => sum + Number(sale.total_primary || sale.total_usd || 0),
        0
      );

      invalidateTenantCache(tenant_slug, 'catalog', 'swr');

      // Procesar Cuentas por Cobrar (CxC) para ventas reconciliadas con cxc_data
      try {
        const salesWithCxc = normalizedBatch.filter((s) => Boolean(s.cxc_data));
        if (salesWithCxc.length > 0) {
          await withTenantDb(schemaName, null, async (client) => {
            const checkTbl = await client.query(`SELECT to_regclass('cxc_accounts') AS tbl`);
            if (!checkTbl.rows[0]?.tbl) return;

            for (const d of details) {
              if (d.status !== 'RECONCILED' || !d.order_id) continue;
              const sale = normalizedBatch.find((s) => s.offline_ticket_ref === d.offline_ref);
              if (!sale || !sale.cxc_data) continue;

              const existingAcc = await client.query(
                `SELECT id FROM cxc_accounts WHERE order_id = $1 LIMIT 1`,
                [d.order_id]
              );
              if (existingAcc.rowCount && existingAcc.rowCount > 0) continue;

              // Resolver o registrar cliente
              const custRes = await client.query(
                `INSERT INTO customers (name, phone, id_number)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (phone) DO UPDATE 
                 SET name = EXCLUDED.name,
                     id_number = COALESCE(EXCLUDED.id_number, customers.id_number)
                 RETURNING id`,
                [sale.customer_name, sale.customer_phone, sale.cxc_data.customer_id_number || null]
              );
              const customerId = custRes.rows[0].id;

              // Generar correlativo CXC-YYYYMM-XXXXX
              const seqRes = await client.query(
                `SELECT format('CXC-%s-%s', to_char(now(), 'YYYYMM'), lpad(nextval('cxc_account_seq')::text, 5, '0')) AS acc_num`
              );
              const accountNumber = seqRes.rows[0].acc_num;

              const originalAmount = Number(sale.total_primary || sale.total_usd || 0);
              const downPayment = Math.min(originalAmount, Math.max(0, Number(sale.cxc_data.down_payment_usd || 0)));
              const financedAmount = Math.max(0, Number((originalAmount - downPayment).toFixed(2)));
              const downPercent = originalAmount > 0 ? Number(((downPayment / originalAmount) * 100).toFixed(2)) : 0;
              const termDays = sale.cxc_data.term_days || (sale.cxc_data.account_type === 'LAYAWAY' ? 30 : 15);
              const custodyStatus = sale.cxc_data.account_type === 'LAYAWAY' ? 'IN_CUSTODY' : 'NOT_APPLICABLE';
              const accountStatus = financedAmount === 0 ? 'SETTLED' : 'CURRENT';

              // En caso de apartado, mantener orden en CONFIRMED (mercancía bajo custodia en tienda)
              if (sale.cxc_data.account_type === 'LAYAWAY') {
                await client.query(
                  `UPDATE orders SET status = 'CONFIRMED' WHERE id = $1`,
                  [d.order_id]
                );
              }

              const accRes = await client.query(
                `INSERT INTO cxc_accounts (
                   account_number, order_id, customer_id, seller_id, account_type, document_type,
                   financing_provider, external_reference, custody_status,
                   original_amount_primary, original_amount_usd,
                   down_payment_primary, down_payment_usd, down_payment_percent,
                   financed_amount_primary, financed_amount_usd,
                   balance_primary, balance_usd,
                   total_paid_primary, total_paid_usd,
                   term_days, issue_date, due_date, status, notes
                 ) VALUES (
                   $1, $2, $3, $4, $5, $6, $7, $8, $9,
                   $10, $10, $11, $11, $12, $13, $13, $14, $14, $15, $15, $16,
                   CURRENT_DATE, CURRENT_DATE + ($16 || ' days')::interval, $17, $18
                 ) RETURNING id`,
                [
                  accountNumber,
                  d.order_id,
                  customerId,
                  sale.sales_rep_id || null,
                  sale.cxc_data.account_type,
                  sale.cxc_data.document_type || 'COMMERCIAL_NOTE',
                  sale.cxc_data.account_type === 'BNPL_FINANCING' ? 'CASHEA' : (sale.cxc_data.financing_provider || null),
                  sale.cxc_data.external_reference || null,
                  custodyStatus,
                  originalAmount,
                  downPayment,
                  downPercent,
                  financedAmount,
                  financedAmount,
                  downPayment,
                  termDays,
                  accountStatus,
                  sale.cxc_data.notes || `Venta POS ${sale.offline_ticket_ref}`
                ]
              );
              const accountId = accRes.rows[0].id;

              // Generar recibo de abono inicial si aplica
              if (downPayment > 0) {
                const recRes = await client.query(
                  `SELECT format('REC-%s-%s', to_char(now(), 'YYYYMM'), lpad(nextval('cxc_receipt_seq')::text, 5, '0')) AS rec_num`
                );
                const receiptNum = recRes.rows[0].rec_num;

                await client.query(
                  `INSERT INTO cxc_payments (
                     account_id, receipt_number, amount_primary, amount_usd, amount_original,
                     currency, exchange_rate_applied, payment_method, reference,
                     balance_before_primary, balance_before_usd, balance_after_primary, balance_after_usd
                   ) VALUES (
                     $1, $2, $3, $3, $3 * $4, 'VES', $4, $5, $6, $7, $7, $8, $8
                   )`,
                  [
                    accountId,
                    receiptNum,
                    downPayment,
                    sale.exchange_rate_applied || 1.0,
                    sale.cxc_data.down_payment_method || sale.payment.method || 'CASH_USD',
                    sale.payment.reference_number || 'INICIAL-POS',
                    originalAmount,
                    financedAmount
                  ]
                );
              }

              // Generar cuotas quincenales para financiamiento Cashea
              if (sale.cxc_data.account_type === 'BNPL_FINANCING' && financedAmount > 0) {
                const tranche1 = Number((financedAmount / 3).toFixed(2));
                const tranche2 = Number((financedAmount / 3).toFixed(2));
                const tranche3 = Number((financedAmount - tranche1 - tranche2).toFixed(2));

                await client.query(
                  `INSERT INTO cxc_financing_tranches (
                     account_id, tranche_number, tranche_name,
                     expected_amount_primary, expected_amount_usd,
                     expected_date, status
                   ) VALUES
                     ($1, 1, 'Cuota 1 (Día 14)', $2, $2, CURRENT_DATE + interval '14 days', 'PENDING'),
                     ($1, 2, 'Cuota 2 (Día 28)', $3, $3, CURRENT_DATE + interval '28 days', 'PENDING'),
                     ($1, 3, 'Cuota 3 (Día 42)', $4, $4, CURRENT_DATE + interval '42 days', 'PENDING')`,
                  [accountId, tranche1, tranche2, tranche3]
                );
              }
            }
          });
        }
      } catch (cxcErr) {
        console.error('Error syncing CxC accounts from POS:', cxcErr);
      }

      await broadcastTenantOrderEvent(tenant_slug, {
        type: 'ORDER_CREATED',
        orderId: firstReconciled?.order_id,
        orderNumber:
          reconciledCount === 1
            ? normalizedBatch[0]?.offline_ticket_ref || 'POS'
            : `${reconciledCount} ventas POS`,
        status: 'CONFIRMED',
        totalUsd: Number(batchTotalUsd.toFixed(2)),
        customerName:
          reconciledCount === 1 ? normalizedBatch[0]?.customer_name : 'Sincronización POS',
        source: 'POS_SYNC',
        needsVerification: false,
        count: reconciledCount,
      });
    }

    return NextResponse.json(syncResult);
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
