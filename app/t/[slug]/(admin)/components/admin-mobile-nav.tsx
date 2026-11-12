'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Store,
  Monitor,
  ExternalLink,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LogoutButton } from '@/components/auth/logout-button';
import { cn } from '@/lib/utils';
import { hasPermission, type TenantPermission } from '@/lib/auth/rbac';
import { usePendingOrdersBadge } from '@/components/admin/new-order-notification';

interface AdminMobileNavProps {
  slug: string;
  storeName: string;
  role: string;
  logoUrl?: string | null;
  storefrontEnabled?: boolean;
}

const NAV_ITEMS: Array<{
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission: TenantPermission;
}> = [
  { label: 'Dashboard', href: '', icon: LayoutDashboard, permission: 'dashboard' },
  { label: 'Pedidos', href: '/orders', icon: ShoppingCart, permission: 'orders' },
  { label: 'Inventario', href: '/inventory', icon: Package, permission: 'inventory' },
  { label: 'Punto de Venta (POS)', href: '/pos', icon: Monitor, permission: 'pos' },
  { label: 'Clientes', href: '/customers', icon: Users, permission: 'customers' },
  { label: 'Reportes', href: '/reports', icon: BarChart3, permission: 'reports' },
  { label: 'Equipo & Roles', href: '/staff', icon: ShieldCheck, permission: 'staff' },
  { label: 'Configuración & Branding', href: '/settings', icon: Settings, permission: 'settings' },
];

export function AdminMobileNav({
  slug,
  storeName,
  role,
  logoUrl,
  storefrontEnabled = true,
}: AdminMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pendingOrders = usePendingOrdersBadge(slug);
  const pathname = usePathname() || '';
  const cleanPath =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const basePath = `/t/${slug}/admin`;

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(role, item.permission));

  return (
    <div className="md:hidden flex items-center gap-2">
      <ThemeToggle />
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
        aria-label="Abrir Menú de Administración"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div className="fixed inset-0 top-16 z-50 bg-black/70 backdrop-blur-xs flex flex-col animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f0f11] border-b border-slate-200 dark:border-zinc-800 p-5 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            {/* Cabecera del Comercio */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80 dark:border-zinc-800/80">
              {logoUrl ? (
                <div className="w-10 h-10 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-1" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-lime-500/10 border border-lime-500/30 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5 text-lime-600 dark:text-lime-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                  {storeName}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono uppercase font-black px-1.5 py-0.2 rounded bg-lime-500/10 text-lime-700 dark:text-lime-400 border border-lime-500/20">
                    {role}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                    /t/{slug}
                  </span>
                </div>
              </div>
            </div>

            {/* Menú de Navegación */}
            <nav className="space-y-1">
              {visibleItems.map((item) => {
                const itemPath = `${basePath}${item.href}`;
                const isActive =
                  item.href === '' ? cleanPath === basePath : cleanPath.startsWith(itemPath);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.label}
                    href={itemPath}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all',
                      isActive
                        ? 'bg-lime-500/15 text-lime-950 dark:text-lime-400 font-extrabold border border-lime-500/30'
                        : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          'w-4 h-4',
                          isActive ? 'text-lime-600 dark:text-lime-400' : 'text-slate-400'
                        )}
                      />
                      <span>{item.label}</span>
                      {item.permission === 'orders' && pendingOrders > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none">
                          {pendingOrders > 99 ? '99+' : pendingOrders}
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-40" />
                  </Link>
                );
              })}
            </nav>

            {/* Acciones Rápidas */}
            <div className="pt-3 border-t border-slate-200/80 dark:border-zinc-800/80 space-y-2">
              {hasPermission(role, 'pos') && (
                <Link
                  href={`/t/${slug}/pos`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition"
                >
                  <Monitor className="w-4 h-4" />
                  <span>Abrir POS Mostrador</span>
                </Link>
              )}
              {storefrontEnabled && (
                <Link
                  href={`/t/${slug}`}
                  target="_blank"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 text-slate-800 dark:text-zinc-200 font-bold text-xs border border-slate-200 dark:border-zinc-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                  <span>Ver vitrina digital ↗</span>
                </Link>
              )}
              <LogoutButton
                slug={slug}
                onLoggedOut={() => setIsOpen(false)}
                className="justify-center border border-rose-500/20"
              />
            </div>
          </div>
          <div className="flex-1" onClick={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
