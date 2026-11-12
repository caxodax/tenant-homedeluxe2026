'use client';

import { useState, useTransition } from 'react';
import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { createStorefrontOrder } from '@/app/actions/storefront/create-order';
import { useRouter } from 'next/navigation';
import { 
  Store, Banknote, CreditCard, ShieldCheck, 
  ArrowLeft, CheckCircle2, AlertCircle, ShoppingBag,
  UploadCloud, Loader2, X, Copy, Check, Building2, FileCheck2
} from 'lucide-react';
import Link from 'next/link';
import type { TenantPaymentMethod } from '@/lib/payment-methods';
import { uploadTenantMedia } from '@/lib/media-client';

interface CheckoutFormProps {
  slug: string;
  storeName: string;
  pickupAddress: string;
  paymentMethods: TenantPaymentMethod[];
}

async function computeSha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function CheckoutForm({
  slug,
  storeName,
  pickupAddress,
  paymentMethods,
}: CheckoutFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasMounted = useHasMounted();
  const items = useCart((state) => state.items);
  const totalItems = useCart((state) => state.getTotalItems());
  const totalPrice = useCart((state) => state.getTotalPrice());
  const clearCart = useCart((state) => state.clearCart);

  // Datos del formulario (Core Agnóstico en USD)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>(
    paymentMethods[0]?.code || 'CASH_USD'
  );
  const [paymentReference, setPaymentReference] = useState('');
  const [bankSource, setBankSource] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofHash, setProofHash] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const selectedMethodObj = paymentMethods.find((m) => m.code === paymentMethod) || paymentMethods[0];
  const showProofSection = Boolean(
    selectedMethodObj?.requires_reference || selectedMethodObj?.requires_proof
  );

  if (!hasMounted) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-400 animate-pulse">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">Verificando pedido...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mx-auto text-slate-500">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-950 dark:text-white">
          No tienes productos en tu carrito
        </h2>
        <p className="text-sm text-slate-700 dark:text-zinc-300">
          Agrega productos desde la vitrina antes de pasar por caja.
        </p>
        <Link
          href={`/t/${slug}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-600 text-black font-extrabold text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Catálogo</span>
        </Link>
      </div>
    );
  }

  async function handleCopyValue(key: string, val: string) {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('El comprobante debe ser una imagen (PNG, JPG o WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('El comprobante supera el límite máximo de 5 MB.');
      return;
    }

    try {
      setError(null);
      setIsUploadingProof(true);
      const sha256 = await computeSha256Hex(file);
      const data = await uploadTenantMedia(file, slug, 'proofs', 1200);
      setProofUrl(data.url);
      setProofHash(sha256);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir comprobante');
    } finally {
      setIsUploadingProof(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Por favor completa tu nombre y número de contacto.');
      return;
    }

    if (selectedMethodObj?.requires_reference && paymentReference.trim().length < 4) {
      setError(`Ingresa el número de referencia (mínimo 4 caracteres) para ${selectedMethodObj.name}.`);
      return;
    }

    if (selectedMethodObj?.requires_proof && !proofUrl) {
      setError(`Debes adjuntar la captura del comprobante para ${selectedMethodObj.name}.`);
      return;
    }

    startTransition(async () => {
      const res = await createStorefrontOrder({
        slug,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_id_number: 'N/A',
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim() || undefined,
        bank_source: bankSource.trim() || undefined,
        proof_image_url: proofUrl || undefined,
        proof_file_hash: proofHash || undefined,
        notes: notes || undefined,
        items: items.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price_usd: i.price_usd,
        })),
      });

      if (res.success && res.orderId) {
        clearCart();
        router.push(`/t/${slug}/order-success/${res.orderId}`);
      } else {
        setError(res.error || 'Ocurrió un error al procesar tu pedido');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <Link
          href={`/t/${slug}/cart`}
          className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 flex items-center justify-center text-slate-700 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            Checkout de Pedido
          </h1>
          <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
            Retiro en tienda física (Pick-up) en {storeName}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-800 dark:text-red-300 text-sm font-semibold flex items-center gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario de Datos (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* 1. Datos del Cliente */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-4 shadow-xs">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-lime-500/15 text-lime-700 dark:text-lime-400 flex items-center justify-center text-xs font-black">1</span>
              Tus Datos de Contacto
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Nombre y Apellido *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. Carlos Mendoza"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-sm font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                  Teléfono de Contacto / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1 555 1234567"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-sm font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                />
                <p className="text-xs text-slate-600 dark:text-zinc-400">Recibirás la confirmación de preparación de tu pedido.</p>
              </div>
            </div>
          </div>

          {/* 2. Modalidad de Retiro */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xs">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-lime-500/15 text-lime-700 dark:text-lime-400 flex items-center justify-center text-xs font-black">2</span>
              Punto de Retiro en Mostrador
            </h2>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
              <Store className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-extrabold text-slate-950 dark:text-white">
                  Retiro Inmediato en Tienda Física (Pick-up Gratis)
                </p>
                <p className="text-slate-800 dark:text-zinc-300 mt-1 leading-relaxed text-xs sm:text-sm">
                  {pickupAddress}
                </p>
                <p className="text-xs text-emerald-800 dark:text-emerald-400 font-bold mt-1">
                  Tu pedido estará empacado y listo para retirar en mostrador.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                Instrucciones o Notas adicionales (Opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Instrucciones para la entrega en mostrador..."
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
              />
            </div>
          </div>

          {/* 3. Forma de Pago Administrable + Comprobante & Referencia */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-5 shadow-xs">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-950 dark:text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-lime-500/15 text-lime-700 dark:text-lime-400 flex items-center justify-center text-xs font-black">3</span>
              Forma de Pago (USD)
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {paymentMethods.map((pm) => {
                const isSelected = paymentMethod === pm.code;
                const isCash = pm.code.includes('CASH');
                const isTransfer = pm.requires_proof || pm.requires_reference;

                return (
                  <button
                    key={pm.code}
                    type="button"
                    onClick={() => setPaymentMethod(pm.code)}
                    className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-lime-500 bg-lime-500/10 ring-1 ring-lime-500/30 shadow-xs'
                        : 'border-slate-300 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      {isCash ? (
                        <Banknote className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      ) : isTransfer ? (
                        <Building2 className="w-6 h-6 text-lime-600 dark:text-lime-400" />
                      ) : (
                        <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      )}
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded tenant-secondary-badge border">
                        {pm.currency}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-slate-950 dark:text-white">{pm.name}</p>
                      <p className="text-xs text-slate-700 dark:text-zinc-400 mt-0.5 line-clamp-2">
                        {pm.instructions || (pm.requires_proof ? 'Requiere comprobante y referencia' : 'Pago directo')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Datos de la Empresa para realizar el pago */}
            {selectedMethodObj && (selectedMethodObj.details.length > 0 || selectedMethodObj.instructions) && (
              <div className="p-4 rounded-2xl tenant-secondary-surface border-l-4 border-lime-500 space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-lime-400" />
                  Datos para pagar con {selectedMethodObj.name}
                </p>

                {selectedMethodObj.details.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedMethodObj.details.map((d, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-white/10 border border-white/15 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase opacity-80">{d.label}</p>
                          <p className="text-sm font-mono font-bold truncate">{d.value}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyValue(`${idx}-${d.label}`, d.value)}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition cursor-pointer shrink-0"
                          title="Copiar dato"
                        >
                          {copiedKey === `${idx}-${d.label}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedMethodObj.instructions && (
                  <p className="text-xs tenant-secondary-muted leading-relaxed">
                    {selectedMethodObj.instructions}
                  </p>
                )}
              </div>
            )}

            {/* Captura de Comprobante y Número de Referencia */}
            {showProofSection && (
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-300 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-950 dark:text-white flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    Registro de Pago & Comprobante
                  </h3>
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Validación antifraude SHA-256
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                      Número de Referencia {selectedMethodObj?.requires_reference ? '*' : '(Opcional)'}
                    </label>
                    <input
                      type="text"
                      required={Boolean(selectedMethodObj?.requires_reference)}
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Ej. 004829184"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-sm font-mono font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                      Banco o Plataforma Emisora (Opcional)
                    </label>
                    <input
                      type="text"
                      value={bankSource}
                      onChange={(e) => setBankSource(e.target.value)}
                      placeholder="Ej. Chase, Mercantil, Binance..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-sm text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                    />
                  </div>
                </div>

                {/* Uploader de Comprobante */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-800 dark:text-zinc-200 block">
                    Captura del Comprobante {selectedMethodObj?.requires_proof ? '*' : '(Opcional)'}
                  </label>

                  {proofUrl ? (
                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-950 border border-emerald-500/40 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={proofUrl}
                        alt="Comprobante adjunto"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-zinc-800 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                          Comprobante cargado exitosamente
                        </p>
                        <p className="text-xs font-mono text-slate-600 dark:text-zinc-400 truncate">
                          SHA-256: {proofHash.slice(0, 18)}...
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProofUrl('');
                          setProofHash('');
                        }}
                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                        title="Quitar comprobante"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-slate-300 dark:border-zinc-700 hover:border-lime-500 transition cursor-pointer bg-white dark:bg-zinc-950 text-center">
                      {isUploadingProof ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin text-lime-600 dark:text-lime-400 mb-1.5" />
                          <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                            Verificando hash y subiendo comprobante...
                          </span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-6 h-6 text-lime-600 dark:text-lime-400 mb-1.5" />
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            Toca para adjuntar captura del pago
                          </span>
                          <span className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">
                            PNG, JPG o WebP · Máximo 5 MB
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={isUploadingProof}
                        onChange={handleProofUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resumen Final y Botón de Confirmación (4-5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 sticky top-24 space-y-6 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-950 dark:text-white border-b border-slate-200 dark:border-zinc-800 pb-3">
              Detalle del Pedido
            </h2>

            <div className="divide-y divide-slate-200/80 dark:divide-zinc-800/80 max-h-56 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.product_id} className="py-2.5 first:pt-0 last:pb-0 flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-950 dark:text-white truncate">{item.product_name}</p>
                    <p className="text-xs text-slate-700 dark:text-zinc-400 font-mono">
                      {item.quantity} x ${item.price_usd.toFixed(2)} USD
                    </p>
                  </div>
                  <p className="font-mono font-extrabold text-slate-950 dark:text-white shrink-0">
                    ${(item.price_usd * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-zinc-800 text-sm">
              <div className="flex justify-between text-slate-700 dark:text-zinc-300 font-medium">
                <span>Subtotal ({totalItems} uds)</span>
                <span className="font-mono font-bold">${totalPrice.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between text-slate-700 dark:text-zinc-300 font-medium">
                <span>Retiro en Tienda</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">Gratis</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-zinc-800">
                <span className="text-base font-black text-slate-950 dark:text-white">Total USD</span>
                <span className="text-2xl font-black font-mono text-lime-700 dark:text-lime-400">
                  ${totalPrice.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending || isUploadingProof}
              className="w-full py-4 px-6 rounded-2xl bg-lime-500 hover:bg-lime-600 disabled:opacity-50 text-black font-black text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>{isPending ? 'Confirmando pedido...' : 'Confirmar Pedido (Pick-up)'}</span>
            </button>

            <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-700 dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Pedido directo a la caja del comercio</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
