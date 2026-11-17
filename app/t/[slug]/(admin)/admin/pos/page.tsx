import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Monitor, Play, Wifi } from 'lucide-react';
import Link from 'next/link';
import { ShiftsHistoryTable, type ShiftHistoryRow } from './shifts-history-table';

export default async function PosAccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'pos');

  const [shifts, unassignedStats] = await withTenantDb(
    tenant.db_schema_name,
    null,
    async (client) => {
      const sRes = await client.query(`
        SELECT cs.id, cr.code AS register_code, cs.cashier_name, cs.status,
               cs.opened_at, cs.closed_at, cs.opening_balance_primary,
               cs.expected_by_method, cs.actual_by_method, cs.discrepancy_by_method,
               cs.cashier_notes
        FROM cash_shifts cs
        JOIN cash_registers cr ON cr.id = cs.register_id
        ORDER BY cs.opened_at DESC
        LIMIT 200
      `);
      const uRes = await client.query(`
        SELECT COUNT(*)::int AS count, COALESCE(SUM(total_primary), 0)::numeric AS sum_usd
        FROM orders o
        WHERE (o.is_offline_sale = true OR o.delivery_type = 'POS_DESK')
          AND o.status != 'CANCELLED'
          AND NOT EXISTS (
            SELECT 1 FROM cash_shifts cs
            WHERE o.created_at >= cs.opened_at
              AND (cs.closed_at IS NULL OR o.created_at <= cs.closed_at)
          )
      `);
      return [sRes.rows as ShiftHistoryRow[], uRes.rows[0]];
    }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
          Punto de Venta y Cajas
        </h1>
        <p className="text-slate-700 dark:text-zinc-300 text-sm mt-1">
          Terminales de caja registradoras y control de arqueos para {tenant.name}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 hover:border-[var(--tenant-primary)] transition-colors">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--tenant-primary)]/10 border border-[var(--tenant-primary)]/30 flex items-center justify-center mb-4">
              <Monitor className="w-8 h-8 text-[var(--tenant-primary)]" />
            </div>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white mb-2">
              Abrir Terminal POS
            </h2>
            <p className="text-sm text-slate-700 dark:text-zinc-300 mb-6 max-w-sm">
              Inicia la sesión de ventas en mostrador, abre o cierra tu turno de caja e imprime tickets térmicos.
            </p>
            <Link href={`/t/${slug}/pos`} target="_blank">
              <Button
                style={{
                  backgroundColor: 'var(--tenant-primary)',
                  color: 'var(--tenant-primary-fg)',
                }}
                className="font-bold px-6 py-2.5"
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                Iniciar POS Mostrador
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/50 flex items-center justify-center mb-4">
              <Wifi className="w-8 h-8 text-slate-600 dark:text-zinc-300" />
            </div>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white mb-2">
              Operación Híbrida Offline-First
            </h2>
            <p className="text-sm text-slate-700 dark:text-zinc-300 mb-6 max-w-sm">
              El catálogo y las ventas operan con persistencia local en IndexedDB (Dexie.js) y sincronizan automáticamente al volver la red.
            </p>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Catálogo + Cola Offline Activos</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historial de Turnos y Arqueos con Paginación Reactiva */}
      <ShiftsHistoryTable 
        shifts={shifts} 
        slug={slug} 
        unassignedStats={unassignedStats} 
      />
    </div>
  );
}
