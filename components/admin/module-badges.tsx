'use client';

import { useState, useEffect } from 'react';

/**
 * Hook ligero para obtener el conteo de comandas activas en Cocina (KDS).
 * Solo se ejecuta si el plugin food_service está activo.
 */
export function useKdsActiveCountBadge(slug: string, isActive = false): number {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!slug || !isActive) {
      setCount(0);
      return;
    }

    let isMounted = true;

    async function fetchKdsCount() {
      try {
        const res = await fetch(`/api/tenant/${slug}/food-service/kds`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.tickets) && isMounted) {
          const activeTickets = data.tickets.filter((t: { status: string }) =>
            ['PENDING', 'FIRED', 'PREPARING'].includes(t.status)
          );
          setCount(activeTickets.length);
        }
      } catch {
        // Silencioso en badge
      }
    }

    fetchKdsCount();

    // Actualizar periódicamente cada 30s o cuando regrese el foco
    const interval = setInterval(fetchKdsCount, 30000);
    const onFocus = () => fetchKdsCount();
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [slug, isActive]);

  return count;
}

/**
 * Hook ligero para obtener el conteo de despachos pendientes de asignación en Delivery.
 * Solo se ejecuta si el plugin delivery_fleet está activo.
 */
export function useDeliveryPendingCountBadge(slug: string, isActive = false): number {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!slug || !isActive) {
      setCount(0);
      return;
    }

    let isMounted = true;

    async function fetchDeliveryPending() {
      try {
        const res = await fetch(`/api/tenant/${slug}/delivery/dispatches?status=PENDING&limit=50`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.dispatches) && isMounted) {
          setCount(data.dispatches.length);
        }
      } catch {
        // Silencioso en badge
      }
    }

    fetchDeliveryPending();

    const interval = setInterval(fetchDeliveryPending, 30000);
    const onFocus = () => fetchDeliveryPending();
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [slug, isActive]);

  return count;
}
