'use client';

import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';

export interface TrendItem {
  day: string;
  revenue: number;
  orders: number;
}

export function SalesChart({ data }: { data: TrendItem[] }) {
  if (data.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm">
        Aún no hay transacciones registradas en los últimos 7 días.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#84cc16" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="day" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#141416', 
            border: '1px solid #27272a',
            borderRadius: '12px',
            color: '#f4f4f5',
            fontSize: '12px'
          }} 
          formatter={(value: unknown) => [`$${parseFloat(String(value ?? 0)).toFixed(2)}`, 'Ventas']}
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
  );
}
