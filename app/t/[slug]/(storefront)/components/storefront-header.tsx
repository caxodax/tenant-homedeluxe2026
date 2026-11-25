'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCart } from '@/lib/cart/cart-store';
import { useFavorites } from '@/lib/favorites/favorites-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { ShoppingCart, Store, Phone, Heart, Truck } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { OrderTrackerModal } from '@/components/storefront/order-tracker-modal';

interface StorefrontHeaderProps {
  slug: string;
  storeName: string;
  whatsappNumber: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  exchangeRate?: number | null;
  primaryCurrency?: string;
  onOpenFavorites?: () => void;
}

export function StorefrontHeader({
  slug,
  storeName,
  whatsappNumber,
  logoUrl,
  primaryColor,
  exchangeRate,
  primaryCurrency = 'USD',
  onOpenFavorites,
}: StorefrontHeaderProps) {
  const hasMounted = useHasMounted();
  const pathname = usePathname();
  const router = useRouter();
  const rawTotalItems = useCart((state) => state.getTotalItems());
  const rawTotalPrice = useCart((state) => state.getTotalPrice());
  const { favoritesCount, isFavoritesOnly, toggleFavoritesOnly, setIsFavoritesOnly } = useFavorites();
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);

  const handleFavoritesClick = () => {
    if (onOpenFavorites) {
      onOpenFavorites();
      return;
    }
    const isCatalogPage = pathname === `/t/${slug}` || pathname === `/t/${slug}/`;
    if (isCatalogPage) {
      toggleFavoritesOnly();
      const elem = document.getElementById('catalog-filters-sticky') || document.getElementById('catalog-grid');
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      setIsFavoritesOnly(true);
      router.push(`/t/${slug}?filter=favorites`);
    }
  };

  const totalItems = hasMounted ? rawTotalItems : 0;
  const totalPrice = hasMounted ? rawTotalPrice : 0;
  const effectiveRate = Number(exchangeRate || 0);
  const totalBs = effectiveRate > 0 ? (totalPrice * effectiveRate).toFixed(2) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

  return (
    <header
      className="sticky top-0 z-40 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md border-b border-stone-200/80 dark:border-zinc-800/80 transition-colors shadow-xs w-full max-w-full overflow-hidden"
      style={primaryColor ? { borderTop: `4px solid ${primaryColor}` } : undefined}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 min-h-[60px] sm:min-h-[70px] py-1.5 sm:py-2 flex items-center justify-between gap-1.5 sm:gap-3 w-full max-w-full">
        {/* Identidad del Comercio */}
        <Link 
          href={`/t/${slug}`} 
          className="flex items-center gap-2 sm:gap-3 group shrink min-w-0"
        >
          {logoUrl ? (
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shadow-xs group-hover:scale-105 transition-transform shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl tenant-secondary-surface border border-stone-200 dark:border-zinc-700 flex items-center justify-center font-extrabold text-sm sm:text-base shadow-xs group-hover:scale-105 transition-transform shrink-0">
              <Store className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          )}
          <div className="flex flex-col min-w-0 max-w-[140px] xs:max-w-[180px] sm:max-w-xs">
            <span className="text-sm sm:text-lg font-black tracking-tight text-stone-950 dark:text-white truncate group-hover:tenant-primary-text transition-colors">
              {storeName}
            </span>
          </div>
        </Link>

        {/* Acciones: Tasa BCV, Atención, Favoritos, Tema y Carrito */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {effectiveRate > 0 && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-950 dark:text-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-stone-600 dark:text-zinc-400">BCV ({primaryCurrency}):</span>
              <span className="font-extrabold text-stone-950 dark:text-white">
                Bs. {effectiveRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Atención</span>
            </a>
          )}

          {/* Botón Core Rastrear Pedido (como V1) */}
          <button
            type="button"
            onClick={() => setIsTrackerOpen(true)}
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-stone-200/80 dark:border-zinc-700 transition-all cursor-pointer active:scale-95"
            title="Rastrear mi Pedido"
          >
            <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden md:inline">Rastrear</span>
          </button>

          {/* Botón de Favoritos en Header */}
          <button
            type="button"
            onClick={handleFavoritesClick}
            className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
              isFavoritesOnly
                ? 'bg-rose-500/10 dark:bg-rose-500/20 border-rose-500/40 text-rose-600 dark:text-rose-400'
                : 'bg-stone-100 dark:bg-zinc-800/80 hover:bg-stone-200/70 dark:hover:bg-zinc-700 border-stone-200/80 dark:border-zinc-700/80 text-stone-700 dark:text-zinc-300'
            }`}
            aria-label="Ver favoritos"
            title={isFavoritesOnly ? "Ver catálogo completo" : "Mis Favoritos"}
          >
            <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${hasMounted && (favoritesCount > 0 || isFavoritesOnly) ? 'fill-rose-500 text-rose-500' : ''}`} />
            {hasMounted && favoritesCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black font-mono flex items-center justify-center ring-2 ring-white dark:ring-[#121214] shadow-xs">
                {favoritesCount}
              </span>
            )}
          </button>

          <ThemeToggle />

          {/* Botón Carrito en Header con Badge Despegado y Espaciado Óptico */}
          <Link
            href={`/t/${slug}/cart`}
            title={totalItems > 0 ? `Ver carrito de compras (${totalItems} ${totalItems === 1 ? 'producto' : 'productos'})` : 'Ver carrito de compras'}
            aria-label="Ver carrito de compras"
            className="relative flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl tenant-primary-bg text-white font-extrabold text-xs shadow-md hover:brightness-105 active:scale-[0.98] transition-all group select-none shrink-0"
            style={{ backgroundColor: 'var(--tenant-primary, #dc2626)', color: 'var(--tenant-contrast, #ffffff)' }}
          >
            <div className="relative flex items-center justify-center">
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
              {totalItems > 0 && (
                <span 
                  className="absolute -top-2.5 -right-2.5 sm:-right-3 min-w-[18px] sm:min-w-[20px] h-[18px] sm:h-[20px] px-1 rounded-full bg-white text-stone-950 font-black font-mono text-[9px] sm:text-[10px] flex items-center justify-center shadow-md border"
                  style={{ borderColor: 'var(--tenant-primary, #dc2626)' }}
                >
                  {totalItems}
                </span>
              )}
            </div>

            <div className="hidden xs:flex flex-col text-left font-mono leading-tight pl-1">
              <span className="font-black text-xs text-white">
                {currencySymbol}{totalPrice.toFixed(2)}
              </span>
              {totalBs && (
                <span className="hidden sm:inline text-[10px] font-bold text-white/90">
                  Bs. {Number(totalBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </Link>
        </div>
      </div>

      {/* Modal Core de Rastreo de Pedidos */}
      <OrderTrackerModal
        slug={slug}
        isOpen={isTrackerOpen}
        onClose={() => setIsTrackerOpen(false)}
        currencySymbol={currencySymbol}
      />
    </header>
  );
}
