import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const productSchema = z.object({
  name: z.string().min(2, 'Nombre requerido').max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  price_usd: z.number().min(0, 'Precio debe ser >= 0'),
  cost_price: z.number().min(0).optional().nullable(),
  is_tax_exempt: z.boolean().default(false),
  track_inventory: z.boolean().default(true),
  current_stock: z.number().min(0).default(0),
  min_stock_alert: z.number().min(0).default(5),
  is_active: z.boolean().default(true),
  image_url: z.string().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const schema = tenant.db_schema_name;

    const res = await withTenantDb(schema, null, async (client) => {
      return client.query(
        `SELECT p.id, p.name, p.slug, p.sku, p.barcode, p.price_usd, 
                p.cost_price, p.current_stock, p.min_stock_alert, p.is_active, 
                p.image_url, p.is_tax_exempt, p.track_inventory,
                c.name as category_name, c.id as category_id
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         ORDER BY p.name ASC`
      );
    });

    return NextResponse.json({ products: res.rows });
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
    const productSlug = data.slug || data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const newProduct = await withTenantDb(schema, null, async (client) => {
      const pRes = await client.query(
        `INSERT INTO products (
          id, category_id, name, slug, description, sku, barcode,
          image_url, price_usd, cost_price, current_stock, min_stock_alert,
          track_inventory, is_tax_exempt, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, now(), now()
        ) RETURNING *`,
        [
          data.category_id || null,
          data.name,
          `${productSlug}-${Date.now().toString().slice(-4)}`,
          data.description || null,
          data.sku || null,
          data.barcode || null,
          data.image_url || null,
          data.price_usd,
          data.cost_price || 0,
          data.current_stock,
          data.min_stock_alert,
          data.track_inventory,
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
          [storeId, inserted.id, data.current_stock, data.min_stock_alert]
        );
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
