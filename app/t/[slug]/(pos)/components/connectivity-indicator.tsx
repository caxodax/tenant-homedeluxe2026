'use client';

import { useEffect, useState } from 'react';
import { getPosConnectivityState, type PosConnectivityState } from '@/lib/pos/heartbeat';

export function ConnectivityIndicator() {
  const [state, setState] = useState<PosConnectivityState>(getPosConnectivityState());
  
  useEffect(() => {
    const handler = (e: Event) => {
      setState((e as CustomEvent).detail);
    };
    window.addEventListener('pos-connectivity-change', handler);
    return () => window.removeEventListener('pos-connectivity-change', handler);
  }, []);
  
  const statusColor = state.isOnline 
    ? (state.pendingSalesCount > 0 ? 'bg-amber-500' : 'bg-emerald-500')
    : 'bg-rose-500';
  
  const statusText = state.isOnline
    ? (state.pendingSalesCount > 0 
        ? `Online · ${state.pendingSalesCount} por sincronizar`
        : 'Online · Todo sincronizado')
    : 'Offline · Modo contingencia';
  
  return (
    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-100/90 dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 rounded-full text-xs font-mono shadow-xs transition-colors">
      <span className={`w-2.5 h-2.5 rounded-full ${statusColor} animate-pulse`} />
      <span>{statusText}</span>
    </div>
  );
}
