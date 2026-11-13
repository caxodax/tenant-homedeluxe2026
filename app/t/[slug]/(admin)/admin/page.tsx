import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  DollarSign, ShoppingCart, Package, AlertTriangle, ArrowUpRight 
} from 'lucide-react';
import { SalesChart, TrendItem } from './components/sales-chart';
import { cn } from '@/lib/utils';

async function getTenantMetrics(schema: string) {
  return withTenantDb(schema, null, async (client) => {
    const [todaySales, pendingOrders, lowStock, totalProducts, settingsRes] = await Promise.all([
      client.query(`
        SELECT 
          COALESCE(SUM(total_usd), 0) as total,
          COALESCE(SUM(total_secondary), 0) as total_sec,
          COUNT(*) as count
        FROM orders 
        WHERE status != 'CANCELLED' 
          AND created_at >= CURRENT_DATE
      `),
      client.query(`
        SELECT COUNT(*) as count 
        FROM orders 
        WHERE status IN ('CREATED', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP')
      `),
      client.query(`
        SELECT COUNT(*) as count 
        FROM products 
        WHERE is_active = true AND current_stock <= min_stock_alert
      `),
      client.query(`SELECT COUNT(*) as count FROM products WHERE is_active = true`),
      client.query(`SELECT primary_currency, secondary_currency, exchange_rate FROM settings WHERE key = 'general' LIMIT 1`),
    ]);
    
    const primaryCurrency = settingsRes.rows[0]?.primary_currency || 'USD';
    const secondaryCurrency = settingsRes.rows[0]?.secondary_currency || 'VES';
    const exchangeRate = parseFloat(settingsRes.rows[0]?.exchange_rate || '1.0');
    
    const todayUsd = parseFloat(todaySales.rows[0]?.total || '0');
    let todaySec = parseFloat(todaySales.rows[0]?.total_sec || '0');
    if (todaySec <= 0 && todayUsd > 0 && exchangeRate > 1) {
      todaySec = todayUsd * exchangeRate;
    }

    return {
      todaySales: todayUsd,
      todaySecondary: todaySec,
      primaryCurrency,
      secondaryCurrency,
      exchangeRate,
      todayOrders: parseInt(todaySales.rows[0]?.count || '0', 10),
      pendingOrders: parseInt(pendingOrders.rows[0]?.count || '0', 10),
      lowStock: parseInt(lowStock.rows[0]?.count || '0', 10),
      totalProducts: parseInt(totalProducts.rows[0]?.count || '0', 10),
    };
  });
}

async function getSalesTrend(schema: string): Promise<TrendItem[]> {
  return withTenantDb(schema, null, async (client) => {
    const res = await client.query(`
      SELECT 
        DATE_TRUNC('day', created_at)::date as day,
        SUM(total_usd) as revenue,
        COUNT(*) as orders
      FROM orders
      WHERE status != 'CANCELLED'
        AND created_at >= now() - interval '7 days'
      GROUP BY 1
      ORDER BY 1
    `);
    return res.rows.map(r => ({
      day: new Date(r.day).toLocaleDateString('es', { weekday: 'short' }),
      revenue: parseFloat(r.revenue || 0),
      orders: parseInt(r.orders || 0, 10),
    }));
  });
}

export default async function TenantAdminDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'dashboard');
  const metrics = await getTenantMetrics(tenant.db_schema_name);
  const trend = await getSalesTrend(tenant.db_schema_name);
  
  return (
    <div className="space-y-6">
      {/* Cabecera del Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-lime-500/10 text-lime-700 dark:text-lime-400 border border-lime-500/20 font-mono uppercase tracking-wide">
              {tenant.slug}
            </span>
            <span className="text-slate-400 dark:text-zinc-600">·</span>
            <span className="text-xs text-slate-500 dark:text-zinc-400">Plan: <strong className="text-slate-700 dark:text-zinc-200">{tenant.plan_id}</strong></span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Dashboard Operativo
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300 font-medium mt-1">
            Métricas en tiempo real de <strong className="text-slate-950 dark:text-white font-bold">{tenant.name}</strong> · Esquema aislado <code className="text-lime-700 dark:text-lime-400 font-mono text-xs font-bold">{tenant.db_schema_name}</code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Supabase us-east-1
          </span>
        </div>
      </div>
      
      {/* 4 KPIs con diseño elevado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          label="Ventas Hoy" 
          value={`$${metrics.todaySales.toFixed(2)}`} 
          sublabel={`${metrics.todaySecondary > 0 ? `Bs. ${metrics.todaySecondary.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ` : ''}${metrics.todayOrders} órdenes facturadas hoy`}
          icon={DollarSign}
          trend="+0%"
          variant="lime"
        />
        <KpiCard 
          label="Pedidos Pendientes" 
          value={metrics.pendingOrders.toString()} 
          sublabel="En cola por despachar"
          icon={ShoppingCart}
          alert={metrics.pendingOrders > 5}
          variant="blue"
        />
        <KpiCard 
          label="Stock Bajo" 
          value={metrics.lowStock.toString()} 
          sublabel={`De ${metrics.totalProducts} productos listados`}
          icon={AlertTriangle}
          alert={metrics.lowStock > 0}
          variant="amber"
        />
        <KpiCard 
          label="Productos Activos" 
          value={metrics.totalProducts.toString()} 
          sublabel="En catálogo disponible"
          icon={Package}
          variant="emerald"
        />
      </div>
      
      {/* Gráfica de tendencia */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800/60">
          <div>
            <CardTitle>Tendencia de Ventas</CardTitle>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Ingresos acumulados en USD (Últimos 7 días)</p>
          </div>
          <span className="text-xs font-mono text-slate-400 dark:text-zinc-500 bg-slate-100 dark:bg-zinc-900 px-2.5 py-1 rounded-lg">
            {metrics.exchangeRate > 1 ? `Tasa: Bs. ${metrics.exchangeRate.toFixed(2)}` : 'Moneda: USD ($)'}
          </span>
        </CardHeader>
        <CardContent className="pt-6">
          <SalesChart 
            data={trend} 
            exchangeRate={metrics.exchangeRate} 
            secondaryCurrency={metrics.secondaryCurrency} 
          />
        </CardContent>
      </Card>
      
      {/* Pedidos Recientes */}
      <RecentOrdersCard schema={tenant.db_schema_name} />
    </div>
  );
}

