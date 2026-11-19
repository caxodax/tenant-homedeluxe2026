'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Share2, 
  Copy, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ChevronRight, 
  Calendar, 
  User, 
  Phone, 
  DollarSign, 
  ArrowRight, 
  AlertCircle,
  Eye,
  Check,
  Send,
  MoreVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export interface QuoteItemRow {
  id: string;
  quote_number: string;
  sales_rep_id: string;
  sales_rep_name: string | null;
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
  items_count: number;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Borrador', className: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-zinc-800 dark:text-zinc-300' },
  SENT: { label: 'Enviada', className: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300' },
  ACCEPTED: { label: 'Aceptada', className: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300' },
  CONVERTED: { label: 'Convertida (Pedido)', className: 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300' },
  REJECTED: { label: 'Rechazada', className: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300' },
  EXPIRED: { label: 'Expirada', className: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300' },
};

export function QuotesManager({
  slug,
  currentUser,
  isPluginActive,
  salesReps,
  primaryCurrency,
  secondaryCurrency,
  exchangeRate,
}: {
  slug: string;
  currentUser: { id: string; role: string; full_name: string };
  isPluginActive: boolean;
  salesReps: Array<{ id: string; full_name: string; email: string; role: string }>;
  primaryCurrency: string;
  secondaryCurrency: string;
  exchangeRate: number;
}) {
  const [quotes, setQuotes] = useState<QuoteItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [repFilter, setRepFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (statusFilter !== 'ALL') sp.set('status', statusFilter);
      if (repFilter !== 'ALL') sp.set('rep_id', repFilter);
      if (search.trim()) sp.set('search', search.trim());
      sp.set('page', String(page));
      sp.set('pageSize', '15');

      const res = await fetch(`/api/admin/${slug}/sales/quotes?${sp.toString()}`);
      if (!res.ok) throw new Error('Error al cargar cotizaciones');
      const data = await res.json();

      setQuotes(data.quotes || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalCount(data.pagination?.total || 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [slug, statusFilter, repFilter, search, page]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const handleStatusChange = async (quoteId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quoteId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');

      toast.success(`Estado actualizado a ${STATUS_MAP[newStatus]?.label || newStatus}`);
      fetchQuotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar estado');
    }
  };

  const handleDuplicate = async (quoteId: string) => {
    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quoteId}/duplicate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al duplicar');

      toast.success(`Cotización duplicada con éxito (${data.quote_number})`);
      fetchQuotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al duplicar');
    }
  };

  const handleConvertToOrder = async (quoteId: string, quoteNumber: string) => {
    if (!confirm(`¿Deseas convertir la cotización ${quoteNumber} en un pedido facturado en el POS?`)) return;

    try {
      const res = await fetch(`/api/admin/${slug}/sales/quotes/${quoteId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al convertir');

      toast.success(`¡Pedido ${data.order_number} creado con éxito desde la cotización!`);
      fetchQuotes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al convertir en pedido');
    }
  };

  const buildWhatsAppLink = (quote: QuoteItemRow) => {
    const phone = quote.customer_whatsapp.replace(/\D/g, '');
    const total = parseFloat(String(quote.total_primary)).toFixed(2);
    const secTotal = exchangeRate > 0 ? (parseFloat(String(quote.total_primary)) * exchangeRate).toFixed(2) : null;
    
    let msg = `Hola *${quote.customer_name}*, te compartimos tu cotización *${quote.quote_number}* de *Home Deluxe*:\n\n`;
    msg += `📄 *Total:* $${total} ${primaryCurrency}`;
    if (secTotal) msg += ` (Bs. ${secTotal})`;
    msg += `\n📦 *Productos:* ${quote.items_count} ítem(s)\n`;
    if (quote.expires_at) {
      const expDate = new Date(quote.expires_at).toLocaleDateString('es-VE');
      msg += `⏳ *Válido hasta:* ${expDate}\n`;
    }
    msg += `\nPuedes ver el detalle completo en este enlace o escribirnos para confirmar tu pedido.\n¡Estamos a tu orden!`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-950 dark:text-white tracking-tight">
            Cotizaciones & Preórdenes
          </h1>
          <p className="text-sm text-stone-600 dark:text-zinc-400 mt-1">
            Genera presupuestos con validez comercial, envíalos directo a WhatsApp y conviértelos a ventas en 1 click.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href={`/t/${slug}/admin/sales/reps`}>
            <Button variant="outline" className="text-xs font-semibold">
              <User className="w-4 h-4 mr-1.5" />
              Ver Vendedores
            </Button>
          </Link>
          <Link href={`/t/${slug}/admin/sales/quotes/new`}>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva Cotización
            </Button>
          </Link>
        </div>
      </div>

      {!isPluginActive && (
        <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex items-start justify-between gap-3 text-amber-900 dark:text-amber-200 text-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Módulo Vendedores y Comisiones inactivo</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Para que las cotizaciones puedan convertirse en órdenes y liquidar comisiones, activa el plugin.
              </p>
            </div>
          </div>
          <Link href={`/t/${slug}/admin/settings?tab=plugins`}>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0">
              Activar Plugin
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Buscador */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Buscar por correlativo COT-, cliente o WhatsApp..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 text-xs"
            />
          </div>

          {/* Filtro Estado */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-stone-900 dark:text-zinc-100"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="DRAFT">Borradores (DRAFT)</option>
              <option value="SENT">Enviadas (SENT)</option>
              <option value="ACCEPTED">Aceptadas (ACCEPTED)</option>
              <option value="CONVERTED">Convertidas a Pedido</option>
              <option value="EXPIRED">Expiradas</option>
              <option value="REJECTED">Rechazadas</option>
            </select>
          </div>

          {/* Filtro Vendedor */}
          <div>
            <select
              value={repFilter}
              onChange={(e) => {
                setRepFilter(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-stone-900 dark:text-zinc-100"
            >
              <option value="ALL">Todos los Vendedores</option>
              {salesReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} ({r.role})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Cotizaciones */}
      {loading ? (
        <div className="p-12 text-center text-xs text-stone-500 dark:text-zinc-400">
          Cargando cotizaciones...
        </div>
      ) : quotes.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-stone-300 dark:border-zinc-800 bg-white dark:bg-[#141416]">
          <FileText className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <h3 className="font-bold text-stone-900 dark:text-white text-base">No se encontraron cotizaciones</h3>
          <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto mt-1 mb-4">
            {search || statusFilter !== 'ALL' || repFilter !== 'ALL'
              ? 'Prueba modificando los filtros de búsqueda.'
              : 'Empieza creando una nueva cotización para tus clientes.'}
          </p>
          <Link href={`/t/${slug}/admin/sales/quotes/new`}>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              Crear Primera Cotización
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Vista Tabla Desktop */}
          <div className="hidden md:block rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200/80 dark:border-zinc-800/80 bg-stone-50/50 dark:bg-zinc-900/40 text-[11px] font-extrabold uppercase text-stone-500 dark:text-zinc-400 tracking-wider">
                    <th className="py-3 px-4">Correlativo</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Vendedor</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Total ({primaryCurrency})</th>
                    <th className="py-3 px-4">Validez / Creado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-zinc-800/60 text-xs">
                  {quotes.map((q) => {
                    const total = parseFloat(String(q.total_primary)).toFixed(2);
                    const st = STATUS_MAP[q.status] || { label: q.status, className: '' };
                    const isClosed = q.status === 'CONVERTED' || q.status === 'REJECTED' || q.status === 'EXPIRED';

                    return (
                      <tr key={q.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            href={`/t/${slug}/admin/sales/quotes/${q.id}`}
                            className="font-mono font-black text-stone-950 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition"
                          >
                            {q.quote_number}
                          </Link>
                          <span className="block text-[10px] text-stone-400 font-medium">
                            {q.items_count} producto(s)
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <p className="font-bold text-stone-900 dark:text-zinc-100">{q.customer_name}</p>
                          <p className="text-[11px] text-stone-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                            {q.customer_whatsapp}
                          </p>
                        </td>

                        <td className="py-3 px-4 text-stone-600 dark:text-zinc-300 font-medium">
                          {q.sales_rep_name || 'Venta Directa'}
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${st.className}`}>
                            {st.label}
                          </span>
                          {q.converted_order_number && (
                            <span className="block text-[10px] text-purple-600 dark:text-purple-400 font-mono font-semibold mt-0.5">
                              {q.converted_order_number}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-black text-sm text-stone-950 dark:text-white">
                          ${total}
                          {parseFloat(String(q.discount_primary)) > 0 && (
                            <span className="block text-[10px] text-emerald-600 font-semibold">
                              Desc: -${parseFloat(String(q.discount_primary)).toFixed(2)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-stone-500 dark:text-zinc-400 text-[11px]">
                          <div>Creado: {new Date(q.created_at).toLocaleDateString('es-VE')}</div>
                          {q.expires_at && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              Expira: {new Date(q.expires_at).toLocaleDateString('es-VE')}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Link href={`/t/${slug}/admin/sales/quotes/${q.id}`}>
                              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" title="Ver Comprobante">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </Link>

                            <a
                              href={buildWhatsAppLink(q)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-8 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition shadow-2xs"
                              title="Compartir por WhatsApp"
                            >
                              <Share2 className="w-3.5 h-3.5 mr-1" />
                              WhatsApp
                            </a>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDuplicate(q.id)}
                              className="h-8 px-2 text-xs"
                              title="Duplicar Cotización"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>

                            {!isClosed && (
                              <Button
                                size="sm"
                                onClick={() => handleConvertToOrder(q.id, q.quote_number)}
                                className="h-8 px-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                                title="Convertir a Pedido en POS"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Convertir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vista Cards Móvil */}
          <div className="md:hidden space-y-3">
            {quotes.map((q) => {
              const total = parseFloat(String(q.total_primary)).toFixed(2);
              const st = STATUS_MAP[q.status] || { label: q.status, className: '' };
              const isClosed = q.status === 'CONVERTED' || q.status === 'REJECTED' || q.status === 'EXPIRED';

              return (
                <div
                  key={q.id}
                  className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] space-y-3 shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/t/${slug}/admin/sales/quotes/${q.id}`}
                        className="font-mono font-black text-stone-950 dark:text-white text-base hover:text-emerald-600 transition"
                      >
                        {q.quote_number}
                      </Link>
                      <h4 className="font-bold text-stone-900 dark:text-zinc-100 text-sm mt-0.5">
                        {q.customer_name}
                      </h4>
                      <p className="text-xs text-stone-500 dark:text-zinc-400">
                        📞 {q.customer_whatsapp}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${st.className}`}>
                        {st.label}
                      </span>
                      <p className="font-mono font-black text-stone-950 dark:text-white text-base mt-1">
                        ${total}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-500 dark:text-zinc-400 flex items-center justify-between border-t border-stone-100 dark:border-zinc-800/60 pt-2">
                    <span>Vendedor: <strong>{q.sales_rep_name || 'Directa'}</strong></span>
                    <span>{q.items_count} producto(s)</span>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-zinc-800/60">
                    <Link href={`/t/${slug}/admin/sales/quotes/${q.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs font-semibold">
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Ver Detalle
                      </Button>
                    </Link>

                    <a
                      href={buildWhatsAppLink(q)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition text-center"
                    >
                      <Share2 className="w-3.5 h-3.5 mr-1" />
                      WhatsApp
                    </a>

                    {!isClosed && (
                      <Button
                        size="sm"
                        onClick={() => handleConvertToOrder(q.id, q.quote_number)}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold"
                      >
                        Convertir
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-stone-200 dark:border-zinc-800 text-xs text-stone-600 dark:text-zinc-400">
              <div>
                Mostrando <strong className="text-stone-900 dark:text-white">{(page - 1) * 15 + 1}</strong> a{' '}
                <strong className="text-stone-900 dark:text-white">{Math.min(page * 15, totalCount)}</strong> de{' '}
                <strong className="text-stone-900 dark:text-white">{totalCount}</strong> cotizaciones
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-8 px-3 text-xs"
                >
                  Anterior
                </Button>
                <span className="font-mono font-bold text-stone-900 dark:text-white px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="h-8 px-3 text-xs"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
