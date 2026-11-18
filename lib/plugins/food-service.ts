/**
 * MarketOS — Plugin Food Service & KDS (`food_service`) - Data Access Layer
 * Módulo de base de datos para gastronomía, comandas de cocina (KDS), salones y mesas.
 * Server-side only: interactúa con PostgreSQL y pool de conexiones.
 */

import { withTenantDb, pool } from '@/lib/db';
import {
  FoodServiceConfigSchema,
  type FoodServiceConfig,
  type FsZone,
  type FsTable,
  type FsTableTicket,
  type FsKitchenTicket,
  type FsKitchenTicketItem,
  type FsDaily86,
  type FsOpenTableInput,
  type FsSendToKitchenInput,
  type FsKitchenUpdateInput,
  type FsPayTableInput,
  calculateTipOrServiceCharge,
} from './food-service-shared';

export * from './food-service-shared';

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
