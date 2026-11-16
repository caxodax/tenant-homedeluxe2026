import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { DeliveryZoneInputSchema } from '@/lib/plugins/delivery-fleet';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const showAll = url.searchParams.get('all') === 'true';

    // Resolver tenant
    const tenantRes = await pool.query(
      `SELECT id, db_schema_name FROM platform.tenants WHERE slug = $1`,
      [slug.toLowerCase().trim()]
    );

    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 });
    }

    const schema = tenantRes.rows[0].db_schema_name;

    const zones = await withTenantDb(schema, null, async (client) => {
      const query = showAll
        ? `SELECT * FROM df_zones ORDER BY sort_order ASC, name ASC`
        : `SELECT * FROM df_zones WHERE is_active = true ORDER BY sort_order ASC, name ASC`;
      const res = await client.query(query);
      return res.rows;
    });

    return NextResponse.json({
      success: true,
      zones,
    });
  } catch (error) {
    console.error('Error fetching delivery zones:', error);
    return NextResponse.json({ error: 'Error al consultar zonas de delivery' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const schema = tenant.db_schema_name;
    const body = await request.json();

    const parsed = DeliveryZoneInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de zona inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      center_lat,
      center_lng,
      radius_km,
      rate_primary,
      estimated_time,
      is_active,
      sort_order,
    } = parsed.data;

    const newZone = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(
        `INSERT INTO df_zones (
          name, description, center_lat, center_lng, radius_km, 
          rate_primary, estimated_time, is_active, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          name,
          description || null,
          center_lat ?? null,
          center_lng ?? null,
          radius_km,
          rate_primary,
          estimated_time || '30-45 min',
          is_active !== undefined ? is_active : true,
          sort_order || 0,
        ]
      );
      return res.rows[0];
    });

    return NextResponse.json({
      success: true,
      zone: newZone,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating delivery zone:', error);
    return NextResponse.json({ error: 'Error al crear zona de delivery' }, { status: 500 });
  }
}
