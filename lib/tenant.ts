import { cache } from 'react';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { pool, withTenantDb } from './db';
import { TENANT_DEFAULTS } from './tenant/defaults';

const POS_HEARTBEAT_TIMEOUT_MS = 15 * 60 * 1000;

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  db_schema_name: string;
  plan_id: string;
  status: string;
  owner_email: string;
  storefront_enabled: boolean;
  contingency_offline_mode: string | null;
  safety_buffer_units: number | null;
  last_pos_heartbeat_at: string | Date | null;
}

export interface TenantShellSettings {
  business_name: string;
  phone: string | null;
  whatsapp_number: string | null;
  address: string | null;
  business_hours?: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  primary_currency?: string;
  secondary_currency?: string;
  exchange_rate?: number;
  tax_enabled?: boolean;
  tax_rate?: number;
  prices_include_tax?: boolean;
  social_media?: Record<string, string>;
  features?: {
    tables_enabled?: boolean;
    recipes_enabled?: boolean;
    banner_style?: 'clean' | 'card';
  };
}

export interface TenantShellData {
  tenant: TenantRecord;
  settings: TenantShellSettings;
  inContingency: boolean;
  bufferUnits: number;
}

export interface StorefrontCatalogItem {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  barcode?: string;
  sku: string;
  price_usd: string;
  current_stock: string;
  min_stock_alert: string;
  category_name?: string;
  image_url?: string;
  is_tax_exempt?: boolean;
  variants?: Array<{
    id: string;
    name: string;
    sku: string;
    attributes: Record<string, any>;
    price_adjustment_primary: number | string;
  }>;
  modifier_groups?: Array<{
    group_id: string;
    group_name: string;
    min_select: number;
    max_select: number;
    required: boolean;
    options: Array<{
      product_id: string;
      name: string;
      price_primary: number | string;
    }>;
  }>;
}

export interface StorefrontCatalogCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ActiveTenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  storefront_enabled: boolean;
}

export function isTenantInContingency(tenant: {
  last_pos_heartbeat_at?: string | Date | null;
  contingency_offline_mode?: string | null;
}): boolean {
  const mode = (tenant.contingency_offline_mode || 'normal').toLowerCase();

  // Si el modo configurado es 'normal', el comercio opera de forma regular (sin contingencia)
  if (mode === 'normal') {
    return false;
  }

  // Si el comercio activó una política de contingencia ('preorder_request' o 'safety_buffer'),
  // solo entra en estado de contingencia si el POS físico registró conexión previa y perdió latido por >15 min
  const hasHeartbeatTimeout = tenant.last_pos_heartbeat_at
    ? Date.now() - new Date(tenant.last_pos_heartbeat_at).getTime() > POS_HEARTBEAT_TIMEOUT_MS
    : false;

  return hasHeartbeatTimeout;
}

/**
 * Consulta y almacena en caché los datos del inquilino (`platform.tenants`).
 * TTL de 5 minutos (300s) con invalidación por tag (`tenant-${slug}`).
 */
export const getTenantBySlug = cache(async (slug: string): Promise<TenantRecord | null> => {
  const normalizedSlug = slug.toLowerCase().trim();

  return unstable_cache(
    async (): Promise<TenantRecord | null> => {
      const res = await pool.query(
        `SELECT id, slug, name, db_schema_name, plan_id, status, owner_email,
                COALESCE(storefront_enabled, true) AS storefront_enabled,
                contingency_offline_mode, safety_buffer_units, last_pos_heartbeat_at
         FROM platform.tenants
         WHERE slug = $1 AND status IN ('active', 'trial')`,
        [normalizedSlug]
      );
      return res.rows[0] ?? null;
    },
    ['tenant-by-slug', normalizedSlug],
    {
      tags: [`tenant-${normalizedSlug}`],
      revalidate: 300,
    }
  )();
});

/**
 * Shell y configuración general del comercio compartida entre Metadata, Layout y Subrutas.
 * React `cache()` evita consultas duplicadas dentro del mismo render SSR.
 */
