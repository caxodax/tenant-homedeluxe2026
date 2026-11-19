export type StaffRole =
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'
  | 'INVENTORY'
  | 'DELIVERY'
  | 'WAITER'
  | 'KITCHEN'
  | 'SALES_REP';

export type TenantPermission =
  | 'dashboard'
  | 'orders'
  | 'inventory'
  | 'pos'
  | 'customers'
  | 'reports'
  | 'settings'
  | 'staff';

export const STAFF_ROLES: StaffRole[] = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'INVENTORY',
  'DELIVERY',
  'WAITER',
  'KITCHEN',
  'SALES_REP',
];

export const ROLE_LABELS_ES: Record<StaffRole, string> = {
  OWNER: 'Propietario',
  MANAGER: 'Gerente',
  CASHIER: 'Cajero POS',
  INVENTORY: 'Inventario / Almacén',
  DELIVERY: 'Despacho / Delivery',
  WAITER: 'Mesero / Sala',
  KITCHEN: 'Cocina / KDS',
  SALES_REP: 'Vendedor / Asesor',
};

export const ROLE_PERMISSIONS: Record<StaffRole, TenantPermission[]> = {
  OWNER: ['dashboard', 'orders', 'inventory', 'pos', 'customers', 'reports', 'settings', 'staff'],
  MANAGER: ['dashboard', 'orders', 'inventory', 'pos', 'customers', 'reports', 'settings'],
  CASHIER: ['orders', 'pos', 'customers'],
  INVENTORY: ['dashboard', 'inventory', 'orders'],
  DELIVERY: ['orders'],
  WAITER: ['pos', 'orders'],
  KITCHEN: ['orders'],
  SALES_REP: ['orders', 'customers'],
};

export function hasPermission(role: string, permission: TenantPermission): boolean {
  const perms = ROLE_PERMISSIONS[role as StaffRole];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getDefaultLandingPath(slug: string, role: string): string {
  if (role === 'CASHIER' || role === 'WAITER') return `/t/${slug}/pos`;
  if (role === 'KITCHEN') return `/t/${slug}/admin/kds`;
  if (role === 'DELIVERY') return `/t/${slug}/admin/orders`;
  if (role === 'INVENTORY') return `/t/${slug}/admin/inventory`;
  if (role === 'SALES_REP') return `/t/${slug}/admin/sales/quotes`;
  return `/t/${slug}/admin`;
}
