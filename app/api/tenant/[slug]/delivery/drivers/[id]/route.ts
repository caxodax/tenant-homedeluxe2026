import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { DeliveryDriverInputSchema } from '@/lib/plugins/delivery-fleet';

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

    const parsed = DeliveryDriverInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de motorizado inválidos', details: parsed.error.flatten() },
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
      UPDATE df_drivers 
      SET ${updates.join(', ')}, updated_at = now()
      WHERE id = $${idx}
      RETURNING *;
    `;

    const updatedDriver = await withTenantDb(schema, null, async (client) => {
      const res = await client.query(query, values);
      return res.rows[0];
    });

    if (!updatedDriver) {
      return NextResponse.json({ error: 'Motorizado no encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      driver: updatedDriver,
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un repartidor con ese documento de identidad' },
        { status: 409 }
      );
    }
    console.error('Error updating driver:', error);
    return NextResponse.json({ error: 'Error al actualizar motorizado' }, { status: 500 });
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
      // Soft-delete / desactivación para preservar histórico de rutas
      await client.query(`UPDATE df_drivers SET is_active = false, updated_at = now() WHERE id = $1`, [id]);
    });

    return NextResponse.json({
      success: true,
      deactivated_id: id,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deactivating driver:', error);
    return NextResponse.json({ error: 'Error al desactivar motorizado' }, { status: 500 });
  }
}
