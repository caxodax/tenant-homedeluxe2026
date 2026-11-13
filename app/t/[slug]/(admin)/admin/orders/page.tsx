'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  ShoppingCart,
  Clock,
  CheckCircle2,
  PackageCheck,
  FileImage,
  Eye,
  CreditCard,
  MonitorSmartphone,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TENANT_ORDERS_DOM_EVENT,
  TENANT_REALTIME_STATUS_EVENT,
  type TenantOrderRealtimeEvent,
} from '@/lib/realtime/tenant-orders-channel';

interface OrderListItem {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  delivery_type: string;
  total_usd: string;
  is_offline_sale: boolean;
  offline_ticket_ref: string | null;
  created_at: string;
  updated_at: string;
  payment_method: string | null;
  payment_status: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  payment_reference: string | null;
  payment_proof_url: string | null;
  items_count: number;
}

const ORDER_STATUS_META: Record<string, { label: string; className: string }> = {
  CREATED: {
    label: 'Recibido',
    className: 'bg-slate-200/80 dark:bg-zinc-800 text-slate-900 dark:text-zinc-200 border-slate-300 dark:border-zinc-700',
  },
  PREORDER_PENDING_REVIEW: {
    label: 'Pre-orden',
    className: 'bg-violet-500/15 text-violet-800 dark:text-violet-300 border-violet-500/30',
  },
  PENDING_PAYMENT_VERIFICATION: {
    label: 'Pago por verificar',
    className: 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/30',
  },
  CONFIRMED: {
    label: 'Confirmado',
    className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  },
  PREPARING: {
    label: 'Preparando',
    className: 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30',
  },
  READY_FOR_PICKUP: {
    label: 'Listo para retirar',
    className: 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30',
  },
  DELIVERED: {
    label: 'Entregado',
    className: 'bg-emerald-600/20 text-emerald-900 dark:text-emerald-200 border-emerald-600/40',
  },
  CANCELLED: {
    label: 'Cancelado',
    className: 'bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/30',
  },
};

