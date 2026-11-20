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
  | 'quotes'
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
  OWNER: ['dashboard', 'orders', 'inventory', 'pos', 'customers', 'quotes', 'reports', 'settings', 'staff'],
  MANAGER: ['dashboard', 'orders', 'inventory', 'pos', 'customers', 'quotes', 'reports', 'settings'],
  CASHIER: ['orders', 'pos', 'customers'],
  INVENTORY: ['dashboard', 'inventory', 'orders'],
  DELIVERY: ['orders'],
  WAITER: ['pos', 'orders'],
  KITCHEN: ['orders'],
  SALES_REP: ['quotes', 'orders', 'customers'],
};

export interface PermissionDefinition {
  id: TenantPermission;
  label: string;
  description: string;
  requiredPlugin?: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  { id: 'pos', label: 'Punto de Venta (POS)', description: 'Cobro rápido y caja en mostrador' },
  { id: 'inventory', label: 'Inventario & Catálogo', description: 'Productos, existencias y categorías' },
  { id: 'quotes', label: 'Cotizaciones & Preórdenes', description: 'Presupuestos y preórdenes', requiredPlugin: 'sales_team' },
  { id: 'orders', label: 'Pedidos & Despachos', description: 'Órdenes, envíos y cocina' },
  { id: 'customers', label: 'Clientes', description: 'Directorio y libreta de clientes' },
  { id: 'dashboard', label: 'Dashboard Operativo', description: 'Resumen de ventas y accesos rápidos' },
  { id: 'reports', label: 'Reportes Financieros', description: 'Métricas de venta y cierres de caja' },
  { id: 'settings', label: 'Configuración', description: 'Tasas BCV, perfiles y métodos de pago' },
  { id: 'staff', label: 'Equipo & Roles', description: 'Administración de usuarios y accesos' },
];

export function getAvailableRoles(activePlugins: string[] = []): StaffRole[] {
  return STAFF_ROLES.filter((role) => {
    if (role === 'SALES_REP' && !activePlugins.includes('sales_team')) return false;
    if (role === 'DELIVERY' && !activePlugins.includes('delivery_fleet')) return false;
    if ((role === 'WAITER' || role === 'KITCHEN') && !activePlugins.includes('food_service')) return false;
    return true;
  });
}

export function getAvailablePermissions(activePlugins: string[] = []): PermissionDefinition[] {
  return ALL_PERMISSIONS.filter((perm) => {
    if (perm.requiredPlugin && !activePlugins.includes(perm.requiredPlugin)) return false;
    return true;
  });
}

export function hasPermission(
  role: string, 
  permission: TenantPermission,
  customPermissions?: string[] | null
): boolean {
  if (role === 'OWNER') return true;
  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    return customPermissions.includes(permission);
  }
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
