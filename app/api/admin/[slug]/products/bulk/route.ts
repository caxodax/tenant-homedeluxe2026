import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface BulkProductRow {
  name: string;
  category_name?: string;
  price_primary?: number;
  price_usd?: number;
  current_stock?: number;
  min_stock_alert?: number;
  sku?: string;
  barcode?: string;
  is_tax_exempt?: boolean;
  description?: string;
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

    const items: BulkProductRow[] = Array.isArray(body.products) ? body.products : [];

    if (items.length === 0) {
      return NextResponse.json({ error: 'No se enviaron productos para importar' }, { status: 400 });
    }

    const insertedCount = await withTenantDb(schema, null, async (client) => {
      // 1. Obtener ID de la tienda principal
      const storeRes = await client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`);
      const storeId = storeRes.rows[0]?.id || null;

      // 2. Mapear categorías existentes
      const catRes = await client.query(`SELECT id, lower(name) as name_lower FROM categories WHERE deleted_at IS NULL`);
      const catMap = new Map<string, string>();
      for (const row of catRes.rows) {
        catMap.set(row.name_lower, row.id);
      }

      let count = 0;

      for (const item of items) {
        const rawName = (item.name || '').trim();
        if (!rawName) continue;

        const price = Math.max(0.01, Number(item.price_primary ?? item.price_usd) || 0.01);
        const stock = Math.max(0, Number(item.current_stock) || 0);
        const minAlert = Math.max(0, Number(item.min_stock_alert ?? 5) || 5);
        const sku = item.sku ? item.sku.trim() : null;
        const barcode = item.barcode ? item.barcode.trim() : null;
        const isTaxExempt = Boolean(item.is_tax_exempt);
        const description = item.description ? item.description.trim() : null;

        // Resolver o crear categoría si fue indicada
        let categoryId: string | null = null;
        const catName = (item.category_name || '').trim();
        if (catName) {
          const lowerCat = catName.toLowerCase();
          if (catMap.has(lowerCat)) {
            categoryId = catMap.get(lowerCat)!;
          } else {
            const catSlug = slugify(catName) || `cat-${Date.now()}`;
            const newCatRes = await client.query(
              `INSERT INTO categories (name, slug, sort_order, is_active)
               VALUES ($1, $2, 0, true)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
               RETURNING id`,
              [catName, catSlug]
            );
            const newCatId = newCatRes.rows[0]?.id;
            if (newCatId) {
              categoryId = newCatId;
              catMap.set(lowerCat, newCatId);
            }
          }
        }

        // Generar slug único
        const baseSlug = slugify(rawName) || `prod-${Date.now()}`;
        let finalSlug = baseSlug;
        let counter = 1;
        while (true) {
          const check = await client.query('SELECT id FROM products WHERE slug = $1 LIMIT 1', [finalSlug]);
          if (check.rows.length === 0) break;
          finalSlug = `${baseSlug}-${counter}`;
          counter++;
        }

        // Insertar producto
        const insertRes = await client.query(
          `INSERT INTO products (
             name, slug, category_id, price_primary, current_stock, min_stock_alert,
             sku, barcode, is_tax_exempt, description, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
           RETURNING id`,
          [rawName, finalSlug, categoryId, price, stock, minAlert, sku, barcode, isTaxExempt, description]
        );

        const newProdId = insertRes.rows[0].id;

        // Registrar en inventory si existe sede
        if (storeId) {
          await client.query(
            `INSERT INTO inventory (product_id, store_id, quantity, min_quantity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (product_id, store_id) DO UPDATE SET quantity = EXCLUDED.quantity, min_quantity = EXCLUDED.min_quantity`,
            [newProdId, storeId, stock, minAlert]
          );
        }

        count++;
      }

      return count;
    });

    invalidateTenantCache(slug, 'catalog');
    return NextResponse.json({ success: true, count: insertedCount });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in bulk import:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al importar productos masivamente' },
      { status: 500 }
    );
  }
}
