'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Truck,
  ArrowRightLeft,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  Calendar,
  X,
  RefreshCw,
  Wallet,
  Building2,
  Share2,
  Printer,
  Download,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// =============================================================================
// SANITIZADORES Y CONVERSORES ESTRICTOS A FORMATO BASE DE DATOS (PONTYTAIL REUSE)
// =============================================================================

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

function parseDecimalForDb(val: string | number): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : Number(val.toFixed(2));
  const clean = String(val).replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

function sanitizeIntegerInput(val: string): string {
  return val.replace(/\D/g, '');
}

function sanitizePhoneInput(val: string): string {
  return val.replace(/\D/g, '');
}

function sanitizeDocNumberInput(val: string): string {
  return val.replace(/\D/g, '');
}

// =============================================================================
// TIPOS E INTERFACES
// =============================================================================

export interface SupplierItem {
  id: string;
  name: string;
  category: 'RAW_MATERIAL' | 'MERCHANDISE' | 'SERVICE' | 'FIXED_COST' | 'OTHER';
  default_currency: 'USD' | 'VES';
  payment_terms_days: number;
  phone?: string | null;
  whatsapp?: string | null;
  tax_id?: string | null;
  total_debt_primary?: number;
  total_debt_usd?: number;
  open_advances_primary?: number;
  open_advances_usd?: number;
}

export interface PaymentAccountItem {
  id: string;
  name: string;
  type: 'BANK' | 'ZELLE' | 'BINANCE' | 'CASH' | 'PAGO_MOVIL' | 'OTHER';
  details: Record<string, any>;
  is_default: boolean;
}

export interface ProductItem {
  id: string;
  name: string;
  sku?: string | null;
  price_primary?: number;
  cost_price?: number;
  current_stock: number;
}

export interface StoreItem {
  id: string;
  name: string;
}

export interface BillRow {
  id: string;
  internal_number: string;
  supplier_bill_number?: string | null;
  supplier_id: string;
  supplier_name: string;
  supplier_category: string;
  origin: string;
  goods_receipt_id?: string | null;
  issue_date: string;
  due_date: string;
  total_primary?: number;
  total_usd: number;
  balance_primary?: number;
  balance_usd: number;
  status: 'OPEN' | 'PARTIAL' | 'PAID' | 'VOID';
  notes?: string | null;
  days_remaining: number;
  created_at: string;
  payments: any[];
}

export interface GoodsReceiptRow {
  id: string;
  receipt_number: string;
  supplier_id: string;
  supplier_name: string;
  store_name?: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  with_stock_entry: boolean;
  supplier_bill_number?: string | null;
  notes?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  bill_id?: string | null;
  bill_number?: string | null;
  bill_total_primary?: number | null;
  bill_total_usd?: number | null;
  total_primary?: number;
  total_usd: number;
  items: any[];
}

export interface AdvanceRow {
  id: string;
  advance_number: string;
  supplier_id: string;
  supplier_name: string;
  amount_primary?: number;
  amount_usd: number;
  applied_primary?: number;
  applied_usd: number;
  remaining_primary?: number;
  remaining_usd: number;
  account_name: string;
  currency: string;
  original_amount: number;
  exchange_rate: number;
  purpose: string;
  status: 'OPEN' | 'APPLIED' | 'VOID';
  created_at: string;
  applications: any[];
}

export interface CompensationRow {
  id: string;
  compensation_number: string;
  from_supplier_id: string;
  from_supplier_name: string;
  to_supplier_id: string;
  to_supplier_name: string;
  from_bill_number?: string | null;
  to_bill_number?: string | null;
  amount_primary?: number;
  amount_usd: number;
  reason: string;
  created_at: string;
  authorized_by_name?: string | null;
}

interface CxpManagerProps {
  slug: string;
  isPluginActive: boolean;
  staffRole: string;
  suppliers: SupplierItem[];
  paymentAccounts: PaymentAccountItem[];
  stores: StoreItem[];
  products: ProductItem[];
  primaryCurrency: string;
  secondaryCurrency: string;
  exchangeRate: number;
}

