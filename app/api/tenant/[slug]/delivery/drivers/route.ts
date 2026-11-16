import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { DeliveryDriverInputSchema } from '@/lib/plugins/delivery-fleet';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const schema = tenant.db_schema_name;

    const drivers = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(`
        SELECT d.*, z.name AS home_zone_name
        FROM df_drivers d
        LEFT JOIN df_zones z ON d.home_zone_id = z.id
        ORDER BY d.is_active DESC, d.full_name ASC
      `);
      return res.rows;
    });

    return NextResponse.json({
      success: true,
      drivers,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching drivers:', error);
    return NextResponse.json({ error: 'Error al consultar motorizados' }, { status: 500 });
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

    const parsed = DeliveryDriverInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de motorizado inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      full_name,
      id_document,
      license_plate,
      phone,
      home_zone_id,
      vehicle_type,
      is_active,
      notes,
    } = parsed.data;

    const newDriver = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(
        `INSERT INTO df_drivers (
          full_name, id_document, license_plate, phone, 
          home_zone_id, vehicle_type, is_active, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          full_name,
          id_document.trim(),
          license_plate.toUpperCase().trim(),
          phone.trim(),
          home_zone_id || null,
          vehicle_type || 'motorcycle',
          is_active !== undefined ? is_active : true,
          notes || null,
        ]
      );
      return res.rows[0];
    });

    return NextResponse.json({
      success: true,
      driver: newDriver,
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un repartidor registrado con este documento de identidad.' },
        { status: 409 }
      );
    }
    console.error('Error creating driver:', error);
    return NextResponse.json({ error: 'Error al registrar repartidor' }, { status: 500 });
  }
}
