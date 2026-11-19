import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { QuotesManager } from './quotes-manager';

export const dynamic = 'force-dynamic';

export default async function SalesQuotesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'orders');

  const { isPluginActive, reps, primaryCurrency, secondaryCurrency, exchangeRate } =
    await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // Verificar si sales_team está activo
      const pRes = await client.query(`
        SELECT 1 FROM platform.tenant_plugins 
        WHERE tenant_id = $1 AND plugin_id IN ('sales_team', 'sales_commission') AND is_active = true
      `, [tenant.id]);

      // Lazy check de quotes expiradas
      await client.query(`
        UPDATE ${tenant.db_schema_name}.sales_quotes
        SET status = 'EXPIRED', updated_at = now()
        WHERE status IN ('DRAFT', 'SENT')
          AND expires_at IS NOT NULL
          AND expires_at < now()
      `);

      // Cargar lista de vendedores para filtros
      const repsRes = await client.query(`
        SELECT id, full_name, email, role FROM ${tenant.db_schema_name}.staff_profiles
        WHERE role = 'SALES_REP' OR role IN ('OWNER', 'MANAGER')
        ORDER BY full_name ASC
      `);

      // Configuración de monedas
      const sRes = await client.query(`
        SELECT primary_currency, secondary_currency, exchange_rate 
        FROM ${tenant.db_schema_name}.settings 
        WHERE key = 'general' LIMIT 1
      `);
      const s = sRes.rows[0];

      return {
        isPluginActive: pRes.rows.length > 0,
        reps: repsRes.rows,
        primaryCurrency: s?.primary_currency || 'USD',
        secondaryCurrency: s?.secondary_currency || 'BS',
        exchangeRate: parseFloat(s?.exchange_rate || '1.0000'),
      };
    });

  return (
    <div className="space-y-6">
      <QuotesManager
        slug={slug}
        currentUser={staff}
        isPluginActive={isPluginActive}
        salesReps={reps}
        primaryCurrency={primaryCurrency}
        secondaryCurrency={secondaryCurrency}
        exchangeRate={exchangeRate}
      />
    </div>
  );
}