export function CxpManager({
  slug,
  isPluginActive,
  staffRole,
  suppliers: initialSuppliers,
  paymentAccounts: initialAccounts,
  stores,
  products,
  primaryCurrency,
  secondaryCurrency,
  exchangeRate,
}: CxpManagerProps) {
  // Pestaña activa
  const [activeTab, setActiveTab] = useState<'BILLS' | 'RECEIPTS' | 'ADVANCES' | 'COMPENSATIONS' | 'AGING' | 'SUPPLIERS'>('BILLS');

  // Estados de datos
  const [bills, setBills] = useState<BillRow[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceiptRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [compensations, setCompensations] = useState<CompensationRow[]>([]);
  const [suppliersList, setSuppliersList] = useState<SupplierItem[]>(initialSuppliers);
  const [paymentAccountsList, setPaymentAccountsList] = useState<PaymentAccountItem[]>(initialAccounts);
  const [agingData, setAgingData] = useState<any>(null);

  // KPIs
  const [kpis, setKpis] = useState({
    total_payable_primary: 0,
    total_payable_usd: 0,
    overdue_primary: 0,
    overdue_usd: 0,
    paid_month_primary: 0,
    paid_month_usd: 0,
    overdue_count: 0,
    open_advances_primary: 0,
    open_advances_usd: 0,
  });

  // Filtros y paginación para facturas
  const [billFilter, setBillFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE' | 'PAID'>('PENDING');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Estados de carga
  const [isLoading, setIsLoading] = useState(true);

  // Modales
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<BillRow | null>(null);

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);

  // Carga de Facturas / Deudas
  const loadBills = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        status: billFilter,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (supplierFilter) params.append('supplier_id', supplierFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/admin/${slug}/cxp/bills?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setBills(data.bills || []);
        if (data.kpis) setKpis(data.kpis);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalCount(data.pagination.totalCount || 0);
        }
      }
    } catch (err) {
      console.error('Error al cargar facturas de CxP:', err);
    } finally {
      setIsLoading(false);
    }
  }, [slug, billFilter, supplierFilter, search, page, pageSize]);

  // Carga de Recepciones
  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${slug}/cxp/receipts`);
      const data = await res.json();
      if (data.success) setReceipts(data.receipts || []);
    } catch (err) {
      console.error('Error al cargar recepciones:', err);
    }
  }, [slug]);

  // Carga de Anticipos
  const loadAdvances = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${slug}/cxp/advances`);
      const data = await res.json();
      if (data.success) setAdvances(data.advances || []);
    } catch (err) {
      console.error('Error al cargar anticipos:', err);
    }
  }, [slug]);

  // Carga de Compensaciones
  const loadCompensations = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${slug}/cxp/compensations`);
      const data = await res.json();
      if (data.success) setCompensations(data.compensations || []);
    } catch (err) {
      console.error('Error al cargar compensaciones:', err);
    }
  }, [slug]);

  // Carga de Reporte Aging / Mayor mensual
  const loadAging = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${slug}/cxp/aging`);
      const data = await res.json();
      if (data.success) setAgingData(data);
    } catch (err) {
      console.error('Error al cargar aging / mayor:', err);
    }
  }, [slug]);

  // Carga de Proveedores
  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${slug}/cxp/suppliers`);
      const data = await res.json();
      if (data.success) setSuppliersList(data.suppliers || []);
    } catch (err) {
      console.error('Error al cargar proveedores:', err);
    }
  }, [slug]);

  // Trigger de recarga según pestaña
  useEffect(() => {
    loadBills();
    if (activeTab === 'RECEIPTS') loadReceipts();
    if (activeTab === 'ADVANCES') loadAdvances();
    if (activeTab === 'COMPENSATIONS') loadCompensations();
    if (activeTab === 'AGING') loadAging();
    if (activeTab === 'SUPPLIERS') loadSuppliers();
  }, [activeTab, loadBills, loadReceipts, loadAdvances, loadCompensations, loadAging, loadSuppliers]);

  const currencySymbol = primaryCurrency === 'EUR' ? '€' : primaryCurrency === 'VES' ? 'Bs.' : '$';

  const formatPrimary = (val: number | string) => {
    const num = Number(val) || 0;
    return `${currencySymbol}${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatSecondary = (valPrimary: number | string) => {
    const num = (Number(valPrimary) || 0) * exchangeRate;
    return `${secondaryCurrency} ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* 1. Header principal limpio y profesional (Impeccable Design) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Cuentas por Pagar & Fabricantes
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadBills();
              loadReceipts();
              loadAdvances();
              loadCompensations();
              loadAging();
              loadSuppliers();
            }}
            disabled={isLoading}
            className="h-10 sm:h-9 border-slate-200 dark:border-zinc-800 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>

          <Button
            onClick={() => setIsReceiptModalOpen(true)}
            className="h-10 sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
          >
            <Package className="w-4 h-4" />
            + Recibir Mercancía (Kardex)
          </Button>

          <Button
            onClick={() => setIsAdvanceModalOpen(true)}
            className="h-10 sm:h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
          >
            <DollarSign className="w-4 h-4" />
            + Anticipo a Taller
          </Button>

          <Button
            onClick={() => setIsSupplierModalOpen(true)}
            variant="outline"
            className="h-10 sm:h-9 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 font-bold text-xs shadow-xs flex items-center gap-1.5"
          >
            <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            + Proveedor / Taller
          </Button>
        </div>
      </div>

      {/* 2. Tarjetas KPI Bimoneda de Pasivos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total por Pagar */}
        <Card className="border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Por Pagar Total
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
                {formatPrimary(kpis.total_payable_primary ?? kpis.total_payable_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-slate-400 dark:text-zinc-500 mt-0.5">
                ≈ {formatSecondary(kpis.total_payable_primary ?? kpis.total_payable_usd)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pasivo Vencido / Exigible */}
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
                {formatPrimary(kpis.overdue_primary ?? kpis.overdue_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-semibold text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                {kpis.overdue_count} facturas vencidas
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Anticipos Abiertos (Saldos a favor del comercio) */}
        <Card className="border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                Anticipos a Favor
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300">
                {formatPrimary(kpis.open_advances_primary ?? kpis.open_advances_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                Dinero entregado a talleres
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pagado en el Mes */}
        <Card className="border border-sky-200/80 dark:border-sky-900/40 bg-sky-50/30 dark:bg-sky-950/20 shadow-xs">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                Liquidado en el Mes
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-sky-600 dark:text-sky-300">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-xl sm:text-2xl font-black font-mono text-sky-700 dark:text-sky-300">
                {formatPrimary(kpis.paid_month_primary ?? kpis.paid_month_usd)}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-sky-600/80 dark:text-sky-400/80 mt-0.5">
                ≈ {formatSecondary(kpis.paid_month_primary ?? kpis.paid_month_usd)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Navegación: Combobox en Móvil (sin textos cortados) y Tabs en Desktop */}
      <div className="bg-white dark:bg-zinc-900 p-2 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs">
        {/* Selector Móvil */}
        <div className="block sm:hidden w-full">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-bold text-slate-800 dark:text-zinc-100 shadow-xs"
          >
            <option value="BILLS">📄 Facturas & Deudas ({totalCount})</option>
            <option value="RECEIPTS">📦 Recepción de Mercancía (Kardex)</option>
            <option value="ADVANCES">💵 Anticipos Directos a Talleres</option>
            <option value="COMPENSATIONS">🔄 Cruces entre Fabricantes</option>
            <option value="AGING">📊 Libro Mayor / Aging Mensual (Excel)</option>
            <option value="SUPPLIERS">🏭 Directorio de Talleres & Billeteras</option>
          </select>
        </div>

        {/* Pestañas Desktop */}
        <div className="hidden sm:flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveTab('BILLS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'BILLS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Facturas & Deudas ({totalCount})
          </button>

          <button
            onClick={() => setActiveTab('RECEIPTS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'RECEIPTS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Recepción Mercancía
          </button>

          <button
            onClick={() => setActiveTab('ADVANCES')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'ADVANCES'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Anticipos Talleres
          </button>

          <button
            onClick={() => setActiveTab('COMPENSATIONS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'COMPENSATIONS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Cruces Fabricantes
          </button>

          <button
            onClick={() => setActiveTab('AGING')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'AGING'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Libro Mayor (Excel)
          </button>

          <button
            onClick={() => setActiveTab('SUPPLIERS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap min-h-[38px] flex items-center gap-1.5 ${
              activeTab === 'SUPPLIERS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Talleres & Billeteras
          </button>
        </div>
      </div>

      {/* 4. CONTENIDO PRINCIPAL POR PESTAÑA */}

      {/* PESTAÑA 1: FACTURAS & DEUDAS */}
      {activeTab === 'BILLS' && (
        <div className="space-y-4">
          {/* Barra de Filtros secundarios */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200/80 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              <Button
                variant={billFilter === 'PENDING' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBillFilter('PENDING')}
                className="h-9 text-xs font-bold"
              >
                Pendientes
              </Button>
              <Button
                variant={billFilter === 'OVERDUE' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setBillFilter('OVERDUE')}
                className="h-9 text-xs font-bold"
              >
                Vencidas
              </Button>
              <Button
                variant={billFilter === 'PAID' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBillFilter('PAID')}
                className="h-9 text-xs font-bold"
              >
                Liquidadas
              </Button>
              <Button
                variant={billFilter === 'ALL' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBillFilter('ALL')}
                className="h-9 text-xs font-bold"
              >
                Todas
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
              >
                <option value="">Todos los talleres</option>
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar factura o taller..."
                  className="pl-9 h-10 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Listado de Facturas */}
          {bills.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-slate-200 dark:border-zinc-800 p-6">
              <Receipt className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-zinc-300">
                No hay cuentas por pagar registradas
              </h3>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 max-w-sm mx-auto">
                Las deudas se generan automáticamente al confirmar la recepción física de mercancía desde los talleres o registrando una nota manual.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/75 dark:bg-zinc-950/50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-3">Número / Factura</th>
                      <th className="px-4 py-3">Taller / Fabricante</th>
                      <th className="px-4 py-3">Vencimiento</th>
                      <th className="px-4 py-3 text-right">Total ($ USD)</th>
                      <th className="px-4 py-3 text-right">Saldo Restante</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {bills.map((bill) => {
                      const isOverdue = bill.days_remaining < 0 && bill.status !== 'PAID';
                      const isPaid = bill.status === 'PAID';

                      return (
                        <tr key={bill.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40">
                          <td className="px-4 py-3.5">
                            <span className="font-mono font-bold text-slate-900 dark:text-white block">
                              {bill.internal_number}
                            </span>
                            {bill.supplier_bill_number && (
                              <span className="text-[10px] text-slate-400 block">
                                Doc Taller: {bill.supplier_bill_number}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="font-bold text-slate-800 dark:text-zinc-200 block">
                              {bill.supplier_name}
                            </span>
                            <Badge variant="outline" className="text-[9px] font-mono mt-0.5">
                              {bill.supplier_category}
                            </Badge>
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="text-slate-600 dark:text-zinc-400 block font-mono text-[11px]">
                              {bill.due_date}
                            </span>
                            {isPaid ? (
                              <span className="text-emerald-600 text-[10px] font-bold">Liquidada</span>
                            ) : isOverdue ? (
                              <span className="text-rose-600 font-bold font-mono text-[10px]">
                                {Math.abs(bill.days_remaining)}d vencida
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[10px]">
                                {bill.days_remaining}d restantes
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-700 dark:text-zinc-300">
                            {formatPrimary(bill.total_primary ?? bill.total_usd)}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <span className={`font-mono font-black text-sm block ${isPaid ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                              {formatPrimary(bill.balance_primary ?? bill.balance_usd)}
                            </span>
                            {!isPaid && (
                              <span className="font-mono text-[10px] text-slate-400 block">
                                ≈ {formatSecondary(bill.balance_primary ?? bill.balance_usd)}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            {isPaid ? (
                              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold">
                                Liquidada
                              </Badge>
                            ) : isOverdue ? (
                              <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 text-[10px] font-bold animate-pulse">
                                Vencida
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-bold">
                                Por Pagar
                              </Badge>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            {!isPaid && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedBillForPayment(bill);
                                  setIsPaymentOpen(true);
                                }}
                                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                              >
                                + Abonar
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalCount > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-500">
                  <div>
                    Mostrando <strong>{(page - 1) * pageSize + 1}</strong> a{' '}
                    <strong>{Math.min(page * pageSize, totalCount)}</strong> de{' '}
                    <strong>{totalCount}</strong> facturas
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || isLoading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-8 px-3 text-xs"
                    >
                      ← Anterior
                    </Button>
                    <span className="font-mono font-bold">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || isLoading}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="h-8 px-3 text-xs"
                    >
                      Siguiente →
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 2: RECEPCIÓN DE MERCANCÍA */}
      {activeTab === 'RECEIPTS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Recepciones de Mercancía Físicas (Entrada a Kardex)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Al confirmar una recepción, el stock ingresa automáticamente al Kardex y se genera la cuenta por pagar al fabricante.
              </p>
            </div>
            <Button
              onClick={() => setIsReceiptModalOpen(true)}
              className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              + Nueva Recepción
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {receipts.map((r) => (
              <Card key={r.id} className="border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white block">
                        {r.receipt_number}
                      </span>
                      <span className="text-xs font-bold text-indigo-600 block mt-0.5">
                        {r.supplier_name}
                      </span>
                    </div>
                    <Badge className={r.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                      {r.status === 'CONFIRMED' ? '✓ Ingresado al Kardex' : 'Borrador'}
                    </Badge>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Total Compra:</span>
                      <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                        {formatPrimary(r.total_primary ?? r.total_usd)}
                      </span>
                    </div>

                    {r.bill_number && (
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Deuda Generada:</span>
                        <span className="font-mono font-bold text-indigo-600 text-xs">
                          {r.bill_number}
                        </span>
                      </div>
                    )}
                  </div>

                  {r.items && r.items.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-50 dark:border-zinc-800/60 text-[11px] text-slate-500">
                      <strong>Ítems recibidos:</strong>
                      <ul className="list-disc list-inside mt-1 space-y-0.5">
                        {r.items.map((it: any) => (
                          <li key={it.id}>
                            {it.quantity}x {it.product_name} ({formatPrimary(it.unit_cost_primary ?? it.unit_cost_usd)} c/u)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* PESTAÑA 3: ANTICIPOS A TALLERES */}
      {activeTab === 'ADVANCES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Anticipos Directos a Fabricantes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Entregas de dinero previas a la fabricación de muebles (madera, telas, goma) que quedan como saldo a favor del comercio.
              </p>
            </div>
            <Button
              onClick={() => setIsAdvanceModalOpen(true)}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
            >
              + Registrar Anticipo
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {advances.map((adv) => (
              <Card key={adv.id} className="border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                      {adv.advance_number}
                    </span>
                    <Badge className={adv.status === 'APPLIED' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}>
                      {adv.status === 'APPLIED' ? 'Aplicado Total' : 'Disponible'}
                    </Badge>
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
                    {adv.supplier_name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{adv.purpose}</p>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Monto Entregado:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
                        {formatPrimary(adv.amount_primary ?? adv.amount_usd)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-emerald-600 font-bold block">Saldo a Favor:</span>
                      <span className="font-mono font-black text-sm text-emerald-600">
                        {formatPrimary(adv.remaining_primary ?? adv.remaining_usd)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* PESTAÑA 4: CRUCES DE CUENTAS */}
      {activeTab === 'COMPENSATIONS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Compensaciones y Cruces entre Fabricantes
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Doble asiento contable auditado: cuando un taller retira materia prima o mercancía de otro taller (ej. Sheraton $\rightarrow$ Fabiana).
              </p>
            </div>
            <Button
              onClick={() => setIsCompModalOpen(true)}
              className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              + Registrar Cruce
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {compensations.map((c) => (
              <Card key={c.id} className="border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                      {c.compensation_number}
                    </span>
                    <span className="font-mono font-black text-sm text-indigo-600">
                      {formatPrimary(c.amount_primary ?? c.amount_usd)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Entrega material:</span>
                      <strong className="text-slate-800 dark:text-zinc-200">{c.from_supplier_name}</strong>
                    </div>
                    <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Retira material:</span>
                      <strong className="text-slate-800 dark:text-zinc-200">{c.to_supplier_name}</strong>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mt-2.5 italic">
                    &quot;{c.reason}&quot;
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* PESTAÑA 5: LIBRO MAYOR / AGING (EXCEL REPRODUCIDO) */}
      {activeTab === 'AGING' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Libro Mayor y Conciliación Mensual por Taller
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cálculo formal idéntico a la plantilla de control de Home Deluxe: <strong>Saldo Inicial + Compras del Mes − Abonos del Mes = Saldo Final</strong>.
            </p>
          </div>

          {agingData && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/75 dark:bg-zinc-950/50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                      <th className="px-4 py-3">Taller / Fabricante</th>
                      <th className="px-4 py-3 text-right">Saldo Inicial ({currencySymbol})</th>
                      <th className="px-4 py-3 text-right">Compras del Mes ({currencySymbol})</th>
                      <th className="px-4 py-3 text-right">Abonos del Mes ({currencySymbol})</th>
                      <th className="px-4 py-3 text-right font-black">Saldo Final Mes ({currencySymbol})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {agingData.suppliers_ledger?.map((row: any) => (
                      <tr key={row.supplier_id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                          {row.supplier_name}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-600 dark:text-zinc-400">
                          {formatPrimary(row.initial_balance_primary ?? row.initial_balance_usd)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-indigo-600 font-bold">
                          {formatPrimary(row.month_purchases_primary ?? row.month_purchases_usd)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-emerald-600 font-bold">
                          {formatPrimary(row.month_payments_primary ?? row.month_payments_usd)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-black text-sm text-slate-900 dark:text-white">
                          {formatPrimary(row.final_balance_primary ?? row.final_balance_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100/75 dark:bg-zinc-950 border-t-2 border-slate-200 dark:border-zinc-800 font-bold">
                      <td className="px-4 py-3">TOTAL CONSOLIDADO</td>
                      <td className="px-4 py-3 text-right font-mono">{formatPrimary(agingData.totals?.initial_balance_primary ?? agingData.totals?.initial_balance_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-indigo-600">{formatPrimary(agingData.totals?.month_purchases_primary ?? agingData.totals?.month_purchases_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatPrimary(agingData.totals?.month_payments_primary ?? agingData.totals?.month_payments_usd)}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-sm">{formatPrimary(agingData.totals?.final_balance_primary ?? agingData.totals?.final_balance_usd)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 6: TALLERES & BILLETERAS */}
      {activeTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Directorio de Talleres & Proveedores de Insumos
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Fabricantes de muebles terminados, carpinterías y distribuidores de materia prima.
              </p>
            </div>
            <Button
              onClick={() => setIsSupplierModalOpen(true)}
              className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              + Nuevo Taller
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {suppliersList.map((s) => (
              <Card key={s.id} className="border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white">
                        {s.name}
                      </h4>
                      <Badge variant="outline" className="text-[10px] mt-1 font-mono">
                        {s.category}
                      </Badge>
                    </div>

                    {s.whatsapp && (
                      <a
                        href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 flex items-center justify-center text-emerald-600"
                        title="Contactar por WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800 text-xs flex items-center justify-between">
                    <span className="text-slate-500">Término de pago:</span>
                    <strong className="font-mono text-slate-800 dark:text-zinc-200">{s.payment_terms_days} días</strong>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ABONAR A FACTURA / NOTA DE COMPRA                                */}
      {/* ========================================================================= */}
      {isPaymentOpen && selectedBillForPayment && (
        <PaymentModal
          slug={slug}
          bill={selectedBillForPayment}
          paymentAccounts={paymentAccountsList}
          exchangeRate={exchangeRate}
          primaryCurrency={primaryCurrency}
          secondaryCurrency={secondaryCurrency}
          currencySymbol={currencySymbol}
          onClose={() => {
            setIsPaymentOpen(false);
            setSelectedBillForPayment(null);
          }}
          onSuccess={() => {
            setIsPaymentOpen(false);
            setSelectedBillForPayment(null);
            loadBills();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECEPCIÓN FÍSICA DE MERCANCÍA (AL KARDEX CORE)                    */}
      {/* ========================================================================= */}
      {isReceiptModalOpen && (
        <GoodsReceiptModal
          slug={slug}
          suppliers={suppliersList}
          products={products}
          stores={stores}
          primaryCurrency={primaryCurrency}
          currencySymbol={currencySymbol}
          onClose={() => setIsReceiptModalOpen(false)}
          onSuccess={() => {
            setIsReceiptModalOpen(false);
            loadReceipts();
            loadBills();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: REGISTRO DE ANTICIPO A FABRICANTE                                */}
      {/* ========================================================================= */}
      {isAdvanceModalOpen && (
        <AdvanceModal
          slug={slug}
          suppliers={suppliersList}
          paymentAccounts={paymentAccountsList}
          exchangeRate={exchangeRate}
          primaryCurrency={primaryCurrency}
          secondaryCurrency={secondaryCurrency}
          currencySymbol={currencySymbol}
          onClose={() => setIsAdvanceModalOpen(false)}
          onSuccess={() => {
            setIsAdvanceModalOpen(false);
            loadAdvances();
            loadBills();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CRUCE ENTRE FABRICANTES (COMPENSACIÓN)                           */}
      {/* ========================================================================= */}
      {isCompModalOpen && (
        <CompensationModal
          slug={slug}
          suppliers={suppliersList}
          bills={bills}
          primaryCurrency={primaryCurrency}
          currencySymbol={currencySymbol}
          onClose={() => setIsCompModalOpen(false)}
          onSuccess={() => {
            setIsCompModalOpen(false);
            loadCompensations();
            loadBills();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: NUEVO TALLER / PROVEEDOR                                         */}
      {/* ========================================================================= */}
      {isSupplierModalOpen && (
        <NewSupplierModal
          slug={slug}
          onClose={() => setIsSupplierModalOpen(false)}
          onSuccess={() => {
            setIsSupplierModalOpen(false);
            loadSuppliers();
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 1: MODAL DE ABONO MULTIMONEDA (CXP)
// -----------------------------------------------------------------------------
function PaymentModal({
  slug,
  bill,
  paymentAccounts,
  exchangeRate,
  primaryCurrency,
  secondaryCurrency,
  currencySymbol,
  onClose,
  onSuccess,
}: {
  slug: string;
  bill: BillRow;
  paymentAccounts: PaymentAccountItem[];
  exchangeRate: number;
  primaryCurrency: string;
  secondaryCurrency: string;
  currencySymbol: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [accountId, setAccountId] = useState(paymentAccounts[0]?.id || '');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const currentBalance = bill.balance_primary ?? bill.balance_usd;
  const [amountInput, setAmountInput] = useState(String(currentBalance));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numAmount = parseDecimalForDb(amountInput);
  const isVes = currency === 'VES';
  const equivalentPrimary = isVes ? Number((numAmount / exchangeRate).toFixed(2)) : numAmount;
  const balanceAfter = Math.max(0, Number((currentBalance - equivalentPrimary).toFixed(2)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('El monto a abonar debe ser mayor a 0');
      return;
    }
    if (equivalentPrimary > currentBalance + 0.01) {
      setError(`El monto abonado (${currencySymbol}${equivalentPrimary}) excede el saldo pendiente (${currencySymbol}${currentBalance})`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/${slug}/cxp/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bill_id: bill.id,
          account_id: accountId,
          currency,
          original_amount: numAmount,
          amount_primary: equivalentPrimary,
          amount_usd: equivalentPrimary,
          exchange_rate: exchangeRate,
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar el abono');

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Abonar a Factura {bill.internal_number}
            </h3>
            <p className="text-[11px] text-slate-500">
              Taller: <strong>{bill.supplier_name}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Resumen de saldo */}
          <div className="p-3 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Saldo Actual</span>
              <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                {currencySymbol}{currentBalance.toFixed(2)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Saldo Después</span>
              <span className="text-base font-black font-mono text-emerald-600">
                {currencySymbol}{balanceAfter.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Cuenta de salida (Billetera / Tesorería) */}
          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Cuenta de Salida (Tesorería)
            </Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
            >
              {paymentAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          {/* Moneda */}
          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Moneda del Pago
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrency('USD');
                  setAmountInput(String(currentBalance));
                }}
                className={`h-10 rounded-xl border text-xs font-bold ${
                  currency === 'USD'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                {primaryCurrency} ({currencySymbol})
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrency('VES');
                  setAmountInput(String((currentBalance * exchangeRate).toFixed(2)));
                }}
                className={`h-10 rounded-xl border text-xs font-bold ${
                  currency === 'VES'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                {secondaryCurrency} (Tasa BCV)
              </button>
            </div>
          </div>

          {/* Input de Monto Sanitizado */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Monto a Pagar ({currency})
              </Label>
              <button
                type="button"
                onClick={() => {
                  if (currency === 'USD') setAmountInput(String(currentBalance));
                  else setAmountInput(String((currentBalance * exchangeRate).toFixed(2)));
                }}
                className="text-[11px] font-bold text-indigo-600 hover:underline"
              >
                Liquidar Total
              </button>
            </div>
            <Input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(sanitizeDecimalInput(e.target.value))}
              placeholder="0.00"
              className="h-11 text-base font-black font-mono"
              required
            />
            {currency === 'VES' && (
              <div className="mt-1 text-[11px] font-mono text-slate-500">
                Equivalente: {currencySymbol}{equivalentPrimary.toFixed(2)} {primaryCurrency} (Tasa: {exchangeRate.toFixed(2)})
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Observaciones / Referencia
            </Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Transferencia Banesco o Efectivo entregado en taller"
              className="h-10 text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 px-4 text-xs font-semibold">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || numAmount <= 0}
              className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
            >
              {isSubmitting ? 'Procesando...' : `Confirmar Pago de ${currency === 'USD' ? currencySymbol : `${secondaryCurrency} `}${numAmount.toFixed(2)}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 2: MODAL DE RECEPCIÓN DE MERCANCÍA (AL KARDEX)
// -----------------------------------------------------------------------------
function GoodsReceiptModal({
  slug,
  suppliers,
  products,
  stores,
  primaryCurrency,
  currencySymbol,
  onClose,
  onSuccess,
}: {
  slug: string;
  suppliers: SupplierItem[];
  products: ProductItem[];
  stores: StoreItem[];
  primaryCurrency: string;
  currencySymbol: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [supplierBillNumber, setSupplierBillNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [withStockEntry, setWithStockEntry] = useState(true);
  const [items, setItems] = useState<Array<{ product_id: string; quantity: string; unit_cost_primary: string }>>([
    { product_id: products[0]?.id || '', quantity: '1', unit_cost_primary: '0' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    setItems([...items, { product_id: products[0]?.id || '', quantity: '1', unit_cost_primary: '0' }]);
  };

  const removeItem = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
  };

  const totalCalculated = items.reduce((acc, it) => {
    const q = parseDecimalForDb(it.quantity);
    const c = parseDecimalForDb(it.unit_cost_primary);
    return acc + q * c;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalCalculated <= 0) {
      setError('El total de la compra debe ser mayor a 0');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payloadItems = items.map((it) => {
        const cost = parseDecimalForDb(it.unit_cost_primary);
        return {
          product_id: it.product_id,
          quantity: parseDecimalForDb(it.quantity),
          unit_cost_primary: cost,
          unit_cost_usd: cost,
        };
      });

      const res = await fetch(`/api/admin/${slug}/cxp/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          store_id: storeId,
          supplier_bill_number: supplierBillNumber.trim() || undefined,
          with_stock_entry: withStockEntry,
          notes: notes.trim() || undefined,
          items: payloadItems,
          auto_confirm: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar recepción');

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl my-6">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Recepción de Mercancía Físicamente (Entrada Kardex)
            </h3>
            <p className="text-[11px] text-slate-500">
              Registra la llegada de muebles terminados o insumos desde los talleres.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Taller / Fabricante
              </Label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.payment_terms_days}d plazo)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                N° Nota / Factura del Taller
              </Label>
              <Input
                value={supplierBillNumber}
                onChange={(e) => setSupplierBillNumber(e.target.value)}
                placeholder="Ej. Nota #482 o Factura #190"
                className="h-11 text-xs"
              />
            </div>
          </div>

          {/* Tabla de Productos / Muebles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                Productos / Muebles a Ingresar al Kardex
              </Label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Ítem
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl border border-slate-200 dark:border-zinc-800">
                  <select
                    value={it.product_id}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx].product_id = e.target.value;
                      setItems(updated);
                    }}
                    className="flex-1 h-10 px-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {p.current_stock})
                      </option>
                    ))}
                  </select>

                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="Cant."
                    value={it.quantity}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx].quantity = sanitizeIntegerInput(e.target.value);
                      setItems(updated);
                    }}
                    className="w-16 h-10 text-xs font-mono font-bold text-center"
                  />

                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">{currencySymbol}</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="Costo"
                      value={it.unit_cost_primary}
                      onChange={(e) => {
                        const updated = [...items];
                        updated[idx].unit_cost_primary = sanitizeDecimalInput(e.target.value);
                        setItems(updated);
                      }}
                      className="pl-5 h-10 text-xs font-mono font-bold"
                    />
                  </div>

                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="w-8 h-8 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-200">
              <span>Total Deuda & Compra a Generar:</span>
              <span className="font-mono text-base">{currencySymbol}{totalCalculated.toFixed(2)} {primaryCurrency}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 px-4 text-xs font-semibold">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || totalCalculated <= 0}
              className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              {isSubmitting ? 'Procesando entrada...' : `Confirmar Recepción (${currencySymbol}${totalCalculated.toFixed(2)})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 3: MODAL DE REGISTRO DE ANTICIPOS A FABRICANTES
// -----------------------------------------------------------------------------
function AdvanceModal({
  slug,
  suppliers,
  paymentAccounts,
  exchangeRate,
  primaryCurrency,
  secondaryCurrency,
  currencySymbol,
  onClose,
  onSuccess,
}: {
  slug: string;
  suppliers: SupplierItem[];
  paymentAccounts: PaymentAccountItem[];
  exchangeRate: number;
  primaryCurrency: string;
  secondaryCurrency: string;
  currencySymbol: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [accountId, setAccountId] = useState(paymentAccounts[0]?.id || '');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [amountInput, setAmountInput] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numAmount = parseDecimalForDb(amountInput);
  const isVes = currency === 'VES';
  const amountPrimary = isVes ? Number((numAmount / exchangeRate).toFixed(2)) : numAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numAmount <= 0) {
      setError('El monto del anticipo debe ser mayor a 0');
      return;
    }
    if (!purpose.trim()) {
      setError('Indique el propósito o motivo del anticipo (ej. madera para camas)');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/${slug}/cxp/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          amount_primary: amountPrimary,
          amount_usd: amountPrimary,
          account_id: accountId,
          currency,
          original_amount: numAmount,
          exchange_rate: exchangeRate,
          purpose: purpose.trim(),
          link_option: 'UNLINKED',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar anticipo');

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-6">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Registrar Anticipo a Fabricante
            </h3>
            <p className="text-[11px] text-slate-500">
              Entrega de dinero por adelantado para compra de materiales.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Taller / Fabricante
            </Label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Cuenta de Egreso (Tesorería)
            </Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
            >
              {paymentAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Monto del Anticipo
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(sanitizeDecimalInput(e.target.value))}
              placeholder="0.00"
              className="h-11 text-base font-black font-mono"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Propósito / Destino del Anticipo *
            </Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Ej. Compra de madera, goma espuma y tela para 3 juegos"
              className="h-11 text-xs"
              required
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 px-4 text-xs font-semibold">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || numAmount <= 0}
              className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
            >
              {isSubmitting ? 'Registrando...' : `Confirmar Anticipo (${currencySymbol}${amountPrimary.toFixed(2)})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 4: MODAL DE COMPENSACIÓN / CRUCE ENTRE FABRICANTES
// -----------------------------------------------------------------------------
function CompensationModal({
  slug,
  suppliers,
  bills,
  primaryCurrency,
  currencySymbol,
  onClose,
  onSuccess,
}: {
  slug: string;
  suppliers: SupplierItem[];
  bills: BillRow[];
  primaryCurrency: string;
  currencySymbol: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fromSupplierId, setFromSupplierId] = useState(suppliers[0]?.id || '');
  const [toSupplierId, setToSupplierId] = useState(suppliers[1]?.id || suppliers[0]?.id || '');
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('Mercancía o materia prima retirada por cruce');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numAmount = parseDecimalForDb(amountInput);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromSupplierId === toSupplierId) {
      setError('El proveedor origen y destino no pueden ser el mismo');
      return;
    }
    if (numAmount <= 0) {
      setError('El monto a compensar debe ser mayor a 0');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/${slug}/cxp/compensations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_supplier_id: fromSupplierId,
          to_supplier_id: toSupplierId,
          amount_primary: numAmount,
          amount_usd: numAmount,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar compensación');

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-6">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Cruce Contable entre Fabricantes
            </h3>
            <p className="text-[11px] text-slate-500">
              Registra compensaciones sin transferencias bancarias fantasmas.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Taller que Entrega Material (ej. Sheraton)
            </Label>
            <select
              value={fromSupplierId}
              onChange={(e) => setFromSupplierId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Taller que Retira Material (ej. Fabiana)
            </Label>
            <select
              value={toSupplierId}
              onChange={(e) => setToSupplierId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Monto a Compensar ({primaryCurrency})
            </Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(sanitizeDecimalInput(e.target.value))}
              placeholder="0.00"
              className="h-11 text-base font-black font-mono"
              required
            />
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Motivo o Detalle del Cruce *
            </Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Mercancía retirada por Fabiana"
              className="h-11 text-xs"
              required
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 px-4 text-xs font-semibold">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || numAmount <= 0}
              className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              {isSubmitting ? 'Registrando...' : `Confirmar Cruce (${currencySymbol}${numAmount.toFixed(2)})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUBCOMPONENTE 5: MODAL DE NUEVO TALLER / PROVEEDOR
// -----------------------------------------------------------------------------
function NewSupplierModal({
  slug,
  onClose,
  onSuccess,
}: {
  slug: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [docType, setDocType] = useState<'V' | 'J' | 'G' | 'E'>('J');
  const [docNumber, setDocNumber] = useState('');
  const [category, setCategory] = useState<'MERCHANDISE' | 'RAW_MATERIAL' | 'SERVICE' | 'FIXED_COST'>('MERCHANDISE');
  const [paymentTermsDays, setPaymentTermsDays] = useState('15');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre o razón social del taller es requerido');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const taxId = docNumber.trim() ? `${docType}-${docNumber.trim()}` : undefined;

    try {
      const res = await fetch(`/api/admin/${slug}/cxp/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tax_id: taxId,
          category,
          payment_terms_days: Number(paymentTermsDays) || 15,
          phone: phone.trim() || undefined,
          whatsapp: phone.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar taller');

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-6">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Nuevo Taller / Proveedor
            </h3>
            <p className="text-[11px] text-slate-500">
              Registra un fabricante de muebles o proveedor de insumos.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
              Nombre o Razón Social del Taller *
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Taller Los Pinos o Fabiana"
              className="h-11 text-xs"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Cédula / RIF
              </Label>
              <div className="flex gap-1.5">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as any)}
                  className="w-16 h-11 px-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-bold font-mono"
                >
                  <option value="J">J-</option>
                  <option value="V">V-</option>
                  <option value="G">G-</option>
                  <option value="E">E-</option>
                </select>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={docNumber}
                  onChange={(e) => setDocNumber(sanitizeDocNumberInput(e.target.value))}
                  placeholder="30123456"
                  className="h-11 text-xs font-mono flex-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Teléfono / WhatsApp
              </Label>
              <Input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                placeholder="04121234567"
                className="h-11 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Categoría
              </Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold"
              >
                <option value="MERCHANDISE">Muebles / Mercancía</option>
                <option value="RAW_MATERIAL">Materia Prima (Telas/Madera)</option>
                <option value="SERVICE">Servicio / Flete</option>
                <option value="FIXED_COST">Costo Fijo</option>
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1 block">
                Plazo de Pago (Días)
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(sanitizeIntegerInput(e.target.value))}
                placeholder="15"
                className="h-11 text-xs font-mono"
                required
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-11 px-4 text-xs font-semibold">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              {isSubmitting ? 'Guardando...' : 'Crear Taller'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
