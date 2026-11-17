'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Landmark,
  RefreshCw,
  TrendingUp,
  Search,
  Plus,
  Coins,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  X,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ModalPortal } from '@/components/ui/modal-portal';

interface ExchangeRateHistoryItem {
  id: string;
  date_rate: string;
  rate_ves_usd: string;
  rate_eur_usd?: string | null;
  rate_usdt?: string | null;
  source: string;
  variation?: number;
  created_at: string;
}

interface RatesApiResponse {
  isPluginActive: boolean;
  primaryCurrency: string;
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
    mode: string;
    customRate?: number | null;
  };
  history: ExchangeRateHistoryItem[];
}

export default function RatesAdminPage() {
  const params = useParams() as { slug: string };
  const slug = params.slug;

  const [data, setData] = useState<RatesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualRateInput, setManualRateInput] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // Cargar datos
  const loadRates = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('No se pudo cargar el monitor de tasas');
      }
    } catch {
      toast.error('Error de red al consultar tasas');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadRates();
  }, [slug]);

  // Sincronizar BCV en vivo
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Tasa BCV sincronizada exitosamente', {
          description: `USD: ${json.rateInfo.usdRate} Bs. | EUR: ${json.rateInfo.eurRate || 'N/A'} Bs.`,
        });
        await loadRates(true);
      } else {
        toast.error('Error al sincronizar con BCV', { description: json.error });
      }
    } catch {
      toast.error('Fallo de red al solicitar sincronización');
    } finally {
      setSyncing(false);
    }
  };

  // Guardar tasa manual de contingencia
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(manualRateInput.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      toast.error('Ingresa una tasa numérica válida mayor a 0');
      return;
    }

    setSavingManual(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'manual', rate: val }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success('Tasa manual de contingencia fijada', {
          description: `Tasa activa en catálogo y vitrina: Bs. ${val.toFixed(2)}`,
        });
        setIsManualModalOpen(false);
        setManualRateInput('');
        await loadRates(true);
      } else {
        toast.error('Error al guardar tasa manual', { description: json.error });
      }
    } catch {
      toast.error('Fallo de conexión');
    } finally {
      setSavingManual(false);
    }
  };

  // Tasas calculadas
  const liveUsd = data?.liveBcv?.usdRate || 0;
  const liveEur = data?.liveBcv?.eurRate || (liveUsd > 0 ? liveUsd * 1.09 : 0);
  const liveAvg = liveUsd > 0 && liveEur > 0 ? (liveUsd + liveEur) / 2 : liveUsd;
  const liveUsdt = data?.liveBcv?.usdtRate || (liveUsd > 0 ? liveUsd * 1.15 : 0);
  const activeEffectiveRate = data?.activeRate || liveUsd;

  // Fecha valor / timestamp seguro sin desplazamiento UTC
  const formatRateDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return { dayName: '—', isoDate: '' };
    const isoDate = dateStr.split('T')[0] || '';
    const parts = isoDate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day, 12, 0, 0);
      const dayName = d.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      return { dayName, isoDate };
    }
    const dObj = new Date(dateStr);
    return {
      dayName: isNaN(dObj.getTime()) ? isoDate : dObj.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }),
      isoDate,
    };
  };

  const dateStr = data?.liveBcv?.timestamp
    ? data.liveBcv.timestamp.split('T')[0]
    : new Date().toISOString().split('T')[0];

  const dateReadable = useMemo(() => {
    try {
      if (data?.liveBcv?.timestamp) {
        return formatRateDate(data.liveBcv.timestamp).dayName;
      }
      return new Date().toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }, [data?.liveBcv?.timestamp, dateStr]);

  // Historial filtrado
  const filteredHistory = useMemo(() => {
    if (!data?.history) return [];
    if (!searchQuery.trim()) return data.history;
    const q = searchQuery.toLowerCase().trim();
    return data.history.filter((item) => {
      const d = item.date_rate?.toLowerCase() || '';
      const s = item.source?.toLowerCase() || '';
      return d.includes(q) || s.includes(q);
    });
  }, [data?.history, searchQuery]);

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
        <p className="text-xs text-stone-500 dark:text-zinc-400 font-mono">
          Cargando monitor de tasas BCV y mercados oficiales...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. CABECERA PRINCIPAL                                                    */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight">
            Tasas y Divisas (BCV)
          </h1>
          <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
            Monitor oficial BCV y fijación de tasas comerciales
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {activeEffectiveRate > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex items-center gap-1.5 font-bold font-mono text-stone-800 dark:text-zinc-200 shadow-2xs">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Bs.</span>
              <span>
                {activeEffectiveRate.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <RefreshCw className="w-3 h-3 text-stone-400 ml-0.5" />
            </div>
          )}

          <Link
            href={`/t/${slug}`}
            target="_blank"
            className="h-8.5 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-stone-50 dark:hover:bg-zinc-800 text-xs font-bold text-stone-700 dark:text-zinc-300 flex items-center gap-1.5 transition shadow-2xs"
          >
            <span>Vitrina</span>
            <ExternalLink className="w-3 h-3 text-stone-400" />
          </Link>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PANEL HERO: TASAS OFICIALES Y CONVERSIÓN                              */}
      {/* ========================================================================= */}
      <Card className="border border-stone-200/90 dark:border-zinc-800/90 shadow-xs bg-white dark:bg-[#121214] overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-6">
          {/* Header del Panel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100 dark:border-zinc-800/80">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Landmark className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-black text-base text-stone-900 dark:text-white">
                    Tasas Oficiales y Conversión
                  </h2>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                    FECHA: {dateStr}
                  </span>
                </div>
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  Tasa legal de referencia para la conversión automática a Bolívares (VES) en catálogo, checkout y pagos.
                </p>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center gap-2 shrink-0 transition"
            >
              <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
              <span>{syncing ? 'Sincronizando...' : 'Sincronizar BCV Ahora'}</span>
            </Button>
          </div>

          {/* 4 Hero Cards (Grid 1 col movil, 2 sm, 4 lg) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CARD 1: DÓLAR OFICIAL (BCV) */}
            <div className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-extrabold text-stone-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-base leading-none">🇺🇸</span>
                  <span>Dólar Oficial (BCV)</span>
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 shrink-0">
                  ALCAMBIO (BCV)
                </span>
              </div>
              <div className="space-y-0.5">
                <p className="text-2xl sm:text-3xl font-black font-mono text-stone-950 dark:text-white tracking-tight">
                  {liveUsd.toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-stone-500 dark:text-zinc-400">Bs. / USD</span>
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 flex items-center gap-1 font-mono">
                  <span>🕒 Fecha Valor: {dateReadable}</span>
                </p>
              </div>
            </div>

            {/* CARD 2: EURO OFICIAL (BCV) */}
            <div className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-extrabold text-stone-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-base leading-none">🇪🇺</span>
                  <span>Euro Oficial (BCV)</span>
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shrink-0">
                  BCV OFICIAL
                </span>
              </div>
              <div className="space-y-0.5">
                <p className="text-2xl sm:text-3xl font-black font-mono text-stone-950 dark:text-white tracking-tight">
                  {liveEur.toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-stone-500 dark:text-zinc-400">Bs. / EUR</span>
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 flex items-center gap-1 font-mono">
                  <span>🕒 Fecha Valor: {dateReadable}</span>
                </p>
              </div>
            </div>

            {/* CARD 3: PROMEDIO (USD+EUR)/2 */}
            <div className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-extrabold text-stone-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-emerald-600 font-black">+</span>
                  <span>Promedio (USD+EUR)/2</span>
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                  PUNTO MEDIO
                </span>
              </div>
              <div className="space-y-0.5">
                <p className="text-2xl sm:text-3xl font-black font-mono text-stone-950 dark:text-white tracking-tight">
                  {liveAvg.toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-stone-500 dark:text-zinc-400">Bs. / Promedio</span>
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 flex items-center gap-1">
                  <span>Suma y división en tiempo real</span>
                </p>
              </div>
            </div>

            {/* CARD 4: USDT PROMEDIO (P2P) */}
            <div className="p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-extrabold text-stone-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                  <span>USDT Promedio (P2P)</span>
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shrink-0">
                  BINANCE P2P
                </span>
              </div>
              <div className="space-y-0.5">
                <p className="text-2xl sm:text-3xl font-black font-mono text-stone-950 dark:text-white tracking-tight">
                  {liveUsdt.toFixed(2)}{' '}
                  <span className="text-xs font-semibold text-stone-500 dark:text-zinc-400">Bs. / USDT</span>
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 flex items-center gap-1">
                  <span>Mercado Cripto Referencial</span>
                </p>
              </div>
            </div>
          </div>

          {/* Sub-banner: Cron autónomo + Carga Manual */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-stone-100 dark:border-zinc-800/80 text-xs">
            <div className="flex items-center gap-2 text-stone-500 dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Cron Autónomo: Sincronización nativa en Base de Datos a las 7:00 AM VET (pg_cron en PostgreSQL)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <span>+ Carga Manual de Contingencia</span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 3. HISTÓRICO DE TASAS DIARIAS                                            */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-base text-stone-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-500" />
              <span>Histórico de Tasas Diarias</span>
            </h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Registro inmutable de tasas según el día de la transacción para auditorías, cortes y contabilidad.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Buscar fecha o fuente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8.5 h-9 text-xs rounded-xl"
              />
            </div>
            <span className="text-xs font-mono font-bold text-stone-500 dark:text-zinc-400 bg-stone-100 dark:bg-zinc-800 px-2.5 py-1.5 rounded-xl shrink-0">
              {filteredHistory.length} fechas
            </span>
          </div>
        </div>

        {/* TABLA ESCRITORIO (hidden md:block) */}
        <div className="hidden md:block">
          <Card className="border-stone-200/80 dark:border-zinc-800/80 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50/80 dark:bg-zinc-900/60 border-b border-stone-200/80 dark:border-zinc-800 text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-3 px-4">FECHA / DÍA</th>
                    <th className="py-3 px-4">TASA USD (BCV)</th>
                    <th className="py-3 px-4">TASA EUR (BCV)</th>
                    <th className="py-3 px-4">USDT PROMEDIO (P2P)</th>
                    <th className="py-3 px-4">FUENTE</th>
                    <th className="py-3 px-4 text-right">VARIACIÓN VS PREVIO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-zinc-800/80 font-mono">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-500 dark:text-zinc-400">
                        No hay registros que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item) => {
                      const ves = parseFloat(item.rate_ves_usd);
                      const eur = item.rate_eur_usd ? parseFloat(item.rate_eur_usd) : null;
                      const usdt = item.rate_usdt ? parseFloat(item.rate_usdt) : null;
                      const variation = item.variation ?? 0;
                      const { dayName, isoDate } = formatRateDate(item.date_rate);

                      return (
                        <tr key={item.id} className="hover:bg-stone-50/60 dark:hover:bg-zinc-900/40 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-stone-900 dark:text-white capitalize block">
                              {dayName}
                            </span>
                            <span className="text-[10px] text-stone-400">{isoDate}</span>
                          </td>
                          <td className="py-3 px-4 font-black text-stone-900 dark:text-white">
                            Bs. {ves.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-stone-600 dark:text-zinc-400">
                            {eur ? `Bs. ${eur.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3 px-4 text-stone-600 dark:text-zinc-400">
                            {usdt ? `Bs. ${usdt.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[11px] font-sans px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300">
                              {item.source}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {variation > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60">
                                <ArrowUpRight className="w-3 h-3" />
                                +{variation.toFixed(2)}%
                              </span>
                            ) : variation < 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200/60">
                                <ArrowDownRight className="w-3 h-3" />
                                {variation.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-stone-400">0.00%</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* VISTA MÓVIL (md:hidden): TARJETAS COMPACTAS SIN SCROLL HORIZONTAL */}
        <div className="md:hidden space-y-3">
          {filteredHistory.length === 0 ? (
            <div className="py-8 text-center text-stone-500 bg-white dark:bg-[#121214] rounded-2xl border border-stone-200/80 p-6">
              No hay registros disponibles.
            </div>
          ) : (
            filteredHistory.map((item) => {
              const ves = parseFloat(item.rate_ves_usd);
              const eur = item.rate_eur_usd ? parseFloat(item.rate_eur_usd) : null;
              const usdt = item.rate_usdt ? parseFloat(item.rate_usdt) : null;
              const variation = item.variation ?? 0;
              const { dayName, isoDate } = formatRateDate(item.date_rate);

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#121214] border border-stone-200/80 dark:border-zinc-800/80 shadow-xs space-y-2.5 font-mono"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-stone-950 dark:text-white capitalize leading-tight">
                        {dayName}
                      </p>
                      <p className="text-[10px] text-stone-400">{isoDate}</p>
                    </div>

                    {variation > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60">
                        <ArrowUpRight className="w-3 h-3" />
                        +{variation.toFixed(2)}%
                      </span>
                    ) : variation < 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200/60">
                        <ArrowDownRight className="w-3 h-3" />
                        {variation.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-stone-400">0.00%</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-100 dark:border-zinc-800/80 text-center">
                    <div className="p-1.5 rounded-lg bg-stone-50 dark:bg-zinc-900/60">
                      <span className="text-[9px] font-sans font-bold text-stone-400 block uppercase">USD BCV</span>
                      <span className="text-xs font-black text-stone-900 dark:text-white">Bs. {ves.toFixed(2)}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-stone-50 dark:bg-zinc-900/60">
                      <span className="text-[9px] font-sans font-bold text-stone-400 block uppercase">EUR BCV</span>
                      <span className="text-xs font-bold text-stone-700 dark:text-zinc-300">{eur ? `Bs. ${eur.toFixed(2)}` : '—'}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-stone-50 dark:bg-zinc-900/60">
                      <span className="text-[9px] font-sans font-bold text-stone-400 block uppercase">USDT P2P</span>
                      <span className="text-xs font-bold text-stone-700 dark:text-zinc-300">{usdt ? `Bs. ${usdt.toFixed(2)}` : '—'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-stone-400 font-sans pt-1">
                    <span>Fuente:</span>
                    <span className="font-semibold text-stone-700 dark:text-zinc-300">{item.source}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: CARGA MANUAL DE CONTINGENCIA                                      */}
      {/* ========================================================================= */}
      <ModalPortal
        isOpen={isManualModalOpen}
        onClose={() => !savingManual && setIsManualModalOpen(false)}
        backdropClassName="bg-black/70 backdrop-blur-xs"
        containerClassName="p-4 items-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-stone-900 dark:text-white leading-tight">
                  Carga Manual de Contingencia
                </h3>
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  Fija una tasa en Bs. en caso de caída de internet o emergencia.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsManualModalOpen(false)}
              disabled={savingManual}
              className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveManual} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                Nueva Tasa de Contingencia (Bs. por USD / Moneda Base) *
              </label>
              <div className="relative">
                <span className="text-xs font-bold text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 font-mono">
                  Bs.
                </span>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="1"
                  value={manualRateInput}
                  onChange={(e) => setManualRateInput(e.target.value)}
                  placeholder={`Ej: ${activeEffectiveRate.toFixed(2)}`}
                  className="pl-9 h-10 text-sm rounded-xl font-mono font-bold"
                  disabled={savingManual}
                />
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                Esta tasa se aplicará de inmediato al catálogo, vitrina y terminal de Punto de Venta (POS).
              </p>
            </div>

            <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsManualModalOpen(false)}
                disabled={savingManual}
                className="h-9 text-xs px-4 rounded-xl cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingManual || !manualRateInput}
                className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {savingManual ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    Fijando...
                  </>
                ) : (
                  <span>Fijar Tasa Manual</span>
                )}
              </Button>
            </div>
          </form>
        </div>
      </ModalPortal>
    </div>
  );
}
