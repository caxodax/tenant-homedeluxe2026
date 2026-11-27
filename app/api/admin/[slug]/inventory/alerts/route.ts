import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, resolveOperationalStoreId, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = await requireTenantStaffApi(slug, 'inventory');
    const schema = ctx.tenant.db_schema_name;
    const storeId = await resolveOperationalStoreId(ctx, request.nextUrl.searchParams.get('store_id'), {
      allowConsolidatedForManagers: true,
    });

    const result = await withTenantDb(schema, null, async (client) => {
      if (storeId) {
        const res = await client.query(
          `
          SELECT 
            p.id, 
            p.name, 
            p.sku, 
            inv.quantity AS current_stock, 
            inv.min_quantity AS min_stock_alert, 
            p.image_url,
            c.name as category_name,
            s.name as store_name
          FROM inventory inv
          JOIN products p ON p.id = inv.product_id
          JOIN stores s ON s.id = inv.store_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE inv.store_id = $1
            AND p.is_active = true 
            AND p.deleted_at IS NULL
            AND p.track_inventory = true
            AND inv.quantity <= inv.min_quantity
          ORDER BY inv.quantity ASC, p.name ASC
          LIMIT 25
        `,
          [storeId]
        );

        const countRes = await client.query(
          `
          SELECT COUNT(*) as total
          FROM inventory inv
          JOIN products p ON p.id = inv.product_id
          WHERE inv.store_id = $1
            AND p.is_active = true 
            AND p.deleted_at IS NULL
            AND p.track_inventory = true
            AND inv.quantity <= inv.min_quantity
        `,
          [storeId]
        );

        return {
          store_id: storeId,
          count: parseInt(countRes.rows[0]?.total || '0', 10),
          products: res.rows.map((r: {
            id: string;
            name: string;
            sku: string;
            current_stock: string | number;
            min_stock_alert: string | number;
            image_url: string | null;
            category_name: string | null;
            store_name?: string | null;
          }) => ({
            id: r.id,
            name: r.name,
            sku: r.sku,
            current_stock: parseFloat(String(r.current_stock || '0')),
            min_stock_alert: parseFloat(String(r.min_stock_alert || '0')),
            image_url: r.image_url,
            category_name: r.category_name,
            store_name: r.store_name || null,
          })),
        };
      }

      const res = await client.query(`
        SELECT 
          p.id, 
          p.name, 
          p.sku, 
          p.current_stock, 
          p.min_stock_alert, 
          p.image_url,
          c.name as category_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true 
          AND p.deleted_at IS NULL
          AND p.current_stock <= p.min_stock_alert
        ORDER BY p.current_stock ASC, p.name ASC
        LIMIT 25
      `);

      const countRes = await client.query(`
        SELECT COUNT(*) as total
        FROM products
        WHERE is_active = true 
          AND deleted_at IS NULL
          AND current_stock <= min_stock_alert
      `);

      return {
        count: parseInt(countRes.rows[0]?.total || '0', 10),
        products: res.rows.map((r: {
          id: string;
          name: string;
          sku: string;
          current_stock: string | number;
          min_stock_alert: string | number;
          image_url: string | null;
          category_name: string | null;
        }) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          current_stock: parseFloat(String(r.current_stock || '0')),
          min_stock_alert: parseFloat(String(r.min_stock_alert || '0')),
          image_url: r.image_url,
          category_name: r.category_name,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching inventory alerts:', err);
    return NextResponse.json({ error: 'Error al consultar alertas de stock' }, { status: 500 });
  }
}