const PAYMENT_STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Pendiente',
    className: 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/30',
  },
  VERIFIED: {
    label: 'Verificado',
    className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  },
  REJECTED: {
    label: 'Rechazado',
    className: 'bg-red-500/15 text-red-800 dark:text-red-300 border-red-500/30',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminOrdersPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTING' | 'SUBSCRIBED' | 'DISCONNECTED'>(
    () => {
      if (
        typeof window !== 'undefined' &&
        slug &&
        window.__marketosRealtimeStatus?.[slug]
      ) {
        return window.__marketosRealtimeStatus[slug];
      }
      return 'CONNECTING';
    }
  );

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  const fetchOrders = useCallback(
    async (silent = false) => {
      if (!slug) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch(`/api/admin/${slug}/orders`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los pedidos');
        setOrders(data.orders || []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error cargando pedidos');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    fetchOrders(false);
  }, [fetchOrders]);

  useEffect(() => {
    if (!slug) return;

    const handleRealtimeEvent = (ev: Event) => {
      const custom = ev as CustomEvent<{
        slug?: string;
        event?: TenantOrderRealtimeEvent;
      }>;
      if (custom.detail?.slug === slug && custom.detail?.event) {
        void fetchOrders(true);
      }
    };

    const handleStatusEvent = (ev: Event) => {
      const custom = ev as CustomEvent<{
        slug?: string;
        status?: 'CONNECTING' | 'SUBSCRIBED' | 'DISCONNECTED';
      }>;
      if (custom.detail?.slug === slug && custom.detail.status) {
        setRealtimeStatus(custom.detail.status);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOrders(true);
      }
    };

    window.addEventListener(TENANT_ORDERS_DOM_EVENT, handleRealtimeEvent);
    window.addEventListener(TENANT_REALTIME_STATUS_EVENT, handleStatusEvent);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        window.__marketosRealtimeStatus?.[slug] !== 'SUBSCRIBED'
      ) {
        void fetchOrders(true);
      }
    }, 30000);

    return () => {
      window.removeEventListener(TENANT_ORDERS_DOM_EVENT, handleRealtimeEvent);
      window.removeEventListener(TENANT_REALTIME_STATUS_EVENT, handleStatusEvent);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [slug, fetchOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
      if (paymentFilter === 'NONE' && order.payment_status !== null) return false;
      if (
        paymentFilter !== 'ALL' &&
        paymentFilter !== 'NONE' &&
        order.payment_status !== paymentFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        order.order_number.toLowerCase().includes(q) ||
        (order.customer_name || '').toLowerCase().includes(q) ||
        (order.customer_phone || '').toLowerCase().includes(q) ||
        (order.payment_reference || '').toLowerCase().includes(q) ||
        (order.payment_method || '').toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, paymentFilter]);

  const metrics = useMemo(() => {
    const pendingPayments = orders.filter(
      (o) =>
        o.status === 'PENDING_PAYMENT_VERIFICATION' ||
        (o.payment_status === 'PENDING' && o.status !== 'CANCELLED')
    ).length;
    const inProgress = orders.filter((o) =>
      ['CREATED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP'].includes(o.status)
    ).length;
    const delivered = orders.filter((o) => o.status === 'DELIVERED').length;
    return {
      total: orders.length,
      pendingPayments,
      inProgress,
      delivered,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Pedidos y Verificación de Pagos
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
            Supervisa compras de la vitrina digital y mostrador POS, valida comprobantes y consulta la auditoría completa.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
              realtimeStatus === 'SUBSCRIBED'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeStatus === 'SUBSCRIBED' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {realtimeStatus === 'SUBSCRIBED' ? 'En vivo · Realtime' : 'Reconectando'}
          </span>

          <Button
            variant="outline"
            onClick={() => fetchOrders(true)}
            disabled={refreshing}
            className="bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-semibold"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
            <span>Total Pedidos</span>
            <ShoppingCart className="w-4 h-4 text-[var(--tenant-primary)]" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2">
            {metrics.total}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setPaymentFilter((prev) => (prev === 'PENDING' ? 'ALL' : 'PENDING'))
          }
          className={`p-4 rounded-2xl border text-left transition-all shadow-sm ${
            paymentFilter === 'PENDING'
              ? 'bg-amber-500/10 border-amber-500/50'
              : 'bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <span>Pagos Pendientes</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2">
            {metrics.pendingPayments}
          </p>
        </button>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
            <span>En Curso</span>
            <PackageCheck className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2">
            {metrics.inProgress}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            <span>Entregados</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-slate-950 dark:text-white mt-2">
            {metrics.delivered}
          </p>
        </div>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
        {/* Search & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
          <div className="relative flex-1 w-full lg:max-w-md min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por orden, cliente, teléfono o referencia..."
              className="pl-9 w-full bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-950 dark:text-white text-sm placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtros:</span>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filtrar por estado del pedido"
              className="h-9 w-full sm:w-auto max-w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-3 text-sm font-medium text-slate-900 dark:text-zinc-100"
            >
              <option value="ALL">Estado: Todos</option>
              <option value="PENDING_PAYMENT_VERIFICATION">Pago por verificar</option>
              <option value="CREATED">Recibido</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="PREPARING">Preparando</option>
              <option value="READY_FOR_PICKUP">Listo para retirar</option>
              <option value="DELIVERED">Entregado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              aria-label="Filtrar por estado del pago"
              className="h-9 w-full sm:w-auto max-w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-3 text-sm font-medium text-slate-900 dark:text-zinc-100"
            >
              <option value="ALL">Pago: Todos</option>
              <option value="PENDING">Pago Pendiente</option>
              <option value="VERIFIED">Pago Verificado</option>
              <option value="REJECTED">Pago Rechazado</option>
            </select>
          </div>
        </div>

        {/* Loading / Empty */}
        {loading ? (
          <div className="py-12 text-center text-sm font-medium text-slate-600 dark:text-zinc-400">
            Cargando pedidos del comercio...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-zinc-800 space-y-2">
            <ShoppingCart className="w-8 h-8 mx-auto text-slate-400 dark:text-zinc-600" />
            <p className="text-sm font-semibold text-slate-800 dark:text-zinc-200">
              No hay pedidos que coincidan con tu búsqueda
            </p>
            {(search || statusFilter !== 'ALL' || paymentFilter !== 'ALL') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                  setPaymentFilter('ALL');
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-zinc-900/90 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 border-b border-slate-200 dark:border-zinc-800">
                    <th className="py-3 px-4">Orden</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Canal / Pago</th>
                    <th className="py-3 px-4 text-right">Total USD</th>
                    <th className="py-3 px-4">Estado Pedido</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800/80 text-sm">
                  {filteredOrders.map((order) => {
                    const st = ORDER_STATUS_META[order.status] || {
                      label: order.status,
                      className: 'bg-slate-100 text-slate-800 border-slate-300',
                    };
                    const paySt = order.payment_status
                      ? PAYMENT_STATUS_META[order.payment_status]
                      : null;

                    return (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/t/${slug}/admin/orders/${order.id}`)}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-extrabold text-[var(--tenant-primary)]">
                            {order.order_number}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-zinc-400">
                            {order.items_count} {order.items_count === 1 ? 'producto' : 'productos'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-950 dark:text-white">
                            {order.customer_name}
                          </div>
                          <div className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                            {order.customer_phone}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-zinc-200">
                              {order.delivery_type === 'POS' ? (
                                <MonitorSmartphone className="w-3.5 h-3.5 text-slate-500" />
                              ) : (
                                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              {order.payment_method || order.delivery_type}
                            </span>

                            {paySt && (
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${paySt.className}`}
                              >
                                {paySt.label}
                              </span>
                            )}

                            {order.payment_proof_url && (
                              <span
                                title="Incluye comprobante adjunto"
                                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                              >
                                <FileImage className="w-3 h-3" />
                                Comprobante
                              </span>
                            )}
                          </div>
                          {order.payment_reference && (
                            <div className="text-xs font-mono text-slate-600 dark:text-zinc-400 mt-0.5">
                              Ref: {order.payment_reference}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-black text-slate-950 dark:text-white">
                          ${parseFloat(order.total_usd).toFixed(2)}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex text-xs font-bold px-2.5 py-1 rounded-full border ${st.className}`}
                          >
                            {st.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-xs font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>

                        <td
                          className="py-3.5 px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/t/${slug}/admin/orders/${order.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-900 dark:text-white hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Detalle y Auditoría
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {filteredOrders.map((order) => {
                const st = ORDER_STATUS_META[order.status] || {
                  label: order.status,
                  className: 'bg-slate-100 text-slate-800 border-slate-300',
                };
                const paySt = order.payment_status
                  ? PAYMENT_STATUS_META[order.payment_status]
                  : null;

                return (
                  <Link
                    key={order.id}
                    href={`/t/${slug}/admin/orders/${order.id}`}
                    className="block p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/50 hover:border-[var(--tenant-primary)] transition-colors space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-black text-[var(--tenant-primary)]">
                          {order.order_number}
                        </p>
                        <p className="text-sm font-bold text-slate-950 dark:text-white">
                          {order.customer_name}
                        </p>
                        <p className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                          {order.customer_phone}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-mono font-black text-slate-950 dark:text-white">
                          ${parseFloat(order.total_usd).toFixed(2)} USD
                        </p>
                        <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                          {formatDate(order.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${st.className}`}
                      >
                        {st.label}
                      </span>
                      {paySt && (
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${paySt.className}`}
                        >
                          Pago: {paySt.label}
                        </span>
                      )}
                      {order.payment_proof_url && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                          <FileImage className="w-3 h-3" />
                          Comprobante
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
