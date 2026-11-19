'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Plus, Minus, Utensils, Sparkles, ChefHat } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-portal';

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  attributes: {
    size?: string;
    size_label?: string;
    protein?: string;
    protein_label?: string;
    is_default?: boolean;
    [key: string]: unknown;
  };
  price_adjustment_primary: number | string;
  current_stock?: number | string;
}

export interface ModifierOption {
  product_id: string;
  name: string;
  price_primary: number | string;
}

export interface ModifierGroup {
  group_id: string;
  group_name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  options: ModifierOption[];
}

export interface CustomizableProduct {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  price_usd: number | string;
  price_primary?: number | string;
  image_url?: string;
  variants?: ProductVariant[];
  modifier_groups?: ModifierGroup[];
}

export interface CustomizerResult {
  product_id: string;
  product_name: string;
  variant_id?: string;
  variant_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  selected_modifiers: Array<{ id: string; name: string; price: number }>;
  prep_notes?: string;
}

interface FoodProductCustomizerModalProps {
  product: CustomizableProduct;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: CustomizerResult) => void;
  primaryCurrency?: string;
  exchangeRate?: number | null;
}

export function FoodProductCustomizerModal({
  product,
  isOpen,
  onClose,
  onConfirm,
  primaryCurrency = 'USD',
  exchangeRate,
}: FoodProductCustomizerModalProps) {
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';
  const effectiveRate = Number(exchangeRate || 0);
  const basePrice = Number(product.price_usd || product.price_primary || 0);

  const variants = useMemo(() => product.variants || [], [product.variants]);
  const modifierGroups = useMemo(() => product.modifier_groups || [], [product.modifier_groups]);

  // Extraer tamaños y proteínas únicas de las variantes
  const sizes = useMemo(() => {
    const map = new Map<string, { key: string; label: string; isDefault: boolean }>();
    variants.forEach((v) => {
      const key = v.attributes.size || 'STANDARD';
      const label = v.attributes.size_label || key;
      if (!map.has(key)) {
        map.set(key, { key, label, isDefault: Boolean(v.attributes.is_default) });
      }
    });
    return Array.from(map.values());
  }, [variants]);

  const proteins = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    variants.forEach((v) => {
      if (v.attributes.protein) {
        const key = v.attributes.protein;
        const label = v.attributes.protein_label || key;
        if (!map.has(key)) {
          map.set(key, { key, label });
        }
      }
    });
    return Array.from(map.values());
  }, [variants]);

  // Selección de tamaño por defecto: Preferir "GRANDE", o el marcado is_default, o el primero
  const defaultSizeKey = useMemo(() => {
    const grande = sizes.find((s) => s.key.toUpperCase() === 'GRANDE');
    if (grande) return grande.key;
    const marked = sizes.find((s) => s.isDefault);
    if (marked) return marked.key;
    return sizes[0]?.key || '';
  }, [sizes]);

  const defaultProteinKey = useMemo(() => {
    return proteins[0]?.key || '';
  }, [proteins]);

  const [selectedSize, setSelectedSize] = useState<string>(defaultSizeKey);
  const [selectedProtein, setSelectedProtein] = useState<string>(defaultProteinKey);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, ModifierOption>>({});
  const [prepNotes, setPrepNotes] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);

  // Sincronizar defaults al abrir
  useEffect(() => {
    if (isOpen) {
      setSelectedSize(defaultSizeKey);
      setSelectedProtein(defaultProteinKey);
      setSelectedModifiers({});
      setPrepNotes('');
      setQuantity(1);
    }
  }, [isOpen, defaultSizeKey, defaultProteinKey]);

  // Encontrar la variante activa seleccionada
  const activeVariant = useMemo(() => {
    if (variants.length === 0) return null;
    return (
      variants.find(
        (v) =>
          (v.attributes.size || '') === selectedSize &&
          (!selectedProtein || (v.attributes.protein || '') === selectedProtein)
      ) || variants[0]
    );
  }, [variants, selectedSize, selectedProtein]);

  // Calcular precio de cada proteína dado el tamaño actualmente seleccionado
  const getProteinPrice = (proteinKey: string) => {
    const match = variants.find(
      (v) =>
        (v.attributes.size || '') === selectedSize &&
        (v.attributes.protein || '') === proteinKey
    );
    if (match) {
      return basePrice + Number(match.price_adjustment_primary || 0);
    }
    return basePrice;
  };

  // Precio unitario final = Variante base seleccionada + Adicionales seleccionados
  const unitPrice = useMemo(() => {
    const variantAdj = activeVariant ? Number(activeVariant.price_adjustment_primary || 0) : 0;
    const modsTotal = Object.values(selectedModifiers).reduce(
      (sum, m) => sum + Number(m.price_primary || 0),
      0
    );
    return Math.round((basePrice + variantAdj + modsTotal) * 100) / 100;
  }, [basePrice, activeVariant, selectedModifiers]);

  const totalPrice = Math.round(unitPrice * quantity * 100) / 100;
  const totalVes = effectiveRate > 0 ? (totalPrice * effectiveRate).toFixed(2) : null;

  const toggleModifier = (group: ModifierGroup, option: ModifierOption) => {
    setSelectedModifiers((prev) => {
      const next = { ...prev };
      if (next[option.product_id]) {
        delete next[option.product_id];
      } else {
        // Si max_select === 1 (ej. Bebida única), desmarcar otras del mismo grupo
        if (group.max_select === 1) {
          group.options.forEach((opt) => {
            delete next[opt.product_id];
          });
        }
        next[option.product_id] = option;
      }
      return next;
    });
  };

  const handleAdd = () => {
    const modifierList = Object.values(selectedModifiers).map((m) => ({
      id: m.product_id,
      name: m.name,
      price: Number(m.price_primary || 0),
    }));

    onConfirm({
      product_id: product.id,
      product_name: product.name,
      variant_id: activeVariant?.id,
      variant_name: activeVariant?.name,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      selected_modifiers: modifierList,
      prep_notes: prepNotes.trim() || undefined,
    });
    onClose();
  };

  if (!isOpen) return null;

  // Detección de acompañantes incluidos
  const includedItems = [
    'Arroz blanco',
    'Pico de gallo',
    'Frijoles refritos',
    'Full quesito',
    'Totopos / Nachos',
  ];

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full sm:max-w-xl bg-white dark:bg-[#121214] sm:rounded-3xl rounded-t-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-slate-100 dark:border-zinc-800/80 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-orange-500/10 text-orange-600 dark:text-orange-400">
                Personalizar Platillo
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
              {product.name}
            </h2>
            {product.description && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2">
                {product.description}
              </p>
            )}
          </div>

          {/* Cuerpo Scrolleable */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* 1. Selector de Tamaño (Porción) si existen variantes con tamaño */}
            {sizes.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5 text-orange-500" />
                    1. Tamaño de la Porción
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">Requerido</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {sizes.map((s) => {
                    const isSelected = selectedSize === s.key;
                    const isGrande = s.key.toUpperCase() === 'GRANDE';
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setSelectedSize(s.key)}
                        className={`relative p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 shadow-xs ring-2 ring-orange-500/20'
                            : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {s.label}
                          </span>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? 'border-orange-500 bg-orange-500 text-white'
                                : 'border-slate-300 dark:border-zinc-700'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                          {isGrande ? 'Porción generosa (Recomendado)' : 'Porción personal estándar'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Selector de Proteína si existen variantes con proteína */}
            {proteins.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <ChefHat className="w-3.5 h-3.5 text-orange-500" />
                    2. Escoge tu Proteína
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">Precio final según tamaño</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {proteins.map((p) => {
                    const isSelected = selectedProtein === p.key;
                    const finalPrice = getProteinPrice(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedProtein(p.key)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 shadow-xs ring-2 ring-orange-500/20'
                            : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {p.label}
                          </span>
                          <div
                            className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? 'border-orange-500 bg-orange-500 text-white'
                                : 'border-slate-300 dark:border-zinc-700'
                            }`}
                          >
                            {isSelected && <Check className="w-2 h-2 stroke-[3]" />}
                          </div>
                        </div>
                        <p className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-1.5">
                          {currencySymbol}{finalPrice.toFixed(2)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Bloque Informativo: Acompañantes Incluidos */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/60 dark:border-zinc-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-zinc-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Acompañantes Incluidos:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {includedItems.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-700 shadow-2xs"
                  >
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* 4. Modificadores y Extras (Salsas, Bebidas Opcionales) */}
            {modifierGroups.map((group) => (
              <div key={group.group_id} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                    {group.group_name}
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {group.max_select === 1 ? 'Elige hasta 1' : `Opcional (máx ${group.max_select})`}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {group.options.map((opt) => {
                    const isSelected = Boolean(selectedModifiers[opt.product_id]);
                    const price = Number(opt.price_primary || 0);
                    return (
                      <button
                        key={opt.product_id}
                        type="button"
                        onClick={() => toggleModifier(group, opt)}
                        className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20'
                            : 'border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                              isSelected
                                ? 'border-orange-500 bg-orange-500 text-white'
                                : 'border-slate-300 dark:border-zinc-700'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-zinc-200">
                            {opt.name}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-xs text-slate-700 dark:text-zinc-300">
                          +{currencySymbol}{price.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* 5. Notas especiales para la cocina */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                Notas especiales para cocina
              </label>
              <input
                type="text"
                placeholder="Ej. Salsa picante aparte, sin cebolla..."
                value={prepNotes}
                onChange={(e) => setPrepNotes(e.target.value)}
                maxLength={140}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Footer de Acción con Precio Dinámico */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800/80 bg-slate-50/80 dark:bg-zinc-900/80 shrink-0 flex items-center justify-between gap-4">
            {/* Selector de cantidad */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 p-1 rounded-xl border border-slate-200 dark:border-zinc-700 shrink-0">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center hover:bg-slate-200 transition cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center font-mono font-bold text-sm text-slate-900 dark:text-white">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center hover:bg-slate-200 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Botón de Agregar con Precio Final Neto */}
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm flex items-center justify-between shadow-lg shadow-orange-600/20 transition cursor-pointer"
            >
              <span>Agregar al Pedido</span>
              <div className="text-right font-mono">
                <span>{currencySymbol}{totalPrice.toFixed(2)}</span>
                {totalVes && effectiveRate > 0 && (
                  <span className="block text-[10px] font-normal text-orange-200">
                    Bs. {totalVes}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
    </ModalPortal>
  );
}
