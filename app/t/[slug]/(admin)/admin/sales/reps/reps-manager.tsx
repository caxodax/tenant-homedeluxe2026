'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Briefcase, 
  Percent, 
  Target, 
  MapPin, 
  Shield, 
  Edit3, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Plus,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ModalPortal } from '@/components/ui/modal-portal';
import { toast } from 'sonner';

export interface SalesRepItem {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  staff_is_active: boolean;
  staff_created_at: string;
  zone_or_route: string | null;
  monthly_target_primary: string | number | null;
  default_commission_percent: string | number | null;
  commission_notes: string | null;
  can_create_quotes: boolean;
  can_convert_to_order: boolean;
  can_edit_own_quotes: boolean;
  can_edit_others_quotes: boolean;
  can_view_all_reports: boolean;
  can_adjust_prices: boolean;
  max_discount_pct: string | number;
  rep_is_active: boolean;
}

export function SalesRepsManager({
  slug,
  initialReps,
  isPluginActive,
  currentUserRole,
}: {
  slug: string;
  initialReps: SalesRepItem[];
  isPluginActive: boolean;
  currentUserRole: string;
}) {
  const [reps, setReps] = useState<SalesRepItem[]>(initialReps);
  const [editingRep, setEditingRep] = useState<SalesRepItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [zone, setZone] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState('0');
  const [commissionPct, setCommissionPct] = useState('0');
  const [maxDiscountPct, setMaxDiscountPct] = useState('0');
  const [notes, setNotes] = useState('');
  const [canCreateQuotes, setCanCreateQuotes] = useState(true);
  const [canConvertToOrder, setCanConvertToOrder] = useState(true);
  const [canEditOwnQuotes, setCanEditOwnQuotes] = useState(true);
  const [canEditOthersQuotes, setCanEditOthersQuotes] = useState(false);
  const [canViewAllReports, setCanViewAllReports] = useState(false);
  const [canAdjustPrices, setCanAdjustPrices] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const openEditModal = (rep: SalesRepItem) => {
    setEditingRep(rep);
    setZone(rep.zone_or_route || '');
    setMonthlyTarget(String(rep.monthly_target_primary || '0'));
    setCommissionPct(String(rep.default_commission_percent || '0'));
    setMaxDiscountPct(String(rep.max_discount_pct || '0'));
    setNotes(rep.commission_notes || '');
    setCanCreateQuotes(rep.can_create_quotes);
    setCanConvertToOrder(rep.can_convert_to_order);
    setCanEditOwnQuotes(rep.can_edit_own_quotes);
    setCanEditOthersQuotes(rep.can_edit_others_quotes);
    setCanViewAllReports(rep.can_view_all_reports);
    setCanAdjustPrices(rep.can_adjust_prices);
    setIsActive(rep.rep_is_active);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRep) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${slug}/sales/reps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: editingRep.id,
          zone_or_route: zone,
          monthly_target_primary: parseFloat(monthlyTarget) || 0,
          default_commission_percent: parseFloat(commissionPct) || 0,
          max_discount_pct: parseFloat(maxDiscountPct) || 0,
          commission_notes: notes,
          can_create_quotes: canCreateQuotes,
          can_convert_to_order: canConvertToOrder,
          can_edit_own_quotes: canEditOwnQuotes,
          can_edit_others_quotes: canEditOthersQuotes,
          can_view_all_reports: canViewAllReports,
          can_adjust_prices: canAdjustPrices,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');

      toast.success(`Perfil de ${editingRep.full_name} actualizado`);
      setReps((prev) =>
        prev.map((r) =>
          r.id === editingRep.id
            ? {
                ...r,
                zone_or_route: zone || null,
                monthly_target_primary: parseFloat(monthlyTarget) || 0,
                default_commission_percent: parseFloat(commissionPct) || 0,
                max_discount_pct: parseFloat(maxDiscountPct) || 0,
                commission_notes: notes || null,
                can_create_quotes: canCreateQuotes,
                can_convert_to_order: canConvertToOrder,
                can_edit_own_quotes: canEditOwnQuotes,
                can_edit_others_quotes: canEditOthersQuotes,
                can_view_all_reports: canViewAllReports,
                can_adjust_prices: canAdjustPrices,
                rep_is_active: isActive,
              }
            : r
        )
      );
      setEditingRep(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar perfil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-950 dark:text-white tracking-tight">
            Fuerza de Ventas & Comisiones
          </h1>
          <p className="text-sm text-stone-600 dark:text-zinc-400 mt-1">
            Asigna metas, tasas de comisión y permisos de cotización para cada asesor comercial.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link href={`/t/${slug}/admin/staff`}>
            <Button variant="outline" className="text-xs font-semibold">
              <Users className="w-4 h-4 mr-1.5" />
              Gestionar Usuarios
            </Button>
          </Link>
          <Link href={`/t/${slug}/admin/sales/quotes/new`}>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              Nueva Cotización
            </Button>
          </Link>
        </div>
      </div>

      {!isPluginActive && (
        <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 flex items-start justify-between gap-3 text-amber-900 dark:text-amber-200 text-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">El módulo Vendedores y Comisiones no está activo</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                Para que los vendedores puedan generar cotizaciones y registrar comisiones, activa el plugin desde la configuración.
              </p>
            </div>
          </div>
          <Link href={`/t/${slug}/admin/settings?tab=plugins`}>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0">
              Activar Plugin
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* Grid de Vendedores */}
      {reps.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-stone-300 dark:border-zinc-800 bg-white dark:bg-[#141416]">
          <Briefcase className="w-10 h-10 text-stone-400 mx-auto mb-3" />
          <h3 className="font-bold text-stone-900 dark:text-white text-base">No hay vendedores registrados</h3>
          <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto mt-1 mb-4">
            Para agregar vendedores, crea un usuario con el rol <strong>Vendedor / Asesor</strong> desde la sección de Equipo & Roles.
          </p>
          <Link href={`/t/${slug}/admin/staff`}>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              Crear Usuario Vendedor
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reps.map((rep) => {
            const comm = parseFloat(String(rep.default_commission_percent || 0));
            const target = parseFloat(String(rep.monthly_target_primary || 0));
            const maxDisc = parseFloat(String(rep.max_discount_pct || 0));

            return (
              <div
                key={rep.id}
                className="p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] flex flex-col justify-between shadow-xs hover:border-emerald-500/50 transition-all"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-stone-950 dark:text-white text-base leading-tight">
                        {rep.full_name}
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5 truncate">
                        {rep.email}
                      </p>
                      {rep.phone && (
                        <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                          📞 {rep.phone}
                        </p>
                      )}
                    </div>
                    <Badge variant={rep.rep_is_active && rep.staff_is_active ? 'default' : 'neutral'} className="text-[10px]">
                      {rep.rep_is_active && rep.staff_is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>

                  {/* Badges de Zona y Comisión */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 dark:border-zinc-800/60 text-xs">
                    <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-zinc-900/50">
                      <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-semibold uppercase flex items-center gap-1">
                        <Percent className="w-3 h-3 text-emerald-600" /> Comisión
                      </span>
                      <p className="font-mono font-black text-stone-900 dark:text-white text-sm mt-0.5">
                        {comm > 0 ? `${comm}%` : 'Sin comisión'}
                      </p>
                    </div>

                    <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-zinc-900/50">
                      <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-semibold uppercase flex items-center gap-1">
                        <Target className="w-3 h-3 text-blue-600" /> Meta Mensual
                      </span>
                      <p className="font-mono font-black text-stone-900 dark:text-white text-sm mt-0.5">
                        {target > 0 ? `$${target.toFixed(2)}` : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {rep.zone_or_route && (
                    <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-zinc-400">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="font-medium truncate">Ruta/Zona: {rep.zone_or_route}</span>
                    </div>
                  )}

                  {/* Resumen de Permisos */}
                  <div className="pt-2 border-t border-stone-100 dark:border-zinc-800/60">
                    <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-bold uppercase tracking-wider block mb-1.5">
                      Permisos Operativos
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={`text-[10px] ${rep.can_create_quotes ? 'text-emerald-700 border-emerald-300 dark:text-emerald-400' : 'text-stone-400'}`}>
                        {rep.can_create_quotes ? '✓ Cotizar' : '✗ Sin cotizar'}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${rep.can_convert_to_order ? 'text-emerald-700 border-emerald-300 dark:text-emerald-400' : 'text-stone-400'}`}>
                        {rep.can_convert_to_order ? '✓ Convertir POS' : '✗ Sin convertir'}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${rep.can_adjust_prices ? 'text-amber-700 border-amber-300 dark:text-amber-400' : 'text-stone-400'}`}>
                        {rep.can_adjust_prices ? '✓ Ajustar precios' : '✗ Precios fijos'}
                      </Badge>
                      {maxDisc > 0 && (
                        <Badge variant="outline" className="text-[10px] text-purple-700 border-purple-300 dark:text-purple-400">
                          Max desc: {maxDisc}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 dark:border-zinc-800/60 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(rep)}
                    className="text-xs font-bold"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5 text-stone-600 dark:text-zinc-400" />
                    Editar Perfil & Permisos
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Editar Perfil y Permisos */}
      {editingRep && (
        <ModalPortal isOpen={Boolean(editingRep)} onClose={() => setEditingRep(null)}>
          <div className="bg-white dark:bg-[#141416] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in-50 zoom-in-95 my-auto">
              <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-3">
                <div>
                  <h2 className="font-extrabold text-stone-950 dark:text-white text-lg">
                    Perfil de Vendedor: {editingRep.full_name}
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                    {editingRep.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingRep(null)}
                  className="p-1 rounded-full text-stone-400 hover:text-stone-700 dark:hover:text-white transition"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="rep-commission" className="text-xs font-semibold">
                      Comisión por Venta (%)
                    </Label>
                    <Input
                      id="rep-commission"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={commissionPct}
                      onChange={(e) => setCommissionPct(e.target.value)}
                      className="mt-1 font-mono font-bold text-sm"
                      placeholder="0.0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rep-target" className="text-xs font-semibold">
                      Meta Mensual
                    </Label>
                    <Input
                      id="rep-target"
                      type="number"
                      step="1"
                      min="0"
                      value={monthlyTarget}
                      onChange={(e) => setMonthlyTarget(e.target.value)}
                      className="mt-1 font-mono font-bold text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="rep-zone" className="text-xs font-semibold">
                      Zona o Ruta Asignada
                    </Label>
                    <Input
                      id="rep-zone"
                      type="text"
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                      className="mt-1 text-xs"
                      placeholder="Ej. Centro / Mayoristas"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rep-max-disc" className="text-xs font-semibold">
                      Descuento Máximo Permitido (%)
                    </Label>
                    <Input
                      id="rep-max-disc"
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={maxDiscountPct}
                      onChange={(e) => setMaxDiscountPct(e.target.value)}
                      className="mt-1 font-mono font-bold text-sm"
                      placeholder="0.0"
                    />
                  </div>
                </div>

                {/* Toggles de Permisos */}
                <div className="pt-3 border-t border-stone-100 dark:border-zinc-800 space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase text-stone-700 dark:text-zinc-300 tracking-wider">
                    Permisos de Cotización y Venta
                  </h4>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canCreateQuotes}
                      onChange={(e) => setCanCreateQuotes(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Crear nuevas cotizaciones / preórdenes</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canConvertToOrder}
                      onChange={(e) => setCanConvertToOrder(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Convertir cotización en pedido facturado (POS)</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canEditOwnQuotes}
                      onChange={(e) => setCanEditOwnQuotes(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Modificar sus propias cotizaciones en DRAFT/SENT</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canEditOthersQuotes}
                      onChange={(e) => setCanEditOthersQuotes(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Editar cotizaciones de otros vendedores</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canAdjustPrices}
                      onChange={(e) => setCanAdjustPrices(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Alterar precios unitarios del catálogo en cotizaciones</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canViewAllReports}
                      onChange={(e) => setCanViewAllReports(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span>Ver reportes globales de todo el equipo</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-stone-800 dark:text-zinc-200 cursor-pointer pt-1 border-t border-stone-100 dark:border-zinc-800">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <span className="font-bold">Vendedor habilitado para recibir comisiones</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100 dark:border-zinc-800">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingRep(null)}
                    disabled={saving}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                  >
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </Button>
                </div>
              </form>
            </div>
        </ModalPortal>
      )}
    </div>
  );
}
