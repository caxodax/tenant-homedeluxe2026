import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { pool, withTenantDb } from '@/lib/db';
import type { Metadata } from 'next';
import { Monitor, ExternalLink, Store } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { SidebarNav } from './components/sidebar-nav';
import { AdminMobileNav } from './components/admin-mobile-nav';
import { TenantThemeInjector } from '@/components/tenant-theme-injector';
import { LogoutButton } from '@/components/auth/logout-button';
import { hasPermission } from '@/lib/auth/rbac';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';
import { NewOrderNotification } from '@/components/admin/new-order-notification';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tRes = await pool.query(
    `SELECT name, db_schema_name FROM platform.tenants WHERE slug = $1 AND status IN ('active', 'trial') LIMIT 1`,
    [slug]
  );
  let titleName = tRes.rows[0]?.name || 'MarketOS';
  let logoUrl: string | null = null;
  if (tRes.rows[0]?.db_schema_name) {
    try {
      const biz = await withTenantDb(tRes.rows[0].db_schema_name, null, async (c) => {
        const r = await c.query(`SELECT business_name, logo_url FROM settings WHERE key = 'general' LIMIT 1`);
        return r.rows[0] || null;
      });
      if (biz?.business_name) titleName = biz.business_name;
      if (biz?.logo_url) logoUrl = biz.logo_url;
    } catch {
      // fallback
    }
  }
  return {
    title: `${titleName} · Panel Admin`,
    description: `Panel administrativo multi-tenant para ${titleName}`,
    manifest: `/t/${slug}/manifest.webmanifest`,
    icons: {
      icon: logoUrl || '/icons/icon-192.png',
      apple: logoUrl || '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      title: `${titleName} Admin`,
      statusBarStyle: 'black-translucent',
    },
  };
}

export default async function TenantAdminLayout({ 
  children, 
  params 
}: { 
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug);
  
  const settings = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const sRes = await client.query(`
      SELECT business_name, logo_url, primary_color, secondary_color, accent_color 
      FROM settings 
      WHERE key = 'general' 
      LIMIT 1
    `);
    return sRes.rows[0] ?? null;
  });

  const storeName = settings?.business_name || tenant.name;
  const logoUrl = settings?.logo_url || null;
  const primaryColor = settings?.primary_color || TENANT_DEFAULTS.PRIMARY_COLOR;
  
  return (
    <>
      <TenantThemeInjector
        primaryColor={primaryColor}
        secondaryColor={settings?.secondary_color}
        accentColor={settings?.accent_color}
      />
      <div className="flex min-h-screen bg-[#FAF8F5] dark:bg-[#0D0D0E] text-stone-900 dark:text-zinc-100 font-sans transition-colors duration-200 overflow-x-clip">
      {/* Sidebar Izquierdo Fijo con Metodología Visual Limpia */}
      <aside className="hidden md:flex w-64 border-r border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] flex-col fixed h-screen z-20 transition-colors duration-200">
        <div
          className="p-4 border-b border-stone-200/80 dark:border-zinc-800/80"
          style={{ borderTop: `3px solid ${primaryColor}` }}
        >
          <Link href={`/t/${slug}/admin`} className="flex items-center gap-3 group">
            {logoUrl ? (
              <div className="h-12 max-w-[140px] flex items-center shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={storeName}
                  className="max-h-12 max-w-full object-contain drop-shadow-xs group-hover:opacity-80 transition-opacity"
                />
              </div>
            ) : (
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-950/60 transition-colors">
                <Store className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-extrabold text-sm leading-tight text-stone-950 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                {storeName}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700">
                  {staff.role}
                </span>
                <span className="text-[11px] text-stone-500 dark:text-zinc-400 font-medium truncate max-w-[100px]">
                  {staff.full_name}
                </span>
              </div>
            </div>
          </Link>
        </div>
        
        {/* Navegación Reactiva con Secciones estructuradas (Opción A) */}
        <SidebarNav slug={slug} role={staff.role} />
        
        {/* Footer del Sidebar */}
        <div className="p-3 border-t border-stone-200/80 dark:border-zinc-800/80 space-y-1 bg-stone-50/50 dark:bg-zinc-900/30">
          {hasPermission(staff.role, 'pos') && (
            <Link 
              href={`/t/${slug}/pos`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-zinc-800/60 transition-all font-bold"
            >
              <Monitor className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Abrir Caja</span>
            </Link>
          )}
          {tenant.storefront_enabled && (
            <Link 
              href={`/t/${slug}`} 
              target="_blank"
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-stone-700 dark:text-zinc-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-zinc-800/40 transition-all font-semibold"
            >
              <ExternalLink className="w-3.5 h-3.5 text-stone-500 dark:text-zinc-400" />
              <span>Ver vitrina digital ↗</span>
            </Link>
          )}
          <LogoutButton slug={slug} className="w-full text-xs" />
        </div>
      </aside>
      
      {/* Contenido Principal */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen min-w-0">
        {/* Header superior */}
        <header
          className="h-16 border-b border-stone-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-[#141416]/90 backdrop-blur-md px-4 md:px-8 flex items-center justify-between gap-4 sticky top-0 z-10 transition-colors duration-200"
          style={{ borderTop: `3px solid ${primaryColor}` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {logoUrl && (
              <Link href={`/t/${slug}/admin`} className="h-7 max-w-[100px] flex items-center shrink-0 md:hidden hover:opacity-80 transition-opacity">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={storeName} className="max-h-7 max-w-full object-contain" />
              </Link>
            )}
            <span className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wider bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 font-mono font-bold truncate">
              {storeName}
            </span>
            <span className="text-stone-300 dark:text-zinc-700 hidden sm:inline">/</span>
            <span className="text-xs text-stone-600 dark:text-zinc-400 font-semibold hidden sm:inline truncate">
              Panel Administrativo
            </span>
          </div>

          {/* Notificaciones Realtime + Controles Desktop y Móvil */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {hasPermission(staff.role, 'orders') && (
              <NewOrderNotification slug={slug} />
            )}

            <div className="hidden md:flex items-center gap-3">
              <ThemeToggle />
            </div>

            <AdminMobileNav 
              slug={slug} 
              storeName={storeName} 
              role={staff.role} 
              logoUrl={logoUrl}
              storefrontEnabled={tenant.storefront_enabled}
            />
          </div>
        </header>

        {/* Área de trabajo */}
        <main className="flex-1 p-4 sm:p-5 md:p-8 max-w-7xl w-full mx-auto min-w-0 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
    </>
  );
}
