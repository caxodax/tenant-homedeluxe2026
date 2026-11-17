'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tag,
  Percent,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Layers,
  Sparkles,
  Info,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ModalPortal } from '@/components/ui/modal-portal';

export interface DiscountPreset {
  id: string;
  name: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  is_active: boolean;
}

export interface DiscountSettings {
  allow_stacked: boolean;
  presets: DiscountPreset[];
}

export function DiscountsTab({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowStacked, setAllowStacked] = useState(false);
  const [presets, setPresets] = useState<DiscountPreset[]>([]);

  // Estado para crear o editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [formValue, setFormValue] = useState<string>('10');

  useEffect(() => {
    loadSettings();
  }, [slug]);

  async function loadSettings() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/${slug}/settings`);
      if (res.ok) {
        const data = await res.json();
        const disc: DiscountSettings = data.settings?.discounts || {
          allow_stacked: false,
          presets: [],
        };
        setAllowStacked(Boolean(disc.allow_stacked));
        setPresets(Array.isArray(disc.presets) ? disc.presets : []);
      }
    } catch {
      toast.error('Error al cargar la configuración de descuentos');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(newAllowStacked: boolean, newPresets: DiscountPreset[]) {
    try {
      setSaving(true);
      const payload = {
        discounts: {
          allow_stacked: newAllowStacked,
          presets: newPresets,
        },
      };

      const res = await fetch(`/api/admin/${slug}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Descuentos actualizados correctamente');
      } else {
        const err = await res.json();
        toast.error('Error al guardar', { description: err.error });
      }
    } catch {
      toast.error('Error de red al guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  function handleToggleStacked() {
    const nextVal = !allowStacked;
    setAllowStacked(nextVal);
    saveSettings(nextVal, presets);
  }

  function handleTogglePresetActive(id: string) {
    const next = presets.map((p) => (p.id === id ? { ...p, is_active: !p.is_active } : p));
    setPresets(next);
    saveSettings(allowStacked, next);
  }

  function handleDeletePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    saveSettings(allowStacked, next);
    toast.info('Descuento eliminado');
  }

  function openCreateModal() {
    setEditingId(null);
    setFormName('');
    setFormType('PERCENTAGE');
    setFormValue('10');
    setModalOpen(true);
  }

  function openEditModal(preset: DiscountPreset) {
    setEditingId(preset.id);
    setFormName(preset.name);
    setFormType(preset.type);
    setFormValue(preset.value.toString());
    setModalOpen(true);
  }

  function handleSaveModal(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(formValue);
    if (!formName.trim()) {
      toast.error('El nombre del descuento es requerido');
      return;
    }
    if (isNaN(val) || val <= 0) {
      toast.error('El valor debe ser un número positivo');
      return;
    }
    if (formType === 'PERCENTAGE' && val > 100) {
      toast.error('El porcentaje no puede ser mayor a 100%');
      return;
    }

    let next: DiscountPreset[];
    if (editingId) {
      next = presets.map((p) =>
        p.id === editingId
          ? { ...p, name: formName.trim(), type: formType, value: val }
          : p
      );
    } else {
      const newPreset: DiscountPreset = {
        id: crypto.randomUUID ? crypto.randomUUID() : `disc_${Date.now()}`,
        name: formName.trim(),
        type: formType,
        value: val,
        is_active: true,
      };
      next = [...presets, newPreset];
    }

    setPresets(next);
    setModalOpen(false);
    saveSettings(allowStacked, next);
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-lime-600 dark:text-lime-400" />
        <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
          Cargando configuración de descuentos...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera / Banner descriptivo */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-lime-500/10 text-lime-600 dark:text-lime-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Gestión de Descuentos & Políticas de Caja
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Crea descuentos preconfigurados para mostrador (POS) y define si se permite acumular más de un descuento en la misma venta.
              </p>
            </div>
          </div>

          <Button
            onClick={openCreateModal}
            size="sm"
            className="bg-lime-600 hover:bg-lime-700 text-white font-medium text-xs shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo Descuento
          </Button>
        </div>
      </div>

      {/* Regla general: Acumulación de descuentos */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
                <Label className="text-sm font-semibold text-slate-900 dark:text-white cursor-pointer" onClick={handleToggleStacked}>
                  Permitir acumulación de múltiples descuentos
                </Label>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-2xl">
                {allowStacked
                  ? 'Activo: El cajero puede aplicar varios descuentos al mismo ticket (ej. 10% por temporada y $5 por cortesía o detalle).'
                  : 'Inactivo: Al seleccionar un nuevo descuento en caja, este sustituye al anterior para proteger los márgenes del comercio.'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={allowStacked}
              onClick={handleToggleStacked}
              disabled={saving}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden',
                allowStacked ? 'bg-lime-600' : 'bg-slate-200 dark:bg-zinc-700'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                  allowStacked ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Listado de Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
            Descuentos Preconfigurados ({presets.length})
          </h3>
          <span className="text-xs text-slate-400 dark:text-zinc-500">
            Aparecen como botones rápidos en el POS
          </span>
        </div>

        {presets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 p-8 text-center bg-slate-50/50 dark:bg-zinc-900/50">
            <Tag className="w-8 h-8 text-slate-400 dark:text-zinc-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
              No hay descuentos preconfigurados
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-md mx-auto">
              Crea promociones frecuentes (ej. Descuento Empleado 10%, Detalle Estético $5, Clientes VIP 15%) para que el cajero los aplique en 1 toque.
            </p>
            <Button
              onClick={openCreateModal}
              variant="outline"
              size="sm"
              className="mt-4 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Crear primer descuento
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={cn(
                  'flex items-center justify-between p-4 rounded-xl border transition-all duration-150',
                  preset.is_active
                    ? 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                    : 'border-slate-200/60 dark:border-zinc-800/60 bg-slate-50/60 dark:bg-zinc-900/40 opacity-70'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      preset.type === 'PERCENTAGE'
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {preset.type === 'PERCENTAGE' ? (
                      <Percent className="w-4 h-4" />
                    ) : (
                      <DollarSign className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {preset.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-mono font-medium',
                          preset.type === 'PERCENTAGE'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        )}
                      >
                        {preset.type === 'PERCENTAGE' ? `${preset.value}%` : `-$${preset.value.toFixed(2)}`}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      {preset.type === 'PERCENTAGE' ? 'Porcentual sobre subtotal' : 'Monto fijo deducible'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTogglePresetActive(preset.id)}
                    className={cn(
                      'p-1.5 rounded-md text-xs transition-colors',
                      preset.is_active
                        ? 'text-lime-600 hover:bg-lime-50 dark:hover:bg-lime-950/30'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    )}
                    title={preset.is_active ? 'Desactivar' : 'Activar'}
                  >
                    {preset.is_active ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(preset)}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeletePreset(preset.id)}
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal / Dialog para Crear o Editar */}
      {modalOpen && (
        <ModalPortal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <form onSubmit={handleSaveModal}>
                <div className="p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {editingId ? 'Editar Descuento' : 'Nuevo Descuento'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Nombre */}
                  <div className="space-y-1.5">
                    <Label htmlFor="disc-name" className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Nombre o Motivo
                    </Label>
                    <Input
                      id="disc-name"
                      placeholder="Ej. Descuento Empleado, Detalle Estético, Promo Black Friday"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      className="text-xs"
                    />
                  </div>

                  {/* Selector de Tipo */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                      Modalidad del Descuento
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormType('PERCENTAGE')}
                        className={cn(
                          'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-colors',
                          formType === 'PERCENTAGE'
                            ? 'border-blue-500 bg-blue-50/70 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-600 dark:text-zinc-400'
                        )}
                      >
                        <Percent className="w-3.5 h-3.5" />
                        Porcentaje (%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormType('FIXED_AMOUNT')}
                        className={cn(
                          'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-colors',
                          formType === 'FIXED_AMOUNT'
                            ? 'border-emerald-500 bg-emerald-50/70 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-600 dark:text-zinc-400'
                        )}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Monto Fijo ($)
                      </button>
                    </div>
                  </div>

                  {/* Valor */}
                  <div className="space-y-1.5">
                    <Label htmlFor="disc-val" className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                      {formType === 'PERCENTAGE' ? 'Porcentaje de Rebaja (%)' : 'Monto Fijo a Descontar ($)'}
                    </Label>
                    <div className="relative">
                      <Input
                        id="disc-val"
                        type="number"
                        step={formType === 'PERCENTAGE' ? '0.5' : '0.01'}
                        min="0.01"
                        max={formType === 'PERCENTAGE' ? '100' : '99999'}
                        value={formValue}
                        onChange={(e) => setFormValue(e.target.value)}
                        required
                        className="text-xs pl-7"
                      />
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        {formType === 'PERCENTAGE' ? '%' : '$'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-zinc-950 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-lime-600 hover:bg-lime-700 text-white text-xs font-medium"
                  >
                    Guardar Descuento
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
