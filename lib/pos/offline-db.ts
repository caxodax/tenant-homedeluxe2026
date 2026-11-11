import Dexie, { Table } from 'dexie';

export interface OfflineSale {
  id?: number;
  offline_ticket_ref: string;
  offline_timestamp: number; // ms desde epoch
  store_id: string;
  customer_name: string;
  customer_phone: string;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_usd: number;
    total_price_usd: number;
    metadata?: Record<string, unknown>;
  }>;
  subtotal_usd: number;
  discount_usd: number;
  tax_usd: number;
  shipping_usd: number;
  total_usd: number;
  exchange_rate_applied: number;
  payment: {
    method: string;
    amount: number;
    currency: string;
    reference_number?: string;
  };
  notes?: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  sync_attempts: number;
  last_error?: string;
}

export interface OfflineState {
  key: string;
  value: unknown;
}

export interface CachedPosCatalog {
  slug: string;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    barcode?: string;
    price_usd: string;
    current_stock: string;
    min_stock_alert: string;
    category_id: string;
    image_url?: string;
  }>;
  payment_methods: Array<{
    code: string;
    name: string;
    requires_reference?: boolean;
  }>;
  settings: {
    business_name: string;
    primary_currency: string;
    store_id?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
  };
  updated_at: number;
}

class PosOfflineDatabase extends Dexie {
  sales!: Table<OfflineSale, number>;
  state!: Table<OfflineState, string>;
  catalog_cache!: Table<CachedPosCatalog, string>;

  constructor() {
    super('MarketOS_POS_Offline');
    this.version(1).stores({
      sales: '++id, offline_ticket_ref, offline_timestamp, sync_status, store_id',
      state: 'key',
    });
    this.version(2).stores({
      sales: '++id, offline_ticket_ref, offline_timestamp, sync_status, store_id',
      state: 'key',
      catalog_cache: 'slug, updated_at',
    });
  }
}

export const posDb = new PosOfflineDatabase();
