import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { openTable, sendToKitchen } from '@/lib/plugins/food-service';
import { withTenantDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TableOrderItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().optional().nullable(),
  product_name: z.string().min(1),
  quantity: z.number().int().min(1),
  unit_price_primary: z.number().min(0),
  modifiers: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        price: z.number().optional(),
      })
    )
    .optional()
    .default([]),
  prep_notes: z.string().max(200).optional().nullable(),
});

const TableOrderInputSchema = z.object({
  items: z.array(TableOrderItemSchema).min(1, 'La comanda debe tener al menos 1 producto'),
  covers: z.number().int().min(1).optional().default(2),
  customer_name: z.string().max(120).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: tableId } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();

    const parsed = TableOrderInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de comanda inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { items, covers, customer_name, notes } = parsed.data;

    // 1. Abrir mesa o recuperar ticket abierto
    const openResult = await openTable(
      tenant.db_schema_name,
      tableId,
      staff.id,
      covers,
      notes || null
    );
    const ticketId = openResult?.ticket_id as string;
    if (!ticketId) {
      return NextResponse.json({ error: 'No se pudo abrir o recuperar el ticket de la mesa.' }, { status: 500 });
    }

    // 2. Crear orden y asociarla al ticket de mesa
    const created = await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const tableRes = await client.query(`SELECT label FROM fs_tables WHERE id = $1`, [tableId]);
      const tableLabel = tableRes.rows[0]?.label || 'Sala';

      const storeRes = await client.query(
        `SELECT id FROM stores WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
      );
      const storeId = storeRes.rows[0]?.id;
      if (!storeId) {
        throw new TenantAuthError('No existe una sucursal activa configurada.', 400);
      }

      const settingsRes = await client.query(
        `SELECT exchange_rate FROM settings WHERE key = 'general' LIMIT 1`
      );
      const exchangeRate = Math.max(Number(settingsRes.rows[0]?.exchange_rate || 1), 1);

      const subtotal = items.reduce(
        (acc, it) => acc + Math.round(it.unit_price_primary * it.quantity * 100) / 100,
        0
      );
      const totalPrimary = Math.round(subtotal * 100) / 100;
      const totalSecondary = Math.round(totalPrimary * exchangeRate * 100) / 100;

      const orderNumber = `M${tableLabel.replace(/\s+/g, '')}-${Date.now().toString().slice(-5)}`;
      const orderNote = [
        `Mesa ${tableLabel}`,
        `Mesero: ${staff.full_name}`,
        notes?.trim() ? notes.trim() : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const orderRes = await client.query(
        `INSERT INTO orders (
          order_number, store_id, customer_name, customer_phone, status,
          delivery_type, subtotal_primary, discount_primary, tax_primary,
          shipping_primary, total_primary, total_secondary, exchange_rate_applied,
          is_offline_sale, seller_id, notes
        ) VALUES (
          $1, $2, $3, '0000000', 'PREPARING',
          'DINE_IN', $4, 0.00, 0.00,
          0.00, $4, $5, $6,
          false, $7, $8
        ) RETURNING id, order_number`,
        [
          orderNumber,
          storeId,
          customer_name?.trim() || `Mesa ${tableLabel}`,
          totalPrimary,
          totalSecondary,
          exchangeRate,
          staff.id,
          orderNote,
        ]
      );
      const orderId = orderRes.rows[0].id as string;

      const prepNotesMap: Record<string, string> = {};

      for (const it of items) {
        const lineTotal = Math.round(it.unit_price_primary * it.quantity * 100) / 100;
        const metadata = {
          variant_id: it.variant_id || null,
          modifiers: it.modifiers || [],
          prep_notes: it.prep_notes || null,
        };
        const oiRes = await client.query(
          `INSERT INTO order_items (
            order_id, product_id, product_name, quantity, unit_price_primary, total_price_primary, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb
          ) RETURNING id`,
          [
            orderId,
            it.product_id,
            it.product_name,
            it.quantity,
            it.unit_price_primary,
            lineTotal,
            JSON.stringify(metadata),
          ]
        );
        if (it.prep_notes?.trim()) {
          prepNotesMap[oiRes.rows[0].id] = it.prep_notes.trim();
        }
      }

      const roundRes = await client.query(
        `SELECT COALESCE(MAX(round), 0) + 1 AS next_round FROM fs_ticket_orders WHERE ticket_id = $1`,
        [ticketId]
      );
      const nextRound = Number(roundRes.rows[0]?.next_round || 1);

      await client.query(
        `INSERT INTO fs_ticket_orders (ticket_id, order_id, round) VALUES ($1, $2, $3)`,
        [ticketId, orderId, nextRound]
      );

      // Asegurar que la mesa vuelva a OCCUPIED si estaba en BILL_REQUESTED
      await client.query(
        `UPDATE fs_tables SET status = 'OCCUPIED' WHERE id = $1 AND status IN ('FREE', 'BILL_REQUESTED')`,
        [tableId]
      );

      return {
        orderId,
        orderNumber: orderRes.rows[0].order_number,
        tableLabel,
        round: nextRound,
        totalPrimary,
        prepNotesMap,
      };
    });

    // 3. Disparar comanda al KDS (Cocina)
    await sendToKitchen(tenant.db_schema_name, created.orderId, ticketId, created.prepNotesMap);

    return NextResponse.json({
      success: true,
      ticket_id: ticketId,
      order_id: created.orderId,
      order_number: created.orderNumber,
      table_label: created.tableLabel,
      round: created.round,
      total_primary: created.totalPrimary,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error sending table order to kitchen:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
