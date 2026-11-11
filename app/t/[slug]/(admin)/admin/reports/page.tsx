import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, CreditCard, DollarSign, ShoppingBag, Percent } from 'lucide-react';
import { SalesChart, type TrendItem } from '../components/sales-chart';

const CHANNEL_LABELS: Record<string, string> = {
  POS: 'Mostrador POS',
  POS_DESK: 'Mostrador POS',
  PICKUP: 'Vitrina Web (Pick-up)',
  DELIVERY: 'Vitrina Web (Delivery)',
};

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'reports');

  const reportData = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const [summaryRes, salesByChannel, salesByMethod, topProducts, trendRes] = await Promise.all([
      client.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total_usd), 0) AS total_revenue_usd,
          COALESCE(AVG(total_usd), 0) AS avg_ticket_usd
        FROM orders
        WHERE status != 'CANCELLED'
      `),
      client.query(`
        SELECT
          CASE
            WHEN is_offline_sale = true OR delivery_type = 'POS_DESK' THEN 'POS_DESK'
            ELSE delivery_type
          END AS channel,
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(total_usd), 0) AS total_usd
        FROM orders
        WHERE status != 'CANCELLED'
        GROUP BY 1
        ORDER BY total_usd DESC
      `),
      client.query(`
        SELECT
          py.method,
          COALESCE(pm.name, py.method) AS method_name,
          COUNT(*)::int AS tx_count,
          COALESCE(SUM(py.amount), 0) AS total_amount
        FROM payments py
        JOIN orders o ON o.id = py.order_id
        LEFT JOIN payment_methods pm ON pm.code = py.method
        WHERE o.status != 'CANCELLED' AND py.status != 'REJECTED'
        GROUP BY py.method, pm.name
        ORDER BY total_amount DESC
      `),
      client.query(`
        SELECT
          oi.product_id,
          COALESCE(p.name, oi.product_name) AS name,
          COALESCE(p.sku, 'SIN-SKU') AS sku,
          SUM(oi.quantity) AS units_sold,
          SUM(oi.total_price_usd) AS revenue_usd,
          SUM(oi.quantity * COALESCE(p.cost_price, 0)) AS est_cost_usd
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE o.status != 'CANCELLED'
        GROUP BY oi.product_id, COALESCE(p.name, oi.product_name), p.sku
        ORDER BY revenue_usd DESC
        LIMIT 8
      `),
      client.query(`
        SELECT
          to_char(date_trunc('day', created_at), 'DD/MM') AS day,
          date_trunc('day', created_at) AS raw_day,
          COALESCE(SUM(total_usd), 0) AS revenue,
          COUNT(*)::int AS orders
        FROM orders
        WHERE status != 'CANCELLED'
          AND created_at >= now() - INTERVAL '14 days'
        GROUP BY 1, 2
        ORDER BY 2 ASC
      `),
    ]);

    const marginRes = await client.query(`
      SELECT
        COALESCE(SUM(oi.total_price_usd), 0) AS tracked_revenue,
        COALESCE(SUM(oi.quantity * p.cost_price), 0) AS tracked_cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status != 'CANCELLED' AND p.cost_price IS NOT NULL AND p.cost_price > 0
    `);

    return {
      summary: summaryRes.rows[0],
      channels: salesByChannel.rows,
      methods: salesByMethod.rows,
      topProducts: topProducts.rows,
      trend: trendRes.rows.map(
        (r): TrendItem => ({
          day: r.day,
          revenue: parseFloat(r.revenue),
          orders: r.orders,
        })
      ),
      margin: marginRes.rows[0],
    };
  });

  const totalRevenue = parseFloat(reportData.summary?.total_revenue_usd || '0');
  const totalOrders = Number(reportData.summary?.total_orders || 0);
  const avgTicket = parseFloat(reportData.summary?.avg_ticket_usd || '0');

  const trackedRev = parseFloat(reportData.margin?.tracked_revenue || '0');
  const trackedCost = parseFloat(reportData.margin?.tracked_cost || '0');
  const grossMarginPct =
    trackedRev > 0 ? (((trackedRev - trackedCost) / trackedRev) * 100).toFixed(1) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Reportes & Analítica Financiera
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
            Consolidado maestro en USD ($) por canal, método de cobro y desempeño de productos.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Ingresos Totales</span>
              <DollarSign className="w-4 h-4 text-[var(--tenant-primary)]" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              ${totalRevenue.toFixed(2)} USD
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Órdenes Válidas</span>
              <ShoppingBag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              {totalOrders}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Ticket Promedio</span>
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              ${avgTicket.toFixed(2)} USD
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              <span>Margen Bruto Est.</span>
              <Percent className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-black font-mono text-slate-950 dark:text-white mt-2">
              {grossMarginPct !== null ? `${grossMarginPct}%` : 'Sin costos'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfica de Tendencia */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
            Tendencia de Ventas (Últimos 14 días)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={reportData.trend} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Canal */}
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--tenant-primary)]" />
              <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
                Ventas por Canal
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reportData.channels.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-600 dark:text-zinc-400">
                Sin órdenes registradas aún.
              </p>
            ) : (
              reportData.channels.map((c) => (
                <div
                  key={c.channel}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800"
                >
                  <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                    {CHANNEL_LABELS[c.channel] || c.channel}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-black font-mono text-slate-950 dark:text-white">
                      ${parseFloat(c.total_usd).toFixed(2)} USD
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
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--tenant-primary)]" />
              <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
                Ingresos por Método de Pago
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reportData.methods.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-600 dark:text-zinc-400">
                Sin pagos registrados aún.
              </p>
            ) : (
              reportData.methods.map((m) => (
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
                      ${parseFloat(m.total_amount).toFixed(2)} USD
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
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white">
              Top Productos Más Vendidos
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {reportData.topProducts.length === 0 ? (
            <p className="text-center py-8 text-sm text-slate-600 dark:text-zinc-400">
              Sin movimientos de venta registrados.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reportData.topProducts.map((p) => (
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
                      ${parseFloat(p.revenue_usd).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 font-mono">
                      {parseFloat(p.units_sold)} uds vendidas
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
