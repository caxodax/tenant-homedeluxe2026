import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { ReportsClientView, type ReportDataPayload, type ExportOrderItem } from './ReportsClientView';

export const dynamic = 'force-dynamic';

function getDateRange(preset: string = '7d', customFrom?: string, customTo?: string) {
  const now = new Date();
  
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end, label: 'Hoy' };
  }
  
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
    const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    return { start, end, label: 'Ayer' };
  }

  if (preset === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: 'Últimos 30 días' };
  }

  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return { start, end: now, label: 'Este mes' };
  }

  if (preset === 'custom' && customFrom) {
    const start = new Date(`${customFrom}T00:00:00`);
    const end = customTo ? new Date(`${customTo}T23:59:59.999`) : now;
    return { start, end, label: `${customFrom} a ${customTo || 'hoy'}` };
  }

  // Default: '7d'
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { start, end: now, label: 'Últimos 7 días' };
}

export default async function ReportsPage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const sParams = searchParams ? await searchParams : {};
  const activePreset = sParams.preset || '7d';
  const activeFrom = sParams.from;
  const activeTo = sParams.to;

  const { start, end, label: rangeLabel } = getDateRange(activePreset, activeFrom, activeTo);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const { tenant } = await requireTenantStaff(slug, 'reports');

  const reportData = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    // 1. Resumen general
    const summaryRes = await client.query(`
      SELECT
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(total_usd), 0) AS total_revenue_usd,
        COALESCE(AVG(total_usd), 0) AS avg_ticket_usd
      FROM orders
      WHERE status != 'CANCELLED'
        AND created_at >= $1 AND created_at <= $2
    `, [startIso, endIso]);

    // 2. Ventas por canal (POS vs Vitrina)
    const salesByChannel = await client.query(`
      SELECT
        CASE
          WHEN is_offline_sale = true OR delivery_type = 'POS_DESK' THEN 'POS_DESK'
          ELSE delivery_type
        END AS channel,
        COUNT(*)::int AS orders_count,
        COALESCE(SUM(total_usd), 0) AS total_usd
      FROM orders
      WHERE status != 'CANCELLED'
        AND created_at >= $1 AND created_at <= $2
      GROUP BY 1
      ORDER BY total_usd DESC
    `, [startIso, endIso]);

    // 3. Ventas por método de pago
    const salesByMethod = await client.query(`
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
        AND o.created_at >= $1 AND o.created_at <= $2
      GROUP BY py.method, pm.name
      ORDER BY total_usd DESC
    `, [startIso, endIso]);

    // 4. Productos más vendidos
    const topProducts = await client.query(`
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
        AND o.created_at >= $1 AND o.created_at <= $2
      GROUP BY oi.product_id, COALESCE(p.name, oi.product_name), p.sku
      ORDER BY revenue_usd DESC
      LIMIT 8
    `, [startIso, endIso]);

    // 5. Tendencia diaria
    const trendRes = await client.query(`
      SELECT
        to_char(date_trunc('day', created_at), 'DD/MM') AS day,
        date_trunc('day', created_at) AS raw_day,
        COALESCE(SUM(total_usd), 0) AS revenue,
        COUNT(*)::int AS orders
      FROM orders
      WHERE status != 'CANCELLED'
        AND created_at >= $1 AND created_at <= $2
      GROUP BY 1, 2
      ORDER BY 2 ASC
    `, [startIso, endIso]);

    // 6. Margen bruto
    const marginRes = await client.query(`
      SELECT
        COALESCE(SUM(oi.total_price_usd), 0) AS tracked_revenue,
        COALESCE(SUM(oi.quantity * p.cost_price), 0) AS tracked_cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status != 'CANCELLED' AND p.cost_price IS NOT NULL AND p.cost_price > 0
        AND o.created_at >= $1 AND o.created_at <= $2
    `, [startIso, endIso]);

    // 7. Settings de moneda y tasa
    const settingsRes = await client.query(`
      SELECT primary_currency, secondary_currency, exchange_rate FROM settings WHERE key = 'general' LIMIT 1
    `);

    // 8. Lista de órdenes detalladas para exportación a CSV
    const exportOrdersRes = await client.query(`
      SELECT
        o.order_number,
        o.created_at,
        COALESCE(o.customer_name, 'Cliente Mostrador') AS customer_name,
        COALESCE(o.customer_phone, '-') AS customer_phone,
        CASE
          WHEN o.is_offline_sale = true OR o.delivery_type = 'POS_DESK' THEN 'Mostrador POS'
          ELSE 'Vitrina Web'
        END AS channel,
        o.total_usd,
        o.total_secondary,
        o.exchange_rate_applied,
        o.status,
        COALESCE(
          (SELECT py.method FROM payments py WHERE py.order_id = o.id ORDER BY py.created_at DESC LIMIT 1),
          'EFECTIVO'
        ) AS payment_method
      FROM orders o
      WHERE o.status != 'CANCELLED'
        AND o.created_at >= $1 AND o.created_at <= $2
      ORDER BY o.created_at DESC
      LIMIT 1000
    `, [startIso, endIso]);

    const settingsRow = settingsRes.rows[0];
    const rate = settingsRow ? parseFloat(settingsRow.exchange_rate || '0') : 0;

    const summary = summaryRes.rows[0];
    const margin = marginRes.rows[0];
    const trackedRev = parseFloat(margin?.tracked_revenue || '0');
    const trackedCost = parseFloat(margin?.tracked_cost || '0');
    const grossMarginPct =
      trackedRev > 0 ? (((trackedRev - trackedCost) / trackedRev) * 100).toFixed(1) : null;

    const exportOrders: ExportOrderItem[] = exportOrdersRes.rows.map((r: any) => ({
      order_number: r.order_number,
      created_at: r.created_at,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      channel: r.channel,
      total_usd: parseFloat(r.total_usd || '0'),
      total_secondary: parseFloat(r.total_secondary || '0'),
      exchange_rate_applied: parseFloat(r.exchange_rate_applied || '0'),
      status: r.status,
      payment_method: r.payment_method,
    }));

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
      activePreset,
      activeFrom,
      activeTo,
      rangeLabel,
      exportOrders,
      tenantSlug: tenant.slug,
      businessName: tenant.name,
    };

    return payload;
  });

  return <ReportsClientView data={reportData} />;
}
