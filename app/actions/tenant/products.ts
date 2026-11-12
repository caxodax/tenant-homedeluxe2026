'use server';

import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ProductSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  sku: z.string().min(1, 'El SKU es requerido'),
  barcode: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price_usd: z.number().positive('El precio debe ser mayor a 0'),
  current_stock: z.number().nonnegative('El stock no puede ser negativo'),
  min_stock_alert: z.number().nonnegative().default(5),
  image_url: z.string().optional().nullable(),
});

export type ProductInput = z.infer<typeof ProductSchema>;

export async function createProduct(slug: string, input: ProductInput) {
  try {
    const validated = ProductSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues.map((i) => i.message).join('. '),
      };
    }

    const {
      name,
      sku,
      barcode,
      category_id,
      description,
      price_usd,
      current_stock,
      min_stock_alert,
      image_url,
    } = validated.data;

    // Validar sesión y permisos RBAC de inventario
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const db_schema_name = tenant.db_schema_name;

    const productSlug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const newProduct = await withTenantDb(db_schema_name, null, async (client) => {
      // 1. Insertar Producto en products
      const pRes = await client.query(
        `INSERT INTO products (
          id, category_id, name, slug, description, sku, barcode,
          image_url, price_usd, current_stock, min_stock_alert,
          track_inventory, is_tax_exempt, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          true, false, true, now(), now()
        ) RETURNING id, name, sku, price_usd, current_stock, image_url`,
        [
          category_id || null,
          name,
          `${productSlug}-${Date.now().toString().slice(-4)}`,
          description || null,
          sku,
          barcode || null,
          image_url || null,
          price_usd,
          current_stock,
          min_stock_alert,
        ]
      );

      const inserted = pRes.rows[0];

      // 2. Sincronizar en la tabla inventory de la sede principal
      const storeRes = await client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`);
      if (storeRes.rowCount && storeRes.rowCount > 0) {
        const storeId = storeRes.rows[0].id;
        await client.query(
          `INSERT INTO inventory (id, store_id, product_id, quantity, min_quantity, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
           ON CONFLICT DO NOTHING`,
          [storeId, inserted.id, current_stock, min_stock_alert]
        );
      }

      return inserted;
    });

    invalidateTenantCache(slug, 'catalog');
    try {
      revalidatePath(`/t/${slug}/admin/inventory`);
      revalidatePath(`/t/${slug}/pos`);
    } catch {}

    return { success: true, product: newProduct };
  } catch (error: unknown) {
    console.error('Error creating product:', error);
    const message = error instanceof Error ? error.message : 'Error al crear producto';
    return { success: false, error: message };
  }
}

export async function updateProduct(slug: string, productId: string, input: ProductInput) {
  try {
    const validated = ProductSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues.map((i) => i.message).join('. '),
      };
    }

    const {
      name,
      sku,
      barcode,
      category_id,
      description,
      price_usd,
      current_stock,
      min_stock_alert,
      image_url,
    } = validated.data;

    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const db_schema_name = tenant.db_schema_name;

    await withTenantDb(db_schema_name, null, async (client) => {
      // 1. Actualizar producto
      await client.query(
        `UPDATE products SET
          name = $1,
          sku = $2,
          barcode = $3,
          category_id = $4,
          description = $5,
          price_usd = $6,
          current_stock = $7,
          min_stock_alert = $8,
          image_url = $9,
          updated_at = now()
         WHERE id = $10`,
        [
          name,
          sku,
          barcode || null,
          category_id || null,
          description || null,
          price_usd,
          current_stock,
          min_stock_alert,
          image_url || null,
          productId,
        ]
      );

      // 2. Actualizar stock en inventory
      const storeRes = await client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`);
      if (storeRes.rowCount && storeRes.rowCount > 0) {
        const storeId = storeRes.rows[0].id;
        await client.query(
          `UPDATE inventory 
           SET quantity = $1, min_quantity = $2, updated_at = now()
           WHERE product_id = $3 AND store_id = $4`,
          [current_stock, min_stock_alert, productId, storeId]
        );
      }
    });

    invalidateTenantCache(slug, 'catalog');
    try {
      revalidatePath(`/t/${slug}/admin/inventory`);
      revalidatePath(`/t/${slug}/pos`);
    } catch {}

    return { success: true };
  } catch (error: unknown) {
    console.error('Error updating product:', error);
    const message = error instanceof Error ? error.message : 'Error al actualizar producto';
    return { success: false, error: message };
  }
}

export async function deleteProduct(slug: string, productId: string) {
  try {
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const db_schema_name = tenant.db_schema_name;

    await withTenantDb(db_schema_name, null, async (client) => {
      // Soft-delete canónico para Blast Radius = 0 e integridad histórica de pedidos
      await client.query(
        `UPDATE products SET is_active = false, updated_at = now() WHERE id = $1`,
        [productId]
      );
    });

    invalidateTenantCache(slug, 'catalog');
    try {
      revalidatePath(`/t/${slug}/admin/inventory`);
      revalidatePath(`/t/${slug}/pos`);
    } catch {}

    return { success: true };
  } catch (error: unknown) {
    console.error('Error deleting product:', error);
    const message = error instanceof Error ? error.message : 'Error al desactivar producto';
    return { success: false, error: message };
  }
}
