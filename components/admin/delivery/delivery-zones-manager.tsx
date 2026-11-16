'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Clock,
  DollarSign,
  AlertCircle,
  Loader2,
  Layers,
  Sparkles,
  Navigation,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DeliveryZone } from '@/lib/plugins/delivery-fleet';

interface DeliveryZonesManagerProps {
  slug: string;
  currencySymbol?: string;
}

export function DeliveryZonesManager({ slug, currencySymbol = '$' }: DeliveryZonesManagerProps) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(5.0);
  const [ratePrimary, setRatePrimary] = useState<number>(2.5);
  const [estimatedTime, setEstimatedTime] = useState('25-35 min');
  const [isActive, setIsActive] = useState(true);

  // Fetch zones
  const fetchZones = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenant/${slug}/delivery/zones?all=true`);
      const data = await res.json();
      if (data.success) {
        setZones(data.zones || []);
      } else {
        toast.error('Error al cargar zonas de delivery');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión al obtener zonas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
  }, [slug]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setRadiusKm(5.0);
    setRatePrimary(2.5);
    setEstimatedTime('25-35 min');
    setIsActive(true);
    setEditingZone(null);
    setIsCreating(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleOpenEdit = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setName(zone.name);
    setDescription(zone.description || '');
    setRadiusKm(Number(zone.radius_km) || 5.0);
    setRatePrimary(Number(zone.rate_primary) || 0);
    setEstimatedTime(zone.estimated_time || '30-45 min');
    setIsActive(zone.is_active);
    setIsCreating(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('El nombre de la zona es obligatorio');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        center_lat: 10.064, // Coordenada de referencia Barquisimeto
        center_lng: -69.324,
        radius_km: Number(radiusKm),
        rate_primary: Number(ratePrimary),
        estimated_time: estimatedTime.trim(),
        is_active: isActive,
        sort_order: 0,
      };

      let res;
      if (editingZone) {
        res = await fetch(`/api/tenant/${slug}/delivery/zones/${editingZone.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/tenant/${slug}/delivery/zones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar la zona');
      }

      toast.success(editingZone ? 'Zona actualizada con éxito' : 'Zona de delivery creada');
      resetForm();
      fetchZones();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zoneId: string, zoneName: string) => {
    if (!confirm(`¿Estás seguro de eliminar la zona "${zoneName}"?`)) return;

    try {
      const res = await fetch(`/api/tenant/${slug}/delivery/zones/${zoneId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Zona eliminada exitosamente');
        fetchZones();
      } else {
        toast.error(data.error || 'No se pudo eliminar la zona');
      }
    } catch (err) {
      toast.error('Error al intentar eliminar la zona');
    }
  };

  const handleToggleActive = async (zone: DeliveryZone) => {
    try {
      const res = await fetch(`/api/tenant/${slug}/delivery/zones/${zone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !zone.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        setZones(zones.map((z) => (z.id === zone.id ? { ...z, is_active: !z.is_active } : z)));
        toast.success(`Zona ${!zone.is_active ? 'activada' : 'desactivada'}`);
      }
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Zonas de Cobertura Delivery
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full">
                {zones.filter((z) => z.is_active).length} activas
              </span>
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Define los perímetros de despacho, tarifas fijas de envío y tiempos estimados para tu tienda.
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nueva Zona
        </button>
      </div>

      {/* Grid de Zonas */}
      {loading ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Cargando zonas de cobertura...</p>
        </div>
      ) : zones.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800">
          <MapPin className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200">No hay zonas configuradas</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mt-1 mb-5">
            Crea tu primera zona de despacho (ej: Centro de la Ciudad) para que tus clientes puedan cotizar su envío al momento de comprar.
          </p>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl"
          >
            <Plus className="w-4 h-4" /> Crear Zona Ahora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className={`p-5 rounded-2xl border transition-all ${
                zone.is_active
                  ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-emerald-500/50'
                  : 'bg-zinc-50 dark:bg-zinc-950/50 border-zinc-200 dark:border-zinc-800/60 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                      zone.is_active
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{zone.name}</h3>
                    <span className="text-xs text-zinc-400 flex items-center gap-1">
                      <Layers className="w-3 h-3" /> Radio: {zone.radius_km} km
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleActive(zone)}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold border transition-colors ${
                    zone.is_active
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {zone.is_active ? 'Activa' : 'Inactiva'}
                </button>
              </div>

              {zone.description && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4 line-clamp-2">
                  {zone.description}
                </p>
              )}

              {/* Métricas clave */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl mb-4 text-xs">
                <div>
                  <span className="text-zinc-400 block mb-0.5">Tarifa Despacho:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {currencySymbol} {Number(zone.rate_primary).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">Tiempo Estimado:</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {zone.estimated_time || '30-45 min'}
                  </span>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => handleOpenEdit(zone)}
                  className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={() => handleDelete(zone.id, zone.name)}
                  className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal / Panel Flotante de Creación y Edición */}
      {(isCreating || editingZone) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-lg">
                  {editingZone ? 'Editar Zona de Cobertura' : 'Nueva Zona de Cobertura'}
                </h3>
              </div>
              <button
                onClick={resetForm}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Nombre de la Zona <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Centro de la Ciudad, Este / Urb. del Este"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Tarifa de Envío ({currencySymbol}) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-400 text-sm font-semibold">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={ratePrimary}
                      onChange={(e) => setRatePrimary(parseFloat(e.target.value) || 0)}
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Tiempo Estimado
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 20-30 min"
                    value={estimatedTime}
                    onChange={(e) => setEstimatedTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Radio de Cobertura (Kilómetros)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="0.5"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-600"
                  />
                  <span className="font-bold text-sm text-zinc-800 dark:text-zinc-200 min-w-[3.5rem] text-right">
                    {radiusKm} km
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Descripción o Referencias de Cobertura
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Abarca desde la Av. Vargas hasta la Catedral, calles 21 a la 42..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="zoneActiveSwitch"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 accent-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="zoneActiveSwitch" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 select-none cursor-pointer">
                  Zona activa disponible para los clientes en vitrina
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition-all"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingZone ? 'Guardar Cambios' : 'Crear Zona'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
