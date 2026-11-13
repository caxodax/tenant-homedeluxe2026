'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Coins,
  TrendingUp,
  Download,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExchangeRateHistoryItem {
  id: string;
  date_rate: string;
  rate_ves_usd: string;
  rate_eur_usd?: string | null;
  source: string;
  created_at: string;
}

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
  igtfEnabled: boolean;
  fiscalRif: string;
  history: ExchangeRateHistoryItem[];
}

export function BcvRateTab({ slug }: { slug: string }) {
  const [data, setData] = useState<BcvTabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingCurrency, setChangingCurrency] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualRate, setManualRate] = useState('');
  const [togglingIgtf, setTogglingIgtf] = useState(false);
  const [fiscalRif, setFiscalRif] = useState('');
  const [savingRif, setSavingRif] = useState(false);

  async function handleSetBaseCurrency(currency: 'USD' | 'EUR') {
    if (data?.primaryCurrency === currency) return;
    setChangingCurrency(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_base_currency', currency }),
      });
      const resJson = await res.json();
      if (res.ok && resJson.success) {
        toast.success(resJson.message);
        await loadData();
      } else {
        toast.error(resJson.error || 'Error cambiando moneda base');
      }
    } catch {
      toast.error('Error de red al cambiar moneda base');
    } finally {
      setChangingCurrency(false);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setFiscalRif(json.fiscalRif || '');
      } else {
        toast.error('No se pudo cargar la información de tasas');
      }
    } catch {
      toast.error('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [slug]);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      if (res.ok) {
        const json = await res.json();
        toast.success('Tasa BCV sincronizada exitosamente', {
          description: `Nueva tasa activa: ${json.rateInfo.usdRate} Bs./USD (${json.rateInfo.source})`,
        });
        loadData();
      } else {
        const err = await res.json();
        toast.error('Error al sincronizar tasa', { description: err.error });
      }
    } catch {
      toast.error('Fallo de red al solicitar sincronización');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveManual() {
    const val = parseFloat(manualRate);
    if (isNaN(val) || val <= 0) {
      toast.error('Por favor ingresa una tasa numérica válida mayor a 0');
      return;
    }

    setSavingManual(true);
    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'manual', rate: val }),
      });
      if (res.ok) {
        toast.success('Tasa manual de contingencia fijada', {
          description: `Tasa activa para vitrina y POS: ${val.toFixed(4)} Bs./USD`,
        });
        setManualRate('');
        loadData();
      } else {
        const err = await res.json();
        toast.error('Error al guardar tasa manual', { description: err.error });
      }
    } catch {
      toast.error('Error de red al fijar tasa manual');
    } finally {
      setSavingManual(false);
    }
  }

  async function handleToggleIgtf() {
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
        toast.success(nextState ? 'Régimen IGTF 3% activado' : 'Régimen IGTF 3% desactivado', {
          description: nextState
            ? 'Se aplicará 3% de impuesto sobre pagos en efectivo divisas (CASH_USD).'
            : 'No se añadirá recargo por divisas.',
        });
        setData({ ...data, igtfEnabled: nextState });
      } else {
        toast.error('Error al actualizar régimen IGTF');
      }
    } catch {
      toast.error('Error de red al actualizar IGTF');
    } finally {
      setTogglingIgtf(false);
    }
  }

  async function handleSaveRif() {
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
  }

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-lime-600 dark:text-lime-400" />
        <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
          Cargando datos monetarios y fiscales...
        </p>
      </div>
    );
  }

  const activeRate = data?.activeRate || 0;
  const liveBcv = data?.liveBcv;

  return (
    <div className="space-y-6">
      {/* SELECTOR DE MONEDA BASE FIJADA POR EL COMERCIO */}
      <Card className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                Moneda Base del Comercio (Fijación de Precios)
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Selecciona si tus productos están tasados en Dólares ($) o en Euros (€). La vitrina y el POS liquidarán a Bolívares según la tasa BCV oficial correspondiente.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => handleSetBaseCurrency('USD')}
                disabled={changingCurrency || !data?.isPluginActive}
                className={`font-bold text-xs h-9 px-4 cursor-pointer transition-all ${
                  (data?.primaryCurrency || 'USD') === 'USD'
                    ? 'bg-lime-500 hover:bg-lime-600 text-black shadow-xs ring-2 ring-lime-500/20'
                    : 'bg-transparent border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                USD ($) Dólar
              </Button>
              <Button
                type="button"
                onClick={() => handleSetBaseCurrency('EUR')}
                disabled={changingCurrency || !data?.isPluginActive}
                className={`font-bold text-xs h-9 px-4 cursor-pointer transition-all ${
                  data?.primaryCurrency === 'EUR'
                    ? 'bg-lime-500 hover:bg-lime-600 text-black shadow-xs ring-2 ring-lime-500/20'
                    : 'bg-transparent border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                EUR (€) Euro
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HERO RATES CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CARD 1: DÓLAR OFICIAL */}
        <Card className={`border shadow-xs ${
          (data?.primaryCurrency || 'USD') === 'USD'
            ? 'bg-gradient-to-br from-lime-50 to-emerald-50 dark:from-zinc-900 dark:to-[#18181b] border-lime-200/80 dark:border-lime-500/20'
            : 'bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800'
        }`}>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                (data?.primaryCurrency || 'USD') === 'USD' ? 'text-lime-700 dark:text-lime-400' : 'text-slate-500 dark:text-zinc-400'
              }`}>
                <Coins className="w-4 h-4" />
                Dólar Oficial BCV (USD $)
              </span>
              {(data?.primaryCurrency || 'USD') === 'USD' ? (
                <Badge className="bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-300 dark:border-lime-500/30 font-mono text-[10px]">
                  BASE ACTIVA
                </Badge>
              ) : (
                <Badge className="font-mono text-[10px] text-slate-500 border-slate-200 dark:border-zinc-800 bg-transparent">
                  USD
                </Badge>
              )}
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              Bs. {(liveBcv?.usdRate || (data?.primaryCurrency === 'USD' ? activeRate : 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400 flex items-center gap-1">
              {(data?.primaryCurrency || 'USD') === 'USD' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400 inline" />
                  Precios en tienda fijados en USD ($)
                </>
              ) : (
                'Tasa oficial de referencia para el Dólar'
              )}
            </p>
          </CardContent>
        </Card>

        {/* CARD 2: EURO OFICIAL BCV */}
        <Card className={`border shadow-xs ${
          data?.primaryCurrency === 'EUR'
            ? 'bg-gradient-to-br from-lime-50 to-emerald-50 dark:from-zinc-900 dark:to-[#18181b] border-lime-200/80 dark:border-lime-500/20'
            : 'bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800'
        }`}>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                data?.primaryCurrency === 'EUR' ? 'text-lime-700 dark:text-lime-400' : 'text-slate-500 dark:text-zinc-400'
              }`}>
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Euro Oficial BCV (EUR €)
              </span>
              {data?.primaryCurrency === 'EUR' ? (
                <Badge className="bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-300 dark:border-lime-500/30 font-mono text-[10px]">
                  BASE ACTIVA
                </Badge>
              ) : (
                <Badge className="font-mono text-[10px] text-slate-500 border-slate-200 dark:border-zinc-800 bg-transparent">
                  EUR
                </Badge>
              )}
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              Bs. {(liveBcv?.eurRate || (data?.primaryCurrency === 'EUR' ? activeRate : 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </div>
            <p className="text-xs text-slate-600 dark:text-zinc-400 flex items-center gap-1">
              {data?.primaryCurrency === 'EUR' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400 inline" />
                  Precios en tienda fijados en EUR (€)
                </>
              ) : (
                'Tasa oficial de referencia para el Euro'
              )}
            </p>
          </CardContent>
        </Card>

        {/* CARD 3: PARALELO / BINANCE P2P */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                Binance P2P (USDT)
              </span>
              <Badge className="font-mono text-[10px] text-amber-600 border-amber-300 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
                P2P
              </Badge>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
              Bs. {(liveBcv?.usdtRate || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Promedio ponderado de mercado de referencia
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SYNC & CONTINGENCY CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SINCRONIZACIÓN AUTOMÁTICA & MANUAL */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              Sincronización Oficial BCV
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Cron en Postgres programado diariamente a las 7:00 AM VET. También puedes forzar una sincronización inmediata.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 text-xs">
              <span className="text-slate-600 dark:text-zinc-300">Fuente detectada:</span>
              <span className="font-bold text-slate-900 dark:text-white font-mono">{liveBcv?.source || 'AlCambio (BCV Oficial)'}</span>
            </div>

            <Button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all shadow-xs"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Consultando BCV en vivo...' : 'Sincronizar Tasa Oficial Ahora'}
            </Button>
          </CardContent>
        </Card>

        {/* TASA MANUAL DE CONTINGENCIA */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Tasa Manual de Contingencia
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              En caso de caída de internet o resolución extraordinaria de la gerencia, fija una tasa arbitraria.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Nueva Tasa Manual (Bs. por USD)
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.0001"
                  placeholder={`Ej: ${activeRate.toFixed(2)}`}
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                  className="font-mono text-sm rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveManual}
                  disabled={savingManual || !manualRate}
                  className="rounded-xl font-bold border-amber-300 text-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                >
                  {savingManual ? 'Fijando...' : 'Aplicar'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FISCAL SENIAT & IGTF CONTROLS */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Configuración Tributaria SENIAT e IGTF
          </CardTitle>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Parámetros fiscales reglamentarios según la Providencia Administrativa SNAT/2011/00071.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* IGTF TOGGLE */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Régimen IGTF 3% sobre Divisas Efectivo
                </span>
                <Badge className={data?.igtfEnabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 text-[10px]' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 text-[10px]'}>
                  {data?.igtfEnabled ? 'ACTIVO' : 'INACTIVO'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Aplica 3% de recargo tributario en checkout y POS cuando el cliente cancela en divisas en efectivo (`CASH_USD`).
              </p>
            </div>
            <Button
              type="button"
              variant={data?.igtfEnabled ? 'destructive' : 'default'}
              size="sm"
              onClick={handleToggleIgtf}
              disabled={togglingIgtf}
              className="rounded-xl font-bold"
            >
              {togglingIgtf ? 'Guardando...' : data?.igtfEnabled ? 'Desactivar IGTF' : 'Activar IGTF 3%'}
            </Button>
          </div>

          {/* RIF & SENIAT SALES BOOK DOWNLOAD */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                RIF del Contribuyente (Emisor)
              </Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Ej: J-50123456-7"
                  value={fiscalRif}
                  onChange={(e) => setFiscalRif(e.target.value)}
                  className="font-mono text-sm rounded-xl uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveRif}
                  disabled={savingRif}
                  className="rounded-xl font-bold"
                >
                  {savingRif ? 'Guardando...' : 'Guardar RIF'}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Libro de Ventas SENIAT Oficial
              </Label>
              <a
                href={`/api/admin/${slug}/plugins/local-venezuela?format=csv`}
                download
                className="inline-flex"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl font-bold border-emerald-300 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Descargar Libro de Ventas (.csv)
                </Button>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HISTORIAL DE TASAS INMUTABLE */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              Historial de Tasas Registradas ({data?.history?.length || 0})
            </CardTitle>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Registro inmutable de tasas diarias importadas y sincronizadas.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200/80 dark:border-zinc-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-zinc-900/80 text-slate-500 dark:text-zinc-400 font-bold uppercase sticky top-0 border-b border-slate-200 dark:border-zinc-800">
                <tr>
                  <th className="py-2.5 px-4">Fecha</th>
                  <th className="py-2.5 px-4">Tasa (Bs./USD)</th>
                  <th className="py-2.5 px-4">Tasa EUR</th>
                  <th className="py-2.5 px-4">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-mono">
                {(data?.history || []).map((row) => {
                  const dateStr = typeof row.date_rate === 'string' ? row.date_rate.split('T')[0] : '';
                  const ves = parseFloat(row.rate_ves_usd);
                  const eur = row.rate_eur_usd ? parseFloat(row.rate_eur_usd) : null;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/40 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-zinc-200">{dateStr}</td>
                      <td className="py-2.5 px-4 font-bold text-lime-700 dark:text-lime-400">
                        Bs. {ves.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-zinc-400">
                        {eur ? `Bs. ${eur.toFixed(4)}` : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge className="text-[10px] font-sans border-slate-200 dark:border-zinc-800 bg-transparent text-slate-600 dark:text-zinc-400">
                          {row.source}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
