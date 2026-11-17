'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';

export interface ShiftHistoryRow {
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

interface ShiftsHistoryTableProps {
  shifts: ShiftHistoryRow[];
  slug: string;
  unassignedStats?: { count: number; sum_usd: string };
}

function sumValues(obj: Record<string, number> | null | undefined): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((acc, v) => acc + (Number(v) || 0), 0);
}

export function ShiftsHistoryTable({ shifts, slug, unassignedStats }: ShiftsHistoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const totalPages = Math.max(1, Math.ceil(shifts.length / pageSize));
  const paginatedShifts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return shifts.slice(start, start + pageSize);
  }, [shifts, currentPage, pageSize]);

  return (
    <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
      <CardHeader>
        <CardTitle className="text-base font-extrabold text-slate-950 dark:text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[var(--tenant-primary)]" />
            <span>Historial de Turnos y Cierres de Caja</span>
          </div>
          {shifts.length > 0 && (
            <span className="text-xs font-mono font-medium text-slate-500 dark:text-zinc-400">
              {shifts.length} {shifts.length === 1 ? 'turno registrado' : 'turnos registrados'}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {Number(unassignedStats?.count || 0) > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              <strong>Auditoría de Turnos:</strong> Hay {unassignedStats?.count} ventas de mostrador registradas fuera de turnos activos por un total de <strong>${parseFloat(unassignedStats?.sum_usd || '0').toFixed(2)} USD</strong> (ej. cobradas antes de la apertura o con caja cerrada).
            </span>
            <Link href={`/t/${slug}/admin/orders`} className="underline font-bold shrink-0">
              Ver en Pedidos →
            </Link>
          </div>
        )}

        {shifts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-zinc-400 py-6 text-center">
            Aún no se han registrado aperturas o cierres de caja. Ábrelo desde el terminal POS.
          </p>
        ) : (
          <div className="space-y-4">
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
                  {paginatedShifts.map((sh) => {
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

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400">
                <div>
                  Mostrando <strong className="text-slate-900 dark:text-white">{(currentPage - 1) * pageSize + 1}</strong> a{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {Math.min(currentPage * pageSize, shifts.length)}
                  </strong>{' '}
                  de <strong className="text-slate-900 dark:text-white">{shifts.length}</strong> turnos
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-3 text-xs"
                  >
                    Anterior
                  </Button>
                  <span className="font-mono font-bold text-slate-900 dark:text-white px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-3 text-xs"
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
