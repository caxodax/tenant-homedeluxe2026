import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // 1. Obtener cabecera de la corrida
      const runQuery = `
        SELECT 
          r.*,
          p.period_code,
          p.start_date,
          p.end_date,
          p.payment_frequency,
          sp_app.full_name as approved_by_name,
          sp_dis.full_name as disbursed_by_name
        FROM ${tenant.db_schema_name}.pay_runs r
        JOIN ${tenant.db_schema_name}.pay_periods p ON p.id = r.period_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_app ON sp_app.id = r.approved_by
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_dis ON sp_dis.id = r.disbursed_by
        WHERE r.id = $1;
      `;
      const runRes = await client.query(runQuery, [id]);
      if (runRes.rowCount === 0) {
        return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
      }
      const run = runRes.rows[0];

      // 2. Obtener líneas de liquidación
      const linesQuery = `
        SELECT 
          rl.*,
          e.first_name,
          e.last_name,
          e.id_document,
          e.job_title,
          e.department,
          e.phone,
          e.bank_name,
          e.bank_account_number,
          e.mobile_payment_phone,
          e.mobile_payment_id_doc
        FROM ${tenant.db_schema_name}.pay_run_lines rl
        JOIN ${tenant.db_schema_name}.pay_employees e ON e.id = rl.employee_id
        WHERE rl.run_id = $1
        ORDER BY e.department ASC, e.last_name ASC, e.first_name ASC;
      `;
      const linesRes = await client.query(linesQuery, [id]);

      return NextResponse.json({
        success: true,
        run: {
          ...run,
          total_base_primary: parseFloat(run.total_base_primary || '0'),
          total_commissions_primary: parseFloat(run.total_commissions_primary || '0'),
          total_allowances_primary: parseFloat(run.total_allowances_primary || '0'),
          total_deductions_primary: parseFloat(run.total_deductions_primary || '0'),
          total_net_primary: parseFloat(run.total_net_primary || '0'),
          total_net_secondary: parseFloat(run.total_net_secondary || '0'),
          exchange_rate_snapshot: parseFloat(run.exchange_rate_snapshot || '1'),
          lines: linesRes.rows.map((line) => ({
            ...line,
            days_worked: parseInt(line.days_worked || '15', 10),
            base_salary_primary: parseFloat(line.base_salary_primary || '0'),
            commissions_primary: parseFloat(line.commissions_primary || '0'),
            allowances_primary: parseFloat(line.allowances_primary || '0'),
            deductions_primary: parseFloat(line.deductions_primary || '0'),
            net_salary_primary: parseFloat(line.net_salary_primary || '0'),
            net_salary_secondary: parseFloat(line.net_salary_secondary || '0'),
            exchange_rate_snapshot: parseFloat(line.exchange_rate_snapshot || '1'),
          })),
        },
      });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/runs/[id]:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener corrida' }, { status: 500 });
  }
}

const updateLineSchema = z.object({
  line_id: z.string().uuid(),
  days_worked: z.number().int().min(0).max(31).optional(),
  base_salary_primary: z.number().min(0).optional(),
  allowances_primary: z.number().min(0).optional(),
  deductions_primary: z.number().min(0).optional(),
  commissions_primary: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const validated = updateLineSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // Validar corrida en DRAFT o CALCULATED
      const check = await client.query(
        `SELECT status FROM ${tenant.db_schema_name}.pay_runs WHERE id = $1`,
        [id]
      );
      if (check.rowCount === 0) {
        return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
      }
      if (check.rows[0].status === 'APPROVED' || check.rows[0].status === 'DISBURSED') {
        return NextResponse.json({ error: 'No se puede editar una corrida aprobada o liquidada' }, { status: 400 });
      }

      // Obtener línea actual
      const current = await client.query(
        `SELECT * FROM ${tenant.db_schema_name}.pay_run_lines WHERE id = $1 AND run_id = $2`,
        [validated.line_id, id]
      );
      if (current.rowCount === 0) {
        return NextResponse.json({ error: 'Línea de corrida no encontrada' }, { status: 404 });
      }
      const cur = current.rows[0];

      const newDays = validated.days_worked ?? cur.days_worked;
      const newBase = validated.base_salary_primary ?? parseFloat(cur.base_salary_primary);
      const newComm = validated.commissions_primary ?? parseFloat(cur.commissions_primary);
      const newAllow = validated.allowances_primary ?? parseFloat(cur.allowances_primary);
      const newDed = validated.deductions_primary ?? parseFloat(cur.deductions_primary);
      const newNet = Math.max(0, (newBase + newComm + newAllow) - newDed);

      await client.query(
        `UPDATE ${tenant.db_schema_name}.pay_run_lines
         SET days_worked = $1,
             base_salary_primary = $2,
             commissions_primary = $3,
             allowances_primary = $4,
             deductions_primary = $5,
             net_salary_primary = $6,
             net_salary_secondary = $6
         WHERE id = $7`,
        [newDays, newBase, newComm, newAllow, newDed, newNet, validated.line_id]
      );

      // Recalcular cabecera
      await client.query(`
        UPDATE ${tenant.db_schema_name}.pay_runs
        SET total_base_primary = (SELECT COALESCE(SUM(base_salary_primary), 0) FROM ${tenant.db_schema_name}.pay_run_lines WHERE run_id = $1),
            total_commissions_primary = (SELECT COALESCE(SUM(commissions_primary), 0) FROM ${tenant.db_schema_name}.pay_run_lines WHERE run_id = $1),
            total_allowances_primary = (SELECT COALESCE(SUM(allowances_primary), 0) FROM ${tenant.db_schema_name}.pay_run_lines WHERE run_id = $1),
            total_deductions_primary = (SELECT COALESCE(SUM(deductions_primary), 0) FROM ${tenant.db_schema_name}.pay_run_lines WHERE run_id = $1),
            total_net_primary = (SELECT COALESCE(SUM(net_salary_primary), 0) FROM ${tenant.db_schema_name}.pay_run_lines WHERE run_id = $1),
            total_net_secondary = (SELECT COALESCE(SUM(net_salary_primary), 0) FROM ${tenant.db_schema_name}.pay_run_lines WHERE run_id = $1),
            updated_at = now()
        WHERE id = $1;
      `, [id]);

      return NextResponse.json({ success: true });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in PATCH /payroll/runs/[id]:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar línea' }, { status: 500 });
  }
}
