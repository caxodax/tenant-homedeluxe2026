import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { DeliveryZoneInputSchema } from '@/lib/plugins/delivery-fleet';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const schema = tenant.db_schema_name;
    const body = await request.json();

    const parsed = DeliveryZoneInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de zona inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(parsed.data)) {
      if (val !== undefined) {
        updates.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No se enviaron campos para actualizar' }, { status: 400 });
    }

    values.push(id);
    const query = `
      UPDATE df_zones 
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${idx}
      RETURNING *;
    `;

    const updatedZone = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(query, values);
      return res.rows[0];
    });

    if (!updatedZone) {
      return NextResponse.json({ error: 'Zona no encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      zone: updatedZone,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating delivery zone:', error);
    return NextResponse.json({ error: 'Error al actualizar zona de delivery' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const schema = tenant.db_schema_name;

    await withTenantDb(schema, null, async (client) => {
      await client.query(`DELETE FROM df_zones WHERE id = $1`, [id]);
    });

    return NextResponse.json({
      success: true,
      deleted_id: id,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting delivery zone:', error);
    return NextResponse.json({ error: 'Error al eliminar zona de delivery' }, { status: 500 });
  }
}
