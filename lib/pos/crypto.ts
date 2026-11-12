import { OfflineSale } from './offline-db';

/**
 * Genera un hash SHA-256 determinista para un lote de ventas offline utilizando la Web Crypto API nativa.
 * Garantiza idempotencia criptográfica: un lote idéntico siempre producirá el mismo hash,
 * impidiendo duplicaciones en la base de datos al reconciliar.
 */
export async function generateBatchHash(
  sales: OfflineSale[]
): Promise<string> {
  // 1. Serialización determinista: ordenar por offline_timestamp ASC
  const sorted = [...sales].sort(
    (a, b) => a.offline_timestamp - b.offline_timestamp
  );
  
  // 2. Canonicalizar: solo campos críticos (excluir sync_status, id local, errores)
  const canonical = sorted.map((s) => ({
    ref: s.offline_ticket_ref,
    ts: s.offline_timestamp,
    store: s.store_id,
    total: s.total_usd,
    items: s.items.map((i) => ({
      pid: i.product_id,
      qty: i.quantity,
      price: i.unit_price_usd,
    })),
  }));
  
  // 3. Stringify estable
  const payload = JSON.stringify(canonical);
  
  // 4. Hash SHA-256 con Web Crypto API nativa
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}
