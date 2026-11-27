'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeftRight, Plus, Send, PackageCheck, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  variants: Array<{ id: string; name: string; sku: string | null }>;
}

interface TransferRow {
  id: string;
  transfer_number: string;
  origin_store_id: string;
  destination_store_id: string;
  origin_store_name: string;
  destination_store_name: string;
  status: 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    variant_name: string | null;
    quantity_dispatched: string | number;
    quantity_received: string | number | null;
  }>;
}

const STATUS_BADGE: Record<TransferRow['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Borrador', cls: 'bg-zinc-500/10 text-zinc-600' },
  DISPATCHED: { label: 'En Tránsito', cls: 'bg-amber-500/10 text-amber-600' },
  RECEIVED: { label: 'Recibido', cls: 'bg-emerald-500/10 text-emerald-600' },
  REJECTED: { label: 'Rechazado', cls: 'bg-rose-500/10 text-rose-600' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground' },
};

export default function TransfersAdminPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; variant_id: string; quantity: number }>>([
    { product_id: '', variant_id: '', quantity: 1 },
  ]);

  const loadData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/transfers`);
      const data = await res.json();
      if (data.success) {
        setStores(data.stores || []);
        setProducts(data.products || []);
        setTransfers(data.transfers || []);
        if (data.stores?.length >= 2 && !originId) {
          setOriginId(data.stores[0].id);
          setDestId(data.stores[1].id);
        }
      }
    } catch {
      toast.error('Error al cargar traslados');
    } finally {
      setLoading(false);
    }
  }, [slug, originId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAction = async (transferId: string, action: 'DISPATCH' | 'RECEIVE' | 'CANCEL') => {
    try {
      const res = await fetch(`/api/tenant/${slug}/transfers`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, transfer_id: transferId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'No se pudo procesar la acción');
        return;
      }
      toast.success(
        action === 'DISPATCH'
          ? 'Mercancía despachada (descontada de origen)'
          : action === 'RECEIVE'
            ? 'Mercancía recibida (sumada en destino)'
            : 'Traslado cancelado'
      );
      loadData();
    } catch {
      toast.error('Error de conexión');
    }
  };

  const handleCreate = async (autoDispatch: boolean) => {
    const validItems = items.filter((i) => i.product_id && i.quantity > 0);
    if (!originId || !destId || originId === destId) {
      toast.error('Selecciona sedes de origen y destino distintas');
      return;
    }
    if (validItems.length === 0) {
      toast.error('Agrega al menos un producto válido');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin_store_id: originId,
          destination_store_id: destId,
          notes: notes || null,
          auto_dispatch: autoDispatch,
          items: validItems.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id || null,
            quantity: Number(i.quantity),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al crear traslado');
        return;
      }
      toast.success(autoDispatch ? 'Traslado despachado' : 'Borrador de traslado creado');
      setModalOpen(false);
      setNotes('');
      setItems([{ product_id: '', variant_id: '', quantity: 1 }]);
      loadData();
    } catch {
      toast.error('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-primary" />
            Traslados entre Almacenes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Guías de despacho y recepción atómica de inventario entre sucursales.
          </p>
        </div>

        <Button
          onClick={() => setModalOpen(true)}
          disabled={stores.length < 2}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {stores.length < 2 ? 'Requiere 2+ sucursales' : 'Nuevo Traslado'}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : transfers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No hay traslados de mercancía registrados aún.
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map((tr) => {
            const badge = STATUS_BADGE[tr.status];
            return (
              <div key={tr.id} className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-sm">{tr.transfer_number}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    {tr.origin_store_name} → {tr.destination_store_name}
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  {tr.items.map((it) => (
                    <div key={it.id} className="flex justify-between border-b border-border/40 py-1 last:border-0">
                      <span>
                        {it.product_name} {it.variant_name ? `(${it.variant_name})` : ''}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        {Number(it.quantity_dispatched)} und
                        {it.quantity_received !== null && ` (Recibido: ${Number(it.quantity_received)})`}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {tr.status === 'DRAFT' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleAction(tr.id, 'CANCEL')}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => handleAction(tr.id, 'DISPATCH')} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Despachar
                      </Button>
                    </>
                  )}
                  {tr.status === 'DISPATCHED' && (
                    <Button size="sm" onClick={() => handleAction(tr.id, 'RECEIVE')} className="gap-1.5">
                      <PackageCheck className="h-3.5 w-3.5" /> Confirmar Recepción
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background border rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nueva Guía de Traslado</h2>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Sede Origen</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={originId}
                  onChange={(e) => setOriginId(e.target.value)}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Sede Destino</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={destId}
                  onChange={(e) => setDestId(e.target.value)}
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Productos a trasladar</label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setItems([...items, { product_id: '', variant_id: '', quantity: 1 }])}
                >
                  + Agregar ítem
                </Button>
              </div>
              {items.map((it, idx) => {
                const prod = products.find((p) => p.id === it.product_id);
                return (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      className="flex-1 h-9 rounded-md border bg-background px-2 text-sm"
                      value={it.product_id}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], product_id: e.target.value, variant_id: '' };
                        setItems(next);
                      }}
                    >
                      <option value="">Seleccionar producto...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    {prod && prod.variants.length > 0 && (
                      <select
                        className="w-32 h-9 rounded-md border bg-background px-2 text-sm"
                        value={it.variant_id}
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = { ...next[idx], variant_id: e.target.value };
                          setItems(next);
                        }}
                      >
                        <option value="">Base</option>
                        {prod.variants.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    )}

                    <Input
                      type="number"
                      min={0.001}
                      step="any"
                      className="w-20"
                      value={it.quantity}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], quantity: Number(e.target.value) };
                        setItems(next);
                      }}
                    />

                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems(items.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <label className="text-xs font-medium">Notas (Opcional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo del traslado..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" disabled={submitting} onClick={() => handleCreate(false)}>
                Guardar Borrador
              </Button>
              <Button type="button" disabled={submitting} onClick={() => handleCreate(true)}>
                {submitting ? 'Procesando...' : 'Despachar Ahora'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
