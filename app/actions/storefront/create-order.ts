'use server';

import { pool, withTenantDb } from '@/lib/db';
import { fetchTenantPaymentMethods, writeTenantAuditLog } from '@/lib/payment-methods';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { invalidateTenantCache } from '@/lib/tenant';
import { broadcastTenantOrderEvent } from '@/lib/realtime/tenant-orders-channel';

const CartItemSchema = z.object({
  product_id: z.string().min(1, 'ID de producto inválido'),
  product_name: z.string(),
  quantity: z.number().int().positive(),
  unit_price_usd: z.number().positive(),
});

const CheckoutSchema = z.object({
  slug: z.string().min(1),
  customer_name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  customer_phone: z.string().min(7, 'El teléfono es requerido para coordinar la entrega'),
  customer_id_number: z.string().optional().default('N/A'),
  payment_method: z.string().trim().min(2, 'Selecciona un método de pago').max(50),
  payment_reference: z.string().trim().max(100).optional(),
  bank_source: z.string().trim().max(100).optional(),
  proof_image_url: z.string().trim().max(500).optional(),
  proof_file_hash: z.string().trim().max(128).optional(),
  notes: z.string().optional(),
  items: z.array(CartItemSchema).min(1, 'El carrito no puede estar vacío'),
});

export type CheckoutFormData = z.infer<typeof CheckoutSchema>;

