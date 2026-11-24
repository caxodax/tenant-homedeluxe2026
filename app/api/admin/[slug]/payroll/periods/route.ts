import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const periodSchema = z.object({
  period_code: z.string().trim().min(3, 'Código de período requerido'),
  start_date: z.string().min(10, 'Fecha de inicio requerida'),
  end_date: z.string().min(10, 'Fecha de fin requerida'),
  payment_frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('BIWEEKLY'),
  notes: z.string().trim().optional().nullable(),
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
          p.*,
          r.id as run_id,
          r.run_number,
          r.status as run_status,
          r.total_net_primary,
          r.total_net_secondary,
          r.exchange_rate_snapshot,
          r.total_base_primary,
          r.total_commissions_primary,
          r.total_deductions_primary,
          (SELECT COUNT(*) FROM ${tenant.db_schema_name}.pay_run_lines rl WHERE rl.run_id = r.id) as employees_in_run
        FROM ${tenant.db_schema_name}.pay_periods p
        LEFT JOIN ${tenant.db_schema_name}.pay_runs r ON r.period_id = p.id
        ORDER BY p.start_date DESC;
      `;
      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        periods: res.rows.map((row) => ({
          ...row,
          total_net_primary: parseFloat(row.total_net_primary || '0'),
          total_net_secondary: parseFloat(row.total_net_secondary || '0'),
          total_base_primary: parseFloat(row.total_base_primary || '0'),
          total_commissions_primary: parseFloat(row.total_commissions_primary || '0'),
          total_deductions_primary: parseFloat(row.total_deductions_primary || '0'),
          exchange_rate_snapshot: parseFloat(row.exchange_rate_snapshot || '1'),
          employees_in_run: parseInt(row.employees_in_run || '0', 10),
        })),
      });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/periods:', error);
    return NextResponse.json({ error: error.message || 'Error al listar períodos' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const validated = periodSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const query = `
        INSERT INTO ${tenant.db_schema_name}.pay_periods (
          period_code, start_date, end_date, payment_frequency, status, notes
        ) VALUES (
          $1, $2, $3, $4, 'DRAFT', $5
        )
        RETURNING *;
      `;

      const values = [
        validated.period_code,
        validated.start_date,
        validated.end_date,
        validated.payment_frequency,
        validated.notes || null,
      ];

      const res = await client.query(query, values);
      return NextResponse.json({ success: true, period: res.rows[0] }, { status: 201 });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in POST /payroll/periods:', error);
    return NextResponse.json({ error: error.message || 'Error al crear período' }, { status: 500 });
  }
}
