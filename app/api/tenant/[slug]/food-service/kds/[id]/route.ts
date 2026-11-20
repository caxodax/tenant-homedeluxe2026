import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { broadcastTenantOrderEvent } from '@/lib/realtime/tenant-orders-channel';
import {
  updateKitchenStatus,
  FsKitchenUpdateInputSchema,
} from '@/lib/plugins/food-service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: kitchenTicketId } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const body = await request.json();

    const parsed = FsKitchenUpdateInputSchema.safeParse({
      ...body,
      kitchen_ticket_id: kitchenTicketId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de actualización de comanda inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await updateKitchenStatus(
      tenant.db_schema_name,
      parsed.data.kitchen_ticket_id,
      parsed.data.item_ids || null,
      parsed.data.action
    );

    // Sincronización milimétrica con el Core de Pedidos
    try {
      if (result?.status === 'READY') {
        const orderUp = await pool.query(
          `UPDATE ${tenant.db_schema_name}.orders
           SET status = 'READY_FOR_PICKUP', updated_at = now()
           WHERE id = (SELECT order_id FROM ${tenant.db_schema_name}.fs_kitchen_tickets WHERE id = $1)
             AND status IN ('CONFIRMED', 'PREPARING')
           RETURNING id, order_number, total_primary, customer_name`,
          [parsed.data.kitchen_ticket_id]
        );
        if ((orderUp.rowCount || 0) > 0) {
          const o = orderUp.rows[0];
          await broadcastTenantOrderEvent(slug, {
            type: 'ORDER_UPDATED',
            orderId: o.id,
            orderNumber: String(o.order_number),
            status: 'READY_FOR_PICKUP',
            totalUsd: Number(o.total_primary || 0),
            customerName: o.customer_name || undefined,
            source: 'ADMIN',
          });
        }
      }
    } catch (syncErr) {
      console.error('Error sincronizando estado de orden desde KDS:', syncErr);
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating KDS ticket:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
