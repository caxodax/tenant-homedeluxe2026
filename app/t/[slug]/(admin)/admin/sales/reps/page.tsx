import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { SalesRepsManager } from './reps-manager';

export const dynamic = 'force-dynamic';

export default async function SalesRepsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'staff');

  const { reps, isPluginActive } = await withTenantDb(
    tenant.db_schema_name,
    null,
    async (client) => {
      // Verificar si sales_team o sales_commission está activo
      const pRes = await client.query(`
        SELECT 1 FROM platform.tenant_plugins 
        WHERE tenant_id = $1 AND plugin_id IN ('sales_team', 'sales_commission') AND is_active = true
      `, [tenant.id]);

      const repsRes = await client.query(`
        SELECT 
          sp.id,
          sp.email,
          sp.full_name,
          sp.phone,
          sp.role,
          sp.is_active AS staff_is_active,
          sp.created_at AS staff_created_at,
          srp.zone_or_route,
          srp.monthly_target_primary,
          srp.default_commission_percent,
          srp.commission_notes,
          COALESCE(srp.can_create_quotes, true) AS can_create_quotes,
          COALESCE(srp.can_convert_to_order, true) AS can_convert_to_order,
          COALESCE(srp.can_edit_own_quotes, true) AS can_edit_own_quotes,
          COALESCE(srp.can_edit_others_quotes, false) AS can_edit_others_quotes,
          COALESCE(srp.can_view_all_reports, false) AS can_view_all_reports,
          COALESCE(srp.can_adjust_prices, false) AS can_adjust_prices,
          COALESCE(srp.max_discount_pct, 0.00) AS max_discount_pct,
          COALESCE(srp.is_active, true) AS rep_is_active
        FROM ${tenant.db_schema_name}.staff_profiles sp
        LEFT JOIN ${tenant.db_schema_name}.sales_rep_profiles srp ON srp.staff_id = sp.id
        WHERE sp.role = 'SALES_REP'
        ORDER BY sp.full_name ASC
      `);

      return {
        isPluginActive: pRes.rows.length > 0,
        reps: repsRes.rows,
      };
    }
  );

  return (
    <div className="space-y-6">
      <SalesRepsManager
        slug={slug}
        initialReps={reps}
        isPluginActive={isPluginActive}
        currentUserRole={staff.role}
      />
    </div>
  );
}
