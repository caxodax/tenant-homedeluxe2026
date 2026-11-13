'use client';

import { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';

export interface TrendItem {
  day: string;
  revenue: number;
  orders: number;
}

export function SalesChart({ 
  data, 
  exchangeRate = 1.0, 
  secondaryCurrency = 'VES' 
}: { 
  data: TrendItem[]; 
  exchangeRate?: number; 
  secondaryCurrency?: string; 
}) {
  const [currency, setCurrency] = useState<'USD' | 'SECONDARY'>('USD');
  const hasSecondary = exchangeRate > 1;

  const chartData = useMemo(() => {
    if (currency === 'USD') return data;
    return data.map((item) => ({
      ...item,
      revenue: Number((item.revenue * exchangeRate).toFixed(2)),
    }));
  }, [data, currency, exchangeRate]);

  if (data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm">
        Aún no hay transacciones registradas en los últimos 7 días.
      </div>
    );
  }

  const isSec = currency === 'SECONDARY';

  return (
    <div className="space-y-3">
      {hasSecondary && (
        <div className="flex justify-end">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1 font-bold rounded-lg transition cursor-pointer ${
                !isSec
                  ? 'bg-white dark:bg-zinc-800 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              USD ($)
            </button>
            <button
              type="button"
              onClick={() => setCurrency('SECONDARY')}
              className={`px-3 py-1 font-bold rounded-lg transition cursor-pointer ${
                isSec
                  ? 'bg-white dark:bg-zinc-800 text-slate-950 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Bs. ({secondaryCurrency})
            </button>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#84cc16" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="day" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis 
            stroke="#71717a" 
            fontSize={11} 
            tickLine={false} 
            axisLine={false} 
            tickFormatter={(v) => (isSec ? `Bs. ${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(1)}k` : v}` : `$${v}`)} 
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#141416', 
              border: '1px solid #27272a',
              borderRadius: '12px',
              color: '#f4f4f5',
              fontSize: '12px'
            }} 
            formatter={(value: unknown) => [
              isSec
                ? `Bs. ${parseFloat(String(value ?? 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `$${parseFloat(String(value ?? 0)).toFixed(2)}`,
              'Ventas'
            ]}
          />
          <Area 
            type="monotone" 
            dataKey="revenue" 
            stroke="#84cc16" 
            strokeWidth={2}
            fill="url(#colorRevenue)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
