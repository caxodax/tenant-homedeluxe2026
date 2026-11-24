import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { PayrollManager } from './payroll-manager';

export const dynamic = 'force-dynamic';

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'staff');

  const {
    isPluginActive,
    employees,
    periods,
    runs,
    advances,
    concepts,
    paymentAccounts,
    staffProfiles,
    primaryCurrency,
    secondaryCurrency,
    exchangeRate,
  } = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    // 1. Verificar si payroll_hr o payroll_personal está activo
    const pRes = await client.query(`
      SELECT is_active, config FROM platform.tenant_plugins 
      WHERE tenant_id = $1 AND plugin_id IN ('payroll_hr', 'payroll_personal') AND is_active = true
      LIMIT 1;
    `, [tenant.id]);

    // 2. Colaboradores activos
    const empRes = await client.query(`
      SELECT 
        e.*,
        sp.email as staff_email,
        sp.role as staff_role,
        COALESCE(
          (SELECT SUM(pending_amount_primary) 
           FROM ${tenant.db_schema_name}.pay_advances a 
           WHERE a.employee_id = e.id AND a.status IN ('APPROVED', 'PARTIALLY_DEDUCTED')), 
          0.00
        ) as active_advances_balance
      FROM ${tenant.db_schema_name}.pay_employees e
      LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = e.staff_id
      ORDER BY e.is_active DESC, e.last_name ASC, e.first_name ASC;
    `);

    // 3. Períodos de nómina
    const perRes = await client.query(`
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
    `);

    // 4. Corridas de nómina
    const runsRes = await client.query(`
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
    `);

    // 5. Adelantos
    const advRes = await client.query(`
      SELECT 
        a.*,
        e.first_name,
        e.last_name,
        e.id_document,
        e.job_title,
        e.department,
        sp_req.full_name as requested_by_name,
        sp_app.full_name as approved_by_name
      FROM ${tenant.db_schema_name}.pay_advances a
      JOIN ${tenant.db_schema_name}.pay_employees e ON e.id = a.employee_id
      LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_req ON sp_req.id = a.requested_by
      LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_app ON sp_app.id = a.approved_by
      ORDER BY a.created_at DESC;
    `);

    // 6. Catálogo de conceptos
    const conRes = await client.query(`
      SELECT * FROM ${tenant.db_schema_name}.pay_concepts
      ORDER BY concept_type ASC, name ASC;
    `);

    // 7. Cuentas de tesorería (Fase 17) para liquidación
    let accRows: any[] = [];
    try {
      const accRes = await client.query(`
        SELECT id, name, type, details, is_default
        FROM ${tenant.db_schema_name}.cxp_payment_accounts
        WHERE is_active = true
        ORDER BY is_default DESC, sort_order ASC, name ASC;
      `);
      accRows = accRes.rows;
    } catch {
      accRows = [];
    }

    // 8. Staff profiles para vincular
    const spRes = await client.query(`
      SELECT id, full_name, email, role 
      FROM ${tenant.db_schema_name}.staff_profiles
      WHERE is_active = true
      ORDER BY full_name ASC;
    `);

    // 9. Tasa de cambio oficial vigente
    let rate = 1.0;
    try {
      const rateRes = await client.query(`
        SELECT rate_secondary FROM ${tenant.db_schema_name}.exchange_rates
        WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
      `);
      if (rateRes.rows.length > 0 && parseFloat(rateRes.rows[0].rate_secondary) > 0) {
        rate = parseFloat(rateRes.rows[0].rate_secondary);
      }
    } catch {
      rate = 1.0;
    }

    const safeDate = (d: any): string => {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString().split('T')[0];
      return String(d).split('T')[0];
    };

    const safeDateTime = (d: any): string => {
      if (!d) return '';
      if (d instanceof Date) return d.toISOString();
      return String(d);
    };

    const payload = {
      isPluginActive: pRes.rowCount ? pRes.rowCount > 0 : false,
      employees: empRes.rows.map((row) => ({
        ...row,
        hire_date: safeDate(row.hire_date),
        birth_date: safeDate(row.birth_date),
        created_at: safeDateTime(row.created_at),
        updated_at: safeDateTime(row.updated_at),
        base_salary_primary: parseFloat(row.base_salary_primary || '0'),
        base_salary_secondary: parseFloat(row.base_salary_secondary || '0'),
        active_advances_balance: parseFloat(row.active_advances_balance || '0'),
      })),
      periods: perRes.rows.map((row) => ({
        ...row,
        start_date: safeDate(row.start_date),
        end_date: safeDate(row.end_date),
        created_at: safeDateTime(row.created_at),
        updated_at: safeDateTime(row.updated_at),
        total_net_primary: parseFloat(row.total_net_primary || '0'),
        total_net_secondary: parseFloat(row.total_net_secondary || '0'),
        total_base_primary: parseFloat(row.total_base_primary || '0'),
        total_commissions_primary: parseFloat(row.total_commissions_primary || '0'),
        total_deductions_primary: parseFloat(row.total_deductions_primary || '0'),
        exchange_rate_snapshot: parseFloat(row.exchange_rate_snapshot || '1'),
        employees_in_run: parseInt(row.employees_in_run || '0', 10),
      })),
      runs: runsRes.rows.map((row) => ({
        ...row,
        start_date: safeDate(row.start_date),
        end_date: safeDate(row.end_date),
        calculated_at: safeDateTime(row.calculated_at),
        approved_at: row.approved_at ? safeDateTime(row.approved_at) : null,
        disbursed_at: row.disbursed_at ? safeDateTime(row.disbursed_at) : null,
        total_base_primary: parseFloat(row.total_base_primary || '0'),
        total_commissions_primary: parseFloat(row.total_commissions_primary || '0'),
        total_allowances_primary: parseFloat(row.total_allowances_primary || '0'),
        total_deductions_primary: parseFloat(row.total_deductions_primary || '0'),
        total_net_primary: parseFloat(row.total_net_primary || '0'),
        total_net_secondary: parseFloat(row.total_net_secondary || '0'),
        exchange_rate_snapshot: parseFloat(row.exchange_rate_snapshot || '1'),
        lines_count: parseInt(row.lines_count || '0', 10),
      })),
      advances: advRes.rows.map((row) => ({
        ...row,
        created_at: safeDateTime(row.created_at),
        approved_at: row.approved_at ? safeDateTime(row.approved_at) : null,
        requested_amount_primary: parseFloat(row.requested_amount_primary || '0'),
        approved_amount_primary: parseFloat(row.approved_amount_primary || '0'),
        pending_amount_primary: parseFloat(row.pending_amount_primary || '0'),
        exchange_rate_snapshot: parseFloat(row.exchange_rate_snapshot || '1'),
        installments_total: parseInt(row.installments_total || '1', 10),
        installments_remaining: parseInt(row.installments_remaining || '1', 10),
      })),
      concepts: conRes.rows.map((row) => ({
        ...row,
        created_at: safeDateTime(row.created_at),
        default_amount_primary: parseFloat(row.default_amount_primary || '0'),
        percentage_rate: parseFloat(row.percentage_rate || '0'),
      })),
      paymentAccounts: accRows.map((r: any) => ({
        ...r,
        created_at: safeDateTime(r.created_at),
        updated_at: safeDateTime(r.updated_at),
      })),
      staffProfiles: spRes.rows.map((r: any) => ({
        ...r,
        created_at: safeDateTime(r.created_at),
      })),
      primaryCurrency: 'USD',
      secondaryCurrency: 'Bs.',
      exchangeRate: rate,
    };

    return JSON.parse(JSON.stringify(payload));
  });

  return (
    <PayrollManager
      slug={slug}
      staffRole={staff.role}
      isPluginActive={isPluginActive}
      initialEmployees={employees}
      initialPeriods={periods}
      initialRuns={runs}
      initialAdvances={advances}
      initialConcepts={concepts}
      paymentAccounts={paymentAccounts}
      staffProfiles={staffProfiles}
      primaryCurrency={primaryCurrency}
      secondaryCurrency={secondaryCurrency}
      currentExchangeRate={exchangeRate}
    />
  );
}
