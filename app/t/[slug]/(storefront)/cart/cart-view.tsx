'use client';

import React, { useState } from 'react';
import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import Link from 'next/link';
import { 
  ShoppingCart, ArrowLeft, Plus, Minus, Trash2, 
  Store, ShieldCheck, ArrowRight, Package, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';

interface CartViewProps {
  slug: string;
  pickupAddress: string;
  exchangeRate?: number | null;
  primaryCurrency?: string;
}

export function CartView({ slug, pickupAddress, exchangeRate, primaryCurrency = 'USD' }: CartViewProps) {
  const hasMounted = useHasMounted();
  const items = useCart((state) => state.items);
  const totalItems = useCart((state) => state.getTotalItems());
  const totalPrice = useCart((state) => state.getTotalPrice());
  const updateQuantity = useCart((state) => state.updateQuantity);
  const removeItem = useCart((state) => state.removeItem);
  const clearCart = useCart((state) => state.clearCart);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const toggleItemExpand = (itemKey: string) => {
    setExpandedItems((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }));
  };

  const effectiveRate = Number(exchangeRate || 0);
  const totalVes = effectiveRate > 0 ? (totalPrice * effectiveRate).toFixed(2) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

  if (!hasMounted) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <ShoppingCart className="w-8 h-8" />
        </div>
        <p className="text-sm font-semibold text-stone-700 dark:text-zinc-300">Cargando carrito de compras...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-stone-100 dark:bg-zinc-800/80 border border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 flex items-center justify-center mx-auto mb-4">
          <ShoppingCart className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-stone-950 dark:text-white">
          Tu carrito está vacío
        </h2>
        <p className="text-sm font-medium text-stone-700 dark:text-zinc-300 mt-2 max-w-sm mx-auto leading-relaxed">
          Aún no has añadido ningún producto de nuestra vitrina. Explora el catálogo y agrega tus favoritos.
        </p>
        <Link
          href={`/t/${slug}`}
          className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-2xl text-white font-extrabold text-sm shadow-md transition-all active:scale-95"
          style={{ backgroundColor: 'var(--tenant-primary, #ea580c)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Explorar Catálogo</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header del Carrito */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href={`/t/${slug}`}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-700 flex items-center justify-center text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-zinc-800 transition shadow-xs"
            title="Volver a la tienda"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-stone-950 dark:text-white tracking-tight">
              Carrito de Compras
            </h1>
            <p className="text-xs font-semibold text-stone-700 dark:text-zinc-300">
              {totalItems} {totalItems === 1 ? 'artículo' : 'artículos'} en tu orden de retiro
            </p>
          </div>
        </div>

        {/* Botón Vaciar Carrito con confirmación defensiva */}
        <button
          type="button"
          onClick={() => setShowClearConfirm(true)}
          className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1.5 self-start sm:self-center cursor-pointer transition-colors px-2.5 py-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          <Trash2 className="w-4 h-4" />
          <span>Vaciar Carrito</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Listado de Productos (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          {items.map((item) => {
            const subtotal = item.price_usd * item.quantity;
            const itemKey = item.item_key || item.product_id;
            const hasModifiers = Boolean(item.selected_modifiers && item.selected_modifiers.length > 0);
            const isExpanded = Boolean(expandedItems[itemKey]);

            return (
              <div
                key={itemKey}
                className="p-4 rounded-2xl bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 flex flex-col gap-3 shadow-xs hover:border-stone-300 dark:hover:border-zinc-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Foto + Info Principal */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-14 h-14 rounded-xl bg-stone-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0 border border-stone-200 dark:border-zinc-700">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-stone-500 dark:text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-extrabold text-stone-950 dark:text-white leading-snug">
                        {item.product_name}
                      </h3>
                      {item.variant_name && (
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                          {item.variant_name}
                        </p>
                      )}

                      {/* Resumen de Modificadores con Acordeón Desplegable (Img 1) */}
                      {hasModifiers && (
                        <div className="mt-1.5 space-y-1.5">
                          {!isExpanded ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-medium text-stone-800 dark:text-zinc-200 line-clamp-1">
                                + {item.selected_modifiers!.map((m) => m.name).join(', ')}
                              </p>
                              {item.selected_modifiers!.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => toggleItemExpand(itemKey)}
                                  className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline cursor-pointer bg-amber-500/10 px-1.5 py-0.5 rounded-md"
                                >
                                  <span>Ver {item.selected_modifiers!.length} extras</span>
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-600 dark:text-zinc-400">
                                  Extras y Personalizaciones ({item.selected_modifiers!.length}):
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleItemExpand(itemKey)}
                                  className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline cursor-pointer"
                                >
                                  <span>Ocultar detalle</span>
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                              </div>
                              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                                {item.selected_modifiers!.map((mod, idx) => (
                                  <li 
                                    key={idx}
                                    className="flex items-center justify-between text-stone-800 dark:text-zinc-100 font-semibold px-2 py-1 rounded-lg bg-white dark:bg-zinc-800/80 border border-stone-200/80 dark:border-zinc-700/80"
                                  >
                                    <span className="truncate pr-1">✓ {mod.name}</span>
                                    {Number(mod.price || 0) > 0 && (
                                      <span className="font-mono text-[11px] text-amber-700 dark:text-amber-400 font-bold shrink-0">
                                        +{currencySymbol}{Number(mod.price).toFixed(2)}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-xs font-mono font-bold text-stone-700 dark:text-zinc-300 mt-1">
                        {currencySymbol}{item.price_usd.toFixed(2)} {primaryCurrency} c/u
                      </p>
                    </div>
                  </div>

                  {/* Selector de Cantidad y Subtotal */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100 dark:border-zinc-800/80">
                    <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-zinc-800 p-1 rounded-xl border border-stone-200 dark:border-zinc-700">
                      <button
                        type="button"
                        onClick={() => updateQuantity(itemKey, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 text-stone-900 dark:text-white flex items-center justify-center hover:bg-stone-200 dark:hover:bg-zinc-600 transition cursor-pointer shadow-2xs"
                        aria-label="Restar 1 unidad"
                      >
                        <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                      <span className="w-8 text-center font-mono font-black text-xs text-stone-950 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(itemKey, item.quantity + 1)}
                        disabled={item.max_stock <= 0 || item.quantity >= item.max_stock}
                        title={item.quantity >= item.max_stock ? `Tope de stock alcanzado (${item.max_stock} uds)` : 'Sumar 1 unidad'}
                        className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 text-stone-900 dark:text-white flex items-center justify-center hover:bg-stone-200 dark:hover:bg-zinc-600 transition cursor-pointer shadow-2xs disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Sumar 1 unidad"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-base font-black font-mono text-stone-950 dark:text-white">
                        {currencySymbol}{subtotal.toFixed(2)}
                      </p>
                      {effectiveRate > 0 && (
                        <p className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                          Bs. {(subtotal * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => removeItem(itemKey)}
                        className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 mt-1 cursor-pointer hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumen de la Orden (Alto Contraste Impeccable) */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 space-y-6 sticky top-24 shadow-sm">
            <h2 className="text-base font-black text-stone-950 dark:text-white border-b border-stone-200 dark:border-zinc-800 pb-3">
              Resumen del Pedido
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between text-stone-800 dark:text-zinc-200 font-bold">
                <span>Subtotal ({totalItems} {totalItems === 1 ? 'producto' : 'productos'})</span>
                <span className="font-mono font-bold text-stone-950 dark:text-white">
                  {currencySymbol}{totalPrice.toFixed(2)} {primaryCurrency}
                </span>
              </div>

              <div className="flex justify-between text-stone-800 dark:text-zinc-200 font-bold">
                <span>Retiro en Tienda (Pick-up)</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-black">Gratis</span>
              </div>

              <div className="flex justify-between items-baseline pt-3 border-t border-stone-200 dark:border-zinc-800">
                <span className="text-sm font-black text-stone-950 dark:text-white">Total {primaryCurrency}</span>
                <span className="text-2xl font-black font-mono" style={{ color: 'var(--tenant-primary, #ea580c)' }}>
                  {currencySymbol}{totalPrice.toFixed(2)}
                </span>
              </div>

              {totalVes && (
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-xs font-extrabold text-stone-800 dark:text-zinc-200">Total Bolívares (BCV)</span>
                  <span className="text-base font-black font-mono text-stone-950 dark:text-white">
                    Bs. {Number(totalVes).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Banner Informativo de Retiro */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs">
              <Store className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-stone-800 dark:text-zinc-200">
                <p className="font-black text-stone-950 dark:text-white">Retiro en Mostrador:</p>
                <p className="text-xs leading-relaxed text-stone-700 dark:text-zinc-300 font-medium">
                  {pickupAddress}
                </p>
              </div>
            </div>

            <Link
              href={`/t/${slug}/checkout`}
              className="w-full py-4 px-6 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] group cursor-pointer"
              style={{ backgroundColor: 'var(--tenant-primary, #ea580c)' }}
            >
              <span>Continuar al Checkout</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-stone-600 dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Transacción protegida por el Core de MarketOS</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Defensivo de Confirmación para Vaciar Carrito (Img 6b) */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-black text-stone-950 dark:text-white">
                ¿Vaciar el Carrito?
              </h3>
              <p className="text-xs font-medium text-stone-700 dark:text-zinc-300 leading-relaxed">
                Estás a punto de eliminar todos los <strong className="text-stone-950 dark:text-white">{totalItems} productos</strong> agregados a tu orden. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-stone-300 dark:border-zinc-700 text-stone-800 dark:text-zinc-200 font-bold text-xs hover:bg-stone-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
              >
                Sí, Vaciar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
