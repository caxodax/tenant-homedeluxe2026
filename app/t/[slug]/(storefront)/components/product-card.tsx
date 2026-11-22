'use client';

import { useState, useMemo, memo } from 'react';
import { useCart } from '@/lib/cart/cart-store';
import { useFavorites } from '@/lib/favorites/favorites-store';
import { toast } from 'sonner';
import { Plus, Minus, Package, ShoppingBag, X, Heart, SlidersHorizontal, GlassWater, UtensilsCrossed, Sparkles } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-portal';
import { FormattedDescription } from '@/components/ui/formatted-description';
import {
  FoodProductCustomizerModal,
  type ProductVariant,
  type ModifierGroup,
  type CustomizerResult,
} from '@/components/food-service/food-product-customizer-modal';

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
  variants?: ProductVariant[];
  modifier_groups?: ModifierGroup[];
}

function ProductCardComponent({
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
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [modalQuantity, setModalQuantity] = useState(1);
  const addItem = useCart((state) => state.addItem);
  const cartItems = useCart((state) => state.items);
  const { isFavorite, toggleFavorite } = useFavorites();

  const price = Math.max(0, parseFloat(product.price_usd || '0'));
  const stock = Math.max(0, parseFloat(product.current_stock || '0'));
  const minAlert = Math.max(0, parseFloat(product.min_stock_alert || '5'));
  const isOutOfStock = stock <= 0;
  const isLowStock = !isOutOfStock && stock <= minAlert;
  const effectiveRate = Number(exchangeRate || 0);
  const priceBs = effectiveRate > 0 ? (price * effectiveRate) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';
  const favorited = isFavorite(product.id);

  // Unidades actualmente en el carrito para respetar estrictamente el tope
  const cartItem = cartItems.find((i) => i.product_id === product.id);
  const inCartCount = cartItem ? cartItem.quantity : 0;
  const availableToAdd = Math.max(0, stock - inCartCount);
  const isMaxInCart = !isOutOfStock && inCartCount >= stock;

  const hasCustomization = Boolean(
    (product.variants && product.variants.length > 0) ||
    (product.modifier_groups && product.modifier_groups.length > 0)
  );

  const isBeverage = useMemo(() => {
    const text = `${product.category_name || ''} ${product.name || ''}`.toLowerCase();
    return /bebida|agua|refresco|jugo|soda|drink|liquido|malta|cerveza|tea|cafe|café/.test(text);
  }, [product.category_name, product.name]);

  function handleCardClick() {
    if (isOutOfStock) return;
    if (hasCustomization) {
      setIsCustomizerOpen(true);
    } else {
      setModalQuantity(Math.min(1, Math.max(1, availableToAdd)));
      setIsModalOpen(true);
    }
  }

  function handleQuickAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOutOfStock) return;

    if (hasCustomization) {
      setIsCustomizerOpen(true);
      return;
    }

    if (availableToAdd <= 0) {
      toast.warning(`Tope alcanzado: Solo hay ${stock} uds disponibles de "${product.name}".`, {
        duration: 2500,
      });
      return;
    }

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

  function handleCustomizerConfirm(res: CustomizerResult) {
    const qtyToAdd = Math.min(Math.max(1, res.quantity), Math.max(1, availableToAdd));
    if (availableToAdd <= 0) {
      toast.warning(`Tope alcanzado: Solo hay ${stock} unidades disponibles.`);
      return;
    }

    addItem({
      product_id: product.id,
      product_name: product.name,
      product_slug: product.slug || product.sku || product.id,
      price_usd: Math.max(0, res.unit_price),
      quantity: qtyToAdd,
      max_stock: stock,
      image_url: product.image_url,
      is_tax_exempt: Boolean(product.is_tax_exempt),
      variant_id: res.variant_id,
      variant_name: res.variant_name,
      selected_modifiers: res.selected_modifiers,
      prep_notes: res.prep_notes,
    });

    toast.success(`${qtyToAdd}x ${product.name} agregado`, {
      description: res.variant_name
        ? `${res.variant_name} · Total: ${currencySymbol}${(res.unit_price * qtyToAdd).toFixed(2)}`
        : `Total: ${currencySymbol}${(res.unit_price * qtyToAdd).toFixed(2)}`,
      duration: 2500,
    });
  }

  function handleModalAdd() {
    if (isOutOfStock || availableToAdd <= 0) {
      toast.warning(`No puedes agregar más unidades que las disponibles (${stock}).`);
      return;
    }

    const finalAddQty = Math.min(modalQuantity, availableToAdd);

    addItem({
      product_id: product.id,
      product_name: product.name,
      product_slug: product.slug || product.sku || product.id,
      price_usd: price,
      quantity: finalAddQty,
      max_stock: stock,
      image_url: product.image_url,
      is_tax_exempt: Boolean(product.is_tax_exempt),
    });

    toast.success(`${finalAddQty}x ${product.name} agregados`, {
      description: `Total: ${currencySymbol}${(price * finalAddQty).toFixed(2)} ${primaryCurrency}`,
      duration: 2000,
    });

    setIsModalOpen(false);
    setModalQuantity(1);
  }

  return (
    <>
      <div 
        onClick={handleCardClick}
        className={`group rounded-2xl sm:rounded-3xl border p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-300 relative text-left select-none ${
          isOutOfStock
            ? 'bg-stone-50/80 dark:bg-zinc-900/40 border-stone-200/50 dark:border-zinc-800/40 opacity-60 grayscale-[35%] cursor-not-allowed'
            : 'bg-white/95 dark:bg-[#15110e] border-stone-200/90 dark:border-zinc-800/80 hover:border-[var(--tenant-primary)]/50 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_-6px_rgba(179,81,30,0.12)] hover:-translate-y-1 cursor-pointer'
        }`}
      >
        <div>
          {/* Imagen del producto limpia o Placeholder Gastronómico Elegante */}
          <div className="aspect-square w-full rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200/70 dark:border-zinc-800 flex items-center justify-center mb-3 relative overflow-hidden group-hover:border-stone-300 dark:group-hover:border-zinc-700 transition-colors">
            {product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                loading={priority ? 'eager' : 'lazy'}
                fetchPriority={priority ? 'high' : 'auto'}
                decoding="async"
              />
            ) : isBeverage ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-br from-sky-500/10 via-stone-50 to-indigo-500/10 dark:from-sky-950/20 dark:via-zinc-900 dark:to-indigo-950/30 text-sky-700 dark:text-sky-300">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/20 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform duration-300 shadow-2xs">
                  <GlassWater className="w-6 h-6 text-sky-600 dark:text-sky-400 stroke-[1.75]" />
                </div>
                <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 text-center line-clamp-1">
                  Bebida Refrescante
                </span>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-gradient-to-br from-amber-500/10 via-stone-50 to-orange-500/10 dark:from-amber-950/20 dark:via-zinc-900 dark:to-orange-950/30 text-amber-800 dark:text-amber-300">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/20 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform duration-300 shadow-2xs">
                  <UtensilsCrossed className="w-6 h-6 text-amber-600 dark:text-amber-400 stroke-[1.75]" />
                </div>
                <span className="text-[10px] font-bold text-stone-500 dark:text-zinc-400 text-center line-clamp-1">
                  Especialidad de la Casa
                </span>
              </div>
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

            {/* Badge indicador de personalización */}
            {hasCustomization && !isOutOfStock && (
              <span className="absolute bottom-2 left-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-stone-900/85 dark:bg-zinc-800/90 text-white backdrop-blur-md shadow-xs flex items-center gap-1">
                <SlidersHorizontal className="w-2.5 h-2.5 text-orange-400" />
                <span className="hidden xs:inline">Personalizable</span>
              </span>
            )}

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
              <span 
                className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--tenant-warm-tint, rgba(252,232,200,0.3))',
                  color: 'var(--tenant-brand-title, #4D2109)',
                }}
              >
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
          <h3 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-white group-hover:tenant-primary-text line-clamp-2 leading-snug transition-colors min-h-[2.25rem]">
            {product.name}
          </h3>
        </div>

        {/* Sección de Precios y Botón de Acción */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 dark:border-zinc-800/80">
          {hasCustomization && (
            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider block mb-0.5">
              Desde
            </span>
          )}
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

          {/* Botón + Agregar / Agotado / Máximo en Carrito */}
          <div className="mt-2.5">
            {isOutOfStock ? (
              <button
                type="button"
                disabled
                className="w-full h-9 rounded-xl bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 font-extrabold text-xs cursor-not-allowed text-center select-none"
              >
                Agotado
              </button>
            ) : isMaxInCart ? (
              <button
                type="button"
                disabled
                className="w-full h-9 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-extrabold text-xs cursor-not-allowed text-center select-none"
                title="Ya tienes todas las existencias disponibles en tu carrito"
              >
                En Carrito (Máximo: {stock})
              </button>
            ) : (
              <button
                type="button"
                onClick={handleQuickAdd}
                className={`w-full h-9 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.98] ${
                  isAdded
                    ? 'bg-emerald-500 text-white'
                    : 'tenant-primary-bg hover:brightness-105'
                }`}
              >
                {isAdded ? (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>¡Agregado!</span>
                  </>
                ) : hasCustomization ? (
                  <>
                    <SlidersHorizontal className="w-3.5 h-3.5 opacity-90" />
                    <span>Personalizar</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Agregar</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Rápido de Detalle y Cantidad */}
      <ModalPortal
        isOpen={isModalOpen && !isOutOfStock}
        onClose={() => setIsModalOpen(false)}
        backdropClassName="bg-black/60 backdrop-blur-xs"
        containerClassName="p-4 items-center"
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

          <div className="space-y-1.5">
            <h4 className="font-extrabold text-base text-stone-900 dark:text-white leading-snug">
              {product.name}
            </h4>

            {inCartCount > 0 && (
              <p className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                Ya tienes {inCartCount} de {stock} uds en el carrito
              </p>
            )}

            {product.description && (
              <div className="pt-2 border-t border-stone-100 dark:border-zinc-800/80 max-h-44 overflow-y-auto overscroll-contain pr-1">
                <FormattedDescription description={product.description} />
              </div>
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

            {/* Stepper de cantidad acotado al stock disponible */}
            <div className="flex items-center gap-2 border border-stone-200 dark:border-zinc-800 rounded-xl p-1 bg-stone-50 dark:bg-zinc-900 font-mono">
              <button
                type="button"
                onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                disabled={modalQuantity <= 1}
                className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-bold text-sm flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center font-extrabold text-sm text-stone-900 dark:text-white">
                {modalQuantity}
              </span>
              <button
                type="button"
                onClick={() => setModalQuantity((q) => Math.min(availableToAdd, q + 1))}
                disabled={modalQuantity >= availableToAdd || availableToAdd <= 0}
                className="w-7 h-7 rounded-lg bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-bold text-sm flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {availableToAdd <= 0 ? (
            <button
              type="button"
              disabled
              className="w-full py-3 rounded-xl bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 font-extrabold text-xs cursor-not-allowed text-center select-none"
            >
              Tope de Stock en Carrito ({stock} uds)
            </button>
          ) : (
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
          )}
        </div>
      </ModalPortal>

      {/* Modal Gastronómico Avanzado para Restaurantes (Tamaños, Proteína y Extras) */}
      {hasCustomization && (
        <FoodProductCustomizerModal
          product={product}
          isOpen={isCustomizerOpen}
          onClose={() => setIsCustomizerOpen(false)}
          onConfirm={handleCustomizerConfirm}
          primaryCurrency={primaryCurrency}
          exchangeRate={exchangeRate}
        />
      )}
    </>
  );
}

export const ProductCard = memo(ProductCardComponent);
