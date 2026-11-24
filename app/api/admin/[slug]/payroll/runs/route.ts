import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const generateRunSchema = z.object({
  period_id: z.string().uuid('ID de período inválido'),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const query = `
        SELECT 
          r.*,
          p.period_code,
          p.start_date,
          p.end_date,
          p.payment_frequency,
          sp_app.full_name as approved_by_name,
          sp_dis.full_name as disbursed_by_name,
          (SELECT COUNT(*) FROM ${tenant.db_schema_name}.pay_run_lines rl WHERE rl.run_id = r.id) as lines_count
        FROM ${tenant.db_schema_name}.pay_runs r
        JOIN ${tenant.db_schema_name}.pay_periods p ON p.id = r.period_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_app ON sp_app.id = r.approved_by
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_dis ON sp_dis.id = r.disbursed_by
        ORDER BY r.created_at DESC;
      `;
      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        runs: res.rows.map((row) => ({
          ...row,
          total_base_primary: parseFloat(row.total_base_primary || '0'),
          total_commissions_primary: parseFloat(row.total_commissions_primary || '0'),
          total_allowances_primary: parseFloat(row.total_allowances_primary || '0'),
          total_deductions_primary: parseFloat(row.total_deductions_primary || '0'),
          total_net_primary: parseFloat(row.total_net_primary || '0'),
          total_net_secondary: parseFloat(row.total_net_secondary || '0'),
          exchange_rate_snapshot: parseFloat(row.exchange_rate_snapshot || '1'),
          lines_count: parseInt(row.lines_count || '0', 10),
        })),
      });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/runs:', error);
    return NextResponse.json({ error: error.message || 'Error al listar corridas' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const { period_id } = generateRunSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        'SELECT platform.rpc_pay_generate_run($1, $2, $3) as result',
        [tenant.db_schema_name, period_id, staff.id]
      );

      const result = res.rows[0]?.result;
      return NextResponse.json(result, { status: 201 });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in POST /payroll/runs:', error);
    return NextResponse.json({ error: error.message || 'Error al generar corrida' }, { status: 500 });
  }
}
