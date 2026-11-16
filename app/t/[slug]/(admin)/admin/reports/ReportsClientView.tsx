'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart3, TrendingUp, CreditCard, DollarSign, 
  ShoppingBag, Percent, ArrowUpDown, Calendar, 
  Download, ChevronDown, Filter, Bike, Navigation, Clock, UserCheck
} from 'lucide-react';
import { SalesChart, type TrendItem } from '../components/sales-chart';
import { toast } from 'sonner';

const CHANNEL_LABELS: Record<string, string> = {
  POS: 'Mostrador POS',
  POS_DESK: 'Mostrador POS',
  PICKUP: 'Vitrina Web (Pick-up)',
  DELIVERY: 'Vitrina Web (Delivery)',
};

export interface ExportOrderItem {
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  channel: string;
  total_usd: number;
  total_secondary: number;
  exchange_rate_applied: number;
  status: string;
  payment_method: string;
}

export interface ReportDataPayload {
  summary: {
    total_orders: number;
    total_revenue_usd: number;
    avg_ticket_usd: number;
  };
  channels: Array<{
    channel: string;
    orders_count: number;
    total_usd: number;
  }>;
  methods: Array<{
    method: string;
    method_name: string;
    tx_count: number;
    total_usd: number;
    total_ves: number;
  }>;
  topProducts: Array<{
    product_id: string;
    name: string;
    sku: string;
    units_sold: number;
    revenue_usd: number;
  }>;
  trend: TrendItem[];
  grossMarginPct: string | null;
  exchangeRate: number;
  activePreset: string;
  activeFrom?: string;
  activeTo?: string;
  rangeLabel: string;
  exportOrders: ExportOrderItem[];
  tenantSlug: string;
  businessName: string;
  deliveryReport?: {
    delivery_revenue_primary: number;
    total_deliveries: number;
    completed_deliveries: number;
    failed_deliveries: number;
    avg_delivery_minutes: number;
    zones_top_revenue: Array<{ zone_name: string; count: number; total_primary: number }>;
    drivers_performance: Array<{ driver_name: string; license_plate: string; completed_count: number; avg_minutes: number }>;
  } | null;
}

export type CurrencyMode = 'USD' | 'VES' | 'BOTH';

