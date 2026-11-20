'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import {
  Receipt,
  Search,
  Plus,
  DollarSign,
  AlertCircle,
  Clock,
  Package,
  Layers,
  CheckCircle2,
  Phone,
  MessageCircle,
  FileText,
  User,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  Calendar,
  X,
  RefreshCw,
  Lock,
  Unlock,
  Coins,
  CreditCard,
  Percent,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// =============================================================================
// SANITIZADORES Y CONVERSORES ESTRICTOS A FORMATO BASE DE DATOS
// =============================================================================

/**
 * Sanitiza inputs monetarios y decimales:
 * - Bloquea letras y caracteres especiales en tiempo real.
 * - Permite solo dígitos, punto y coma.
 * - Reemplaza comas por puntos y limita a 2 decimales.
 */
function sanitizeDecimalInput(val: string): string {
  let clean = val.replace(/,/g, '.');
  clean = clean.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }
  if (parts.length === 2 && parts[1].length > 2) {
    clean = parts[0] + '.' + parts[1].slice(0, 2);
  }
  return clean;
}

/**
 * Conversor universal al formato decimal requerido por PostgreSQL NUMERIC(10,2)
 */
function parseDecimalForDb(val: string | number): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : Number(val.toFixed(2));
  const clean = String(val).replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

/**
 * Sanitiza enteros estrictos (plazos en días, etc.): solo dígitos 0-9
 */
function sanitizeIntegerInput(val: string): string {
  return val.replace(/\D/g, '');
}

/**
 * Sanitiza números telefónicos: solo dígitos 0-9
 */
function sanitizePhoneInput(val: string): string {
  return val.replace(/\D/g, '');
}

/**
 * Sanitiza número de cédula / RIF: solo dígitos 0-9
 */
function sanitizeDocNumberInput(val: string): string {
  return val.replace(/\D/g, '');
}

export interface CxcAccountRow {
  id: string;
  account_number: string;
  order_id?: string | null;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_id_number?: string | null;
  seller_id?: string | null;
  seller_name?: string | null;
  account_type: 'DIRECT_CREDIT' | 'LAYAWAY' | 'BNPL_FINANCING';
  document_type: 'FISCAL_INVOICE' | 'COMMERCIAL_NOTE';
  financing_provider?: string | null;
  external_reference?: string | null;
  custody_status: 'NOT_APPLICABLE' | 'IN_CUSTODY' | 'RELEASED_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED_FORFEITED';
  original_amount_usd: number | string;
  down_payment_usd: number | string;
  down_payment_percent: number | string;
  financed_amount_usd: number | string;
  balance_usd: number | string;
  total_paid_usd: number | string;
  term_days: number;
  issue_date: string;
  due_date: string;
  status: 'CURRENT' | 'OVERDUE' | 'SETTLED' | 'DEFAULTED' | 'CANCELLED';
  notes?: string | null;
  created_at: string;
  days_remaining: number;
  payments_count: number;
  tranches?: Array<{
    id: string;
    tranche_number: number;
    tranche_name: string;
    expected_amount_usd: number;
    settled_amount_usd: number;
    fee_amount_usd: number;
    expected_date: string;
    settled_date?: string | null;
    status: 'PENDING' | 'SETTLED' | 'DISPUTED' | 'CANCELLED';
  }> | null;
}

interface CxcKpis {
  total_receivable_usd: number | string;
  overdue_amount_usd: number | string;
  layaways_in_custody_count: number;
  layaways_in_custody_balance_usd: number | string;
  cashea_pending_usd: number | string;
  month_collected_usd: number | string;
}

interface StaffSeller {
  id: string;
  full_name: string;
  email?: string;
  role: string;
}

