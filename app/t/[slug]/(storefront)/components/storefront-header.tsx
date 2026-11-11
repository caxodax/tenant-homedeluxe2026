'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { ShoppingBag, Store, Phone } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

interface StorefrontHeaderProps {
  slug: string;
  storeName: string;
  whatsappNumber: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export function StorefrontHeader({
  slug,
  storeName,
  whatsappNumber,
  logoUrl,
  primaryColor,
}: StorefrontHeaderProps) {
  const hasMounted = useHasMounted();
  const rawTotalItems = useCart((state) => state.getTotalItems());
  const rawTotalPrice = useCart((state) => state.getTotalPrice());

  const totalItems = hasMounted ? rawTotalItems : 0;
  const totalPrice = hasMounted ? rawTotalPrice : 0;

  return (
    <header
      className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 transition-colors shadow-xs"
      style={primaryColor ? { borderTop: `4px solid ${primaryColor}` } : undefined}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[72px] py-2 flex items-center justify-between gap-4">
        {/* Identidad del Comercio */}
        <Link 
          href={`/t/${slug}`} 
          className="flex items-center gap-3 group shrink-0"
        >
          {logoUrl ? (
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-2xl tenant-secondary-surface border border-lime-500/40 flex items-center justify-center font-extrabold text-base shadow-sm group-hover:scale-105 transition-transform">
              <Store className="w-6 h-6" />
            </div>
          )}
          <div>
            <span className="text-lg font-black tracking-tight text-slate-950 dark:text-white line-clamp-1 group-hover:text-lime-700 dark:group-hover:text-lime-400 transition-colors">
              {storeName}
            </span>
            <span className="inline-block text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded-md tenant-secondary-badge border">
              Vitrina Digital
            </span>
          </div>
        </Link>

        {/* Acciones y Carrito */}
        <div className="flex items-center gap-2 sm:gap-3">
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

          <ThemeToggle />

          {/* Botón Flotante / Sticky de Carrito */}
          <Link
            href={`/t/${slug}/cart`}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-lime-500 hover:bg-lime-600 text-black font-extrabold text-xs shadow-sm transition-all group"
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2.5 w-4 h-4 rounded-full bg-black text-lime-400 text-[10px] font-black font-mono flex items-center justify-center ring-2 ring-lime-500">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="font-mono hidden sm:inline">
              ${totalPrice.toFixed(2)}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
