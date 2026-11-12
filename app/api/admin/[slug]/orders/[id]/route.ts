import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { writeTenantAuditLog } from '@/lib/payment-methods';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { broadcastTenantOrderEvent } from '@/lib/realtime/tenant-orders-channel';

export const dynamic = 'force-dynamic';

const ORDER_STATUSES = [
  'CREATED',
  'PREORDER_PENDING_REVIEW',
  'PENDING_PAYMENT_VERIFICATION',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DELIVERED',
  'CANCELLED',
] as const;

const patchOrderSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('UPDATE_STATUS'),
    status: z.enum(ORDER_STATUSES),
    note: z.string().max(300).optional(),
  }),
  z.object({
    action: z.literal('VERIFY_PAYMENT'),
    payment_id: z.string().uuid().optional(),
    auto_confirm_order: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('REJECT_PAYMENT'),
    payment_id: z.string().uuid().optional(),
    rejection_reason: z.string().trim().min(3, 'Indica el motivo del rechazo').max(300),
  }),
  z.object({
    action: z.literal('ATTACH_PAYMENT_PROOF'),
    payment_id: z.string().uuid().optional(),
    method: z.string().trim().min(2).max(40).optional(),
    reference_number: z.string().trim().max(100).optional().nullable(),
    proof_image_url: z.string().trim().max(500).optional().nullable(),
    proof_file_hash: z.string().trim().max(128).optional().nullable(),
    bank_source: z.string().trim().max(100).optional().nullable(),
  }),
]);

