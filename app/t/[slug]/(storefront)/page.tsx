import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCachedStorefrontCatalog, getCachedTenantShell } from '@/lib/tenant';
import { withTenantDb } from '@/lib/db';
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
    const cookieStore = await cookies();
    if (cookieStore.has('marketos_staff_session')) {
      redirect(`/t/${slug}/admin`);
    }
    redirect(`/t/${slug}/login`);
  }

  const [catalog, stores] = await Promise.all([
    getCachedStorefrontCatalog(
      slug,
      shell.tenant.db_schema_name,
      shell.bufferUnits
    ),
    withTenantDb(shell.tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `SELECT id, name, address, is_default FROM stores WHERE is_active = true ORDER BY is_default DESC, created_at ASC`
      );
      return res.rows as Array<{ id: string; name: string; address: string; is_default: boolean }>;
    }),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
      <StorefrontCatalog
        products={catalog.products}
        categories={catalog.categories}
        stores={stores}
        businessName={shell.settings.business_name || shell.tenant.name}
        logoUrl={shell.settings.logo_url}
        bannerUrl={shell.settings.banner_url}
        bannerStyle={shell.settings.features?.banner_style || 'clean'}
        exchangeRate={shell.settings.exchange_rate}
        primaryCurrency={shell.settings.primary_currency || 'USD'}
        slug={slug}
      />
    </div>
  );
}
