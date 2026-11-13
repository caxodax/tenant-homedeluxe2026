'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Monitor,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasPermission, type TenantPermission } from '@/lib/auth/rbac';
import { usePendingOrdersBadge } from '@/components/admin/new-order-notification';
import { IconBadge, type IconBadgeColor } from '@/components/ui/icon-badge';

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
      { label: 'Caja', href: '/pos', icon: Monitor, permission: 'pos', badgeColor: 'amber' },
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

export function SidebarNav({ slug, role = 'OWNER' }: { slug: string; role?: string }) {
  const pathname = usePathname() || '';
  const cleanPath =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const basePath = `/t/${slug}/admin`;
  const pendingOrders = usePendingOrdersBadge(slug);

  return (
    <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
      {NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter((item) =>
          hasPermission(role, item.permission)
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title} className="space-y-1">
            <h3 className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
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
                    className={cn(
                      'group flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150',
                      isActive
                        ? 'bg-stone-200/80 dark:bg-zinc-800/90 text-stone-950 dark:text-white font-bold shadow-xs'
                        : 'text-stone-700 dark:text-zinc-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-100/80 dark:hover:bg-zinc-800/40'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconBadge
                        color={isActive ? item.badgeColor : 'stone'}
                        size="sm"
                        className={cn(
                          'transition-colors',
                          isActive ? 'scale-105' : 'opacity-80 group-hover:opacity-100'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </IconBadge>
                      <span className="truncate">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {showPendingBadge && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-4.5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none">
                          {pendingOrders > 99 ? '99+' : pendingOrders}
                        </span>
                      )}
                      <ChevronRight
                        className={cn(
                          'w-3.5 h-3.5 transition-transform',
                          isActive
                            ? 'text-stone-900 dark:text-white opacity-100 translate-x-0.5'
                            : 'text-stone-400 dark:text-zinc-600 opacity-0 group-hover:opacity-100'
                        )}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
