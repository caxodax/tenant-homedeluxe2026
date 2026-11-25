'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart/cart-store';
import { useHasMounted } from '@/lib/cart/use-cart-hydrated';
import { ShoppingCart, ArrowRight, X } from 'lucide-react';

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

  const [isDismissed, setIsDismissed] = useState(false);
  const lastItemsCount = useRef(totalItems);

  // Si el usuario agrega más productos tras haber cerrado la barra, volver a mostrarla
  useEffect(() => {
    if (totalItems > lastItemsCount.current) {
      setIsDismissed(false);
    }
    lastItemsCount.current = totalItems;
  }, [totalItems]);

  // Solo se muestra si hay al menos 1 producto y el usuario no la descartó
  if (totalItems === 0 || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden animate-in slide-in-from-bottom-5 duration-300">
      <div className="relative group">
        <Link
          href={`/t/${slug}/cart`}
          title={`Ver carrito de compras (${totalItems} ${totalItems === 1 ? 'producto' : 'productos'})`}
          aria-label="Ver carrito de compras"
          className="w-full text-white p-3.5 pr-12 rounded-2xl shadow-2xl flex items-center justify-between border border-white/20 active:scale-[0.99] transition-transform cursor-pointer"
          style={{ backgroundColor: 'var(--tenant-primary, #dc2626)', color: 'var(--tenant-contrast, #ffffff)' }}
        >
          {/* Lado Izquierdo: Icono + Detalle Bimonetario */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center relative shadow-inner shrink-0">
              <ShoppingCart className="w-5 h-5 text-white" />
              <span 
                className="absolute -top-1 -right-1 bg-white text-stone-950 font-black text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md border"
                style={{ borderColor: 'var(--tenant-primary, #dc2626)' }}
              >
                {totalItems}
              </span>
            </div>
            <div className="text-left font-mono truncate">
              <p className="text-xs font-black leading-tight text-white font-sans truncate">
                {totalItems} {totalItems === 1 ? 'producto' : 'productos'} en carrito
              </p>
              <p className="text-[11px] font-bold text-white/95 truncate">
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
          <div 
            className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl font-black text-xs shadow-md shrink-0 ml-2"
            style={{ color: 'var(--tenant-primary, #dc2626)' }}
          >
            <span>Ver Carrito</span>
            <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
        </Link>

        {/* Botón [X] para descartar la barra y no estorbar la navegación */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDismissed(true);
          }}
          title="Ocultar aviso de carrito (puedes continuar arriba en el menú)"
          aria-label="Ocultar aviso de carrito"
          className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-stone-900/90 text-white border-2 border-white flex items-center justify-center shadow-lg hover:bg-stone-950 active:scale-95 transition-all cursor-pointer z-50"
        >
          <X className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
}
