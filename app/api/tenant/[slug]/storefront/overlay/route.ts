import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { getCachedTenantShell } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const shell = await getCachedTenantShell(slug);
    if (!shell || shell.tenant.storefront_enabled === false) {
      return NextResponse.json({ error: 'Vitrina no disponible' }, { status: 404 });
    }

    const requestedStoreId = request.nextUrl.searchParams.get('store_id');
    const schema = shell.tenant.db_schema_name;

    const overlay = await withTenantDb(schema, null, async (client) => {
      let storeId = requestedStoreId;
      if (!storeId) {
        const sRes = await client.query(
          `SELECT id FROM stores WHERE is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1`
        );
        storeId = sRes.rows[0]?.id || null;
      }

      if (!storeId) {
        return {
          store_id: null,
          unavailable_product_ids: [],
          excluded_product_ids: [],
          daily_86_product_ids: [],
          price_overrides: {},
          stock_by_product: {},
        };
      }

      const [overridesRes, scopesRes, invRes] = await Promise.all([
        client.query(
          `SELECT product_id, is_available, price_override
           FROM store_product_overrides
           WHERE store_id = $1`,
          [storeId]
        ),
        client.query(
          `SELECT DISTINCT sps.product_id
           FROM store_product_scopes sps
           WHERE NOT EXISTS (
             SELECT 1 FROM store_product_scopes sps2
             WHERE sps2.product_id = sps.product_id AND sps2.store_id = $1
           )`,
          [storeId]
        ),
        client.query(
          `SELECT product_id, COALESCE(SUM(quantity), 0) AS qty
           FROM inventory
           WHERE store_id = $1
           GROUP BY product_id`,
          [storeId]
        ),
      ]);

      let daily86Ids: string[] = [];
      try {
        const d86Res = await client.query(
          `SELECT product_id FROM fs_daily_86 WHERE store_id = $1 AND service_date = CURRENT_DATE AND is_86 = true`,
          [storeId]
        );
        daily86Ids = d86Res.rows.map((r: { product_id: string }) => r.product_id);
      } catch {
        // Plugin food_service no instalado en este tenant
      }

      const unavailableIds: string[] = [];
      const priceOverrides: Record<string, number> = {};
      for (const row of overridesRes.rows) {
        if (row.is_available === false) unavailableIds.push(row.product_id);
        if (row.price_override !== null) priceOverrides[row.product_id] = Number(row.price_override);
      }

      const stockByProduct: Record<string, number> = {};
      for (const row of invRes.rows) {
        stockByProduct[row.product_id] = Number(row.qty);
      }

      return {
        store_id: storeId,
        unavailable_product_ids: unavailableIds,
        excluded_product_ids: scopesRes.rows.map((r: { product_id: string }) => r.product_id),
        daily_86_product_ids: daily86Ids,
        price_overrides: priceOverrides,
        stock_by_product: stockByProduct,
      };
    });

    return NextResponse.json(overlay, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('Error fetching storefront store overlay:', err);
    return NextResponse.json({ error: 'Error al consultar disponibilidad por sede' }, { status: 500 });
  }
}