export const getCachedTenantShell = cache(
  async (slug: string): Promise<TenantShellData | null> => {
    const normalizedSlug = slug.toLowerCase().trim();

    return unstable_cache(
      async (): Promise<TenantShellData | null> => {
        const tRes = await pool.query(
          `SELECT id, slug, name, db_schema_name, plan_id, status, owner_email,
                  COALESCE(storefront_enabled, true) AS storefront_enabled,
                  contingency_offline_mode, safety_buffer_units, last_pos_heartbeat_at
           FROM platform.tenants
           WHERE slug = $1 AND status IN ('active', 'trial')`,
          [normalizedSlug]
        );
        if ((tRes.rowCount || 0) === 0) return null;

        const tenant: TenantRecord = tRes.rows[0];
        const rawSettings = await withTenantDb(tenant.db_schema_name, null, async (client) => {
          const sRes = await client.query(`
            SELECT business_name, phone, whatsapp_number, address,
                   logo_url, banner_url, primary_color, secondary_color, accent_color,
                   primary_currency, secondary_currency, exchange_rate, value
            FROM settings
            WHERE key = 'general'
            LIMIT 1
          `);
          return sRes.rows[0] ?? null;
        });

        const inContingency = isTenantInContingency(tenant);
        const bufferUnits = inContingency ? Number(tenant.safety_buffer_units ?? 2) : 0;
        const taxes = rawSettings?.value?.taxes || {};

        return {
          tenant,
          settings: {
            business_name: rawSettings?.business_name || tenant.name,
            phone: rawSettings?.phone || null,
            whatsapp_number: rawSettings?.whatsapp_number || null,
            address: rawSettings?.address || 'Dirección física de mostrador',
            business_hours: rawSettings?.business_hours || rawSettings?.value?.business_hours || null,
            logo_url: rawSettings?.logo_url || null,
            banner_url: rawSettings?.banner_url || null,
            primary_color: rawSettings?.primary_color || TENANT_DEFAULTS.PRIMARY_COLOR,
            secondary_color: rawSettings?.secondary_color || TENANT_DEFAULTS.SECONDARY_COLOR,
            accent_color: rawSettings?.accent_color || TENANT_DEFAULTS.ACCENT_COLOR,
            primary_currency: rawSettings?.primary_currency || 'USD',
            secondary_currency: rawSettings?.secondary_currency || 'VES',
            exchange_rate: rawSettings?.exchange_rate ? Number(rawSettings.exchange_rate) : undefined,
            tax_enabled: taxes.tax_enabled ?? true,
            tax_rate: typeof taxes.tax_rate === 'number' ? taxes.tax_rate : 16.0,
            prices_include_tax: taxes.prices_include_tax ?? false,
            social_media: rawSettings?.value?.social_media || {},
            features: {
              tables_enabled: rawSettings?.value?.features?.tables_enabled !== false,
              recipes_enabled: rawSettings?.value?.features?.recipes_enabled === true,
              banner_style: (rawSettings?.value?.features?.banner_style as 'clean' | 'card') || 'clean',
            },
          },
          inContingency,
          bufferUnits,
        };
      },
      ['tenant-shell', normalizedSlug],
      {
        tags: [`tenant-${normalizedSlug}`, `tenant-settings-${normalizedSlug}`],
        revalidate: 120,
      }
    )();
  }
);

/**
 * Catálogo público cacheado (60s ISR / Data Cache) con buffer de contingencia aplicado.
 */
