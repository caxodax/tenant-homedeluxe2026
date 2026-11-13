import { notFound, redirect } from 'next/navigation';
import { getCachedStorefrontCatalog, getCachedTenantShell } from '@/lib/tenant';
import { StorefrontCatalog } from './components/storefront-catalog';

export const revalidate = 60;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shell = await getCachedTenantShell(slug);

  if (!shell) notFound();

  if (shell.tenant.storefront_enabled === false) {
    redirect(`/t/${slug}/login`);
  }

  const catalog = await getCachedStorefrontCatalog(
    slug,
    shell.tenant.db_schema_name,
    shell.bufferUnits
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
      <StorefrontCatalog
        products={catalog.products}
        categories={catalog.categories}
        businessName={shell.settings.business_name || shell.tenant.name}
        logoUrl={shell.settings.logo_url}
        bannerUrl={shell.settings.banner_url}
        exchangeRate={shell.settings.exchange_rate}
        primaryCurrency={shell.settings.primary_currency || 'USD'}
      />
    </div>
  );
}