export function ReportsClientView({ data }: { data: ReportDataPayload }) {
  const router = useRouter();
  const pathname = usePathname();

  const [currency, setCurrency] = useState<CurrencyMode>('USD');
  const [selectedPreset, setSelectedPreset] = useState<string>(data.activePreset || '7d');
  const [customFrom, setCustomFrom] = useState<string>(data.activeFrom || '');
  const [customTo, setCustomTo] = useState<string>(data.activeTo || '');
  const [isExporting, setIsExporting] = useState(false);

  const rate = data.exchangeRate > 0 ? data.exchangeRate : 1;
  const isBs = currency === 'VES' && data.exchangeRate > 0;
  const isBoth = currency === 'BOTH' && data.exchangeRate > 0;

  const getAmounts = (amountUsd: number, explicitVes?: number) => {
    const amountBs = explicitVes !== undefined && explicitVes > 0 ? explicitVes : amountUsd * rate;
    const usd = `$${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    const bs = `Bs. ${amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return { usd, bs, amountBs };
  };

  const formatMoney = (amountUsd: number, explicitVes?: number) => {
    const { usd, bs } = getAmounts(amountUsd, explicitVes);
    if (currency === 'VES') return bs;
    return usd;
  };

  const trendData: TrendItem[] = data.trend.map((t) => ({
    day: t.day,
    revenue: isBs ? t.revenue * rate : t.revenue,
    orders: t.orders,
  }));

  function handlePresetChange(newPreset: string) {
    setSelectedPreset(newPreset);
    if (newPreset !== 'custom') {
      router.push(`${pathname}?preset=${newPreset}`);
    }
  }

  function handleApplyCustomRange() {
    if (!customFrom) {
      toast.error('Por favor selecciona la fecha de inicio');
      return;
    }
    const params = new URLSearchParams();
    params.set('preset', 'custom');
    params.set('from', customFrom);
    if (customTo) params.set('to', customTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleExportCsv() {
    if (!data.exportOrders || data.exportOrders.length === 0) {
      toast.error('No hay ventas registradas en el período seleccionado');
      return;
    }

    try {
      setIsExporting(true);

      const headers = [
        'Numero de Orden',
        'Fecha y Hora',
        'Cliente',
        'Telefono',
        'Canal',
        'Total USD',
        'Total Bs (BCV)',
        'Tasa Aplicada (Bs/USD)',
        'Metodo de Pago',
        'Estado',
      ];

      const rows = data.exportOrders.map((o) => {
        const displayBs = o.total_secondary > 0 
          ? o.total_secondary 
          : o.exchange_rate_applied > 0 
            ? o.total_usd * o.exchange_rate_applied 
            : 0;

        return [
          `"${o.order_number}"`,
          `"${new Date(o.created_at).toLocaleString('es-VE')}"`,
          `"${(o.customer_name || 'Cliente mostrador').replace(/"/g, '""')}"`,
          `"${(o.customer_phone || '-').replace(/"/g, '""')}"`,
          `"${o.channel}"`,
          o.total_usd.toFixed(2),
          displayBs.toFixed(2),
          o.exchange_rate_applied.toFixed(4),
          `"${o.payment_method}"`,
          `"${o.status}"`,
        ].join(';');
      });

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const todayStr = new Date().toISOString().slice(0, 10);
      const filename = `Reporte_Ventas_${data.tenantSlug}_${data.activePreset}_${todayStr}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Reporte CSV descargado con éxito (${data.exportOrders.length} registros)`);
    } catch {
      toast.error('Error al generar el archivo CSV');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Principal con Controles Compactos (Combobox + Moneda + Exportar) */}
      <div className="space-y-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
              Reportes & Analítica Financiera
            </h1>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
              Consolidado de ventas, arqueo de caja multi-moneda y exportación de auditoría.
            </p>
          </div>

          {/* Barra de Acciones: Combobox de Rango, Moneda y Exportar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Combobox de Fecha (Óptimo para móvil) */}
            <div className="relative">
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="appearance-none pl-8 pr-8 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                title="Seleccionar período de reporte"
              >
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="month">Este mes</option>
                <option value="custom">Personalizado...</option>
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Currency Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-xs">
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currency === 'USD'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                USD ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('VES')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currency === 'VES'
                    ? 'bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Bs. (BCV)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('BOTH')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  currency === 'BOTH'
                    ? 'bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                Ambas
              </button>
            </div>

            {/* Botón Exportar CSV */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExporting || data.exportOrders.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Descargar listado detallado de ventas en formato CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Inputs de Rango Personalizado si aplica */}
        {selectedPreset === 'custom' && (
          <div className="p-3 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Rango de fechas:
            </span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
            />
            <span className="text-xs text-slate-400">hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={handleApplyCustomRange}
              className="px-3.5 py-1.5 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-xl text-xs font-bold hover:bg-slate-800 dark:hover:bg-zinc-100 transition cursor-pointer"
            >
              Aplicar Filtro
            </button>
          </div>
        )}

        {/* Barra de Período Activo y Resumen */}
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400 pt-1">
          <span>
            Período actual: <strong className="text-slate-900 dark:text-white">{data.rangeLabel}</strong> ({data.exportOrders.length} transacciones registradas)
          </span>
          {(isBs || isBoth) && (
            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
              Tasa BCV: Bs. {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </span>
          )}
        </div>
      </div>

      {/* KPI Cards (Grid 2x2 en móvil, 4 columnas en desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-3.5 sm:p-5">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 truncate">
              <span>Ingresos Totales</span>
              <DollarSign className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-black font-mono text-slate-950 dark:text-white mt-1 sm:mt-2 truncate">
              {formatMoney(data.summary.total_revenue_usd)}
            </p>
            {isBoth && (
              <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                {getAmounts(data.summary.total_revenue_usd).bs}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-3.5 sm:p-5">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 truncate">
              <span>Órdenes Válidas</span>
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-black font-mono text-slate-950 dark:text-white mt-1 sm:mt-2 truncate">
              {data.summary.total_orders}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-3.5 sm:p-5">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 truncate">
              <span>Ticket Promedio</span>
              <BarChart3 className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-black font-mono text-slate-950 dark:text-white mt-1 sm:mt-2 truncate">
              {formatMoney(data.summary.avg_ticket_usd)}
            </p>
            {isBoth && (
              <p className="text-xs font-mono font-bold text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                {getAmounts(data.summary.avg_ticket_usd).bs}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-3.5 sm:p-5">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 truncate">
              <span>Margen Bruto</span>
              <Percent className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <p className="text-lg sm:text-2xl font-black font-mono text-slate-950 dark:text-white mt-1 sm:mt-2 truncate">
              {data.grossMarginPct ? `${data.grossMarginPct}%` : 'N/D'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfica de Tendencia */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
            Tendencia de Ventas en el Período ({data.rangeLabel})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart 
            data={isBs ? trendData : data.trend} 
            exchangeRate={data.exchangeRate} 
            secondaryCurrency="VES"
          />
        </CardContent>
      </Card>

      {/* Grid Canales + Métodos de Pago */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventas por Canal */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
              Ventas por Canal de Distribución
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.channels.length === 0 ? (
              <p className="text-center py-6 text-sm text-slate-600 dark:text-zinc-400">
                Sin datos de ventas en este período.
              </p>
            ) : (
              data.channels.map((c) => (
                <div
                  key={c.channel}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-950 dark:text-white">
                      {CHANNEL_LABELS[c.channel] || c.channel}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      {c.orders_count} órdenes procesadas
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black font-mono text-slate-900 dark:text-white">
                      {formatMoney(c.total_usd)}
                    </p>
                    {isBoth && (
                      <p className="text-xs font-mono font-bold text-slate-500 dark:text-zinc-400">
                        {getAmounts(c.total_usd).bs}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Desglose por Método de Pago */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
              Arqueo por Método de Pago
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.methods.length === 0 ? (
              <p className="text-center py-6 text-sm text-slate-600 dark:text-zinc-400">
                Sin transacciones conciliadas en este período.
              </p>
            ) : (
              data.methods.map((m) => (
                <div
                  key={m.method}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-bold text-slate-950 dark:text-white truncate">
                      {m.method_name}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400">
                      {m.tx_count} pagos recibidos
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black font-mono text-slate-900 dark:text-white">
                      {currency === 'VES' 
                        ? getAmounts(m.total_usd, m.total_ves).bs 
                        : getAmounts(m.total_usd, m.total_ves).usd}
                    </p>
                    {isBoth ? (
                      <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {getAmounts(m.total_usd, m.total_ves).bs}
                      </p>
                    ) : isBs && m.total_usd > 0 ? (
                      <p className="text-[11px] font-mono text-slate-500">
                        ${m.total_usd.toFixed(2)} USD eq.
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inteligencia Logística · Plugin Delivery Fleet */}
      {data.deliveryReport && (
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bike className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
                    Inteligencia Logística · Delivery Fleet
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Despachos, tiempos promedio de entrega y rendimiento por zona y chofer
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                Plugin Capa 2
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Total Pedidos Delivery</p>
                <p className="text-xl font-black font-mono text-slate-950 dark:text-white mt-0.5">
                  {data.deliveryReport.total_deliveries}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Entregas Exitosas</p>
                <p className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {data.deliveryReport.completed_deliveries}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Tiempo Promedio</p>
                <p className="text-xl font-black font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                  {data.deliveryReport.avg_delivery_minutes > 0 ? `${data.deliveryReport.avg_delivery_minutes} min` : 'N/A'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800">
                <p className="text-[11px] font-bold text-slate-500 uppercase">Recaudación Fletes</p>
                <p className="text-xl font-black font-mono text-slate-950 dark:text-white mt-0.5">
                  ${Number(data.deliveryReport.delivery_revenue_primary || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Rendimiento de Repartidores */}
            {data.deliveryReport.drivers_performance && data.deliveryReport.drivers_performance.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Rendimiento por Repartidor
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {data.deliveryReport.drivers_performance.map((drv) => (
                    <div key={drv.driver_name} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-950 dark:text-white">{drv.driver_name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{drv.license_plate}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-emerald-600 font-mono">{drv.completed_count} entregas</span>
                        {drv.avg_minutes > 0 && (
                          <p className="text-[10px] text-slate-400 font-mono">{drv.avg_minutes} min prom</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Productos */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
              Top Productos Más Vendidos
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.topProducts.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-600 dark:text-zinc-400">
              Sin movimientos de venta registrados en este período.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.topProducts.map((p) => (
                <div
                  key={p.product_id || p.sku}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-bold text-slate-950 dark:text-white truncate">
                      {p.name}
                    </p>
                    <p className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                      SKU: {p.sku}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-400">
                      {formatMoney(p.revenue_usd)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                      {p.units_sold} uds vendidas
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
