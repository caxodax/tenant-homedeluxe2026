'use client';

import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import Link from 'next/link';
import { 
  ShoppingBag, ArrowLeft, Plus, Minus, Trash2, 
  Store, ShieldCheck, ArrowRight, Package
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

  const effectiveRate = Number(exchangeRate || 0);
  const totalVes = effectiveRate > 0 ? (totalPrice * effectiveRate).toFixed(2) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

  if (!hasMounted) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-lime-500/10 border border-lime-500/20 text-lime-700 dark:text-lime-400 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400">Cargando carrito de compras...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-lime-500/10 border border-lime-500/20 text-lime-700 dark:text-lime-400 flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">
          Tu carrito está vacío
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 max-w-sm mx-auto">
          Aún no has añadido ningún producto de nuestra vitrina. Explora el catálogo y agrega tus favoritos.
        </p>
        <Link
          href={`/t/${slug}`}
          className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-2xl bg-lime-500 hover:bg-lime-600 text-black font-extrabold text-sm shadow-sm transition-all"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href={`/t/${slug}`}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Carrito de Compras
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {totalItems} artículos en tu orden de retiro
            </p>
          </div>
        </div>

        <button
          onClick={clearCart}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Vaciar Carrito</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Listado de Productos (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          {items.map((item) => {
            const subtotal = item.price_usd * item.quantity;

            return (
              <div
                key={item.product_id}
                className="p-4 rounded-2xl bg-white dark:bg-[#121214] border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800/80 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200/60 dark:border-zinc-700/60">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-slate-400 dark:text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {item.product_name}
                    </h3>
                    <p className="text-xs font-mono text-slate-400 dark:text-zinc-500 mt-0.5">
                      {currencySymbol}{item.price_usd.toFixed(2)} {primaryCurrency} c/u
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  {/* Selector de Cantidad */}
                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-xl">
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center hover:bg-slate-200 transition cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-xs text-slate-900 dark:text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                      disabled={item.quantity >= item.max_stock}
                      className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 flex items-center justify-center hover:bg-slate-200 transition cursor-pointer disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Subtotal del Ítem */}
                  <div className="text-right min-w-[5rem]">
                    <p className="text-sm font-black font-mono text-slate-900 dark:text-white">
                      {currencySymbol}{subtotal.toFixed(2)}
                    </p>
                    {effectiveRate > 0 && (
                      <p className="text-[11px] font-mono font-bold text-lime-700 dark:text-lime-400">
                        Bs. {(subtotal * effectiveRate).toFixed(2)}
                      </p>
                    )}
                    <button
                      onClick={() => removeItem(item.product_id)}
                      className="text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-400 mt-0.5 cursor-pointer"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Resumen de la Orden (4-5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="p-6 rounded-3xl bg-white dark:bg-[#121214] border border-slate-200/80 dark:border-zinc-800 space-y-6 sticky top-24 shadow-sm">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white border-b border-slate-100 dark:border-zinc-800/80 pb-3">
              Resumen del Pedido
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                <span>Subtotal ({totalItems} productos)</span>
                <span className="font-mono font-medium">{currencySymbol}{totalPrice.toFixed(2)} {primaryCurrency}</span>
              </div>
              <div className="flex justify-between text-slate-500 dark:text-zinc-400">
                <span>Retiro en Tienda (Pick-up)</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">Gratis</span>
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t border-slate-100 dark:border-zinc-800">
                <span className="text-sm font-black text-slate-900 dark:text-white">Total {primaryCurrency}</span>
                <span className="text-2xl font-black font-mono text-lime-700 dark:text-lime-400">
                  {currencySymbol}{totalPrice.toFixed(2)}
                </span>
              </div>
              {totalVes && (
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Total Bolívares (BCV)</span>
                  <span className="text-base font-extrabold font-mono text-slate-950 dark:text-white">
                    Bs. {Number(totalVes).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Banner Informativo de Retiro */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 flex items-start gap-2.5 text-xs">
              <Store className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-slate-600 dark:text-zinc-300">
                <p className="font-bold text-slate-900 dark:text-white">Retiro en Mostrador:</p>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                  {pickupAddress}
                </p>
              </div>
            </div>

            <Link
              href={`/t/${slug}/checkout`}
              className="w-full py-4 px-6 rounded-2xl bg-lime-500 hover:bg-lime-600 text-black font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all group"
            >
              <span>Continuar al Checkout</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Transacción protegida por el Core de MarketOS</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
