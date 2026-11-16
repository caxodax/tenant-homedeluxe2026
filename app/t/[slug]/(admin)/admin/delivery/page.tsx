'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Bike,
  Compass,
  UserCheck,
} from 'lucide-react';
import { DeliveryZonesManager } from '@/components/admin/delivery/delivery-zones-manager';
import { DriversManager } from '@/components/admin/delivery/drivers-manager';

export default function DeliveryAdminPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const [activeTab, setActiveTab] = useState<'zones' | 'drivers'>('zones');
  const [storeName, setStoreName] = useState('MarketOS Store');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [secondaryCurrencySymbol, setSecondaryCurrencySymbol] = useState('Bs.');
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      if (!slug) return;
      try {
        const res = await fetch(`/api/admin/${slug}/settings`);
        const data = await res.json();
        if (data.success && data.settings) {
          if (data.settings.business_name) setStoreName(data.settings.business_name);
          const prim = data.settings.primary_currency;
          if (prim === 'EUR') setCurrencySymbol('€');
          else if (prim === 'VES') setCurrencySymbol('Bs.');
          else setCurrencySymbol('$');

          const sec = data.settings.secondary_currency;
          if (sec === 'EUR') setSecondaryCurrencySymbol('€');
          else if (sec === 'USD') setSecondaryCurrencySymbol('$');
          else setSecondaryCurrencySymbol('Bs.');
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoadingSettings(false);
      }
    }

    loadSettings();
  }, [slug]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Barra de Título Superior */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
              <Bike className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-stone-950 dark:text-white tracking-tight">
                Gestión de Delivery & Repartidores
              </h1>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Configuración de zonas de cobertura, tarifas de despacho y flota de motorizados.
              </p>
            </div>
          </div>
        </div>

        {/* Pestañas de Navegación Limpias */}
        <div className="flex items-center bg-stone-100 dark:bg-zinc-900 p-1 rounded-2xl border border-stone-200 dark:border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('zones')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'zones'
                ? 'bg-white dark:bg-[#141416] text-stone-950 dark:text-white shadow-xs font-bold'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Zonas & Tarifas
          </button>
          <button
            onClick={() => setActiveTab('drivers')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'drivers'
                ? 'bg-white dark:bg-[#141416] text-stone-950 dark:text-white shadow-xs font-bold'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Repartidores
          </button>
        </div>
      </div>

      {/* Contenido de la Pestaña Activa */}
      {activeTab === 'zones' && (
        <DeliveryZonesManager slug={slug} currencySymbol={currencySymbol} />
      )}

      {activeTab === 'drivers' && <DriversManager slug={slug} />}
    </div>
  );
}
