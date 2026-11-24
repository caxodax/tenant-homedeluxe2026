import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { CxpManager } from './cxp-manager';

export const dynamic = 'force-dynamic';

export default async function CxpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'pos');

  const {
    isPluginActive,
    suppliers,
    paymentAccounts,
    stores,
    products,
    primaryCurrency,
    secondaryCurrency,
    exchangeRate,
  } = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    // 1. Verificar si payables_cxp o supplier_cxp está activo
    const pRes = await client.query(`
      SELECT is_active, config FROM platform.tenant_plugins 
      WHERE tenant_id = $1 AND plugin_id IN ('payables_cxp', 'supplier_cxp') AND is_active = true
      LIMIT 1;
    `, [tenant.id]);

    // 2. Talleres / Proveedores activos
    const suppRes = await client.query(`
      SELECT id, name, category, default_currency, payment_terms_days, phone, whatsapp
      FROM ${tenant.db_schema_name}.cxp_suppliers
      WHERE is_active = true
      ORDER BY name ASC;
    `);

    // 3. Cuentas de egreso / Tesorería activas
    const accRes = await client.query(`
      SELECT id, name, type, details, is_default
      FROM ${tenant.db_schema_name}.cxp_payment_accounts
      WHERE is_active = true
      ORDER BY is_default DESC, sort_order ASC, name ASC;
    `);

    // 4. Sucursales activas
    const storesRes = await client.query(`
      SELECT id, name
      FROM ${tenant.db_schema_name}.stores
      WHERE is_active = true
      ORDER BY name ASC;
    `);

    // 5. Productos / Muebles para recepción física de mercancía al kardex
    const prodRes = await client.query(`
      SELECT id, name, sku, price_primary, cost_price, current_stock
      FROM ${tenant.db_schema_name}.products
      WHERE is_active = true
      ORDER BY name ASC;
    `);

    // 6. Monedas y Tasa Oficial BCV
    const sRes = await client.query(`
      SELECT primary_currency, secondary_currency, exchange_rate 
      FROM ${tenant.db_schema_name}.settings 
      WHERE key = 'general' LIMIT 1;
    `);
    const s = sRes.rows[0];

    let bcvRate = Number(s?.exchange_rate || 1.0);
    try {
      const rateRes = await client.query(`
        SELECT rate FROM ${tenant.db_schema_name}.exchange_rates 
        WHERE target_currency = 'VES' AND is_active = true 
        ORDER BY updated_at DESC LIMIT 1;
      `);
      if (rateRes.rows.length > 0 && Number(rateRes.rows[0].rate) > 0) {
        bcvRate = Number(rateRes.rows[0].rate);
      }
    } catch {
      // Fallback
    }

    return {
      isPluginActive: pRes.rows.length > 0,
      suppliers: suppRes.rows,
      paymentAccounts: accRes.rows,
      stores: storesRes.rows,
      products: prodRes.rows,
      primaryCurrency: s?.primary_currency || 'USD',
      secondaryCurrency: s?.secondary_currency || 'VES',
      exchangeRate: bcvRate,
    };
  });

  return (
    <CxpManager
      slug={slug}
      isPluginActive={isPluginActive}
      staffRole={staff.role}
      suppliers={suppliers}
      paymentAccounts={paymentAccounts}
      stores={stores}
      products={products}
      primaryCurrency={primaryCurrency}
      secondaryCurrency={secondaryCurrency}
      exchangeRate={exchangeRate}
    />
  );
}
