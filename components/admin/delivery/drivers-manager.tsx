'use client';

import React, { useState, useEffect } from 'react';
import {
  Bike,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Phone,
  MessageCircle,
  FileText,
  Car,
  Footprints,
  Shield,
  Loader2,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DeliveryDriver, DeliveryZone } from '@/lib/plugins/delivery-fleet';
import { sanitizeWhatsAppPhone } from '@/lib/plugins/delivery-fleet';

interface DriversManagerProps {
  slug: string;
}

export function DriversManager({ slug }: DriversManagerProps) {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDriver, setEditingDriver] = useState<DeliveryDriver | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [fullName, setFullName] = useState('');
  const [idDocument, setIdDocument] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [homeZoneId, setHomeZoneId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const [dRes, zRes] = await Promise.all([
        fetch(`/api/tenant/${slug}/delivery/drivers`),
        fetch(`/api/tenant/${slug}/delivery/zones`),
      ]);
      const dData = await dRes.json();
      const zData = await zRes.json();

      if (dData.success) setDrivers(dData.drivers || []);
      if (zData.success) setZones(zData.zones || []);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar lista de repartidores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [slug]);

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingDriver(null);
    setFullName('');
    setIdDocument('');
    setLicensePlate('');
    setPhone('');
    setVehicleType('motorcycle');
    setHomeZoneId('');
    setNotes('');
    setIsActive(true);
  };

  const handleStartEdit = (driver: DeliveryDriver) => {
    setEditingDriver(driver);
    setIsCreating(false);
    setFullName(driver.full_name);
    setIdDocument(driver.id_document);
    setLicensePlate(driver.license_plate);
    setPhone(driver.phone);
    setVehicleType(driver.vehicle_type || 'motorcycle');
    setHomeZoneId(driver.home_zone_id || '');
    setNotes(driver.notes || '');
    setIsActive(driver.is_active);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingDriver(null);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !idDocument.trim() || !licensePlate.trim() || !phone.trim()) {
      toast.error('Por favor completa todos los campos obligatorios');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        full_name: fullName.trim(),
        id_document: idDocument.trim(),
        license_plate: licensePlate.trim().toUpperCase(),
        phone: phone.trim(),
        vehicle_type: vehicleType,
        home_zone_id: homeZoneId || null,
        is_active: isActive,
        notes: notes.trim() || null,
      };

      const url = editingDriver
        ? `/api/tenant/${slug}/delivery/drivers/${editingDriver.id}`
        : `/api/tenant/${slug}/delivery/drivers`;
      const method = editingDriver ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar repartidor');
      }

      toast.success(editingDriver ? 'Repartidor actualizado' : 'Repartidor registrado con éxito');
      handleCancel();
      fetchDrivers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al procesar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (driver: DeliveryDriver) => {
    try {
      const res = await fetch(`/api/tenant/${slug}/delivery/drivers/${driver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !driver.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `Repartidor ${driver.full_name} marcado como ${!driver.is_active ? 'Activo' : 'Inactivo'}`
        );
        fetchDrivers();
      } else {
        toast.error(data.error || 'No se pudo actualizar el estado');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión');
    }
  };

  const getVehicleIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'car':
      case 'carro':
        return <Car className="w-3.5 h-3.5 text-blue-500" />;
      case 'bicycle':
      case 'bicicleta':
        return <Bike className="w-3.5 h-3.5 text-amber-500" />;
      case 'on_foot':
      case 'a pie':
        return <Footprints className="w-3.5 h-3.5 text-stone-500" />;
      case 'motorcycle':
      case 'moto':
      default:
        return <Bike className="w-3.5 h-3.5 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-[#141416] p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Directorio de Motorizados y Repartidores
          </h2>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
            Gestiona la flota de choferes independientes con asignación en vivo y contacto directo por WhatsApp.
          </p>
        </div>
        {!isCreating && !editingDriver && (
          <button
            onClick={handleStartCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Registrar Repartidor
          </button>
        )}
      </div>

      {/* Formulario de Chofer */}
      {(isCreating || editingDriver) && (
        <form
          onSubmit={handleSaveDriver}
          className="bg-white dark:bg-[#141416] p-6 rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 shadow-md space-y-4 animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
            <h3 className="font-bold text-sm text-stone-900 dark:text-zinc-100 flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-600" />
              {editingDriver ? `Modificar Chofer: ${editingDriver.full_name}` : 'Nuevo Repartidor'}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Cédula / Documento *
              </label>
              <input
                type="text"
                required
                value={idDocument}
                onChange={(e) => setIdDocument(e.target.value)}
                placeholder="Ej. V-20123456"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Placa del Vehículo *
              </label>
              <input
                type="text"
                required
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                placeholder="Ej. AF8K99"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Teléfono Celular (WhatsApp) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. 04121234567"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Tipo de Vehículo
              </label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white"
              >
                <option value="motorcycle">Motocicleta (Moto)</option>
                <option value="bicycle">Bicicleta</option>
                <option value="car">Automóvil (Carro)</option>
                <option value="on_foot">A Pie / Peatonal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Zona Habitual
              </label>
              <select
                value={homeZoneId}
                onChange={(e) => setHomeZoneId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white"
              >
                <option value="">Sin zona fija (Toda la ciudad)</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Notas y Observaciones
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Chofer con caja térmica de 45L. Disponible fines de semana."
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-stone-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
              />
              Repartidor activo para despachos
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {editingDriver ? 'Guardar Cambios' : 'Registrar Chofer'}
            </button>
          </div>
        </form>
      )}

      {/* Listado de Choferes */}
      <div className="bg-white dark:bg-[#141416] rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
            Flota de Repartidores ({drivers.length})
          </h3>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-stone-400 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
            Cargando directorio de repartidores...
          </div>
        ) : drivers.length === 0 ? (
          <div className="py-12 text-center text-stone-400 text-xs">
            No hay repartidores registrados en este comercio.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50/80 dark:bg-zinc-900/60 border-b border-stone-100 dark:border-zinc-800 text-stone-500 font-semibold">
                <tr>
                  <th className="py-3 px-4">Chofer</th>
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Vehículo / Placa</th>
                  <th className="py-3 px-4">Teléfono</th>
                  <th className="py-3 px-4">Zona Habitual</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-zinc-800">
                {drivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-stone-900 dark:text-white">
                      {driver.full_name}
                      {driver.notes && (
                        <p className="text-[10px] text-stone-400 font-normal">{driver.notes}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-stone-600 dark:text-zinc-400">
                      {driver.id_document}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        {getVehicleIcon(driver.vehicle_type)}
                        <span className="font-mono font-bold text-stone-800 dark:text-zinc-200">
                          {driver.license_plate}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={`https://wa.me/${sanitizeWhatsAppPhone(driver.phone)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-mono font-semibold"
                        title="Abrir WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        {driver.phone}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-stone-600 dark:text-zinc-400">
                      {driver.home_zone_name || 'Sin zona fija'}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleStatus(driver)}
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                          driver.is_active
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                            : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 border border-stone-200 dark:border-zinc-700 hover:bg-stone-200'
                        }`}
                        title="Clic para cambiar estado"
                      >
                        {driver.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`https://wa.me/${sanitizeWhatsAppPhone(driver.phone)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                          title="Enviar mensaje WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => handleStartEdit(driver)}
                          className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-600 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Editar chofer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(driver)}
                          className={`p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors ${
                            driver.is_active ? 'hover:text-amber-600' : 'hover:text-emerald-600'
                          }`}
                          title={driver.is_active ? 'Desactivar chofer' : 'Reactivar chofer'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
