import { pool, withTenantDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';
import { 
  CheckCircle2, Store, Phone, MapPin, 
  ArrowLeft, MessageSquare, ShieldCheck,
  Clock, CreditCard, ExternalLink, AlertTriangle
} from 'lucide-react';
import { OrderItemsModal } from './OrderItemsModal';

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
               delivery_type, delivery_address, subtotal_usd, total_usd, 
               total_secondary, exchange_rate_applied, notes, created_at
        FROM orders 
        WHERE id = $1
      `, [orderId]),
      client.query(`
        SELECT product_name, quantity, unit_price_usd, total_price_usd
        FROM order_items
        WHERE order_id = $1
      `, [orderId]),
      client.query(`
        SELECT business_name, whatsapp_number, address, phone
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
  const rate = parseFloat(order.exchange_rate_applied || '0');
  const secondaryTotal = order.total_secondary && parseFloat(order.total_secondary) > 0
    ? parseFloat(order.total_secondary)
    : rate > 0 ? totalUsd * rate : null;

  const isPendingVerification =
    order.status === 'PENDING_PAYMENT_VERIFICATION' ||
    payment?.payment_status === 'PENDING';
  const isPaymentRejected = payment?.payment_status === 'REJECTED';
  const isPaymentVerified = payment?.payment_status === 'VERIFIED';

  // Mensaje preformateado para WhatsApp (Core Agnóstico en USD)
  const cleanPhone = (settings.whatsapp_number || '').replace(/[^0-9]/g, '');
  const paymentSummaryLine = payment
    ? `\nMétodo de pago: *${payment.method_name}*${payment.reference_number ? ` (Ref: ${payment.reference_number})` : ''}`
    : '';
  const waMessage = encodeURIComponent(
    `¡Hola ${settings.business_name}! Acabo de generar el pedido *${order.order_number}* en su vitrina digital por un monto de *$${totalUsd.toFixed(2)} USD*.\n\nCliente: *${order.customer_name}*\nTeléfono: *${order.customer_phone}*\nModalidad: Retiro en Mostrador (Pick-up).${paymentSummaryLine}\n\n¿Me confirman cuando esté listo para retirar? ¡Muchas gracias!`
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
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 text-left space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-bold">Número de Orden</p>
              <p className="text-lg font-black font-mono text-[var(--tenant-primary)]">{order.order_number}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-bold">Monto Total</p>
              <p className="text-lg font-black font-mono text-slate-950 dark:text-white">
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

          {/* Modal Elegante para Evitar Scroll Infinito */}
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
              <p className="text-sm text-slate-700 dark:text-zinc-300">
                Referencia reportada:{' '}
                <span className="font-mono font-bold text-slate-950 dark:text-white">
                  {payment.reference_number}
                </span>
              </p>
            )}

            {isPaymentRejected && payment.rejection_reason && (
              <p className="text-sm text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                Motivo: {payment.rejection_reason}
              </p>
            )}

            {isPendingVerification && (
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                El equipo de {settings.business_name} confirmará tu pago y habilitará tu pedido a la brevedad.
              </p>
            )}

            {payment.proof_image_url && (
              <div className="pt-1 flex items-center gap-3">
                <a
                  href={payment.proof_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-[var(--tenant-primary)] transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={payment.proof_image_url}
                    alt="Comprobante de pago"
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-zinc-800"
                  />
                  <div className="text-left">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      Ver comprobante <ExternalLink className="w-3 h-3" />
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-zinc-400">
                      Adjunto verificado por hash
                    </span>
                  </div>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Botón WhatsApp de Acción Principal si tiene teléfono */}
        {waUrl && (
          <div className="pt-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2.5"
            >
              <MessageSquare className="w-5 h-5 fill-current" />
              <span>Enviar Comprobante por WhatsApp al Comercio</span>
            </a>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-2">
              Notifica al personal de la tienda para que prioricen el empaque de tus productos.
            </p>
          </div>
        )}
      </div>

      {/* Instrucciones de Retiro en Tienda */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200/80 dark:border-zinc-800 space-y-4 shadow-xs">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
          <Store className="w-4 h-4 text-lime-600 dark:text-lime-400" />
          Punto de Retiro
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
