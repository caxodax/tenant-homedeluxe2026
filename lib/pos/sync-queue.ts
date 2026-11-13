import { posDb, OfflineSale } from './offline-db';
import { generateBatchHash } from './crypto';

const MAX_BATCH_SIZE = 50;
const RETRY_DELAYS_MS = [1000, 5000, 30000, 120000]; // 1s, 5s, 30s, 2m
let isProcessingSync = false;

export async function enqueueOfflineSale(
  sale: Omit<OfflineSale, 'id' | 'sync_status' | 'sync_attempts'>
): Promise<string> {
  await posDb.sales.add({
    ...sale,
    sync_status: 'pending',
    sync_attempts: 0,
  });
  return sale.offline_ticket_ref;
}

export async function processSyncQueue(
  tenantSlug: string
): Promise<{ success: boolean; synced: number; failed: number; details: unknown }> {
  if (isProcessingSync) {
    return { success: true, synced: 0, failed: 0, details: ['Sync already in progress'] };
  }
  isProcessingSync = true;
  try {
    const pendingSales = await posDb.sales
      .where('sync_status')
      .anyOf(['pending', 'failed', 'syncing'])
      .sortBy('offline_timestamp');
    
    if (pendingSales.length === 0) {
      return { success: true, synced: 0, failed: 0, details: [] };
    }
    
    // Procesar en lotes de MAX_BATCH_SIZE (máximo 50 ventas por lote)
    const batches: OfflineSale[][] = [];
    for (let i = 0; i < pendingSales.length; i += MAX_BATCH_SIZE) {
      batches.push(pendingSales.slice(i, i + MAX_BATCH_SIZE));
    }
    
    let totalSynced = 0;
    let totalFailed = 0;
    const allDetails: unknown[] = [];
    
    for (const batch of batches) {
      const batchHash = await generateBatchHash(batch);
      
      // Marcar lote como en proceso de sincronización (syncing)
      await posDb.sales.bulkUpdate(
        batch.map((s) => ({
          key: s.id!,
          changes: { sync_status: 'syncing' as const },
        }))
      );
      
      try {
        const response = await fetch(`/api/pos/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_slug: tenantSlug,
            sales_batch: batch.map(serializeSaleForApi),
            batch_hash: batchHash,
          }),
        });
        
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || `Sync failed (${response.status})`);
        }

        if (result.status === 'ALREADY_PROCESSED') {
          await posDb.sales.bulkUpdate(
            batch.map((s) => ({
              key: s.id!,
              changes: { sync_status: 'synced' as const },
            }))
          );
          totalSynced += batch.length;
        } else {
          const details: Array<{ offline_ref: string; status: string; error?: string }> =
            Array.isArray(result.details) ? result.details : [];
          const detailMap = new Map(details.map((d) => [d.offline_ref, d]));

          for (const sale of batch) {
            const detail = detailMap.get(sale.offline_ticket_ref);
            if (!detail || detail.status === 'RECONCILED') {
              await posDb.sales.update(sale.id!, {
                sync_status: 'synced',
                last_error: undefined,
              });
              totalSynced++;
            } else {
              await posDb.sales.update(sale.id!, {
                sync_status: 'failed',
                sync_attempts: (sale.sync_attempts || 0) + 1,
                last_error: detail.error || 'Error en reconciliación de venta',
              });
              totalFailed++;
            }
          }
        }
        
        allDetails.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        
        for (const sale of batch) {
          const newAttempts = (sale.sync_attempts || 0) + 1;
          const newStatus = newAttempts >= RETRY_DELAYS_MS.length ? 'failed' : 'pending';
          
          await posDb.sales.update(sale.id!, {
            sync_status: newStatus,
            sync_attempts: newAttempts,
            last_error: errorMsg,
          });
          
          if (newStatus === 'failed') totalFailed++;
        }
      }
    }
    
    return { success: totalFailed === 0, synced: totalSynced, failed: totalFailed, details: allDetails };
  } finally {
    isProcessingSync = false;
  }
}

function serializeSaleForApi(sale: OfflineSale) {
  return {
    store_id: sale.store_id,
    customer_name: sale.customer_name,
    customer_phone: sale.customer_phone,
    items: sale.items,
    subtotal_usd: sale.subtotal_usd,
    discount_usd: sale.discount_usd,
    tax_usd: sale.tax_usd,
    shipping_usd: sale.shipping_usd,
    total_usd: sale.total_usd,
    total_secondary: sale.total_secondary || null,
    exchange_rate_applied: sale.exchange_rate_applied,
    offline_ticket_ref: sale.offline_ticket_ref,
    is_offline_sale: true,
    payment: sale.payment,
    notes: sale.notes,
  };
}
