'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart/cart-store';
import { useFavorites } from '@/lib/favorites/favorites-store';
import { toast } from 'sonner';
import { Plus, Minus, Package, ShoppingBag, X, Heart } from 'lucide-react';

export interface StorefrontProduct {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  barcode?: string;
  sku: string;
  price_usd: string;
  current_stock: string;
  min_stock_alert: string;
  category_name?: string;
  image_url?: string;
  is_tax_exempt?: boolean;
}

export function ProductCard({
  product,
  priority = false,
  exchangeRate,
  primaryCurrency = 'USD',
}: {
  product: StorefrontProduct;
  priority?: boolean;
  exchangeRate?: number | null;
  primaryCurrency?: string;
}) {
  const [isAdded, setIsAdded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalQuantity, setModalQuantity] = useState(1);
  const addItem = useCart((state) => state.addItem);
  const { isFavorite, toggleFavorite } = useFavorites();

  const price = parseFloat(product.price_usd);
  const stock = parseFloat(product.current_stock || '0');
  const minAlert = parseFloat(product.min_stock_alert || '5');
  const isOutOfStock = stock <= 0;
  const isLowStock = !isOutOfStock && stock <= minAlert;
  const effectiveRate = Number(exchangeRate || 0);
  const priceBs = effectiveRate > 0 ? (price * effectiveRate) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';
  const favorited = isFavorite(product.id);

  function handleQuickAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOutOfStock) return;

    addItem({
      product_id: product.id,
      product_name: product.name,
      product_slug: product.slug || product.sku || product.id,
      price_usd: price,
      quantity: 1,
      max_stock: stock,
      image_url: product.image_url,
      is_tax_exempt: Boolean(product.is_tax_exempt),
    });

    setIsAdded(true);
    toast.success(`${product.name} agregado`, {
      description: `${currencySymbol}${price.toFixed(2)} ${primaryCurrency} · Retiro en mostrador`,
      duration: 2000,
    });

    setTimeout(() => setIsAdded(false), 1200);
  }

  function handleModalAdd() {
    if (isOutOfStock) return;

    addItem({
      product_id: product.id,
      product_name: product.name,
      product_slug: product.slug || product.sku || product.id,
      price_usd: price,
      quantity: modalQuantity,
      max_stock: stock,
      image_url: product.image_url,
      is_tax_exempt: Boolean(product.is_tax_exempt),
    });

    toast.success(`${modalQuantity}x ${product.name} agregados`, {
      description: `Total: ${currencySymbol}${(price * modalQuantity).toFixed(2)} ${primaryCurrency}`,
      duration: 2000,
    });

    setIsModalOpen(false);
    setModalQuantity(1);
  }

  return (
    <>
      <div 
        onClick={() => !isOutOfStock && setIsModalOpen(true)}
        className={`group rounded-2xl border p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-300 relative text-left select-none ${
          isOutOfStock
            ? 'bg-stone-50/80 dark:bg-zinc-900/40 border-stone-200/50 dark:border-zinc-800/40 opacity-60 grayscale-[35%] cursor-not-allowed'
            : 'bg-white dark:bg-[#141416] border-stone-200/90 dark:border-zinc-800/80 shadow-[0_3px_15px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_24px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-1 hover:border-stone-400/70 dark:hover:border-zinc-700 cursor-pointer'
        }`}
      >
        <div>
          {/* Imagen del producto limpia (sin categoría encima) */}
          <div className="aspect-square w-full rounded-xl bg-stone-50 dark:bg-zinc-900/80 border border-stone-100 dark:border-zinc-800 flex items-center justify-center mb-3 relative overflow-hidden group-hover:bg-stone-100/70 dark:group-hover:bg-zinc-800 transition-colors">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                decoding="async"
              />
            ) : (
              <Package className="w-10 h-10 text-stone-300 dark:text-zinc-600 group-hover:scale-110 transition-transform duration-300" />
            )}
            
            {/* Badge de stock (solo si está agotado o queda poco stock; NUNCA dice 'Disponible') */}
            {isOutOfStock ? (
              <span className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500 text-white shadow-xs">
                Agotado
              </span>
            ) : isLowStock ? (
              <span className="absolute top-2 left-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                Últimas {stock} uds
              </span>
            ) : null}

            {/* Botón de Favoritos (Corazón en la esquina superior derecha) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(product.id);
              }}
              className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-xs active:scale-90 ${
                favorited
                  ? 'bg-rose-500/15 border border-rose-500/40 text-rose-500'
                  : 'bg-white/80 dark:bg-zinc-800/80 hover:bg-white border border-stone-200/60 dark:border-zinc-700/60 text-stone-400 dark:text-zinc-400 hover:text-rose-500'
              }`}
              aria-label={favorited ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            >
              <Heart
                className={`w-4 h-4 transition-transform ${
                  favorited ? 'fill-rose-500 text-rose-500 scale-110' : ''
                }`}
              />
            </button>
          </div>

          {/* Categoría y SKU reubicados en la sección de información con alto contraste */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {product.category_name && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 uppercase tracking-wider">
                {product.category_name}
              </span>
            )}
            {product.sku && (
              <span className="text-[10px] font-mono font-medium text-stone-400 dark:text-zinc-500">
                {product.sku}
              </span>
            )}
          </div>

          {/* Título del Producto */}
          <h3 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-white line-clamp-2 leading-snug transition-colors min-h-[2.25rem]">
            {product.name}
          </h3>
        </div>

        {/* Sección de Precios y Botón de Acción */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-zinc-800/80">
          <div className="flex items-baseline gap-1 font-mono">
            <span 
              className="text-base sm:text-lg font-black tracking-tight"
              style={{ color: 'var(--tenant-primary, #dc2626)' }}
            >
              {currencySymbol}{price.toFixed(2)}
            </span>
            <span className="text-[10px] font-bold text-stone-400 uppercase">
              {primaryCurrency}
            </span>
          </div>

          {priceBs !== null && (
            <p className="text-[11px] font-mono font-bold text-stone-600 dark:text-zinc-300">
              Bs. {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}

          {/* Botón + Agregar / Agotado */}
          <div className="mt-2.5">
            {isOutOfStock ? (
              <button
                type="button"
                disabled
                className="w-full h-9 rounded-xl bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 font-extrabold text-xs cursor-not-allowed text-center select-none"
              >
                Agotado
              </button>
            ) : (
              <button
                type="button"
                onClick={handleQuickAdd}
                className={`w-full h-9 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
                  isAdded
                    ? 'bg-emerald-500 text-white'
                    : 'bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isAdded ? 'Agregado' : 'Agregar'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Rápido de Detalle y Cantidad */}
      {isModalOpen && !isOutOfStock && (
        <div 
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-zinc-800">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                {product.category_name || 'Producto'}
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-square w-full rounded-2xl bg-stone-50 dark:bg-zinc-900 border border-stone-100 dark:border-zinc-800 flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-4" />
              ) : (
                <Package className="w-16 h-16 text-stone-300 dark:text-zinc-600" />
              )}
            </div>

            <div>
              <h4 className="font-extrabold text-base text-stone-900 dark:text-white leading-snug">
                {product.name}
              </h4>
              {product.description && (
                <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1 line-clamp-2">
                  {product.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-lg font-black font-mono tenant-primary-text">
                  {currencySymbol}{price.toFixed(2)}
                </p>
                {priceBs !== null && (
                  <p className="text-xs font-mono font-bold text-stone-500">
                    Bs. {priceBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>

              {/* Stepper de cantidad */}
              <div className="flex items-center gap-2 border border-stone-200 dark:border-zinc-800 rounded-xl p-1 bg-stone-50 dark:bg-zinc-900 font-mono">
                <button
                  type="button"
                  onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                  className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-bold text-sm flex items-center justify-center shadow-2xs cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center font-extrabold text-sm text-stone-900 dark:text-white">
                  {modalQuantity}
                </span>
                <button
                  type="button"
                  onClick={() => setModalQuantity((q) => Math.min(stock, q + 1))}
                  className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-bold text-sm flex items-center justify-center shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleModalAdd}
              className="w-full py-3 rounded-xl tenant-primary-bg text-white font-extrabold text-sm shadow-md hover:brightness-105 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>
                Agregar al Carrito · {currencySymbol}{(price * modalQuantity).toFixed(2)}
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
