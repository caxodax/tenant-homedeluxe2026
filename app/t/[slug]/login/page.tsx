import { notFound } from 'next/navigation';
import { pool, withTenantDb } from '@/lib/db';
import { LoginCard } from '@/components/auth/login-card';

export default async function TenantLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const normalizedSlug = slug.toLowerCase().trim();

  const tRes = await pool.query(
    `SELECT name, slug, db_schema_name, status FROM platform.tenants WHERE slug = $1 LIMIT 1`,
    [normalizedSlug]
  );

  if ((tRes.rowCount || 0) === 0) {
    notFound();
  }

  const tenant = tRes.rows[0];
  const settings = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const r = await client.query(
      `SELECT business_name, logo_url, primary_color FROM settings WHERE key = 'general' LIMIT 1`
    );
    return r.rows[0] ?? null;
  });

  return (
    <LoginCard
      slug={tenant.slug}
      businessName={settings?.business_name || tenant.name}
      logoUrl={settings?.logo_url || null}
      primaryColor={settings?.primary_color || '#18181b'}
    />
  );
}
