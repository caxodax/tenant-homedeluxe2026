'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  X,
  Package,
  Clock,
  CheckCircle2,
  Bike,
  Store,
  ExternalLink,
  Loader2,
  MapPin,
  Calendar,
  AlertCircle,
  Truck,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

interface TrackedOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  delivery_type: string;
  delivery_address: string;
  subtotal_primary: string;
  shipping_primary: string;
  total_primary: string;
  total_secondary: string | null;
  exchange_rate_applied: string | null;
  notes: string | null;
  created_at: string;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
  }>;
  payment?: {
    status: string;
    method: string;
    reference: string | null;
  };
}

interface OrderTrackerModalProps {
  slug: string;
  isOpen: boolean;
  onClose: () => void;
  currencySymbol?: string;
}

const STATUS_STEPS: Record<string, { step: number; label: string; color: string; desc: string }> = {
  CREATED: {
    step: 1,
    label: 'Registrado',
    color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    desc: 'Pedido recibido en tienda',
  },
  PENDING_PAYMENT_VERIFICATION: {
    step: 1,
    label: 'Validando Pago',
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    desc: 'Revisando tu comprobante de pago',
  },
  CONFIRMED: {
    step: 2,
    label: 'Pago Verificado',
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    desc: 'Pago confirmado por la tienda',
  },
  PREPARING: {
    step: 3,
    label: 'En Preparación',
    color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
    desc: 'Empacando tus artículos',
  },
  READY_FOR_PICKUP: {
    step: 4,
    label: 'Listo para Retiro',
    color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800',
    desc: 'Listo en mostrador',
  },
  IN_TRANSIT: {
    step: 4,
    label: 'En Ruta con Delivery',
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    desc: 'El chofer va en camino',
  },
  DELIVERED: {
    step: 5,
    label: 'Entregado',
    color: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 border-emerald-300 dark:border-emerald-700',
    desc: 'Pedido completado con éxito',
  },
  CANCELLED: {
    step: 0,
    label: 'Cancelado',
    color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    desc: 'Orden anulada o pago rechazado',
  },
};

export function OrderTrackerModal({
  slug,
  isOpen,
  onClose,
  currencySymbol = '$',
}: OrderTrackerModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [orders, setOrders] = useState<TrackedOrder[]>([]);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 3) {
      toast.error('Ingresa al menos 3 caracteres (Cédula o N° de Pedido)');
      return;
    }

    try {
      setLoading(true);
      setSearched(true);
      const res = await fetch(`/api/tenant/${slug}/track-order?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.orders || []);
        if ((data.orders || []).length === 0) {
          toast.info('No encontramos pedidos con los datos suministrados');
        }
      } else {
        toast.error(data.error || 'Error al buscar órdenes');
      }
    } catch {
      toast.error('Error de conexión al rastrear pedido');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-lg leading-tight">
                Rastreo de Pedidos
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Consulta el estado de tu compra en tiempo real
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Buscador */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-400" />
              <input
                type="text"
                autoFocus
                placeholder="Ingresa tu N° de Orden (ORD-...) o Cédula / Teléfono"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm shadow-sm transition active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>Consultar</span>
            </button>
          </form>
          <div className="flex items-center gap-2 mt-2.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>Ejemplos:</span>
            <button
              type="button"
              onClick={() => { setQuery('ORD-202611-000031'); }}
              className="font-mono text-emerald-600 dark:text-emerald-400 underline hover:opacity-80"
            >
              ORD-202611-000031
            </button>
            <span>ó ingresa tu número de cédula</span>
          </div>
        </div>

        {/* Lista de Resultados */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs text-zinc-500">Localizando tu pedido en el sistema...</p>
            </div>
          ) : searched && orders.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                No encontramos órdenes registradas
              </h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Verifica que el número de orden o tu cédula estén bien escritos. Si acabas de comprar, espera unos segundos y reintenta.
              </p>
            </div>
          ) : !searched ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mx-auto text-emerald-600">
                <Truck className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                ¿Dónde está tu pedido?
              </h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Ingresa el código que te llegó al confirmar tu compra (ej: ORD-202611-000031) o tu número de cédula para conocer el avance de tu entrega en vivo.
              </p>
            </div>
          ) : (
            orders.map((ord) => {
              const statusMeta = STATUS_STEPS[ord.status] || {
                step: 1,
                label: ord.status,
                color: 'text-zinc-600 bg-zinc-100 dark:bg-zinc-800 border-zinc-200',
                desc: 'En proceso',
              };
              const isDelivery = ord.delivery_type === 'DELIVERY';

              return (
                <div
                  key={ord.id}
                  className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/40 space-y-4 hover:border-emerald-500/40 transition shadow-xs"
                >
                  {/* Fila Superior: Correlativo, Badge y Total */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-base text-zinc-950 dark:text-white">
                          {ord.order_number}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusMeta.color}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {formatDate(ord.created_at)} · {ord.customer_name}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="font-mono font-black text-lg text-emerald-600 dark:text-emerald-400">
                        {currencySymbol}{Number(ord.total_primary).toFixed(2)}
                      </span>
                      {ord.total_secondary && (
                        <p className="text-[11px] font-mono text-zinc-500">
                          Bs. {Number(ord.total_secondary).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modalidad de Entrega */}
                  <div className="p-3 rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700/60 flex items-start gap-2.5 text-xs">
                    {isDelivery ? (
                      <Bike className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Store className="w-4 h-4 text-lime-600 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">
                        {isDelivery ? 'Despacho a Domicilio (Delivery)' : 'Retiro en Tienda (Pick-up)'}
                      </p>
                      <p className="text-zinc-500 dark:text-zinc-400 truncate">
                        {ord.delivery_address}
                      </p>
                    </div>
                  </div>

                  {/* Línea de Tiempo Visual (Stepped Progress) */}
                  <div className="pt-2">
                    <div className="grid grid-cols-4 gap-1 text-center">
                      <div className="space-y-1">
                        <div
                          className={`h-1.5 rounded-full ${
                            statusMeta.step >= 1 ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                          }`}
                        />
                        <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 block truncate">
                          1. Recibido
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div
                          className={`h-1.5 rounded-full ${
                            statusMeta.step >= 2 ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                          }`}
                        />
                        <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 block truncate">
                          2. Pago OK
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div
                          className={`h-1.5 rounded-full ${
                            statusMeta.step >= 3 ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                          }`}
                        />
                        <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 block truncate">
                          3. Empaque
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div
                          className={`h-1.5 rounded-full ${
                            statusMeta.step >= 4 ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                          }`}
                        />
                        <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 block truncate">
                          4. En Ruta / Listo
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Items */}
                  {ord.items && ord.items.length > 0 && (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-200/50 dark:border-zinc-800/60 pt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">Productos:</span>
                      {ord.items.map((it, idx) => (
                        <span
                          key={idx}
                          className="bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 text-[11px]"
                        >
                          {it.quantity}x {it.product_name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Botón Ver Orden Completa */}
                  <div className="flex justify-end pt-1">
                    <Link
                      href={`/t/${slug}/order-success/${ord.id}`}
                      onClick={onClose}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      <span>Ver comprobante y comanda completa</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
