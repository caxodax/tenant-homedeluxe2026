import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const schema = tenant.db_schema_name;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    const dispatches = await withTenantDb(schema, null, async (client) => {
      let query = `
        SELECT 
          r.*,
          COALESCE(r.customer_name, o.customer_name) AS customer_name,
          COALESCE(r.customer_phone, o.customer_phone) AS customer_phone,
          COALESCE(r.delivery_address, o.delivery_address) AS delivery_address,
          o.order_number,
          o.total_primary AS order_total_primary,
          o.total_secondary AS order_total_secondary,
          COALESCE((SELECT primary_currency FROM settings WHERE key = 'general' LIMIT 1), 'USD') AS order_currency,
          COALESCE((SELECT secondary_currency FROM settings WHERE key = 'general' LIMIT 1), 'VES') AS order_secondary_currency,
          d.full_name AS driver_name,
          d.phone AS driver_phone,
          d.license_plate AS driver_plate,
          d.vehicle_type AS driver_vehicle,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'product_name', oi.product_name,
                  'quantity', oi.quantity,
                  'unit_price_primary', oi.unit_price_primary,
                  'selected_modifiers', oi.selected_modifiers
                )
              )
              FROM order_items oi
              WHERE oi.order_id = r.order_id
            ),
            '[]'::jsonb
          ) AS order_items
        FROM df_dispatch_routes r
        LEFT JOIN orders o ON r.order_id = o.id
        LEFT JOIN df_drivers d ON r.driver_id = d.id
      `;

      const values: (string | number)[] = [];
      if (status) {
        query += ` WHERE r.status = $1`;
        values.push(status);
      }

      query += ` ORDER BY r.created_at DESC LIMIT $${values.length + 1}`;
      values.push(limit);

      const res = await client.query(query, values);
      return res.rows;
    });

    return NextResponse.json({
      success: true,
      dispatches,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching dispatches:', error);
    return NextResponse.json({ error: 'Error al consultar despachos' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const tenantRes = await pool.query(
      `SELECT db_schema_name FROM platform.tenants WHERE slug = $1`,
      [slug.toLowerCase().trim()]
    );

    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 });
    }

    const schema = tenantRes.rows[0].db_schema_name;
    const body = await request.json();
    const { order_id, ...dispatchData } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'Se requiere order_id' }, { status: 400 });
    }

    const res = await pool.query(
      `SELECT platform.rpc_df_create_dispatch($1, $2, $3::jsonb) AS result`,
      [schema, order_id, JSON.stringify(dispatchData)]
    );

    return NextResponse.json({
      success: true,
      dispatch: res.rows[0]?.result,
    });
  } catch (error: unknown) {
    console.error('Error creating dispatch:', error);
    const message = error instanceof Error ? error.message : 'Error al registrar despacho';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
