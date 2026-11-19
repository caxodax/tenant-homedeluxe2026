import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const productVariantInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nombre de variante requerido'),
  sku: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  protein: z.string().optional().nullable(),
  price: z.number().positive('El precio de la variante debe ser mayor a 0'),
  stock: z.number().nonnegative().optional().default(0),
  is_default: z.boolean().optional().default(false),
  recipe_items: z.array(z.object({
    raw_material_id: z.string(),
    quantity: z.number().positive(),
    waste_pct: z.number().min(0).max(100).optional().default(0),
  })).optional(),
});

const productSchema = z.object({
  name: z.string().min(2, 'Nombre requerido').max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  price_primary: z.number().nonnegative('El precio no puede ser negativo').optional(),
  price_usd: z.number().nonnegative('El precio no puede ser negativo').optional(),
  cost_price: z.number().nonnegative('El costo no puede ser negativo').optional().nullable(),
  is_tax_exempt: z.boolean().default(false),
  track_inventory: z.boolean().default(true),
  current_stock: z.number().nonnegative('El stock no puede ser negativo').default(0),
  min_stock_alert: z.number().nonnegative('El stock mínimo no puede ser negativo').default(5),
  is_active: z.boolean().default(true),
  image_url: z.string().optional().nullable(),
  // Campos gastronómicos (Plugin Food Service)
  is_dish: z.boolean().optional().default(false),
  stock_control_mode: z.enum(['UNLIMITED', 'SIMPLE', 'RAW_MATERIAL']).optional().default('SIMPLE'),
  variants: z.array(productVariantInputSchema).optional(),
  modifier_group_ids: z.array(z.string()).optional(),
  recipe_items: z.array(z.object({
    raw_material_id: z.string(),
    quantity: z.number().positive(),
    waste_pct: z.number().min(0).max(100).optional().default(0),
  })).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const schema = tenant.db_schema_name;
    const { searchParams } = new URL(request.url);
    const deletedOnly = searchParams.get('deleted_only') === 'true';
    const includeDeleted = searchParams.get('include_deleted') === 'true';

    const { products, settings, plan, foodService } = await withTenantDb(schema, null, async (client) => {
      let whereClause = 'p.deleted_at IS NULL';
      if (deletedOnly) {
        whereClause = 'p.deleted_at IS NOT NULL';
      } else if (includeDeleted) {
        whereClause = '1=1';
      }

      // 1. Detectar si el comercio tiene el plugin de restaurante activo
      const pluginRes = await client.query(
        `SELECT is_active, config FROM platform.tenant_plugins tp
         JOIN platform.tenants t ON t.id = tp.tenant_id
         WHERE t.slug = $1 AND tp.plugin_id = 'food_service' AND tp.is_active = true LIMIT 1`,
        [slug]
      );
      const isFoodServiceActive = (pluginRes.rowCount ?? 0) > 0;
      const foodServiceConfig = pluginRes.rows[0]?.config || {
        stock_control_mode: 'SIMPLE',
        auto_consume_stock: true,
      };

      const res = await client.query(
        `SELECT p.id, p.name, p.slug, p.description, p.sku, p.barcode, 
                p.price_primary, p.price_primary as price_usd,
                p.cost_price, p.current_stock, p.min_stock_alert, p.is_active, 
                p.deleted_at, p.image_url, p.is_tax_exempt, p.track_inventory,
                c.name as category_name, c.id as category_id,
                COALESCE(
                  (SELECT jsonb_agg(jsonb_build_object(
                    'id', pv.id,
                    'name', pv.name,
                    'sku', pv.sku,
                    'attributes', pv.attributes,
                    'price_adjustment_primary', pv.price_adjustment_primary,
                    'current_stock', pv.current_stock
                  )) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true),
                  '[]'::jsonb
                ) as variants,
                ${isFoodServiceActive ? `
                COALESCE(
                  (SELECT jsonb_agg(pg.group_id) FROM fs_product_groups pg WHERE pg.product_id = p.id),
                  '[]'::jsonb
                ) as modifier_group_ids,
                EXISTS(SELECT 1 FROM fs_recipes r WHERE r.product_id = p.id AND r.is_active = true) as has_recipe
                ` : `'[]'::jsonb as modifier_group_ids, false as has_recipe`}
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE ${whereClause}
         ORDER BY p.name ASC`
      );

      let modifierGroups: any[] = [];
      let rawMaterials: any[] = [];
      let recipes: any[] = [];

      if (isFoodServiceActive) {
        const [mgRes, rmRes, recRes] = await Promise.all([
          client.query(`SELECT id, name, min_select, max_select FROM fs_modifier_groups WHERE is_active = true ORDER BY name ASC`),
          client.query(`SELECT id, name, unit, cost_per_unit_primary, current_stock FROM fs_raw_materials WHERE is_active = true ORDER BY name ASC`),
          client.query(`
            SELECT r.id, r.product_id, r.variant_id, r.name, r.yield_portions,
                   COALESCE(jsonb_agg(jsonb_build_object(
                     'raw_material_id', ri.raw_material_id,
                     'quantity', ri.quantity,
                     'waste_pct', ri.waste_pct,
                     'raw_material_name', rm.name,
                     'unit', rm.unit,
                     'cost_per_unit_primary', rm.cost_per_unit_primary
                   )), '[]'::jsonb) as items
            FROM fs_recipes r
            JOIN fs_recipe_items ri ON ri.recipe_id = r.id
            JOIN fs_raw_materials rm ON rm.id = ri.raw_material_id
            WHERE r.is_active = true
            GROUP BY r.id, r.product_id, r.variant_id, r.name, r.yield_portions
          `),
        ]);
        modifierGroups = mgRes.rows;
        rawMaterials = rmRes.rows;
        recipes = recRes.rows;
      }

      const settingsRes = await client.query(
        `SELECT primary_currency, secondary_currency, exchange_rate, business_name FROM settings WHERE key = 'general' LIMIT 1`
      );

      // Obtener plan del tenant para mostrar límites de catálogo
      const tenantRes = await client.query(
        `SELECT t.plan_id, sp.name as plan_name, sp.max_products 
         FROM platform.tenants t
         LEFT JOIN platform.subscription_plans sp ON sp.id = t.plan_id
         WHERE t.slug = $1 LIMIT 1`,
        [slug]
      );

      return {
        products: res.rows,
        settings: settingsRes.rows[0] || { primary_currency: 'USD', secondary_currency: 'VES', exchange_rate: 1 },
        plan: tenantRes.rows[0] || { plan_name: 'PRO COMERCIAL', max_products: 300 },
        foodService: {
          isActive: isFoodServiceActive,
          config: foodServiceConfig,
          modifierGroups,
          rawMaterials,
          recipes,
        },
      };
    });

    return NextResponse.json({ products, settings, plan, foodService });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const schema = tenant.db_schema_name;
    const body = await request.json();
    const parsed = productSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const hasVariants = Boolean(data.variants && data.variants.length > 0);
    const basePrice = hasVariants 
      ? Math.min(...(data.variants || []).map((v) => v.price))
      : Math.max(0, Number(data.price_primary ?? data.price_usd ?? 0));

    let trackInventory = data.track_inventory;
    let initialStock = data.current_stock;

    if (data.is_dish) {
      if (data.stock_control_mode === 'UNLIMITED') {
        trackInventory = false;
        initialStock = 999;
      } else if (data.stock_control_mode === 'RAW_MATERIAL') {
        trackInventory = false;
        initialStock = 500;
      } else if (data.stock_control_mode === 'SIMPLE') {
        trackInventory = true;
        initialStock = hasVariants
          ? (data.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0)
          : data.current_stock;
      }
    }

    const productSlug = data.slug || data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const newProduct = await withTenantDb(schema, null, async (client) => {
      const pRes = await client.query(
        `INSERT INTO products (
          id, category_id, name, slug, description, sku, barcode,
          image_url, price_primary, cost_price, current_stock, min_stock_alert,
          track_inventory, is_tax_exempt, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, now(), now()
        ) RETURNING id, category_id, name, slug, description, sku, barcode,
                    image_url, price_primary, price_primary as price_usd,
                    cost_price, current_stock, min_stock_alert,
                    track_inventory, is_tax_exempt, is_active, created_at, updated_at`,
        [
          data.category_id || null,
          data.name,
          `${productSlug}-${Date.now().toString().slice(-4)}`,
          data.description || null,
          data.sku || null,
          data.barcode || null,
          data.image_url || null,
          basePrice,
          data.cost_price || 0,
          initialStock,
          data.min_stock_alert,
          trackInventory,
          data.is_tax_exempt,
          data.is_active,
        ]
      );

      const inserted = pRes.rows[0];

      // Sincronizar en la tabla inventory de la sede principal
      const storeRes = await client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`);
      if (storeRes.rowCount && storeRes.rowCount > 0) {
        const storeId = storeRes.rows[0].id;
        await client.query(
          `INSERT INTO inventory (id, store_id, product_id, quantity, min_quantity, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
           ON CONFLICT DO NOTHING`,
          [storeId, inserted.id, initialStock, data.min_stock_alert]
        );
      }

      // 1. Guardar Variantes de Plato (Tamaño / Proteína)
      if (hasVariants && data.variants) {
        for (let i = 0; i < data.variants.length; i++) {
          const v = data.variants[i];
          const priceAdj = Math.max(0, Number((v.price - basePrice).toFixed(2)));
          const vSku = v.sku || `${inserted.sku || 'VAR'}-${i + 1}`;
          const vAttributes = {
            size: v.size || '',
            size_label: v.size || '',
            protein: v.protein || '',
            protein_label: v.protein || '',
            is_default: Boolean(v.is_default || i === 0),
            stock_control_mode: data.stock_control_mode || 'SIMPLE',
          };

          const vRes = await client.query(
            `INSERT INTO product_variants (
              id, product_id, sku, name, attributes, price_adjustment_primary, current_stock, is_active
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true) RETURNING id`,
            [inserted.id, vSku, v.name, JSON.stringify(vAttributes), priceAdj, v.stock || 0]
          );
          const variantId = vRes.rows[0].id;

          // Si tiene receta específica para esta variante
          if (v.recipe_items && v.recipe_items.length > 0) {
            const recRes = await client.query(
              `INSERT INTO fs_recipes (id, product_id, variant_id, name, yield_portions)
               VALUES (gen_random_uuid(), $1, $2, $3, 1.0) RETURNING id`,
              [inserted.id, variantId, `Receta ${v.name}`]
            );
            const recipeId = recRes.rows[0].id;
            for (const item of v.recipe_items) {
              await client.query(
                `INSERT INTO fs_recipe_items (recipe_id, raw_material_id, quantity, waste_pct)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (recipe_id, raw_material_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
                [recipeId, item.raw_material_id, item.quantity, item.waste_pct || 0]
              );
            }
          }
        }
      }

      // 2. Vincular Grupos de Modificadores (Salsas / Bebidas)
      if (data.modifier_group_ids && data.modifier_group_ids.length > 0) {
        for (const groupId of data.modifier_group_ids) {
          await client.query(
            `INSERT INTO fs_product_groups (product_id, group_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [inserted.id, groupId]
          );
        }
      }

      // 3. Receta base del producto (si aplica)
      if (!hasVariants && data.recipe_items && data.recipe_items.length > 0) {
        const baseRecRes = await client.query(
          `INSERT INTO fs_recipes (id, product_id, variant_id, name, yield_portions)
           VALUES (gen_random_uuid(), $1, NULL, $2, 1.0) RETURNING id`,
          [inserted.id, `Receta ${data.name}`]
        );
        const baseRecId = baseRecRes.rows[0].id;
        for (const item of data.recipe_items) {
          await client.query(
            `INSERT INTO fs_recipe_items (recipe_id, raw_material_id, quantity, waste_pct)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (recipe_id, raw_material_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
            [baseRecId, item.raw_material_id, item.quantity, item.waste_pct || 0]
          );
        }
      }

      return inserted;
    });

    invalidateTenantCache(slug, 'catalog');
    return NextResponse.json({ success: true, product: newProduct });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
