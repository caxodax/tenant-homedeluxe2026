'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bike,
  Search,
  RefreshCw,
  Phone,
  MessageCircle,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  ArrowRight,
  Car,
  Filter,
  Check,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DispatchRoute, DeliveryDriver } from '@/lib/plugins/delivery-fleet';

interface DispatchesManagerProps {
  slug: string;
  storeName?: string;
  currencySymbol?: string;
  secondaryCurrencySymbol?: string;
}

const ITEMS_PER_PAGE = 10;

export function DispatchesManager({
  slug,
  storeName = 'MarketOS Store',
  currencySymbol = '$',
  secondaryCurrencySymbol = 'Bs.',
}: DispatchesManagerProps) {
  const [dispatches, setDispatches] = useState<DispatchRoute[]>([]);
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filtros y Búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'ASSIGNED' | 'EN_ROUTE' | 'COMPLETED' | 'FAILED'>('ALL');
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Cargar lista de choferes activos
  const loadDrivers = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenant/${slug}/delivery/drivers`);
      const data = await res.json();
      if (data.success && Array.isArray(data.drivers)) {
        setDrivers(data.drivers.filter((d: DeliveryDriver) => d.is_active));
      }
    } catch (err) {
      console.error('Error cargando repartidores:', err);
    }
  }, [slug]);

  // Cargar lista de despachos
  const loadDispatches = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/delivery/dispatches?limit=150`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && Array.isArray(data.dispatches)) {
        setDispatches(data.dispatches);
      }
    } catch (err) {
      console.error('Error cargando despachos:', err);
      if (!isSilent) toast.error('Error al cargar la lista de despachos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    loadDrivers();
    loadDispatches();

    const handleRealtime = () => {
      if (document.visibilityState === 'visible') void loadDispatches(true);
    };
    window.addEventListener('marketos:order-realtime', handleRealtime);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void loadDispatches(true);
    }, 60000);
    return () => {
      window.removeEventListener('marketos:order-realtime', handleRealtime);
      clearInterval(timer);
    };
  }, [loadDrivers, loadDispatches]);

  // Asignar Chofer
  async function handleAssignDriver(dispatchId: string, driverId: string) {
    if (!driverId) return;
    try {
      setUpdatingId(dispatchId);
      const res = await fetch(`/api/tenant/${slug}/delivery/dispatches/${dispatchId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id: driverId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Repartidor asignado exitosamente');
        await loadDispatches(true);
      } else {
        toast.error(data.error || 'No se pudo asignar el repartidor');
      }
    } catch {
      toast.error('Error de red al asignar repartidor');
    } finally {
      setUpdatingId(null);
    }
  }

  // Actualizar Estado (En Camino, Entregado, etc.)
  async function handleUpdateStatus(dispatchId: string, newStatus: string) {
    try {
      setUpdatingId(dispatchId);
      const res = await fetch(`/api/tenant/${slug}/delivery/dispatches/${dispatchId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        if (newStatus === 'EN_ROUTE') {
          toast.success('¡Pedido en camino con el repartidor!');
        } else if (newStatus === 'COMPLETED') {
          toast.success('¡Despacho marcado como entregado!');
        } else {
          toast.success('Estado actualizado');
        }
        await loadDispatches(true);
      } else {
        toast.error(data.error || 'No se pudo actualizar el estado');
      }
    } catch {
      toast.error('Error de red al actualizar estado');
    } finally {
      setUpdatingId(null);
    }
  }

  // Filtrado reactivo en memoria
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      // Filtro por estatus
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;

      // Filtro por chofer
      if (driverFilter !== 'ALL') {
        if (driverFilter === 'UNASSIGNED') {
          if (d.driver_id) return false;
        } else if (d.driver_id !== driverFilter) {
          return false;
        }
      }

      // Filtro de búsqueda libre
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const orderNum = (d.order_number || '').toLowerCase();
        const clientName = (d.customer_name || '').toLowerCase();
        const clientPhone = (d.customer_phone || '').toLowerCase();
        const address = (d.delivery_address || '').toLowerCase();
        const zone = (d.zone_name_snapshot || '').toLowerCase();
        const driver = (d.driver_name || '').toLowerCase();

        return (
          orderNum.includes(q) ||
          clientName.includes(q) ||
          clientPhone.includes(q) ||
          address.includes(q) ||
          zone.includes(q) ||
          driver.includes(q)
        );
      }

      return true;
    });
  }, [dispatches, statusFilter, driverFilter, searchQuery]);

  // Contadores para métricas
  const stats = useMemo(() => {
    return {
      total: dispatches.length,
      pending: dispatches.filter((d) => d.status === 'PENDING').length,
      assigned: dispatches.filter((d) => d.status === 'ASSIGNED').length,
      enRoute: dispatches.filter((d) => d.status === 'EN_ROUTE').length,
      completed: dispatches.filter((d) => d.status === 'COMPLETED').length,
    };
  }, [dispatches]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredDispatches.length / ITEMS_PER_PAGE));
  const paginatedDispatches = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDispatches.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDispatches, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-300/60 dark:border-amber-700/60">
            <Clock className="w-3 h-3" />
            Por Asignar
          </span>
        );
      case 'ASSIGNED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-300/60 dark:border-purple-700/60">
            <User className="w-3 h-3" />
            Asignado
          </span>
        );
      case 'EN_ROUTE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-300/60 dark:border-blue-700/60 animate-pulse">
            <Bike className="w-3 h-3" />
            En Camino
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300/60 dark:border-emerald-700/60">
            <CheckCircle2 className="w-3 h-3" />
            Entregado
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300/60 dark:border-rose-700/60">
            <AlertCircle className="w-3 h-3" />
            Fallido
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300">
            {status}
          </span>
        );
    }
  };

  const getRowSemanticClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-l-4 border-l-amber-500 hover:bg-amber-500/[0.08] dark:hover:bg-amber-500/[0.10]';
      case 'ASSIGNED':
        return 'bg-purple-500/[0.04] dark:bg-purple-500/[0.06] border-l-4 border-l-purple-500 hover:bg-purple-500/[0.08] dark:hover:bg-purple-500/[0.10]';
      case 'EN_ROUTE':
        return 'bg-blue-500/[0.05] dark:bg-blue-500/[0.08] border-l-4 border-l-blue-500 hover:bg-blue-500/[0.10] dark:hover:bg-blue-500/[0.12]';
      case 'COMPLETED':
        return 'bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] border-l-4 border-l-emerald-500 hover:bg-emerald-500/[0.07] dark:hover:bg-emerald-500/[0.09]';
      case 'FAILED':
        return 'bg-rose-500/[0.04] dark:bg-rose-500/[0.06] border-l-4 border-l-rose-500 hover:bg-rose-500/[0.08] dark:hover:bg-rose-500/[0.10]';
      default:
        return 'border-l-4 border-l-stone-300 dark:border-l-zinc-700 hover:bg-stone-50 dark:hover:bg-zinc-900/40';
    }
  };

  return (
    <div className="space-y-5">
      {/* Tarjetas de Resumen Rápido de Operativa */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => {
            setStatusFilter('ALL');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-950 border-transparent shadow-sm'
              : 'bg-white dark:bg-zinc-900/60 border-stone-200/80 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:border-stone-400'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-75">Total Envíos</div>
          <div className="text-xl font-black mt-0.5">{stats.total}</div>
        </button>

        <button
          onClick={() => {
            setStatusFilter('PENDING');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'PENDING'
              ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
              : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/40 text-amber-900 dark:text-amber-300 hover:border-amber-400'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Por Asignar</span>
            <Clock className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black mt-0.5">{stats.pending}</div>
        </button>

        <button
          onClick={() => {
            setStatusFilter('EN_ROUTE');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'EN_ROUTE'
              ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
              : 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/80 dark:border-blue-800/40 text-blue-900 dark:text-blue-300 hover:border-blue-400'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>En Camino</span>
            <Bike className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black mt-0.5">{stats.enRoute}</div>
        </button>

        <button
          onClick={() => {
            setStatusFilter('COMPLETED');
            setCurrentPage(1);
          }}
          className={`p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'COMPLETED'
              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300 hover:border-emerald-400'
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
            <span>Entregados</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="text-xl font-black mt-0.5">{stats.completed}</div>
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-2xl border border-stone-200 dark:border-zinc-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Buscador */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por orden (#000005), cliente, teléfono o dirección..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-stone-900 dark:focus:ring-white text-stone-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filtro por Repartidor */}
            <div className="flex items-center gap-1.5 bg-stone-50 dark:bg-zinc-800/60 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-700">
              <Filter className="w-3.5 h-3.5 text-stone-400" />
              <select
                value={driverFilter}
                onChange={(e) => {
                  setDriverFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-semibold text-stone-900 dark:text-white focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Todos los Repartidores</option>
                <option value="UNASSIGNED">Sin Repartidor</option>
                {drivers.map((drv) => (
                  <option key={drv.id} value={drv.id}>
                    {drv.full_name} ({drv.vehicle_type})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Estatus */}
            <div className="flex items-center gap-1.5 bg-stone-50 dark:bg-zinc-800/60 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-700">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-transparent text-xs font-semibold text-stone-900 dark:text-white focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Todos los Estatus</option>
                <option value="PENDING">Por Asignar</option>
                <option value="ASSIGNED">Asignados</option>
                <option value="EN_ROUTE">En Camino</option>
                <option value="COMPLETED">Entregados</option>
                <option value="FAILED">Fallidos</option>
              </select>
            </div>

            {/* Botón de Refresco */}
            <button
              onClick={() => loadDispatches()}
              disabled={refreshing}
              title="Refrescar lista"
              className="p-2 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-600 dark:text-zinc-300 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-stone-900 dark:text-white' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Contenido: Grid / Lista de Alta Densidad */}
      {loading ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-12 text-center border border-stone-200 dark:border-zinc-800">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-stone-400 mb-2" />
          <p className="text-xs text-stone-500 dark:text-zinc-400">Cargando despachos en vivo...</p>
        </div>
      ) : filteredDispatches.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-12 text-center border border-stone-200 dark:border-zinc-800 space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-stone-400">
            <Bike className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-stone-900 dark:text-white">No hay despachos para mostrar</h3>
          <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'ALL' || driverFilter !== 'ALL'
              ? 'No se encontraron entregas que coincidan con los filtros aplicados.'
              : 'Cuando los clientes hagan pedidos con opción "A Domicilio (Delivery)", aparecerán aquí organizados para el cajero.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Listado en Tarjetas Horizontales con Sombreado de Fila */}
          {paginatedDispatches.map((dispatch) => {
            const isRowUpdating = updatingId === dispatch.id;
            const waPhone = (dispatch.customer_phone || '').replace(/\D/g, '');
            const waMessage = encodeURIComponent(
              `¡Hola ${dispatch.customer_name || 'estimado cliente'}! Te saludamos de ${storeName}. Tu pedido ${dispatch.order_number || ''} está en gestión de delivery.`
            );

            return (
              <div
                key={dispatch.id}
                className={`p-3.5 sm:p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 transition-all ${getRowSemanticClass(
                  dispatch.status
                )} ${isRowUpdating ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 sm:gap-4">
                  {/* Columna 1: Orden & Monto */}
                  <div className="min-w-[140px] shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-stone-950 dark:text-white tracking-tight">
                        {dispatch.order_number || `#${dispatch.id.slice(0, 8)}`}
                      </span>
                      {getStatusBadge(dispatch.status)}
                    </div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {currencySymbol}
                      {Number(dispatch.order_total_primary || dispatch.zone_rate_snapshot_primary || 0).toFixed(2)}
                      {Boolean(dispatch.order_total_secondary) && (
                        <span className="text-[11px] font-medium text-stone-400 dark:text-zinc-500 ml-1.5">
                          ({secondaryCurrencySymbol} {Number(dispatch.order_total_secondary).toFixed(2)})
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-stone-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(dispatch.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Columna 2: Cliente & Destino */}
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-stone-900 dark:text-white">
                        {dispatch.customer_name || 'Cliente sin nombre'}
                      </span>
                      {dispatch.customer_phone && (
                        <div className="flex items-center gap-1">
                          <a
                            href={`https://wa.me/${waPhone}?text=${waMessage}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 text-[10px] font-semibold hover:bg-emerald-200"
                            title="Abrir WhatsApp con cliente"
                          >
                            <MessageCircle className="w-3 h-3" />
                            WhatsApp
                          </a>
                          <a
                            href={`tel:${dispatch.customer_phone}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300 text-[10px] font-semibold hover:bg-stone-200"
                            title="Llamar al cliente"
                          >
                            <Phone className="w-3 h-3" />
                            {dispatch.customer_phone}
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-stone-600 dark:text-zinc-300 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">
                        {dispatch.delivery_address || 'Dirección no especificada'}
                        {dispatch.reference_point && (
                          <span className="text-stone-400 dark:text-zinc-500 italic ml-1">
                            (Ref: {dispatch.reference_point})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Columna 3: Zona & Tarifa */}
                  <div className="min-w-[130px] shrink-0 text-xs">
                    <div className="text-[10px] uppercase font-bold text-stone-400 dark:text-zinc-500">Zona</div>
                    <div className="font-semibold text-stone-800 dark:text-zinc-200 truncate">
                      {dispatch.zone_name_snapshot || 'Estándar'}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                      Tarifa: +{currencySymbol}
                      {Number(dispatch.zone_rate_snapshot_primary || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Columna 4: Repartidor Asignado / Selector */}
                  <div className="min-w-[170px] shrink-0 space-y-1">
                    <div className="text-[10px] uppercase font-bold text-stone-400 dark:text-zinc-500">Repartidor</div>
                    {dispatch.driver_id ? (
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="p-1 rounded-md bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300">
                            {dispatch.driver_vehicle === 'CARRO' || dispatch.driver_vehicle === 'car' ? (
                              <Car className="w-3.5 h-3.5" />
                            ) : (
                              <Bike className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div className="truncate">
                            <div className="text-xs font-bold text-stone-900 dark:text-white truncate">
                              {dispatch.driver_name || 'Asignado'}
                            </div>
                            {dispatch.driver_plate && (
                              <div className="text-[10px] text-stone-400 dark:text-zinc-500">
                                Placa: {dispatch.driver_plate}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Dropdown discreto para reasignar */}
                        {dispatch.status !== 'COMPLETED' && (
                          <select
                            onChange={(e) => handleAssignDriver(dispatch.id, e.target.value)}
                            value=""
                            className="text-[10px] text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 bg-transparent border-0 cursor-pointer p-0 w-4 focus:ring-0"
                            title="Cambiar repartidor"
                          >
                            <option value="" disabled>
                              Cambiar...
                            </option>
                            {drivers.map((drv) => (
                              <option key={drv.id} value={drv.id}>
                                {drv.full_name} ({drv.vehicle_type})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <select
                          id={`select-driver-${dispatch.id}`}
                          defaultValue=""
                          className="w-full text-xs font-semibold px-2 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-hidden"
                          onChange={(e) => {
                            if (e.target.value) handleAssignDriver(dispatch.id, e.target.value);
                          }}
                        >
                          <option value="" disabled>
                            Seleccionar Chofer...
                          </option>
                          {drivers.map((drv) => (
                            <option key={drv.id} value={drv.id}>
                              {drv.full_name} ({drv.vehicle_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Columna 5: Acciones Rápidas del Cajero */}
                  <div className="min-w-[150px] shrink-0 flex items-center justify-end gap-1.5 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-stone-200/60 dark:border-zinc-800/60">
                    {dispatch.status === 'PENDING' && (
                      <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Esperando Chofer
                      </div>
                    )}

                    {dispatch.status === 'ASSIGNED' && (
                      <button
                        onClick={() => handleUpdateStatus(dispatch.id, 'EN_ROUTE')}
                        disabled={isRowUpdating}
                        className="w-full lg:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Despachar (En Ruta)
                      </button>
                    )}

                    {dispatch.status === 'EN_ROUTE' && (
                      <button
                        onClick={() => handleUpdateStatus(dispatch.id, 'COMPLETED')}
                        disabled={isRowUpdating}
                        className="w-full lg:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Marcar Entregado
                      </button>
                    )}

                    {dispatch.status === 'COMPLETED' && (
                      <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {dispatch.completed_at
                          ? new Date(dispatch.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Entregado'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Barra de Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-3 bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 text-xs">
              <span className="text-stone-500 dark:text-zinc-400">
                Mostrando página <strong className="text-stone-900 dark:text-white">{currentPage}</strong> de{' '}
                <strong className="text-stone-900 dark:text-white">{totalPages}</strong> ({filteredDispatches.length}{' '}
                despachos)
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 text-stone-700 dark:text-zinc-300" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 text-stone-700 dark:text-zinc-300" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
