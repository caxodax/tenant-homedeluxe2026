import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createAccountSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().min(2, 'Nombre de cliente requerido'),
  customer_phone: z.string().trim().min(7, 'Teléfono requerido (mínimo 7 dígitos)'),
  customer_id_number: z.string().trim().optional().nullable(),
  order_id: z.string().uuid().optional().nullable(),
  seller_id: z.string().uuid().optional().nullable(),
  account_type: z.enum(['DIRECT_CREDIT', 'LAYAWAY', 'BNPL_FINANCING']).default('DIRECT_CREDIT'),
  document_type: z.enum(['FISCAL_INVOICE', 'COMMERCIAL_NOTE']).default('COMMERCIAL_NOTE'),
  financing_provider: z.string().trim().optional().nullable(),
  external_reference: z.string().trim().optional().nullable(),
  original_amount_usd: z.number().positive('El monto total debe ser mayor a 0'),
  down_payment_usd: z.number().min(0, 'La inicial no puede ser negativa').default(0),
  term_days: z.number().int().min(1, 'El plazo debe ser de al menos 1 día').default(15),
  notes: z.string().trim().optional().nullable(),
  down_payment_method: z.string().trim().optional().nullable(),
  down_payment_currency: z.string().trim().default('USD'),
  down_payment_exchange_rate: z.number().positive().default(1.0),
  down_payment_reference: z.string().trim().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || 'ALL';
    const accountType = searchParams.get('account_type') || 'ALL';
    const custodyStatus = searchParams.get('custody_status') || 'ALL';
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)));
    const offset = (page - 1) * pageSize;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // 1. Lazy update status a OVERDUE para cuentas vencidas
      await client.query(`
        UPDATE ${tenant.db_schema_name}.cxc_accounts
        SET status = 'OVERDUE', updated_at = now()
        WHERE status = 'CURRENT'
          AND due_date < CURRENT_DATE
          AND balance_usd > 0.00
      `);

      // 2. Query con filtros
      const conditions: string[] = ['1=1'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (status !== 'ALL') {
        conditions.push(`a.status = $${paramIdx++}`);
        values.push(status);
      }

      if (accountType !== 'ALL') {
        conditions.push(`a.account_type = $${paramIdx++}`);
        values.push(accountType);
      }

      if (custodyStatus !== 'ALL') {
        conditions.push(`a.custody_status = $${paramIdx++}`);
        values.push(custodyStatus);
      }

      if (search.trim()) {
        conditions.push(`(
          c.name ILIKE $${paramIdx} OR 
          c.phone ILIKE $${paramIdx} OR 
          COALESCE(c.id_number, '') ILIKE $${paramIdx} OR 
          a.account_number ILIKE $${paramIdx} OR
          COALESCE(a.external_reference, '') ILIKE $${paramIdx}
        )`);
        values.push(`%${search.trim()}%`);
        paramIdx++;
      }

      const whereClause = conditions.join(' AND ');

      // Total count
      const countRes = await client.query(`
        SELECT count(*)::int as total
        FROM ${tenant.db_schema_name}.cxc_accounts a
        JOIN ${tenant.db_schema_name}.customers c ON c.id = a.customer_id
        WHERE ${whereClause}
      `, values);
      const totalCount = countRes.rows[0]?.total || 0;

      // Accounts list
      const listQuery = `
        SELECT 
          a.id,
          a.account_number,
          a.order_id,
          a.customer_id,
          c.name as customer_name,
          c.phone as customer_phone,
          c.id_number as customer_id_number,
          a.seller_id,
          sp.full_name as seller_name,
          a.account_type,
          a.document_type,
          a.financing_provider,
          a.external_reference,
          a.custody_status,
          a.original_amount_usd,
          a.down_payment_usd,
          a.down_payment_percent,
          a.financed_amount_usd,
          a.balance_usd,
          a.total_paid_usd,
          a.term_days,
          a.issue_date,
          a.due_date,
          a.status,
          a.notes,
          a.created_at,
          (a.due_date - CURRENT_DATE) as days_remaining,
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', t.id,
                'tranche_number', t.tranche_number,
                'tranche_name', t.tranche_name,
                'expected_amount_usd', t.expected_amount_usd,
                'settled_amount_usd', t.settled_amount_usd,
                'fee_amount_usd', t.fee_amount_usd,
                'expected_date', t.expected_date,
                'settled_date', t.settled_date,
                'status', t.status
              ) ORDER BY t.tranche_number ASC
            )
            FROM ${tenant.db_schema_name}.cxc_financing_tranches t
            WHERE t.account_id = a.id
          ) as tranches,
          (
            SELECT count(*)::int
            FROM ${tenant.db_schema_name}.cxc_payments p
            WHERE p.account_id = a.id
          ) as payments_count
        FROM ${tenant.db_schema_name}.cxc_accounts a
        JOIN ${tenant.db_schema_name}.customers c ON c.id = a.customer_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = a.seller_id
        WHERE ${whereClause}
        ORDER BY 
          CASE WHEN a.status = 'OVERDUE' THEN 1 WHEN a.status = 'CURRENT' THEN 2 ELSE 3 END,
          a.due_date ASC,
          a.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}
      `;

      const listValues = [...values, pageSize, offset];
      const listRes = await client.query(listQuery, listValues);

      // KPI Aggregates
      const kpisRes = await client.query(`
        SELECT 
          COALESCE(sum(CASE WHEN status IN ('CURRENT', 'OVERDUE') THEN balance_usd ELSE 0 END), 0.00)::numeric(12,2) as total_receivable_usd,
          COALESCE(sum(CASE WHEN status = 'OVERDUE' THEN balance_usd ELSE 0 END), 0.00)::numeric(12,2) as overdue_amount_usd,
          count(CASE WHEN account_type = 'LAYAWAY' AND custody_status = 'IN_CUSTODY' THEN 1 END)::int as layaways_in_custody_count,
          COALESCE(sum(CASE WHEN account_type = 'LAYAWAY' AND custody_status = 'IN_CUSTODY' THEN balance_usd ELSE 0 END), 0.00)::numeric(12,2) as layaways_in_custody_balance_usd,
          COALESCE(sum(CASE WHEN account_type = 'BNPL_FINANCING' AND status IN ('CURRENT', 'OVERDUE') THEN balance_usd ELSE 0 END), 0.00)::numeric(12,2) as cashea_pending_usd,
          (
            SELECT COALESCE(sum(amount_usd), 0.00)::numeric(12,2)
            FROM ${tenant.db_schema_name}.cxc_payments
            WHERE created_at >= date_trunc('month', CURRENT_DATE)
          ) as month_collected_usd
        FROM ${tenant.db_schema_name}.cxc_accounts
      `);

      return NextResponse.json({
        success: true,
        accounts: listRes.rows,
        total: totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        kpis: kpisRes.rows[0] || {
          total_receivable_usd: 0,
          overdue_amount_usd: 0,
          layaways_in_custody_count: 0,
          layaways_in_custody_balance_usd: 0,
          cashea_pending_usd: 0,
          month_collected_usd: 0,
        },
      });
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching CXC accounts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener cartera CxC' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const parsed = createAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      await client.query('BEGIN');

      try {
        // 1. Obtener o crear cliente
        let customerId = data.customer_id;
        if (!customerId) {
          // Buscar por teléfono
          const findCust = await client.query(`
            SELECT id FROM ${tenant.db_schema_name}.customers WHERE phone = $1 LIMIT 1
          `, [data.customer_phone]);

          if (findCust.rows.length > 0) {
            customerId = findCust.rows[0].id;
          } else {
            const newCust = await client.query(`
              INSERT INTO ${tenant.db_schema_name}.customers (name, phone, id_number)
              VALUES ($1, $2, $3)
              RETURNING id
            `, [data.customer_name, data.customer_phone, data.customer_id_number || null]);
            customerId = newCust.rows[0].id;
          }
        }

        // 2. Correlativo de cuenta CXC-YYYYMM-XXXXX
        const seqRes = await client.query(`
          SELECT nextval('${tenant.db_schema_name}.cxc_account_seq') as seq
        `);
        const seqNumber = String(seqRes.rows[0].seq).padStart(5, '0');
        const now = new Date();
        const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const accountNumber = `CXC-${yyyymm}-${seqNumber}`;

        // 3. Montos y plazos
        const originalAmount = Number(data.original_amount_usd.toFixed(2));
        const downPayment = Number(data.down_payment_usd.toFixed(2));
        const financedAmount = Number(Math.max(0, originalAmount - downPayment).toFixed(2));
        const downPercent = originalAmount > 0 ? Number(((downPayment / originalAmount) * 100).toFixed(2)) : 0;
        const balanceUsd = financedAmount;
        const initialStatus = balanceUsd <= 0.00 ? 'SETTLED' : 'CURRENT';
        const custodyStatus = data.account_type === 'LAYAWAY' ? 'IN_CUSTODY' : 'NOT_APPLICABLE';

        // 4. Insertar cuenta CxC
        const insertAccRes = await client.query(`
          INSERT INTO ${tenant.db_schema_name}.cxc_accounts (
            account_number,
            order_id,
            customer_id,
            seller_id,
            account_type,
            document_type,
            financing_provider,
            external_reference,
            custody_status,
            original_amount_usd,
            down_payment_usd,
            down_payment_percent,
            financed_amount_usd,
            balance_usd,
            total_paid_usd,
            term_days,
            issue_date,
            due_date,
            status,
            notes,
            opened_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, CURRENT_DATE, CURRENT_DATE + $16 * INTERVAL '1 day',
            $17, $18, $19
          ) RETURNING *
        `, [
          accountNumber,
          data.order_id || null,
          customerId,
          data.seller_id || null,
          data.account_type,
          data.document_type,
          data.financing_provider || (data.account_type === 'BNPL_FINANCING' ? 'Cashea' : null),
          data.external_reference || null,
          custodyStatus,
          originalAmount,
          downPayment,
          downPercent,
          financedAmount,
          balanceUsd,
          0.00, // total_paid_usd inicial
          data.term_days,
          initialStatus,
          data.notes || null,
          staff.id,
        ]);

        const newAccount = insertAccRes.rows[0];

        // 5. Si es BNPL (Cashea / Krece), crear tranches automáticos (Bloque 1 y Bloque 2)
        if (data.account_type === 'BNPL_FINANCING' && financedAmount > 0) {
          const tranche1Amount = Number((financedAmount / 2).toFixed(2));
          const tranche2Amount = Number((financedAmount - tranche1Amount).toFixed(2));

          await client.query(`
            INSERT INTO ${tenant.db_schema_name}.cxc_financing_tranches (
              account_id, tranche_number, tranche_name, expected_amount_usd, expected_date, status
            ) VALUES 
            ($1, 1, 'Bloque 1 (14 días)', $2, CURRENT_DATE + INTERVAL '14 days', 'PENDING'),
            ($1, 2, 'Bloque 2 (30 días)', $3, CURRENT_DATE + INTERVAL '30 days', 'PENDING')
          `, [newAccount.id, tranche1Amount, tranche2Amount]);
        }

        // 6. Si hubo inicial inmediata, registrar el abono
        if (downPayment > 0 && data.down_payment_method) {
          const recSeqRes = await client.query(`
            SELECT nextval('${tenant.db_schema_name}.cxc_receipt_seq') as seq
          `);
          const recNumber = `REC-${yyyymm}-${String(recSeqRes.rows[0].seq).padStart(5, '0')}`;
          const exRate = Number(data.down_payment_exchange_rate || 1.0);
          const origAmt = data.down_payment_currency === 'USD' ? downPayment : Number((downPayment * exRate).toFixed(2));

          await client.query(`
            INSERT INTO ${tenant.db_schema_name}.cxc_payments (
              receipt_number,
              account_id,
              amount_usd,
              amount_original,
              currency,
              exchange_rate_applied,
              payment_method,
              reference,
              balance_before_usd,
              balance_after_usd,
              received_by,
              notes
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            )
          `, [
            recNumber,
            newAccount.id,
            downPayment,
            origAmt,
            data.down_payment_currency,
            exRate,
            data.down_payment_method,
            data.down_payment_reference || 'Inicial en apertura',
            originalAmount,
            financedAmount,
            staff.id,
            'Abono inicial en mostrador',
          ]);

          // Actualizar total_paid_usd
          await client.query(`
            UPDATE ${tenant.db_schema_name}.cxc_accounts
            SET total_paid_usd = $1
            WHERE id = $2
          `, [downPayment, newAccount.id]);
        }

        await client.query('COMMIT');

        return NextResponse.json({
          success: true,
          account: newAccount,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating CXC account:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear cuenta CxC' },
      { status: 500 }
    );
  }
}
