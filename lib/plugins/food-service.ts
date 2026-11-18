/**
 * MarketOS — Plugin Food Service & KDS (`food_service`)
 * Módulo de dominio de gastronomía, comandas de cocina (KDS), salones, mesas,
 * escandallo de recetas, modificadores y división de cuentas bimonetarias (Split Bill).
 * Principio Ponytail & Impeccable: Tipado estricto, funciones puras y cero dependencias pesadas.
 */

import { z } from 'zod';
import { withTenantDb, pool } from '@/lib/db';

// ============================================================================
// 1. ESQUEMAS DE CONFIGURACIÓN Y VALIDACIÓN (ZOD)
// ============================================================================

export const FoodServiceConfigSchema = z.object({
  service_charge_mode: z
    .enum(['NONE', 'TIP_VOLUNTARY', 'SERVICE_CHARGE_FIXED'])
    .default('TIP_VOLUNTARY'),
  service_charge_pct: z.number().min(0).max(100).default(10),
  kitchen_output: z.enum(['KDS', 'PRINT', 'BOTH']).default('BOTH'),
  hidden_category_slugs: z.array(z.string()).default(['adicionales', 'ingredientes']),
  kds_sound: z.boolean().default(true),
  kds_warn_minutes: z.number().int().min(1).max(120).default(12),
});

export type FoodServiceConfig = z.infer<typeof FoodServiceConfigSchema>;

