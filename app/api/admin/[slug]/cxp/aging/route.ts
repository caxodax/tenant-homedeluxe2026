import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const { searchParams } = new URL(request.url);

    const yearMonth = searchParams.get('month') || new Date().toISOString().substring(0, 7); // 'YYYY-MM'
    const startOfMonth = `${yearMonth}-01`;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // 1. Resumen por Proveedor / Taller (Saldo Inicial + Compras Mes - Abonos Mes = Saldo Final)
      const ledgerQuery = `
        WITH
        month_bounds AS (
          SELECT 
            $1::date as m_start,
            ($1::date + interval '1 month')::date as m_end
        ),
        -- Deuda previa al inicio del mes
        prev_purchases AS (
          SELECT b.supplier_id, COALESCE(SUM(COALESCE(b.total_primary, b.total_usd)), 0.00) as prev_total
          FROM ${tenant.db_schema_name}.cxp_bills b, month_bounds mb
          WHERE b.issue_date < mb.m_start
          GROUP BY b.supplier_id
        ),
        prev_payments AS (
          SELECT b.supplier_id, COALESCE(SUM(COALESCE(p.amount_primary, p.amount_usd)), 0.00) as prev_paid
          FROM ${tenant.db_schema_name}.cxp_payments p
          JOIN ${tenant.db_schema_name}.cxp_bills b ON b.id = p.bill_id
          CROSS JOIN month_bounds mb
          WHERE p.paid_at < mb.m_start
          GROUP BY b.supplier_id
        ),
        -- Compras del mes actual
        cur_purchases AS (
          SELECT b.supplier_id, COALESCE(SUM(COALESCE(b.total_primary, b.total_usd)), 0.00) as month_total
          FROM ${tenant.db_schema_name}.cxp_bills b, month_bounds mb
          WHERE b.issue_date >= mb.m_start AND b.issue_date < mb.m_end
          GROUP BY b.supplier_id
        ),
        -- Abonos del mes actual
        cur_payments AS (
          SELECT b.supplier_id, COALESCE(SUM(COALESCE(p.amount_primary, p.amount_usd)), 0.00) as month_paid
          FROM ${tenant.db_schema_name}.cxp_payments p
          JOIN ${tenant.db_schema_name}.cxp_bills b ON b.id = p.bill_id
          CROSS JOIN month_bounds mb
          WHERE p.paid_at >= mb.m_start AND p.paid_at < mb.m_end
          GROUP BY b.supplier_id
        )
        SELECT 
          s.id as supplier_id,
          s.name as supplier_name,
          s.category as supplier_category,
          GREATEST(0, COALESCE(pp.prev_total, 0.00) - COALESCE(py.prev_paid, 0.00)) as initial_balance_primary,
          COALESCE(cp.month_total, 0.00) as month_purchases_primary,
          COALESCE(cy.month_paid, 0.00) as month_payments_primary,
          (
            GREATEST(0, COALESCE(pp.prev_total, 0.00) - COALESCE(py.prev_paid, 0.00))
            + COALESCE(cp.month_total, 0.00)
            - COALESCE(cy.month_paid, 0.00)
          ) as final_balance_primary
        FROM ${tenant.db_schema_name}.cxp_suppliers s
        LEFT JOIN prev_purchases pp ON pp.supplier_id = s.id
        LEFT JOIN prev_payments py ON py.supplier_id = s.id
        LEFT JOIN cur_purchases cp ON cp.supplier_id = s.id
        LEFT JOIN cur_payments cy ON cy.supplier_id = s.id
        WHERE s.is_active = true
        ORDER BY final_balance_primary DESC, s.name ASC;
      `;

      const ledgerRes = await client.query(ledgerQuery, [startOfMonth]);

      // 2. Resumen de Egresos por Método de Pago / Cuenta en el mes
      const methodsQuery = `
        SELECT 
          pa.type as account_type,
          pa.name as account_name,
          COUNT(p.id) as payments_count,
          COALESCE(SUM(COALESCE(p.amount_primary, p.amount_usd)), 0.00) as total_primary,
          p.currency,
          COALESCE(SUM(p.original_amount), 0.00) as total_original
        FROM ${tenant.db_schema_name}.cxp_payments p
        JOIN ${tenant.db_schema_name}.cxp_payment_accounts pa ON pa.id = p.account_id
        WHERE p.paid_at >= $1::date AND p.paid_at < ($1::date + interval '1 month')::date
        GROUP BY pa.type, pa.name, p.currency
        ORDER BY total_primary DESC;
      `;
      const methodsRes = await client.query(methodsQuery, [startOfMonth]);

      // 3. Totales globales del período
      let totalInitial = 0;
      let totalPurchases = 0;
      let totalPayments = 0;
      let totalFinal = 0;

      const suppliersLedger = ledgerRes.rows.map((row) => {
        const init = parseFloat(row.initial_balance_primary) || 0;
        const purch = parseFloat(row.month_purchases_primary) || 0;
        const pay = parseFloat(row.month_payments_primary) || 0;
        const fin = parseFloat(row.final_balance_primary) || 0;

        totalInitial += init;
        totalPurchases += purch;
        totalPayments += pay;
        totalFinal += fin;

        return {
          supplier_id: row.supplier_id,
          supplier_name: row.supplier_name,
          supplier_category: row.supplier_category,
          initial_balance_primary: init,
          initial_balance_usd: init,
          month_purchases_primary: purch,
          month_purchases_usd: purch,
          month_payments_primary: pay,
          month_payments_usd: pay,
          final_balance_primary: fin,
          final_balance_usd: fin,
        };
      });

      return NextResponse.json({
        success: true,
        month: yearMonth,
        totals: {
          initial_balance_primary: totalInitial,
          initial_balance_usd: totalInitial,
          month_purchases_primary: totalPurchases,
          month_purchases_usd: totalPurchases,
          month_payments_primary: totalPayments,
          month_payments_usd: totalPayments,
          final_balance_primary: totalFinal,
          final_balance_usd: totalFinal,
        },
        suppliers_ledger: suppliersLedger,
        payments_by_method: methodsRes.rows.map((m) => {
          const tot = parseFloat(m.total_primary) || 0;
          return {
            ...m,
            total_primary: tot,
            total_usd: tot,
            total_original: parseFloat(m.total_original) || 0,
            payments_count: parseInt(m.payments_count, 10) || 0,
          };
        }),
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al obtener reporte aging / mayor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