function KpiCard({ 
  label, 
  value, 
  sublabel, 
  icon: Icon, 
  trend, 
  alert,
  variant = 'lime'
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ElementType;
  trend?: string;
  alert?: boolean;
  variant?: 'lime' | 'blue' | 'amber' | 'emerald';
}) {
  const ICON_COLORS = {
    lime: 'bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  };

  return (
    <Card className={cn(
      'p-6 hover:shadow-md transition-all',
      alert && 'border-amber-500/40 ring-1 ring-amber-500/20'
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center border', ICON_COLORS[variant])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
            <ArrowUpRight className="w-3 h-3" />
            {trend}
          </div>
        )}
      </div>
      <p className="text-3xl font-black text-slate-950 dark:text-white tracking-tight font-sans">{value}</p>
      <p className="text-xs uppercase tracking-wider font-extrabold text-slate-800 dark:text-zinc-300 mt-2">{label}</p>
      <p className="text-xs font-medium text-slate-700 dark:text-zinc-400 mt-0.5">{sublabel}</p>
    </Card>
  );
}

async function RecentOrdersCard({ schema }: { schema: string }) {
  const { orders, exchangeRate } = await withTenantDb(schema, null, async (client) => {
    const [ordersRes, settingsRes] = await Promise.all([
      client.query(`
        SELECT order_number, customer_name, total_usd, total_secondary, exchange_rate_applied, status, created_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 5
      `),
      client.query(`
        SELECT value FROM settings WHERE key = 'currency' LIMIT 1
      `),
    ]);
    const currencyVal = settingsRes.rows[0]?.value;
    const rate = currencyVal ? parseFloat(currencyVal.exchange_rate || '0') : 0;
    return { orders: ordersRes.rows, exchangeRate: rate };
  });
  
  const STATUS_STYLES: Record<string, string> = {
    CREATED: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    CONFIRMED: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    PREPARING: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    DELIVERED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    CANCELLED: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800/60">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">Pedidos Recientes</CardTitle>
            <p className="text-sm font-medium text-slate-700 dark:text-zinc-400 mt-0.5">Últimas transacciones registradas en caja o vitrina</p>
          </div>
      </CardHeader>
      <CardContent className="pt-4">
        {orders.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-slate-400 mb-2">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Aún no hay transacciones registradas</p>
            <p className="text-[11px] text-slate-400 dark:text-zinc-600 mt-0.5">Aparecerán aquí en cuanto comiences a cobrar en el POS</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((order) => (
              <div key={order.order_number} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-900/40 border border-slate-200/60 dark:border-zinc-800/60 hover:bg-slate-100/70 dark:hover:bg-zinc-900/70 transition-colors">
                <div>
                  <p className="text-sm font-bold text-slate-950 dark:text-white font-mono">{order.order_number}</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300 mt-0.5">{order.customer_name || 'Cliente Mostrador'}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-900 dark:text-white font-mono block">
                      ${parseFloat(order.total_usd).toFixed(2)}
                    </span>
                    {(() => {
                      const sec = parseFloat(order.total_secondary || '0');
                      const rate = parseFloat(order.exchange_rate_applied || '0') || exchangeRate;
                      const displayBs = sec > 0 ? sec : rate > 0 ? parseFloat(order.total_usd) * rate : 0;
                      if (displayBs > 0) {
                        return (
                          <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-zinc-400 block">
                            Bs. {displayBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${STATUS_STYLES[order.status] || 'bg-slate-500/10 text-slate-600 dark:text-zinc-400'}`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