export function CxcManager({
  slug,
  isPluginActive,
  staffRole,
  sellers,
  primaryCurrency = 'USD',
  secondaryCurrency = 'VES',
  exchangeRate = 1.0,
  pluginConfig,
}: {
  slug: string;
  isPluginActive: boolean;
  staffRole: string;
  sellers: StaffSeller[];
  primaryCurrency?: string;
  secondaryCurrency?: string;
  exchangeRate?: number;
  pluginConfig: {
    layaway_validity_days?: number;
    default_penalty_percent?: number;
    standard_term_days?: number;
  };
}) {
  // Estados de listado, filtros y paginación
  const [accounts, setAccounts] = useState<CxcAccountRow[]>([]);
  const [kpis, setKpis] = useState<CxcKpis>({
    total_receivable_usd: 0,
    overdue_amount_usd: 0,
    layaways_in_custody_count: 0,
    layaways_in_custody_balance_usd: 0,
    cashea_pending_usd: 0,
    month_collected_usd: 0,
  });
  const [activeTab, setActiveTab] = useState<'ALL' | 'LAYAWAY' | 'BNPL_FINANCING' | 'OVERDUE'>('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CURRENT' | 'OVERDUE' | 'SETTLED'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Modales
  const [paymentAccount, setPaymentAccount] = useState<CxcAccountRow | null>(null);
  const [detailAccountId, setDetailAccountId] = useState<string | null>(null);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [search, activeTab, statusFilter]);

  // Carga de datos
  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const sp = new URLSearchParams();
      if (search.trim()) sp.set('search', search.trim());
      sp.set('page', String(page));
      sp.set('pageSize', String(pageSize));

      if (activeTab === 'LAYAWAY') {
        sp.set('account_type', 'LAYAWAY');
      } else if (activeTab === 'BNPL_FINANCING') {
        sp.set('account_type', 'BNPL_FINANCING');
      } else if (activeTab === 'OVERDUE') {
        sp.set('status', 'OVERDUE');
      } else if (statusFilter !== 'ALL') {
        sp.set('status', statusFilter);
      }

      const res = await fetch(`/api/admin/${slug}/cxc/accounts?${sp.toString()}`);
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts || []);
        if (data.kpis) setKpis(data.kpis);
        setTotalCount(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error('Error fetching CXC:', err);
    } finally {
      setIsLoading(false);
    }
  }, [slug, search, activeTab, statusFilter, page, pageSize]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Formato de moneda
  const formatUSD = (val: number | string) => {
    const num = Number(val) || 0;
    return `$${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatBs = (valUSD: number | string) => {
    const num = (Number(valUSD) || 0) * exchangeRate;
    return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* 1. Header principal limpio y profesional */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Cuentas por Cobrar & Cartera
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAccounts}
            disabled={isLoading}
            className="h-10 sm:h-9 border-slate-200 dark:border-zinc-800 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          <Button
            onClick={() => setIsNewAccountOpen(true)}
            className="h-10 sm:h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Nueva Cuenta / Apartado
          </Button>
        </div>
      </div>

      {/* 2. Tarjetas KPI de Cartera */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Cartera Total */}
        <Card className="border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Por Cobrar Total
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
                {formatUSD(kpis.total_receivable_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-slate-400 dark:text-zinc-500 mt-0.5">
                ≈ {formatBs(kpis.total_receivable_usd)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Deuda Vencida */}
        <Card className="border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/20 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Vencido / Exigible
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-300">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-rose-700 dark:text-rose-300">
                {formatUSD(kpis.overdue_amount_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-semibold text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                Prioridad de cobranza
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Apartados en Custodia */}
        <Card className="border border-purple-200/80 dark:border-purple-900/40 bg-purple-50/30 dark:bg-purple-950/20 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" />
                Apartados Custodia
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-300">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-purple-700 dark:text-purple-300">
                {kpis.layaways_in_custody_count}{' '}
                <span className="text-sm font-medium font-sans text-purple-600/80">muebles</span>
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-purple-600/80 dark:text-purple-400/80 mt-0.5">
                Saldo: {formatUSD(kpis.layaways_in_custody_balance_usd)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bloques Cashea */}
        <Card className="border border-sky-200/80 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/20 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Cashea por Liquidar
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-sky-600 dark:text-sky-300">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-sky-700 dark:text-sky-300">
                {formatUSD(kpis.cashea_pending_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-sky-600/80 dark:text-sky-400/80 mt-0.5">
                Cobrado en mes: {formatUSD(kpis.month_collected_usd)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Filtros: COMBOBOX en Móvil (sin cortes) y Pestañas en Desktop */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-2 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs">
        {/* Selector de Categoría en Móvil (Combobox completo sin textos mochos) */}
        <div className="block sm:hidden w-full">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-bold text-slate-800 dark:text-zinc-100 shadow-xs"
          >
            <option value="ALL">📁 Todos los Créditos ({totalCount})</option>
            <option value="LAYAWAY">🔒 Sistema de Apartado (En Custodia)</option>
            <option value="BNPL_FINANCING">⚡ Cashea (BNPL - 2 Bloques)</option>
            <option value="OVERDUE">⚠️ Morosos / Vencidos</option>
          </select>
        </div>

        {/* Pestañas de filtro de cartera en Desktop */}
        <div className="hidden sm:flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] ${
              activeTab === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            Todos ({totalCount})
          </button>

          <button
            onClick={() => setActiveTab('LAYAWAY')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'LAYAWAY'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Apartados
          </button>

          <button
            onClick={() => setActiveTab('BNPL_FINANCING')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'BNPL_FINANCING'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Cashea (BNPL)
          </button>

          <button
            onClick={() => setActiveTab('OVERDUE')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'OVERDUE'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
            Morosos
          </button>
        </div>

        {/* Buscador */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, cédula o cuenta..."
            className="pl-9 h-10 text-xs bg-slate-50/50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
          />
        </div>
      </div>

      {/* 4. Lista de Cuentas: Responsive (Cards en Móvil, Tabla en Desktop) */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 dark:text-zinc-500 text-xs font-medium">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
          Cargando cuentas por cobrar...
        </div>
      ) : accounts.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
          <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-zinc-600 mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
            No se encontraron cuentas por cobrar
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            {search
              ? 'No hay registros que coincidan con la búsqueda.'
              : 'Registra un crédito directo, un sistema de apartado o una venta Cashea con el botón superior.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* VISTA MÓVIL: Tarjetas de Alta Densidad (Touch Target >= 44px) */}
          <div className="grid grid-cols-1 md:hidden gap-3">
            {accounts.map((acc) => {
              const orig = Number(acc.original_amount_usd);
              const bal = Number(acc.balance_usd);
              const paid = Number(acc.total_paid_usd);
              const pctPaid = orig > 0 ? Math.min(100, Math.round((paid / orig) * 100)) : 100;
              const isOverdue = acc.status === 'OVERDUE';
              const isSettled = acc.status === 'SETTLED';

              return (
                <div
                  key={acc.id}
                  className={`bg-white dark:bg-zinc-900 p-4 rounded-2xl border transition-all shadow-xs ${
                    isOverdue
                      ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/20'
                      : isSettled
                        ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10'
                        : 'border-slate-200/90 dark:border-zinc-800'
                  }`}
                >
                  {/* Fila superior: Tipo de cuenta y estatus */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-zinc-400">
                        {acc.account_number}
                      </span>
                      {acc.account_type === 'LAYAWAY' && (
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 text-[10px] font-bold">
                          Apartado
                        </Badge>
                      )}
                      {acc.account_type === 'BNPL_FINANCING' && (
                        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 text-[10px] font-bold">
                          Cashea
                        </Badge>
                      )}
                      {acc.account_type === 'DIRECT_CREDIT' && (
                        <Badge variant="outline" className="text-[10px] font-bold text-slate-600">
                          Crédito Directo
                        </Badge>
                      )}
                    </div>

                    {isSettled ? (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold">
                        ✓ Liquidado
                      </Badge>
                    ) : isOverdue ? (
                      <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 text-[10px] font-bold animate-pulse">
                        ⚠ Vencido
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px] font-bold">
                        Al día
                      </Badge>
                    )}
                  </div>

                  {/* Nombre del cliente y WhatsApp */}
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                        {acc.customer_name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-zinc-400">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{acc.customer_phone}</span>
                        {acc.customer_id_number && (
                          <span className="font-mono text-[11px] text-slate-400">
                            • {acc.customer_id_number}
                          </span>
                        )}
                      </div>
                    </div>

                    <a
                      href={`https://wa.me/${acc.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Hola ${acc.customer_name}, le escribimos de Home Deluxe para saludarle. Su cuenta ${acc.account_number} presenta un saldo pendiente de ${formatUSD(bal)}. Estamos a su orden para recibir su abono.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0"
                      title="Enviar mensaje WhatsApp"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </a>
                  </div>

                  {/* Custodia de Apartado */}
                  {acc.account_type === 'LAYAWAY' && (
                    <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-900/40 flex items-center justify-between text-xs">
                      <span className="text-purple-700 dark:text-purple-300 font-semibold flex items-center gap-1.5">
                        {acc.custody_status === 'IN_CUSTODY' ? (
                          <>
                            <Lock className="w-3.5 h-3.5 text-purple-600" />
                            En Custodia en Tienda
                          </>
                        ) : acc.custody_status === 'RELEASED_FOR_DELIVERY' ? (
                          <>
                            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                              Listo para Despacho
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                            Entregado
                          </>
                        )}
                      </span>
                      <span className="font-mono font-bold text-purple-800 dark:text-purple-300 text-[11px]">
                        {acc.days_remaining > 0
                          ? `${acc.days_remaining}d restantes`
                          : isSettled
                            ? '0.00 saldo'
                            : `${Math.abs(acc.days_remaining)}d vencido`}
                      </span>
                    </div>
                  )}

                  {/* Barra de Progreso de Pago */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="text-slate-500 dark:text-zinc-400">
                        Abonado: <strong className="text-slate-900 dark:text-white">{formatUSD(paid)}</strong>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {pctPaid}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isSettled
                            ? 'bg-emerald-500'
                            : isOverdue
                              ? 'bg-rose-500'
                              : 'bg-blue-600'
                        }`}
                        style={{ width: `${pctPaid}%` }}
                      />
                    </div>
                  </div>

                  {/* Fila de Saldo y Botones de Acción (min touch 44px) */}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Saldo Restante
                      </span>
                      <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                        {formatUSD(bal)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailAccountId(acc.id)}
                        className="h-11 px-3 text-xs font-bold border-slate-200 dark:border-zinc-800"
                      >
                        Expediente
                      </Button>

                      {!isSettled && (
                        <Button
                          size="sm"
                          onClick={() => setPaymentAccount(acc)}
                          className="h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                        >
                          + Abonar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* VISTA DESKTOP: Tabla Profesional Interactiva */}
          <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden shadow-xs">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 dark:bg-zinc-950/50 border-b border-slate-200/60 dark:border-zinc-800/60 text-slate-500 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3 text-left">Cuenta / Fecha</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Tipo & Custodia</th>
                  <th className="px-4 py-3 text-right">Total $</th>
                  <th className="px-4 py-3 text-right">Abonado $</th>
                  <th className="px-4 py-3 text-right">Saldo Restante</th>
                  <th className="px-4 py-3 text-center">Progreso</th>
                  <th className="px-4 py-3 text-center">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                {accounts.map((acc) => {
                  const orig = Number(acc.original_amount_usd);
                  const bal = Number(acc.balance_usd);
                  const paid = Number(acc.total_paid_usd);
                  const pctPaid = orig > 0 ? Math.min(100, Math.round((paid / orig) * 100)) : 100;
                  const isOverdue = acc.status === 'OVERDUE';
                  const isSettled = acc.status === 'SETTLED';

                  return (
                    <tr
                      key={acc.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors ${
                        isOverdue ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Cuenta / Fecha */}
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {acc.account_number}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(acc.created_at).toLocaleDateString('es-VE')}
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3.5">
                        <div className="font-extrabold text-slate-900 dark:text-white">
                          {acc.customer_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <span>{acc.customer_phone}</span>
                          <a
                            href={`https://wa.me/${acc.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                              `Hola ${acc.customer_name}, le escribimos de Home Deluxe para saludarle. Su cuenta ${acc.account_number} presenta un saldo de ${formatUSD(bal)}.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700"
                            title="WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5 inline" />
                          </a>
                        </div>
                      </td>

                      {/* Tipo & Custodia */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {acc.account_type === 'LAYAWAY' ? (
                            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 text-[10px] font-bold">
                              Apartado
                            </Badge>
                          ) : acc.account_type === 'BNPL_FINANCING' ? (
                            <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 text-[10px] font-bold">
                              Cashea
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-semibold text-slate-600">
                              Crédito Directo
                            </Badge>
                          )}
                        </div>

                        {acc.account_type === 'LAYAWAY' && (
                          <div className="text-[10px] font-semibold mt-1 flex items-center gap-1">
                            {acc.custody_status === 'IN_CUSTODY' ? (
                              <span className="text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> En Custodia
                              </span>
                            ) : acc.custody_status === 'RELEASED_FOR_DELIVERY' ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                <Unlock className="w-3 h-3" /> Listo Despacho
                              </span>
                            ) : (
                              <span className="text-slate-400">Entregado</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Total $ */}
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-zinc-300">
                        {formatUSD(orig)}
                      </td>

                      {/* Abonado $ */}
                      <td className="px-4 py-3.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatUSD(paid)}
                      </td>

                      {/* Saldo Restante */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                          {formatUSD(bal)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {formatBs(bal)}
                        </div>
                      </td>

                      {/* Barra Progreso */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="w-24 mx-auto">
                          <div className="flex justify-between text-[10px] font-mono mb-1 text-slate-500">
                            <span>{pctPaid}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full ${
                                isSettled ? 'bg-emerald-500' : isOverdue ? 'bg-rose-500' : 'bg-blue-600'
                              }`}
                              style={{ width: `${pctPaid}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Vencimiento */}
                      <td className="px-4 py-3.5 text-center">
                        {isSettled ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold">
                            Liquidado
                          </Badge>
                        ) : isOverdue ? (
                          <div className="text-rose-600 dark:text-rose-400 font-bold font-mono text-[11px]">
                            {Math.abs(acc.days_remaining)}d vencido
                          </div>
                        ) : (
                          <div className="text-slate-600 dark:text-zinc-400 font-mono text-[11px]">
                            {acc.days_remaining}d restantes
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailAccountId(acc.id)}
                            className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
                          >
                            Expediente
                          </Button>

                          {!isSettled && (
                            <Button
                              size="sm"
                              onClick={() => setPaymentAccount(acc)}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                            >
                              + Abonar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 5. CONTROLES DE PAGINACIÓN */}
          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 px-1 text-xs text-slate-500 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <span>
                  Mostrando{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {(page - 1) * pageSize + 1}
                  </strong>{' '}
                  a{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {Math.min(page * pageSize, totalCount)}
                  </strong>{' '}
                  de <strong className="text-slate-900 dark:text-white">{totalCount}</strong> cuentas
                </span>
                <span className="hidden sm:inline">•</span>
                <div className="hidden sm:flex items-center gap-1.5">
                  <span>Por pág:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 px-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold"
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-9 px-3 text-xs font-semibold"
                >
                  ← Anterior
                </Button>
                <span className="px-2 font-mono font-bold text-slate-700 dark:text-zinc-300">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isLoading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-9 px-3 text-xs font-semibold"
                >
                  Siguiente →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE REGISTRO DE ABONO MULTIMONEDA */}
      {paymentAccount && (
        <PaymentModal
          slug={slug}
          account={paymentAccount}
          exchangeRate={exchangeRate}
          onClose={() => setPaymentAccount(null)}
          onSuccess={() => {
            setPaymentAccount(null);
            loadAccounts();
          }}
        />
      )}

      {/* MODAL DE NUEVA CUENTA / APARTADO / CASHEA */}
      {isNewAccountOpen && (
        <NewAccountModal
          slug={slug}
          sellers={sellers}
          exchangeRate={exchangeRate}
          pluginConfig={pluginConfig}
          onClose={() => setIsNewAccountOpen(false)}
          onSuccess={() => {
            setIsNewAccountOpen(false);
            loadAccounts();
          }}
        />
      )}

      {/* MODAL DE EXPEDIENTE / DETALLE */}
      {detailAccountId && (
        <AccountDetailModal
          slug={slug}
          accountId={detailAccountId}
          exchangeRate={exchangeRate}
          staffRole={staffRole}
          onClose={() => setDetailAccountId(null)}
          onUpdated={() => {
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 1: MODAL DE ABONO MULTIMONEDA (Caja Rápida)
// -----------------------------------------------------------------------------
function PaymentModal({
  slug,
  account,
  exchangeRate,
  onClose,
  onSuccess,
}: {
  slug: string;
  account: CxcAccountRow;
  exchangeRate: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const maxBalance = Number(account.balance_usd);
  const [amountUsd, setAmountUsd] = useState<string>(String(maxBalance));
  const [paymentMethod, setPaymentMethod] = useState('DIVISAS');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTrancheId, setSelectedTrancheId] = useState<string>('');
  const [feeAmountUsd, setFeeAmountUsd] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptSuccess, setReceiptSuccess] = useState<{
    receiptNumber: string;
    balanceAfter: number;
    amountPaid: number;
  } | null>(null);

  const numAmount = parseDecimalForDb(amountUsd);
  const balanceAfter = Math.max(0, Number((maxBalance - numAmount).toFixed(2)));
  const amountBs = Number((numAmount * exchangeRate).toFixed(2));

  // Manejo de métodos que implican bolívares
  const handleMethodChange = (m: string) => {
    setPaymentMethod(m);
    if (m === 'PAGO_MOVIL' || m === 'TRANSFERENCIA_VES' || m === 'PUNTO_VENTA') {
      setCurrency('VES');
    } else {
      setCurrency('USD');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('El monto a abonar debe ser mayor a 0');
      return;
    }
    if (numAmount > maxBalance + 0.009) {
      setError(`El monto no puede exceder el saldo de $${maxBalance}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/${slug}/cxc/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: account.id,
          amount_usd: numAmount,
          currency,
          exchange_rate_applied: exchangeRate,
          payment_method: paymentMethod,
          reference: reference.trim() || undefined,
          tranche_id: selectedTrancheId || undefined,
          fee_amount_usd: parseDecimalForDb(feeAmountUsd),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al registrar abono');
      }

      setReceiptSuccess({
        receiptNumber: data.receipt_number,
        balanceAfter: data.balance_after_usd,
        amountPaid: numAmount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Registrar Abono
              </h3>
              <p className="text-[11px] font-mono text-slate-500">
                {account.account_number} • {account.customer_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {receiptSuccess ? (
          /* PANTALLA DE ÉXITO Y RECIBO */
          <div className="p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                ¡Abono Registrado con Éxito!
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Recibo correlativo generado: <strong className="font-mono text-blue-600">{receiptSuccess.receiptNumber}</strong>
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800 text-xs space-y-2 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Monto Abonado:</span>
                <span className="font-bold text-emerald-600">${receiptSuccess.amountPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Saldo Restante:</span>
                <span className="font-bold text-slate-900 dark:text-white">${receiptSuccess.balanceAfter.toFixed(2)}</span>
              </div>
              {receiptSuccess.balanceAfter <= 0 && (
                <div className="pt-2 text-center text-emerald-600 font-bold">
                  🎉 ¡CUENTA 100% LIQUIDADA!
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <a
                href={`https://wa.me/${account.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `*Home Deluxe 2026 — Comprobante de Abono*\n` +
                  `Recibo: ${receiptSuccess.receiptNumber}\n` +
                  `Cliente: ${account.customer_name}\n` +
                  `Cuenta: ${account.account_number}\n` +
                  `Monto Abonado: $${receiptSuccess.amountPaid.toFixed(2)} (${paymentMethod})\n` +
                  `Saldo Restante: $${receiptSuccess.balanceAfter.toFixed(2)}\n\n` +
                  `¡Gracias por su preferencia!`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar Recibo por WhatsApp
              </a>

              <Button
                variant="outline"
                onClick={onSuccess}
                className="w-full h-10 text-xs font-semibold"
              >
                Finalizar
              </Button>
            </div>
          </div>
        ) : (
          /* FORMULARIO DE COBRO */
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Saldo y Monto a Abonar */}
            <div className="bg-slate-50 dark:bg-zinc-950 p-3.5 rounded-2xl border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Saldo Actual
                </span>
                <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
                  ${maxBalance.toFixed(2)}
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Saldo Resultante
                </span>
                <span className={`text-xl font-black font-mono ${balanceAfter === 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                  ${balanceAfter.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Input de Monto Sanitizado */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                  Monto a Abonar ($ USD)
                </Label>
                <button
                  type="button"
                  onClick={() => setAmountUsd(String(maxBalance))}
                  className="text-[11px] font-bold text-blue-600 hover:underline"
                >
                  Liquidar Total
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(sanitizeDecimalInput(e.target.value))}
                  placeholder="0.00"
                  className="pl-8 h-11 text-base font-black font-mono bg-white dark:bg-zinc-950"
                  required
                />
              </div>

              {currency === 'VES' && (
                <div className="mt-1 text-[11px] font-mono text-slate-500">
                  ≈ Bs. {amountBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Tasa BCV: {exchangeRate.toFixed(2)})
                </div>
              )}
            </div>

            {/* Selector de Método de Pago */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Método de Cobro
              </Label>
              <select
                value={paymentMethod}
                onChange={(e) => handleMethodChange(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold text-slate-800 dark:text-zinc-200"
              >
                <option value="DIVISAS">Efectivo Divisas ($ USD)</option>
                <option value="ZELLE">Zelle (USD)</option>
                <option value="BINANCE">Binance USDT</option>
                <option value="PAGO_MOVIL">Pago Móvil (Bolívares BCV)</option>
                <option value="TRANSFERENCIA_VES">Transferencia Bancaria (Bs)</option>
                <option value="PUNTO_VENTA">Punto de Venta / Tarjeta Débito</option>
                {account.account_type === 'BNPL_FINANCING' && (
                  <option value="CASHEA_SETTLEMENT">Liquidación Banco Cashea</option>
                )}
              </select>
            </div>

            {/* Referencia */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Referencia Bancaria / Comprobante (Opcional)
              </Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ej. Zelle #482910 o Pago Móvil #1982"
                className="h-10 text-xs"
              />
            </div>

            {/* Notas opcionales */}
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Observaciones del Abono
              </Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Abono cuota semana 2"
                className="h-10 text-xs"
              />
            </div>

            {/* Botón de Confirmación */}
            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="h-11 px-4 text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || numAmount <= 0}
                className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar Abono de ${numAmount.toFixed(2)}
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 2: MODAL DE NUEVA CUENTA / APARTADO / CASHEA
// -----------------------------------------------------------------------------
function NewAccountModal({
  slug,
  sellers,
  exchangeRate,
  pluginConfig,
  onClose,
  onSuccess,
}: {
  slug: string;
  sellers: StaffSeller[];
  exchangeRate: number;
  pluginConfig: {
    layaway_validity_days?: number;
    default_penalty_percent?: number;
    standard_term_days?: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [accountType, setAccountType] = useState<'DIRECT_CREDIT' | 'LAYAWAY' | 'BNPL_FINANCING'>('LAYAWAY');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [docType, setDocType] = useState<'V' | 'J' | 'G' | 'E'>('V');
  const [docNumber, setDocNumber] = useState('');
  const [sellerId, setSellerId] = useState(sellers[0]?.id || '');
  const [totalAmount, setTotalAmount] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [termDays, setTermDays] = useState(String(pluginConfig.layaway_validity_days || 30));
  const [documentType, setDocumentType] = useState<'COMMERCIAL_NOTE' | 'FISCAL_INVOICE'>('COMMERCIAL_NOTE');
  const [externalReference, setExternalReference] = useState('');
  const [notes, setNotes] = useState('');
  const [downPaymentMethod, setDownPaymentMethod] = useState('DIVISAS');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numTotal = parseDecimalForDb(totalAmount);
  const numDown = parseDecimalForDb(downPayment);
  const financed = Math.max(0, Number((numTotal - numDown).toFixed(2)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numTotal <= 0) {
      setError('El monto total debe ser mayor a 0');
      return;
    }
    if (numDown > numTotal) {
      setError('La inicial no puede ser mayor al monto total');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const fullIdNumber = docNumber.trim() ? `${docType}-${docNumber.trim()}` : undefined;

    try {
      const res = await fetch(`/api/admin/${slug}/cxc/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_id_number: fullIdNumber,
          seller_id: sellerId || undefined,
          account_type: accountType,
          document_type: documentType,
          original_amount_usd: numTotal,
          down_payment_usd: numDown,
          term_days: Number(termDays) || 15,
          financing_provider: accountType === 'BNPL_FINANCING' ? 'Cashea' : undefined,
          external_reference: externalReference.trim() || undefined,
          notes: notes.trim() || undefined,
          down_payment_method: numDown > 0 ? downPaymentMethod : undefined,
          down_payment_currency: 'USD',
          down_payment_exchange_rate: exchangeRate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la cuenta');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Abrir Cuenta de Crédito / Apartado
            </h3>
            <p className="text-[11px] text-slate-500">
              Registra una operación comercial con plazos y condiciones auditadas.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Selector de Modalidad */}
          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 block">
              Modalidad de Cartera
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccountType('LAYAWAY');
                  setTermDays(String(pluginConfig.layaway_validity_days || 30));
                }}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  accountType === 'LAYAWAY'
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Lock className="w-4 h-4 mx-auto mb-1 text-purple-600" />
                <span className="text-xs block">Apartado</span>
                <span className="text-[9px] text-slate-400">Con custodia</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountType('BNPL_FINANCING');
                  setTermDays('30');
                  setDocumentType('FISCAL_INVOICE');
                }}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  accountType === 'BNPL_FINANCING'
                    ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-4 h-4 mx-auto mb-1 text-sky-600" />
                <span className="text-xs block">Cashea</span>
                <span className="text-[9px] text-slate-400">2 Bloques</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccountType('DIRECT_CREDIT');
                  setTermDays(String(pluginConfig.standard_term_days || 15));
                }}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  accountType === 'DIRECT_CREDIT'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-zinc-800 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 mx-auto mb-1 text-blue-600" />
                <span className="text-xs block">Crédito Directo</span>
                <span className="text-[9px] text-slate-400">Acuerdo tienda</span>
              </button>
            </div>
          </div>

          {/* Datos del Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Nombre Completo o Razón Social del Cliente *
              </Label>
              <Input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. David Torrealba o Muebles El Roble C.A."
                className="h-10 text-xs"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Teléfono / WhatsApp * (Solo dígitos)
              </Label>
              <Input
                type="tel"
                inputMode="numeric"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(sanitizePhoneInput(e.target.value))}
                placeholder="04121234567"
                className="h-10 text-xs font-mono"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Cédula / RIF (Opcional)
              </Label>
              <div className="flex gap-1.5">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as any)}
                  className="w-16 h-10 px-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-bold font-mono"
                >
                  <option value="V">V-</option>
                  <option value="J">J-</option>
                  <option value="G">G-</option>
                  <option value="E">E-</option>
                </select>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={docNumber}
                  onChange={(e) => setDocNumber(sanitizeDocNumberInput(e.target.value))}
                  placeholder="18291029"
                  className="h-10 text-xs font-mono flex-1"
                />
              </div>
            </div>
          </div>

          {/* Montos y Plazos con sanitización estricta */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Monto Total ($ USD) *
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(sanitizeDecimalInput(e.target.value))}
                  placeholder="0.00"
                  className="pl-8 h-10 text-sm font-black font-mono bg-white dark:bg-zinc-950"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Inicial Recibida ($ USD)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-emerald-500">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={downPayment}
                  onChange={(e) => setDownPayment(sanitizeDecimalInput(e.target.value))}
                  placeholder="0.00"
                  className="pl-8 h-10 text-sm font-black font-mono text-emerald-600 bg-white dark:bg-zinc-950"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Plazo (Días)
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                value={termDays}
                onChange={(e) => setTermDays(sanitizeIntegerInput(e.target.value))}
                placeholder="15"
                className="h-10 text-xs font-mono"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Tipo de Emisión
              </Label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as any)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs"
              >
                <option value="COMMERCIAL_NOTE">Nota Comercial (No Fiscal)</option>
                <option value="FISCAL_INVOICE">Factura Fiscal (con IVA)</option>
              </select>
            </div>
          </div>

          {/* Método de la Inicial si aplica */}
          {numDown > 0 && (
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200/60 space-y-2">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                Cobro de Inicial en Mostrador (${numDown.toFixed(2)})
              </span>
              <select
                value={downPaymentMethod}
                onChange={(e) => setDownPaymentMethod(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-emerald-300 bg-white dark:bg-zinc-950 text-xs font-semibold"
              >
                <option value="DIVISAS">Efectivo Divisas ($ USD)</option>
                <option value="ZELLE">Zelle (USD)</option>
                <option value="BINANCE">Binance USDT</option>
                <option value="PAGO_MOVIL">Pago Móvil (Bolívares)</option>
                <option value="PUNTO_VENTA">Punto de Venta</option>
              </select>
            </div>
          )}

          {/* Vendedor Asignado */}
          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Vendedor / Asesor Comercial
            </Label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
            >
              <option value="">-- Sin asesor asignado --</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.role})
                </option>
              ))}
            </select>
          </div>

          {/* Resumen Financiado */}
          <div className="bg-slate-50 dark:bg-zinc-950 p-3 rounded-2xl border text-xs flex justify-between font-mono">
            <span className="text-slate-500">Saldo a financiar/cobrar:</span>
            <span className="font-black text-slate-900 dark:text-white">${financed.toFixed(2)}</span>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-10 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || numTotal <= 0}
              className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
            >
              {isSubmitting ? 'Registrando...' : 'Abrir Cuenta'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 3: MODAL DE EXPEDIENTE / DETALLE
// -----------------------------------------------------------------------------
function AccountDetailModal({
  slug,
  accountId,
  exchangeRate,
  staffRole,
  onClose,
  onUpdated,
}: {
  slug: string;
  accountId: string;
  exchangeRate: number;
  staffRole: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [data, setData] = useState<{
    account: CxcAccountRow;
    tranches: any[];
    payments: any[];
    order_items: any[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Prórroga
  const [showExtend, setShowExtend] = useState(false);
  const [extendDays, setExtendDays] = useState('15');

  // Cancelar apartado
  const [showCancel, setShowCancel] = useState(false);
  const [cancelPenalty, setCancelPenalty] = useState('15');
  const [cancelReason, setCancelReason] = useState('Incumplimiento de plazo acordado');

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/cxc/accounts/${accountId}`);
      const resData = await res.json();
      if (resData.success) {
        setData(resData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [slug, accountId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAction = async (action: string, payload: any = {}) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/${slug}/cxc/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        loadDetail();
        onUpdated();
        setShowExtend(false);
        setShowCancel(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border text-center text-xs">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
          Cargando expediente...
        </div>
      </div>
    );
  }

  const { account, tranches, payments, order_items } = data;
  const isSettled = account.status === 'SETTLED' || Number(account.balance_usd) <= 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Expediente: {account.account_number}
              </h3>
              <Badge variant="outline" className="text-[10px] font-bold">
                {account.account_type}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cliente: <strong>{account.customer_name}</strong> • Creado el {new Date(account.created_at).toLocaleDateString('es-VE')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Tarjeta de Resumen Financiero */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border text-center font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Venta</span>
              <span className="text-base font-black text-slate-900 dark:text-white">
                ${Number(account.original_amount_usd).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Abonado</span>
              <span className="text-base font-black text-emerald-600">
                ${Number(account.total_paid_usd).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Restante</span>
              <span className={`text-base font-black ${isSettled ? 'text-emerald-600' : 'text-blue-600'}`}>
                ${Number(account.balance_usd).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Acciones de Custodia (Para Sistema de Apartado) */}
          {account.account_type === 'LAYAWAY' && (
            <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-extrabold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-purple-600" />
                    Custodia Física del Mueble
                  </h4>
                  <p className="text-[11px] text-purple-700/80 dark:text-purple-400">
                    Estado actual:{' '}
                    <strong>
                      {account.custody_status === 'IN_CUSTODY'
                        ? 'En Custodia en Tienda/Depósito'
                        : account.custody_status === 'RELEASED_FOR_DELIVERY'
                          ? 'Liberado para Despacho'
                          : 'Entregado al Cliente'}
                    </strong>
                  </p>
                </div>

                {account.custody_status === 'IN_CUSTODY' && (
                  <Button
                    size="sm"
                    disabled={actionLoading || (!isSettled && !['OWNER', 'MANAGER'].includes(staffRole))}
                    onClick={() => handleAction('RELEASE_CUSTODY')}
                    className="h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
                  >
                    <Unlock className="w-3.5 h-3.5 mr-1" />
                    Autorizar Entrega
                  </Button>
                )}

                {account.custody_status === 'RELEASED_FOR_DELIVERY' && (
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleAction('MARK_DELIVERED')}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Marcar Entregado
                  </Button>
                )}
              </div>

              {/* Botones de gestión por vencimiento */}
              {account.status !== 'CANCELLED' && !isSettled && (
                <div className="pt-2 border-t border-purple-200/60 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExtend(!showExtend)}
                    className="h-8 text-[11px] font-bold border-purple-300 text-purple-800"
                  >
                    + Prórroga de Plazo
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCancel(!showCancel)}
                    className="h-8 text-[11px] font-bold border-rose-300 text-rose-700"
                  >
                    Cancelar & Aplicar Penalidad
                  </Button>
                </div>
              )}

              {/* Sub-formulario de Prórroga con sanitización entera */}
              {showExtend && (
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-purple-200 text-xs flex items-center gap-2">
                  <span className="font-semibold">Días adicionales:</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={extendDays}
                    onChange={(e) => setExtendDays(sanitizeIntegerInput(e.target.value))}
                    className="w-20 h-8 font-mono"
                  />
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => handleAction('EXTEND_TERM', { additional_days: Number(extendDays) || 15 })}
                    className="h-8 bg-purple-600 text-white font-bold"
                  >
                    Aplicar Prórroga
                  </Button>
                </div>
              )}

              {/* Sub-formulario de Cancelación con sanitización entera */}
              {showCancel && (
                <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-rose-200 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-rose-700">% Penalidad por custodia:</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={cancelPenalty}
                      onChange={(e) => setCancelPenalty(sanitizeIntegerInput(e.target.value))}
                      className="w-20 h-8 font-mono"
                    />
                    <span>%</span>
                  </div>
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Motivo de cancelación"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() =>
                      handleAction('CANCEL_APARTADO', {
                        penalty_percent: Number(cancelPenalty) || 15,
                        cancellation_reason: cancelReason,
                      })
                    }
                    className="h-8 bg-rose-600 text-white font-bold"
                  >
                    Confirmar Cancelación y Devolver Mueble a Stock
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Bloques de Cashea si aplica */}
          {tranches && tranches.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 mb-2">
                Bloques de Desembolso Cashea
              </h4>
              <div className="space-y-2">
                {tranches.map((t: any) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {t.tranche_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Vencimiento: {new Date(t.expected_date).toLocaleDateString('es-VE')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-slate-900 dark:text-white">
                        ${Number(t.expected_amount_usd).toFixed(2)}
                      </div>
                      <Badge
                        className={`text-[9px] font-bold ${
                          t.status === 'SETTLED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {t.status === 'SETTLED' ? 'Liquidado' : 'Pendiente Banco'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de Abonos */}
          <div>
            <h4 className="text-xs font-black uppercase text-slate-500 mb-2">
              Historial de Recibos y Abonos ({payments.length})
            </h4>
            {payments.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No hay abonos registrados.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p: any) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-blue-600">
                        {p.receipt_number}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(p.created_at).toLocaleString('es-VE')} • {p.payment_method}
                        {p.reference && ` (#${p.reference})`}
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="font-black text-emerald-600 text-sm">
                        +${Number(p.amount_usd).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Saldo: ${Number(p.balance_after_usd).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
