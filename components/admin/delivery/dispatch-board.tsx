'use client';

import React, { useState, useEffect } from 'react';
import {
  Bike,
  Clock,
  MapPin,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  Send,
  Navigation,
  Check,
  X,
  Phone,
  DollarSign,
  Package,
  Loader2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DispatchRoute, DeliveryDriver } from '@/lib/plugins/delivery-fleet';
import {
  buildDriverWhatsAppDispatchUrl,
  extractGpsCoordinatesFromText,
  sanitizeWhatsAppPhone,
} from '@/lib/plugins/delivery-fleet';
import { ModalPortal } from '@/components/ui/modal-portal';

interface DispatchBoardProps {
  slug: string;
  storeName?: string;
  currencySymbol?: string;
  secondaryCurrencySymbol?: string;
}

export function DispatchBoard({
  slug,
  storeName = 'MarketOS Store',
  currencySymbol = '$',
  secondaryCurrencySymbol = 'Bs.',
}: DispatchBoardProps) {
  const [dispatches, setDispatches] = useState<DispatchRoute[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch active dispatches & drivers
  const fetchData = async () => {
    try {
      setLoading(true);
      const [dispRes, drivRes] = await Promise.all([
        fetch(`/api/tenant/${slug}/delivery/dispatches?limit=150`),
        fetch(`/api/tenant/${slug}/delivery/drivers`),
      ]);
      const dispData = await dispRes.json();
      const drivData = await drivRes.json();

      if (dispData.success) setDispatches(dispData.dispatches || []);
      if (drivData.success) setDrivers((drivData.drivers || []).filter((d: DeliveryDriver) => d.is_active));
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar el tablero de despacho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleRealtime = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    window.addEventListener('marketos:order-realtime', handleRealtime);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData();
    }, 60000);
    return () => {
      window.removeEventListener('marketos:order-realtime', handleRealtime);
      clearInterval(interval);
    };
  }, [slug]);

  // Manejo de asignación de chofer
  const handleAssignDriver = async (dispatchId: string) => {
    if (!selectedDriverId) {
      toast.error('Selecciona un repartidor disponible');
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/tenant/${slug}/delivery/dispatches/${dispatchId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: selectedDriverId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al asignar chofer');
      }

      toast.success('Repartidor asignado con éxito');
      setAssigningId(null);
      setSelectedDriverId('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al asignar');
    } finally {
      setActionLoading(false);
    }
  };

  // Manejo de cambio de estado
  const handleUpdateStatus = async (dispatchId: string, newStatus: string, reason?: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/tenant/${slug}/delivery/dispatches/${dispatchId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, failure_reason: reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al actualizar estado');
      }

      if (newStatus === 'COMPLETED') {
        toast.success('¡Despacho completado! Orden marcada como Entregada');
      } else if (newStatus === 'FAILED') {
        toast.error('Despacho marcado como Fallido');
        setFailingId(null);
        setFailureReason('');
      } else {
        toast.success(`Estado actualizado a: ${newStatus}`);
      }

      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error en la transición de estado');
    } finally {
      setActionLoading(false);
    }
  };

  // Columnas Kanban
  const pendingDispatches = dispatches.filter((d) => d.status === 'PENDING');
  const assignedDispatches = dispatches.filter((d) => d.status === 'ASSIGNED');
  const enRouteDispatches = dispatches.filter((d) => d.status === 'EN_ROUTE' || d.status === 'ARRIVED');
  const completedToday = dispatches.filter((d) => d.status === 'COMPLETED');

  // Helper para tiempo transcurrido
  const getElapsedTime = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return 'Hace un momento';
    if (diff < 60) return `Hace ${diff} min`;
    const hours = Math.floor(diff / 60);
    return `Hace ${hours} h ${diff % 60} m`;
  };

  // Componente de Tarjeta de Despacho
  const renderDispatchCard = (dispatch: DispatchRoute) => {
    const gps = extractGpsCoordinatesFromText(dispatch.delivery_address);
    const exactLat = dispatch.latitude ?? gps.lat;
    const exactLng = dispatch.longitude ?? gps.lng;
    const mapsLink = exactLat != null && exactLng != null
      ? `https://www.google.com/maps?q=${exactLat},${exactLng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dispatch.delivery_address)}`;

    const whatsappUrl = buildDriverWhatsAppDispatchUrl({
      dispatch,
      storeName,
      currencySymbol,
      secondaryCurrencySymbol,
    });

    return (
      <div
        key={dispatch.id}
        className="bg-white dark:bg-[#141416] p-4 rounded-xl border border-stone-200/90 dark:border-zinc-800 shadow-xs space-y-3 transition-all hover:border-emerald-500/50"
      >
        {/* Cabecera Tarjeta */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-extrabold text-stone-900 dark:text-zinc-100 bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
            #{dispatch.order_number || dispatch.order_id.slice(0, 8)}
          </span>
          <span className="text-[11px] text-stone-400 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {getElapsedTime(dispatch.created_at)}
          </span>
        </div>

        {/* Datos Cliente */}
        <div>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-stone-900 dark:text-white truncate">
              {dispatch.customer_name}
            </h4>
            <a
              href={`tel:${dispatch.customer_phone}`}
              className="text-stone-400 hover:text-emerald-600 text-[11px] font-mono flex items-center gap-0.5"
            >
              <Phone className="w-2.5 h-2.5" />
              {dispatch.customer_phone}
            </a>
          </div>

          <p className="text-[11px] text-stone-600 dark:text-zinc-400 mt-1 line-clamp-2">
            📍 {dispatch.delivery_address}
          </p>

          {dispatch.reference_point && (
            <p className="text-[10px] text-stone-400 dark:text-zinc-500 italic mt-0.5">
              Ref: {dispatch.reference_point}
            </p>
          )}
        </div>

        {/* Zona y Tarifa */}
        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-stone-100 dark:border-zinc-800">
          <span className="text-stone-500 dark:text-zinc-400 truncate max-w-[130px]">
            🗺️ {dispatch.zone_name_snapshot || 'Zona Estándar'}
          </span>
          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
            Flete: {currencySymbol} {Number(dispatch.zone_rate_snapshot_primary).toFixed(2)}
          </span>
        </div>

        {/* Chofer asignado */}
        {dispatch.driver_name && (
          <div className="bg-stone-50 dark:bg-zinc-900/60 p-2 rounded-lg border border-stone-100 dark:border-zinc-800/80 text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate">
              <Bike className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-stone-800 dark:text-zinc-200 truncate">
                {dispatch.driver_name}
              </span>
              {dispatch.driver_plate && (
                <span className="font-mono text-[10px] text-stone-400">
                  ({dispatch.driver_plate})
                </span>
              )}
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-xs"
              title="Enviar Comanda por WhatsApp"
            >
              <MessageCircle className="w-3 h-3" />
              Comanda
            </a>
          </div>
        )}

        {/* Enlace de Navegación GPS */}
        <div className="pt-1 flex items-center justify-between text-[10px]">
          <a
            href={mapsLink}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
          >
            <Navigation className="w-3 h-3" />
            {exactLat && exactLng ? 'Pin GPS Exacto' : 'Buscar en Mapa'}
          </a>

          {dispatch.order_total_primary && (
            <span className="font-mono font-bold text-stone-700 dark:text-zinc-300">
              Total: {currencySymbol} {Number(dispatch.order_total_primary).toFixed(2)}
            </span>
          )}
        </div>

        {/* Acciones por Estado */}
        <div className="pt-2 border-t border-stone-100 dark:border-zinc-800 flex flex-wrap gap-1.5 justify-end">
          {dispatch.status === 'PENDING' && (
            <button
              onClick={() => {
                setAssigningId(dispatch.id);
                setSelectedDriverId('');
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-xs"
            >
              <Bike className="w-3.5 h-3.5" />
              Asignar Chofer
            </button>
          )}

          {dispatch.status === 'ASSIGNED' && (
            <button
              onClick={() => handleUpdateStatus(dispatch.id, 'EN_ROUTE')}
              disabled={actionLoading}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-xs disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              Iniciar Ruta (En Camino)
            </button>
          )}

          {(dispatch.status === 'EN_ROUTE' || dispatch.status === 'ARRIVED') && (
            <>
              {dispatch.status === 'EN_ROUTE' && (
                <button
                  onClick={() => handleUpdateStatus(dispatch.id, 'ARRIVED')}
                  disabled={actionLoading}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] transition-colors shadow-xs"
                >
                  Llegó
                </button>
              )}
              <button
                onClick={() => handleUpdateStatus(dispatch.id, 'COMPLETED')}
                disabled={actionLoading}
                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shadow-xs"
              >
                Completar
              </button>
              <button
                onClick={() => {
                  setFailingId(dispatch.id);
                  setFailureReason('');
                }}
                disabled={actionLoading}
                className="py-1.5 px-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 hover:bg-rose-100 font-bold text-[11px] transition-colors"
                title="Marcar fallido"
              >
                Fallido
              </button>
            </>
          )}

          {dispatch.status === 'COMPLETED' && (
            <div className="w-full flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs py-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Entregado
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Tablero */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-[#141416] p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
            <Bike className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Tablero de Despacho en Vivo (Kanban)
          </h2>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
            Supervisa en tiempo real el ciclo de vida de cada entrega: asignación, salida a ruta y confirmación de entrega.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-200 text-xs font-semibold transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar Tablero
        </button>
      </div>

      {/* Columnas Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Columna 1: PENDIENTES */}
        <div className="bg-stone-100/60 dark:bg-zinc-900/40 p-3.5 rounded-2xl border border-stone-200/70 dark:border-zinc-800 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-extrabold text-xs text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Pendientes
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-mono">
              {pendingDispatches.length}
            </span>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {pendingDispatches.length === 0 ? (
              <div className="py-16 text-center text-xs text-stone-400">
                Sin pedidos pendientes
              </div>
            ) : (
              pendingDispatches.map(renderDispatchCard)
            )}
          </div>
        </div>

        {/* Columna 2: ASIGNADOS */}
        <div className="bg-stone-100/60 dark:bg-zinc-900/40 p-3.5 rounded-2xl border border-stone-200/70 dark:border-zinc-800 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-extrabold text-xs text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Asignados / En Prep.
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-mono">
              {assignedDispatches.length}
            </span>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {assignedDispatches.length === 0 ? (
              <div className="py-16 text-center text-xs text-stone-400">
                Sin pedidos en preparación
              </div>
            ) : (
              assignedDispatches.map(renderDispatchCard)
            )}
          </div>
        </div>

        {/* Columna 3: EN RUTA */}
        <div className="bg-stone-100/60 dark:bg-zinc-900/40 p-3.5 rounded-2xl border border-stone-200/70 dark:border-zinc-800 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-extrabold text-xs text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              En Ruta / En Camino
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-mono">
              {enRouteDispatches.length}
            </span>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {enRouteDispatches.length === 0 ? (
              <div className="py-16 text-center text-xs text-stone-400">
                Sin pedidos en camino
              </div>
            ) : (
              enRouteDispatches.map(renderDispatchCard)
            )}
          </div>
        </div>

        {/* Columna 4: COMPLETADOS HOY */}
        <div className="bg-stone-100/60 dark:bg-zinc-900/40 p-3.5 rounded-2xl border border-stone-200/70 dark:border-zinc-800 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-extrabold text-xs text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Entregados Hoy
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-mono">
              {completedToday.length}
            </span>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {completedToday.length === 0 ? (
              <div className="py-16 text-center text-xs text-stone-400">
                Aún no hay entregas completadas hoy
              </div>
            ) : (
              completedToday.slice(0, 20).map(renderDispatchCard)
            )}
          </div>
        </div>
      </div>

      {/* Modal para Asignar Chofer */}
      <ModalPortal
        isOpen={!!assigningId}
        onClose={() => setAssigningId(null)}
        backdropClassName="bg-black/50 backdrop-blur-xs"
        containerClassName="p-4 items-center"
      >
        <div className="bg-white dark:bg-[#141416] p-6 rounded-2xl max-w-md w-full border border-stone-200 dark:border-zinc-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-stone-900 dark:text-white flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-600" />
              Asignar Repartidor
            </h3>
            <button
              onClick={() => setAssigningId(null)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
              Selecciona un chofer activo:
            </label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Seleccionar repartidor --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.vehicle_type} · {d.license_plate}) - Tel: {d.phone}
                </option>
              ))}
            </select>
          </div>

          {drivers.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ No hay motorizados activos registrados. Ve a la pestaña &quot;Repartidores&quot; para registrar uno.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAssigningId(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={actionLoading || !selectedDriverId || !assigningId}
              onClick={() => assigningId && handleAssignDriver(assigningId)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Confirmar Asignación
            </button>
          </div>
        </div>
      </ModalPortal>

      {/* Modal para Motivo de Fallido */}
      <ModalPortal
        isOpen={!!failingId}
        onClose={() => setFailingId(null)}
        backdropClassName="bg-black/50 backdrop-blur-xs"
        containerClassName="p-4 items-center"
      >
        <div className="bg-white dark:bg-[#141416] p-6 rounded-2xl max-w-md w-full border border-stone-200 dark:border-zinc-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-rose-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Marcar Despacho como Fallido
            </h3>
            <button
              onClick={() => setFailingId(null)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
              Motivo del fallo:
            </label>
            <textarea
              rows={3}
              required
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              placeholder="Ej. El cliente no atendió las llamadas en la dirección de entrega."
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFailingId(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={actionLoading || !failureReason.trim() || !failingId}
              onClick={() => failingId && handleUpdateStatus(failingId, 'FAILED', failureReason.trim())}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50"
            >
              {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Registrar Fallido
            </button>
          </div>
        </div>
      </ModalPortal>
    </div>
  );
}
