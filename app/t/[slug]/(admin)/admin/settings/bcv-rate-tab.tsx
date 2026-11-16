'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Coins,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  Check,
  CheckCircle2,
  Scale,
  ArrowRightLeft,
  Sliders,
  DollarSign,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type BcvRegimeMode = 'bcv_direct' | 'bcv_average' | 'bcv_cross_eur' | 'custom_spread';

interface BcvTabData {
  isPluginActive?: boolean;
  primaryCurrency?: 'USD' | 'EUR';
  activeRate: number;
  secondaryCurrency: string;
  liveBcv: {
    usdRate: number;
    eurRate?: number;
    usdtRate?: number;
    source: string;
    timestamp: string;
  };
  bcvRegime?: {
    mode: BcvRegimeMode;
    customRate?: number | null;
  };
  igtfEnabled: boolean;
  fiscalRif: string;
}

export function BcvRateTab({ slug }: { slug: string }) {
  const [data, setData] = useState<BcvTabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Estados locales editables
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'EUR'>('USD');
  const [selectedRegime, setSelectedRegime] = useState<BcvRegimeMode>('bcv_direct');
  const [customRateInput, setCustomRateInput] = useState<string>('');

  // Simulador de precios
  const [simTestAmount, setSimTestAmount] = useState<string>('10.00');

  // IGTF y Fiscal
  const [togglingIgtf, setTogglingIgtf] = useState(false);
  const [fiscalRif, setFiscalRif] = useState('');
  const [savingRif, setSavingRif] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setSelectedCurrency(json.primaryCurrency || 'USD');
        const regMode = (json.bcvRegime?.mode as BcvRegimeMode) || 'bcv_direct';
        setSelectedRegime(regMode);
        if (json.bcvRegime?.customRate) {
          setCustomRateInput(String(json.bcvRegime.customRate));
        }
        setFiscalRif(json.fiscalRif || '');
      } else {
        toast.error('No se pudo cargar la configuración de divisas');
      }
    } catch {
      toast.error('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [slug]);

  // Tasas en vivo
  const liveUsd = data?.liveBcv?.usdRate || 0;
  const liveEur = data?.liveBcv?.eurRate || (liveUsd > 0 ? liveUsd * 1.09 : 0);
  const liveAvg = liveUsd > 0 && liveEur > 0 ? (liveUsd + liveEur) / 2 : liveUsd;

  // Cálculo de tasa simulada en vivo según el régimen seleccionado
  const simulatedRate = useMemo(() => {
    switch (selectedRegime) {
      case 'bcv_average':
        return liveAvg;
      case 'bcv_cross_eur':
        return liveEur;
      case 'custom_spread': {
        const parsed = parseFloat(customRateInput.replace(',', '.'));
        return !isNaN(parsed) && parsed > 0 ? parsed : liveUsd;
      }
      case 'bcv_direct':
      default:
        return selectedCurrency === 'EUR' ? liveEur : liveUsd;
    }
  }, [selectedRegime, selectedCurrency, liveUsd, liveEur, liveAvg, customRateInput]);

  // Nombre legible del modo activo
  const regimeModeLabel = useMemo(() => {
    switch (selectedRegime) {
      case 'bcv_average':
        return 'MODO: TASA PROMEDIO (USD + EUR)/2';
      case 'bcv_cross_eur':
        return 'MODO: TASA CRUZADA (EUR)';
      case 'custom_spread':
        return 'MODO: TASA ESPECIAL PERSONALIZADA';
      case 'bcv_direct':
      default:
        return selectedCurrency === 'EUR' ? 'MODO: TASA OFICIAL BCV EUR' : 'MODO: TASA OFICIAL BCV USD';
    }
  }, [selectedRegime, selectedCurrency]);

  // Cálculo del simulador
  const simAmountNum = parseFloat(simTestAmount.replace(',', '.')) || 0;
  const simVesTotal = simAmountNum * (simulatedRate > 0 ? simulatedRate : 1);

  // Guardar configuración completa (Moneda Base + Régimen)
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      // 1. Si cambió la moneda base, persistirla
      if (selectedCurrency !== data?.primaryCurrency) {
        const curRes = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_base_currency', currency: selectedCurrency }),
        });
        if (!curRes.ok) throw new Error('Error al actualizar moneda base');
      }

      // 2. Guardar régimen de tasa
      const customRateVal = selectedRegime === 'custom_spread' ? parseFloat(customRateInput.replace(',', '.')) : null;
      const regRes = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_regime',
          mode: selectedRegime,
          customRate: customRateVal && !isNaN(customRateVal) ? customRateVal : null,
        }),
      });

      if (!regRes.ok) throw new Error('Error al guardar régimen de conversión');

      toast.success('Configuración cambiaria guardada exitosamente', {
        description: `Tasa efectiva activa para catálogo y POS: Bs. ${simulatedRate.toFixed(2)}`,
      });

      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle IGTF
  const handleToggleIgtf = async () => {
    if (!data) return;
    const nextState = !data.igtfEnabled;
    setTogglingIgtf(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_igtf', enabled: nextState }),
      });
      if (res.ok) {
        toast.success(nextState ? 'Régimen IGTF 3% activado' : 'Régimen IGTF 3% desactivado');
        setData({ ...data, igtfEnabled: nextState });
      } else {
        toast.error('Error al actualizar régimen IGTF');
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setTogglingIgtf(false);
    }
  };

  // Guardar RIF
  const handleSaveRif = async () => {
    if (!fiscalRif.trim()) {
      toast.error('Ingresa un RIF válido (Ej: J-12345678-9)');
      return;
    }
    setSavingRif(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fiscal_info', fiscalRif }),
      });
      if (res.ok) {
        toast.success('RIF fiscal guardado para reportes SENIAT');
      } else {
        toast.error('Error al guardar RIF fiscal');
      }
    } catch {
      toast.error('Error de red');
    } finally {
      setSavingRif(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
        <p className="text-xs text-stone-500 dark:text-zinc-400 font-mono">
          Cargando parámetros cambiarios y política de conversión...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* TARJETA PRINCIPAL: MONEDA BASE & RÉGIMEN BCV (REFERENCIA EXACTA)         */}
      {/* ========================================================================= */}
      <Card className="bg-white dark:bg-[#121214] border border-stone-200/90 dark:border-zinc-800/90 shadow-xs overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-6">
          {/* Cabecera del Módulo */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-100 dark:border-zinc-800/80">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Coins className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base text-stone-900 dark:text-white">
                    Moneda Base & Régimen de Conversión BCV
                  </h3>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60">
                    {regimeModeLabel}
                  </span>
                </div>
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  Define la divisa en la que cotizas tu catálogo ($ USD o € EUR) y cómo se calcula el valor equivalente en Bolívares (Bs.) al cotizar y liquidar pedidos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-auto flex-wrap">
              <div className="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-900 text-xs font-mono font-bold text-stone-800 dark:text-zinc-200 shadow-2xs">
                <span className="text-[10px] uppercase text-stone-400 block font-sans font-semibold">TASA EFECTIVA ACTIVA</span>
                <span className="text-sm font-black text-stone-900 dark:text-white">
                  1 {selectedCurrency} = Bs. {simulatedRate.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* SECCIÓN 1: MONEDA BASE DEL CATÁLOGO COMERCIAL                         */}
          {/* ===================================================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center justify-center text-stone-600 dark:text-zinc-300">
                1
              </span>
              <h4 className="font-extrabold text-sm text-stone-900 dark:text-white">
                Moneda Base del Catálogo Comercial
              </h4>
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 pl-7">
              Los precios de tus productos en el inventario y catálogo público se registrarán y exhibirán en esta divisa.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Opción USD */}
              <div
                onClick={() => setSelectedCurrency('USD')}
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-3 relative',
                  selectedCurrency === 'USD'
                    ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/10 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/40 hover:bg-stone-50'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">🇺🇸</span>
                    <div>
                      <h5 className="font-extrabold text-sm text-stone-900 dark:text-white leading-tight">
                        Dólar Estadounidense (USD)
                      </h5>
                      <span className="text-[11px] text-stone-400 font-mono">Símbolo oficial: $</span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center transition-all',
                      selectedCurrency === 'USD'
                        ? 'bg-rose-600 border-rose-600 text-white'
                        : 'border-stone-300 dark:border-zinc-700'
                    )}
                  >
                    {selectedCurrency === 'USD' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                  Tus productos se publican con precios en dólares (ej: $15.00). Recomendado para la gran mayoría de comercios y minimarkets.
                </p>

                <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-400 font-sans text-[11px]">Tasa oficial BCV USD:</span>
                  <span className="font-black text-stone-900 dark:text-white">Bs. {liveUsd.toFixed(2)}</span>
                </div>
              </div>

              {/* Opción EUR */}
              <div
                onClick={() => setSelectedCurrency('EUR')}
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-3 relative',
                  selectedCurrency === 'EUR'
                    ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/10 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/40 hover:bg-stone-50'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl leading-none">🇪🇺</span>
                    <div>
                      <h5 className="font-extrabold text-sm text-stone-900 dark:text-white leading-tight">
                        Euro Europeo (EUR)
                      </h5>
                      <span className="text-[11px] text-stone-400 font-mono">Símbolo oficial: €</span>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center transition-all',
                      selectedCurrency === 'EUR'
                        ? 'bg-rose-600 border-rose-600 text-white'
                        : 'border-stone-300 dark:border-zinc-700'
                    )}
                  >
                    {selectedCurrency === 'EUR' && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                  Tus productos se publican con precios en euros (ej: €15.00). Ideal para bodegones, farmacias e importadoras de insumos europeos.
                </p>

                <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-400 font-sans text-[11px]">Tasa oficial BCV EUR:</span>
                  <span className="font-black text-stone-900 dark:text-white">Bs. {liveEur.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* SECCIÓN 2: RÉGIMEN DE TASA PARA CONVERSIÓN A BOLÍVARES (4 OPCIONES)    */}
          {/* ===================================================================== */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center justify-center text-stone-600 dark:text-zinc-300">
                2
              </span>
              <h4 className="font-extrabold text-sm text-stone-900 dark:text-white">
                Régimen de Tasa para Conversión a Bolívares (Bs.)
              </h4>
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 pl-7">
              Elige la modalidad para multiplicar el precio base de tus productos al generar montos en moneda nacional (Bs.).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Opción 1: Oficial BCV Directo */}
              <div
                onClick={() => setSelectedRegime('bcv_direct')}
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 relative flex flex-col justify-between',
                  selectedRegime === 'bcv_direct'
                    ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/10 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/40 hover:bg-stone-50'
                )}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-stone-900 dark:text-white">
                          Oficial BCV Directo ({selectedCurrency})
                        </h5>
                        <span className="text-[10px] text-stone-400">Tasa legal exacta de tu moneda base</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0',
                        selectedRegime === 'bcv_direct'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-stone-300 dark:border-zinc-700'
                      )}
                    >
                      {selectedRegime === 'bcv_direct' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-2">
                    Aplica estrictamente la tasa BCV oficial del día para {selectedCurrency === 'EUR' ? 'Euros' : 'Dólares'}.
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-400 font-sans text-[11px]">Tasa aplicada:</span>
                  <span className="font-black text-stone-900 dark:text-white">
                    Bs. {(selectedCurrency === 'EUR' ? liveEur : liveUsd).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Opción 2: Tasa Promedio (USD + EUR) / 2 */}
              <div
                onClick={() => setSelectedRegime('bcv_average')}
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 relative flex flex-col justify-between',
                  selectedRegime === 'bcv_average'
                    ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/10 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/40 hover:bg-stone-50'
                )}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center">
                        <Scale className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-stone-900 dark:text-white">
                          Tasa Promedio (USD + EUR) / 2
                        </h5>
                        <span className="text-[10px] text-stone-400">Punto medio ponderado oficial</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0',
                        selectedRegime === 'bcv_average'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-stone-300 dark:border-zinc-700'
                      )}
                    >
                      {selectedRegime === 'bcv_average' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-2">
                    Suma ambas tasas oficiales ({liveUsd.toFixed(2)} + {liveEur.toFixed(2)}) y divide entre 2.
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-400 font-sans text-[11px]">Promedio calculado:</span>
                  <span className="font-black text-stone-900 dark:text-white">Bs. {liveAvg.toFixed(2)}</span>
                </div>
              </div>

              {/* Opción 3: Tasa Cruzada (Referencia EUR) */}
              <div
                onClick={() => setSelectedRegime('bcv_cross_eur')}
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 relative flex flex-col justify-between',
                  selectedRegime === 'bcv_cross_eur'
                    ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/10 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/40 hover:bg-stone-50'
                )}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
                        <ArrowRightLeft className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-stone-900 dark:text-white">
                          Tasa Cruzada (Referencia EUR)
                        </h5>
                        <span className="text-[10px] text-stone-400">Cotiza en USD pero liquida con EUR</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0',
                        selectedRegime === 'bcv_cross_eur'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-stone-300 dark:border-zinc-700'
                      )}
                    >
                      {selectedRegime === 'bcv_cross_eur' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-2">
                    Precios fijados en Dólares pero convertidos a Bolívares usando la tasa BCV del Euro.
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                  <span className="text-stone-400 font-sans text-[11px]">Tasa cruzada:</span>
                  <span className="font-black text-stone-900 dark:text-white">Bs. {liveEur.toFixed(2)}</span>
                </div>
              </div>

              {/* Opción 4: Tasa Especial Personalizada */}
              <div
                onClick={() => setSelectedRegime('custom_spread')}
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 relative flex flex-col justify-between',
                  selectedRegime === 'custom_spread'
                    ? 'border-rose-500 bg-rose-50/20 dark:bg-rose-950/10 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-stone-200 dark:border-zinc-800 bg-stone-50/40 dark:bg-zinc-900/40 hover:bg-stone-50'
                )}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-stone-900 dark:text-white">
                          Tasa Especial Personalizada
                        </h5>
                        <span className="text-[10px] text-stone-400">Valor manual o spread acordado</span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0',
                        selectedRegime === 'custom_spread'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-stone-300 dark:border-zinc-700'
                      )}
                    >
                      {selectedRegime === 'custom_spread' && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-2">
                    Ingresa una tasa fija manual en Bolívares según tus políticas internas o costes de reposición.
                  </p>
                </div>

                {selectedRegime === 'custom_spread' ? (
                  <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <label className="text-[11px] font-bold text-stone-700 dark:text-zinc-300">
                      Tasa en Bolívares:
                    </label>
                    <div className="relative">
                      <span className="text-xs font-bold text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 font-mono">
                        Bs.
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="1"
                        value={customRateInput}
                        onChange={(e) => setCustomRateInput(e.target.value)}
                        placeholder={`Ej: ${liveUsd.toFixed(2)}`}
                        className="pl-9 h-8 text-xs rounded-xl font-mono font-bold"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-stone-200/60 dark:border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                    <span className="text-stone-400 font-sans text-[11px]">Valor configurado:</span>
                    <span className="font-bold text-amber-600">
                      {customRateInput ? `Bs. ${customRateInput}` : 'Sin definir'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* SECCIÓN 3: SIMULADOR DE PRECIOS EN TIENDA (PREVISUALIZACIÓN EN VIVO)   */}
          {/* ===================================================================== */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-zinc-800 text-[11px] font-bold flex items-center justify-center text-stone-600 dark:text-zinc-300">
                3
              </span>
              <h4 className="font-extrabold text-sm text-stone-900 dark:text-white">
                Simulador de Precios en Tienda (Previsualización en Vivo)
              </h4>
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 pl-7">
              Prueba cómo verán tus clientes los precios en el catálogo público y el monto exacto a pagar en Bolívares.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 items-center">
              {/* Input: Monto de prueba */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                  Monto de prueba en {selectedCurrency}:
                </label>
                <div className="relative">
                  <span className="text-xs font-bold text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 font-mono">
                    {selectedCurrency === 'EUR' ? '€' : '$'}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={simTestAmount}
                    onChange={(e) => setSimTestAmount(e.target.value)}
                    placeholder="10.00"
                    className="pl-8 h-12 text-sm rounded-xl font-mono font-bold"
                  />
                </div>
              </div>

              {/* Caja 1: Precio Visible en Catálogo */}
              <div className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block">
                  PRECIO VISIBLE EN CATÁLOGO
                </span>
                <p className="text-2xl font-black font-mono text-rose-600 tracking-tight">
                  {selectedCurrency === 'EUR' ? '€' : '$'}{simAmountNum.toFixed(2)}
                </p>
                <p className="text-[11px] text-stone-400">
                  Moneda base: {selectedCurrency}
                </p>
              </div>

              {/* Caja 2: Equivalente en Bolívares */}
              <div className="p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                  EQUIVALENTE EN BOLÍVARES (VES)
                </span>
                <p className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400 tracking-tight">
                  Bs. {simVesTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 font-mono">
                  Liquidado a: Bs. {simulatedRate.toFixed(2)} por 1 {selectedCurrency}
                </p>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* FOOTER & BOTÓN GUARDAR CONFIGURACIÓN                                  */}
          {/* ===================================================================== */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-stone-200/80 dark:border-zinc-800">
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Al guardar, todos los cambios se sincronizan en la nube y se reflejan al instante en catálogo y POS.
            </p>

            <Button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="h-10 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center gap-2 self-start sm:self-auto transition"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Guardar Todo</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SECCIÓN ADICIONAL: ENLACE AL MONITOR DE AUDITORÍA & CONTROLES FISCALES    */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Acceso Rápido al Monitor de Tasas */}
        <Card className="bg-white dark:bg-[#121214] border border-stone-200/80 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-stone-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Monitor Oficial e Historial BCV</span>
              </h4>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-300">
                AUDITORÍA
              </Badge>
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Consulta el histórico inmutable de tasas, variaciones día a día y fuerza sincronizaciones en tiempo real con el Banco Central.
            </p>
            <Link
              href={`/t/${slug}/admin/rates`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:underline pt-1"
            >
              <span>Abrir Monitor de Tasas (/admin/rates)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </CardContent>
        </Card>

        {/* Configuración Fiscal SENIAT & IGTF */}
        <Card className="bg-white dark:bg-[#121214] border border-stone-200/80 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-stone-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-500" />
                <span>Régimen IGTF 3% & RIF Emisor</span>
              </h4>
              <Badge className={data?.igtfEnabled ? 'bg-emerald-500/10 text-emerald-700 text-[10px]' : 'bg-stone-100 text-stone-600 text-[10px]'}>
                {data?.igtfEnabled ? 'IGTF ACTIVO' : 'IGTF INACTIVO'}
              </Badge>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-stone-800 dark:text-zinc-200">Impuesto IGTF 3%</p>
                <p className="text-[11px] text-stone-400">Pagos en divisas efectivo (CASH_USD)</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={data?.igtfEnabled ? 'outline' : 'default'}
                onClick={handleToggleIgtf}
                disabled={togglingIgtf}
                className="h-8 text-xs font-bold rounded-lg cursor-pointer"
              >
                {togglingIgtf ? '...' : data?.igtfEnabled ? 'Desactivar' : 'Activar 3%'}
              </Button>
            </div>

            <div className="pt-2 border-t border-stone-100 dark:border-zinc-800/80 flex items-center gap-2">
              <Input
                type="text"
                placeholder="RIF: J-50123456-7"
                value={fiscalRif}
                onChange={(e) => setFiscalRif(e.target.value)}
                className="h-8 text-xs font-mono uppercase rounded-lg"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSaveRif}
                disabled={savingRif}
                className="h-8 text-xs font-bold rounded-lg cursor-pointer shrink-0"
              >
                {savingRif ? '...' : 'Guardar RIF'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
