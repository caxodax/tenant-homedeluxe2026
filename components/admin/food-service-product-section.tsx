'use client';

import React from 'react';
import { Utensils, Package, Plus, Trash2, Sparkles, Check, ChefHat, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface AdminVariantItem {
  id?: string;
  name: string;
  size?: string;
  protein?: string;
  price: string;
  stock: string;
  is_default?: boolean;
}

export interface ModifierGroupSummary {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
}

export interface RawMaterialSummary {
  id: string;
  name: string;
  unit: string;
  cost_per_unit_primary: number;
  current_stock: number;
}

interface FoodServiceProductSectionProps {
  isDishMode: boolean;
  setIsDishMode: (v: boolean) => void;
  stockControlMode: 'SIMPLE' | 'UNLIMITED' | 'RAW_MATERIAL';
  setStockControlMode: (v: 'SIMPLE' | 'UNLIMITED' | 'RAW_MATERIAL') => void;
  variants: AdminVariantItem[];
  setVariants: React.Dispatch<React.SetStateAction<AdminVariantItem[]>>;
  selectedModifierGroupIds: string[];
  setSelectedModifierGroupIds: React.Dispatch<React.SetStateAction<string[]>>;
  modifierGroups: ModifierGroupSummary[];
  rawMaterials: RawMaterialSummary[];
  currencySymbol: string;
  primaryCurrency: string;
}

export function FoodServiceProductSection({
  isDishMode,
  setIsDishMode,
  stockControlMode,
  setStockControlMode,
  variants,
  setVariants,
  selectedModifierGroupIds,
  setSelectedModifierGroupIds,
  modifierGroups,
  rawMaterials: _rawMaterials,
  currencySymbol,
  primaryCurrency,
}: FoodServiceProductSectionProps) {
  // Manejo de variantes
  const handleAddVariant = (name = '', price = '', size = '', protein = '') => {
    setVariants((prev) => [
      ...prev,
      {
        name: name || `Variante ${prev.length + 1}`,
        price: price || '5.99',
        stock: '50',
        size: size || undefined,
        protein: protein || undefined,
        is_default: prev.length === 0,
      },
    ]);
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateVariant = (index: number, field: keyof AdminVariantItem, val: any) => {
    setVariants((prev) => {
      const next = [...prev];
      if (field === 'is_default' && val === true) {
        next.forEach((v, i) => {
          v.is_default = i === index;
        });
      } else {
        next[index] = { ...next[index], [field]: val };
      }
      return next;
    });
  };

  const handleQuickLoadSizes = () => {
    setVariants([
      { name: 'Pequeño', size: 'Pequeño', price: '5.99', stock: '30', is_default: false },
      { name: 'Grande', size: 'Grande', price: '7.99', stock: '50', is_default: true },
    ]);
  };

  const toggleModifierGroup = (groupId: string) => {
    setSelectedModifierGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. Selector de Tipo de Producto (Impeccable Segmented Pill) */}
      <div className="p-1 bg-stone-100 dark:bg-zinc-800/80 rounded-2xl border border-stone-200/80 dark:border-zinc-700/80 flex">
        <button
          type="button"
          onClick={() => setIsDishMode(false)}
          className={cn(
            'flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 select-none',
            !isDishMode
              ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-white shadow-xs'
              : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
          )}
        >
          <Package className="w-3.5 h-3.5 text-stone-500" />
          <span>Producto Estándar</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setIsDishMode(true);
            if (variants.length === 0) {
              handleQuickLoadSizes();
            }
          }}
          className={cn(
            'flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 select-none',
            isDishMode
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
          )}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span>Platillo de Restaurante / Variantes</span>
        </button>
      </div>

      {/* Si está en modo Platillo, desplegamos las opciones avanzadas */}
      {isDishMode && (
        <div className="p-4 sm:p-5 rounded-2xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-800/40 space-y-5 animate-in fade-in duration-200">
          {/* 2. Control de Inventario (Configurable por Producto o Herencia) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <ChefHat className="w-4 h-4 text-orange-600" />
                <span>Control de Inventario de este Platillo</span>
              </label>
              <span className="text-[10px] text-stone-500 font-medium">100% Configurable</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Opción 1: Stock Simple */}
              <button
                type="button"
                onClick={() => setStockControlMode('SIMPLE')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between',
                  stockControlMode === 'SIMPLE'
                    ? 'bg-white dark:bg-zinc-900 border-orange-500 shadow-xs'
                    : 'bg-white/60 dark:bg-zinc-900/60 border-stone-200 dark:border-zinc-800 hover:border-stone-300'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-stone-900 dark:text-white">Stock Simple</span>
                  {stockControlMode === 'SIMPLE' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Defines existencias directas por cada tamaño (ej. 50 uds).
                </p>
              </button>

              {/* Opción 2: Venta Libre */}
              <button
                type="button"
                onClick={() => setStockControlMode('UNLIMITED')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between',
                  stockControlMode === 'UNLIMITED'
                    ? 'bg-white dark:bg-zinc-900 border-orange-500 shadow-xs'
                    : 'bg-white/60 dark:bg-zinc-900/60 border-stone-200 dark:border-zinc-800 hover:border-stone-300'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-stone-900 dark:text-white">Venta Libre</span>
                  {stockControlMode === 'UNLIMITED' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Siempre disponible en caja y web. No bloquea nunca ventas.
                </p>
              </button>

              {/* Opción 3: Escandallo Materia Prima */}
              <button
                type="button"
                onClick={() => setStockControlMode('RAW_MATERIAL')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between',
                  stockControlMode === 'RAW_MATERIAL'
                    ? 'bg-white dark:bg-zinc-900 border-orange-500 shadow-xs'
                    : 'bg-white/60 dark:bg-zinc-900/60 border-stone-200 dark:border-zinc-800 hover:border-stone-300'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-stone-900 dark:text-white">Materias Primas</span>
                  {stockControlMode === 'RAW_MATERIAL' && <Check className="w-3.5 h-3.5 text-orange-600" />}
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Descuenta carne, arroz y envases con receta en cada pedido.
                </p>
              </button>
            </div>
          </div>

          {/* 3. Variantes de Tamaño / Proteína */}
          <div className="space-y-3 pt-2 border-t border-orange-200/60 dark:border-orange-800/30">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider">
                  Variantes de Tamaño / Porción
                </h4>
                <p className="text-[11px] text-stone-500">
                  Fija el precio neto final de cada opción (no duplicas productos en el catálogo).
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleQuickLoadSizes}
                  className="px-2 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Preset Rápido</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddVariant()}
                  className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Añadir</span>
                </button>
              </div>
            </div>

            {/* Lista de Filas de Variantes */}
            <div className="space-y-2">
              {variants.map((v, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 shadow-2xs flex flex-wrap items-center gap-2"
                >
                  {/* Nombre de la Variante */}
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">
                      Nombre / Tamaño
                    </label>
                    <Input
                      type="text"
                      value={v.name}
                      onChange={(e) => handleUpdateVariant(idx, 'name', e.target.value)}
                      placeholder="Ej. Grande - Carne"
                      className="h-8 text-xs font-semibold rounded-lg"
                    />
                  </div>

                  {/* Precio Final Venta */}
                  <div className="w-24">
                    <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">
                      Precio {currencySymbol}
                    </label>
                    <div className="relative">
                      <span className="text-[11px] font-bold text-stone-400 absolute left-2 top-1/2 -translate-y-1/2 font-mono">
                        {currencySymbol}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={v.price}
                        onChange={(e) => handleUpdateVariant(idx, 'price', e.target.value)}
                        placeholder="7.99"
                        className="pl-6 h-8 text-xs font-mono font-bold rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Stock por Variante (Solo si modo es SIMPLE) */}
                  {stockControlMode === 'SIMPLE' && (
                    <div className="w-20">
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-0.5">
                        Stock Uds
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={v.stock}
                        onChange={(e) => handleUpdateVariant(idx, 'stock', e.target.value)}
                        placeholder="50"
                        className="h-8 text-xs font-mono rounded-lg"
                      />
                    </div>
                  )}

                  {/* Radio "Por Defecto" */}
                  <div className="flex items-center gap-1.5 pt-3 sm:pt-4">
                    <label className="flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-zinc-400 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="default_variant"
                        checked={Boolean(v.is_default)}
                        onChange={() => handleUpdateVariant(idx, 'is_default', true)}
                        className="accent-orange-600 cursor-pointer"
                      />
                      <span>Predeterminado</span>
                    </label>
                  </div>

                  {/* Botón Eliminar Fila */}
                  {variants.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVariant(idx)}
                      className="w-7 h-7 rounded-lg text-stone-400 hover:text-rose-600 flex items-center justify-center cursor-pointer transition mt-3 sm:mt-4"
                      title="Eliminar variante"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 4. Modificadores y Adicionales Sugeridos (Upselling) */}
          {modifierGroups.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-orange-200/60 dark:border-orange-800/30">
              <label className="text-xs font-black text-stone-900 dark:text-white uppercase tracking-wider block">
                Adicionales y Bebidas Sugeridas (Upselling)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modifierGroups.map((mg) => {
                  const isChecked = selectedModifierGroupIds.includes(mg.id);
                  return (
                    <label
                      key={mg.id}
                      onClick={() => toggleModifierGroup(mg.id)}
                      className={cn(
                        'p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all select-none',
                        isChecked
                          ? 'bg-white dark:bg-zinc-900 border-orange-500 shadow-2xs'
                          : 'bg-white/50 dark:bg-zinc-900/40 border-stone-200 dark:border-zinc-800 hover:border-stone-300'
                      )}
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-xs font-bold text-stone-900 dark:text-white block truncate">
                          {mg.name}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {mg.min_select > 0 ? 'Obligatorio' : 'Opcional'} · Máx {mg.max_select}
                        </span>
                      </div>
                      <div
                        className={cn(
                          'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition',
                          isChecked
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800'
                        )}
                      >
                        {isChecked && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Banner Informativo del Modo Seleccionado */}
          <div className="p-2.5 rounded-xl bg-orange-100/60 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 flex items-start gap-2 text-stone-700 dark:text-orange-200 text-[11px]">
            <Info className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
            <p className="leading-snug">
              {stockControlMode === 'SIMPLE' &&
                'Modo Stock Simple: El inventario se controlará con el número de unidades definido en cada tamaño.'}
              {stockControlMode === 'UNLIMITED' &&
                'Modo Venta Libre: El platillo siempre estará disponible para la venta en el POS y la Vitrina Digital sin restricción de stock.'}
              {stockControlMode === 'RAW_MATERIAL' &&
                'Modo Materias Primas: Las ventas de este platillo descontarán automáticamente los ingredientes de la despensa de cocina mediante su receta.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
