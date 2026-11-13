'use client';

import { useState } from 'react';
import { Package, X, Receipt } from 'lucide-react';

interface OrderItem {
  product_name: string;
  quantity: string;
  unit_price_usd: string;
  total_price_usd: string;
}

interface OrderItemsModalProps {
  orderNumber: string;
  items: OrderItem[];
  totalUsd: number;
  totalSecondary?: number | null;
  exchangeRate?: number | null;
}

export function OrderItemsModal({
  orderNumber,
  items,
  totalUsd,
  totalSecondary,
  exchangeRate,
}: OrderItemsModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const rate = exchangeRate && exchangeRate > 0 ? exchangeRate : null;
  const secondaryTotal = totalSecondary && totalSecondary > 0
    ? totalSecondary
    : rate ? totalUsd * rate : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full mt-3 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-[var(--tenant-primary)] text-slate-800 dark:text-zinc-200 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
      >
        <Receipt className="w-4 h-4 text-[var(--tenant-primary)]" />
        <span>Ver Detalle del Pedido ({items.length} {items.length === 1 ? 'producto' : 'productos'})</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative max-w-lg w-full bg-white dark:bg-[#121214] text-slate-900 dark:text-white rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[var(--tenant-primary)]/10 text-[var(--tenant-primary)] flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Detalle de tu Pedido</h3>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">{orderNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Items List */}
            <div className="p-6 overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-zinc-800/80">
              {items.map((item, idx) => {
                const itemQty = parseFloat(item.quantity) || 1;
                const itemTotalUsd = parseFloat(item.total_price_usd) || 0;
                const itemUnitUsd = parseFloat(item.unit_price_usd) || 0;
                const itemTotalBs = rate ? itemTotalUsd * rate : null;
                const itemUnitBs = rate ? itemUnitUsd * rate : null;

                return (
                  <div key={idx} className="py-3.5 first:pt-0 last:pb-0 flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900 dark:text-white break-words">
                        {item.product_name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                        {itemQty} × ${itemUnitUsd.toFixed(2)} USD
                        {itemUnitBs && (
                          <span className="text-slate-600 dark:text-zinc-400 font-semibold ml-1.5">
                            (Bs. {itemUnitBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-black text-sm text-slate-950 dark:text-white">
                        ${itemTotalUsd.toFixed(2)}
                      </p>
                      {itemTotalBs && (
                        <p className="text-xs font-mono font-bold text-slate-600 dark:text-zinc-400">
                          Bs. {itemTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer: Totales Bimonetarios */}
            <div className="p-5 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/60 space-y-1.5">
              <div className="flex justify-between items-baseline text-sm">
                <span className="font-bold text-slate-700 dark:text-zinc-300">Total Pedido:</span>
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-[var(--tenant-primary)]">
                    ${totalUsd.toFixed(2)} USD
                  </span>
                  {secondaryTotal && (
                    <p className="text-xs font-mono font-black text-slate-900 dark:text-white">
                      Bs. {secondaryTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>
              {rate && (
                <p className="text-right text-[10px] text-slate-500 dark:text-zinc-400 font-mono">
                  Tasa BCV Aplicada: Bs. {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} / USD
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
