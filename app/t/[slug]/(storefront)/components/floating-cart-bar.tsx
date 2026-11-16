'use client';

import React from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { ShoppingBag, ArrowRight } from 'lucide-react';

interface FloatingCartBarProps {
  slug: string;
  exchangeRate?: number | null;
  primaryCurrency?: string;
}

export function FloatingCartBar({
  slug,
  exchangeRate,
  primaryCurrency = 'USD',
}: FloatingCartBarProps) {
  const hasMounted = useHasMounted();
  const rawTotalItems = useCart((state) => state.getTotalItems());
  const rawTotalPrice = useCart((state) => state.getTotalPrice());

  const totalItems = hasMounted ? rawTotalItems : 0;
  const totalPrice = hasMounted ? rawTotalPrice : 0;
  const effectiveRate = Number(exchangeRate || 0);
  const totalBs = effectiveRate > 0 ? (totalPrice * effectiveRate).toFixed(2) : null;
  const currencySymbol = primaryCurrency === 'EUR' ? '€' : '$';

  // Solo se muestra si hay al menos 1 producto en el carrito
  if (totalItems === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden animate-in slide-in-from-bottom-5 duration-300">
      <Link
        href={`/t/${slug}/cart`}
        className="w-full tenant-primary-bg text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between border border-white/20 active:scale-[0.99] transition-transform cursor-pointer"
      >
        {/* Lado Izquierdo: Icono + Detalle Bimonetario */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center relative shadow-inner">
            <ShoppingBag className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 bg-white text-stone-900 font-black text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-xs">
              {totalItems}
            </span>
          </div>
          <div className="text-left font-mono">
            <p className="text-xs font-black leading-tight text-white font-sans">
              {totalItems} {totalItems === 1 ? 'producto' : 'productos'} en carrito
            </p>
            <p className="text-[11px] font-bold text-white/90">
              {currencySymbol}{totalPrice.toFixed(2)}
              {totalBs && (
                <span className="text-white/80 font-normal">
                  {' '}· Bs. {Number(totalBs).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Lado Derecho: Botón Blanco de Acción */}
        <div className="flex items-center gap-1.5 bg-white tenant-primary-text px-3.5 py-2 rounded-xl font-extrabold text-xs shadow-md shrink-0">
          <span>Ver Carrito</span>
          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </div>
      </Link>
    </div>
  );
}