export const getCachedStorefrontCatalog = cache(
  async (
    slug: string,
    dbSchemaName: string,
    bufferUnits: number
  ): Promise<{ products: StorefrontCatalogItem[]; categories: StorefrontCatalogCategory[] }> => {
    const normalizedSlug = slug.toLowerCase().trim();

    return unstable_cache(
      async () => {
        const raw = await withTenantDb(dbSchemaName, null, async (client) => {
          const pluginsRes = await pool.query(
            `SELECT 1 FROM platform.tenant_plugins tp
             JOIN platform.tenants t ON t.id = tp.tenant_id
             WHERE t.db_schema_name = $1 AND tp.plugin_id = 'food_service' AND tp.is_active = true`,
            [dbSchemaName]
          );
          const hasFoodService = (pluginsRes.rowCount ?? 0) > 0;

          const modifierGroupsSql = hasFoodService
            ? `, COALESCE(
                 (SELECT jsonb_agg(jsonb_build_object(
                   'group_id', mg.id,
                   'group_name', mg.name,
                   'min_select', mg.min_select,
                   'max_select', mg.max_select,
                   'required', mg.required,
                   'options', (
                     SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'product_id', opt.id,
                       'name', opt.name,
                       'price_primary', COALESCE(opt.price_primary, 0)
                     )), '[]'::jsonb)
                     FROM fs_group_modifiers gm
                     JOIN products opt ON opt.id = gm.product_id
                     WHERE gm.group_id = mg.id AND opt.is_active = true
                   )
                 ))
                 FROM fs_product_groups pg
                 JOIN fs_modifier_groups mg ON mg.id = pg.group_id
                 WHERE pg.product_id = p.id AND mg.is_active = true),
                 '[]'::jsonb
               ) as modifier_groups`
            : `, '[]'::jsonb as modifier_groups`;

          const productsRes = await client.query(`
            SELECT
              p.id,
              p.name,
              p.slug,
              p.description,
              p.barcode,
              p.sku,
              COALESCE(p.price_primary, 0) AS price_usd,
              p.current_stock,
              p.min_stock_alert,
              p.image_url,
              p.is_tax_exempt,
              c.name AS category_name,
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                  'id', pv.id,
                  'name', pv.name,
                  'sku', pv.sku,
                  'attributes', pv.attributes,
                  'price_adjustment_primary', pv.price_adjustment_primary
                )) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true),
                '[]'::jsonb
              ) as variants
              ${modifierGroupsSql}
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.is_active = true
            ORDER BY COALESCE(c.sort_order, 999) ASC, c.name ASC, p.name ASC
          `);

          const categoriesRes = await client.query(`
            SELECT id, name, slug
            FROM categories
            WHERE is_active = true
            ORDER BY sort_order ASC, name ASC
          `);

          return {
            products: productsRes.rows,
            categories: categoriesRes.rows as StorefrontCatalogCategory[],
          };
        });

        const products: StorefrontCatalogItem[] = raw.products.map((p) => {
          const realStock = parseFloat(p.current_stock || '0');
          const adjustedStock = Math.max(0, realStock - bufferUnits);
          return {
            id: p.id,
            name: p.name,
            slug: p.slug || undefined,
            description: p.description || undefined,
            barcode: p.barcode || undefined,
            sku: p.sku || '',
            price_usd: p.price_usd,
            current_stock: adjustedStock.toString(),
            min_stock_alert: p.min_stock_alert,
            category_name: p.category_name || undefined,
            image_url: p.image_url || undefined,
            is_tax_exempt: Boolean(p.is_tax_exempt),
            variants: p.variants || [],
            modifier_groups: p.modifier_groups || [],
          };
        });

        return { products, categories: raw.categories };
      },
      ['storefront-catalog', normalizedSlug, dbSchemaName, String(bufferUnits)],
      {
        tags: [`tenant-catalog-${normalizedSlug}`, `tenant-${normalizedSlug}`],
        revalidate: 60,
      }
    )();
  }
);

/**
 * Directorio de comercios activos cacheado para la portada SaaS `/`.
 */
export async function getCachedTenantDirectory(): Promise<ActiveTenantSummary[]> {
  return unstable_cache(
    async (): Promise<ActiveTenantSummary[]> => {
      try {
        const res = await pool.query(`
          SELECT id, slug, name, status, COALESCE(storefront_enabled, true) AS storefront_enabled
          FROM platform.tenants
          WHERE status IN ('active', 'trial')
          ORDER BY created_at ASC
          LIMIT 12
        `);
        return res.rows;
      } catch {
        return [];
      }
    },
    ['tenants-directory'],
    {
      tags: ['tenants-directory'],
      revalidate: 120,
    }
  )();
}

/**
 * Invalida quirúrgicamente las etiquetas y rutas del comercio afectado tras mutaciones.
 */
export function invalidateTenantCache(
  slug: string,
  scope: 'catalog' | 'settings' | 'all' = 'all',
  mode: 'immediate' | 'swr' = 'immediate'
): void {
  const normalizedSlug = slug.toLowerCase().trim();
  const profile = mode === 'swr' ? 'max' : { expire: 0 };

  try {
    if (scope === 'catalog' || scope === 'all') {
      revalidateTag(`tenant-catalog-${normalizedSlug}`, profile);
      revalidatePath(`/t/${normalizedSlug}`);
    }
    if (scope === 'settings' || scope === 'all') {
      revalidateTag(`tenant-${normalizedSlug}`, profile);
      revalidateTag(`tenant-settings-${normalizedSlug}`, profile);
      revalidatePath(`/t/${normalizedSlug}`);
      revalidatePath(`/t/${normalizedSlug}/cart`);
      revalidatePath(`/t/${normalizedSlug}/checkout`);
      revalidatePath(`/t/${normalizedSlug}/pos`);
      revalidatePath(`/t/${normalizedSlug}/admin`);
    }
  } catch {
    // Ignorar de forma segura fuera de un request context Next.js
  }
}
