'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  FileText, 
  User, 
  Phone, 
  Mail, 
  CreditCard, 
  Plus, 
  Trash2, 
  Search, 
  Calendar, 
  Tag, 
  Sparkles, 
  ArrowLeft, 
  Check, 
  AlertCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  price_primary: string | number;
  current_stock: string | number;
  image_url: string | null;
}

interface QuoteItemLine {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price_primary: number;
  notes: string;
}

export function QuoteBuilder({
  slug,
  currentUser,
  repProfile,
  salesReps,
  products,
  primaryCurrency,
  secondaryCurrency,
  exchangeRate,
  initialQuote = null,
  initialItems = [],
}: {
  slug: string;
  currentUser: { id: string; role: string; full_name: string };
  repProfile: {
    can_adjust_prices?: boolean;
    max_discount_pct?: number | string;
    can_create_quotes?: boolean;
  } | null;
  salesReps: Array<{ id: string; full_name: string; role: string }>;
  products: ProductOption[];
  primaryCurrency: string;
  secondaryCurrency: string;
  exchangeRate: number;
  initialQuote?: {
    id: string;
    quote_number: string;
    sales_rep_id?: string | null;
    customer_name?: string | null;
    customer_whatsapp?: string | null;
    customer_id_number?: string | null;
    customer_email?: string | null;
    additional_services_primary?: string | number | null;
    additional_services_note?: string | null;
    discount_primary?: string | number | null;
    customer_notes?: string | null;
    internal_notes?: string | null;
    expires_at?: string | null;
  } | null;
  initialItems?: Array<{
    product_id: string;
    product_name: string;
    quantity: number | string;
    unit_price_primary: number | string;
    notes?: string | null;
  }>;
}) {
  const router = useRouter();

  // Cliente
  const [customerName, setCustomerName] = useState(initialQuote?.customer_name || '');
  const [customerPhone, setCustomerPhone] = useState(initialQuote?.customer_whatsapp || '');
  const [customerIdNum, setCustomerIdNum] = useState(initialQuote?.customer_id_number || '');
  const [customerEmail, setCustomerEmail] = useState(initialQuote?.customer_email || '');

  const isUuid = (val?: string | null) =>
    Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

  // Vendedor asignado (Blindado para que nunca tome 'super_admin' como UUID)
  const [salesRepId, setSalesRepId] = useState(() => {
    if (initialQuote?.sales_rep_id && isUuid(initialQuote.sales_rep_id)) {
      return initialQuote.sales_rep_id;
    }
    if (currentUser.role === 'SALES_REP' && isUuid(currentUser.id)) {
      return currentUser.id;
    }
    const firstValidRep = salesReps.find((r) => isUuid(r.id));
    return firstValidRep?.id || (isUuid(currentUser.id) ? currentUser.id : '');
  });

  // Renglones
  const [items, setItems] = useState<QuoteItemLine[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems.map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: parseFloat(String(it.quantity)) || 1,
        unit_price_primary: parseFloat(String(it.unit_price_primary)) || 0,
        notes: it.notes || '',
      }));
    }
    return [];
  });
  const [searchProd, setSearchProd] = useState('');

  // Servicios adicionales
  const [additionalServices, setAdditionalServices] = useState(
    initialQuote?.additional_services_primary ? String(initialQuote.additional_services_primary) : '0'
  );
  const [additionalNote, setAdditionalNote] = useState(initialQuote?.additional_services_note || '');

  // Descuento y Notas
  const [discountAmount, setDiscountAmount] = useState(
    initialQuote?.discount_primary ? String(initialQuote.discount_primary) : '0'
  );
  const [validityDays, setValidityDays] = useState('7');
  const [customerNotes, setCustomerNotes] = useState(initialQuote?.customer_notes || '');
  const [internalNotes, setInternalNotes] = useState(initialQuote?.internal_notes || '');

  const [saving, setSaving] = useState(false);

  const canAdjustPrices = currentUser.role !== 'SALES_REP' || Boolean(repProfile?.can_adjust_prices);
  const maxDiscountPct = currentUser.role !== 'SALES_REP' ? 100 : Number(repProfile?.max_discount_pct || 0);

  // Filtro de productos para agregar
  const filteredProducts = useMemo(() => {
    if (!searchProd.trim()) return [];
    const q = searchProd.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [products, searchProd]);

  const handleAddProduct = (prod: ProductOption) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.product_id === prod.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].quantity += 1;
        return copy;
      }
      return [
        ...prev,
        {
          product_id: prod.id,
          product_name: prod.name,
          quantity: 1,
          unit_price_primary: parseFloat(String(prod.price_primary)) || 0,
          notes: '',
        },
      ];
    });
    setSearchProd('');
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    setItems((prev) => {
      const copy = [...prev];
      copy[index].quantity = newQty;
      return copy;
    });
  };

  const handleUpdateItemNotes = (index: number, note: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index].notes = note;
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Cálculos en vivo
  const itemsSubtotal = useMemo(() => {
    return items.reduce((acc, i) => acc + i.quantity * i.unit_price_primary, 0);
  }, [items]);

  const additionalNum = parseFloat(additionalServices) || 0;
  const subtotal = itemsSubtotal + additionalNum;
  const discountNum = parseFloat(discountAmount) || 0;
  const total = Math.max(0, subtotal - discountNum);
  const totalSecondary = exchangeRate > 0 ? (total * exchangeRate).toFixed(2) : null;

  const currentDiscountPct = subtotal > 0 ? (discountNum / subtotal) * 100 : 0;
  const discountExceeded = currentDiscountPct > (maxDiscountPct + 0.01);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toast.error('El nombre del cliente es obligatorio');
      return;
    }
    if (customerPhone.trim().length < 7) {
      toast.error('El WhatsApp del cliente es obligatorio (mínimo 7 dígitos)');
      return;
    }
    if (items.length === 0 && additionalNum <= 0) {
      toast.error('Debes agregar al menos un producto o servicio adicional');
      return;
    }
    if (discountExceeded) {
      toast.error(`El descuento supera tu límite máximo permitido (${maxDiscountPct}%)`);
      return;
    }

    setSaving(true);
    try {
      const days = parseInt(validityDays, 10);
      const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;

      const res = await fetch(`/api/admin/${slug}/sales/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initialQuote?.id || null,
          sales_rep_id: isUuid(salesRepId) ? salesRepId : null,
          customer_name: customerName,
          customer_whatsapp: customerPhone,
          customer_id_number: customerIdNum,
          customer_email: customerEmail,
          additional_services_primary: additionalNum,
          additional_services_note: additionalNote,
          discount_primary: discountNum,
          internal_notes: internalNotes,
          customer_notes: customerNotes,
          expires_at: expiresAt,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar cotización');

      const targetId = data.quote_id || initialQuote?.id;
      toast.success(
        initialQuote
          ? `¡Cotización ${data.quote_number || initialQuote.quote_number} actualizada con éxito!`
          : `¡Cotización ${data.quote_number} generada con éxito!`
      );
      router.push(`/t/${slug}/admin/sales/quotes/${targetId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Barra Superior */}
      <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <Link href={initialQuote ? `/t/${slug}/admin/sales/quotes/${initialQuote.id}` : `/t/${slug}/admin/sales/quotes`}>
            <Button type="button" variant="outline" size="sm" className="h-9 px-2.5">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-stone-950 dark:text-white">
              {initialQuote ? `Editar Cotización ${initialQuote.quote_number}` : 'Nueva Cotización Comercial'}
            </h1>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              {initialQuote
                ? 'Modifica renglones, servicios adicionales o términos mientras permanezca en Borrador.'
                : 'Registra los productos solicitados y genera el presupuesto instantáneo.'}
            </p>
          </div>
        </div>

        <Button
          type="submit"
          disabled={saving || discountExceeded}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 shadow-xs"
        >
          {saving ? 'Guardando...' : (initialQuote ? 'Guardar Cambios' : 'Generar Cotización')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna Izquierda / Central: Datos y Productos */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tarjeta de Cliente */}
          <div className="p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] space-y-4 shadow-xs">
            <h3 className="text-xs font-extrabold uppercase text-stone-500 dark:text-zinc-400 tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-600" />
              Datos del Cliente
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cust-name" className="text-xs font-semibold">
                  Nombre Completo *
                </Label>
                <Input
                  id="cust-name"
                  type="text"
                  required
                  placeholder="Ej. María Pérez / Distribuidora Express"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="cust-phone" className="text-xs font-semibold">
                  WhatsApp / Teléfono *
                </Label>
                <Input
                  id="cust-phone"
                  type="text"
                  required
                  placeholder="Ej. 04141234567"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="cust-id" className="text-xs font-semibold">
                  Cédula / RIF (Opcional)
                </Label>
                <Input
                  id="cust-id"
                  type="text"
                  placeholder="Ej. V-18234567 / J-31234567-0"
                  value={customerIdNum}
                  onChange={(e) => setCustomerIdNum(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="cust-email" className="text-xs font-semibold">
                  Correo Electrónico (Opcional)
                </Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            {/* Asignación de Vendedor */}
            {currentUser.role !== 'SALES_REP' && (
              <div className="pt-2 border-t border-stone-100 dark:border-zinc-800">
                <Label htmlFor="quote-rep" className="text-xs font-semibold">
                  Vendedor Responsable
                </Label>
                <select
                  id="quote-rep"
                  value={salesRepId}
                  onChange={(e) => setSalesRepId(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-stone-900 dark:text-zinc-100"
                >
                  {salesReps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.full_name} ({r.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tarjeta de Productos */}
          <div className="p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase text-stone-500 dark:text-zinc-400 tracking-wider flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-600" />
                Productos & Renglones
              </h3>
              <span className="text-xs text-stone-500 dark:text-zinc-400">
                {items.length} producto(s)
              </span>
            </div>

            {/* Buscador de Productos */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Escribe el nombre o SKU para buscar y agregar..."
                value={searchProd}
                onChange={(e) => setSearchProd(e.target.value)}
                className="pl-9 text-xs"
              />

              {filteredProducts.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1.5 rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-xl overflow-hidden divide-y divide-stone-100 dark:divide-zinc-800">
                  {filteredProducts.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      className="w-full p-2.5 text-left flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/60 transition text-xs"
                    >
                      <div>
                        <p className="font-bold text-stone-900 dark:text-white">{p.name}</p>
                        {p.sku && <p className="text-[10px] text-stone-400">SKU: {p.sku}</p>}
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-stone-900 dark:text-white">
                          ${parseFloat(String(p.price_primary)).toFixed(2)}
                        </span>
                        <span className="block text-[10px] text-stone-400">
                          Stock: {p.current_stock}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lista de Renglones Agregados */}
            {items.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-stone-200 dark:border-zinc-800 rounded-xl text-xs text-stone-400">
                No has agregado productos a esta cotización. Utiliza el buscador arriba.
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item, idx) => {
                  const lineTotal = (item.quantity * item.unit_price_primary).toFixed(2);
                  return (
                    <div
                      key={item.product_id + idx}
                      className="p-3 rounded-xl border border-stone-200/80 dark:border-zinc-800/80 bg-stone-50/50 dark:bg-zinc-900/30 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-stone-900 dark:text-white text-xs truncate">
                            {item.product_name}
                          </p>
                        </div>

                        {/* Cantidad */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Label className="text-[10px] text-stone-500">Cant:</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQty(idx, parseFloat(e.target.value) || 1)}
                            className="w-16 h-8 text-center text-xs font-mono font-bold"
                          />
                        </div>

                        {/* Precio Unitario de Catálogo (Fijo - Modificaciones solo vía Descuentos) */}
                        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800/80 border border-stone-200/80 dark:border-zinc-700/80">
                          <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-medium">P. Unit:</span>
                          <span className="text-xs font-mono font-bold text-stone-900 dark:text-white">
                            ${Number(item.unit_price_primary).toFixed(2)}
                          </span>
                        </div>

                        {/* Total Renglón */}
                        <div className="w-20 text-right shrink-0">
                          <span className="font-mono font-black text-xs text-stone-950 dark:text-white">
                            ${lineTotal}
                          </span>
                        </div>

                        {/* Eliminar */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0"
                          title="Quitar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Nota por renglón (opcional) */}
                      <Input
                        type="text"
                        placeholder="Nota o especificación del ítem (ej. color beige, medida 1.80m)..."
                        value={item.notes}
                        onChange={(e) => handleUpdateItemNotes(idx, e.target.value)}
                        className="h-7 text-[11px] bg-white dark:bg-zinc-950"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Línea de Servicios Adicionales */}
            <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-2">
              <span className="text-xs font-bold text-stone-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Servicios Adicionales o Especiales
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <Input
                    type="text"
                    placeholder="Descripción del adicional (ej. Armado e instalación, Flete especial)..."
                    value={additionalNote}
                    onChange={(e) => setAdditionalNote(e.target.value)}
                    className="text-xs h-9"
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Monto $0.00"
                    value={additionalServices}
                    onChange={(e) => setAdditionalServices(e.target.value)}
                    className="text-xs h-9 font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] space-y-3 shadow-xs">
            <h3 className="text-xs font-extrabold uppercase text-stone-500 dark:text-zinc-400 tracking-wider">
              Notas & Términos
            </h3>

            <div className="space-y-3">
              <div>
                <Label htmlFor="cust-notes" className="text-xs font-semibold">
                  Notas al Cliente (Visibles en la cotización impresa / PDF)
                </Label>
                <textarea
                  id="cust-notes"
                  rows={2}
                  placeholder="Ej. Tiempo estimado de entrega 3 a 5 días hábiles tras confirmación..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-stone-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <Label htmlFor="int-notes" className="text-xs font-semibold">
                  Notas Internas (Solo visibles para el equipo)
                </Label>
                <textarea
                  id="int-notes"
                  rows={2}
                  placeholder="Ej. Cliente solicitó descuento por compra mayorista de 10 unidades..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-stone-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Totales y Liquidación */}
        <div className="space-y-5">
          <div className="p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#141416] space-y-4 shadow-xs sticky top-20">
            <h3 className="text-xs font-extrabold uppercase text-stone-500 dark:text-zinc-400 tracking-wider">
              Resumen Financiero
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-stone-600 dark:text-zinc-400">
                <span>Subtotal Productos:</span>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  ${itemsSubtotal.toFixed(2)}
                </span>
              </div>

              {additionalNum > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                  <span>Servicios Adicionales:</span>
                  <span className="font-mono font-bold">+${additionalNum.toFixed(2)}</span>
                </div>
              )}

              {/* Descuento */}
              <div className="pt-2 border-t border-stone-100 dark:border-zinc-800 space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="quote-disc" className="text-xs font-semibold">
                    Descuento Comercial ($)
                  </Label>
                  <span className="text-[10px] text-stone-400">
                    Max: {maxDiscountPct}%
                  </span>
                </div>
                <Input
                  id="quote-disc"
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  className="font-mono font-bold text-xs h-9"
                />
                {discountExceeded && (
                  <p className="text-[11px] text-rose-600 font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    Supera tu límite ({maxDiscountPct}%)
                  </p>
                )}
              </div>

              {/* Validez */}
              <div className="pt-2 border-t border-stone-100 dark:border-zinc-800">
                <Label htmlFor="val-days" className="text-xs font-semibold">
                  Días de Validez Comercial
                </Label>
                <select
                  id="val-days"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className="w-full mt-1 h-9 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-stone-900 dark:text-zinc-100"
                >
                  <option value="3">3 días</option>
                  <option value="7">7 días (Recomendado)</option>
                  <option value="15">15 días</option>
                  <option value="30">30 días</option>
                  <option value="0">Sin fecha de expiración</option>
                </select>
              </div>

              {/* Total Final */}
              <div className="pt-3 border-t-2 border-stone-200 dark:border-zinc-800 space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="font-extrabold text-sm text-stone-900 dark:text-white">
                    Total Cotizado:
                  </span>
                  <span className="font-mono font-black text-xl text-emerald-600 dark:text-emerald-400">
                    ${total.toFixed(2)} {primaryCurrency}
                  </span>
                </div>

                {totalSecondary && (
                  <div className="text-right text-xs font-mono font-bold text-stone-500 dark:text-zinc-400">
                    Bs. {totalSecondary}
                  </div>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving || discountExceeded}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 shadow-sm"
            >
              {saving ? 'Guardando...' : (initialQuote ? 'Guardar Cambios' : 'Crear Cotización')}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
