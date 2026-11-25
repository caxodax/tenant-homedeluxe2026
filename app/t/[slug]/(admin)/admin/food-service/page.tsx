'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  UtensilsCrossed,
  Plus,
  RefreshCw,
  Users,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Ban,
  Search,
  DollarSign,
  Split,
  ArrowRightLeft,
  Trash2,
  ShieldCheck,
  XCircle,
  ShoppingBag,
  FileText,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FsZone, FsTable, FsTicketOrderItem } from '@/lib/plugins/food-service-shared';
import { calculateSplitBillEqual, calculateTipOrServiceCharge } from '@/lib/plugins/food-service-shared';

interface PaymentMethodInfo {
  code: string;
  name: string;
  currency: string;
  config?: Record<string, unknown>;
}

interface SplitEntryState {
  split_no: number;
  label: string;
  amount_primary: number;
  method: string;
  reference: string;
  selected: boolean;
}

const DIGITAL_METHODS = new Set(['PAGO_MOVIL', 'ZELLE', 'TRANSFER', 'TRANSFERENCIA']);

export default function FoodServiceAdminPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string) || '';

  const [activeTab, setActiveTab] = useState<'tables' | '86'>('tables');
  const [zones, setZones] = useState<FsZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManageTables, setCanManageTables] = useState(false);
  const [canValidatePayments, setCanValidatePayments] = useState(false);
  const [staffRole, setStaffRole] = useState<string>('WAITER');
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodInfo[]>([]);

  // Modales de Gestión de Zonas y Mesas (Solo Admin / Gerente / Propietario)
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [addingTableToZone, setAddingTableToZone] = useState<FsZone | null>(null);
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newTableSeats, setNewTableSeats] = useState(4);

  // Modal de Apertura de Mesa
  const [openingTable, setOpeningTable] = useState<FsTable | null>(null);
  const [coversCount, setCoversCount] = useState<number>(2);
  const [openingNotes, setOpeningNotes] = useState<string>('');

  // Modal de Pre-Cuenta
  const [preBillTable, setPreBillTable] = useState<FsTable | null>(null);

  // Modal de Traslado de Mesa
  const [movingTable, setMovingTable] = useState<FsTable | null>(null);
  const [targetMoveTableId, setTargetMoveTableId] = useState<string>('');

  // Modal de Cobro y Split Bill Avanzado
  const [payingTable, setPayingTable] = useState<FsTable | null>(null);
  const [payMode, setPayMode] = useState<'FULL' | 'EQUAL' | 'ITEMS'>('FULL');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [equalSplits, setEqualSplits] = useState<SplitEntryState[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [itemSplitLabel, setItemSplitLabel] = useState<string>('Cuenta Individual');
  const [includeTip, setIncludeTip] = useState<boolean>(false); // Propina opcional (desactivada por defecto)
  const [tipPct, setTipPct] = useState<number>(10);
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
        setCanManageTables(Boolean(data.can_manage_tables));
        setCanValidatePayments(Boolean(data.can_validate_payments));
        if (data.staff_role) setStaffRole(data.staff_role);
        setExchangeRate(Number(data.exchange_rate || 0));
        if (Array.isArray(data.payment_methods)) {
          setPaymentMethods(data.payment_methods);
        }
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

  // Recalcular divisiones iguales al abrir o cambiar splitCount
  const remainingOfPayingTable = useMemo(() => {
    if (!payingTable?.current_ticket) return 0;
    return payingTable.current_ticket.remaining_primary ?? payingTable.current_ticket.total_primary ?? 0;
  }, [payingTable]);

  useEffect(() => {
    if (payMode === 'EQUAL' && payingTable) {
      const tip = includeTip ? calculateTipOrServiceCharge(remainingOfPayingTable, 'TIP_VOLUNTARY', tipPct) : 0;
      const totalWithTip = Math.round((remainingOfPayingTable + tip) * 100) / 100;
      const calc = calculateSplitBillEqual(totalWithTip, splitCount, Math.max(exchangeRate, 1));
      setEqualSplits(
        calc.map((c) => ({
          split_no: c.split_no,
          label: `Persona ${c.split_no}`,
          amount_primary: c.amount_primary,
          method: 'CASH',
          reference: '',
          selected: true,
        }))
      );
    }
  }, [payMode, splitCount, remainingOfPayingTable, includeTip, tipPct, exchangeRate, payingTable]);

  // Todas las mesas libres (para Traslado de Mesa)
  const freeTablesList = useMemo(() => {
    const list: Array<{ id: string; label: string; zoneName: string; seats: number }> = [];
    zones.forEach((z) => {
      z.tables?.forEach((t) => {
        if (t.status === 'FREE') {
          list.push({ id: t.id, label: t.label, zoneName: z.name, seats: t.seats });
        }
      });
    });
    return list;
  }, [zones]);

  // Mesas con pagos reportados pendientes de validar por Caja
  const pendingValidationTables = useMemo(() => {
    const list: FsTable[] = [];
    zones.forEach((z) => {
      z.tables?.forEach((t) => {
        if (t.current_ticket?.pending_payments && t.current_ticket.pending_payments.length > 0) {
          list.push(t);
        }
      });
    });
    return list;
  }, [zones]);

  // Datos de Pago Móvil configurados en el comercio
  const pagoMovilConfig = useMemo(() => {
    return paymentMethods.find((m) => m.code === 'PAGO_MOVIL')?.config || null;
  }, [paymentMethods]);

  const availablePayOptions = useMemo(() => {
    if (paymentMethods.length > 0) {
      const base = paymentMethods.map((m) => ({ code: m.code, label: m.name }));
      if (!base.some((b) => b.code === 'CASH')) base.unshift({ code: 'CASH', label: 'Efectivo Divisas ($)' });
      return base;
    }
    return [
      { code: 'CASH', label: 'Efectivo Divisas ($)' },
      { code: 'PAGO_MOVIL', label: 'Pago Móvil (Bs.)' },
      { code: 'ZELLE', label: 'Zelle / Transferencia' },
      { code: 'PUNTO', label: 'Punto de Venta / Tarjeta' },
    ];
  }, [paymentMethods]);

  // ============================================================================
  // MANEJADORES DE ZONAS Y MESAS (Solo Admin / Gerente / Propietario)
  // ============================================================================
  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'zone',
          data: { name: newZoneName.trim(), sort_order: zones.length + 1, is_active: true },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear zona');
      toast.success(`Zona "${newZoneName.trim()}" creada`);
      setNewZoneName('');
      setIsZoneModalOpen(false);
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear zona');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingTableToZone || !newTableLabel.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'table',
          data: {
            zone_id: addingTableToZone.id === 'unassigned' ? null : addingTableToZone.id,
            label: newTableLabel.trim(),
            seats: newTableSeats,
            status: 'FREE',
            is_active: true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear mesa');
      toast.success(`Mesa "${newTableLabel.trim()}" agregada a ${addingTableToZone.name}`);
      setNewTableLabel('');
      setNewTableSeats(4);
      setAddingTableToZone(null);
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear mesa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTable = async (table: FsTable) => {
    if (table.status !== 'FREE') {
      toast.error('Solo puedes eliminar mesas que estén LIBRES.');
      return;
    }
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables?type=table&id=${table.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar la mesa');
      toast.success(`Mesa ${table.label} eliminada`);
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar mesa');
    }
  };

  // ============================================================================
  // MANEJADORES OPERATIVOS DE SALA (Mesero / Cajero / Gerente)
  // ============================================================================
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

  const handleRequestBill = async (table: FsTable) => {
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${table.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REQUEST_BILL' }),
      });
      if (res.ok) {
        toast.info(`Mesa ${table.label} marcada como Cuenta Pedida`);
        setPreBillTable(table);
        loadZonesAndTables();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReleaseEmptyTable = async (table: FsTable) => {
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${table.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RELEASE_EMPTY' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo liberar la mesa');
      toast.success(`Mesa ${table.label} liberada`);
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al liberar mesa');
    }
  };

  const handleConfirmMoveTable = async () => {
    if (!movingTable || !targetMoveTableId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${movingTable.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'MOVE_TABLE', to_table_id: targetMoveTableId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al trasladar mesa');
      toast.success(`Comanda trasladada exitosamente`);
      setMovingTable(null);
      setTargetMoveTableId('');
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al trasladar mesa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidatePayment = async (tableId: string, ticketId: string, paymentId: string, approve: boolean) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${tableId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'VALIDATE_PAYMENT',
          ticket_id: ticketId,
          payment_id: paymentId,
          approve,
          rejection_reason: approve ? null : 'Pago no verificado en cuenta bancaria',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al validar pago');
      toast.success(approve ? 'Pago confirmado y mesa actualizada' : 'Pago rechazado; saldo restaurado en mesa');
      loadZonesAndTables();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al validar pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPayModal = (table: FsTable) => {
    setPayingTable(table);
    setPayMode('FULL');
    setPaymentMethod('CASH');
    setPaymentRef('');
    setIncludeTip(false); // Propina opcional por defecto
    setSelectedItemIds({});
    setItemSplitLabel('Subcuenta 1');
  };

  // Subtotal seleccionado en modo ITEMS
  const selectedItemsTotal = useMemo(() => {
    if (!payingTable?.current_ticket?.items) return 0;
    return payingTable.current_ticket.items
      .filter((it) => selectedItemIds[it.id])
      .reduce((acc, it) => acc + it.subtotal, 0);
  }, [payingTable, selectedItemIds]);

  const handleConfirmPayTable = async () => {
    if (!payingTable || !payingTable.current_ticket) return;
    const ticket = payingTable.current_ticket;
    const rate = Math.max(exchangeRate, 1);

    let payload: Record<string, unknown> = {
      action: 'PAY',
      ticket_id: ticket.id,
      exchange_rate: rate,
    };

    if (payMode === 'FULL') {
      const amount = remainingOfPayingTable;
      const tip = includeTip ? calculateTipOrServiceCharge(amount, 'TIP_VOLUNTARY', tipPct) : 0;
      if (DIGITAL_METHODS.has(paymentMethod.toUpperCase()) && !paymentRef.trim()) {
        toast.error('Ingresa el número de referencia del Pago Móvil / Transferencia.');
        return;
      }
      payload = {
        ...payload,
        pay_mode: 'FULL',
        payment_method: paymentMethod,
        reference_number: paymentRef.trim() || null,
        tip_amount_primary: tip,
        splits: [],
      };
    } else if (payMode === 'EQUAL') {
      const selectedSplits = equalSplits.filter((s) => s.selected);
      if (selectedSplits.length === 0) {
        toast.error('Selecciona al menos una parte para cobrar.');
        return;
      }
      for (const s of selectedSplits) {
        if (DIGITAL_METHODS.has(s.method.toUpperCase()) && !s.reference.trim()) {
          toast.error(`Ingresa el número de referencia para ${s.label}.`);
          return;
        }
      }
      payload = {
        ...payload,
        pay_mode: 'EQUAL',
        payment_method: selectedSplits[0].method,
        tip_amount_primary: includeTip
          ? calculateTipOrServiceCharge(remainingOfPayingTable, 'TIP_VOLUNTARY', tipPct)
          : 0,
        splits: selectedSplits.map((s) => ({
          split_no: s.split_no,
          label: s.label,
          amount_primary: s.amount_primary,
          amount_secondary: Math.round(s.amount_primary * rate * 100) / 100,
          method: s.method,
          reference: s.reference.trim() || `MESA-${payingTable.label}-P${s.split_no}`,
          item_refs: [],
        })),
      };
    } else if (payMode === 'ITEMS') {
      const itemIds = Object.keys(selectedItemIds).filter((id) => selectedItemIds[id]);
      if (itemIds.length === 0) {
        toast.error('Selecciona al menos un plato o bebida para cobrar esta subcuenta.');
        return;
      }
      if (DIGITAL_METHODS.has(paymentMethod.toUpperCase()) && !paymentRef.trim()) {
        toast.error('Ingresa el número de referencia para Pago Móvil / Transferencia.');
        return;
      }
      const tip = includeTip ? calculateTipOrServiceCharge(selectedItemsTotal, 'TIP_VOLUNTARY', tipPct) : 0;
      const totalSub = Math.round((selectedItemsTotal + tip) * 100) / 100;
      payload = {
        ...payload,
        pay_mode: 'ITEMS',
        payment_method: paymentMethod,
        tip_amount_primary: tip,
        splits: [
          {
            split_no: 1,
            label: itemSplitLabel.trim() || 'Cuenta por Ítems',
            amount_primary: selectedItemsTotal,
            amount_secondary: Math.round(totalSub * rate * 100) / 100,
            method: paymentMethod,
            reference: paymentRef.trim() || `ITEMS-${payingTable.label}`,
            item_refs: itemIds,
          },
        ],
      };
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/tables/${payingTable.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo procesar el pago de la mesa');

      const result = data.result;
      if (result?.table_status === 'PENDING_VALIDATION') {
        toast.info(`Pago reportado en Mesa ${payingTable.label}. Queda POR VALIDAR por Caja.`);
      } else if (result?.table_status === 'OCCUPIED') {
        toast.success(`Abono parcial registrado. Saldo restante en Mesa ${payingTable.label}: $${Number(result.remaining_primary || 0).toFixed(2)}`);
      } else {
        toast.success(`Mesa ${payingTable.label} cobrada y liberada`);
      }
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
        body: JSON.stringify({ product_id: productId, is_86: nextState }),
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

  const getTableBadge = (status: FsTable['status']) => {
    switch (status) {
      case 'OCCUPIED':
        return { label: 'OCUPADA', cls: 'bg-amber-500 text-stone-950' };
      case 'BILL_REQUESTED':
        return { label: 'CUENTA PEDIDA', cls: 'bg-blue-600 text-white' };
      case 'PENDING_VALIDATION':
        return { label: 'POR VALIDAR', cls: 'bg-violet-600 text-white animate-pulse' };
      case 'RESERVED':
        return { label: 'RESERVADA', cls: 'bg-cyan-600 text-white' };
      default:
        return {
          label: 'LIBRE',
          cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/60">
              <UtensilsCrossed className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-950 dark:text-white tracking-tight">
                Salón, Mesas & Gastronomía
              </h1>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Comandas por mesa, Split Bill parcial/por ítems, validación de Pago Móvil y agotados (86)
                {exchangeRate > 0 ? ` · Tasa BCV: Bs. ${exchangeRate.toFixed(2)}` : ' · ⚠️ Tasa BCV no configurada'}
              </p>
            </div>
          </div>
        </div>

        {/* Controles y Pestañas */}
        <div className="flex flex-wrap items-center gap-2">
          {canManageTables && activeTab === 'tables' && (
            <button
              onClick={() => setIsZoneModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-950 text-xs font-extrabold flex items-center gap-1.5 shadow-xs hover:opacity-90 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva Zona
            </button>
          )}

          <div className="inline-flex rounded-xl bg-stone-100 dark:bg-zinc-800 p-1 border border-stone-200 dark:border-zinc-700">
            <button
              onClick={() => setActiveTab('tables')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'tables'
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              Plano de Mesas
            </button>
            <button
              onClick={() => setActiveTab('86')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
            className="p-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-600 dark:text-zinc-300 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BANNER: PAGOS DE MESA PENDIENTES DE VALIDAR POR CAJA */}
      {activeTab === 'tables' && pendingValidationTables.length > 0 && (
        <div className="p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <h3 className="text-sm font-black text-violet-950 dark:text-violet-100">
                Pagos Reportados por Mesero — Pendientes de Validar en Caja ({pendingValidationTables.length})
              </h3>
            </div>
            {!canValidatePayments && (
              <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                Esperando confirmación de Caja
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingValidationTables.map((t) =>
              t.current_ticket?.pending_payments?.map((pp) => (
                <div
                  key={pp.payment_id}
                  className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-violet-200/80 dark:border-violet-800/50 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-stone-950 dark:text-white">
                        Mesa {t.label}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
                        {pp.method}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-zinc-400 font-mono mt-0.5">
                      Monto: <strong>${pp.amount_primary.toFixed(2)}</strong>
                      {exchangeRate > 0 && ` (Bs. ${(pp.amount_primary * exchangeRate).toFixed(2)})`} · Ref:{' '}
                      <strong className="text-stone-950 dark:text-white">{pp.reference_number || 'N/A'}</strong>
                    </p>
                  </div>
                  {canValidatePayments && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        disabled={isSubmitting}
                        onClick={() => handleValidatePayment(t.id, t.current_ticket!.id, pp.payment_id, true)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Confirmar
                      </button>
                      <button
                        disabled={isSubmitting}
                        onClick={() => handleValidatePayment(t.id, t.current_ticket!.id, pp.payment_id, false)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 1: PLANO DE MESAS */}
      {activeTab === 'tables' && (
        <div className="space-y-8">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-3 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-stone-500 font-bold">Cargando salones y mesas...</p>
            </div>
          ) : zones.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 space-y-3">
              <UtensilsCrossed className="w-10 h-10 text-stone-400 mx-auto" />
              <div>
                <h3 className="font-extrabold text-sm text-stone-900 dark:text-white">Sin zonas configuradas</h3>
                <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1">
                  {canManageTables
                    ? 'Añade zonas como Terraza, Barra o Salón Principal para comenzar a despachar mesas.'
                    : 'El administrador o gerente debe configurar las zonas y mesas del salón.'}
                </p>
              </div>
              {canManageTables && (
                <button
                  onClick={() => setIsZoneModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-950 text-xs font-extrabold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Crear Primera Zona
                </button>
              )}
            </div>
          ) : (
            zones.map((zone) => (
              <div key={zone.id} className="space-y-3">
                <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-zinc-800/80 pb-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-black uppercase tracking-wider text-stone-700 dark:text-zinc-300">
                      {zone.name}
                    </h2>
                    <span className="text-xs font-mono font-bold text-stone-400">
                      {zone.tables?.length || 0} mesas
                    </span>
                  </div>
                  {canManageTables && (
                    <button
                      onClick={() => {
                        setAddingTableToZone(zone);
                        setNewTableLabel(`M-${(zone.tables?.length || 0) + 1}`);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Agregar Mesa
                    </button>
                  )}
                </div>

                {(!zone.tables || zone.tables.length === 0) ? (
                  <div className="p-5 rounded-2xl border border-dashed border-stone-200 dark:border-zinc-800 text-center text-xs text-stone-400">
                    Esta zona aún no tiene mesas.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                    {zone.tables.map((table) => {
                      const ticket = table.current_ticket;
                      const isOccupied = table.status !== 'FREE';
                      const badge = getTableBadge(table.status);
                      const total = ticket?.total_primary || 0;
                      const remaining = ticket?.remaining_primary ?? total;
                      const paid = (ticket?.paid_verified_primary || 0) + (ticket?.paid_pending_primary || 0);

                      return (
                        <div
                          key={table.id}
                          className={`p-3.5 rounded-2xl border flex flex-col justify-between transition-all duration-150 ${
                            table.status === 'PENDING_VALIDATION'
                              ? 'bg-violet-50/70 dark:bg-violet-950/20 border-violet-400/60'
                              : table.status === 'BILL_REQUESTED'
                              ? 'bg-blue-50/70 dark:bg-blue-950/20 border-blue-400/60'
                              : isOccupied
                              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/40 shadow-xs'
                              : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 hover:border-stone-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2 gap-1">
                              <span className="font-black text-sm text-stone-900 dark:text-white truncate">
                                {table.label}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${badge.cls}`}>
                                  {badge.label}
                                </span>
                                {canManageTables && table.status === 'FREE' && (
                                  <button
                                    onClick={() => handleDeleteTable(table)}
                                    title="Eliminar mesa"
                                    className="p-1 rounded-md text-stone-400 hover:text-rose-600 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-zinc-400 font-medium mb-3">
                              <Users className="w-3.5 h-3.5" />
                              <span>
                                {ticket ? `${ticket.covers} comensales · ${ticket.orders_count || 0} rondas` : `${table.seats} puestos`}
                              </span>
                            </div>

                            {isOccupied && ticket && (
                              <div className="mb-3 p-2.5 rounded-xl bg-white/85 dark:bg-zinc-950/60 border border-stone-200/70 dark:border-zinc-800 space-y-1">
                                <div className="flex justify-between text-[11px] text-stone-500">
                                  <span>Consumo:</span>
                                  <span className="font-mono font-bold text-stone-900 dark:text-white">${total.toFixed(2)}</span>
                                </div>
                                {paid > 0 && (
                                  <div className="flex justify-between text-[11px] text-emerald-600 dark:text-emerald-400">
                                    <span>Abonado / Reportado:</span>
                                    <span className="font-mono font-bold">-${paid.toFixed(2)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-xs font-black text-stone-950 dark:text-white pt-1 border-t border-stone-200/60 dark:border-zinc-800">
                                  <span>Saldo:</span>
                                  <span className="font-mono text-orange-600 dark:text-orange-400">${remaining.toFixed(2)}</span>
                                </div>
                                {exchangeRate > 0 && remaining > 0 && (
                                  <p className="text-[10px] font-mono text-stone-400 text-right">
                                    Bs. {(remaining * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Acciones por Estado de Mesa */}
                          <div className="space-y-1.5 pt-1">
                            {!isOccupied ? (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => router.push(`/t/${slug}/pos?tableId=${table.id}`)}
                                  className="flex-1 py-2 px-2.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-950 text-[11px] font-bold flex items-center justify-center gap-1 transition hover:opacity-90 cursor-pointer"
                                >
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  Tomar Pedido
                                </button>
                                <button
                                  onClick={() => {
                                    setOpeningTable(table);
                                    setCoversCount(table.seats);
                                  }}
                                  title="Solo abrir mesa sin pedido"
                                  className="p-2 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-600 dark:text-zinc-300 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                {table.status !== 'PENDING_VALIDATION' && (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                      onClick={() => router.push(`/t/${slug}/pos?tableId=${table.id}`)}
                                      className="py-1.5 px-2 rounded-xl bg-stone-900 dark:bg-zinc-800 text-white text-[11px] font-bold flex items-center justify-center gap-1 hover:opacity-90 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      Pedido
                                    </button>
                                    <button
                                      onClick={() => handleRequestBill(table)}
                                      className="py-1.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      Cuenta
                                    </button>
                                  </div>
                                )}

                                {remaining > 0 && (
                                  <button
                                    onClick={() => openPayModal(table)}
                                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    {staffRole === 'WAITER' ? 'Cobrar / Reportar Pago' : 'Cobrar / Split Bill'}
                                  </button>
                                )}

                                <div className="flex gap-1.5">
                                  {table.status !== 'PENDING_VALIDATION' && freeTablesList.length > 0 && (
                                    <button
                                      onClick={() => {
                                        setMovingTable(table);
                                        setTargetMoveTableId(freeTablesList[0]?.id || '');
                                      }}
                                      className="flex-1 py-1.5 px-2 rounded-xl border border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-600 dark:text-zinc-300 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      Trasladar
                                    </button>
                                  )}
                                  {ticket && (ticket.orders_count || 0) === 0 && (
                                    <button
                                      onClick={() => handleReleaseEmptyTable(table)}
                                      className="flex-1 py-1.5 px-2 rounded-xl border border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      Liberar Vacía
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* PESTAÑA 2: AGOTADOS HOY (86) */}
      {activeTab === '86' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-stone-200 dark:border-zinc-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar plato o producto para marcar como agotado..."
                value={search86}
                onChange={(e) => setSearch86(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="text-xs text-stone-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Los productos marcados como 86 se ocultan automáticamente de la vitrina y POS hoy.</span>
            </div>
          </div>

          {loading86 ? (
            <div className="py-12 text-center text-xs text-stone-500 font-bold">Cargando catálogo...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered86Products.map((product) => {
                const is86 = products86.includes(product.id);
                return (
                  <div
                    key={product.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                      is86
                        ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-500/40'
                        : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800'
                    }`}
                  >
                    <div className="min-w-0 pr-3">
                      <p className={`font-bold text-xs sm:text-sm truncate ${is86 ? 'text-rose-900 dark:text-rose-200 line-through' : 'text-stone-900 dark:text-white'}`}>
                        {product.name}
                      </p>
                      <span className="text-[11px] font-mono font-bold text-stone-500 dark:text-zinc-400">
                        ${product.price_primary.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleToggle86(product.id, is86)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        is86
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-rose-500/10 hover:bg-rose-500 text-rose-600 dark:text-rose-400 hover:text-white border border-rose-500/30'
                      }`}
                    >
                      {is86 ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Reactivar
                        </>
                      ) : (
                        <>
                          <Ban className="w-3.5 h-3.5" />
                          Marcar 86
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREAR ZONA */}
      {isZoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateZone} className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 border border-stone-200 dark:border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-stone-950 dark:text-white">Nueva Zona de Salón</h3>
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                Nombre de la Zona
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Salón Principal, Terraza, Barra..."
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white font-bold"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsZoneModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-bold text-stone-600 dark:text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-950 text-xs font-black disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Creando...' : 'Crear Zona'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: AGREGAR MESA A ZONA */}
      {addingTableToZone && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleCreateTable} className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 border border-stone-200 dark:border-zinc-800 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-black text-stone-950 dark:text-white">Agregar Mesa</h3>
              <p className="text-xs text-stone-500">Zona: {addingTableToZone.name}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                  Identificador / Nombre de Mesa
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. M-01, Terraza 3, Barra 2..."
                  value={newTableLabel}
                  onChange={(e) => setNewTableLabel(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                  Capacidad (Puestos)
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={newTableSeats}
                  onChange={(e) => setNewTableSeats(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white font-bold"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddingTableToZone(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-bold text-stone-600 dark:text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-950 text-xs font-black disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Guardando...' : 'Agregar Mesa'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: APERTURA DE MESA */}
      {openingTable && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-stone-200 dark:border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-stone-950 dark:text-white">
              Abrir Mesa {openingTable.label}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                  Cantidad de Comensales
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={coversCount}
                  onChange={(e) => setCoversCount(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                  Notas de Comanda (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Cumpleaños, mesa cerca de ventana..."
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setOpeningTable(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-bold text-stone-600 dark:text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleConfirmOpenTable}
                className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Abriendo...' : 'Confirmar Apertura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRE-CUENTA (PEDIR CUENTA) */}
      {preBillTable && preBillTable.current_ticket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-stone-200 dark:border-zinc-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">Pre-Cuenta de Mesa</span>
                <h3 className="text-lg font-black text-stone-950 dark:text-white">Mesa {preBillTable.label}</h3>
              </div>
              <button onClick={() => setPreBillTable(null)} className="p-1.5 rounded-xl text-stone-400 hover:text-stone-900 cursor-pointer">✕</button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {(preBillTable.current_ticket.items || []).map((it) => (
                <div key={it.id} className="flex justify-between text-xs py-1 border-b border-stone-100 dark:border-zinc-800/50">
                  <span className={it.is_paid || it.is_pending ? 'line-through text-stone-400' : 'text-stone-800 dark:text-zinc-200 font-medium'}>
                    {it.quantity}x {it.product_name}
                  </span>
                  <span className="font-mono font-bold text-stone-900 dark:text-white">${it.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="bg-stone-50 dark:bg-zinc-800/60 p-4 rounded-2xl space-y-1.5">
              <div className="flex justify-between text-xs text-stone-500">
                <span>Saldo Pendiente:</span>
                <span className="font-mono font-black text-base text-stone-950 dark:text-white">
                  ${(preBillTable.current_ticket.remaining_primary ?? preBillTable.current_ticket.total_primary ?? 0).toFixed(2)}
                </span>
              </div>
              {exchangeRate > 0 && (
                <div className="flex justify-between text-xs font-bold text-orange-600 dark:text-orange-400">
                  <span>Total en Bolívares (BCV {exchangeRate.toFixed(2)}):</span>
                  <span className="font-mono">
                    Bs. {((preBillTable.current_ticket.remaining_primary ?? preBillTable.current_ticket.total_primary ?? 0) * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {pagoMovilConfig && (
              <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-black text-blue-900 dark:text-blue-200">
                  <Smartphone className="w-3.5 h-3.5" />
                  Datos Pago Móvil
                </div>
                {Boolean(pagoMovilConfig.bank_name) && <p className="text-blue-800 dark:text-blue-300">Banco: <strong>{String(pagoMovilConfig.bank_name)}</strong></p>}
                {Boolean(pagoMovilConfig.phone) && <p className="text-blue-800 dark:text-blue-300">Teléfono: <strong className="font-mono">{String(pagoMovilConfig.phone)}</strong></p>}
                {Boolean(pagoMovilConfig.rif || pagoMovilConfig.document_id) && <p className="text-blue-800 dark:text-blue-300">C.I./RIF: <strong className="font-mono">{String(pagoMovilConfig.rif || pagoMovilConfig.document_id)}</strong></p>}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setPreBillTable(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  const t = preBillTable;
                  setPreBillTable(null);
                  openPayModal(t);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer"
              >
                Ir a Cobrar / Reportar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRASLADAR MESA */}
      {movingTable && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 border border-stone-200 dark:border-zinc-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-stone-950 dark:text-white">
              Trasladar Mesa {movingTable.label}
            </h3>
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1.5">
                Selecciona la Mesa Destino (Libre)
              </label>
              <select
                value={targetMoveTableId}
                onChange={(e) => setTargetMoveTableId(e.target.value)}
                className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-white font-bold"
              >
                {freeTablesList.map((ft) => (
                  <option key={ft.id} value={ft.id}>
                    {ft.zoneName} · {ft.label} ({ft.seats} puestos)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setMovingTable(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={isSubmitting || !targetMoveTableId}
                onClick={handleConfirmMoveTable}
                className="flex-1 py-2.5 rounded-xl bg-stone-900 dark:bg-white text-white dark:text-stone-950 text-xs font-black cursor-pointer"
              >
                {isSubmitting ? 'Moviendo...' : 'Confirmar Traslado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COBRO Y SPLIT BILL AVANZADO */}
      {payingTable && payingTable.current_ticket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl p-6 border border-stone-200 dark:border-zinc-800 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Split className="w-5 h-5 text-orange-600" />
                <div>
                  <h3 className="text-lg font-black text-stone-950 dark:text-white">
                    Cobrar Mesa {payingTable.label}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Saldo pendiente: <strong>${remainingOfPayingTable.toFixed(2)}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPayingTable(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-900 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {staffRole === 'WAITER' && (
              <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60 text-[11px] font-semibold text-violet-800 dark:text-violet-200">
                Nota para Mesero: Si registras un <strong>Pago Móvil o Transferencia</strong>, la mesa quedará en estado <strong>POR VALIDAR</strong> hasta que Caja confirme el abono.
              </div>
            )}

            {/* Selector de Modo de Cobro */}
            <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-stone-100 dark:bg-zinc-800">
              <button
                type="button"
                onClick={() => setPayMode('FULL')}
                className={`py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  payMode === 'FULL' ? 'bg-white dark:bg-zinc-900 text-stone-950 dark:text-white shadow-xs' : 'text-stone-500'
                }`}
              >
                Cuenta Completa
              </button>
              <button
                type="button"
                onClick={() => setPayMode('EQUAL')}
                className={`py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  payMode === 'EQUAL' ? 'bg-white dark:bg-zinc-900 text-stone-950 dark:text-white shadow-xs' : 'text-stone-500'
                }`}
              >
                Partes Iguales
              </button>
              <button
                type="button"
                onClick={() => setPayMode('ITEMS')}
                className={`py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                  payMode === 'ITEMS' ? 'bg-white dark:bg-zinc-900 text-stone-950 dark:text-white shadow-xs' : 'text-stone-500'
                }`}
              >
                Por Ítems
              </button>
            </div>

            {/* MODO 1: CUENTA COMPLETA */}
            {payMode === 'FULL' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">Método de Cobro</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 font-bold"
                    >
                      {availablePayOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {DIGITAL_METHODS.has(paymentMethod.toUpperCase()) && (
                    <div>
                      <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                        Nro. de Referencia *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 00482910"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 font-mono font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MODO 2: PARTES IGUALES (con método individual y pago parcial opcional) */}
            {payMode === 'EQUAL' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {[2, 3, 4, 5, 6].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSplitCount(s)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                        splitCount === s
                          ? 'bg-orange-600 border-orange-600 text-white'
                          : 'bg-stone-50 dark:bg-zinc-800 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300'
                      }`}
                    >
                      {s} partes
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-stone-500">
                  Marca solo las partes que están pagando en este momento (las demás quedarán como saldo abierto en la mesa):
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {equalSplits.map((sp, idx) => (
                    <div key={sp.split_no} className="p-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-800/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sp.selected}
                            onChange={(e) => {
                              const copy = [...equalSplits];
                              copy[idx].selected = e.target.checked;
                              setEqualSplits(copy);
                            }}
                          />
                          {sp.label}
                        </label>
                        <span className="font-mono font-black text-xs text-stone-950 dark:text-white">
                          ${sp.amount_primary.toFixed(2)}
                          {exchangeRate > 0 && ` · Bs. ${(sp.amount_primary * exchangeRate).toFixed(2)}`}
                        </span>
                      </div>
                      {sp.selected && (
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={sp.method}
                            onChange={(e) => {
                              const copy = [...equalSplits];
                              copy[idx].method = e.target.value;
                              setEqualSplits(copy);
                            }}
                            className="p-2 rounded-lg text-[11px] bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 font-bold"
                          >
                            {availablePayOptions.map((opt) => (
                              <option key={opt.code} value={opt.code}>{opt.label}</option>
                            ))}
                          </select>
                          {DIGITAL_METHODS.has(sp.method.toUpperCase()) && (
                            <input
                              type="text"
                              placeholder="Referencia *"
                              value={sp.reference}
                              onChange={(e) => {
                                const copy = [...equalSplits];
                                copy[idx].reference = e.target.value;
                                setEqualSplits(copy);
                              }}
                              className="p-2 rounded-lg text-[11px] bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 font-mono font-bold"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MODO 3: POR ÍTEMS CONSUMIDOS */}
            {payMode === 'ITEMS' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                    Etiqueta de Subcuenta (Opcional)
                  </label>
                  <input
                    type="text"
                    value={itemSplitLabel}
                    onChange={(e) => setItemSplitLabel(e.target.value)}
                    placeholder="Ej. Carlos (Burger + Nestea)"
                    className="w-full p-2 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 font-bold"
                  />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(payingTable.current_ticket.items || []).map((it: FsTicketOrderItem) => {
                    const disabled = Boolean(it.is_paid || it.is_pending);
                    const checked = Boolean(selectedItemIds[it.id]);
                    return (
                      <label
                        key={it.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          disabled
                            ? 'opacity-45 bg-stone-100 dark:bg-zinc-800/30 border-stone-200 cursor-not-allowed'
                            : checked
                            ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-500 cursor-pointer'
                            : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={(e) =>
                              setSelectedItemIds((prev) => ({ ...prev, [it.id]: e.target.checked }))
                            }
                          />
                          <span className="font-bold">
                            {it.quantity}x {it.product_name}
                          </span>
                          {it.is_paid && <span className="text-[10px] text-emerald-600 font-bold">(Pagado)</span>}
                          {it.is_pending && <span className="text-[10px] text-violet-600 font-bold">(Por validar)</span>}
                        </div>
                        <span className="font-mono font-bold">${it.subtotal.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">Método de Cobro</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 font-bold"
                    >
                      {availablePayOptions.map((opt) => (
                        <option key={opt.code} value={opt.code}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {DIGITAL_METHODS.has(paymentMethod.toUpperCase()) && (
                    <div>
                      <label className="block text-xs font-bold text-stone-700 dark:text-zinc-300 mb-1">
                        Nro. de Referencia *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 00482910"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        className="w-full p-2.5 rounded-xl text-xs bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 font-mono font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Propina Opcional */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                  Propina Opcional ({tipPct}%)
                </span>
                {includeTip && (
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={tipPct}
                    onChange={(e) => setTipPct(Number(e.target.value))}
                    className="w-14 px-2 py-0.5 rounded-lg border border-stone-200 dark:border-zinc-700 text-xs font-mono font-bold"
                  />
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeTip}
                onClick={() => setIncludeTip(!includeTip)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  includeTip ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition ${
                    includeTip ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Total a Pagar */}
            <div className="bg-stone-50 dark:bg-zinc-800/60 p-4 rounded-2xl flex items-center justify-between">
              <span className="text-xs font-black text-stone-700 dark:text-zinc-200">Total de esta Operación:</span>
              <div className="text-right font-mono">
                {(() => {
                  const base =
                    payMode === 'FULL'
                      ? remainingOfPayingTable
                      : payMode === 'EQUAL'
                      ? equalSplits.filter((s) => s.selected).reduce((a, b) => a + b.amount_primary, 0)
                      : selectedItemsTotal;
                  const tip =
                    payMode === 'EQUAL'
                      ? 0
                      : includeTip
                      ? calculateTipOrServiceCharge(base, 'TIP_VOLUNTARY', tipPct)
                      : 0;
                  const total = Math.round((base + tip) * 100) / 100;
                  return (
                    <>
                      <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 block">
                        ${total.toFixed(2)}
                      </span>
                      {exchangeRate > 0 && (
                        <span className="text-[11px] font-bold text-stone-500">
                          Bs. {(total * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPayingTable(null)}
                className="flex-1 py-3 rounded-xl border border-stone-200 dark:border-zinc-700 text-xs font-bold text-stone-600 dark:text-zinc-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleConfirmPayTable}
                className="flex-2 py-3 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? 'Procesando...' : 'Confirmar Registro de Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
