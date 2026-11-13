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
    unit_price_usd: z.number().nonnegative(),
    total_price_usd: z.number().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  subtotal_usd: z.number().nonnegative(),
  discount_usd: z.number().nonnegative().default(0),
  tax_usd: z.number().nonnegative().default(0),
  shipping_usd: z.number().nonnegative().default(0),
  total_usd: z.number().nonnegative(),
  total_secondary: z.number().nonnegative().optional().nullable(),
  exchange_rate_applied: z.number().positive().default(1.0),
  offline_ticket_ref: z.string().min(1),
  is_offline_sale: z.literal(true),
  payment: z.object({
    method: z.string().min(2),
    amount: z.number().positive(),
    currency: z.string().default('USD'),
    reference_number: z.string().optional(),
  }),
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

      return {
        ...sale,
        store_id: resolvedStoreId,
        customer_phone: resolvedPhone,
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
        (sum, sale) => sum + Number(sale.total_usd || 0),
        0
      );

      invalidateTenantCache(tenant_slug, 'catalog', 'swr');
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
