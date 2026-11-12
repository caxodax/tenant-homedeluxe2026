import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Monitor, Play, Wifi, Calculator } from 'lucide-react';
import Link from 'next/link';

interface ShiftHistoryRow {
  id: string;
  register_code: string;
  cashier_name: string;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
  opening_balance_primary: string;
  expected_by_method: Record<string, number> | null;
  actual_by_method: Record<string, number> | null;
  discrepancy_by_method: Record<string, number> | null;
  cashier_notes: string | null;
}

function sumValues(obj: Record<string, number> | null | undefined): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export default async function PosAccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'pos');

  const shifts: ShiftHistoryRow[] = await withTenantDb(
    tenant.db_schema_name,
    null,
    async (client) => {
      const res = await client.query(`
        SELECT cs.id, cr.code AS register_code, cs.cashier_name, cs.status,
               cs.opened_at, cs.closed_at, cs.opening_balance_primary,
               cs.expected_by_method, cs.actual_by_method, cs.discrepancy_by_method,
               cs.cashier_notes
        FROM cash_shifts cs
        JOIN cash_registers cr ON cr.id = cs.register_id
        ORDER BY cs.opened_at DESC
        LIMIT 10
      `);
      return res.rows;
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

      {/* Historial de Turnos y Arqueos */}
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[var(--tenant-primary)]" />
            Historial de Turnos y Cierres de Caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-zinc-400 py-6 text-center">
              Aún no se han registrado aperturas o cierres de caja. Ábrelo desde el terminal POS.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-zinc-900 text-xs font-bold uppercase text-slate-700 dark:text-zinc-300 border-b border-slate-200 dark:border-zinc-800">
                    <th className="py-3 px-4">Caja / Cajero</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Fondo</th>
                    <th className="py-3 px-4 text-right">Esperado</th>
                    <th className="py-3 px-4 text-right">Contado</th>
                    <th className="py-3 px-4 text-right">Diferencia</th>
                    <th className="py-3 px-4">Apertura / Cierre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-zinc-800">
                  {shifts.map((sh) => {
                    const expected = sumValues(sh.expected_by_method);
                    const actual = sumValues(sh.actual_by_method);
                    const diff = sumValues(sh.discrepancy_by_method);
                    return (
                      <tr key={sh.id} className="text-slate-900 dark:text-zinc-200">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-xs text-[var(--tenant-primary)]">
                            {sh.register_code}
                          </div>
                          <div className="font-semibold text-sm">{sh.cashier_name}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                              sh.status === 'OPEN'
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-200/80 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 border-slate-300 dark:border-zinc-700'
                            }`}
                          >
                            {sh.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold">
                          ${parseFloat(sh.opening_balance_primary || '0').toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {sh.status === 'CLOSED' ? `$${expected.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {sh.status === 'CLOSED' ? `$${actual.toFixed(2)}` : '—'}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            sh.status !== 'CLOSED'
                              ? ''
                              : diff === 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : diff < 0
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {sh.status === 'CLOSED'
                            ? `${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 dark:text-zinc-300">
                          <div>{new Date(sh.opened_at).toLocaleString('es-VE')}</div>
                          {sh.closed_at && (
                            <div className="text-slate-500 dark:text-zinc-400">
                              Cierre: {new Date(sh.closed_at).toLocaleString('es-VE')}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
