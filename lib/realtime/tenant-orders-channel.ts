import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export const TENANT_ORDERS_EVENT = 'order_event';
export const TENANT_ORDERS_DOM_EVENT = 'marketos:order-realtime';
export const TENANT_REALTIME_STATUS_EVENT = 'marketos:order-realtime-status';

export type TenantOrderRealtimeEventType = 'ORDER_CREATED' | 'ORDER_UPDATED';

export interface TenantOrderRealtimeEvent {
  type: TenantOrderRealtimeEventType;
  slug: string;
  orderId?: string;
  orderNumber: string;
  status: string;
  totalUsd: number;
  customerName?: string;
  paymentMethodName?: string;
  source?: 'STOREFRONT' | 'POS_SYNC' | 'ADMIN';
  needsVerification?: boolean;
  hasProof?: boolean;
  count?: number;
  timestamp: string;
}

export function getTenantOrdersChannelName(slug: string): string {
  return `tenant:${slug}:orders`;
}

/**
 * Emite un evento Realtime desde el servidor (Route Handlers / Server Actions)
 * hacia todos los paneles Admin conectados del comercio sin bloquear la transacción.
 */
export async function broadcastTenantOrderEvent(
  slug: string,
  event: Omit<TenantOrderRealtimeEvent, 'slug' | 'timestamp'>
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey || !slug) {
    return false;
  }

  const client = createSupabaseJsClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const channel = client.channel(getTenantOrdersChannelName(slug));
  const payload: TenantOrderRealtimeEvent = {
    ...event,
    slug,
    timestamp: new Date().toISOString(),
  };

  try {
    const sendPromise = channel.httpSend(TENANT_ORDERS_EVENT, payload, { timeout: 2500 });
    const timeoutPromise = new Promise<{ success: false }>((resolve) =>
      setTimeout(() => resolve({ success: false }), 2800)
    );
    const result = await Promise.race([sendPromise, timeoutPromise]);
    return Boolean(result && 'success' in result && result.success);
  } catch (err) {
    console.warn(`[Realtime] No se pudo emitir evento para ${slug}:`, err);
    return false;
  } finally {
    await client.removeChannel(channel).catch(() => {});
  }
}

/**
 * Suscribe el navegador del panel Admin a eventos Broadcast en tiempo real del comercio.
 */
export function subscribeToTenantOrders(
  slug: string,
  callbacks: {
    onEvent: (event: TenantOrderRealtimeEvent) => void;
    onStatusChange?: (status: string) => void;
  }
): () => void {
  if (
    typeof window === 'undefined' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !slug
  ) {
    callbacks.onStatusChange?.('UNAVAILABLE');
    return () => {};
  }

  const supabase = createBrowserSupabaseClient();
  const channel = supabase
    .channel(getTenantOrdersChannelName(slug))
    .on('broadcast', { event: TENANT_ORDERS_EVENT }, (msg) => {
      const payload = msg?.payload as TenantOrderRealtimeEvent | undefined;
      if (payload && payload.slug === slug) {
        callbacks.onEvent(payload);
      }
    })
    .subscribe((status) => {
      callbacks.onStatusChange?.(status);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
