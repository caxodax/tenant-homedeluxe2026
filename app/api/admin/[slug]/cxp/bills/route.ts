import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const manualBillSchema = z.object({
  supplier_id: z.string().uuid('ID de proveedor requerido'),
  supplier_bill_number: z.string().trim().optional().nullable(),
  issue_date: z.string().optional().nullable(),
  term_days: z.number().int().min(0).default(15),
  total_primary: z.number().positive('El monto total debe ser mayor a 0').optional(),
  total_usd: z.number().positive('El monto total debe ser mayor a 0').optional(),
  notes: z.string().trim().optional().nullable(),
}).refine(data => (data.total_primary ?? data.total_usd) !== undefined, {
  message: 'El monto total es requerido',
  path: ['total_primary'],
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
    const supplierId = searchParams.get('supplier_id');
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10)));
    const offset = (page - 1) * pageSize;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const conditions: string[] = ['1=1'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (status === 'PENDING') {
        conditions.push(`b.status IN ('OPEN', 'PARTIAL')`);
      } else if (status === 'OVERDUE') {
        conditions.push(`b.status IN ('OPEN', 'PARTIAL') AND b.due_date < CURRENT_DATE`);
      } else if (status === 'PAID') {
        conditions.push(`b.status = 'PAID'`);
      } else if (status !== 'ALL') {
        conditions.push(`b.status = $${paramIdx++}`);
        values.push(status);
      }

      if (supplierId) {
        conditions.push(`b.supplier_id = $${paramIdx++}`);
        values.push(supplierId);
      }

      if (search) {
        conditions.push(`(
          b.internal_number ILIKE $${paramIdx} OR
          b.supplier_bill_number ILIKE $${paramIdx} OR
          s.name ILIKE $${paramIdx}
        )`);
        values.push(`%${search}%`);
        paramIdx++;
      }

      // Conteo total
      const countRes = await client.query(`
        SELECT COUNT(b.id) as total
        FROM ${tenant.db_schema_name}.cxp_bills b
        JOIN ${tenant.db_schema_name}.cxp_suppliers s ON s.id = b.supplier_id
        WHERE ${conditions.join(' AND ')};
      `, values);
      const totalCount = parseInt(countRes.rows[0].total, 10) || 0;

      // KPIs globales de cuentas por pagar (Estándar multimoneda _primary)
      const kpiRes = await client.query(`
        SELECT 
          COALESCE(SUM(balance_primary) FILTER (WHERE status IN ('OPEN', 'PARTIAL')), 0.00) as total_payable_primary,
          COALESCE(SUM(balance_primary) FILTER (WHERE status IN ('OPEN', 'PARTIAL') AND due_date < CURRENT_DATE), 0.00) as overdue_primary,
          COALESCE(SUM(total_primary) FILTER (WHERE status = 'PAID' AND updated_at >= date_trunc('month', CURRENT_DATE)), 0.00) as paid_month_primary,
          COUNT(id) FILTER (WHERE status IN ('OPEN', 'PARTIAL') AND due_date < CURRENT_DATE) as overdue_count
        FROM ${tenant.db_schema_name}.cxp_bills;
      `);
      const kpis = kpiRes.rows[0];

      // Anticipos abiertos globales
      const advRes = await client.query(`
        SELECT COALESCE(SUM(amount_primary - applied_primary), 0.00) as total_open_advances_primary
        FROM ${tenant.db_schema_name}.cxp_advances
        WHERE status = 'OPEN';
      `);
      const openAdvances = parseFloat(advRes.rows[0]?.total_open_advances_primary) || 0;

      // Listado paginado
      const query = `
        SELECT 
          b.id,
          b.internal_number,
          b.supplier_bill_number,
          b.supplier_id,
          s.name as supplier_name,
          s.category as supplier_category,
          b.origin,
          b.goods_receipt_id,
          b.issue_date,
          b.due_date,
          b.total_primary,
          b.total_usd,
          b.balance_primary,
          b.balance_usd,
          b.status,
          b.notes,
          b.created_at,
          (b.due_date - CURRENT_DATE) as days_remaining,
          COALESCE(
            (SELECT json_agg(
              json_build_object(
                'id', p.id,
                'payment_number', p.payment_number,
                'amount_primary', p.amount_primary,
                'amount_usd', p.amount_usd,
                'currency', p.currency,
                'original_amount', p.original_amount,
                'exchange_rate', p.exchange_rate,
                'paid_at', p.paid_at,
                'account_name', pa.name
              ) ORDER BY p.paid_at DESC
            ) FROM ${tenant.db_schema_name}.cxp_payments p
              LEFT JOIN ${tenant.db_schema_name}.cxp_payment_accounts pa ON pa.id = p.account_id
              WHERE p.bill_id = b.id
            ), '[]'::json
          ) as payments
        FROM ${tenant.db_schema_name}.cxp_bills b
        JOIN ${tenant.db_schema_name}.cxp_suppliers s ON s.id = b.supplier_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY 
          CASE WHEN b.status IN ('OPEN', 'PARTIAL') THEN 0 ELSE 1 END ASC,
          b.due_date ASC,
          b.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++};
      `;
      values.push(pageSize, offset);

      const res = await client.query(query, values);

      return NextResponse.json({
        success: true,
        bills: res.rows.map((row) => {
          const tot = parseFloat(row.total_primary ?? row.total_usd) || 0;
          const bal = parseFloat(row.balance_primary ?? row.balance_usd) || 0;
          return {
            ...row,
            total_primary: tot,
            total_usd: tot,
            balance_primary: bal,
            balance_usd: bal,
            days_remaining: parseInt(row.days_remaining, 10) || 0,
          };
        }),
        kpis: {
          total_payable_primary: parseFloat(kpis.total_payable_primary) || 0,
          total_payable_usd: parseFloat(kpis.total_payable_primary) || 0,
          overdue_primary: parseFloat(kpis.overdue_primary) || 0,
          overdue_usd: parseFloat(kpis.overdue_primary) || 0,
          paid_month_primary: parseFloat(kpis.paid_month_primary) || 0,
          paid_month_usd: parseFloat(kpis.paid_month_primary) || 0,
          overdue_count: parseInt(kpis.overdue_count, 10) || 0,
          open_advances_primary: openAdvances,
          open_advances_usd: openAdvances,
        },
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar facturas';
    return NextResponse.json({ error: message }, { status: 500 });
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
    const data = manualBillSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const seqRes = await client.query(
        `SELECT format('CXP-%s-%s', to_char(CURRENT_DATE, 'YYYYMM'), lpad(nextval('${tenant.db_schema_name}.cxp_bill_seq')::text, 6, '0')) as num;`
      );
      const billNumber = seqRes.rows[0].num;

      const issueDate = data.issue_date || new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + data.term_days * 86400000).toISOString().split('T')[0];

      const totalAmount = data.total_primary ?? data.total_usd ?? 0;

      const res = await client.query(`
        INSERT INTO ${tenant.db_schema_name}.cxp_bills (
          internal_number, supplier_bill_number, supplier_id, origin,
          issue_date, due_date,
          total_primary, total_usd,
          balance_primary, balance_usd,
          status, notes, created_by
        ) VALUES ($1, $2, $3, 'MANUAL', $4, $5, $6, $6, $6, $6, 'OPEN', $7, $8)
        RETURNING *;
      `, [
        billNumber,
        data.supplier_bill_number || null,
        data.supplier_id,
        issueDate,
        dueDate,
        totalAmount,
        data.notes || null,
        staff.id,
      ]);

      return NextResponse.json({
        success: true,
        bill: res.rows[0],
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al crear factura';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
