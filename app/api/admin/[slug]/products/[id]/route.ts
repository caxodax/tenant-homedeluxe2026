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

const updateProductSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  price_primary: z.number().nonnegative('El precio no puede ser negativo').optional(),
  price_usd: z.number().nonnegative('El precio no puede ser negativo').optional(),
  cost_price: z.number().nonnegative('El costo no puede ser negativo').optional().nullable(),
  is_tax_exempt: z.boolean().optional(),
  track_inventory: z.boolean().optional(),
  current_stock: z.number().nonnegative('El stock no puede ser negativo').optional(),
  min_stock_alert: z.number().nonnegative('El stock mínimo no puede ser negativo').optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().optional().nullable(),
  // Campos gastronómicos (Plugin Food Service)
  is_dish: z.boolean().optional(),
  stock_control_mode: z.enum(['UNLIMITED', 'SIMPLE', 'RAW_MATERIAL']).optional(),
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
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const schema = tenant.db_schema_name;

    const product = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(
        `SELECT p.*, p.price_primary as price_usd, c.name as category_name
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = $1`,
        [id]
      );
      return res.rows[0] ?? null;
    });

    if (!product) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const schema = tenant.db_schema_name;
    const body = await request.json();

    // Soporte para restaurar producto archivado (soft-deleted)
    if (body.restore === true) {
      await withTenantDb(schema, null, async (client) => {
        await client.query(
          `UPDATE products 
           SET deleted_at = NULL, is_active = true, updated_at = now() 
           WHERE id = $1`,
          [id]
        );
      });
      invalidateTenantCache(slug, 'catalog');
      return NextResponse.json({ success: true, restored: true });
    }

    const parsed = updateProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const {
      variants,
      modifier_group_ids,
      recipe_items,
      is_dish,
      stock_control_mode,
      price_usd,
      ...rawProductFields
    } = data;

    const productFields: Record<string, any> = { ...rawProductFields };
    if (productFields.price_primary === undefined && price_usd !== undefined) {
      productFields.price_primary = price_usd;
    }

    const hasVariants = Boolean(variants && variants.length > 0);
    if (hasVariants && variants) {
      const basePrice = Math.min(...variants.map((v) => v.price));
      productFields.price_primary = basePrice;
      if (is_dish) {
        if (stock_control_mode === 'UNLIMITED') {
          productFields.track_inventory = false;
          productFields.current_stock = 999;
        } else if (stock_control_mode === 'RAW_MATERIAL') {
          productFields.track_inventory = false;
          productFields.current_stock = 500;
        } else if (stock_control_mode === 'SIMPLE') {
          productFields.track_inventory = true;
          productFields.current_stock = variants.reduce((sum, v) => sum + (v.stock || 0), 0);
        }
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(productFields)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    values.push(id);

    await withTenantDb(schema, null, async (client) => {
      if (fields.length > 0) {
        await client.query(
          `UPDATE products SET ${fields.join(', ')}, updated_at = now() WHERE id = $${paramIndex}`,
          values
        );
      }

      // Obtener sucursal activa para sincronización de inventario
      const storeRes = await client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`);
      const defaultStoreId = storeRes.rows[0]?.id;

      // 1. Sincronizar Variantes de Plato (Tamaño / Proteína) si se enviaron
      if (variants !== undefined) {
        await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [id]);
        if (variants.length > 0) {
          const effectiveBasePrice = Number(productFields.price_primary || 0);
          for (let i = 0; i < variants.length; i++) {
            const v = variants[i];
            const priceAdj = Math.max(0, Number((v.price - effectiveBasePrice).toFixed(2)));
            const vSku = v.sku || `VAR-${id.slice(0, 4)}-${i + 1}`;
            const vAttributes = {
              size: v.size || '',
              size_label: v.size || '',
              protein: v.protein || '',
              protein_label: v.protein || '',
              is_default: Boolean(v.is_default || i === 0),
              stock_control_mode: stock_control_mode || 'SIMPLE',
            };

            const vRes = await client.query(
              `INSERT INTO product_variants (
                id, product_id, sku, name, attributes, price_adjustment_primary, current_stock, is_active
              ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true) RETURNING id`,
              [id, vSku, v.name, JSON.stringify(vAttributes), priceAdj, v.stock ?? 100]
            );
            const variantId = vRes.rows[0].id;

            // Sincronizar stock de la variante en la tabla inventory
            if (defaultStoreId) {
              await client.query(
                `INSERT INTO inventory (store_id, product_id, variant_id, quantity, min_quantity)
                 VALUES ($1, $2, $3, $4, 5.000)
                 ON CONFLICT ON CONSTRAINT uq_inventory_store_product_variant
                 DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
                [defaultStoreId, id, variantId, v.stock ?? 100]
              );
            }

            if (v.recipe_items && v.recipe_items.length > 0) {
              const recRes = await client.query(
                `INSERT INTO fs_recipes (id, product_id, variant_id, name, yield_portions)
                 VALUES (gen_random_uuid(), $1, $2, $3, 1.0) RETURNING id`,
                [id, variantId, `Receta ${v.name}`]
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
      } else if (defaultStoreId && (productFields.current_stock !== undefined || productFields.min_stock_alert !== undefined)) {
        // Producto simple sin variantes
        await client.query(
          `INSERT INTO inventory (store_id, product_id, variant_id, quantity, min_quantity)
           VALUES ($1, $2, NULL, $3, $4)
           ON CONFLICT ON CONSTRAINT uq_inventory_store_product_variant
           DO UPDATE SET quantity = EXCLUDED.quantity, min_quantity = EXCLUDED.min_quantity, updated_at = now()`,
          [defaultStoreId, id, productFields.current_stock ?? 0, productFields.min_stock_alert ?? 5]
        );
      }

      // 2. Sincronizar Grupos de Modificadores (Salsas / Bebidas)
      if (modifier_group_ids !== undefined) {
        await client.query(`DELETE FROM fs_product_groups WHERE product_id = $1`, [id]);
        for (const groupId of modifier_group_ids) {
          await client.query(
            `INSERT INTO fs_product_groups (product_id, group_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [id, groupId]
          );
        }
      }

      // 3. Sincronizar Receta Base
      if (recipe_items !== undefined && (!variants || variants.length === 0)) {
        await client.query(`DELETE FROM fs_recipes WHERE product_id = $1 AND variant_id IS NULL`, [id]);
        if (recipe_items.length > 0) {
          const baseRecRes = await client.query(
            `INSERT INTO fs_recipes (id, product_id, variant_id, name, yield_portions)
             VALUES (gen_random_uuid(), $1, NULL, $2, 1.0) RETURNING id`,
            [id, `Receta ${productFields.name || 'Platillo'}`]
          );
          const baseRecId = baseRecRes.rows[0].id;
          for (const item of recipe_items) {
            await client.query(
              `INSERT INTO fs_recipe_items (recipe_id, raw_material_id, quantity, waste_pct)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (recipe_id, raw_material_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
              [baseRecId, item.raw_material_id, item.quantity, item.waste_pct || 0]
            );
          }
        }
      }
    });

    invalidateTenantCache(slug, 'catalog');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const schema = tenant.db_schema_name;

    // Eliminación lógica canónica (Soft-Delete)
    // Marca deleted_at = now() y desactiva el producto sin eliminar registros físicos,
    // preservando la integridad referencial de order_items e historial de inventario.
    const result = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(
        `UPDATE products 
         SET deleted_at = now(), is_active = false, updated_at = now() 
         WHERE id = $1 AND deleted_at IS NULL 
         RETURNING id, name, deleted_at`,
        [id]
      );
      return res.rows[0];
    });

    if (!result) {
      return NextResponse.json({ error: 'Producto no encontrado o ya archivado' }, { status: 404 });
    }

    invalidateTenantCache(slug, 'catalog');
    return NextResponse.json({ success: true, softDeleted: true, deletedProduct: result });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500 }
    );
  }
}
