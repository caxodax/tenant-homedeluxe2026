'use client';

import { useState, useEffect, useTransition } from 'react';
import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { createStorefrontOrder } from '@/app/actions/storefront/create-order';
import { useRouter } from 'next/navigation';
import { 
  Store, Banknote, CreditCard, ShieldCheck, 
  ArrowLeft, CheckCircle2, AlertCircle, ShoppingBag,
  UploadCloud, Loader2, X, Copy, Check, Building2, FileCheck2,
  Bike, MapPin, Navigation, Compass, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { TenantPaymentMethod } from '@/lib/payment-methods';
import { uploadTenantMedia, toWebpFile } from '@/lib/media-client';
import {
  VENEZUELAN_BANKS,
  isValidCedulaOrRif,
  isValidVenezuelanMobile,
  formatBs,
} from '@/lib/plugins/local-venezuela';

interface DeliveryZoneItem {
  id: string;
  name: string;
  description: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number;
  rate_primary: number;
  estimated_time: string;
}

interface CheckoutFormProps {
  slug: string;
  storeName: string;
  pickupAddress: string;
  paymentMethods: TenantPaymentMethod[];
  deliveryZones?: DeliveryZoneItem[];
  isDeliveryFleetActive?: boolean;
  exchangeRate?: number | null;
  primaryCurrency?: string;
  isLocalVenezuela?: boolean;
  igtfEnabled?: boolean;
  taxEnabled?: boolean;
  taxRate?: number;
  pricesIncludeTax?: boolean;
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
  deliveryZones = [],
  isDeliveryFleetActive = false,
  exchangeRate,
  primaryCurrency = 'USD',
  isLocalVenezuela,
  igtfEnabled,
  taxEnabled = true,
  taxRate = 16,
  pricesIncludeTax = false,
}: CheckoutFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasMounted = useHasMounted();
  const items = useCart((state) => state.items);
  const totalPrice = useCart((state) => state.getTotalPrice());
  const clearCart = useCart((state) => state.clearCart);

  // Datos del Cliente
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [idType, setIdType] = useState<'V' | 'E' | 'J' | 'G' | 'P'>('V');
  const [idNumber, setIdNumber] = useState('');
  const [customerIdNumber, setCustomerIdNumber] = useState('');

  // Modo de entrega (Pick-up o Delivery)
  const [deliveryType, setDeliveryType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryReferencePoint, setDeliveryReferencePoint] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(deliveryZones[0]?.id || '');
  const [gpsConsent, setGpsConsent] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvedZone, setResolvedZone] = useState<DeliveryZoneItem | null>(null);
  const [cashTendered, setCashTendered] = useState<string>('');

  // Método de Pago
  const [paymentMethod, setPaymentMethod] = useState<string>(
    paymentMethods[0]?.code || 'CASH_USD'
  );
  const [paymentReference, setPaymentReference] = useState('');
  const [bankSource, setBankSource] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofHash, setProofHash] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const selectedMethodObj = paymentMethods.find((m) => m.code === paymentMethod) || paymentMethods[0];
  const isPagoMovil = selectedMethodObj?.code === 'PAGO_MOVIL';
  const showProofSection = Boolean(
    selectedMethodObj?.requires_reference || selectedMethodObj?.requires_proof || isPagoMovil
  );

  // Zona seleccionada y tarifa de delivery
  useEffect(() => {
    if (!selectedZoneId && deliveryZones.length > 0) {
      setSelectedZoneId(deliveryZones[0].id);
    }
  }, [deliveryZones, selectedZoneId]);

  const selectedZone = deliveryZones.find((z) => z.id === selectedZoneId) || resolvedZone;
  const deliveryRate = deliveryType === 'DELIVERY' ? (selectedZone ? Number(selectedZone.rate_primary) : 0) : 0;

  // Cálculos de impuestos Core (IVA/Sales Tax) e IGTF 3% (Plugin VE)
  const isTaxActive = Boolean(taxEnabled);
  const activeTaxRate = Number(taxRate || 16) / 100;
  const isTaxIncluded = Boolean(pricesIncludeTax);

  let exemptSubtotal = 0;
  let taxableSubtotal = 0;

  items.forEach((item) => {
    const lineTotal = item.price_usd * item.quantity;
    if (item.is_tax_exempt) {
      exemptSubtotal += lineTotal;
    } else {
      taxableSubtotal += lineTotal;
    }
  });

  const vatAmountUsd = !isTaxActive || activeTaxRate === 0
    ? 0
    : isTaxIncluded
      ? Number((taxableSubtotal - taxableSubtotal / (1 + activeTaxRate)).toFixed(2))
      : Number((taxableSubtotal * activeTaxRate).toFixed(2));

  const isCashForeignCurrency = paymentMethod === 'CASH_USD' || paymentMethod === 'CASH_EUR';
  const isIgtfApplicable = Boolean(isLocalVenezuela && igtfEnabled && isCashForeignCurrency);
  const baseForIgtf = isTaxIncluded ? totalPrice : totalPrice + vatAmountUsd;
  const igtfAmountUsd = isIgtfApplicable ? Number((baseForIgtf * 0.03).toFixed(2)) : 0;

  const finalTotalUsd = !isTaxActive
    ? Number((totalPrice + deliveryRate).toFixed(2))
    : isTaxIncluded
      ? Number((totalPrice + deliveryRate + igtfAmountUsd).toFixed(2))
      : Number((totalPrice + vatAmountUsd + igtfAmountUsd + deliveryRate).toFixed(2));
  const effectiveRate = Number(exchangeRate || 0);
  const finalTotalVes = effectiveRate > 0 ? Number((finalTotalUsd * effectiveRate).toFixed(2)) : null;

  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

  // Detección automática por GPS
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no soporta geolocalización');
      return;
    }
    setIsDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDetectedCoords({ lat, lng });
        setGpsConsent(true);
        try {
          const res = await fetch(`/api/tenant/${slug}/delivery/resolve-zone?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          if (data.success && data.found && data.zone) {
            setResolvedZone(data.zone);
            setSelectedZoneId(data.zone.id);
            toast.success(`Zona detectada: ${data.zone.name}`, {
              description: `Distancia: ${data.zone.distance_km || 0} km · Tarifa: ${currencySymbol}${Number(data.zone.rate_primary).toFixed(2)}`,
            });
          } else {
            toast.warning('Ubicación fuera de las zonas registradas', {
              description: 'Puedes seleccionar manualmente tu zona de entrega abajo.',
            });
          }
        } catch {
          toast.error('No se pudo resolver la zona por GPS automáticamente');
        } finally {
          setIsDetectingGps(false);
        }
      },
      (err) => {
        setIsDetectingGps(false);
        console.warn('Geolocation error:', err.message);
        toast.info('No pudimos acceder a tu GPS. Por favor selecciona tu zona manualmente.');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

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

      // Optimización Ponytail Ultra: compresión y conversión automática a WebP
      const optimizedFile = await toWebpFile(file, 1200, 0.82);
      const sha256 = await computeSha256Hex(optimizedFile);
      setProofHash(sha256);

      const uploadRes = await uploadTenantMedia(optimizedFile, slug, 'proofs');
      setProofUrl(uploadRes.url);
      toast.success('Comprobante optimizado y adjuntado', {
        description: `Tamaño reducido de ${(file.size / 1024).toFixed(0)} KB a ${(optimizedFile.size / 1024).toFixed(0)} KB`,
      });
    } catch (err: unknown) {
      console.error('Error subiendo comprobante:', err);
      setError(err instanceof Error ? err.message : 'Error al subir la captura del comprobante.');
    } finally {
      setIsUploadingProof(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerName.trim()) {
      setError('Por favor indica tu nombre completo.');
      return;
    }
    if (!customerPhone.trim()) {
      setError('Por favor indica tu número de teléfono / WhatsApp.');
      return;
    }

    const resolvedFiscalId = idNumber.trim() ? `${idType}-${idNumber.trim()}` : customerIdNumber.trim();

    if (isLocalVenezuela) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      if (cleanPhone.length >= 10 && !isValidVenezuelanMobile(customerPhone)) {
        setError('El teléfono debe tener formato venezolano válido (0414, 0424, 0412, etc.).');
        return;
      }
      if (resolvedFiscalId && idType !== 'P' && !isValidCedulaOrRif(resolvedFiscalId)) {
        setError('El documento de identidad debe tener entre 6 y 9 dígitos numéricos válidos.');
        return;
      }
    }

    if (selectedMethodObj?.requires_reference && !paymentReference.trim()) {
      setError(`Debes ingresar el número de referencia para ${selectedMethodObj.name}.`);
      return;
    }

    if ((selectedMethodObj?.requires_proof || isPagoMovil) && !proofUrl) {
      setError(`Debes adjuntar la captura del comprobante para ${selectedMethodObj?.name || 'este pago'}.`);
      return;
    }

    if (deliveryType === 'DELIVERY' && !deliveryAddress.trim()) {
      setError('Por favor indica tu dirección de entrega exacta para el servicio de delivery.');
      return;
    }

    startTransition(async () => {
      const res = await createStorefrontOrder({
        slug,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_id_number: resolvedFiscalId.toUpperCase() || 'N/A',
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim() || undefined,
        bank_source: bankSource.trim() || undefined,
        proof_image_url: proofUrl || undefined,
        proof_file_hash: proofHash || undefined,
        notes: notes || undefined,
        delivery_type: deliveryType,
        delivery_address: deliveryType === 'DELIVERY' ? deliveryAddress.trim() : pickupAddress,
        delivery_zone_id: deliveryType === 'DELIVERY' ? (selectedZoneId || undefined) : undefined,
        delivery_reference_point: deliveryType === 'DELIVERY' ? (deliveryReferencePoint.trim() || undefined) : undefined,
        delivery_latitude: detectedCoords?.lat,
        delivery_longitude: detectedCoords?.lng,
        delivery_accuracy: 10,
        delivery_gps_consent: gpsConsent,
        cash_tendered_primary: isCashForeignCurrency && cashTendered ? parseFloat(cashTendered) : undefined,
        cash_change_primary: isCashForeignCurrency && cashTendered && parseFloat(cashTendered) > finalTotalUsd
          ? Number((parseFloat(cashTendered) - finalTotalUsd).toFixed(2))
          : undefined,
        items: items.map((i) => ({
          product_id: i.product_id,
          product_name: i.variant_name ? `${i.product_name} (${i.variant_name})` : i.product_name,
          quantity: i.quantity,
          unit_price_usd: i.price_usd,
          variant_id: i.variant_id,
          metadata: {
            variant_id: i.variant_id,
            variant_name: i.variant_name,
            modifiers: i.selected_modifiers,
            prep_notes: i.prep_notes,
            is_custom_quote: Boolean(i.selected_modifiers && i.selected_modifiers.length > 0),
          },
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
    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
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
            {deliveryType === 'DELIVERY' ? 'Despacho a domicilio' : 'Retiro en tienda física (Pick-up)'} · {storeName}
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
          {/* SECCIÓN 1: DATOS DEL COMPRADOR */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
              <span className="w-6 h-6 rounded-full bg-lime-500 text-black font-extrabold text-xs flex items-center justify-center">
                1
              </span>
              <h2 className="text-base font-extrabold text-slate-950 dark:text-white">
                Datos de Contacto
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Nombre y Apellido *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Teléfono / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder={isLocalVenezuela ? '04121234567' : '+1 555 123 4567'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                />
              </div>

              {isLocalVenezuela && (
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Tipo de Persona & Cédula / RIF (Emisión Fiscal)
                  </label>
                  <div className="flex gap-2 w-full max-w-full">
                    <select
                      value={idType}
                      onChange={(e) => setIdType(e.target.value as any)}
                      className="w-28 sm:w-36 shrink-0 px-2 sm:px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                    >
                      <option value="V">V - Natural</option>
                      <option value="E">E - Extranjero</option>
                      <option value="J">J - Jurídico</option>
                      <option value="G">G - Gobierno</option>
                      <option value="P">P - Pasaporte</option>
                    </select>
                    <input
                      type="text"
                      inputMode={idType === 'P' ? 'text' : 'numeric'}
                      value={idNumber}
                      onChange={(e) => {
                        const val = idType === 'P' ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '');
                        setIdNumber(val);
                      }}
                      placeholder={idType === 'J' ? 'Ej. 301234567' : 'Ej. 18456123'}
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Selecciona tu condición fiscal e ingresa tu número sin puntos ni guiones.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SECCIÓN 2: TIPO DE ENTREGA (PICK-UP vs DELIVERY) */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
              <span className="w-6 h-6 rounded-full bg-lime-500 text-black font-extrabold text-xs flex items-center justify-center">
                2
              </span>
              <h2 className="text-base font-extrabold text-slate-950 dark:text-white">
                Método de Entrega
              </h2>
            </div>

            {/* Selector Pick-up vs Delivery */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryType('PICKUP')}
                className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all cursor-pointer ${
                  deliveryType === 'PICKUP'
                    ? 'border-lime-500 bg-lime-500/10 ring-1 ring-lime-500/30 shadow-xs'
                    : 'border-slate-300 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Store className="w-6 h-6 text-lime-600 dark:text-lime-400" />
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                    Gratis
                  </span>
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-950 dark:text-white">Retiro en Mostrador (Pick-up)</p>
                  <p className="text-xs text-slate-700 dark:text-zinc-400 mt-0.5">
                    {pickupAddress}
                  </p>
                </div>
              </button>

              {isDeliveryFleetActive && (
                <button
                  type="button"
                  onClick={() => setDeliveryType('DELIVERY')}
                  className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-2.5 transition-all cursor-pointer ${
                    deliveryType === 'DELIVERY'
                      ? 'border-lime-500 bg-lime-500/10 ring-1 ring-lime-500/30 shadow-xs'
                      : 'border-slate-300 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <Bike className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-lime-500/15 text-lime-700 dark:text-lime-400 border border-lime-500/30">
                      Flota Propia
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-slate-950 dark:text-white">Delivery a Domicilio</p>
                    <p className="text-xs text-slate-700 dark:text-zinc-400 mt-0.5">
                      {selectedZone ? `${selectedZone.name} · ${currencySymbol}${Number(selectedZone.rate_primary).toFixed(2)}` : 'Tarifa calculada según zona'}
                    </p>
                  </div>
                </button>
              )}
            </div>

            {/* Campos condicionales para Delivery */}
            {deliveryType === 'DELIVERY' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-4 animate-in fade-in duration-200">
                {/* Botón de Geolocalización GPS */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      {detectedCoords ? 'Ubicación GPS fijada satelitalmente' : 'Detectar zona exacta automáticamente'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isDetectingGps}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 font-bold text-xs transition cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isDetectingGps ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Detectando...</span>
                      </>
                    ) : (
                      <>
                        <Compass className="w-3.5 h-3.5" />
                        <span>Usar mi GPS</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Selector de Zona Manual (Fallback Resiliente) */}
                {deliveryZones.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center justify-between">
                      <span>Zona de Entrega / Municipio *</span>
                      <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                        {selectedZone ? `Tarifa: ${currencySymbol}${Number(selectedZone.rate_primary).toFixed(2)}` : ''}
                      </span>
                    </label>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-semibold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                    >
                      {deliveryZones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name} — {currencySymbol}{Number(zone.rate_primary).toFixed(2)} {primaryCurrency} {zone.estimated_time ? `(${zone.estimated_time})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Dirección Exacta */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Dirección de Entrega Exacta *
                  </label>
                  <input
                    type="text"
                    required={deliveryType === 'DELIVERY'}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Calle, avenida, edificio / casa, número de piso o apartamento..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                  />
                </div>

                {/* Punto de Referencia */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Punto de Referencia (Opcional)
                  </label>
                  <input
                    type="text"
                    value={deliveryReferencePoint}
                    onChange={(e) => setDeliveryReferencePoint(e.target.value)}
                    placeholder="Ej. Frente a la panadería, portón blanco rejas negras..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                Instrucciones o Notas adicionales para el pedido
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones de empaque o entrega..."
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
              />
            </div>
          </div>

          {/* SECCIÓN 3: MÉTODO DE PAGO */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
              <span className="w-6 h-6 rounded-full bg-lime-500 text-black font-extrabold text-xs flex items-center justify-center">
                3
              </span>
              <h2 className="text-base font-extrabold text-slate-950 dark:text-white">
                Método de Pago
              </h2>
            </div>

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

            {/* Campo Vuelto / Denominación de Efectivo (Solo para Delivery con pago en efectivo) */}
            {deliveryType === 'DELIVERY' && isCashForeignCurrency && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    ¿Con cuánto vas a pagar? (Llevamos tu vuelto exacto)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black font-mono text-slate-700 dark:text-zinc-300">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={finalTotalUsd}
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder={`Ej. ${(Math.ceil(finalTotalUsd / 10) * 10 || 20).toFixed(2)}`}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-700/60 text-sm font-mono font-black text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {Number(cashTendered) > finalTotalUsd ? (
                  <p className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    ✓ Vuelto calculado para el chofer: {currencySymbol}{(Number(cashTendered) - finalTotalUsd).toFixed(2)} {primaryCurrency}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600 dark:text-zinc-400">
                    Indica el billete con el que pagarás para que el repartidor lleve el cambio exacto.
                  </p>
                )}
              </div>
            )}

            {/* Monto destacado para Pago Móvil */}
            {isPagoMovil && finalTotalVes && (
              <div className="p-4 rounded-2xl bg-lime-500/10 border-2 border-lime-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full overflow-hidden">
                <div className="min-w-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-lime-700 dark:text-lime-400">
                    Monto exacto a transferir en Pago Móvil:
                  </span>
                  <div className="text-xl sm:text-2xl font-black font-mono text-slate-950 dark:text-white truncate">
                    Bs. {finalTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {effectiveRate > 0 && (
                    <p className="text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                      Calculado a la Tasa Oficial BCV: Bs. {effectiveRate.toFixed(4)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyValue('monto_ves', finalTotalVes.toFixed(2))}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
                >
                  {copiedKey === 'monto_ves' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>¡Monto Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Monto Bs.</span>
                    </>
                  )}
                </button>
              </div>
            )}

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
                  <p className="text-xs opacity-90 leading-relaxed border-t border-white/10 pt-2 font-medium">
                    {selectedMethodObj.instructions}
                  </p>
                )}
              </div>
            )}

            {/* Formulario de Referencia y Comprobante */}
            {showProofSection && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedMethodObj?.requires_reference && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        Número de Referencia Bancaria *
                      </label>
                      <input
                        type="text"
                        required
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Últimos dígitos o referencia completa"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-mono font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                      />
                    </div>
                  )}

                  {isLocalVenezuela && selectedMethodObj?.requires_reference && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                        Banco Emisor
                      </label>
                      <select
                        value={bankSource}
                        onChange={(e) => setBankSource(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-medium text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                      >
                        <option value="">Selecciona tu banco...</option>
                        {VENEZUELAN_BANKS.map((b) => (
                          <option key={b.code} value={b.name}>
                            {b.code} - {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Subida de Comprobante */}
                {(selectedMethodObj?.requires_proof || isPagoMovil) && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center justify-between">
                      <span>Captura de Pantalla del Comprobante *</span>
                      <span className="text-[10px] text-slate-700 dark:text-zinc-300 font-mono">PNG, JPG hasta 5MB</span>
                    </label>

                    {proofUrl ? (
                      <div className="p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-emerald-500/40 flex items-center justify-between gap-2 w-full max-w-full overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 shrink-0">
                            <FileCheck2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-950 dark:text-white truncate">
                              Comprobante optimizado (WebP)
                            </p>
                            {proofHash && (
                              <p className="text-[10px] font-mono text-slate-600 dark:text-zinc-400 truncate max-w-[150px] sm:max-w-xs">
                                SHA: {proofHash.slice(0, 16)}...
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setProofUrl(null);
                            setProofHash(null);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 cursor-pointer"
                          title="Eliminar comprobante"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 dark:border-zinc-800 hover:border-lime-500 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition bg-white dark:bg-zinc-900/50">
                        {isUploadingProof ? (
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300">
                            <Loader2 className="w-5 h-5 animate-spin text-lime-500" />
                            <span>Procesando imagen y cifrado...</span>
                          </div>
                        ) : (
                          <>
                            <UploadCloud className="w-7 h-7 text-slate-600 dark:text-zinc-300" />
                            <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                              Toca para subir captura o foto del comprobante
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
                )}
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
                      {item.quantity} x {currencySymbol}{item.price_usd.toFixed(2)} {primaryCurrency}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-slate-950 dark:text-white shrink-0">
                    {currencySymbol}{(item.price_usd * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Desglose de Totales e Impuestos */}
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-zinc-800 text-sm">
              <div className="flex justify-between text-slate-700 dark:text-zinc-300 font-medium">
                <span>Subtotal Artículos</span>
                <span className="font-mono font-bold text-slate-950 dark:text-white">
                  {currencySymbol}{totalPrice.toFixed(2)} {primaryCurrency}
                </span>
              </div>

              {isTaxActive && (
                <div className="space-y-1 text-xs text-slate-700 dark:text-zinc-400">
                  <div className="flex justify-between">
                    <span>Base Imponible (Gravable)</span>
                    <span className="font-mono">{currencySymbol}{taxableSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Exenta</span>
                    <span className="font-mono">{currencySymbol}{exemptSubtotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {isTaxActive && activeTaxRate > 0 && vatAmountUsd > 0 && (
                <div className="flex justify-between text-slate-700 dark:text-zinc-300 font-medium text-xs">
                  <span>IVA ({taxRate}%){isTaxIncluded ? ' (incluido en precio)' : ''}</span>
                  <span className="font-mono font-bold">
                    {isTaxIncluded ? '' : '+'}{currencySymbol}{vatAmountUsd.toFixed(2)} {primaryCurrency}
                  </span>
                </div>
              )}

              {isIgtfApplicable && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 font-medium text-xs">
                  <span>Recargo IGTF 3% (Divisas Efectivo)</span>
                  <span className="font-mono font-bold">+{currencySymbol}{igtfAmountUsd.toFixed(2)} {primaryCurrency}</span>
                </div>
              )}

              {/* Flete o Retiro */}
              {deliveryType === 'DELIVERY' ? (
                <div className="flex justify-between text-slate-700 dark:text-zinc-300 font-medium text-xs">
                  <span className="flex items-center gap-1.5">
                    <Bike className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Servicio Delivery ({selectedZone?.name || 'Tarifa Plana'})</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    +{currencySymbol}{deliveryRate.toFixed(2)} {primaryCurrency}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between text-slate-700 dark:text-zinc-300 font-medium text-xs">
                  <span>Retiro en Tienda (Pick-up)</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">Gratis</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-zinc-800">
                <span className="text-base font-black text-slate-950 dark:text-white">Total {primaryCurrency}</span>
                <span className="text-2xl font-black font-mono text-lime-700 dark:text-lime-400">
                  {currencySymbol}{finalTotalUsd.toFixed(2)}
                </span>
              </div>
              {finalTotalVes && (
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Total Bolívares (BCV)</span>
                  <span className="text-base font-extrabold font-mono text-slate-950 dark:text-white">
                    Bs. {finalTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending || isUploadingProof}
              className="w-full py-4 px-6 rounded-2xl bg-lime-500 hover:bg-lime-600 disabled:opacity-50 text-black font-black text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              {deliveryType === 'DELIVERY' ? <Bike className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              <span>
                {isPending
                  ? 'Confirmando pedido...'
                  : deliveryType === 'DELIVERY'
                    ? `Confirmar Pedido a Domicilio (${currencySymbol}${finalTotalUsd.toFixed(2)})`
                    : `Confirmar Pedido (Pick-up)`}
              </span>
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
