'use client';

import { useState, useEffect } from 'react';
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
import { IconBadge, type IconBadgeColor } from '@/components/ui/icon-badge';

interface AdminMobileNavProps {
  slug: string;
  storeName: string;
  role: string;
  logoUrl?: string | null;
  storefrontEnabled?: boolean;
}

interface NavSection {
  title: string;
  items: Array<{
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    permission: TenantPermission;
    badgeColor: IconBadgeColor;
  }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'OPERACIÓN',
    items: [
      { label: 'Dashboard', href: '', icon: LayoutDashboard, permission: 'dashboard', badgeColor: 'emerald' },
      { label: 'Pedidos', href: '/orders', icon: ShoppingCart, permission: 'orders', badgeColor: 'blue' },
      { label: 'Punto de Venta', href: '/pos', icon: Monitor, permission: 'pos', badgeColor: 'amber' },
    ],
  },
  {
    title: 'CATÁLOGO & CLIENTES',
    items: [
      { label: 'Inventario', href: '/inventory', icon: Package, permission: 'inventory', badgeColor: 'purple' },
      { label: 'Clientes', href: '/customers', icon: Users, permission: 'customers', badgeColor: 'stone' },
    ],
  },
  {
    title: 'ADMINISTRACIÓN',
    items: [
      { label: 'Reportes', href: '/reports', icon: BarChart3, permission: 'reports', badgeColor: 'emerald' },
      { label: 'Equipo & Roles', href: '/staff', icon: ShieldCheck, permission: 'staff', badgeColor: 'rose' },
      { label: 'Configuración', href: '/settings', icon: Settings, permission: 'settings', badgeColor: 'stone' },
    ],
  },
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

  // Prevenir scroll en el fondo cuando el menú móvil está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <div className="md:hidden flex items-center gap-2">
      <ThemeToggle />
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-xl bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white transition cursor-pointer border border-stone-200/80 dark:border-zinc-700/80"
        aria-label="Abrir Menú de Navegación"
      >
        <Menu className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop con cierre al tocar */}
          <div
            className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Lateral Deslizante */}
          <div className="relative ml-auto w-full max-w-xs sm:max-w-sm h-dvh bg-white dark:bg-[#141416] border-l border-stone-200 dark:border-zinc-800 flex flex-col shadow-2xl z-10">
            {/* Header del Drawer */}
            <div className="p-4 border-b border-stone-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {logoUrl ? (
                  <div className="h-9 max-w-[120px] flex items-center shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt={storeName} className="max-h-9 max-w-full object-contain" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="font-extrabold text-sm text-stone-950 dark:text-white truncate">
                    {storeName}
                  </h2>
                  <span className="text-[10px] font-mono uppercase font-bold text-stone-700 dark:text-zinc-300">
                    Rol: {role}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                aria-label="Cerrar menú"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Navegación por Secciones */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {NAV_SECTIONS.map((section) => {
                const visibleItems = section.items.filter((item) =>
                  hasPermission(role, item.permission)
                );
                if (visibleItems.length === 0) return null;

                return (
                  <div key={section.title} className="space-y-1">
                    <h3 className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
                      {section.title}
                    </h3>
                    <div className="space-y-0.5 pt-1">
                      {visibleItems.map((item) => {
                        const itemPath = `${basePath}${item.href}`;
                        const isActive =
                          item.href === '' ? cleanPath === basePath : cleanPath.startsWith(itemPath);
                        const Icon = item.icon;
                        const showPendingBadge = item.permission === 'orders' && pendingOrders > 0;

                        return (
                          <Link
                            key={item.label}
                            href={itemPath}
                            onClick={() => setIsOpen(false)}
                            className={cn(
                              'flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all',
                              isActive
                                ? 'bg-stone-200/80 dark:bg-zinc-800 text-stone-950 dark:text-white font-bold shadow-xs'
                                : 'text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800/60'
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <IconBadge color={isActive ? item.badgeColor : 'stone'} size="sm">
                                <Icon className="w-3.5 h-3.5" />
                              </IconBadge>
                              <span className="truncate">{item.label}</span>
                              {showPendingBadge && (
                                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-4.5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none">
                                  {pendingOrders > 99 ? '99+' : pendingOrders}
                                </span>
                              )}
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer con Acciones Rápidas */}
            <div className="p-4 border-t border-stone-200/80 dark:border-zinc-800/80 space-y-2 bg-stone-50/50 dark:bg-zinc-900/30">
              {hasPermission(role, 'pos') && (
                <Link
                  href={`/t/${slug}/pos`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition"
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
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 font-bold text-xs border border-stone-200 dark:border-zinc-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-stone-600 dark:text-zinc-400" />
                  <span>Ver vitrina digital ↗</span>
                </Link>
              )}
              <LogoutButton
                slug={slug}
                onLoggedOut={() => setIsOpen(false)}
                className="justify-center border border-rose-500/20 w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
