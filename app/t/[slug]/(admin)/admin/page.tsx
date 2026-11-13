import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IconBadge } from '@/components/ui/icon-badge';
import { ActionableAlert } from '@/components/ui/actionable-alert';
import { 
  DollarSign, ShoppingCart, Package, AlertTriangle, ArrowUpRight,
  Monitor, Users, ArrowRight, Eye, CheckCircle2, Clock
} from 'lucide-react';
import { SalesChart, TrendItem } from './components/sales-chart';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function getTenantMetrics(schema: string) {
  return withTenantDb(schema, null, async (client) => {
    const [todaySales, pendingOrders, lowStock, totalProducts, totalCustomers, settingsRes] = await Promise.all([
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
      client.query(`SELECT COUNT(*) as count FROM customers`),
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
      totalCustomers: parseInt(totalCustomers.rows[0]?.count || '0', 10),
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

function getGreeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Buenos días, ${name}`;
  if (hour < 18) return `Buenas tardes, ${name}`;
  return `Buenas noches, ${name}`;
}

export default async function TenantAdminDashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'dashboard');
  const metrics = await getTenantMetrics(tenant.db_schema_name);
  const trend = await getSalesTrend(tenant.db_schema_name);

  const greeting = getGreeting(staff.full_name?.split(' ')[0] || 'Administrador');
  
  return (
    <div className="space-y-6">
      {/* Cabecera del Dashboard - Editorial Warm */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800/40">
              ● Resumen Operativo
            </span>
            <span className="text-stone-300 dark:text-zinc-700">·</span>
            <span className="text-xs text-stone-500 dark:text-zinc-400 font-mono">
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-950 dark:text-white tracking-tight">
            {greeting}
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 font-medium mt-1">
            Hay <strong className="text-stone-900 dark:text-zinc-200">{metrics.pendingOrders} pedidos en curso</strong> y <strong className="text-stone-900 dark:text-zinc-200">{metrics.lowStock} productos</strong> con alerta de inventario.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono">{tenant.slug}</span> (Plan {tenant.plan_id})
          </span>
        </div>
      </div>
      
      {/* 4 KPIs con Icon Badges suaves (Imagen 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          label="Ventas Hoy" 
          value={`$${metrics.todaySales.toFixed(2)}`} 
          sublabel={metrics.todaySecondary > 0 ? `Bs. ${metrics.todaySecondary.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${metrics.todayOrders} cobros hoy`}
          icon={<DollarSign className="w-5 h-5" />}
          badgeColor="emerald"
        />
        <KpiCard 
          label="Pedidos en Curso" 
          value={metrics.pendingOrders.toString()} 
          sublabel="Por despachar o retirar"
          icon={<ShoppingCart className="w-5 h-5" />}
          badgeColor="blue"
        />
        <KpiCard 
          label="Alertas de Stock" 
          value={metrics.lowStock.toString()} 
          sublabel={`De ${metrics.totalProducts} ítems activos`}
          icon={<AlertTriangle className="w-5 h-5" />}
          badgeColor="amber"
          alert={metrics.lowStock > 0}
        />
        <KpiCard 
          label="Catálogo Activo" 
          value={metrics.totalProducts.toString()} 
          sublabel={`${metrics.totalCustomers} clientes registrados`}
          icon={<Package className="w-5 h-5" />}
          badgeColor="purple"
        />
      </div>

      {/* Grid 2 Columnas: Asuntos de Atención + Tendencia de Ventas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda: Asuntos que requieren atención (Imagen 2) */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-zinc-800">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-700 dark:text-zinc-300 block">
                  PRIORIDAD OPERATIVA
                </span>
                <CardTitle className="text-base font-bold text-stone-950 dark:text-white mt-0.5">
                  Asuntos que requieren atención
                </CardTitle>
              </div>
              <Badge variant="neutral">
                {metrics.pendingOrders + (metrics.lowStock > 0 ? 1 : 0)} alertas
              </Badge>
            </div>

            <div className="space-y-3">
              <ActionableAlert
                indicatorColor={metrics.pendingOrders > 0 ? 'blue' : 'emerald'}
                badgeColor={metrics.pendingOrders > 0 ? 'blue' : 'emerald'}
                icon={<ShoppingCart className="w-4 h-4" />}
                title={metrics.pendingOrders > 0 ? `${metrics.pendingOrders} pedidos pendientes` : 'Pedidos al día'}
                description={metrics.pendingOrders > 0 ? 'Transacciones de caja o vitrina esperando atención' : 'No hay pedidos acumulados en cola'}
                meta="Mostrador y Web"
                actionLabel="Revisar →"
                actionHref={`/t/${slug}/admin/orders`}
              />

              <ActionableAlert
                indicatorColor={metrics.lowStock > 0 ? 'amber' : 'emerald'}
                badgeColor={metrics.lowStock > 0 ? 'amber' : 'emerald'}
                icon={<Package className="w-4 h-4" />}
                title={metrics.lowStock > 0 ? `${metrics.lowStock} productos en stock crítico` : 'Inventario en orden'}
                description={metrics.lowStock > 0 ? 'Existencias por debajo del umbral mínimo configurado' : 'Todos los productos cuentan con existencias'}
                meta="Almacén"
                actionLabel="Reponer →"
                actionHref={`/t/${slug}/admin/inventory`}
              />

              <ActionableAlert
                indicatorColor="purple"
                badgeColor="purple"
                icon={<Monitor className="w-4 h-4" />}
                title="Punto de Venta Mostrador (POS)"
                description="Terminal de facturación rápida y registro de ventas offline-first"
                meta="Caja 01"
                actionLabel="Abrir POS →"
                actionHref={`/t/${slug}/pos`}
              />

              <ActionableAlert
                indicatorColor="emerald"
                badgeColor="emerald"
                icon={<CheckCircle2 className="w-4 h-4" />}
                title="Base de datos y Motor Supabase"
                description={`Aislamiento multi-tenant activo en esquema ${tenant.db_schema_name}`}
                meta="Operativo"
                actionLabel="Verificar →"
                actionHref={`/t/${slug}/admin/reports`}
              />
            </div>
          </Card>
        </div>

        {/* Columna Derecha: Gráfica de Tendencia de Ventas */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-zinc-800">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-700 dark:text-zinc-300 block">
                  RENDIMIENTO
                </span>
                <CardTitle className="text-base font-bold text-stone-950 dark:text-white mt-0.5">
                  Tendencia de Ventas (7 días)
                </CardTitle>
              </div>
              <span className="text-xs font-mono text-stone-500 dark:text-zinc-400 bg-stone-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">
                {metrics.exchangeRate > 1 ? `Tasa: Bs. ${metrics.exchangeRate.toFixed(2)}` : 'Moneda: USD'}
              </span>
            </div>

            <div className="pt-4">
              <SalesChart 
                data={trend} 
                exchangeRate={metrics.exchangeRate} 
                secondaryCurrency={metrics.secondaryCurrency} 
              />
            </div>
          </Card>
        </div>
      </div>
      
      {/* Actividad Reciente: Pedidos con Status Pills y Icon Badges (Imagen 3) */}
      <RecentOrdersCard schema={tenant.db_schema_name} slug={slug} />
    </div>
  );
}

function KpiCard({ 
  label, 
  value, 
  sublabel, 
  icon,
  badgeColor = 'emerald',
  alert,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
  badgeColor?: 'emerald' | 'blue' | 'amber' | 'purple';
  alert?: boolean;
}) {
  return (
    <Card className={cn(
      'p-5 transition-all duration-200',
      alert && 'border-amber-400/60 ring-2 ring-amber-400/20'
    )}>
      <div className="flex items-center justify-between mb-3">
        <IconBadge color={badgeColor} size="md">
          {icon}
        </IconBadge>
        <span className="text-[10px] uppercase font-bold tracking-wider text-stone-600 dark:text-zinc-400">
          {label}
        </span>
      </div>
      <p className="text-2xl sm:text-3xl font-black text-stone-950 dark:text-white tracking-tight font-sans">
        {value}
      </p>
      <p className="text-xs font-medium text-stone-700 dark:text-zinc-300 mt-1 line-clamp-1">
        {sublabel}
      </p>
    </Card>
  );
}

async function RecentOrdersCard({ schema, slug }: { schema: string; slug: string }) {
  const { orders, exchangeRate } = await withTenantDb(schema, null, async (client) => {
    const [ordersRes, settingsRes] = await Promise.all([
      client.query(`
        SELECT order_number, customer_name, total_usd, total_secondary, exchange_rate_applied, status, created_at, id
        FROM orders
        ORDER BY created_at DESC
        LIMIT 6
      `),
      client.query(`
        SELECT primary_currency, secondary_currency, exchange_rate FROM settings WHERE key = 'general' LIMIT 1
      `),
    ]);
    const settingsRow = settingsRes.rows[0];
    const rate = settingsRow ? parseFloat(settingsRow.exchange_rate || '0') : 0;
    return { orders: ordersRes.rows, exchangeRate: rate };
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return <Badge variant="success">Entregado</Badge>;
      case 'CONFIRMED':
        return <Badge variant="info">Confirmado</Badge>;
      case 'PREPARING':
        return <Badge variant="purple">Preparando</Badge>;
      case 'READY_FOR_PICKUP':
        return <Badge variant="info">Por retirar</Badge>;
      case 'PENDING_PAYMENT_VERIFICATION':
        return <Badge variant="warning">Por verificar</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelado</Badge>;
      default:
        return <Badge variant="neutral">Recibido</Badge>;
    }
  };
  
  return (
    <Card className="p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-zinc-800">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-700 dark:text-zinc-300 block">
            ÚLTIMOS MOVIMIENTOS
          </span>
          <CardTitle className="text-base font-bold text-stone-950 dark:text-white mt-0.5">
            Actividad Reciente
          </CardTitle>
        </div>
        <Link
          href={`/t/${slug}/admin/orders`}
          className="text-xs font-bold text-stone-700 dark:text-zinc-300 hover:text-stone-950 dark:hover:text-white transition-colors"
        >
          Ver todos los pedidos →
        </Link>
      </div>

      <div>
        {orders.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-zinc-800 flex items-center justify-center text-stone-400 mb-2">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Aún no hay transacciones registradas</p>
            <p className="text-[11px] text-stone-400 dark:text-zinc-600 mt-0.5">Aparecerán aquí en cuanto comiences a cobrar en el POS</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const displayDate = new Date(order.created_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={order.order_number}
                  className="flex items-center justify-between p-3 rounded-xl bg-stone-50/60 dark:bg-zinc-900/30 border border-stone-200/60 dark:border-zinc-800/60 hover:bg-stone-100/60 dark:hover:bg-zinc-900/60 transition-colors gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <IconBadge color="blue" size="sm">
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </IconBadge>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-stone-950 dark:text-white font-mono truncate">
                        {order.order_number}
                      </p>
                      <p className="text-[11px] text-stone-600 dark:text-zinc-400 truncate">
                        {order.customer_name || 'Cliente mostrador'} · {displayDate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-xs sm:text-sm font-bold text-stone-900 dark:text-white font-mono block">
                        ${parseFloat(order.total_usd).toFixed(2)}
                      </span>
                      {(() => {
                        const sec = parseFloat(order.total_secondary || '0');
                        const rate = parseFloat(order.exchange_rate_applied || '0') || exchangeRate;
                        const displayBs = sec > 0 ? sec : rate > 0 ? parseFloat(order.total_usd) * rate : 0;
                        if (displayBs > 0) {
                          return (
                            <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-zinc-400 block">
                              Bs. {displayBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div>{getStatusBadge(order.status)}</div>

                    <Link
                      href={`/t/${slug}/admin/orders/${order.id}`}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200/50 dark:hover:bg-zinc-800/50 transition-colors"
                      title="Ver detalle del pedido"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
