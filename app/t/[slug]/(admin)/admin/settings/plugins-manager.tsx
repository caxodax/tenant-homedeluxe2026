'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Bike, Coins, CheckCircle2, XCircle, ArrowRight, 
  Settings2, Loader2, ShieldCheck, Sparkles, MapPin, Compass
} from 'lucide-react';
import { toast } from 'sonner';

interface PluginsManagerProps {
  slug: string;
  activePlugins: string[];
  onPluginToggled?: (pluginId: string, isActive: boolean) => void;
}

export function PluginsManager({ slug, activePlugins: initialActive, onPluginToggled }: PluginsManagerProps) {
  const [activePlugins, setActivePlugins] = useState<string[]>(initialActive);
  const [loadingPlugin, setLoadingPlugin] = useState<string | null>(null);

  useEffect(() => {
    setActivePlugins(initialActive);
  }, [initialActive]);

  const isDeliveryActive = activePlugins.includes('delivery_fleet');
  const isVenezuelaActive = activePlugins.includes('local_venezuela');

  const handleToggleDelivery = async () => {
    const nextState = !isDeliveryActive;
    setLoadingPlugin('delivery_fleet');

    try {
      const res = await fetch(`/api/admin/${slug}/plugins/delivery-fleet`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado del plugin');
      }

      if (nextState) {
        setActivePlugins((prev) => [...prev.filter((p) => p !== 'delivery_fleet'), 'delivery_fleet']);
        toast.success('Plugin Delivery Fleet Activado', {
          description: 'Ya tienes acceso al Centro de Control en /admin/delivery y cálculo de tarifas en Vitrina y POS.',
        });
      } else {
        setActivePlugins((prev) => prev.filter((p) => p !== 'delivery_fleet'));
        toast.info('Plugin Delivery Fleet Desactivado', {
          description: 'Se ha deshabilitado el despacho a domicilio en Vitrina y POS.',
        });
      }

      onPluginToggled?.('delivery_fleet', nextState);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar estado del plugin');
    } finally {
      setLoadingPlugin(null);
    }
  };

  const handleToggleVenezuela = async () => {
    const nextState = !isVenezuelaActive;
    setLoadingPlugin('local_venezuela');

    try {
      const res = await fetch(`/api/admin/${slug}/plugins/local-venezuela`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado del plugin');
      }

      if (nextState) {
        setActivePlugins((prev) => [...prev.filter((p) => p !== 'local_venezuela'), 'local_venezuela']);
        toast.success('Plugin Localización Venezuela Activado', {
          description: 'Sincronización BCV, IGTF y Pago Móvil habilitados.',
        });
      } else {
        setActivePlugins((prev) => prev.filter((p) => p !== 'local_venezuela'));
        toast.info('Plugin Localización Venezuela Desactivado', {
          description: 'Se ha deshabilitado la conversión BCV e IGTF en la tienda.',
        });
      }

      onPluginToggled?.('local_venezuela', nextState);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar estado del plugin');
    } finally {
      setLoadingPlugin(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="border-b border-stone-200 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] font-mono font-black uppercase rounded-md bg-stone-900 text-white dark:bg-white dark:text-black">
            Capa 2 · Arquitectura Modular
          </span>
          <span className="text-xs text-stone-500 dark:text-zinc-400">Blast Radius = 0</span>
        </div>
        <h2 className="text-lg sm:text-xl font-black text-stone-950 dark:text-white mt-1">
          Plugins & Módulos del Comercio
        </h2>
        <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 mt-0.5">
          Activa o desactiva extensiones operativas de forma aislada. Los plugins inyectan capacidades logísticas, fiscales y de medios de pago sin alterar el Core.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card: Delivery Fleet & Despacho */}
        <div className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
          isDeliveryActive
            ? 'bg-white dark:bg-zinc-900 border-emerald-500/40 shadow-sm ring-1 ring-emerald-500/20'
            : 'bg-stone-50/60 dark:bg-zinc-900/40 border-stone-200 dark:border-zinc-800'
        }`}>
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                  isDeliveryActive
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-stone-200 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400'
                }`}>
                  <Bike className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-stone-950 dark:text-white flex items-center gap-1.5">
                    Delivery
                  </h3>
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase">
                    plugin_id: delivery_fleet
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isDeliveryActive}
                disabled={loadingPlugin === 'delivery_fleet'}
                onClick={handleToggleDelivery}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 ${
                  isDeliveryActive ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-zinc-700'
                }`}
              >
                {loadingPlugin === 'delivery_fleet' ? (
                  <span className="absolute inset-0 flex items-center justify-center text-white">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </span>
                ) : (
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isDeliveryActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                )}
              </button>
            </div>

            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed mb-4">
              Gestión integral de flota propia de mensajería: definición de polígonos/radios de entrega con tarifa fija por zona, resolución satelital por GPS con Haversine, comanda para repartidor por WhatsApp con cálculo automático de vuelto y tablero Kanban logístico en tiempo real.
            </p>

            <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-zinc-800/80 text-[11px] text-stone-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Cálculo de flete agnóstico a la moneda base del catálogo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Geolocalización con selector manual resiliente en Vitrina y POS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Transición atómica a entrega completada en Core</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-between gap-2">
            <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${
              isDeliveryActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                : 'bg-stone-200/70 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              {isDeliveryActive ? '● Activo en Tienda' : '○ Desactivado'}
            </span>

            {isDeliveryActive && (
              <Link
                href={`/t/${slug}/admin/delivery`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-white dark:hover:bg-stone-100 text-white dark:text-black font-extrabold text-xs transition-all shadow-xs active:scale-95"
              >
                <span>Centro de Control</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Card: Localización Venezuela */}
        <div className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
          isVenezuelaActive
            ? 'bg-white dark:bg-zinc-900 border-amber-500/40 shadow-sm ring-1 ring-amber-500/20'
            : 'bg-stone-50/60 dark:bg-zinc-900/40 border-stone-200 dark:border-zinc-800'
        }`}>
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                  isVenezuelaActive
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-stone-200 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400'
                }`}>
                  <Coins className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-stone-950 dark:text-white flex items-center gap-1.5">
                    Localización Venezuela (BCV)
                  </h3>
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase">
                    plugin_id: local_venezuela
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isVenezuelaActive}
                disabled={loadingPlugin === 'local_venezuela'}
                onClick={handleToggleVenezuela}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 ${
                  isVenezuelaActive ? 'bg-amber-500' : 'bg-stone-300 dark:bg-zinc-700'
                }`}
              >
                {loadingPlugin === 'local_venezuela' ? (
                  <span className="absolute inset-0 flex items-center justify-center text-white">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </span>
                ) : (
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isVenezuelaActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                )}
              </button>
            </div>

            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed mb-4">
              Sincronización desatendida de la tasa oficial del Banco Central de Venezuela (BCV), régimen impositivo especial IGTF (3%), redondeo fiscal bimonetario (USD/VES) y soporte nativo para pasarela manual de Pago Móvil interbancario.
            </p>

            <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-zinc-800/80 text-[11px] text-stone-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Sincronización desatendida 7:00 AM VET sin servidor propio</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Desglose fiscal bimonetario en tickets y facturas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Gestión de cuentas Pago Móvil con verificación de referencia</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-between gap-2">
            <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${
              isVenezuelaActive
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                : 'bg-stone-200/70 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              {isVenezuelaActive ? '● Activo en Tienda' : '○ Desactivado'}
            </span>

            {isVenezuelaActive && (
              <Link
                href={`/t/${slug}/admin/rates`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-white dark:hover:bg-stone-100 text-white dark:text-black font-extrabold text-xs transition-all shadow-xs active:scale-95"
              >
                <span>Ver Tasas & BCV</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
