import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { ReportsClientView, type ReportDataPayload } from './ReportsClientView';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'reports');

  const reportData = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const [summaryRes, salesByChannel, salesByMethod, topProducts, trendRes, marginRes, settingsRes] = await Promise.all([
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
          COALESCE(SUM(
            CASE 
              WHEN py.currency = 'USD' THEN py.amount
              WHEN py.currency = 'VES' AND py.exchange_rate > 0 THEN py.amount / py.exchange_rate
              ELSE py.amount
            END
          ), 0) AS total_usd,
          COALESCE(SUM(
            CASE
              WHEN py.currency = 'VES' THEN py.amount
              WHEN py.currency = 'USD' AND py.exchange_rate > 0 THEN py.amount * py.exchange_rate
              ELSE 0
            END
          ), 0) AS total_ves
        FROM payments py
        JOIN orders o ON o.id = py.order_id
        LEFT JOIN payment_methods pm ON pm.code = py.method
        WHERE o.status != 'CANCELLED' AND py.status != 'REJECTED'
        GROUP BY py.method, pm.name
        ORDER BY total_usd DESC
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
      client.query(`
        SELECT
          COALESCE(SUM(oi.total_price_usd), 0) AS tracked_revenue,
          COALESCE(SUM(oi.quantity * p.cost_price), 0) AS tracked_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.status != 'CANCELLED' AND p.cost_price IS NOT NULL AND p.cost_price > 0
      `),
      client.query(`
        SELECT primary_currency, secondary_currency, exchange_rate FROM settings WHERE key = 'general' LIMIT 1
      `),
    ]);

    const settingsRow = settingsRes.rows[0];
    const rate = settingsRow ? parseFloat(settingsRow.exchange_rate || '0') : 0;

    const summary = summaryRes.rows[0];
    const margin = marginRes.rows[0];
    const trackedRev = parseFloat(margin?.tracked_revenue || '0');
    const trackedCost = parseFloat(margin?.tracked_cost || '0');
    const grossMarginPct =
      trackedRev > 0 ? (((trackedRev - trackedCost) / trackedRev) * 100).toFixed(1) : null;

    const payload: ReportDataPayload = {
      summary: {
        total_orders: Number(summary?.total_orders || 0),
        total_revenue_usd: parseFloat(summary?.total_revenue_usd || '0'),
        avg_ticket_usd: parseFloat(summary?.avg_ticket_usd || '0'),
      },
      channels: salesByChannel.rows.map((c: any) => ({
        channel: c.channel,
        orders_count: Number(c.orders_count),
        total_usd: parseFloat(c.total_usd),
      })),
      methods: salesByMethod.rows.map((m: any) => ({
        method: m.method,
        method_name: m.method_name,
        tx_count: Number(m.tx_count),
        total_usd: parseFloat(m.total_usd),
        total_ves: parseFloat(m.total_ves),
      })),
      topProducts: topProducts.rows.map((p: any) => ({
        product_id: p.product_id || p.sku,
        name: p.name,
        sku: p.sku,
        units_sold: parseFloat(p.units_sold),
        revenue_usd: parseFloat(p.revenue_usd),
      })),
      trend: trendRes.rows.map((r: any) => ({
        day: r.day,
        revenue: parseFloat(r.revenue),
        orders: Number(r.orders),
      })),
      grossMarginPct,
      exchangeRate: rate,
    };

    return payload;
  });

  return <ReportsClientView data={reportData} />;
}
