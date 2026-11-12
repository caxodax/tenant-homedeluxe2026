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
  if (tRes.rows[0]?.db_schema_name) {
    try {
      const biz = await withTenantDb(tRes.rows[0].db_schema_name, null, async (c) => {
        const r = await c.query(`SELECT business_name FROM settings WHERE key = 'general' LIMIT 1`);
        return r.rows[0]?.business_name || null;
      });
      if (biz) titleName = biz;
    } catch {
      // fallback to tenant.name
    }
  }
  return {
    title: `${titleName} · Panel Admin`,
    description: `Panel administrativo multi-tenant para ${titleName}`,
    manifest: `/t/${slug}/manifest.webmanifest`,
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/apple-touch-icon.png',
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
      <div className="flex min-h-screen bg-slate-50 dark:bg-[#0a0a0b] text-slate-900 dark:text-zinc-100 font-sans transition-colors duration-200 overflow-x-clip">
      {/* Sidebar Izquierdo Fijo con Tarjeta de Marca */}
      <aside className="hidden md:flex w-68 border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-[#0f0f11] flex-col fixed h-screen z-20 transition-colors duration-200">
        <div
          className="p-5 tenant-secondary-surface border-b-[3px]"
          style={{ borderBottomColor: primaryColor }}
        >
          <div className="flex items-center gap-3.5">
            {logoUrl ? (
              <div className="w-14 h-14 rounded-2xl bg-white border border-white/20 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-1.5" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-lime-500/20 border border-lime-500/40 flex items-center justify-center shrink-0">
                <Store className="w-7 h-7 text-lime-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-extrabold text-base leading-tight truncate">{storeName}</h1>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-mono font-bold tracking-wide bg-lime-500 shadow-xs">
                  {staff.role}
                </span>
                <span className="text-[11px] opacity-80 truncate max-w-[110px]">
                  {staff.full_name}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Navegación Reactiva con Active State y RBAC */}
        <SidebarNav slug={slug} role={staff.role} />
        
        {/* Footer del Sidebar */}
        <div className="p-4 border-t border-slate-200 dark:border-zinc-800/80 space-y-1.5">
          {hasPermission(staff.role, 'pos') && (
            <Link 
              href={`/t/${slug}/pos`}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-800 dark:text-zinc-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition-all font-bold"
            >
              <Monitor className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Abrir POS Mostrador</span>
            </Link>
          )}
          {tenant.storefront_enabled && (
            <Link 
              href={`/t/${slug}`} 
              target="_blank"
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm text-slate-700 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/50 transition-all font-semibold"
            >
              <ExternalLink className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              <span>Ver vitrina digital ↗</span>
            </Link>
          )}
          <LogoutButton slug={slug} />
        </div>
      </aside>
      
      {/* Contenido Principal (min-w-0 evita desbordamiento horizontal de tablas) */}
      <div className="flex-1 md:ml-68 flex flex-col min-h-screen min-w-0">
        {/* Header superior */}
        <header
          className="h-16 border-b border-slate-200 dark:border-zinc-800/80 bg-white/95 dark:bg-[#0f0f11]/95 backdrop-blur px-4 md:px-8 flex items-center justify-between gap-4 sticky top-0 z-10 transition-colors duration-200"
          style={{ borderTop: `3px solid ${primaryColor}` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {logoUrl && (
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 md:hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-0.5" />
              </div>
            )}
            <span className="px-2.5 py-0.5 rounded-md text-xs uppercase tracking-wider tenant-secondary-badge border font-mono font-bold truncate">
              {storeName}
            </span>
            <span className="text-slate-400 dark:text-zinc-600 hidden sm:inline">/</span>
            <span className="text-sm text-slate-800 dark:text-zinc-200 font-semibold hidden sm:inline truncate">
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
