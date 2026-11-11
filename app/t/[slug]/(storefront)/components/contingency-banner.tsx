'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const CONTINGENCY_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export function ContingencyBanner({
  slug,
  initialInContingency = false,
}: {
  slug: string;
  initialInContingency?: boolean;
}) {
  const [inContingency, setInContingency] = useState<boolean>(initialInContingency);
  const lastFetchedRef = useRef<number>(Date.now());

  useEffect(() => {
    setInContingency(initialInContingency);
  }, [initialInContingency]);

  useEffect(() => {
    const refreshIfStale = async () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFetchedRef.current < CONTINGENCY_REFRESH_COOLDOWN_MS) return;
      lastFetchedRef.current = now;

      try {
        const res = await fetch(`/api/tenant/${slug}/contingency`);
        if (res.ok) {
          const data = (await res.json()) as { inContingency?: boolean };
          if (typeof data.inContingency === 'boolean') {
            setInContingency(data.inContingency);
          }
        }
      } catch {
        // Silenciar fallo de red puntual
      }
    };

    document.addEventListener('visibilitychange', refreshIfStale);
    return () => document.removeEventListener('visibilitychange', refreshIfStale);
  }, [slug]);

  if (!inContingency) return null;

  return (
    <div className="bg-amber-100 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-700/60 px-4 py-3 text-center transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs sm:text-sm text-amber-950 dark:text-amber-200 font-medium">
        <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
        <p>
          <strong className="font-extrabold">Aviso Operativo:</strong> Nuestra sede física se encuentra temporalmente en contingencia. 
          Puedes realizar tu pedido con total normalidad; tu orden quedará asegurada y nuestro equipo la despachará con prioridad.
        </p>
      </div>
    </div>
  );
}
