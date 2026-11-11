'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToTenantOrders,
  TENANT_ORDERS_DOM_EVENT,
  TENANT_REALTIME_STATUS_EVENT,
  type TenantOrderRealtimeEvent,
} from '@/lib/realtime/tenant-orders-channel';
import { cn } from '@/lib/utils';

const SOUND_MUTE_STORAGE_KEY = 'marketos_admin_sound_muted';

declare global {
  interface Window {
    __marketosPendingOrders?: Record<string, number>;
    __marketosRealtimeStatus?: Record<string, 'CONNECTING' | 'SUBSCRIBED' | 'DISCONNECTED'>;
  }
}

function playNewOrderChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(587.33, 0, 0.16); // D5
    playTone(880.0, 0.14, 0.28); // A5

    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 650);
  } catch {
    // El navegador bloqueó audio automático antes de interacción del usuario
  }
}

function setCachedPendingCount(slug: string, count: number) {
  if (typeof window === 'undefined') return;
  window.__marketosPendingOrders = window.__marketosPendingOrders || {};
  window.__marketosPendingOrders[slug] = count;
}

export function usePendingOrdersBadge(slug: string): number {
  const [count, setCount] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.__marketosPendingOrders?.[slug] !== undefined) {
      return window.__marketosPendingOrders[slug];
    }
    return 0;
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__marketosPendingOrders?.[slug] !== undefined) {
      setCount(window.__marketosPendingOrders[slug]);
    }

    const handleRealtimeDom = (ev: Event) => {
      const custom = ev as CustomEvent<{
        slug?: string;
        pendingCount?: number;
      }>;
      if (custom.detail?.slug === slug && typeof custom.detail.pendingCount === 'number') {
        setCount(custom.detail.pendingCount);
      }
    };

    window.addEventListener(TENANT_ORDERS_DOM_EVENT, handleRealtimeDom);
    return () => window.removeEventListener(TENANT_ORDERS_DOM_EVENT, handleRealtimeDom);
  }, [slug]);

  return count;
}

export function NewOrderNotification({ slug }: { slug: string }) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [realtimeStatus, setRealtimeStatus] = useState<'CONNECTING' | 'SUBSCRIBED' | 'DISCONNECTED'>(
    'CONNECTING'
  );
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [pulse, setPulse] = useState<boolean>(false);
  const soundMutedRef = useRef(soundMuted);

  useEffect(() => {
    soundMutedRef.current = soundMuted;
  }, [soundMuted]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SOUND_MUTE_STORAGE_KEY);
      if (saved === '1') setSoundMuted(true);
    } catch {
      // ignore storage errors
    }
  }, []);

  const refreshPendingCount = useCallback(
    async (event?: TenantOrderRealtimeEvent) => {
      try {
        const res = await fetch(`/api/admin/${slug}/orders?summary=1`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { pendingCount?: number };
        const nextCount = Number(data.pendingCount || 0);
        setPendingCount(nextCount);
        setCachedPendingCount(slug, nextCount);

        window.dispatchEvent(
          new CustomEvent(TENANT_ORDERS_DOM_EVENT, {
            detail: { slug, pendingCount: nextCount, event },
          })
        );
      } catch {
        // Silencioso en caso de desconexión temporal
      }
    },
    [slug]
  );

  useEffect(() => {
    void refreshPendingCount();

    const unsubscribe = subscribeToTenantOrders(slug, {
      onStatusChange: (status) => {
        const mapped =
          status === 'SUBSCRIBED'
            ? 'SUBSCRIBED'
            : status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'UNAVAILABLE'
              ? 'DISCONNECTED'
              : 'CONNECTING';
        setRealtimeStatus(mapped);
        if (typeof window !== 'undefined') {
          window.__marketosRealtimeStatus = window.__marketosRealtimeStatus || {};
          window.__marketosRealtimeStatus[slug] = mapped;
        }
        window.dispatchEvent(
          new CustomEvent(TENANT_REALTIME_STATUS_EVENT, {
            detail: { slug, status: mapped },
          })
        );
      },
      onEvent: (event) => {
        // Notificar de inmediato a vistas escuchando (p.ej. /admin/orders) y luego sincronizar contador exacto
        window.dispatchEvent(
          new CustomEvent(TENANT_ORDERS_DOM_EVENT, {
            detail: { slug, event },
          })
        );
        void refreshPendingCount(event);

        if (event.type === 'ORDER_CREATED') {
          setPulse(true);
          setTimeout(() => setPulse(false), 4500);

          if (!soundMutedRef.current) {
            playNewOrderChime();
          }

          const title =
            event.source === 'POS_SYNC'
              ? 'Nueva venta POS sincronizada'
              : 'Nuevo pedido web recibido';
          const detailParts = [
            event.orderNumber,
            `$${Number(event.totalUsd || 0).toFixed(2)} USD`,
          ];
          if (event.customerName) detailParts.push(event.customerName);
          if (event.needsVerification) detailParts.push('Verificar pago');

          toast.success(title, {
            description: detailParts.join(' · '),
            duration: 8000,
            action: {
              label: 'Ver Pedido',
              onClick: () => {
                router.push(
                  event.orderId
                    ? `/t/${slug}/admin/orders/${event.orderId}`
                    : `/t/${slug}/admin/orders`
                );
              },
            },
          });
        }
      },
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshPendingCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [slug, router, refreshPendingCount]);

  const toggleMute = () => {
    setSoundMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_MUTE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={`/t/${slug}/admin/orders`}
        title={
          realtimeStatus === 'SUBSCRIBED'
            ? `Pedidos en tiempo real activos (${pendingCount} pendientes)`
            : `Pedidos (${pendingCount} pendientes)`
        }
        aria-label={`Ver pedidos, ${pendingCount} pendientes`}
        className={cn(
          'relative inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all',
          pendingCount > 0
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/15'
            : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200/70 dark:hover:bg-zinc-800',
          pulse && 'ring-2 ring-lime-500 ring-offset-2 ring-offset-white dark:ring-offset-[#0f0f11]'
        )}
      >
        <span className="relative flex items-center justify-center">
          <Bell className={cn('w-4 h-4', pulse && 'animate-bounce text-lime-600 dark:text-lime-400')} />
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-zinc-900',
              realtimeStatus === 'SUBSCRIBED'
                ? 'bg-emerald-500'
                : realtimeStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-zinc-400'
            )}
          />
        </span>

        <span className="hidden lg:inline">
          {pendingCount > 0 ? 'Pendientes' : realtimeStatus === 'SUBSCRIBED' ? 'En vivo' : 'Pedidos'}
        </span>

        {pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black leading-none shadow-xs">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </Link>

      <button
        type="button"
        onClick={toggleMute}
        title={soundMuted ? 'Activar sonido de nuevos pedidos' : 'Silenciar alerta sonora'}
        aria-label={soundMuted ? 'Activar sonido de nuevos pedidos' : 'Silenciar alerta sonora'}
        className="p-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
      >
        {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
