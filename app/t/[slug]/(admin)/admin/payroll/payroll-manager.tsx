'use client';

import { useState, useCallback } from 'react';
import {
  Banknote,
  Search,
  Plus,
  DollarSign,
  AlertCircle,
  Clock,
  CheckCircle2,
  Phone,
  MessageCircle,
  FileText,
  ChevronRight,
  ShieldCheck,
  Calendar,
  X,
  RefreshCw,
  Wallet,
  Users,
  Coins,
  ArrowRight,
  Send,
  Sparkles,
  Lock,
  Building,
  UserCheck,
  Edit2,
  Download,
  Printer,
  Sliders,
  Check,
  CreditCard,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// =============================================================================
// FORMATEADORES BIMONEDA
// =============================================================================

function formatPrimary(val: number, symbol: string = '$'): string {
  return `${symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSecondary(val: number, symbol: string = 'Bs.'): string {
  return `${symbol} ${val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function translateFrequency(freq?: string): string {
  switch (freq) {
    case 'BIWEEKLY':
      return 'Quincenal';
    case 'WEEKLY':
      return 'Semanal';
    case 'MONTHLY':
      return 'Mensual';
    default:
      return freq || 'Quincenal';
  }
}

function translateConceptType(type?: string): string {
  switch (type) {
    case 'EARNING':
      return 'Asignación';
    case 'DEDUCTION':
      return 'Deducción';
    case 'COMMISSION':
      return 'Comisión';
    case 'RETENTION':
      return 'Retención Legal';
    case 'BONUS':
      return 'Bono';
    default:
      return type || '';
  }
}

function translateCalculationMode(mode?: string): string {
  switch (mode) {
    case 'FIXED':
      return 'Monto Fijo';
    case 'PERCENTAGE':
      return 'Porcentual';
    case 'DYNAMIC_COMMISSION':
      return 'Comisión de Ventas';
    case 'STATUTORY_FORMULA':
      return 'Fórmula Legal';
    default:
      return mode || '';
  }
}

function translateStatus(status?: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Borrador';
    case 'PROJECTED':
    case 'CALCULATED':
      return 'Calculado';
    case 'APPROVED':
      return 'Aprobado';
    case 'DISBURSED':
      return 'Liquidado';
    case 'PAID':
      return 'Pagado';
    case 'ACTIVE':
      return 'Activo';
    case 'SETTLED':
      return 'Amortizado';
    case 'CANCELLED':
    case 'VOID':
      return 'Anulado';
    default:
      return status || '';
  }
}

interface Employee {
  id: string;
  staff_id: string | null;
  first_name: string;
  last_name: string;
  id_document: string;
  phone: string | null;
  email: string | null;
  job_title: string;
  department: string;
  hired_at: string;
  terminated_at: string | null;
  base_salary_primary: number;
  base_salary_secondary: number;
  payment_frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_type: string | null;
  mobile_payment_phone: string | null;
  mobile_payment_id_doc: string | null;
  can_login: boolean;
  is_active: boolean;
  notes: string | null;
  active_advances_balance: number;
  staff_email?: string;
  staff_role?: string;
}

interface Period {
  id: string;
  period_code: string;
  start_date: string;
  end_date: string;
  payment_frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: 'DRAFT' | 'PROJECTED' | 'APPROVED' | 'DISBURSED' | 'CANCELLED';
  notes: string | null;
  run_id?: string;
  run_number?: string;
  run_status?: string;
  total_net_primary?: number;
  total_net_secondary?: number;
  exchange_rate_snapshot?: number;
  total_base_primary?: number;
  total_commissions_primary?: number;
  total_deductions_primary?: number;
  employees_in_run?: number;
}

interface RunLine {
  id: string;
  run_id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  id_document: string;
  job_title: string;
  department: string;
  phone: string | null;
  days_worked: number;
  base_salary_primary: number;
  commissions_primary: number;
  allowances_primary: number;
  deductions_primary: number;
  net_salary_primary: number;
  net_salary_secondary: number;
  exchange_rate_snapshot: number;
  receipt_number?: string;
  concepts_breakdown: Array<{
    code: string;
    name: string;
    type: string;
    amount_primary: number;
    amount_secondary?: number;
  }>;
  status: 'PENDING' | 'PAID' | 'VOID';
}

interface Run {
  id: string;
  run_number: string;
  period_id: string;
  period_code: string;
  start_date: string;
  end_date: string;
  payment_frequency: string;
  total_base_primary: number;
  total_commissions_primary: number;
  total_allowances_primary: number;
  total_deductions_primary: number;
  total_net_primary: number;
  total_net_secondary: number;
  exchange_rate_snapshot: number;
  status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'DISBURSED' | 'CANCELLED';
  approved_by_name?: string;
  disbursed_by_name?: string;
  lines_count: number;
  lines?: RunLine[];
}

interface Advance {
  id: string;
  advance_number: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  id_document: string;
  job_title: string;
  department: string;
  requested_amount_primary: number;
  approved_amount_primary: number;
  pending_amount_primary: number;
  exchange_rate_snapshot: number;
  installments_total: number;
  installments_remaining: number;
  reason: string;
  status: string;
  requested_by_name?: string;
  approved_by_name?: string;
}

interface Concept {
  id: string;
  code: string;
  name: string;
  concept_type: string;
  calculation_mode: string;
  default_amount_primary: number;
  percentage_rate: number;
  is_statutory: boolean;
  is_active: boolean;
}

interface PaymentAccount {
  id: string;
  name: string;
  type: string;
  details: any;
  is_default: boolean;
}

interface StaffProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export function PayrollManager({
  slug,
  staffRole,
  isPluginActive,
  initialEmployees,
  initialPeriods,
  initialRuns,
  initialAdvances,
  initialConcepts,
  paymentAccounts,
  staffProfiles,
  primaryCurrency,
  secondaryCurrency,
  currentExchangeRate,
}: {
  slug: string;
  staffRole: string;
  isPluginActive: boolean;
  initialEmployees: Employee[];
  initialPeriods: Period[];
  initialRuns: Run[];
  initialAdvances: Advance[];
  initialConcepts: Concept[];
  paymentAccounts: PaymentAccount[];
  staffProfiles: StaffProfile[];
  primaryCurrency: string;
  secondaryCurrency: string;
  currentExchangeRate: number;
}) {
  const [activeTab, setActiveTab] = useState<'periods' | 'employees' | 'advances' | 'concepts'>('periods');
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [periods, setPeriods] = useState<Period[]>(initialPeriods);
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [advances, setAdvances] = useState<Advance[]>(initialAdvances);
  const [concepts] = useState<Concept[]>(initialConcepts);

  // Filtros de búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Estado de corrida seleccionada para visualización/edición profunda
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoadingRun, setIsLoadingRun] = useState(false);

  // Estados de modales
  const [isNewEmployeeModalOpen, setIsNewEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isNewPeriodModalOpen, setIsNewPeriodModalOpen] = useState(false);
  const [isNewAdvanceModalOpen, setIsNewAdvanceModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isDisburseModalOpen, setIsDisburseModalOpen] = useState(false);
  const [selectedPayslipLine, setSelectedPayslipLine] = useState<RunLine | null>(null);
  const [editingLine, setEditingLine] = useState<RunLine | null>(null);

  // Loading global de acciones
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cargar corrida en detalle
  const loadRunDetail = useCallback(async (runId: string) => {
    setIsLoadingRun(true);
    try {
      const res = await fetch(`/api/admin/${slug}/payroll/runs/${runId}`);
      const data = await res.json();
      if (data.success && data.run) {
        setSelectedRun(data.run);
      }
    } catch (e: any) {
      console.error('Error al cargar detalle de corrida:', e);
    } finally {
      setIsLoadingRun(false);
    }
  }, [slug]);

  // Recargar listas principales
  const reloadData = useCallback(async () => {
    try {
      const [empRes, perRes, advRes, runRes] = await Promise.all([
        fetch(`/api/admin/${slug}/payroll/employees`),
        fetch(`/api/admin/${slug}/payroll/periods`),
        fetch(`/api/admin/${slug}/payroll/advances`),
        fetch(`/api/admin/${slug}/payroll/runs`),
      ]);
      const [empData, perData, advData, runData] = await Promise.all([
        empRes.json(),
        perRes.json(),
        advRes.json(),
        runRes.json(),
      ]);

      if (empData.success) setEmployees(empData.employees);
      if (perData.success) setPeriods(perData.periods);
      if (advData.success) setAdvances(advData.advances);
      if (runData.success) setRuns(runData.runs);

      if (selectedRun) {
        await loadRunDetail(selectedRun.id);
      }
    } catch (e) {
      console.error('Error al recargar datos de nómina:', e);
    }
  }, [slug, selectedRun, loadRunDetail]);

  // Generar Corrida para un período
  const handleGenerateRun = async (periodId: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/${slug}/payroll/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: periodId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al generar corrida');
      }
      setActionMessage({ type: 'success', text: `Corrida ${data.run_number} calculada exitosamente para ${data.employees_count} colaboradores.` });
      await reloadData();
      await loadRunDetail(data.run_id);
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Importar comisiones
  const handleImportCommissions = async (runId: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/${slug}/payroll/runs/${runId}/commissions`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al importar comisiones');
      }
      setActionMessage({ 
        type: 'success', 
        text: `Comisiones importadas: $${data.total_commissions_primary} para ${data.imported_count} colaboradores.` 
      });
      await reloadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Exportar Corrida a CSV
  const exportRunToCSV = (run: Run) => {
    if (!run.lines || run.lines.length === 0) return;
    const headers = ['Recibo', 'Colaborador', 'Cedula', 'Cargo', 'Departamento', 'Dias', 'Sueldo Base ($)', 'Comisiones ($)', 'Deducciones ($)', 'Neto ($)', 'Neto (Bs)', 'Tasa'];
    const rows = run.lines.map((l) => [
      l.receipt_number || 'N/A',
      `"${l.first_name} ${l.last_name}"`,
      l.id_document,
      `"${l.job_title}"`,
      `"${l.department}"`,
      l.days_worked,
      l.base_salary_primary.toFixed(2),
      l.commissions_primary.toFixed(2),
      l.deductions_primary.toFixed(2),
      l.net_salary_primary.toFixed(2),
      l.net_salary_secondary.toFixed(2),
      l.exchange_rate_snapshot.toFixed(4),
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Nomina_${run.period_code}_${run.run_number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // KPIs consolidados
  const totalActiveEmployees = employees.filter((e) => e.is_active).length;
  const totalAdvancesPending = advances
    .filter((a) => a.status === 'APPROVED' || a.status === 'PARTIALLY_DEDUCTED')
    .reduce((acc, a) => acc + a.pending_amount_primary, 0);
  const openPeriodsCount = periods.filter((p) => p.status === 'DRAFT' || p.status === 'PROJECTED').length;
  const latestRun = runs[0];

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white flex items-center gap-2.5">
              <Banknote className="w-7 h-7 text-rose-600 dark:text-rose-400" />
              Nómina & Personal
            </h1>
            <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 font-medium">
              Nómina Activa
            </Badge>
          </div>
          <p className="text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Gestión de colaboradores, corridas bimoneda, retenciones de ley (IVSS / FAOV) y liquidación de sueldos.
          </p>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsNewAdvanceModalOpen(true)}
            className="rounded-xl border-stone-300 dark:border-zinc-700 hover:bg-stone-50 dark:hover:bg-zinc-800 transition"
          >
            <Coins className="w-4 h-4 mr-1.5 text-amber-600" />
            + Adelanto
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsNewPeriodModalOpen(true)}
            className="rounded-xl border-stone-300 dark:border-zinc-700 hover:bg-stone-50 dark:hover:bg-zinc-800 transition"
          >
            <Calendar className="w-4 h-4 mr-1.5 text-emerald-600" />
            + Período
          </Button>

          <Button
            size="sm"
            onClick={() => setIsNewEmployeeModalOpen(true)}
            className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-sm transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            + Colaborador
          </Button>
        </div>
      </div>

      {/* Alerta de notificación / feedback */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm shadow-xs transition ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-stone-400 hover:text-stone-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TARJETAS KPI BIMONEDA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Masa salarial */}
        <Card className="rounded-2xl border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-xs hover:border-rose-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Última Corrida</span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-stone-900 dark:text-white font-mono">
                {latestRun ? formatPrimary(latestRun.total_net_primary) : '$0.00'}
              </div>
              <p className="text-xs text-stone-500 mt-0.5 font-mono">
                {latestRun
                  ? formatSecondary(latestRun.total_net_secondary)
                  : formatSecondary(0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: Personal activo */}
        <Card className="rounded-2xl border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-xs hover:border-blue-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Personal Activo</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-stone-900 dark:text-white font-mono">
                {totalActiveEmployees}
              </div>
              <p className="text-xs text-stone-500 mt-0.5">En plantilla de pago</p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Adelantos pendientes */}
        <Card className="rounded-2xl border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-xs hover:border-amber-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Adelantos Activos</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                {formatPrimary(totalAdvancesPending)}
              </div>
              <p className="text-xs text-stone-500 mt-0.5">Saldo por amortizar</p>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Períodos abiertos */}
        <Card className="rounded-2xl border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-xs hover:border-emerald-300 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Períodos Abiertos</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-stone-900 dark:text-white font-mono">
                {openPeriodsCount}
              </div>
              <p className="text-xs text-stone-500 mt-0.5">Pendientes de liquidar</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div className="flex items-center gap-2 border-b border-stone-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            setActiveTab('periods');
            setSelectedRun(null);
          }}
          className={`pb-3 px-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'periods'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-zinc-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Períodos & Corridas
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={`pb-3 px-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'employees'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-zinc-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Colaboradores ({employees.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('advances')}
          className={`pb-3 px-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'advances'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-zinc-300'
          }`}
        >
          <Coins className="w-4 h-4" />
          Adelantos ({advances.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('concepts')}
          className={`pb-3 px-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'concepts'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-zinc-300'
          }`}
        >
          <FileText className="w-4 h-4" />
          Conceptos ({concepts.length})
        </button>
      </div>

      {/* VISTA 1: PERÍODOS & CORRIDAS */}
      {activeTab === 'periods' && !selectedRun && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#18181b] shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 dark:bg-zinc-800/50 text-stone-600 dark:text-zinc-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Código / Período</th>
                  <th className="py-3 px-4">Fechas</th>
                  <th className="py-3 px-4">Frecuencia</th>
                  <th className="py-3 px-4">Monto Neto</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-stone-400">
                      No hay períodos registrados. Crea uno con "+ Período".
                    </td>
                  </tr>
                ) : (
                  periods.map((period) => (
                    <tr key={period.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-stone-900 dark:text-white font-mono">
                          {period.period_code}
                        </div>
                        {period.run_number && (
                          <div className="text-xs text-stone-400 font-mono">
                            {period.run_number}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-stone-600 dark:text-zinc-300">
                        {period.start_date} al {period.end_date}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-xs bg-stone-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md text-stone-700 dark:text-zinc-300 font-medium">
                          {translateFrequency(period.payment_frequency)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {period.total_net_primary ? (
                          <div>
                            <div className="font-semibold text-stone-900 dark:text-white font-mono">
                              {formatPrimary(period.total_net_primary)}
                            </div>
                            <div className="text-xs text-stone-400 font-mono">
                              {formatSecondary(period.total_net_secondary || 0)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {period.status === 'DISBURSED' && (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                            ✓ PAGADO
                          </Badge>
                        )}
                        {period.status === 'APPROVED' && (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-medium">
                            🔒 APROBADO
                          </Badge>
                        )}
                        {period.status === 'PROJECTED' && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-medium">
                            ⚙️ CALCULADO
                          </Badge>
                        )}
                        {period.status === 'DRAFT' && (
                          <Badge variant="outline" className="text-stone-500 font-medium">
                            BORRADOR
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {period.run_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => loadRunDetail(period.run_id!)}
                            className="rounded-xl border-stone-300 text-xs hover:bg-stone-50 dark:hover:bg-zinc-800 transition"
                          >
                            Ver Corrida
                            <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleGenerateRun(period.id)}
                            disabled={actionLoading}
                            className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs shadow-sm transition"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1" />
                            Generar Corrida
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 1.1: DETALLE / EDITOR DE CORRIDA */}
      {activeTab === 'periods' && selectedRun && (
        <div className="space-y-4">
          {/* Header de la Corrida con Timeline Stepper */}
          <div className="bg-stone-50 dark:bg-zinc-800/40 p-5 rounded-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedRun(null)}
                    className="rounded-lg text-xs"
                  >
                    ← Períodos
                  </Button>
                  <h2 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
                    Corrida {selectedRun.run_number}
                  </h2>
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Período: <strong>{selectedRun.period_code}</strong> ({selectedRun.start_date} al {selectedRun.end_date})
                  {selectedRun.exchange_rate_snapshot > 1 && (
                    <span className="ml-2 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      • Tasa BCV: {selectedRun.exchange_rate_snapshot.toFixed(4)} Bs/$
                    </span>
                  )}
                </p>
              </div>

              {/* Botones de acción */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportRunToCSV(selectedRun)}
                  className="rounded-xl text-xs border-stone-300"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Exportar CSV
                </Button>

                {selectedRun.status !== 'APPROVED' && selectedRun.status !== 'DISBURSED' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImportCommissions(selectedRun.id)}
                      disabled={actionLoading}
                      className="rounded-xl text-xs border-stone-300 hover:bg-stone-100"
                    >
                      <Coins className="w-3.5 h-3.5 mr-1 text-purple-600" />
                      Importar Comisiones
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setIsApproveModalOpen(true)}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm"
                    >
                      <Lock className="w-3.5 h-3.5 mr-1" />
                      Aprobar & Congelar Tasa
                    </Button>
                  </>
                )}

                {selectedRun.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() => setIsDisburseModalOpen(true)}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                  >
                    <Wallet className="w-3.5 h-3.5 mr-1" />
                    Liquidar Nómina (Pagar)
                  </Button>
                )}

                {selectedRun.status === 'DISBURSED' && (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs py-1 px-3 font-semibold">
                    ✓ LIQUIDADA Y DISPERSADA
                  </Badge>
                )}
              </div>
            </div>

            {/* Resumen de totales de corrida */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-stone-200 dark:border-zinc-800/80 text-xs">
              <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-stone-200/80 dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Total Base</span>
                <span className="font-mono font-bold text-stone-900 dark:text-white text-sm">
                  {formatPrimary(selectedRun.total_base_primary)}
                </span>
              </div>
              <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-stone-200/80 dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Comisiones</span>
                <span className="font-mono font-bold text-purple-600 text-sm">
                  {formatPrimary(selectedRun.total_commissions_primary)}
                </span>
              </div>
              <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-stone-200/80 dark:border-zinc-800">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Deducciones (Ley/Adelantos)</span>
                <span className="font-mono font-bold text-rose-600 text-sm">
                  -{formatPrimary(selectedRun.total_deductions_primary)}
                </span>
              </div>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900 col-span-2">
                <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-bold">Total Neto a Pagar</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-300 text-base">
                    {formatPrimary(selectedRun.total_net_primary)}
                  </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 text-xs">
                    ({formatSecondary(selectedRun.total_net_secondary)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de colaboradores en la corrida */}
          <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#18181b] shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 dark:bg-zinc-800/50 text-stone-600 dark:text-zinc-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Recibo / Colaborador</th>
                  <th className="py-3 px-4">Días</th>
                  <th className="py-3 px-4">Sueldo Base</th>
                  <th className="py-3 px-4">Comisiones</th>
                  <th className="py-3 px-4">Deducciones</th>
                  <th className="py-3 px-4">Neto a Cobrar</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {!selectedRun.lines || selectedRun.lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-stone-400">
                      No hay colaboradores en esta corrida.
                    </td>
                  </tr>
                ) : (
                  selectedRun.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-stone-900 dark:text-white">
                          {line.first_name} {line.last_name}
                        </div>
                        <div className="text-xs text-stone-400">
                          {line.receipt_number && <span className="font-mono font-bold text-rose-600 mr-1.5">{line.receipt_number}</span>}
                          {line.id_document} • {line.job_title} ({line.department})
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-stone-700 dark:text-zinc-300">
                        {line.days_worked} d
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-stone-900 dark:text-white font-mono">
                        {formatPrimary(line.base_salary_primary)}
                      </td>
                      <td className="py-3.5 px-4 text-purple-600 font-semibold font-mono">
                        {formatPrimary(line.commissions_primary)}
                      </td>
                      <td className="py-3.5 px-4 text-rose-600 font-semibold font-mono">
                        -{formatPrimary(line.deductions_primary)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatPrimary(line.net_salary_primary)}
                        </div>
                        <div className="text-xs text-stone-400 font-mono">
                          {formatSecondary(line.net_salary_secondary)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1">
                        {selectedRun.status !== 'APPROVED' && selectedRun.status !== 'DISBURSED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingLine(line)}
                            className="rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-600"
                            title="Ajustar Novedades (Días, bonos, deducciones)"
                          >
                            <Sliders className="w-3.5 h-3.5 mr-1" />
                            Ajustar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedPayslipLine(line)}
                          className="rounded-lg text-xs hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-900 dark:text-white"
                        >
                          <FileText className="w-3.5 h-3.5 mr-1 text-rose-600" />
                          Recibo
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: EXPEDIENTE DE COLABORADORES */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input
                placeholder="Buscar por nombre, cédula o cargo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rounded-xl border-stone-200 dark:border-zinc-800"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="text-xs bg-white dark:bg-[#18181b] border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-stone-700 dark:text-zinc-300"
              >
                <option value="ALL">Todos los departamentos</option>
                <option value="Ventas">Ventas</option>
                <option value="Operaciones">Operaciones</option>
                <option value="Administración">Administración</option>
                <option value="Taller">Taller / Fabricación</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#18181b] shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 dark:bg-zinc-800/50 text-stone-600 dark:text-zinc-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-4">Cédula</th>
                  <th className="py-3 px-4">Cargo / Dpto</th>
                  <th className="py-3 px-4">Sueldo Base ($)</th>
                  <th className="py-3 px-4">Frecuencia</th>
                  <th className="py-3 px-4">Adelantos Activos</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Editar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-stone-400">
                      No hay colaboradores registrados.
                    </td>
                  </tr>
                ) : (
                  employees
                    .filter((e) => {
                      const matchesSearch =
                        `${e.first_name} ${e.last_name} ${e.id_document} ${e.job_title}`
                          .toLowerCase()
                          .includes(searchTerm.toLowerCase());
                      const matchesDept = departmentFilter === 'ALL' || e.department === departmentFilter;
                      return matchesSearch && matchesDept;
                    })
                    .map((emp) => (
                      <tr key={emp.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-800/30 transition">
                        <td className="py-3.5 px-4 font-semibold text-stone-900 dark:text-white">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center justify-center font-bold text-xs shrink-0">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </div>
                            <div>
                              <div>{emp.first_name} {emp.last_name}</div>
                              {emp.phone && <div className="text-xs text-stone-400">{emp.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-stone-700 dark:text-zinc-300">
                          {emp.id_document}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-stone-900 dark:text-white">{emp.job_title}</div>
                          <div className="text-xs text-stone-400">{emp.department}</div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-stone-900 dark:text-white font-mono">
                          {formatPrimary(emp.base_salary_primary)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-xs bg-stone-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md text-stone-700 dark:text-zinc-300 font-medium">
                            {translateFrequency(emp.payment_frequency)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {emp.active_advances_balance > 0 ? (
                            <span className="text-xs font-semibold text-amber-600 font-mono">
                              {formatPrimary(emp.active_advances_balance)}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {emp.is_active ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Activo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
                              Inactivo
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingEmployee(emp)}
                            className="rounded-lg text-xs hover:bg-stone-100 text-stone-600 p-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 3: ADELANTOS & PRÉSTAMOS */}
      {activeTab === 'advances' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#18181b] shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 dark:bg-zinc-800/50 text-stone-600 dark:text-zinc-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Nº Adelanto</th>
                  <th className="py-3 px-4">Colaborador</th>
                  <th className="py-3 px-4">Aprobado ($)</th>
                  <th className="py-3 px-4">Saldo Pendiente</th>
                  <th className="py-3 px-4">Cuotas Restantes</th>
                  <th className="py-3 px-4">Motivo</th>
                  <th className="py-3 px-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {advances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-stone-400">
                      No hay adelantos registrados. Emite uno con "+ Adelanto".
                    </td>
                  </tr>
                ) : (
                  advances.map((adv) => (
                    <tr key={adv.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-semibold text-stone-900 dark:text-white">
                        {adv.advance_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-stone-900 dark:text-white">
                          {adv.first_name} {adv.last_name}
                        </div>
                        <div className="text-xs text-stone-400">{adv.job_title}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-stone-900 dark:text-white font-mono">
                        {formatPrimary(adv.approved_amount_primary)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-amber-600 font-mono">
                        {formatPrimary(adv.pending_amount_primary)}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {adv.installments_remaining} de {adv.installments_total}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-stone-600 dark:text-zinc-300 max-w-xs truncate">
                        {adv.reason}
                      </td>
                      <td className="py-3.5 px-4">
                        {adv.status === 'SETTLED' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium">
                            ✓ AMORTIZADO
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-medium">
                            ⏳ ACTIVO
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 4: CATÁLOGO DE CONCEPTOS */}
      {activeTab === 'concepts' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#18181b] shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 dark:bg-zinc-800/50 text-stone-600 dark:text-zinc-400 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Nombre del Concepto</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Modo de Cálculo</th>
                  <th className="py-3 px-4">Tasa / Porcentaje</th>
                  <th className="py-3 px-4">De Ley (Legal)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-zinc-800">
                {concepts.map((concept) => (
                  <tr key={concept.id} className="hover:bg-stone-50/50 dark:hover:bg-zinc-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-semibold text-stone-900 dark:text-white">
                      {concept.code}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-stone-900 dark:text-white">
                      {concept.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md font-medium text-stone-600 dark:text-zinc-300">
                        {translateConceptType(concept.concept_type)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-stone-500">
                      {translateCalculationMode(concept.calculation_mode)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold">
                      {concept.percentage_rate > 0 ? `${concept.percentage_rate}%` : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {concept.is_statutory ? (
                        <span className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                          ✓ Obligatorio
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">Opcional</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRAR / EDITAR COLABORADOR */}
      {(isNewEmployeeModalOpen || editingEmployee) && (
        <EmployeeFormModal
          slug={slug}
          employee={editingEmployee}
          staffProfiles={staffProfiles}
          onClose={() => {
            setIsNewEmployeeModalOpen(false);
            setEditingEmployee(null);
          }}
          onSuccess={async () => {
            setIsNewEmployeeModalOpen(false);
            setEditingEmployee(null);
            setActionMessage({ type: 'success', text: 'Expediente de colaborador guardado exitosamente.' });
            await reloadData();
          }}
        />
      )}

      {/* MODAL 2: NUEVO PERÍODO */}
      {isNewPeriodModalOpen && (
        <NewPeriodModal
          slug={slug}
          onClose={() => setIsNewPeriodModalOpen(false)}
          onSuccess={async () => {
            setIsNewPeriodModalOpen(false);
            setActionMessage({ type: 'success', text: 'Período creado exitosamente.' });
            await reloadData();
          }}
        />
      )}

      {/* MODAL 3: EMITIR ADELANTO */}
      {isNewAdvanceModalOpen && (
        <NewAdvanceModal
          slug={slug}
          employees={employees.filter((e) => e.is_active)}
          currentRate={currentExchangeRate}
          onClose={() => setIsNewAdvanceModalOpen(false)}
          onSuccess={async () => {
            setIsNewAdvanceModalOpen(false);
            setActionMessage({ type: 'success', text: 'Adelanto emitido y aprobado exitosamente.' });
            await reloadData();
          }}
        />
      )}

      {/* MODAL 4: APROBAR CORRIDA & CONGELAR TASA */}
      {isApproveModalOpen && selectedRun && (
        <ApproveRunModal
          slug={slug}
          run={selectedRun}
          defaultRate={currentExchangeRate}
          onClose={() => setIsApproveModalOpen(false)}
          onSuccess={async () => {
            setIsApproveModalOpen(false);
            setActionMessage({ type: 'success', text: 'Corrida aprobada, tasa congelada y números de recibo asignados.' });
            await reloadData();
          }}
        />
      )}

      {/* MODAL 5: LIQUIDAR NÓMINA (DISBURSE) */}
      {isDisburseModalOpen && selectedRun && (
        <DisburseRunModal
          slug={slug}
          run={selectedRun}
          paymentAccounts={paymentAccounts}
          onClose={() => setIsDisburseModalOpen(false)}
          onSuccess={async () => {
            setIsDisburseModalOpen(false);
            setActionMessage({ type: 'success', text: 'Nómina dispersada y egreso de tesorería registrado.' });
            await reloadData();
          }}
        />
      )}

      {/* MODAL 6: AJUSTAR NOVEDADES DE LÍNEA */}
      {editingLine && selectedRun && (
        <EditRunLineModal
          slug={slug}
          runId={selectedRun.id}
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSuccess={async () => {
            setEditingLine(null);
            setActionMessage({ type: 'success', text: 'Novedades actualizadas y corrida recalculada.' });
            await reloadData();
          }}
        />
      )}

      {/* MODAL 7: RECIBO DE PAGO DIGITAL (IMPRESIÓN / WHATSAPP) */}
      {selectedPayslipLine && selectedRun && (
        <PayslipModal
          line={selectedPayslipLine}
          run={selectedRun}
          onClose={() => setSelectedPayslipLine(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// SUBCOMPONENTES / MODALES IMPECCABLE
// =============================================================================

function EmployeeFormModal({
  slug,
  employee,
  staffProfiles,
  onClose,
  onSuccess,
}: {
  slug: string;
  employee: Employee | null;
  staffProfiles: StaffProfile[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = Boolean(employee);
  const [firstName, setFirstName] = useState(employee?.first_name || '');
  const [lastName, setLastName] = useState(employee?.last_name || '');
  const [idDocument, setIdDocument] = useState(employee?.id_document || '');
  const [jobTitle, setJobTitle] = useState(employee?.job_title || '');
  const [department, setDepartment] = useState(employee?.department || 'Ventas');
  const [baseSalaryPrimary, setBaseSalaryPrimary] = useState(employee ? employee.base_salary_primary.toString() : '40.00');
  const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>(employee?.payment_frequency || 'BIWEEKLY');
  const [phone, setPhone] = useState(employee?.phone || '');
  const [bankName, setBankName] = useState(employee?.bank_name || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(employee?.bank_account_number || '');
  const [mobilePhone, setMobilePhone] = useState(employee?.mobile_payment_phone || '');
  const [staffId, setStaffId] = useState<string>(employee?.staff_id || '');
  const [isActive, setIsActive] = useState<boolean>(employee ? employee.is_active : true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/${slug}/payroll/employees`;
      const method = isEditing ? 'PUT' : 'POST';
      const bodyPayload = {
        ...(isEditing ? { id: employee?.id } : {}),
        first_name: firstName,
        last_name: lastName,
        id_document: idDocument,
        job_title: jobTitle,
        department,
        base_salary_primary: parseFloat(baseSalaryPrimary) || 0,
        payment_frequency: frequency,
        phone: phone || null,
        bank_name: bankName || null,
        bank_account_number: bankAccountNumber || null,
        mobile_payment_phone: mobilePhone || null,
        staff_id: staffId || null,
        is_active: isActive,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar colaborador');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-rose-600" />
            {isEditing ? 'Editar Colaborador' : 'Nuevo Colaborador'}
          </h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Carlos"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Apellido *</Label>
              <Input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Pérez"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cédula / Documento *</Label>
              <Input
                required
                value={idDocument}
                onChange={(e) => setIdDocument(e.target.value)}
                placeholder="V-18765432"
                className="mt-1 rounded-xl text-xs font-mono font-medium"
              />
            </div>
            <div>
              <Label className="text-xs">Teléfono / WhatsApp</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0414-1234567"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cargo *</Label>
              <Input
                required
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Ventas / Asesor"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Departamento</Label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
              >
                <option value="Ventas">Ventas</option>
                <option value="Operaciones">Operaciones</option>
                <option value="Administración">Administración</option>
                <option value="Taller">Taller / Fabricación</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Sueldo Base ($ USD) *</Label>
              <Input
                required
                type="number"
                step="0.01"
                value={baseSalaryPrimary}
                onChange={(e) => setBaseSalaryPrimary(e.target.value)}
                className="mt-1 rounded-xl text-xs font-mono font-semibold"
              />
            </div>
            <div>
              <Label className="text-xs">Frecuencia de Pago</Label>
              <select
                value={frequency}
                onChange={(e: any) => setFrequency(e.target.value)}
                className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
              >
                <option value="BIWEEKLY">Quincenal (15 días)</option>
                <option value="WEEKLY">Semanal (7 días)</option>
                <option value="MONTHLY">Mensual (30 días)</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Vincular a Usuario del Sistema (Opcional)</Label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
            >
              <option value="">Ninguno (Obrero / Colaborador sin acceso a panel)</option>
              {staffProfiles.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.full_name} ({sp.email}) — Rol: {sp.role}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-100 dark:border-zinc-800">
            <div>
              <Label className="text-xs">Banco</Label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Banesco / Mercantil"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Teléfono Pago Móvil</Label>
              <Input
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
                placeholder="0414-0000000"
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          {isEditing && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="is_active_emp"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-stone-300 text-rose-600 focus:ring-rose-500"
              />
              <label htmlFor="is_active_emp" className="text-xs font-medium text-stone-700 dark:text-zinc-300">
                Colaborador activo en nómina
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
            >
              {loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Colaborador'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditRunLineModal({
  slug,
  runId,
  line,
  onClose,
  onSuccess,
}: {
  slug: string;
  runId: string;
  line: RunLine;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [daysWorked, setDaysWorked] = useState(line.days_worked);
  const [baseSalary, setBaseSalary] = useState(line.base_salary_primary.toString());
  const [allowances, setAllowances] = useState(line.allowances_primary.toString());
  const [commissions, setCommissions] = useState(line.commissions_primary.toString());
  const [deductions, setDeductions] = useState(line.deductions_primary.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedBase = parseFloat(baseSalary) || 0;
  const parsedAllow = parseFloat(allowances) || 0;
  const parsedComm = parseFloat(commissions) || 0;
  const parsedDed = parseFloat(deductions) || 0;
  const calculatedNet = Math.max(0, (parsedBase + parsedAllow + parsedComm) - parsedDed);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${slug}/payroll/runs/${runId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: line.id,
          days_worked: daysWorked,
          base_salary_primary: parsedBase,
          allowances_primary: parsedAllow,
          commissions_primary: parsedComm,
          deductions_primary: parsedDed,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al actualizar línea');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <div>
            <h3 className="font-bold text-base text-stone-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-rose-600" />
              Ajustar Novedades de Corrida
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">{line.first_name} {line.last_name} ({line.id_document})</p>
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3.5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Días Laborados</Label>
              <Input
                type="number"
                min="0"
                max="31"
                value={daysWorked}
                onChange={(e) => setDaysWorked(parseInt(e.target.value, 10) || 0)}
                className="mt-1 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <Label className="text-xs">Sueldo Base ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className="mt-1 rounded-xl text-xs font-mono font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Bonos / Asign. ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
                className="mt-1 rounded-xl text-xs font-mono text-emerald-600"
              />
            </div>
            <div>
              <Label className="text-xs">Comisiones ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={commissions}
                onChange={(e) => setCommissions(e.target.value)}
                className="mt-1 rounded-xl text-xs font-mono text-purple-600"
              />
            </div>
            <div>
              <Label className="text-xs">Deducciones ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                className="mt-1 rounded-xl text-xs font-mono text-rose-600"
              />
            </div>
          </div>

          <div className="p-3 bg-stone-50 dark:bg-zinc-900 rounded-xl flex justify-between items-center text-xs">
            <span className="font-semibold text-stone-600 dark:text-zinc-300">Nuevo Neto Proyectado:</span>
            <span className="font-mono font-extrabold text-emerald-600 text-sm">
              {formatPrimary(calculatedNet)}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
            >
              {loading ? 'Guardando...' : 'Aplicar Ajustes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewPeriodModal({
  slug,
  onClose,
  onSuccess,
}: {
  slug: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [periodCode, setPeriodCode] = useState(() => {
    const d = new Date();
    const q = d.getDate() <= 15 ? 'Q1' : 'Q2';
    return `NOM-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${q}`;
  });
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const day = d.getDate() <= 15 ? 1 : 16;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    if (d.getDate() <= 15) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    } else {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${last}`;
    }
  });
  const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('BIWEEKLY');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${slug}/payroll/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_code: periodCode,
          start_date: startDate,
          end_date: endDate,
          payment_frequency: frequency,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al crear período');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            Nuevo Período de Nómina
          </h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
          <div>
            <Label className="text-xs">Código de Período *</Label>
            <Input
              required
              value={periodCode}
              onChange={(e) => setPeriodCode(e.target.value)}
              placeholder="NOM-202611-Q2"
              className="mt-1 rounded-xl text-xs font-mono font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha Inicio *</Label>
              <Input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 rounded-xl text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Fecha Fin *</Label>
              <Input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Frecuencia</Label>
            <select
              value={frequency}
              onChange={(e: any) => setFrequency(e.target.value)}
              className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
            >
              <option value="BIWEEKLY">Quincenal (15 días)</option>
              <option value="WEEKLY">Semanal (7 días)</option>
              <option value="MONTHLY">Mensual (30 días)</option>
            </select>
          </div>

          <div>
            <Label className="text-xs">Notas / Observaciones</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Segunda quincena regular"
              className="mt-1 rounded-xl text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
            >
              {loading ? 'Creando...' : 'Crear Período'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewAdvanceModal({
  slug,
  employees,
  currentRate,
  onClose,
  onSuccess,
}: {
  slug: string;
  employees: Employee[];
  currentRate: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
  const [amountPrimary, setAmountPrimary] = useState('50.00');
  const [installments, setInstallments] = useState(1);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/${slug}/payroll/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: employeeId,
          requested_amount_primary: parseFloat(amountPrimary) || 0,
          approved_amount_primary: parseFloat(amountPrimary) || 0,
          reason,
          installments_total: installments,
          exchange_rate_snapshot: currentRate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al emitir adelanto');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" />
            Emitir Adelanto de Sueldo
          </h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-sm">
          <div>
            <Label className="text-xs">Colaborador *</Label>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.id_document}) — Sueldo: ${emp.base_salary_primary}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Monto ($ USD) *</Label>
              <Input
                required
                type="number"
                step="0.01"
                value={amountPrimary}
                onChange={(e) => setAmountPrimary(e.target.value)}
                className="mt-1 rounded-xl text-xs font-mono font-semibold"
              />
            </div>
            <div>
              <Label className="text-xs">Cuotas de Amortización</Label>
              <Input
                required
                type="number"
                min="1"
                max="12"
                value={installments}
                onChange={(e) => setInstallments(parseInt(e.target.value, 10) || 1)}
                className="mt-1 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Motivo del Adelanto *</Label>
            <Input
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Emergencia médica familiar"
              className="mt-1 rounded-xl text-xs"
            />
          </div>

          <div className="p-3 bg-stone-50 dark:bg-zinc-900 rounded-xl text-xs text-stone-500 space-y-1">
            <div>Equivalente en moneda local: <strong className="font-mono text-stone-700 dark:text-zinc-300">{formatSecondary((parseFloat(amountPrimary) || 0) * currentRate)}</strong></div>
            <div>Cuota por período: <strong className="font-mono text-stone-700 dark:text-zinc-300">${((parseFloat(amountPrimary) || 0) / (installments || 1)).toFixed(2)}</strong></div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition"
            >
              {loading ? 'Emitiendo...' : 'Aprobar y Emitir'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ApproveRunModal({
  slug,
  run,
  defaultRate,
  onClose,
  onSuccess,
}: {
  slug: string;
  run: Run;
  defaultRate: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [exchangeRate, setExchangeRate] = useState(defaultRate.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      const rate = parseFloat(exchangeRate);
      if (!rate || rate <= 0) {
        throw new Error('Tasa de cambio inválida');
      }

      const res = await fetch(`/api/admin/${slug}/payroll/runs/${run.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange_rate: rate }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al aprobar corrida');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentRateNum = parseFloat(exchangeRate) || 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-600" />
            Aprobar Corrida y Congelar Tasa
          </h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <div className="space-y-3 text-sm">
          <p className="text-stone-600 dark:text-zinc-300 text-xs">
            Al aprobar la corrida, se congelará la tasa de cambio oficial de forma <strong>inmutable</strong> en cada recibo de pago y se calcularán automáticamente las retenciones de ley (IVSS 4% y FAOV 1%).
          </p>

          <div>
            <Label className="text-xs">Tasa BCV Snapshot (Bs./$)</Label>
            <Input
              type="number"
              step="0.0001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              className="mt-1 rounded-xl text-sm font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl space-y-1 text-xs">
            <div className="text-stone-600 dark:text-zinc-300">
              Monto Neto Primario: <strong className="font-mono">{formatPrimary(run.total_net_primary)}</strong>
            </div>
            <div className="text-blue-700 dark:text-blue-300 font-bold font-mono">
              Equivalente Neto: {formatSecondary(run.total_net_primary * currentRateNum)}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
            Cancelar
          </Button>
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
          >
            {loading ? 'Aprobando...' : 'Confirmar & Congelar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DisburseRunModal({
  slug,
  run,
  paymentAccounts,
  onClose,
  onSuccess,
}: {
  slug: string;
  run: Run;
  paymentAccounts: PaymentAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [accountId, setAccountId] = useState(paymentAccounts[0]?.id || '');
  const [method, setMethod] = useState<'TRANSFER' | 'PAGO_MOVIL' | 'ZELLE' | 'CASH' | 'BINANCE' | 'OTHER'>('TRANSFER');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDisburse = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!accountId) {
        throw new Error('Debe seleccionar una cuenta de tesorería para el egreso');
      }

      const res = await fetch(`/api/admin/${slug}/payroll/runs/${run.id}/disburse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          disbursement_method: method,
          reference: reference || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al liquidar corrida');
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Liquidar Nómina (Dispersión de Fondos)
          </h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
            {error}
          </div>
        )}

        <div className="space-y-3 text-sm">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl space-y-1 text-xs">
            <div>Total a Liquidar: <strong className="font-mono">{formatPrimary(run.total_net_primary)}</strong></div>
            <div>En Moneda Local: <strong className="font-mono">{formatSecondary(run.total_net_secondary)}</strong></div>
          </div>

          <div>
            <Label className="text-xs">Cuenta de Origen de Fondos (Tesorería) *</Label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
            >
              {paymentAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type}) {acc.is_default ? '— Predeterminada' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Método de Dispersión</Label>
              <select
                value={method}
                onChange={(e: any) => setMethod(e.target.value)}
                className="w-full mt-1 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs"
              >
                <option value="TRANSFER">Transferencia Bancaria</option>
                <option value="PAGO_MOVIL">Pago Móvil</option>
                <option value="ZELLE">Zelle</option>
                <option value="CASH">Efectivo de Caja</option>
                <option value="BINANCE">Binance USDT</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Nº Referencia Lote</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="REF-987654"
                className="mt-1 rounded-xl text-xs font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-zinc-800">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs">
            Cancelar
          </Button>
          <Button
            onClick={handleDisburse}
            disabled={loading}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
          >
            {loading ? 'Dispersando...' : 'Confirmar Pago'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PayslipModal({
  line,
  run,
  onClose,
}: {
  line: RunLine;
  run: Run;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  // Construir mensaje de WhatsApp
  const whatsappText = encodeURIComponent(
    `📄 *RECIBO DE PAGO — ${run.period_code}*\n` +
    `🔖 *Nº Recibo:* ${line.receipt_number || 'N/A'}\n` +
    `👤 *Colaborador:* ${line.first_name} ${line.last_name} (${line.id_document})\n` +
    `💼 *Cargo:* ${line.job_title}\n` +
    `📅 *Días laborados:* ${line.days_worked}\n` +
    `💵 *Sueldo Base:* $${line.base_salary_primary.toFixed(2)}\n` +
    (line.commissions_primary > 0 ? `📈 *Comisiones:* $${line.commissions_primary.toFixed(2)}\n` : '') +
    (line.deductions_primary > 0 ? `🔻 *Deducciones (Ley/Adelantos):* -$${line.deductions_primary.toFixed(2)}\n` : '') +
    `💰 *NETO A COBRAR:* $${line.net_salary_primary.toFixed(2)} (Bs. ${line.net_salary_secondary.toLocaleString('es-VE', { minimumFractionDigits: 2 })})\n` +
    `🏛️ *Tasa BCV Aplicada:* ${line.exchange_rate_snapshot.toFixed(4)} Bs/$\n\n` +
    `_Gracias por su valioso compromiso._`
  );

  const phoneClean = line.phone ? line.phone.replace(/[^0-9]/g, '') : '';
  const waUrl = phoneClean.length >= 10
    ? `https://wa.me/${phoneClean}?text=${whatsappText}`
    : `https://wa.me/?text=${whatsappText}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-zinc-800">
          <h3 className="font-bold text-lg text-stone-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-600" />
            Recibo Digital de Pago
          </h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ficha formal media carta printable */}
        <div id="printable-payslip" className="p-4 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/50 space-y-3 font-sans text-xs">
          <div className="flex justify-between border-b pb-2 border-stone-200 dark:border-zinc-800">
            <div>
              <div className="font-bold text-stone-900 dark:text-white text-sm">HOME DELUXE 2026</div>
              <div className="text-stone-400">Comprobante de Pago de Nómina</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-rose-600">{line.receipt_number || 'BORRADOR'}</div>
              <div className="font-mono text-stone-700 dark:text-zinc-300 font-semibold">{run.period_code}</div>
              <div className="text-stone-400">Corrida {run.run_number}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-stone-600 dark:text-zinc-300">
            <div>Colaborador: <strong>{line.first_name} {line.last_name}</strong></div>
            <div>Cédula: <strong className="font-mono">{line.id_document}</strong></div>
            <div>Cargo: <strong>{line.job_title}</strong></div>
            <div>Departamento: <strong>{line.department}</strong></div>
            <div>Días trabajados: <strong>{line.days_worked} días</strong></div>
            <div>Tasa BCV: <strong className="font-mono">{line.exchange_rate_snapshot.toFixed(4)} Bs/$</strong></div>
          </div>

          {/* Desglose de conceptos */}
          <div className="border-t border-b py-2 border-stone-200 dark:border-zinc-800 space-y-1">
            <div className="font-bold text-stone-700 dark:text-zinc-300 uppercase text-[10px] tracking-wider mb-1">
              Desglose de Liquidación
            </div>
            {line.concepts_breakdown && line.concepts_breakdown.map((c, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className={c.type === 'DEDUCTION' || c.type === 'RETENTION' ? 'text-rose-600' : 'text-stone-700 dark:text-zinc-300'}>
                  {c.name}
                </span>
                <span className="font-mono font-semibold">
                  {c.type === 'DEDUCTION' || c.type === 'RETENTION' ? '-' : '+'}
                  {formatPrimary(c.amount_primary)}
                  {c.amount_secondary ? ` (${formatSecondary(c.amount_secondary)})` : ''}
                </span>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="flex justify-between items-center pt-1 font-bold text-sm">
            <span className="text-stone-900 dark:text-white">NETO A COBRAR:</span>
            <div className="text-right">
              <div className="text-emerald-600 dark:text-emerald-400 text-base font-extrabold font-mono">
                {formatPrimary(line.net_salary_primary)}
              </div>
              <div className="text-xs text-stone-500 font-mono">
                {formatSecondary(line.net_salary_secondary)}
              </div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl text-xs">
            Cerrar
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="rounded-xl text-xs border-stone-300"
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              Imprimir
            </Button>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition"
            >
              <MessageCircle className="w-4 h-4 mr-1.5" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
