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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasPermission, type TenantPermission } from '@/lib/auth/rbac';
import { usePendingOrdersBadge } from '@/components/admin/new-order-notification';

const NAV_ITEMS: Array<{
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission: TenantPermission;
}> = [
  { label: 'Dashboard', href: '', icon: LayoutDashboard, permission: 'dashboard' },
  { label: 'Pedidos', href: '/orders', icon: ShoppingCart, permission: 'orders' },
  { label: 'Inventario', href: '/inventory', icon: Package, permission: 'inventory' },
  { label: 'Punto de Venta', href: '/pos', icon: Monitor, permission: 'pos' },
  { label: 'Clientes', href: '/customers', icon: Users, permission: 'customers' },
  { label: 'Reportes', href: '/reports', icon: BarChart3, permission: 'reports' },
  { label: 'Equipo & Roles', href: '/staff', icon: ShieldCheck, permission: 'staff' },
  { label: 'Configuración', href: '/settings', icon: Settings, permission: 'settings' },
];

export function SidebarNav({ slug, role = 'OWNER' }: { slug: string; role?: string }) {
  const pathname = usePathname() || '';
  const cleanPath =
    pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const basePath = `/t/${slug}/admin`;
  const pendingOrders = usePendingOrdersBadge(slug);

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(role, item.permission));

  return (
    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
              'flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm transition-all',
              isActive
                ? 'bg-lime-500/15 text-lime-700 dark:text-lime-400 font-bold border border-lime-500/30 shadow-xs'
                : 'text-slate-800 dark:text-zinc-200 font-semibold hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/70'
            )}
          >
            <span className="flex items-center gap-3 min-w-0">
              <Icon
                className={cn(
                  'w-4 h-4 shrink-0',
                  isActive
                    ? 'text-lime-600 dark:text-lime-400'
                    : 'text-slate-600 dark:text-zinc-400'
                )}
              />
              <span className="truncate">{item.label}</span>
            </span>
            {showPendingBadge && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none shrink-0">
                {pendingOrders > 99 ? '99+' : pendingOrders}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
