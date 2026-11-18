'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Printer,
  RefreshCw,
  Flame,
  CheckCheck,
  Utensils,
  Ban,
  Bike,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { FsKitchenTicket } from '@/lib/plugins/food-service-shared';
import { getKdsTimeStatus } from '@/lib/plugins/food-service-shared';

export default function KitchenDisplayPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const [tickets, setTickets] = useState<FsKitchenTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<'ALL' | 'PREPARING' | 'READY'>('ALL');
  const [printingTicket, setPrintingTicket] = useState<FsKitchenTicket | null>(null);

  const prevTicketCount = useRef<number>(0);

  // Reproductor nativo de sonido para comanderas usando Web Audio API (cero dependencias externas)
  const playChime = useCallback(() => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio autoplay restrictions
    }
  }, [soundEnabled]);

  const loadTickets = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/kds`);
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        if (data.tickets.length > prevTicketCount.current && prevTicketCount.current > 0) {
          playChime();
          toast('¡Nueva Comanda Recibida!', { icon: '🔥' });
        }
        prevTicketCount.current = data.tickets.length;
        setTickets(data.tickets);
      }
    } catch (err) {
      console.error('Error loading KDS tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, playChime]);

  // Actualizar temporizadores cada 5 segundos
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // Carga inicial y suscripción Realtime a comandas de cocina
  useEffect(() => {
    loadTickets();

    const supabase = createClient();
    const channel = supabase
      .channel(`tenant_${slug}_kds_realtime`)
      .on(
        'postgres_changes',
        { event: '*', schema: `tenant_${slug}`, table: 'fs_kitchen_tickets' },
        () => {
          loadTickets();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: `tenant_${slug}`, table: 'fs_kitchen_ticket_items' },
        () => {
          loadTickets();
        }
      )
      .subscribe();

    const interval = setInterval(loadTickets, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [slug, loadTickets]);

  const handleUpdateItem = async (ticketId: string, itemId: string) => {
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/kds/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'READY_ITEM',
          item_ids: [itemId],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar ítem');
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar ítem');
    }
  };

  const handleUpdateTicket = async (ticketId: string, action: 'READY_ALL' | 'SERVED' | 'VOID') => {
    try {
      const res = await fetch(`/api/tenant/${slug}/food-service/kds/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar comanda');
      toast.success(
        action === 'READY_ALL'
          ? 'Comanda completa lista'
          : action === 'SERVED'
          ? 'Comanda servida a mesa'
          : 'Comanda anulada'
      );
      loadTickets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar comanda');
    }
  };

  const handlePrint = (ticket: FsKitchenTicket) => {
    setPrintingTicket(ticket);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const filteredTickets = tickets.filter((t) => {
    if (filter === 'PREPARING') return t.status === 'FIRED' || t.status === 'PREPARING';
    if (filter === 'READY') return t.status === 'READY';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Barra de Encabezado KDS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-stone-900 text-white p-4 sm:p-5 rounded-2xl shadow-lg border border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
            <ChefHat className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Pantalla de Cocina (KDS)</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Comandas en tiempo real, semáforo de pase y control de despacho por estación
            </p>
          </div>
        </div>

        {/* Controles de Vista y Audio */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="inline-flex rounded-xl bg-stone-800 p-1 border border-stone-700">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === 'ALL' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-400 hover:text-white'
              }`}
            >
              Todas ({tickets.length})
            </button>
            <button
              onClick={() => setFilter('PREPARING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === 'PREPARING' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-400 hover:text-white'
              }`}
            >
              En Cocina ({tickets.filter((t) => t.status === 'FIRED' || t.status === 'PREPARING').length})
            </button>
            <button
              onClick={() => setFilter('READY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === 'READY' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-400 hover:text-white'
              }`}
            >
              Listas ({tickets.filter((t) => t.status === 'READY').length})
            </button>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Silenciar campanada' : 'Activar campanada'}
            className={`p-2.5 rounded-xl border transition-all ${
              soundEnabled
                ? 'bg-stone-800 text-orange-400 border-stone-700 hover:bg-stone-700'
                : 'bg-stone-800 text-stone-500 border-stone-700 hover:bg-stone-700'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={loadTickets}
            title="Refrescar comandas"
            className="p-2.5 rounded-xl bg-stone-800 text-stone-300 border border-stone-700 hover:bg-stone-700 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rejilla de Comandas Kanban KDS */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-stone-500">Conectando con la comanda de cocina...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 p-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto mb-3">
            <Utensils className="w-7 h-7" />
          </div>
          <h3 className="text-base font-extrabold text-stone-900 dark:text-white">Cocina al día</h3>
          <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
            No hay comandas pendientes en preparación en este momento. Los nuevos pedidos aparecerán aquí automáticamente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTickets.map((ticket) => {
            const timeStatus = getKdsTimeStatus(ticket.fired_at || ticket.created_at, 12);
            const isReady = ticket.status === 'READY';

            const badgeColorClass = isReady
              ? 'bg-emerald-500 text-white'
              : timeStatus.level === 'DANGER'
              ? 'bg-rose-600 text-white animate-pulse'
              : timeStatus.level === 'WARN'
              ? 'bg-amber-500 text-stone-950 font-black'
              : 'bg-stone-800 text-stone-300';

            return (
              <div
                key={ticket.id}
                className={`flex flex-col justify-between rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm ${
                  isReady
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-500/40'
                    : timeStatus.level === 'DANGER'
                    ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-500/50'
                    : 'bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800'
                }`}
              >
                {/* Cabecera de Comanda */}
                <div className="p-3.5 border-b border-stone-100 dark:border-zinc-800 flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-black text-orange-600 dark:text-orange-400">
                        #{ticket.order_number?.slice(-6) || ticket.order_id.slice(0, 6)}
                      </span>
                      <span className="font-extrabold text-sm text-stone-950 dark:text-white">
                        {ticket.table_label}
                      </span>
                      {ticket.delivery_type === 'DELIVERY' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Bike className="w-3 h-3" />
                          <span>DELIVERY</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-stone-500 dark:text-zinc-400">
                      Entrada: {new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Semáforo de Tiempo */}
                  <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 ${badgeColorClass}`}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{timeStatus.elapsedMinutes}m</span>
                  </div>
                </div>

                {/* Ítems y Modificadores de la Comanda */}
                <div className="p-3.5 space-y-2.5 flex-1 divide-y divide-stone-100 dark:divide-zinc-800/60">
                  {ticket.items.map((item) => {
                    const isItemReady = item.status === 'READY';
                    return (
                      <div
                        key={item.id}
                        onClick={() => !isItemReady && handleUpdateItem(ticket.id, item.id)}
                        className={`pt-2 first:pt-0 flex items-start justify-between gap-2 cursor-pointer group ${
                          isItemReady ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-xs px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800 text-stone-900 dark:text-white shrink-0">
                              {item.quantity}x
                            </span>
                            <span
                              className={`text-xs font-bold text-stone-900 dark:text-zinc-100 leading-snug ${
                                isItemReady ? 'line-through text-stone-400' : ''
                              }`}
                            >
                              {item.product_name}
                            </span>
                          </div>

                          {/* Modificadores / Adicionales seleccionados */}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="mt-1 pl-6 space-y-0.5 text-[11px] text-orange-600 dark:text-orange-400 font-medium">
                              {item.modifiers.map((mod, idx) => (
                                <p key={idx}>• {mod.group_name || 'Opción'}: {mod.option_name || String(mod)}</p>
                              ))}
                            </div>
                          )}

                          {/* Notas de Cocina (Ej: sin cebolla, término medio) */}
                          {item.prep_notes && (
                            <p className="mt-1 pl-6 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded">
                              Nota: {item.prep_notes}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          className={`p-1 rounded-md transition-all ${
                            isItemReady
                              ? 'text-emerald-500'
                              : 'text-stone-300 dark:text-zinc-600 group-hover:text-emerald-500 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950/40'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}

                  {ticket.notes && (
                    <div className="pt-2 text-[11px] text-stone-500 italic bg-stone-50 dark:bg-zinc-800/40 p-2 rounded-lg">
                      Obs: {ticket.notes}
                    </div>
                  )}
                </div>

                {/* Acciones de Despacho de Comanda */}
                <div className="p-3 bg-stone-50 dark:bg-zinc-800/40 border-t border-stone-100 dark:border-zinc-800 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => handlePrint(ticket)}
                    title="Imprimir comanda térmica 80mm"
                    className="p-2 rounded-xl text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-zinc-700/60 transition-all"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    {!isReady ? (
                      <button
                        onClick={() => handleUpdateTicket(ticket.id, 'READY_ALL')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-extrabold text-xs transition-all shadow-xs active:scale-95"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>Todo Listo</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateTicket(ticket.id, 'SERVED')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition-all shadow-xs active:scale-95"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Servir a Mesa</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vista de Impresión Térmica 80mm de Comanda (Oculta en pantalla, visible al imprimir) */}
      {printingTicket && (
        <div className="hidden print:block font-mono text-[11px] text-black bg-white p-2 max-w-[80mm] leading-tight">
          <div className="text-center pb-2 border-b border-black">
            <h2 className="text-sm font-black uppercase">COMANDA DE COCINA</h2>
            <p className="text-base font-black mt-1">MESA: {printingTicket.table_label}</p>
            <p className="text-[10px]">
              Orden #{printingTicket.order_number?.slice(-6) || printingTicket.order_id.slice(0, 6)} · {new Date().toLocaleTimeString()}
            </p>
          </div>

          <div className="py-2 space-y-1.5 border-b border-black">
            {printingTicket.items.map((it, idx) => (
              <div key={idx} className="flex flex-col">
                <div className="flex justify-between font-black text-xs">
                  <span>{it.quantity}x {it.product_name}</span>
                </div>
                {it.modifiers && it.modifiers.length > 0 && (
                  <div className="pl-2 text-[10px]">
                    {it.modifiers.map((m, mIdx) => (
                      <span key={mIdx}>+ {m.option_name || String(m)} </span>
                    ))}
                  </div>
                )}
                {it.prep_notes && (
                  <span className="pl-2 font-black italic text-[10px]">** {it.prep_notes} **</span>
                )}
              </div>
            ))}
          </div>

          {printingTicket.notes && (
            <p className="pt-1 text-[10px] italic">Notas: {printingTicket.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