export const FsZoneInputSchema = z.object({
  name: z.string().min(2, 'El nombre de la zona debe tener al menos 2 caracteres').max(60),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
export type FsZoneInput = z.infer<typeof FsZoneInputSchema>;

export const FsTableInputSchema = z.object({
  zone_id: z.string().uuid().nullable().optional(),
  label: z.string().min(1, 'El identificador de mesa es requerido').max(30),
  seats: z.number().int().min(1, 'Mínimo 1 comensal').default(4),
  status: z.enum(['FREE', 'OCCUPIED', 'RESERVED', 'CLEANING']).default('FREE'),
  is_active: z.boolean().default(true),
});
export type FsTableInput = z.infer<typeof FsTableInputSchema>;

export const FsOpenTableInputSchema = z.object({
  table_id: z.string().uuid('ID de mesa inválido'),
  staff_id: z.string().uuid().optional().nullable(),
  covers: z.number().int().min(1).default(1),
  notes: z.string().max(300).optional().nullable(),
});
export type FsOpenTableInput = z.infer<typeof FsOpenTableInputSchema>;

export const FsSendToKitchenInputSchema = z.object({
  order_id: z.string().uuid('ID de orden inválido'),
  ticket_id: z.string().uuid('ID de ticket inválido').optional().nullable(),
  prep_notes: z.record(z.string(), z.string()).optional().default({}),
});
export type FsSendToKitchenInput = z.infer<typeof FsSendToKitchenInputSchema>;

export const FsKitchenUpdateInputSchema = z.object({
  kitchen_ticket_id: z.string().uuid('ID de comanda inválido'),
  item_ids: z.array(z.string().uuid()).optional().nullable(),
  action: z.enum(['READY_ITEM', 'READY_ALL', 'SERVED', 'VOID']).default('READY_ALL'),
});
export type FsKitchenUpdateInput = z.infer<typeof FsKitchenUpdateInputSchema>;

export const FsSplitItemSchema = z.object({
  split_no: z.number().int().min(1),
  label: z.string().max(50).optional(),
  amount_primary: z.number().min(0),
  amount_secondary: z.number().min(0).optional(),
  method: z.string().default('CASH'),
  reference: z.string().max(60).optional(),
  item_refs: z.array(z.string()).optional().default([]),
});

export const FsPayTableInputSchema = z.object({
  ticket_id: z.string().uuid('ID de comanda de mesa inválido'),
  pay_mode: z.enum(['FULL', 'EQUAL', 'ITEMS']).default('FULL'),
  splits: z.array(FsSplitItemSchema).optional().default([]),
  tip_amount_primary: z.number().min(0).default(0.0),
  payment_method: z.string().default('CASH'),
  exchange_rate: z.number().positive().default(1.0),
  staff_id: z.string().uuid().optional().nullable(),
});
export type FsPayTableInput = z.infer<typeof FsPayTableInputSchema>;

export const FsToggle86InputSchema = z.object({
  product_id: z.string().uuid('ID de producto inválido'),
  is_86: z.boolean().default(true),
});
export type FsToggle86Input = z.infer<typeof FsToggle86InputSchema>;

export const FsModifierGroupInputSchema = z.object({
  name: z.string().min(2).max(100),
  min_select: z.number().int().min(0).default(0),
  max_select: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
export type FsModifierGroupInput = z.infer<typeof FsModifierGroupInputSchema>;

export const FsRawMaterialInputSchema = z.object({
  name: z.string().min(2).max(120),
  unit: z.enum(['GR', 'KG', 'ML', 'LT', 'UNID', 'PORCION']).default('GR'),
  current_stock: z.number().default(0.0),
  min_stock: z.number().min(0).default(0.0),
  cost_per_unit_primary: z.number().min(0).default(0.0),
  is_active: z.boolean().default(true),
});
export type FsRawMaterialInput = z.infer<typeof FsRawMaterialInputSchema>;

export const FsRecipeItemInputSchema = z.object({
  raw_material_id: z.string().uuid(),
  quantity: z.number().positive(),
  waste_pct: z.number().min(0).max(100).default(0),
});

export const FsRecipeInputSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().min(2).max(120),
  yield_portions: z.number().positive().default(1.0),
  preparation_time_minutes: z.number().int().min(1).default(15),
  instructions: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  items: z.array(FsRecipeItemInputSchema).default([]),
});
export type FsRecipeInput = z.infer<typeof FsRecipeInputSchema>;

// ============================================================================
// 2. MODELOS DE DOMINIO E INTERFACES
// ============================================================================

export interface FsZone {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  tables?: FsTable[];
}

export interface FsTable {
  id: string;
  zone_id: string | null;
  zone_name?: string | null;
  label: string;
  seats: number;
  status: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  is_active: boolean;
  created_at: string;
  current_ticket?: FsTableTicket | null;
}

export interface FsTableTicket {
  id: string;
  table_id: string;
  table_label?: string;
  opened_by: string | null;
  opened_by_name?: string | null;
  covers: number;
  status: 'OPEN' | 'CLOSED' | 'VOIDED';
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  orders_count?: number;
  total_primary?: number;
}

export interface FsKitchenTicketItem {
  id: string;
  kitchen_ticket_id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  modifiers: Array<{ group_name?: string; option_name?: string; [key: string]: unknown }>;
  prep_notes: string | null;
  status: 'PENDING' | 'READY' | 'VOIDED';
  ready_at: string | null;
}

export interface FsKitchenTicket {
  id: string;
  order_id: string;
  order_number?: string;
  ticket_id: string | null;
  table_label?: string;
  delivery_type?: string;
  status: 'PENDING' | 'FIRED' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED';
  fired_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  notes: string | null;
  created_at: string;
  items: FsKitchenTicketItem[];
}

export interface FsModifierGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  sort_order: number;
  is_active: boolean;
  options?: FsModifierOption[];
}

export interface FsModifierOption {
  product_id: string;
  name: string;
  price_primary: number;
  sort_order: number;
}

export interface FsRawMaterial {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  cost_per_unit_primary?: number; // Solo staff admin/inventory, nunca público
  is_active: boolean;
  created_at: string;
}

export interface FsDaily86 {
  product_id: string;
  service_date: string;
  is_86: boolean;
  product_name?: string;
}

// ============================================================================
// 3. FUNCIONES PURAS DE CÁLCULO (SPLIT BILL, PROPINA Y SEMÁFORO KDS)
// ============================================================================

/**
 * Calcula división en partes iguales de una cuenta bimonetaria.
 * Asigna cualquier centavo residual (diferencia de redondeo) a la última división.
 */
export function calculateSplitBillEqual(
  totalPrimary: number,
  splitsCount: number,
  exchangeRate: number
): Array<{ split_no: number; amount_primary: number; amount_secondary: number }> {
  if (splitsCount <= 1) {
    const p = Math.round(totalPrimary * 100) / 100;
    return [{ split_no: 1, amount_primary: p, amount_secondary: Math.round(p * exchangeRate * 100) / 100 }];
  }

  const basePerSplit = Math.floor((totalPrimary / splitsCount) * 100) / 100;
  const splits = [];
  let accumulated = 0;

  for (let i = 1; i <= splitsCount; i++) {
    const isLast = i === splitsCount;
    const amountP = isLast
      ? Math.round((totalPrimary - accumulated) * 100) / 100
      : basePerSplit;
    accumulated += amountP;
    const amountS = Math.round(amountP * exchangeRate * 100) / 100;
    splits.push({ split_no: i, amount_primary: amountP, amount_secondary: amountS });
  }

  return splits;
}

/**
 * Calcula propina o cargo por servicio según el modo configurado.
 */
export function calculateTipOrServiceCharge(
  subtotalPrimary: number,
  mode: 'NONE' | 'TIP_VOLUNTARY' | 'SERVICE_CHARGE_FIXED',
  pct = 10
): number {
  if (mode === 'NONE') return 0.0;
  const rate = Math.max(0, pct) / 100;
  return Math.round(subtotalPrimary * rate * 100) / 100;
}

/**
 * Determina el estado de alerta del semáforo KDS según minutos transcurridos.
 */
export function getKdsTimeStatus(
  firedAt: string | Date | null,
  warnMinutes = 12
): { elapsedMinutes: number; level: 'NORMAL' | 'WARN' | 'DANGER' } {
  if (!firedAt) return { elapsedMinutes: 0, level: 'NORMAL' };
  const firedTime = new Date(firedAt).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.max(0, Math.floor((now - firedTime) / 60000));

  if (elapsedMinutes >= warnMinutes * 1.5) {
    return { elapsedMinutes, level: 'DANGER' };
  }
  if (elapsedMinutes >= warnMinutes) {
    return { elapsedMinutes, level: 'WARN' };
  }
  return { elapsedMinutes, level: 'NORMAL' };
}

// ============================================================================
// 4. CAPA DE ACCESO A DATOS (DATA ACCESS LAYER / SERVER ACTIONS)
// ============================================================================

/**
 * Obtiene la configuración del plugin Food Service para un comercio.
 */
export async function getFoodServiceConfig(tenantId: string): Promise<{ is_active: boolean; config: FoodServiceConfig }> {
  const res = await pool.query(
    `SELECT is_active, config FROM platform.tenant_plugins WHERE tenant_id = $1 AND plugin_id = 'food_service'`,
    [tenantId]
  );
  const row = res.rows[0];
  const is_active = Boolean(row?.is_active);
  const parsed = FoodServiceConfigSchema.safeParse(row?.config || {});
  return {
    is_active,
    config: parsed.success ? parsed.data : FoodServiceConfigSchema.parse({}),
  };
}

/**
 * Consulta todas las zonas y mesas activas de sala junto a su ticket actual abierto.
 */
export async function getZonesAndTables(tenantSchema: string): Promise<FsZone[]> {
  return withTenantDb(tenantSchema, null, async (client) => {
    const zonesRes = await client.query(`
      SELECT id, name, sort_order, is_active, created_at
      FROM fs_zones
      WHERE is_active = true
      ORDER BY sort_order ASC, name ASC
    `);

    const tablesRes = await client.query(`
      SELECT
        t.id, t.zone_id, t.label, t.seats, t.status, t.is_active, t.created_at,
        z.name as zone_name,
        tk.id as ticket_id, tk.covers as ticket_covers, tk.opened_at as ticket_opened_at,
        tk.notes as ticket_notes, sp.full_name as opened_by_name,
        COALESCE(SUM(o.total_primary), 0.00) as ticket_total_primary,
        COUNT(DISTINCT tko.order_id) as orders_count
      FROM fs_tables t
      LEFT JOIN fs_zones z ON z.id = t.zone_id
      LEFT JOIN fs_table_tickets tk ON tk.table_id = t.id AND tk.status = 'OPEN'
      LEFT JOIN staff_profiles sp ON sp.id = tk.opened_by
      LEFT JOIN fs_ticket_orders tko ON tko.ticket_id = tk.id
      LEFT JOIN orders o ON o.id = tko.order_id AND o.status != 'CANCELLED'
      WHERE t.is_active = true
      GROUP BY t.id, z.name, tk.id, tk.covers, tk.opened_at, tk.notes, sp.full_name
      ORDER BY t.label ASC
    `);

    const tablesByZone = new Map<string | null, FsTable[]>();
    for (const row of tablesRes.rows) {
      const table: FsTable = {
        id: row.id,
        zone_id: row.zone_id,
        zone_name: row.zone_name,
        label: row.label,
        seats: row.seats,
        status: row.status,
        is_active: row.is_active,
        created_at: row.created_at,
        current_ticket: row.ticket_id
          ? {
              id: row.ticket_id,
              table_id: row.id,
              table_label: row.label,
              opened_by: null,
              opened_by_name: row.opened_by_name,
              covers: row.ticket_covers,
              status: 'OPEN',
              opened_at: row.ticket_opened_at,
              closed_at: null,
              notes: row.ticket_notes,
              orders_count: Number(row.orders_count || 0),
              total_primary: Number(row.ticket_total_primary || 0),
            }
          : null,
      };

      const zoneKey = row.zone_id || '__unassigned__';
      const list = tablesByZone.get(zoneKey) || [];
      list.push(table);
      tablesByZone.set(zoneKey, list);
    }

    const zones: FsZone[] = zonesRes.rows.map((zRow) => ({
      id: zRow.id,
      name: zRow.name,
      sort_order: zRow.sort_order,
      is_active: zRow.is_active,
      created_at: zRow.created_at,
      tables: tablesByZone.get(zRow.id) || [],
    }));

    const unassignedTables = tablesByZone.get('__unassigned__');
    if (unassignedTables && unassignedTables.length > 0) {
      zones.unshift({
        id: 'unassigned',
        name: 'General / Sin Zona',
        sort_order: -1,
        is_active: true,
        created_at: new Date().toISOString(),
        tables: unassignedTables,
      });
    }

    return zones;
  });
}

/**
 * Abre una mesa o retorna el ticket abierto existente llamando al RPC `platform.rpc_fs_open_table`.
 */
export async function openTable(
  tenantSchema: string,
  tableId: string,
  staffId: string | null,
  covers = 1,
  notes: string | null = null
) {
  const res = await pool.query(
    `SELECT platform.rpc_fs_open_table($1, $2, $3, $4, $5) as result`,
    [tenantSchema, tableId, staffId, covers, notes]
  );
  return res.rows[0]?.result;
}

/**
 * Envía una orden a comanda KDS llamando al RPC `platform.rpc_fs_send_to_kitchen`.
 */
export async function sendToKitchen(
  tenantSchema: string,
  orderId: string,
  ticketId: string | null = null,
  prepNotes: Record<string, string> = {}
) {
  const res = await pool.query(
    `SELECT platform.rpc_fs_send_to_kitchen($1, $2, $3, $4::jsonb) as result`,
    [tenantSchema, orderId, ticketId, JSON.stringify(prepNotes)]
  );
  return res.rows[0]?.result;
}

/**
 * Actualiza el estado de una comanda o ítems en KDS llamando a `platform.rpc_fs_kitchen_update`.
 */
export async function updateKitchenStatus(
  tenantSchema: string,
  kitchenTicketId: string,
  itemIds: string[] | null = null,
  action: 'READY_ITEM' | 'READY_ALL' | 'SERVED' | 'VOID' = 'READY_ALL'
) {
  const res = await pool.query(
    `SELECT platform.rpc_fs_kitchen_update($1, $2, $3, $4) as result`,
    [tenantSchema, kitchenTicketId, itemIds, action]
  );
  return res.rows[0]?.result;
}

/**
 * Cobra y liquida la cuenta de una mesa llamando a `platform.rpc_fs_pay_table`.
 */
export async function payTable(tenantSchema: string, payload: FsPayTableInput) {
  const res = await pool.query(
    `SELECT platform.rpc_fs_pay_table($1, $2, $3, $4::jsonb, $5, $6, $7, $8) as result`,
    [
      tenantSchema,
      payload.ticket_id,
      payload.pay_mode,
      JSON.stringify(payload.splits || []),
      payload.tip_amount_primary || 0.0,
      payload.payment_method || 'CASH',
      payload.exchange_rate || 1.0,
      payload.staff_id || null,
    ]
  );
  return res.rows[0]?.result;
}

/**
 * Marca o desmarca un producto como 86 (agotado hoy) llamando a `platform.rpc_fs_toggle_86`.
 */
export async function toggleProduct86(tenantSchema: string, productId: string, is86 = true) {
  const res = await pool.query(
    `SELECT platform.rpc_fs_toggle_86($1, $2, $3) as result`,
    [tenantSchema, productId, is86]
  );
  return res.rows[0]?.result;
}

/**
 * Consulta la lista de productos agotados hoy (86) para la vitrina y el POS.
 */
export async function getDaily86Products(tenantSchema: string): Promise<string[]> {
  return withTenantDb(tenantSchema, null, async (client) => {
    const res = await client.query(`
      SELECT product_id
      FROM fs_daily_86
      WHERE service_date = CURRENT_DATE AND is_86 = true
    `);
    return res.rows.map((r) => r.product_id);
  });
}

/**
 * Consulta las comandas activas de cocina para la pantalla KDS.
 */
export async function getActiveKitchenTickets(tenantSchema: string): Promise<FsKitchenTicket[]> {
  return withTenantDb(tenantSchema, null, async (client) => {
    const ticketsRes = await client.query(`
      SELECT
        kt.id, kt.order_id, kt.ticket_id, kt.status, kt.fired_at, kt.ready_at,
        kt.served_at, kt.notes, kt.created_at,
        o.order_number,
        o.delivery_type,
        COALESCE(
          CASE WHEN t.label IS NOT NULL THEN 'Mesa ' || t.label END,
          CASE 
            WHEN o.delivery_type = 'DELIVERY' THEN 'DELIVERY'
            WHEN o.delivery_type = 'PICKUP' THEN 'PARA LLEVAR'
            ELSE 'MOSTRADOR'
          END
        ) as table_label
      FROM fs_kitchen_tickets kt
      JOIN orders o ON o.id = kt.order_id
      LEFT JOIN fs_table_tickets tk ON tk.id = kt.ticket_id
      LEFT JOIN fs_tables t ON t.id = tk.table_id
      WHERE kt.status IN ('PENDING', 'FIRED', 'PREPARING', 'READY')
      ORDER BY kt.created_at ASC
    `);

    if (ticketsRes.rows.length === 0) return [];

    const ticketIds = ticketsRes.rows.map((r) => r.id);
    const itemsRes = await client.query(
      `
      SELECT
        id, kitchen_ticket_id, order_item_id, product_name, quantity,
        modifiers, prep_notes, status, ready_at
      FROM fs_kitchen_ticket_items
      WHERE kitchen_ticket_id = ANY($1)
      ORDER BY id ASC
    `,
      [ticketIds]
    );

    const itemsByTicket = new Map<string, FsKitchenTicketItem[]>();
    for (const item of itemsRes.rows) {
      const list = itemsByTicket.get(item.kitchen_ticket_id) || [];
      list.push({
        id: item.id,
        kitchen_ticket_id: item.kitchen_ticket_id,
        order_item_id: item.order_item_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
        prep_notes: item.prep_notes,
        status: item.status,
        ready_at: item.ready_at,
      });
      itemsByTicket.set(item.kitchen_ticket_id, list);
    }

    return ticketsRes.rows.map((r) => ({
      id: r.id,
      order_id: r.order_id,
      order_number: r.order_number,
      ticket_id: r.ticket_id,
      table_label: r.table_label,
      delivery_type: r.delivery_type,
      status: r.status,
      fired_at: r.fired_at,
      ready_at: r.ready_at,
      served_at: r.served_at,
      notes: r.notes,
      created_at: r.created_at,
      items: itemsByTicket.get(r.id) || [],
    }));
  });
}
