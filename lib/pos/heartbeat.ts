import { posDb } from './offline-db';
import { processSyncQueue } from './sync-queue';

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos
const CONTINGENCY_THRESHOLD_MS = 15 * 60 * 1000;

export interface PosConnectivityState {
  isOnline: boolean;
  lastHeartbeatAt: number | null;
  inContingency: boolean;
  pendingSalesCount: number;
}

let heartbeatTimer: NodeJS.Timeout | null = null;
let currentState: PosConnectivityState = {
  isOnline: false,
  lastHeartbeatAt: null,
  inContingency: false,
  pendingSalesCount: 0,
};

/**
 * Inicia el latido (heartbeat) periódico cada 15 minutos hacia el servidor central.
 * Notifica que la caja registradora está en línea y operativa.
 * Si detecta reconexión exitosa y existen ventas offline pendientes en IndexedDB,
 * dispara automáticamente el vaciado de la cola (processSyncQueue).
 */
export function startPosHeartbeat(tenantSlug: string, registerId: string): void {
  if (heartbeatTimer) return;
  
  const beat = async () => {
    try {
      const response = await fetch('/api/pos/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_slug: tenantSlug, register_id: registerId }),
      });
      
      if (response.ok) {
        currentState = {
          isOnline: true,
          lastHeartbeatAt: Date.now(),
          inContingency: false,
          pendingSalesCount: await posDb.sales.where('sync_status').anyOf(['pending', 'failed']).count(),
        };
        
        // Si hay ventas pendientes y volvimos online, sincronizar
        if (currentState.pendingSalesCount > 0) {
          await processSyncQueue(tenantSlug);
          currentState = {
            ...currentState,
            pendingSalesCount: await posDb.sales.where('sync_status').anyOf(['pending', 'failed']).count(),
          };
        }
      } else {
        throw new Error('Heartbeat failed');
      }
    } catch {
      const lastBeat = currentState.lastHeartbeatAt;
      const timeSinceLastBeat = lastBeat ? Date.now() - lastBeat : Infinity;
      
      currentState = {
        ...currentState,
        isOnline: false,
        inContingency: timeSinceLastBeat >= CONTINGENCY_THRESHOLD_MS,
      };
    }
    
    dispatchStateUpdate();
  };
  
  beat(); // Ejecutar inmediatamente al abrir la caja
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
}

export function stopPosHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function getPosConnectivityState(): PosConnectivityState {
  return currentState;
}

export async function refreshPosPendingCount(): Promise<void> {
  const pendingSalesCount = await posDb.sales
    .where('sync_status')
    .anyOf(['pending', 'failed', 'syncing'])
    .count();
  currentState = {
    ...currentState,
    pendingSalesCount,
  };
  dispatchStateUpdate();
}

function dispatchStateUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('pos-connectivity-change', { detail: currentState })
    );
  }
}
