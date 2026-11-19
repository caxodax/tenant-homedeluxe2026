'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, Package, ArrowRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TENANT_LOW_STOCK_DOM_EVENT = 'marketos:low-stock-updated';

declare global {
  interface Window {
    __marketosLowStock?: Record<string, number>;
  }
}

export function useLowStockCountBadge(slug: string): number {
  const [count, setCount] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.__marketosLowStock?.[slug] !== undefined) {
      return window.__marketosLowStock[slug];
    }
    return 0;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__marketosLowStock?.[slug] !== undefined) {
      setCount(window.__marketosLowStock[slug]);
    } else {
      // Fetch inicial ligero
      fetch(`/api/admin/${slug}/inventory/alerts`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.count === 'number') {
            if (typeof window !== 'undefined') {
              if (!window.__marketosLowStock) window.__marketosLowStock = {};
              window.__marketosLowStock[slug] = data.count;
            }
            setCount(data.count);
          }
        })
        .catch(() => {});
    }

    const handleDomEvent = (ev: Event) => {
      const custom = ev as CustomEvent<{ slug?: string; count?: number }>;
      if (custom.detail?.slug === slug && typeof custom.detail.count === 'number') {
        setCount(custom.detail.count);
      }
    };

    window.addEventListener(TENANT_LOW_STOCK_DOM_EVENT, handleDomEvent);
    return () => window.removeEventListener(TENANT_LOW_STOCK_DOM_EVENT, handleDomEvent);
  }, [slug]);

  return count;
}

interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  current_stock: number;
  min_stock_alert: number;
  image_url: string | null;
  category_name: string | null;
}

export function LowStockNotification({ slug }: { slug: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function fetchAlerts() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/${slug}/inventory/alerts`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const alertCount = Number(data.count || 0);
        setCount(alertCount);
        setItems(data.products || []);
        if (typeof window !== 'undefined') {
          if (!window.__marketosLowStock) window.__marketosLowStock = {};
          window.__marketosLowStock[slug] = alertCount;
          window.dispatchEvent(
            new CustomEvent(TENANT_LOW_STOCK_DOM_EVENT, { detail: { slug, count: alertCount } })
          );
        }
      }
    } catch {
      // Silencioso ante fallas temporales de red
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
    // Sondeo ligero cada 60s
    const timer = setInterval(fetchAlerts, 60000);
    return () => clearInterval(timer);
  }, [slug]);

  // Cerrar dropdown al hacer click afuera o presionar Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) fetchAlerts();
        }}
        className={cn(
          'relative p-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center justify-center',
          count > 0
            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            : 'bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-stone-500 dark:text-zinc-400 border border-transparent'
        )}
        title={count > 0 ? `${count} productos con stock mínimo o agotados` : 'Inventario en orden'}
        aria-label="Alertas de stock mínimo"
      >
        <AlertTriangle className={cn('w-4 h-4', count > 0 && 'animate-pulse')} />

        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-amber-600 dark:bg-amber-500 text-white font-mono font-black text-[10px] flex items-center justify-center shadow-xs">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3.5 sm:p-4 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between bg-stone-50/50 dark:bg-zinc-900/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-900 dark:text-white">
                  Stock Mínimo y Crítico
                </h4>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                  {count === 0
                    ? 'No hay productos bajo alerta'
                    : `${count} ${count === 1 ? 'producto requiere' : 'productos requieren'} reposición`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchAlerts}
              className="text-[10px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
            >
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 dark:divide-zinc-800/60 overscroll-contain">
            {items.length === 0 ? (
              <div className="py-8 text-center px-4">
                <Package className="w-8 h-8 text-stone-300 dark:text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                  Todo el inventario está al día
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 mt-0.5">
                  Ningún producto ha caído por debajo de su umbral mínimo.
                </p>
              </div>
            ) : (
              items.map((prod) => {
                const isZero = prod.current_stock <= 0;
                return (
                  <Link
                    key={prod.id}
                    href={`/t/${slug}/admin/inventory`}
                    onClick={() => setIsOpen(false)}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-stone-50 dark:hover:bg-zinc-900/60 transition group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-stone-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0 border border-stone-200/60 dark:border-zinc-700/60">
                        {prod.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-4 h-4 text-stone-400 dark:text-zinc-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-stone-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                          {prod.name}
                        </p>
                        <p className="text-[10px] font-mono text-stone-400 dark:text-zinc-500 truncate">
                          SKU: {prod.sku || 'N/A'} · Mín: {prod.min_stock_alert} uds
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={cn(
                          'inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-black',
                          isZero
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                        )}
                      >
                        {prod.current_stock} uds
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="p-2.5 border-t border-stone-100 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/30">
            <Link
              href={`/t/${slug}/admin/inventory`}
              onClick={() => setIsOpen(false)}
              className="w-full py-2 px-3 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <span>Gestionar en Inventario</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
