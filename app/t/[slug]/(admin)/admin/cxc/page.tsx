import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { CxcManager } from './cxc-manager';

export const dynamic = 'force-dynamic';

export default async function CxcPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'pos');

  const { isPluginActive, sellers, primaryCurrency, secondaryCurrency, exchangeRate, pluginConfig } =
    await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // 1. Verificar si credit_cxc está activo y obtener config
      const pRes = await client.query(`
        SELECT is_active, config FROM platform.tenant_plugins 
        WHERE tenant_id = $1 AND plugin_id = 'credit_cxc' AND is_active = true
      `, [tenant.id]);

      // 2. Lazy check de cuentas vencidas (Estándar Multimoneda: balance_primary)
      await client.query(`
        UPDATE ${tenant.db_schema_name}.cxc_accounts
        SET status = 'OVERDUE', updated_at = now()
        WHERE status = 'CURRENT'
          AND due_date < CURRENT_DATE
          AND balance_primary > 0.00
      `);

      // 3. Vendedores / Personal comercial
      const sellersRes = await client.query(`
        SELECT id, full_name, email, role 
        FROM ${tenant.db_schema_name}.staff_profiles
        WHERE is_active = true
        ORDER BY full_name ASC
      `);

      // 4. Configuración de monedas
      const sRes = await client.query(`
        SELECT primary_currency, secondary_currency, exchange_rate 
        FROM ${tenant.db_schema_name}.settings 
        WHERE key = 'general' LIMIT 1
      `);
      const s = sRes.rows[0];

      // 5. Tasa BCV si está activa la tabla de tasas
      let bcvRate = Number(s?.exchange_rate || 1.0);
      try {
        const rateRes = await client.query(`
          SELECT rate FROM ${tenant.db_schema_name}.exchange_rates 
          WHERE target_currency = 'VES' AND is_active = true 
          ORDER BY updated_at DESC LIMIT 1
        `);
        if (rateRes.rows.length > 0 && Number(rateRes.rows[0].rate) > 0) {
          bcvRate = Number(rateRes.rows[0].rate);
        }
      } catch {
        // Tabla de tasas no presente o fallback
      }

      return {
        isPluginActive: pRes.rows.length > 0,
        pluginConfig: pRes.rows[0]?.config || {
          layaway_validity_days: 30,
          default_penalty_percent: 15,
          standard_term_days: 15,
        },
        sellers: sellersRes.rows,
        primaryCurrency: s?.primary_currency || 'USD',
        secondaryCurrency: s?.secondary_currency || 'VES',
        exchangeRate: bcvRate,
      };
    });

  return (
    <CxcManager
      slug={slug}
      isPluginActive={isPluginActive}
      staffRole={staff.role}
      sellers={sellers}
      primaryCurrency={primaryCurrency}
      secondaryCurrency={secondaryCurrency}
      exchangeRate={exchangeRate}
      pluginConfig={pluginConfig}
    />
  );
}
