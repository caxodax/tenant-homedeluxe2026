'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Printer, 
  Share2, 
  Copy, 
  Edit3,
  Check, 
  X, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Building2, 
  Phone, 
  User, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface QuoteDetailViewProps {
  slug: string;
  currentUser: { id: string; role: string; full_name: string };
  quote: {
    id: string;
    quote_number: string;
    sales_rep_id: string;
    sales_rep_name: string | null;
    sales_rep_phone: string | null;
    customer_id: string | null;
    customer_name: string;
    customer_id_number: string | null;
    customer_whatsapp: string;
    customer_email: string | null;
    status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'REJECTED' | 'EXPIRED';
    items_subtotal_primary: string | number;
    additional_services_primary: string | number;
    additional_services_note: string | null;
    subtotal_primary: string | number;
    discount_primary: string | number;
    tax_primary: string | number;
    total_primary: string | number;
    total_secondary: string | number | null;
    exchange_rate_applied: string | number | null;
    internal_notes: string | null;
    customer_notes: string | null;
    expires_at: string | null;
    converted_order_id: string | null;
    converted_order_number: string | null;
    created_at: string;
    updated_at: string;
  };
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    quantity: number | string;
    unit_price_primary: number | string;
    total_price_primary: number | string;
    notes: string | null;
    sku: string | null;
  }>;
  settings: {
    business_name?: string | null;
    logo_url?: string | null;
    phone?: string | null;
    address?: string | null;
    primary_currency?: string | null;
    secondary_currency?: string | null;
    exchange_rate?: string | number | null;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-zinc-800 dark:text-zinc-300' },
  SENT: { label: 'Enviada', className: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300' },
  ACCEPTED: { label: 'Aceptada', className: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300' },
  CONVERTED: { label: 'Convertida (Pedido)', className: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300' },
  REJECTED: { label: 'Rechazada', className: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300' },
  EXPIRED: { label: 'Expirada', className: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300' },
};

export function QuoteDetailView({
  slug,
  currentUser,
  quote: initialQuote,
  items,
  settings,
}: QuoteDetailViewProps) {
  const router = useRouter();
  const [quote, setQuote] = useState(initialQuote);
  const [acting, setActing] = useState(false);

  const primaryCurrency = settings?.primary_currency || 'USD';
  const secondaryCurrency = settings?.secondary_currency || 'BS';
  const rate = parseFloat(String(settings?.exchange_rate || '1.0000'));

  const totalPrimary = parseFloat(String(quote.total_primary));
  const totalSecondary = rate > 0 ? (totalPrimary * rate).toFixed(2) : null;
  const isClosed = quote.status === 'CONVERTED' || quote.status === 'REJECTED' || quote.status === 'EXPIRED';

  const handleStatusChange = async (newStatus: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quote.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cambiar estado');

      toast.success(`Estado actualizado a ${STATUS_MAP[newStatus]?.label || newStatus}`);
      setQuote((prev) => ({ ...prev, status: newStatus as any }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar estado');
    } finally {
      setActing(false);
    }
  };

  const handleDuplicate = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quote.id}/duplicate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al duplicar');

      toast.success(`Cotización duplicada con éxito (${data.quote_number})`);
      router.push(`/t/${slug}/admin/sales/quotes/${data.quote_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al duplicar');
    } finally {
      setActing(false);
    }
  };

  const handleConvertToOrder = async () => {
    if (!confirm(`¿Deseas convertir la cotización ${quote.quote_number} en un pedido facturado en el POS?`)) return;

    setActing(true);
    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quote.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al convertir');

      toast.success(`¡Pedido ${data.order_number} generado con éxito!`);
      setQuote((prev) => ({
        ...prev,
        status: 'CONVERTED',
        converted_order_id: data.order_id,
        converted_order_number: data.order_number,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir en pedido');
    } finally {
      setActing(false);
    }
  };

  const buildWhatsAppLink = () => {
    const phone = quote.customer_whatsapp.replace(/\D/g, '');
    const total = totalPrimary.toFixed(2);
    
    let msg = `Hola *${quote.customer_name}*, te compartimos tu presupuesto *${quote.quote_number}* de *${settings?.business_name || 'Home Deluxe'}*:\n\n`;
    items.forEach((it, idx) => {
      msg += `${idx + 1}. *${it.product_name}* x${it.quantity} = $${(parseFloat(String(it.total_price_primary))).toFixed(2)}\n`;
    });

    if (parseFloat(String(quote.additional_services_primary)) > 0) {
      msg += `+ *${quote.additional_services_note || 'Servicios Adicionales'}:* $${parseFloat(String(quote.additional_services_primary)).toFixed(2)}\n`;
    }

    if (parseFloat(String(quote.discount_primary)) > 0) {
      msg += `- *Descuento:* -$${parseFloat(String(quote.discount_primary)).toFixed(2)}\n`;
    }

    msg += `\n💰 *Total:* $${total} ${primaryCurrency}`;
    if (totalSecondary) msg += ` (Bs. ${totalSecondary})`;

    if (quote.expires_at) {
      const expDate = new Date(quote.expires_at).toLocaleDateString('es-VE');
      msg += `\n⏳ *Válido hasta:* ${expDate}`;
    }

    msg += `\n\n¿Deseas confirmar este pedido para proceder a prepararlo? ¡Quedamos atentos!`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  const st = STATUS_MAP[quote.status] || { label: quote.status, className: '' };

  return (
    <div className="space-y-6">
      {/* Barra de Acciones (Oculta en Impresión) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden border-b border-stone-200/80 dark:border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <Link href={`/t/${slug}/admin/sales/quotes`}>
            <Button variant="outline" size="sm" className="h-9 px-2.5">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Cotizaciones
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-stone-950 dark:text-white font-mono">
                {quote.quote_number}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${st.className}`}>
                {st.label}
              </span>
            </div>
            {quote.converted_order_number && (
              <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                Convertido en Pedido: <span className="font-mono">{quote.converted_order_number}</span>
              </p>
            )}
          </div>
        </div>

        {/* Botonera de Acción */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="text-xs font-bold"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Imprimir / PDF
          </Button>

          <a
            href={buildWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
          >
            <Share2 className="w-4 h-4 mr-1.5" />
            Enviar WhatsApp
          </a>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={acting}
            className="text-xs font-bold"
          >
            <Copy className="w-4 h-4 mr-1.5" />
            Duplicar
          </Button>

          {/* Editar Cotización mientras esté en Borrador o Enviada */}
          {(quote.status === 'DRAFT' || quote.status === 'SENT') && (
            <Link href={`/t/${slug}/admin/sales/quotes/${quote.id}/edit`}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs font-bold text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              >
                <Edit3 className="w-4 h-4 mr-1.5" />
                Editar Cotización
              </Button>
            </Link>
          )}

          {!isClosed && (
            <>
              {quote.status === 'DRAFT' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange('SENT')}
                  disabled={acting}
                  className="text-xs font-bold text-blue-600"
                >
                  Marcar Enviada
                </Button>
              )}

              {quote.status === 'SENT' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange('ACCEPTED')}
                  disabled={acting}
                  className="text-xs font-bold text-emerald-600"
                >
                  Marcar Aceptada
                </Button>
              )}

              <Button
                type="button"
                size="sm"
                onClick={handleConvertToOrder}
                disabled={acting}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Convertir a Pedido
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Comprobante Oficial Imprimible */}
      <div className="p-8 sm:p-12 rounded-3xl border border-stone-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#141416] shadow-sm print:shadow-none print:border-none print:p-0 space-y-8 text-stone-900 dark:text-zinc-100">
        {/* Cabecera del Documento */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-stone-200 dark:border-zinc-800 pb-6">
          <div className="space-y-1.5">
            {settings?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo_url}
                alt={settings.business_name || 'Comercio'}
                className="h-14 max-w-[200px] object-contain mb-2"
              />
            ) : (
              <h2 className="text-xl font-extrabold text-stone-950 dark:text-white">
                {settings?.business_name || 'Home Deluxe'}
              </h2>
            )}
            {settings?.address && (
              <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm">
                📍 {settings.address}
              </p>
            )}
            {settings?.phone && (
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                📞 {settings.phone}
              </p>
            )}
          </div>

          <div className="text-left sm:text-right space-y-1">
            <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest block">
              PRESUPUESTO / COTIZACIÓN
            </span>
            <p className="font-mono font-black text-2xl text-stone-950 dark:text-white">
              {quote.quote_number}
            </p>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Fecha de emisión: {new Date(quote.created_at).toLocaleDateString('es-VE')}
            </p>
            {quote.expires_at && (
              <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                Válido hasta: {new Date(quote.expires_at).toLocaleDateString('es-VE')}
              </p>
            )}
          </div>
        </div>

        {/* Fila Cliente & Asesor */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 rounded-2xl bg-stone-50/70 dark:bg-zinc-900/40 border border-stone-100 dark:border-zinc-800/60 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-wider block">
              Cliente
            </span>
            <p className="font-extrabold text-sm text-stone-900 dark:text-white">
              {quote.customer_name}
            </p>
            {quote.customer_id_number && (
              <p className="text-stone-600 dark:text-zinc-400">
                Doc. Identidad: <span className="font-mono font-bold">{quote.customer_id_number}</span>
              </p>
            )}
            <p className="text-stone-600 dark:text-zinc-400">
              WhatsApp: <span className="font-mono font-bold">{quote.customer_whatsapp}</span>
            </p>
            {quote.customer_email && (
              <p className="text-stone-600 dark:text-zinc-400">
                Email: {quote.customer_email}
              </p>
            )}
          </div>

          <div className="space-y-1 sm:text-right">
            <span className="text-[10px] font-extrabold uppercase text-stone-400 tracking-wider block">
              Asesor Comercial
            </span>
            <p className="font-bold text-stone-900 dark:text-white">
              {quote.sales_rep_name || 'Venta Directa'}
            </p>
            {quote.sales_rep_phone && (
              <p className="text-stone-600 dark:text-zinc-400">
                Contacto: {quote.sales_rep_phone}
              </p>
            )}
            <p className="text-[11px] text-stone-400">
              Precios sujetos a disponibilidad de inventario
            </p>
          </div>
        </div>

        {/* Tabla de Productos */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-stone-200 dark:border-zinc-800 text-[11px] font-extrabold uppercase text-stone-500 dark:text-zinc-400">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Descripción</th>
                <th className="py-2.5 px-3 text-center">Cant</th>
                <th className="py-2.5 px-3 text-right">P. Unitario</th>
                <th className="py-2.5 px-3 text-right">Total ({primaryCurrency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-zinc-800/60">
              {items.map((it, idx) => {
                const uPrice = parseFloat(String(it.unit_price_primary)).toFixed(2);
                const lTotal = parseFloat(String(it.total_price_primary)).toFixed(2);
                return (
                  <tr key={it.id}>
                    <td className="py-3 px-3 text-stone-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-stone-900 dark:text-white">{it.product_name}</p>
                      {it.sku && <span className="text-[10px] text-stone-400 font-mono">SKU: {it.sku}</span>}
                      {it.notes && (
                        <p className="text-[11px] text-stone-500 dark:text-zinc-400 italic mt-0.5">
                          Nota: {it.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold">{it.quantity}</td>
                    <td className="py-3 px-3 text-right font-mono">${uPrice}</td>
                    <td className="py-3 px-3 text-right font-mono font-black">${lTotal}</td>
                  </tr>
                );
              })}

              {/* Renglón de Servicios Adicionales */}
              {parseFloat(String(quote.additional_services_primary)) > 0 && (
                <tr className="bg-amber-50/40 dark:bg-amber-950/20">
                  <td className="py-3 px-3 text-amber-500 font-mono text-[11px]">+</td>
                  <td className="py-3 px-3" colSpan={3}>
                    <p className="font-bold text-amber-900 dark:text-amber-300">
                      Servicios Adicionales
                    </p>
                    {quote.additional_services_note && (
                      <p className="text-[11px] text-amber-800 dark:text-amber-400">
                        {quote.additional_services_note}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-black text-amber-900 dark:text-amber-300">
                    ${parseFloat(String(quote.additional_services_primary)).toFixed(2)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Desglose de Totales */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-t-2 border-stone-200 dark:border-zinc-800 pt-6">
          <div className="max-w-sm space-y-2 text-xs">
            {quote.customer_notes && (
              <div>
                <span className="font-bold text-stone-800 dark:text-zinc-200 block mb-0.5">
                  Términos & Observaciones:
                </span>
                <p className="text-stone-600 dark:text-zinc-400 text-[11px] whitespace-pre-line leading-relaxed">
                  {quote.customer_notes}
                </p>
              </div>
            )}
            <p className="text-[10px] text-stone-400 mt-2">
              * Este documento no constituye una factura fiscal. Validez sujeta a los términos descritos.
            </p>
          </div>

          <div className="w-full sm:w-64 space-y-2 text-xs">
            <div className="flex justify-between text-stone-600 dark:text-zinc-400">
              <span>Subtotal:</span>
              <span className="font-mono font-bold text-stone-900 dark:text-white">
                ${parseFloat(String(quote.subtotal_primary)).toFixed(2)}
              </span>
            </div>

            {parseFloat(String(quote.discount_primary)) > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Descuento aplicado:</span>
                <span className="font-mono">-${parseFloat(String(quote.discount_primary)).toFixed(2)}</span>
              </div>
            )}

            <div className="pt-2 border-t-2 border-stone-200 dark:border-zinc-800 space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="font-extrabold text-sm text-stone-900 dark:text-white">
                  Total Final:
                </span>
                <span className="font-mono font-black text-2xl text-stone-950 dark:text-white">
                  ${totalPrimary.toFixed(2)} {primaryCurrency}
                </span>
              </div>

              {totalSecondary && (
                <div className="text-right text-xs font-mono font-bold text-stone-500 dark:text-zinc-400">
                  Equivalente: Bs. {totalSecondary}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
