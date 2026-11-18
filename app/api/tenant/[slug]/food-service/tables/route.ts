import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  getZonesAndTables,
  FsZoneInputSchema,
  FsTableInputSchema,
} from '@/lib/plugins/food-service';
import { withTenantDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');

    const zones = await getZonesAndTables(tenant.db_schema_name);

    return NextResponse.json({
      success: true,
      zones,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching food service tables:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const body = await request.json();

    if (body.type === 'zone') {
      const parsed = FsZoneInputSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Datos de zona inválidos', details: parsed.error.flatten() }, { status: 400 });
      }

      const zone = await withTenantDb(tenant.db_schema_name, null, async (client) => {
        const res = await client.query(
          `INSERT INTO fs_zones (name, sort_order, is_active) VALUES ($1, $2, $3) RETURNING *`,
          [parsed.data.name, parsed.data.sort_order, parsed.data.is_active]
        );
        return res.rows[0];
      });

      return NextResponse.json({ success: true, zone });
    }

    // Creación de Mesa
    const parsedTable = FsTableInputSchema.safeParse(body.data || body);
    if (!parsedTable.success) {
      return NextResponse.json({ error: 'Datos de mesa inválidos', details: parsedTable.error.flatten() }, { status: 400 });
    }

    const table = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `INSERT INTO fs_tables (zone_id, label, seats, status, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          parsedTable.data.zone_id,
          parsedTable.data.label,
          parsedTable.data.seats,
          parsedTable.data.status,
          parsedTable.data.is_active,
        ]
      );
      return res.rows[0];
    });

    return NextResponse.json({ success: true, table });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating food service table/zone:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
