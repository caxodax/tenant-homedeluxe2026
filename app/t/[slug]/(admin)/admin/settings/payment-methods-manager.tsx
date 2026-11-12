'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Loader2,
  FileImage,
  Hash,
  Store,
  Monitor,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentFieldDetail, TenantPaymentMethod } from '@/lib/payment-methods';

interface EditingState {
  isNew: boolean;
  code: string;
  name: string;
  is_active: boolean;
  requires_reference: boolean;
  requires_proof: boolean;
  available_in_storefront: boolean;
  available_in_pos: boolean;
  instructions: string;
  details: PaymentFieldDetail[];
}

export function PaymentMethodsManager({ slug }: { slug: string }) {
  const [methods, setMethods] = useState<TenantPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);

  useEffect(() => {
    loadMethods();
  }, [slug]);

  async function loadMethods() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/${slug}/payment-methods`);
      if (res.ok) {
        const data = await res.json();
        setMethods(data.methods || []);
      }
    } catch {
      toast.error('Error al cargar métodos de pago');
    } finally {
      setLoading(false);
    }
  }

  function startNewMethod() {
    setEditing({
      isNew: true,
      code: '',
      name: '',
      is_active: true,
      requires_reference: true,
      requires_proof: true,
      available_in_storefront: true,
      available_in_pos: true,
      instructions: '',
      details: [
        { label: 'Banco / Plataforma', value: '' },
        { label: 'Titular', value: '' },
        { label: 'Cuenta / Correo / ID', value: '' },
      ],
    });
  }

  function startEditMethod(method: TenantPaymentMethod) {
    setEditing({
      isNew: false,
      code: method.code,
      name: method.name,
      is_active: method.is_active,
      requires_reference: method.requires_reference,
      requires_proof: method.requires_proof,
      available_in_storefront: method.available_in_storefront,
      available_in_pos: method.available_in_pos,
      instructions: method.instructions || '',
      details:
        method.details && method.details.length > 0
          ? method.details.map((d) => ({ ...d }))
          : [{ label: 'Banco / Plataforma', value: '' }, { label: 'Titular / Cuenta', value: '' }],
    });
  }

  async function handleToggleActive(method: TenantPaymentMethod) {
    try {
      const res = await fetch(`/api/admin/${slug}/payment-methods`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: method.code,
          is_active: !method.is_active,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMethods(data.methods || []);
        toast.success(`${method.name} ${!method.is_active ? 'activado' : 'desactivado'}`);
      } else {
        toast.error(data.error || 'No se pudo actualizar');
      }
    } catch {
      toast.error('Error de conexión');
    }
  }

  async function handleDelete(method: TenantPaymentMethod) {
    if (!confirm(`¿Eliminar el método personalizado "${method.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/${slug}/payment-methods?code=${encodeURIComponent(method.code)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setMethods(data.methods || []);
        toast.success('Método de pago eliminado');
      } else {
        toast.error(data.error || 'No se pudo eliminar');
      }
    } catch {
      toast.error('Error de conexión');
    }
  }

  async function handleSaveEditing() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error('El nombre del método es obligatorio');
      return;
    }

    const derivedCode = editing.isNew
      ? (editing.code.trim() || editing.name.trim())
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
      : editing.code;

    if (derivedCode.length < 2) {
      toast.error('El código debe tener al menos 2 caracteres');
      return;
    }

    const cleanDetails = editing.details.filter((d) => d.label.trim() && d.value.trim());

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/${slug}/payment-methods`, {
        method: editing.isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: derivedCode,
          name: editing.name.trim(),
          currency: 'USD',
          is_active: editing.is_active,
          requires_reference: editing.requires_reference,
          requires_proof: editing.requires_proof,
          available_in_storefront: editing.available_in_storefront,
          available_in_pos: editing.available_in_pos,
          instructions: editing.instructions.trim(),
          details: cleanDetails,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMethods(data.methods || []);
        setEditing(null);
        toast.success(
          editing.isNew
            ? 'Nuevo método de pago creado y disponible en Checkout'
            : 'Datos e instrucciones del método actualizados'
        );
      } else {
        toast.error(data.error || 'Error al guardar método de pago');
      }
    } catch {
      toast.error('Error de red al guardar método');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800">
        <CardContent className="p-8 flex items-center justify-center gap-2 text-sm text-slate-700 dark:text-zinc-300">
          <Loader2 className="w-4 h-4 animate-spin text-lime-600 dark:text-lime-400" />
          <span>Cargando métodos de pago del comercio...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-extrabold uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              Métodos de Pago del Comercio (Core USD)
            </CardTitle>
            <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
              Configura las cuentas receptoras, datos de transferencia y reglas de comprobante que verá el cliente en el checkout.
            </p>
          </div>
          <Button
            type="button"
            onClick={startNewMethod}
            className="bg-lime-500 hover:bg-lime-600 text-black font-extrabold text-sm h-10 px-4 rounded-xl cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nuevo Método USD
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {methods.map((method) => {
            const isLocalCurrencyPlaceholder = method.code === 'CASH_LOCAL';
            return (
              <div
                key={method.code}
                className={`p-4 rounded-2xl border transition-all ${
                  method.is_active
                    ? 'bg-slate-50/70 dark:bg-zinc-900/50 border-slate-300 dark:border-zinc-800'
                    : 'bg-slate-100/50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-900 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-extrabold text-slate-950 dark:text-white">
                        {method.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold tenant-secondary-badge border">
                        {method.code} · {method.currency}
                      </span>
                      {method.is_active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 text-xs font-bold">
                          Activo
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 border-slate-300 dark:border-zinc-700 text-xs font-bold">
                          Inactivo
                        </Badge>
                      )}
                      {isLocalCurrencyPlaceholder && (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          (Requiere plugin de localización para tasas locales)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 font-medium">
                      {method.available_in_storefront && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                          <Store className="w-3 h-3 text-lime-600 dark:text-lime-400" />
                          Vitrina Online
                        </span>
                      )}
                      {method.available_in_pos && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                          <Monitor className="w-3 h-3 text-lime-600 dark:text-lime-400" />
                          Terminal POS
                        </span>
                      )}
                      {method.requires_reference && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
                          <Hash className="w-3 h-3" />
                          Exige Referencia
                        </span>
                      )}
                      {method.requires_proof && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-500/20">
                          <FileImage className="w-3 h-3" />
                          Exige Comprobante
                        </span>
                      )}
                    </div>

                    {method.details.length > 0 && (
                      <div className="pt-1.5 flex flex-wrap gap-2">
                        {method.details.map((d, i) => (
                          <div
                            key={i}
                            className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200"
                          >
                            <span className="font-bold">{d.label}:</span>{' '}
                            <span className="font-mono">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {method.instructions && (
                      <p className="text-xs text-slate-700 dark:text-zinc-400 pt-0.5">
                        {method.instructions}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEditMethod(method)}
                      className="text-xs font-bold h-9 px-3 rounded-xl cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                      Configurar Datos
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(method)}
                      className="text-xs font-bold h-9 px-3 rounded-xl cursor-pointer"
                    >
                      {method.is_active ? (
                        <>
                          <XCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                          Desactivar
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Activar
                        </>
                      )}
                    </Button>
                    {!method.is_system_default && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(method)}
                        className="h-9 px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 rounded-xl cursor-pointer"
                        title="Eliminar método"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Formulario / Editor Modal Inline */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div>
                <h3 className="text-lg font-extrabold text-slate-950 dark:text-white">
                  {editing.isNew ? 'Nuevo Método de Pago (USD)' : `Configurar: ${editing.name}`}
                </h3>
                <p className="text-xs text-slate-700 dark:text-zinc-400">
                  Define los datos bancarios o de cuenta que verá el comprador en el checkout.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Nombre Visible *
                </Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ej. Zelle, Transferencia USD, Binance Pay"
                  className="text-sm h-10 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Código Interno {editing.isNew ? '(Auto o manual)' : '(Fijo)'}
                </Label>
                <Input
                  disabled={!editing.isNew}
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  placeholder="Ej. ZELLE o BINANCE_PAY"
                  className="text-sm h-10 font-mono uppercase bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800"
                />
              </div>
            </div>

            {/* Opciones de flujo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { key: 'available_in_storefront', label: 'Vitrina Online' },
                { key: 'available_in_pos', label: 'Terminal POS' },
                { key: 'requires_reference', label: 'Exigir Referencia' },
                { key: 'requires_proof', label: 'Exigir Comprobante' },
              ].map((opt) => {
                const checked = editing[opt.key as keyof EditingState] as boolean;
                return (
                  <label
                    key={opt.key}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                      checked
                        ? 'bg-lime-500/15 border-lime-500 text-slate-950 dark:text-white'
                        : 'bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setEditing({ ...editing, [opt.key]: e.target.checked })
                      }
                      className="rounded accent-red-600 w-4 h-4"
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>

            {/* Datos de la cuenta / receptor */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Datos de Cuenta / Recepción (Visible al Cliente)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      details: [...editing.details, { label: '', value: '' }],
                    })
                  }
                  className="text-xs font-bold h-8 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agregar Campo
                </Button>
              </div>

              <div className="space-y-2">
                {editing.details.map((detail, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={detail.label}
                      onChange={(e) => {
                        const next = [...editing.details];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setEditing({ ...editing, details: next });
                      }}
                      placeholder="Etiqueta (Ej. Banco, Titular, Correo)"
                      className="flex-1 text-sm h-9 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800"
                    />
                    <Input
                      value={detail.value}
                      onChange={(e) => {
                        const next = [...editing.details];
                        next[idx] = { ...next[idx], value: e.target.value };
                        setEditing({ ...editing, details: next });
                      }}
                      placeholder="Dato (Ej. pagos@micomercio.com)"
                      className="flex-1 text-sm font-mono h-9 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = editing.details.filter((_, i) => i !== idx);
                        setEditing({ ...editing, details: next });
                      }}
                      className="p-2 text-rose-600 hover:bg-rose-500/10 rounded-lg cursor-pointer"
                      title="Quitar fila"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                Instrucciones para el Cliente
              </Label>
              <Textarea
                rows={2}
                value={editing.instructions}
                onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                placeholder="Ej. Envía el pago exacto en USD y adjunta el capture junto al número de confirmación."
                className="text-sm bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                className="rounded-xl text-sm font-bold cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={handleSaveEditing}
                className="bg-lime-500 hover:bg-lime-600 text-black font-extrabold text-sm rounded-xl px-5 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1.5" />
                    Guardar Método
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
