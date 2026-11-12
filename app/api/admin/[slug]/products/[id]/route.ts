import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateProductSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  price_usd: z.number().min(0).optional(),
  cost_price: z.number().min(0).optional().nullable(),
  is_tax_exempt: z.boolean().optional(),
  track_inventory: z.boolean().optional(),
  current_stock: z.number().min(0).optional(),
  min_stock_alert: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
  image_url: z.string().optional().nullable(),
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
        `SELECT p.*, c.name as category_name
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
    const parsed = updateProductSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    values.push(id);

    await withTenantDb(schema, null, async (client) => {
      await client.query(
        `UPDATE products SET ${fields.join(', ')}, updated_at = now() WHERE id = $${paramIndex}`,
        values
      );

      // Si se actualizó current_stock o min_stock_alert, sincronizar inventory
      if (data.current_stock !== undefined || data.min_stock_alert !== undefined) {
        const storeRes = await client.query(`SELECT id FROM stores WHERE is_active = true LIMIT 1`);
        if (storeRes.rowCount && storeRes.rowCount > 0) {
          const storeId = storeRes.rows[0].id;
          await client.query(
            `UPDATE inventory 
             SET quantity = COALESCE($1, quantity), 
                 min_quantity = COALESCE($2, min_quantity), 
                 updated_at = now()
             WHERE product_id = $3 AND store_id = $4`,
            [data.current_stock ?? null, data.min_stock_alert ?? null, id, storeId]
          );
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

    // Eliminación lógica canónica para Blast Radius = 0
    await withTenantDb(schema, null, async (client) => {
      await client.query(
        `UPDATE products SET is_active = false, updated_at = now() WHERE id = $1`,
        [id]
      );
    });

    invalidateTenantCache(slug, 'catalog');
    return NextResponse.json({ success: true });
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
