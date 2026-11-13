import { pool, withTenantDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { TenantThemeInjector } from '@/components/tenant-theme-injector';
import { PosBrandProvider } from './components/pos-brand-provider';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTenantPosLayoutData(slug);
  const name = data?.settings?.business_name || data?.tenant?.name || 'MarketOS';
  const logoUrl = data?.settings?.logo_url || null;
  return {
    title: `${name} · POS Mostrador`,
    description: `Terminal de Punto de Venta Offline-First para ${name}`,
    manifest: `/t/${slug}/manifest.webmanifest?entry=pos`,
    icons: {
      icon: logoUrl || '/icons/icon-192.png',
      apple: logoUrl || '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      title: `${name} POS`,
      statusBarStyle: 'black-translucent',
    },
  };
}

async function getTenantPosLayoutData(slug: string) {
  const tRes = await pool.query(
    `SELECT id, name, slug, db_schema_name, status
     FROM platform.tenants 
     WHERE slug = $1 AND status IN ('active', 'trial')`,
    [slug]
  );

  if (tRes.rowCount === 0) return null;
  const tenant = tRes.rows[0];

  const dataRes = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const [sRes, storeRes] = await Promise.all([
      client.query(`
        SELECT business_name, logo_url, primary_color, secondary_color, accent_color
        FROM settings 
        WHERE key = 'general'
        LIMIT 1
      `),
      client.query(`
        SELECT id FROM stores WHERE is_active = true ORDER BY created_at ASC LIMIT 1
      `),
    ]);
    return {
      settings: sRes.rows[0] ?? null,
      storeId: storeRes.rows[0]?.id || null,
    };
  });

  return {
    tenant,
    storeId: dataRes.storeId,
    settings: dataRes.settings || {
      business_name: tenant.name,
      logo_url: null,
      primary_color: TENANT_DEFAULTS.PRIMARY_COLOR,
      secondary_color: null,
      accent_color: null,
    },
  };
}

export default async function PosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { staff } = await requireTenantStaff(slug, 'pos');
  const data = await getTenantPosLayoutData(slug);

  if (!data) notFound();

  const brandInfo = {
    business_name: data.settings?.business_name || data.tenant.name || 'Comercio',
    store_id: data.storeId,
    logo_url: data.settings?.logo_url || null,
    primary_color: data.settings?.primary_color || null,
    secondary_color: data.settings?.secondary_color || null,
    accent_color: data.settings?.accent_color || null,
    staff: {
      full_name: staff.full_name,
      role: staff.role,
      email: staff.email,
    },
  };

  return (
    <PosBrandProvider initialBrand={brandInfo}>
      <TenantThemeInjector
        primaryColor={brandInfo.primary_color}
        secondaryColor={brandInfo.secondary_color}
        accentColor={brandInfo.accent_color}
      />
      {children}
    </PosBrandProvider>
  );
}