async function loadFullOrderDetail(schema: string, orderId: string) {
  return withTenantDb(schema, null, async (client) => {
    const orderRes = await client.query(
      `SELECT o.*, s.name AS store_name
       FROM orders o
       LEFT JOIN stores s ON s.id = o.store_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId]
    );

    if ((orderRes.rowCount || 0) === 0) return null;
    const order = orderRes.rows[0];

    const [itemsRes, paymentsRes, auditRes, movementsRes] = await Promise.all([
      client.query(
        `SELECT oi.*, p.sku, p.image_url
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.created_at ASC`,
        [orderId]
      ),
      client.query(
        `SELECT py.*, sp.full_name AS verified_by_name
         FROM payments py
         LEFT JOIN staff_profiles sp ON sp.id = py.verified_by
         WHERE py.order_id = $1
         ORDER BY py.created_at DESC`,
        [orderId]
      ),
      client.query(
        `SELECT id, actor_name, actor_role, action, entity, entity_id, old_data, new_data, created_at
         FROM audit_logs
         WHERE entity = 'order' AND entity_id = $1
         ORDER BY created_at DESC`,
        [orderId]
      ),
      client.query(
        `SELECT im.id, im.product_id, p.name AS product_name, im.quantity_change, im.previous_quantity, im.new_quantity, im.movement_type, im.notes, im.created_at
         FROM inventory_movements im
         LEFT JOIN products p ON p.id = im.product_id
         WHERE im.reference_id = $1
         ORDER BY im.created_at DESC`,
        [order.order_number]
      ),
    ]);

    return {
      order,
      items: itemsRes.rows,
      payments: paymentsRes.rows,
      audit_logs: auditRes.rows,
      inventory_movements: movementsRes.rows,
    };
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');

    const detail = await loadFullOrderDetail(tenant.db_schema_name, id);
    if (!detail) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching order detail:', error);
    return NextResponse.json({ error: 'Error al consultar el pedido' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');
    const body = await request.json();
    const parsed = patchOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const staffUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id)
      ? staff.id
      : null;

    await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const orderRes = await client.query(
        `SELECT id, order_number, status, total_usd FROM orders WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if ((orderRes.rowCount || 0) === 0) {
        throw new Error('Pedido no encontrado');
      }
      const order = orderRes.rows[0];

      if (payload.action === 'UPDATE_STATUS') {
        await client.query(
          `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2`,
          [payload.status, id]
        );

        await writeTenantAuditLog(client, {
          actorId: staff.id,
          actorName: staff.full_name,
          actorRole: staff.role,
          action: 'ORDER_STATUS_UPDATED',
          entity: 'order',
          entityId: id,
          oldData: { status: order.status },
          newData: { status: payload.status, note: payload.note || null },
        });
      } else if (payload.action === 'VERIFY_PAYMENT' || payload.action === 'REJECT_PAYMENT') {
        const payRes = payload.payment_id
          ? await client.query(`SELECT * FROM payments WHERE id = $1 AND order_id = $2 FOR UPDATE`, [
              payload.payment_id,
              id,
            ])
          : await client.query(
              `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
              [id]
            );

        if ((payRes.rowCount || 0) === 0) {
          throw new Error('No hay registro de pago asociado a este pedido');
        }
        const payment = payRes.rows[0];

        let validVerifiedBy: string | null = null;
        if (staffUuid) {
          const sCheck = await client.query(`SELECT id FROM staff_profiles WHERE id = $1`, [staffUuid]);
          if ((sCheck.rowCount || 0) > 0) validVerifiedBy = staffUuid;
        }

        if (payload.action === 'VERIFY_PAYMENT') {
          await client.query(
            `UPDATE payments
             SET status = 'VERIFIED',
                 verified_by = $1,
                 verified_at = now(),
                 rejection_reason = NULL
             WHERE id = $2`,
            [validVerifiedBy, payment.id]
          );

          let nextOrderStatus = order.status;
          if (
            payload.auto_confirm_order &&
            ['CREATED', 'PENDING_PAYMENT_VERIFICATION', 'PREORDER_PENDING_REVIEW'].includes(order.status)
          ) {
            nextOrderStatus = 'CONFIRMED';
            await client.query(`UPDATE orders SET status = 'CONFIRMED', updated_at = now() WHERE id = $1`, [
              id,
            ]);
          }

          await writeTenantAuditLog(client, {
            actorId: staff.id,
            actorName: staff.full_name,
            actorRole: staff.role,
            action: 'PAYMENT_VERIFIED',
            entity: 'order',
            entityId: id,
            oldData: { payment_status: payment.status, order_status: order.status },
            newData: {
              payment_id: payment.id,
              payment_status: 'VERIFIED',
              reference_number: payment.reference_number,
              order_status: nextOrderStatus,
            },
          });
        } else {
          await client.query(
            `UPDATE payments
             SET status = 'REJECTED',
                 verified_by = $1,
                 verified_at = now(),
                 rejection_reason = $2
             WHERE id = $3`,
            [validVerifiedBy, payload.rejection_reason, payment.id]
          );

          await client.query(
            `UPDATE orders SET status = 'PENDING_PAYMENT_VERIFICATION', updated_at = now() WHERE id = $1`,
            [id]
          );

          await writeTenantAuditLog(client, {
            actorId: staff.id,
            actorName: staff.full_name,
            actorRole: staff.role,
            action: 'PAYMENT_REJECTED',
            entity: 'order',
            entityId: id,
            oldData: { payment_status: payment.status, order_status: order.status },
            newData: {
              payment_id: payment.id,
              payment_status: 'REJECTED',
              rejection_reason: payload.rejection_reason,
              order_status: 'PENDING_PAYMENT_VERIFICATION',
            },
          });
        }
      } else if (payload.action === 'ATTACH_PAYMENT_PROOF') {
        // Si adjunta comprobante con hash SHA-256, validar en el muro antifraude global
        if (payload.proof_file_hash && payload.proof_file_hash.trim().length > 0) {
          const refToCheck = payload.reference_number?.trim() || order.order_number;
          const fraudRes = await pool.query(
            `SELECT platform.rpc_check_payment_fraud($1, $2, $3, $4, $5) AS res`,
            [
              payload.proof_file_hash.trim(),
              tenant.id,
              refToCheck,
              payload.bank_source || null,
              parseFloat(order.total_usd),
            ]
          );
          const fraud = fraudRes.rows[0]?.res;
          if (fraud?.is_fraud) {
            throw new Error(fraud.message || `Comprobante rechazado: ${fraud.reason}`);
          }
        }

        const payRes = payload.payment_id
          ? await client.query(`SELECT * FROM payments WHERE id = $1 AND order_id = $2 FOR UPDATE`, [
              payload.payment_id,
              id,
            ])
          : await client.query(
              `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
              [id]
            );

        if ((payRes.rowCount || 0) > 0) {
          const existingPay = payRes.rows[0];
          await client.query(
            `UPDATE payments
             SET method = COALESCE($1, method),
                 reference_number = COALESCE($2, reference_number),
                 proof_image_url = COALESCE($3, proof_image_url),
                 proof_file_hash = COALESCE($4, proof_file_hash),
                 status = 'PENDING',
                 rejection_reason = NULL
             WHERE id = $5`,
            [
              payload.method || null,
              payload.reference_number ?? null,
              payload.proof_image_url ?? null,
              payload.proof_file_hash ?? null,
              existingPay.id,
            ]
          );

          await writeTenantAuditLog(client, {
            actorId: staff.id,
            actorName: staff.full_name,
            actorRole: staff.role,
            action: 'PAYMENT_PROOF_ATTACHED',
            entity: 'order',
            entityId: id,
            oldData: {
              method: existingPay.method,
              reference_number: existingPay.reference_number,
              proof_image_url: existingPay.proof_image_url,
            },
            newData: {
              method: payload.method || existingPay.method,
              reference_number: payload.reference_number ?? existingPay.reference_number,
              proof_image_url: payload.proof_image_url ?? existingPay.proof_image_url,
            },
          });
        } else {
          const ins = await client.query(
            `INSERT INTO payments (
               order_id, method, amount, currency, reference_number, proof_image_url, proof_file_hash, status
             ) VALUES ($1, $2, $3, 'USD', $4, $5, $6, 'PENDING')
             RETURNING id`,
            [
              id,
              payload.method || 'BANK_TRANSFER',
              order.total_usd,
              payload.reference_number || null,
              payload.proof_image_url || null,
              payload.proof_file_hash || null,
            ]
          );

          await writeTenantAuditLog(client, {
            actorId: staff.id,
            actorName: staff.full_name,
            actorRole: staff.role,
            action: 'PAYMENT_PROOF_ATTACHED',
            entity: 'order',
            entityId: id,
            newData: {
              payment_id: ins.rows[0].id,
              method: payload.method || 'BANK_TRANSFER',
              reference_number: payload.reference_number || null,
              proof_image_url: payload.proof_image_url || null,
            },
          });
        }
      }
    });

    try {
      revalidatePath(`/t/${slug}/admin/orders`);
      revalidatePath(`/t/${slug}/admin/orders/${id}`);
      revalidatePath(`/t/${slug}/admin`);
    } catch {
      // ignore revalidate outside request context
    }

    const updatedDetail = await loadFullOrderDetail(tenant.db_schema_name, id);
    if (updatedDetail?.order) {
      await broadcastTenantOrderEvent(slug, {
        type: 'ORDER_UPDATED',
        orderId: id,
        orderNumber: String(updatedDetail.order.order_number || ''),
        status: String(updatedDetail.order.status || ''),
        totalUsd: Number(updatedDetail.order.total_usd || 0),
        customerName: updatedDetail.order.customer_name || undefined,
        source: 'ADMIN',
      });
    }
    return NextResponse.json({ success: true, ...updatedDetail });
  } catch (error: unknown) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar el pedido' },
      { status: 400 }
    );
  }
}
