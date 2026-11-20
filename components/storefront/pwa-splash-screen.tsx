'use client';

import { useState, useEffect } from 'react';

interface PwaSplashScreenProps {
  businessName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export function PwaSplashScreen({
  businessName,
  logoUrl,
  primaryColor,
}: PwaSplashScreenProps) {
  const [mounted, setMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(true);

  useEffect(() => {
    // Permitir una breve transición estética de 350ms para que se aprecie el pálpito orgánico de marca
    const timer = setTimeout(() => {
      setMounted(true);
    }, 400);

    const removeTimer = setTimeout(() => {
      setShouldRender(false);
    }, 750);

    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!shouldRender) return null;

  const color = primaryColor || 'var(--tenant-primary, #ea580c)';
  const initial = (businessName || 'M')[0].toUpperCase();

  return (
    <div
      aria-hidden={mounted}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-stone-50 dark:bg-[#09090b] select-none transition-opacity duration-300 ease-out ${
        mounted ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative flex flex-col items-center">
        {/* Halo luminoso ambiental pulsante (Acelerado por GPU) */}
        <div
          className="absolute -inset-6 sm:-inset-8 rounded-full blur-2xl opacity-25 animate-pwa-pulse-ring pointer-events-none"
          style={{ backgroundColor: color }}
        />

        {/* Contenedor del Logo con animación Heartbeat */}
        <div className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white dark:bg-zinc-900 border border-stone-200/90 dark:border-zinc-800 p-4 shadow-xl flex items-center justify-center animate-pwa-heartbeat">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              className="w-full h-full object-contain filter drop-shadow-xs"
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div
              className="w-full h-full rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-white shadow-inner"
              style={{ backgroundColor: color }}
            >
              {initial}
            </div>
          )}
        </div>

        {/* Nombre del comercio y micro-indicador de carga */}
        <div className="mt-5 text-center space-y-2 relative z-10">
          <h2 className="text-base sm:text-lg font-black tracking-tight text-stone-900 dark:text-white">
            {businessName}
          </h2>
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: color, animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: color, animationDelay: '200ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: color, animationDelay: '400ms' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
