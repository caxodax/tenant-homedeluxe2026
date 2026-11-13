'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, CreditCard, DollarSign, ShoppingBag, Percent, ArrowUpDown } from 'lucide-react';
import { SalesChart, type TrendItem } from '../components/sales-chart';

const CHANNEL_LABELS: Record<string, string> = {
  POS: 'Mostrador POS',
  POS_DESK: 'Mostrador POS',
  PICKUP: 'Vitrina Web (Pick-up)',
  DELIVERY: 'Vitrina Web (Delivery)',
};

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
}

export function ReportsClientView({ data }: { data: ReportDataPayload }) {
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');

  const rate = data.exchangeRate > 0 ? data.exchangeRate : 1;
  const isBs = currency === 'VES' && data.exchangeRate > 0;

  const formatMoney = (amountUsd: number, explicitVes?: number) => {
    if (isBs) {
      const amountBs = explicitVes !== undefined && explicitVes > 0 ? explicitVes : amountUsd * rate;
      return `Bs. ${amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  };

  const trendData: TrendItem[] = data.trend.map((t) => ({
    day: t.day,
    revenue: isBs ? t.revenue * rate : t.revenue,
    orders: t.orders,
  }));

  return (
    <div className="space-y-6">
      {/* Header con Selector Bimonetario */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            Reportes & Analítica Financiera
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
            Consolidado multi-canal, arqueo por métodos de pago y métricas de rendimiento en tiempo real.
          </p>
        </div>

        {/* Currency Switcher */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-100 dark:bg-zinc-900 p-1.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs font-bold text-slate-500 dark:text-zinc-400 pl-2 pr-1 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Moneda:
          </span>
          <button
            type="button"
            onClick={() => setCurrency('USD')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
              currency === 'USD'
                ? 'bg-white dark:bg-zinc-800 text-slate-950 dark:text-white shadow-xs border border-slate-200 dark:border-zinc-700'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            💵 USD ($)
          </button>
          <button
            type="button"
            onClick={() => setCurrency('VES')}
            disabled={data.exchangeRate <= 0}
            title={data.exchangeRate <= 0 ? 'Configure una tasa de cambio en Configuración' : `Tasa activa: Bs. ${rate.toFixed(2)}`}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
              currency === 'VES'
                ? 'bg-white dark:bg-zinc-800 text-slate-950 dark:text-white shadow-xs border border-slate-200 dark:border-zinc-700'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            🇻🇪 Bs. (BCV)
          </button>
        </div>
      </div>

      {/* Tasa Informativa si está en Bs */}
      {isBs && (
        <div className="py-2 px-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-semibold flex items-center justify-between">
          <span>Vista convertida a Bolívares usando la tasa oficial del comercio:</span>
          <span className="font-bold">1 USD = Bs. {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Ingresos Totales</span>
              <DollarSign className="w-4 h-4 text-[var(--tenant-primary)]" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              {formatMoney(data.summary.total_revenue_usd)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Órdenes Válidas</span>
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              {data.summary.total_orders}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Ticket Promedio</span>
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              {formatMoney(data.summary.avg_ticket_usd)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Margen Bruto Est.</span>
              <Percent className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              {data.grossMarginPct !== null ? `${data.grossMarginPct}%` : 'Sin costos'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfica de Tendencia */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
            Tendencia de Ventas (Últimos 14 días) — {isBs ? 'En Bolívares (Bs.)' : 'En USD ($)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={trendData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Canal */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--tenant-primary)]" />
              <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
                Ventas por Canal
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.channels.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-600 dark:text-zinc-400">
                Sin órdenes registradas aún.
              </p>
            ) : (
              data.channels.map((c) => (
                <div
                  key={c.channel}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800"
                >
                  <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {CHANNEL_LABELS[c.channel] || c.channel}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-black font-mono text-slate-950 dark:text-white">
                      {formatMoney(c.total_usd)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                      {c.orders_count} {c.orders_count === 1 ? 'orden' : 'órdenes'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Por Método de Pago */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--tenant-primary)]" />
              <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
                Ingresos por Método de Pago
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.methods.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-600 dark:text-zinc-400">
                Sin pagos registrados aún.
              </p>
            ) : (
              data.methods.map((m) => (
                <div
                  key={m.method}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {m.method_name}
                    </p>
                    <p className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                      {m.method}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black font-mono text-slate-950 dark:text-white">
                      {formatMoney(m.total_usd, m.total_ves)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                      {m.tx_count} {m.tx_count === 1 ? 'pago' : 'pagos'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

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
              Sin movimientos de venta registrados.
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