export async function createStorefrontOrder(data: CheckoutFormData) {
  try {
    const validated = CheckoutSchema.safeParse(data);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues.map((i) => i.message).join('. '),
      };
    }

    const { 
      slug, 
      customer_name, 
      customer_phone, 
      customer_id_number, 
      payment_method, 
      payment_reference,
      bank_source,
      proof_image_url,
      proof_file_hash,
      notes, 
      items 
    } = validated.data;

    // 1. Obtener datos del tenant y plugins activos
    const tRes = await pool.query(
      `SELECT id, name, db_schema_name, status, COALESCE(storefront_enabled, true) AS storefront_enabled
       FROM platform.tenants WHERE slug = $1 AND status IN ('active', 'trial')`,
      [slug]
    );

    if (tRes.rowCount === 0) {
      return { success: false, error: 'Comercio no encontrado o inactivo' };
    }

    const tenant = tRes.rows[0];
    if (tenant.storefront_enabled === false) {
      return {
        success: false,
        error: 'La vitrina digital pública de este comercio está deshabilitada.',
      };
    }
    const pluginsRes = await pool.query(
      `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
      [tenant.id]
    );
    const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);

    // 2. Validar sucursal y método de pago habilitado en el esquema del tenant
    const { storeId, storeAddress, selectedMethod } = await withTenantDb(
      tenant.db_schema_name,
      null,
      async (client) => {
        const [sRes, storeRes, methods] = await Promise.all([
          client.query(`SELECT address FROM settings WHERE key = 'general' LIMIT 1`),
          client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`),
          fetchTenantPaymentMethods(client, {
            activePlugins,
            onlyActive: true,
            channel: 'storefront',
          }),
        ]);

        const matched = methods.find((m) => m.code === payment_method) || null;
        return {
          storeId: storeRes.rows[0]?.id || null,
          storeAddress: sRes.rows[0]?.address || 'Sede Principal del Comercio',
          selectedMethod: matched,
        };
      }
    );

    if (!storeId) {
      return { success: false, error: 'No se encontró una sucursal activa para despachar el pedido' };
    }

    if (!selectedMethod) {
      return { success: false, error: 'El método de pago seleccionado no está habilitado en este comercio' };
    }

    if (selectedMethod.requires_reference && (!payment_reference || payment_reference.trim().length < 4)) {
      return {
        success: false,
        error: `El método "${selectedMethod.name}" requiere un número de referencia de al menos 4 caracteres.`,
      };
    }

    if (selectedMethod.requires_proof && !proof_image_url) {
      return {
        success: false,
        error: `El método "${selectedMethod.name}" requiere adjuntar la captura del comprobante de pago.`,
      };
    }

    // 3. Preparar payload para la RPC transaccional canónica (Core Agnóstico en USD)
    const totalUsd = items.reduce((sum, item) => sum + item.unit_price_usd * item.quantity, 0);
    const subtotalUsd = Number(totalUsd.toFixed(2));

    const orderPayload = {
      store_id: storeId,
      customer_name,
      customer_phone,
      customer_id_number,
      delivery_type: 'PICKUP',
      delivery_address: storeAddress,
      subtotal_usd: subtotalUsd,
      discount_usd: 0.00,
      tax_usd: 0.00,
      shipping_usd: 0.00,
      total_usd: subtotalUsd,
      total_secondary: null,
      exchange_rate_applied: 1.0,
      is_offline_sale: false,
      notes: notes || 'Pedido desde Vitrina Digital (Pick-up en USD)',
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price_usd: i.unit_price_usd,
        total_price_usd: Number((i.unit_price_usd * i.quantity).toFixed(2)),
      })),
      payment: {
        method: selectedMethod.code,
        amount: subtotalUsd,
        currency: 'USD',
        reference_number: payment_reference || undefined,
        proof_image_url: proof_image_url || undefined,
        proof_file_hash: proof_file_hash || undefined,
        bank_source: bank_source || undefined,
      },
    };

    // 4. Invocar la RPC canónica atómica (incluye validación antifraude si hay proof_file_hash)
    const rpcRes = await pool.query(
      `SELECT platform.rpc_core_create_order($1, $2::jsonb) as result`,
      [tenant.db_schema_name, JSON.stringify(orderPayload)]
    );

    const result = rpcRes.rows[0]?.result;

    if (!result || !result.success) {
      return {
        success: false,
        error: result?.error || 'No se pudo crear la orden en el core transaccional',
      };
    }

    // 5. Si el método requiere comprobante o referencia, marcar orden en verificación de pago y registrar auditoría inicial
    const needsVerification =
      selectedMethod.requires_reference || selectedMethod.requires_proof || Boolean(proof_image_url);

    await withTenantDb(tenant.db_schema_name, null, async (client) => {
      if (needsVerification) {
        await client.query(
          `UPDATE orders SET status = 'PENDING_PAYMENT_VERIFICATION', updated_at = now() WHERE id = $1`,
          [result.order_id]
        );
      }

      await writeTenantAuditLog(client, {
        actorName: customer_name,
        actorRole: 'CUSTOMER_WEB',
        action: 'ORDER_CREATED',
        entity: 'order',
        entityId: result.order_id,
        newData: {
          order_number: result.order_number,
          status: needsVerification ? 'PENDING_PAYMENT_VERIFICATION' : 'CREATED',
          total_usd: result.total_usd,
          payment_method: selectedMethod.code,
          payment_method_name: selectedMethod.name,
          reference_number: payment_reference || null,
          has_proof: Boolean(proof_image_url),
        },
      });
    });

    // 6. Emitir evento Realtime hacia los paneles Admin conectados
    await broadcastTenantOrderEvent(slug, {
      type: 'ORDER_CREATED',
      orderId: result.order_id,
      orderNumber: result.order_number,
      status: needsVerification ? 'PENDING_PAYMENT_VERIFICATION' : 'CREATED',
      totalUsd: Number(result.total_usd || subtotalUsd),
      customerName: customer_name,
      paymentMethodName: selectedMethod.name,
      source: 'STOREFRONT',
      needsVerification,
      hasProof: Boolean(proof_image_url),
    });

    // 7. Invalidar caches relevantes si estamos en un contexto de request Next.js
    invalidateTenantCache(slug, 'catalog');
    try {
      revalidatePath(`/t/${slug}/admin`);
      revalidatePath(`/t/${slug}/admin/orders`);
      revalidatePath(`/t/${slug}/admin/inventory`);
    } catch {
      // Ignorado de forma segura cuando se invoca fuera del servidor Next.js
    }

    return {
      success: true,
      orderId: result.order_id,
      orderNumber: result.order_number,
      totalUsd: result.total_usd,
    };
  } catch (error: unknown) {
    console.error('Error in createStorefrontOrder:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error inesperado al procesar la orden',
    };
  }
}
