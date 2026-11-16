'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart/cart-store';
import { useFavorites } from '@/lib/favorites/favorites-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { ShoppingBag, Store, Phone, Heart } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

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
  const rawTotalItems = useCart((state) => state.getTotalItems());
  const rawTotalPrice = useCart((state) => state.getTotalPrice());
  const { favoritesCount } = useFavorites();

  const totalItems = hasMounted ? rawTotalItems : 0;
  const totalPrice = hasMounted ? rawTotalPrice : 0;
  const effectiveRate = Number(exchangeRate || 0);
  const totalBs = effectiveRate > 0 ? (totalPrice * effectiveRate).toFixed(2) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

  return (
    <header
      className="sticky top-0 z-40 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md border-b border-stone-200/80 dark:border-zinc-800/80 transition-colors shadow-xs"
      style={primaryColor ? { borderTop: `4px solid ${primaryColor}` } : undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[70px] py-2 flex items-center justify-between gap-3">
        {/* Identidad del Comercio */}
        <Link 
          href={`/t/${slug}`} 
          className="flex items-center gap-3 group shrink-0"
        >
          {logoUrl ? (
            <div className="w-11 h-11 rounded-2xl bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shadow-xs group-hover:scale-105 transition-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-2xl tenant-secondary-surface border border-stone-200 dark:border-zinc-700 flex items-center justify-center font-extrabold text-base shadow-xs group-hover:scale-105 transition-transform">
              <Store className="w-5 h-5" />
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight text-stone-950 dark:text-white line-clamp-1 group-hover:tenant-primary-text transition-colors">
              {storeName}
            </span>
            <span className="inline-block text-[10px] font-mono font-bold uppercase px-1.5 py-0.2 rounded-md tenant-secondary-badge border w-fit">
              Vitrina Digital
            </span>
          </div>
        </Link>

        {/* Acciones: Tasa BCV, Atención, Favoritos, Tema y Carrito */}
        <div className="flex items-center gap-2 sm:gap-3">
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

          {/* Botón de Favoritos en Header */}
          <button
            type="button"
            onClick={onOpenFavorites}
            className="relative w-10 h-10 rounded-2xl bg-stone-100 dark:bg-zinc-800/80 hover:bg-stone-200/70 dark:hover:bg-zinc-700 border border-stone-200/80 dark:border-zinc-700/80 flex items-center justify-center text-stone-700 dark:text-zinc-300 transition-all cursor-pointer active:scale-95"
            aria-label="Ver favoritos"
            title="Mis Favoritos"
          >
            <Heart className={`w-4 h-4 ${hasMounted && favoritesCount > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
            {hasMounted && favoritesCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black font-mono flex items-center justify-center ring-2 ring-white dark:ring-[#121214] shadow-xs">
                {favoritesCount}
              </span>
            )}
          </button>

          <ThemeToggle />

          {/* Botón Carrito en Header con Badge Despegado y Espaciado Óptico */}
          <Link
            href={`/t/${slug}/cart`}
            className="relative flex items-center gap-2 px-3.5 py-2.5 rounded-2xl tenant-primary-bg text-white font-extrabold text-xs shadow-md hover:brightness-105 active:scale-[0.98] transition-all group select-none"
            style={{ backgroundColor: 'var(--tenant-primary, #dc2626)', color: 'var(--tenant-contrast, #ffffff)' }}
          >
            <div className="relative flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-white" />
              {totalItems > 0 && (
                <span 
                  className="absolute -top-2.5 -right-3 min-w-[20px] h-[20px] px-1 rounded-full bg-white text-stone-950 font-black font-mono text-[10px] flex items-center justify-center shadow-md border"
                  style={{ borderColor: 'var(--tenant-primary, #dc2626)' }}
                >
                  {totalItems}
                </span>
              )}
            </div>

            <div className="hidden sm:flex flex-col text-left font-mono leading-tight pl-1.5">
              <span className="font-black text-xs text-white">
                {currencySymbol}{totalPrice.toFixed(2)}
              </span>
              {totalBs && (
                <span className="text-[10px] font-bold text-white/90">
                  Bs. {Number(totalBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
