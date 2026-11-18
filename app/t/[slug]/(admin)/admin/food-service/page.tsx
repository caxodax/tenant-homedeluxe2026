'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  UtensilsCrossed,
  Plus,
  RefreshCw,
  Users,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  CreditCard,
  Ban,
  Search,
  DollarSign,
  ChevronRight,
  Split,
  Percent,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FsZone, FsTable } from '@/lib/plugins/food-service';
import { calculateSplitBillEqual, calculateTipOrServiceCharge } from '@/lib/plugins/food-service';

export default function FoodServiceAdminPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const [activeTab, setActiveTab] = useState<'tables' | '86'>('tables');
  const [zones, setZones] = useState<FsZone[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de Apertura de Mesa
  const [openingTable, setOpeningTable] = useState<FsTable | null>(null);
  const [coversCount, setCoversCount] = useState<number>(2);
  const [openingNotes, setOpeningNotes] = useState<string>('');

  // Modal de Cobro y Split Bill
  const [payingTable, setPayingTable] = useState<FsTable | null>(null);
  const [splitCount, setSplitCount] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [includeTip, setIncludeTip] = useState<boolean>(true);
  const [tipPct, setTipPct] = useState<number>(10);
  const [exchangeRate, setExchangeRate] = useState<number>(65.0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Pestaña Agotados 86
  const [catalogProducts, setCatalogProducts] = useState<Array<{ id: string; name: string; price_primary: number }>>([]);
  const [products86, setProducts86] = useState<string[]>([]);
  const [search86, setSearch86] = useState<string>('');
  const [loading86, setLoading86] = useState<boolean>(false);

  const loadZonesAndTables = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables`);
      const data = await res.json();
      if (data.success && Array.isArray(data.zones)) {
        setZones(data.zones);
      }
    } catch (err) {
      console.error('Error loading tables:', err);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  const load86Data = useCallback(async () => {
    if (!slug) return;
    setLoading86(true);
    try {
      const [res86, resCatalog] = await Promise.all([
        fetch(`/api/tenant/${slug}/food-service/86`),
        fetch(`/api/tenant/${slug}/catalog?limit=200`),
      ]);
      const data86 = await res86.json();
      const dataCatalog = await resCatalog.json();

      if (data86.success) setProducts86(data86.products_86 || []);
      if (dataCatalog.products) {
        setCatalogProducts(
          dataCatalog.products.map((p: { id: string; name: string; price_primary: number }) => ({
            id: p.id,
            name: p.name,
            price_primary: Number(p.price_primary || 0),
          }))
        );
      }
    } catch (err) {
      console.error('Error loading 86 data:', err);
    } finally {
      setLoading86(false);
    }
  }, [slug]);

  useEffect(() => {
    loadZonesAndTables();
  }, [loadZonesAndTables]);

  useEffect(() => {
    if (activeTab === '86') {
      load86Data();
    }
  }, [activeTab, load86Data]);

  // Manejador: Abrir Mesa
  const handleConfirmOpenTable = async () => {
    if (!openingTable) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${openingTable.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'OPEN',
          covers: coversCount,
          notes: openingNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir la mesa');
      toast.success(`Mesa ${openingTable.label} abierta`);
      setOpeningTable(null);
      setOpeningNotes('');
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir mesa');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejador: Cobrar Mesa y Liberar
  const handleConfirmPayTable = async () => {
    if (!payingTable || !payingTable.current_ticket) return;
    setIsSubmitting(true);
    try {
      const ticketTotal = payingTable.current_ticket.total_primary || 0.0;
      const tipAmount = includeTip ? calculateTipOrServiceCharge(ticketTotal, 'TIP_VOLUNTARY', tipPct) : 0.0;

      const splits = calculateSplitBillEqual(ticketTotal, splitCount, exchangeRate).map((s) => ({
        ...s,
        method: paymentMethod,
        reference: `MESA-${payingTable.label}-SPLIT-${s.split_no}`,
      }));

      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${payingTable.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PAY',
          ticket_id: payingTable.current_ticket.id,
          pay_mode: splitCount > 1 ? 'EQUAL' : 'FULL',
          splits,
          tip_amount_primary: tipAmount,
          payment_method: paymentMethod,
          exchange_rate: exchangeRate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo liquidar la comanda');
      toast.success(`Cuenta de mesa ${payingTable.label} cobrada y liberada`);
      setPayingTable(null);
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cobrar comanda');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manejador: Toggle Agotado 86
  const handleToggle86 = async (productId: string, currentState: boolean) => {
    const nextState = !currentState;
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/86`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          is_86: nextState,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado 86');

      setProducts86((prev) =>
        nextState ? [...prev, productId] : prev.filter((id) => id !== productId)
      );
      toast.success(nextState ? 'Plato marcado como AGOTADO (86)' : 'Plato reactivado en carta');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar estado 86');
    }
  };

  const filtered86Products = catalogProducts.filter((p) =>
    p.name.toLowerCase().includes(search86.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/60">
              <UtensilsCrossed className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-950 dark:text-white tracking-tight">
                Salón, Mesas & Gastronomía
              </h1>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Control de comandas de mesa, división de cuentas bimonetarias (Split Bill) y catálogo de agotados (86)
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas y Refresh */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-stone-100 dark:bg-zinc-800 p-1 border border-stone-200 dark:border-zinc-700">
            <button
              onClick={() => setActiveTab('tables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'tables'
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              Plano de Mesas
            </button>
            <button
              onClick={() => setActiveTab('86')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === '86'
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              Agotados Hoy (86) ({products86.length})
            </button>
          </div>

          <button
            onClick={activeTab === 'tables' ? loadZonesAndTables : load86Data}
            title="Refrescar datos"
            className="p-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-600 dark:text-zinc-300 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PESTAÑA 1: PLANO DE MESAS */}
      {activeTab === 'tables' && (
        <div className="space-y-8">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-3 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-stone-500 font-bold">Cargando salones y mesas...</p>
            </div>
          ) : zones.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800">
              <UtensilsCrossed className="w-10 h-10 text-stone-400 mx-auto mb-2" />
              <h3 className="font-extrabold text-sm text-stone-900 dark:text-white">Sin zonas configuradas</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
                Añade zonas como Terraza, Barra o Salón Principal para comenzar a despachar mesas.
              </p>
            </div>
          ) : (
            zones.map((zone) => (
              <div key={zone.id} className="space-y-3">
                <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-zinc-800/80 pb-2">
                  <h2 className="text-sm font-black uppercase tracking-wider text-stone-700 dark:text-zinc-300">
                    {zone.name}
                  </h2>
                  <span className="text-xs font-mono font-bold text-stone-400">
                    {zone.tables?.length || 0} mesas
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                  {zone.tables?.map((table) => {
                    const isOccupied = table.status === 'OCCUPIED';
                    const hasTicket = Boolean(table.current_ticket);
                    const ticketTotal = table.current_ticket?.total_primary || 0.0;

                    return (
                      <div
                        key={table.id}
                        className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-all duration-150 ${
                          isOccupied
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/40 shadow-xs'
                            : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-black text-sm text-stone-900 dark:text-white">
                              {table.label}
                            </span>
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                                isOccupied
                                  ? 'bg-amber-500 text-stone-950'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {isOccupied ? 'OCUPADA' : 'LIBRE'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-zinc-400 font-medium mb-3">
                            <Users className="w-3.5 h-3.5" />
                            <span>
                              {hasTicket ? `${table.current_ticket?.covers} comensales` : `${table.seats} puestos`}
                            </span>
                          </div>

                          {isOccupied && (
                            <div className="bg-amber-500/10 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-500/20 mb-3 text-center">
                              <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block">
                                Total Cuenta
                              </span>
                              <span className="font-mono text-base font-black text-stone-950 dark:text-white">
                                ${ticketTotal.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Acciones de Mesa */}
                        <div className="pt-2 border-t border-stone-100 dark:border-zinc-800/80">
                          {!isOccupied ? (
                            <button
                              onClick={() => {
                                setOpeningTable(table);
                                setCoversCount(table.seats);
                              }}
                              className="w-full py-1.5 px-2 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-white dark:hover:bg-stone-100 text-white dark:text-black font-extrabold text-xs transition-all shadow-xs active:scale-95"
                            >
                              Abrir Mesa
                            </button>
                          ) : (
                            <button
                              onClick={() => setPayingTable(table)}
                              className="w-full py-1.5 px-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs transition-all shadow-xs active:scale-95 flex items-center justify-center gap-1"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Cobrar Cuenta</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* PESTAÑA 2: AGOTADOS HOY (86) */}
      {activeTab === '86' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-stone-200 dark:border-zinc-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Buscar plato o ingrediente agotado..."
                value={search86}
                onChange={(e) => setSearch86(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Los platos marcados como 86 se bloquean instantáneamente en Vitrina y POS por el servicio de hoy.
            </p>
          </div>

          {loading86 ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-3 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-stone-500 font-bold">Cargando catálogo...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered86Products.map((prod) => {
                const is86 = products86.includes(prod.id);
                return (
                  <div
                    key={prod.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                      is86
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-500/40'
                        : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h4
                        className={`text-xs font-bold truncate ${
                          is86 ? 'line-through text-stone-400' : 'text-stone-900 dark:text-white'
                        }`}
                      >
                        {prod.name}
                      </h4>
                      <span className="font-mono text-xs font-semibold text-stone-500">
                        ${prod.price_primary.toFixed(2)}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={is86}
                      onClick={() => handleToggle86(prod.id, is86)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                        is86 ? 'bg-rose-600' : 'bg-stone-300 dark:bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          is86 ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: APERTURA DE MESA */}
      {openingTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-stone-200 dark:border-zinc-800 max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-black text-base text-stone-950 dark:text-white">
                  Abrir Mesa: {openingTable.label}
                </h3>
                <p className="text-xs text-stone-500">Asignar comensales y abrir comanda de sala</p>
              </div>
              <button
                onClick={() => setOpeningTable(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1.5">
                  Número de Comensales
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 4, 6, 8].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCoversCount(n)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                        coversCount === n
                          ? 'bg-orange-600 border-orange-600 text-white shadow-xs'
                          : 'bg-stone-50 dark:bg-zinc-800 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1.5">
                  Notas de Sala (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cumpleaños, comensal alérgico al maní..."
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full p-3 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setOpeningTable(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmOpenTable}
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? 'Abriendo...' : 'Confirmar Apertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COBRAR MESA & SPLIT BILL */}
      {payingTable && payingTable.current_ticket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-stone-200 dark:border-zinc-800 max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="font-black text-base text-stone-950 dark:text-white">
                  Cobrar Mesa: {payingTable.label}
                </h3>
                <p className="text-xs text-stone-500">
                  Comanda #{payingTable.current_ticket.id.slice(0, 8)} · {payingTable.current_ticket.covers} comensales
                </p>
              </div>
              <button
                onClick={() => setPayingTable(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Resumen de Montos */}
            <div className="bg-stone-50 dark:bg-zinc-800/60 p-4 rounded-2xl border border-stone-200/80 dark:border-zinc-700/80 space-y-2">
              <div className="flex justify-between text-xs font-bold text-stone-600 dark:text-zinc-400">
                <span>Subtotal Comanda:</span>
                <span className="font-mono text-stone-950 dark:text-white">
                  ${(payingTable.current_ticket.total_primary || 0).toFixed(2)}
                </span>
              </div>

              {includeTip && (
                <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Propina Sugerida ({tipPct}%):</span>
                  <span className="font-mono">
                    +$
                    {calculateTipOrServiceCharge(
                      payingTable.current_ticket.total_primary || 0,
                      'TIP_VOLUNTARY',
                      tipPct
                    ).toFixed(2)}
                  </span>
                </div>
              )}

              <div className="border-t border-stone-200 dark:border-zinc-700 pt-2 flex justify-between text-sm font-black text-stone-950 dark:text-white">
                <span>Total a Cobrar:</span>
                <div className="text-right">
                  <span className="font-mono text-orange-600 dark:text-orange-400 block">
                    $
                    {(
                      (payingTable.current_ticket.total_primary || 0) +
                      (includeTip
                        ? calculateTipOrServiceCharge(
                            payingTable.current_ticket.total_primary || 0,
                            'TIP_VOLUNTARY',
                            tipPct
                          )
                        : 0)
                    ).toFixed(2)}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-stone-500 block">
                    Bs.{' '}
                    {(
                      ((payingTable.current_ticket.total_primary || 0) +
                        (includeTip
                          ? calculateTipOrServiceCharge(
                              payingTable.current_ticket.total_primary || 0,
                              'TIP_VOLUNTARY',
                              tipPct
                            )
                          : 0)) *
                      exchangeRate
                    ).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Opciones de División de Cuenta (Split Bill) */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>División de Cuenta (Split Bill)</span>
                  <span className="font-mono text-orange-600">{splitCount} parte(s)</span>
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSplitCount(s)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        splitCount === s
                          ? 'bg-orange-600 border-orange-600 text-white'
                          : 'bg-stone-50 dark:bg-zinc-800 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300'
                      }`}
                    >
                      {s === 1 ? 'Total' : `${s} partes`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Método de Pago */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1.5">
                  Método de Cobro
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white font-bold"
                >
                  <option value="CASH">Efectivo Divisas ($)</option>
                  <option value="PAGO_MOVIL">Pago Móvil (VES)</option>
                  <option value="ZELLE">Zelle / Transferencia</option>
                  <option value="PUNTO">Punto de Venta / Tarjeta</option>
                </select>
              </div>

              {/* Toggle de Propina */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                  Incluir Propina / Servicio Voluntario
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeTip}
                  onClick={() => setIncludeTip(!includeTip)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    includeTip ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      includeTip ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPayingTable(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmPayTable}
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-xs disabled:opacity-50"
              >
                {isSubmitting ? 'Procesando Pago...' : 'Confirmar Pago & Liberar Mesa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
