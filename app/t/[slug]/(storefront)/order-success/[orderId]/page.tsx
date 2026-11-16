import { pool, withTenantDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';
import { 
  CheckCircle2, Store, Phone, MapPin, 
  ArrowLeft, MessageSquare, ShieldCheck,
  Clock, CreditCard, ExternalLink, AlertTriangle,
  Bike, Navigation
} from 'lucide-react';
import { OrderItemsModal } from './OrderItemsModal';
import { CopyOrderButton } from './CopyOrderButton';

export const dynamic = 'force-dynamic';

async function getOrderDetails(slug: string, orderId: string) {
  const tRes = await pool.query(
    `SELECT db_schema_name, name FROM platform.tenants WHERE slug = $1 AND status IN ('active', 'trial')`,
    [slug]
  );
  if (tRes.rowCount === 0) return null;

  const { db_schema_name, name } = tRes.rows[0];

  return withTenantDb(db_schema_name, null, async (client) => {
    const [orderRes, itemsRes, settingsRes, paymentRes] = await Promise.all([
      client.query(`
        SELECT id, order_number, customer_name, customer_phone, status, 
               delivery_type, delivery_address,
               shipping_primary, shipping_primary as shipping_usd,
               subtotal_primary, subtotal_primary as subtotal_usd, 
               total_primary, total_primary as total_usd, 
               total_secondary, exchange_rate_applied, notes, created_at
        FROM orders 
        WHERE id = $1
      `, [orderId]),
      client.query(`
        SELECT product_name, quantity, 
               unit_price_primary, unit_price_primary as unit_price_usd, 
               total_price_primary, total_price_primary as total_price_usd
        FROM order_items
        WHERE order_id = $1
      `, [orderId]),
      client.query(`
        SELECT business_name, whatsapp_number, address, phone, exchange_rate
        FROM settings 
        WHERE key = 'general' 
        LIMIT 1
      `),
      client.query(`
        SELECT p.id, p.method, COALESCE(pm.name, p.method) AS method_name,
               p.amount, p.currency, p.reference_number, p.proof_image_url,
               p.status AS payment_status, p.rejection_reason
        FROM payments p
        LEFT JOIN payment_methods pm ON pm.code = p.method
        WHERE p.order_id = $1
        ORDER BY p.created_at DESC
        LIMIT 1
      `, [orderId]),
    ]);

    if (orderRes.rowCount === 0) return null;

    return {
      order: orderRes.rows[0],
      items: itemsRes.rows,
      payment: paymentRes.rows[0] || null,
      settings: settingsRes.rows[0] || {
        business_name: name,
        whatsapp_number: TENANT_DEFAULTS.SUPPORT_WHATSAPP || null,
        address: 'Dirección del comercio',
        phone: null,
        exchange_rate: '0',
      },
    };
  });
}

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const data = await getOrderDetails(slug, orderId);

  if (!data) notFound();

  const { order, items, payment, settings } = data;
  const totalUsd = parseFloat(order.total_usd);
  const rawRate = parseFloat(order.exchange_rate_applied || '0');
  const storeRate = parseFloat(settings.exchange_rate || '0');
  const rate = rawRate > 1.01 ? rawRate : (storeRate > 1.01 ? storeRate : 0);
  const secondaryTotal = order.total_secondary && parseFloat(order.total_secondary) > 0
    ? parseFloat(order.total_secondary)
    : rate > 0 ? totalUsd * rate : null;

  const isDelivery = order.delivery_type === 'DELIVERY';
  const shippingAmount = parseFloat(order.shipping_usd || '0');
  const refMatch = (order.notes || '').match(/\[Ref:\s*([^\]]+)\]/i);
  const deliveryReferencePoint = refMatch ? refMatch[1] : null;

  const isPendingVerification =
    order.status === 'PENDING_PAYMENT_VERIFICATION' ||
    payment?.payment_status === 'PENDING';
  const isPaymentRejected = payment?.payment_status === 'REJECTED';
  const isPaymentVerified = payment?.payment_status === 'VERIFIED';

  // Mensaje preformateado para WhatsApp dinámico (Delivery vs Pick-up)
  const cleanPhone = (settings.whatsapp_number || '').replace(/[^0-9]/g, '');
  const paymentSummaryLine = payment
    ? `\nMétodo de pago: *${payment.method_name}*${payment.reference_number ? ` (Ref: ${payment.reference_number})` : ''}`
    : '';

  const modalityLine = isDelivery
    ? `Modalidad: *🛵 Despacho a Domicilio (Delivery)*\nDirección de Entrega: *${order.delivery_address || 'Dirección indicada'}*${deliveryReferencePoint ? `\nPunto de Ref: ${deliveryReferencePoint}` : ''}${shippingAmount > 0 ? `\nFlete Delivery: $${shippingAmount.toFixed(2)} USD` : ''}`
    : `Modalidad: *🏪 Retiro en Mostrador (Pick-up)*`;

  const waClosingLine = isDelivery
    ? `¿Me confirman la recepción de la comanda para el despacho a domicilio? ¡Muchas gracias!`
    : `¿Me confirman cuando esté listo para retirar en mostrador? ¡Muchas gracias!`;

  const waMessage = encodeURIComponent(
    `¡Hola ${settings.business_name}! Acabo de generar el pedido *${order.order_number}* en su vitrina digital por un monto de *$${totalUsd.toFixed(2)} USD*.\n\nCliente: *${order.customer_name}*\nTeléfono: *${order.customer_phone}*\n${modalityLine}.${paymentSummaryLine}\n\n${waClosingLine}`
  );
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waMessage}` : null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Tarjeta de Confirmación de Éxito */}
      <div className="p-8 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200/80 dark:border-zinc-800 text-center space-y-4 shadow-sm">
        <div
          className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto ${
            isPaymentRejected
              ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
              : order.status === 'PENDING_PAYMENT_VERIFICATION'
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {order.status === 'PENDING_PAYMENT_VERIFICATION' ? (
            <Clock className="w-9 h-9 stroke-[2.2]" />
          ) : isPaymentRejected ? (
            <AlertTriangle className="w-9 h-9 stroke-[2.2]" />
          ) : (
            <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
          )}
        </div>

        <div>
          {isPaymentRejected ? (
            <span className="text-xs font-mono font-bold uppercase px-3 py-1 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
              Pago Rechazado
            </span>
          ) : order.status === 'PENDING_PAYMENT_VERIFICATION' ? (
            <span className="text-xs font-mono font-bold uppercase px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30">
              En Verificación de Pago
            </span>
          ) : (
            <span className="text-xs font-mono font-bold uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
              Pedido Registrado
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight mt-2.5">
            {order.status === 'PENDING_PAYMENT_VERIFICATION'
              ? '¡Pedido recibido, validando tu pago!'
              : '¡Gracias por tu compra!'}
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1.5">
            Tu orden ha sido registrada exitosamente en <strong className="text-slate-950 dark:text-white">{settings.business_name}</strong>.
          </p>
        </div>

        {/* Resumen del Correlativo y Detalle Bimonetario */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 text-left space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-bold">Número de Orden</span>
                <CopyOrderButton orderNumber={order.order_number} />
              </div>
              <p className="text-xl sm:text-2xl font-black font-mono text-[var(--tenant-primary)] tracking-wide">
                {order.order_number}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-bold">Monto Total</p>
              <p className="text-xl sm:text-2xl font-black font-mono text-slate-950 dark:text-white">
                ${totalUsd.toFixed(2)} USD
              </p>
              {secondaryTotal && (
                <p className="text-xs font-mono font-bold text-slate-600 dark:text-zinc-400">
                  Bs. {secondaryTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {rate > 0 && <span className="text-[10px] text-slate-500 font-normal"> (Tasa: {rate.toFixed(2)})</span>}
                </p>
              )}
            </div>
          </div>

          {/* Desglose resumido de envío si aplica */}
          {isDelivery && shippingAmount > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-zinc-800 text-xs">
              <span className="text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Incluye flete de delivery a domicilio:
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                +${shippingAmount.toFixed(2)} USD
              </span>
            </div>
          )}

          {/* Modal Elegante para Ver Productos */}
          <OrderItemsModal
            orderNumber={order.order_number}
            items={items}
            totalUsd={totalUsd}
            totalSecondary={secondaryTotal}
            exchangeRate={rate}
          />
        </div>

        {/* Estado de Pago y Comprobante */}
        {payment && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 text-left space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[var(--tenant-primary)]" />
                <span className="text-sm font-bold text-slate-950 dark:text-white">
                  {payment.method_name}
                </span>
              </div>
              {isPaymentVerified ? (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                  Verificado
                </span>
              ) : isPaymentRejected ? (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-800 dark:text-red-300 border border-red-500/30">
                  Rechazado
                </span>
              ) : (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  En verificación
                </span>
              )}
            </div>

            {payment.reference_number && (
              <p className="text-xs text-slate-700 dark:text-zinc-300 font-mono">
                Referencia reportada: <strong>{payment.reference_number}</strong>
              </p>
            )}

            {payment.proof_image_url && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/80">
                <a
                  href={payment.proof_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--tenant-primary)] hover:underline font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ver Comprobante Adjunto</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* CTA Enviar Comprobante / Notificación por WhatsApp */}
        {waUrl && (
          <div className="pt-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] text-white font-extrabold text-sm sm:text-base shadow-sm transition-all"
            >
              <MessageSquare className="w-5 h-5 fill-current" />
              <span>Enviar Comprobante por WhatsApp al Comercio</span>
            </a>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-2">
              Notifica al personal de la tienda para que prioricen el despacho o empaque de tus productos.
            </p>
          </div>
        )}
      </div>

      {/* Tarjeta Dinámica: Delivery vs Punto de Retiro */}
      {isDelivery ? (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-emerald-500/30 dark:border-emerald-500/20 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
              <Bike className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Despacho a Domicilio (Delivery)
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              En espera de despacho
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5 text-slate-800 dark:text-zinc-200">
              <MapPin className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div>
                <strong className="block text-zinc-900 dark:text-white text-sm mb-0.5">
                  Dirección de Entrega:
                </strong>
                <p className="text-slate-600 dark:text-zinc-300 text-sm font-medium">
                  {order.delivery_address || 'Dirección acordada con el cliente'}
                </p>
              </div>
            </div>

            {deliveryReferencePoint && (
              <div className="flex items-start gap-2.5 text-slate-600 dark:text-zinc-400 pl-6">
                <Navigation className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
                <span><strong>Punto de Referencia:</strong> {deliveryReferencePoint}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium pt-2 border-t border-slate-100 dark:border-zinc-800/80">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                El repartidor asignado te contactará al <strong>{order.customer_phone}</strong> al momento de llegar.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200/80 dark:border-zinc-800 space-y-4 shadow-xs">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
            <Store className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            Punto de Retiro en Tienda
          </h2>

          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2 text-slate-600 dark:text-zinc-300">
              <MapPin className="w-4 h-4 shrink-0 text-lime-600 dark:text-lime-400 mt-0.5" />
              <span><strong>Dirección:</strong> {settings.address}</span>
            </div>
            {settings.phone && (
              <div className="flex items-center gap-2 text-slate-600 dark:text-zinc-300">
                <Phone className="w-4 h-4 text-slate-400" />
                <span><strong>Teléfono:</strong> {settings.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Indica tu número de orden <strong>{order.order_number}</strong> o tu nombre al llegar al mostrador.</span>
            </div>
          </div>
        </div>
      )}

      {/* Navegación final */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <Link
          href={`/t/${slug}`}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold text-xs transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a la Vitrina Digital</span>
        </Link>
      </div>
    </div>
  );
}
