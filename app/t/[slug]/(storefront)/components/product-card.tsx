'use client';

import { useState } from 'react';
import { useCart } from '@/lib/cart/cart-store';
import { toast } from 'sonner';
import { Plus, Minus, Check, Package, ShoppingBag, X, Barcode, Store } from 'lucide-react';

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

  const price = parseFloat(product.price_usd);
  const stock = parseFloat(product.current_stock || '0');
  const isOutOfStock = stock <= 0;
  const isLowStock = stock <= 5 && stock > 0;
  const effectiveRate = Number(exchangeRate || 0);
  const priceBs = effectiveRate > 0 ? (price * effectiveRate).toFixed(2) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

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
      duration: 2500,
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
      duration: 2500,
    });

    setIsModalOpen(false);
    setModalQuantity(1);
  }

  return (
    <>
      <div 
        onClick={() => setIsModalOpen(true)}
        className="group rounded-2xl bg-white dark:bg-[#141416] border border-stone-200/90 dark:border-zinc-800/80 p-4 sm:p-5 flex flex-col justify-between transition-all duration-300 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_14px_30px_-6px_rgba(0,0,0,0.12)] hover:-translate-y-1 hover:border-stone-400/80 dark:hover:border-zinc-700 cursor-pointer"
      >
        <div>
          {/* Imagen del producto con contenedor de alto contraste */}
          <div className="aspect-square w-full rounded-xl bg-stone-50 dark:bg-zinc-900/80 border border-stone-100 dark:border-zinc-800 flex items-center justify-center mb-3.5 relative overflow-hidden group-hover:bg-stone-100/70 dark:group-hover:bg-zinc-800 transition-colors">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                decoding="async"
              />
            ) : (
              <Package className="w-10 h-10 text-slate-400 dark:text-zinc-600 group-hover:scale-110 transition-transform duration-300" />
            )}
            
            {/* Badge de stock flotante */}
            <div className="absolute top-2.5 right-2.5">
              {isOutOfStock ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-300 dark:border-rose-500/30 backdrop-blur-xs">
                  Agotado
                </span>
              ) : isLowStock ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 backdrop-blur-xs">
                  Últimas {stock} uds
                </span>
              ) : (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20 backdrop-blur-xs">
                  Disponible
                </span>
              )}
            </div>

            {product.category_name && (
              <span className="absolute bottom-2.5 left-2.5 text-[10px] font-mono uppercase font-black tracking-wider px-2 py-0.5 rounded-md tenant-secondary-surface border border-white/15 backdrop-blur-xs">
                {product.category_name}
              </span>
            )}
          </div>

          {/* Título y SKU con alto contraste en modo claro */}
          <p className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300">
            SKU: {product.sku || 'N/A'}
          </p>
          <h3 className="text-sm sm:text-[15px] font-extrabold text-slate-950 dark:text-white line-clamp-2 leading-snug group-hover:text-lime-700 dark:group-hover:text-lime-400 transition-colors mt-0.5">
            {product.name}
          </h3>
        </div>

        {/* Precios: Base USD + Tasa Local VES si está configurada */}
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800/70 flex items-center justify-between gap-2">
          <div>
            <p className="text-xl font-black font-mono text-slate-950 dark:text-white leading-none">
              {currencySymbol}{price.toFixed(2)}
            </p>
            {priceBs ? (
              <p className="text-xs font-mono font-bold text-lime-700 dark:text-lime-400 mt-1">
                Bs. {Number(priceBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            ) : (
              <p className="text-[11px] font-bold text-slate-700 dark:text-zinc-400 mt-1">
                Precio Base {primaryCurrency}
              </p>
            )}
          </div>

          <button
            onClick={handleQuickAdd}
            disabled={isOutOfStock}
            className={`h-10 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed ${
              isOutOfStock
                ? 'bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600'
                : isAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-lime-500 hover:bg-lime-600 text-black active:scale-95'
            }`}
            title="Añadir directo al carrito"
          >
            {isAdded ? (
              <>
                <Check className="w-4 h-4" />
                <span>Agregado</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Añadir</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal de Detalle del Producto */}
      {isModalOpen && (
        <div 
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl space-y-0 animate-in zoom-in-95 duration-200"
          >
            {/* Header / Botón Cerrar */}
            <div className="relative aspect-video w-full bg-slate-100 dark:bg-zinc-850 overflow-hidden flex items-center justify-center">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-contain p-4"
                />
              ) : (
                <Package className="w-16 h-16 text-slate-300 dark:text-zinc-600" />
              )}
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center cursor-pointer transition shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>

              {product.category_name && (
                <span className="absolute bottom-3 left-3 text-xs font-mono uppercase font-black px-2.5 py-1 rounded-lg bg-slate-900/90 text-white dark:bg-black/90">
                  {product.category_name}
                </span>
              )}
            </div>

            {/* Contenido del Detalle */}
            <div className="p-6 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-slate-500 dark:text-zinc-400">
                    SKU: {product.sku || 'N/A'}
                  </span>
                  {product.barcode && (
                    <>
                      <span className="text-slate-300 dark:text-zinc-700">·</span>
                      <span className="text-xs font-mono text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                        <Barcode className="w-3.5 h-3.5" />
                        {product.barcode}
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white leading-snug">
                  {product.name}
                </h2>
              </div>

              {/* Descripción */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800">
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                  {product.description || 'Producto disponible para despacho y retiro en tienda física.'}
                </p>
              </div>

              {/* Disponibilidad y Precio */}
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">Precio Unitario</p>
                  <p className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                    {currencySymbol}{price.toFixed(2)} <span className="text-xs font-normal text-slate-400">{primaryCurrency}</span>
                  </p>
                  {priceBs && (
                    <p className="text-xs font-mono font-bold text-lime-700 dark:text-lime-400">
                      Bs. {Number(priceBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold text-slate-500 dark:text-zinc-400">Disponibilidad</p>
                  <span className={`inline-block text-xs font-extrabold px-2.5 py-1 rounded-lg mt-0.5 ${
                    isOutOfStock
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400'
                      : isLowStock
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-400'
                      : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-400'
                  }`}>
                    {isOutOfStock ? 'Sin existencias' : `${stock} en tienda`}
                  </span>
                </div>
              </div>

              {/* Selector de Cantidad y Botón de Añadir */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex items-center bg-slate-100 dark:bg-zinc-800 rounded-xl p-1 border border-slate-200 dark:border-zinc-700">
                  <button
                    onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                    disabled={modalQuantity <= 1}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 flex items-center justify-center text-slate-800 dark:text-zinc-200 hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-sm text-slate-900 dark:text-white">
                    {modalQuantity}
                  </span>
                  <button
                    onClick={() => setModalQuantity(Math.min(stock, modalQuantity + 1))}
                    disabled={modalQuantity >= stock}
                    className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-700 flex items-center justify-center text-slate-800 dark:text-zinc-200 hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  onClick={handleModalAdd}
                  disabled={isOutOfStock}
                  className="flex-1 py-3.5 px-5 rounded-xl bg-lime-500 hover:bg-lime-600 disabled:bg-slate-200 text-black font-black text-sm shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Añadir al Carrito ({currencySymbol}{(price * modalQuantity).toFixed(2)})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
