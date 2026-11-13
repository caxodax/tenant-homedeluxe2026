import { pool, withTenantDb } from '@/lib/db';
import { getCachedTenantShell } from '@/lib/tenant';
import { notFound } from 'next/navigation';
import { fetchTenantPaymentMethods } from '@/lib/payment-methods';
import { DisabledStorefrontNotice } from '@/components/storefront/disabled-storefront-notice';
import { CheckoutForm } from './checkout-form';

async function getCheckoutData(slug: string) {
  const shell = await getCachedTenantShell(slug);
  if (!shell) return null;

  const { tenant, settings } = shell;
  const pluginsRes = await pool.query(
    `SELECT plugin_id, config FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
    [tenant.id]
  );
  const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);
  const vePlugin = pluginsRes.rows.find((r: { plugin_id: string }) => r.plugin_id === 'local_venezuela');
  const igtfEnabled = Boolean(vePlugin?.config?.igtf_enabled ?? true);

  const paymentMethods = await withTenantDb(tenant.db_schema_name, null, async (client) =>
    fetchTenantPaymentMethods(client, {
      activePlugins,
      onlyActive: true,
      channel: 'storefront',
    })
  );

  return {
    storefrontEnabled: tenant.storefront_enabled !== false,
    storeName: settings.business_name || tenant.name,
    address: settings.address || 'Sede Principal del Comercio',
    paymentMethods,
    exchangeRate: settings.exchange_rate,
    primaryCurrency: settings.primary_currency || 'USD',
    isLocalVenezuela: activePlugins.includes('local_venezuela'),
    igtfEnabled,
    taxEnabled: settings.tax_enabled ?? true,
    taxRate: typeof settings.tax_rate === 'number' ? settings.tax_rate : 16.0,
    pricesIncludeTax: settings.prices_include_tax ?? false,
  };
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCheckoutData(slug);
  if (!data) notFound();

  if (!data.storefrontEnabled) {
    return <DisabledStorefrontNotice slug={slug} businessName={data.storeName} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
      <CheckoutForm
        slug={slug}
        storeName={data.storeName}
        pickupAddress={data.address}
        paymentMethods={data.paymentMethods}
        exchangeRate={data.exchangeRate}
        primaryCurrency={data.primaryCurrency}
        isLocalVenezuela={data.isLocalVenezuela}
        igtfEnabled={data.igtfEnabled}
        taxEnabled={data.taxEnabled}
        taxRate={data.taxRate}
        pricesIncludeTax={data.pricesIncludeTax}
      />
    </div>
  );
}
