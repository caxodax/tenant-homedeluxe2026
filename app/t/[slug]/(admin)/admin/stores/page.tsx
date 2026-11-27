'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Store, Plus, CheckCircle2, MapPin, Phone, Star, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface StoreRow {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string | null;
  whatsapp_number: string | null;
  tax_id: string | null;
  is_default: boolean;
  is_active: boolean;
}

export default function StoresAdminPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [maxStores, setMaxStores] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StoreRow | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    whatsapp_number: '',
    tax_id: '',
  });

  const loadStores = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/stores`);
      const data = await res.json();
      if (data.success) {
        setStores(data.stores || []);
        setMaxStores(data.max_stores ?? 1);
      }
    } catch {
      toast.error('Error al cargar sucursales');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const activeCount = stores.filter((s) => s.is_active).length;
  const quotaReached = activeCount >= maxStores;

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', address: '', phone: '', whatsapp_number: '', tax_id: '' });
    setModalOpen(true);
  };

  const openEdit = (s: StoreRow) => {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code,
      address: s.address,
      phone: s.phone || '',
      whatsapp_number: s.whatsapp_number || '',
      tax_id: s.tax_id || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/stores`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al guardar sucursal');
        return;
      }
      toast.success(editing ? 'Sucursal actualizada' : 'Sucursal creada con su caja POS');
      setModalOpen(false);
      loadStores();
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (store: StoreRow) => {
    try {
      const res = await fetch(`/api/tenant/${slug}/stores`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: store.id, is_default: true }),
      });
      if (!res.ok) {
        toast.error('No se pudo cambiar sede principal');
        return;
      }
      toast.success(`${store.name} marcada como sede principal`);
      loadStores();
    } catch {
      toast.error('Error de conexión');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-6 w-6 text-primary" />
            Red de Tiendas y Sucursales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sedes activas: <span className="font-semibold text-foreground">{activeCount}</span> de{' '}
            <span className="font-semibold text-foreground">{maxStores}</span> permitidas por tu plan.
          </p>
        </div>

        <Button onClick={openCreate} disabled={quotaReached} className="gap-2">
          <Plus className="h-4 w-4" />
          {quotaReached ? 'Límite de plan alcanzado' : 'Nueva Sucursal'}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border bg-card p-5 flex flex-col justify-between gap-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono text-muted-foreground">{s.code}</span>
                    <h3 className="font-semibold text-lg leading-tight">{s.name}</h3>
                  </div>
                  {s.is_default ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Principal
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {s.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  )}
                </div>

                <div className="text-sm text-muted-foreground space-y-1 pt-1">
                  <p className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{s.address}</span>
                  </p>
                  {s.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{s.phone}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(s)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                {!s.is_default && s.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(s)} className="gap-1.5 text-xs">
                    <Star className="h-3.5 w-3.5" /> Hacer Principal
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background border rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? 'Editar Sucursal' : 'Registrar Nueva Sucursal'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium">Nombre de la Sede *</label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Sede Chacao"
                />
              </div>

              {!editing && (
                <div>
                  <label className="text-xs font-medium">Código Único *</label>
                  <Input
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="Ej. SUC-02"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium">Dirección Física *</label>
                <Input
                  required
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Av. Principal..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Teléfono</label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+58..."
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">WhatsApp Pedidos</label>
                  <Input
                    value={form.whatsapp_number}
                    onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                    placeholder="+58..."
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium">RIF / Tax ID (Opcional)</label>
                <Input
                  value={form.tax_id}
                  onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                  placeholder="J-..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Sucursal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
