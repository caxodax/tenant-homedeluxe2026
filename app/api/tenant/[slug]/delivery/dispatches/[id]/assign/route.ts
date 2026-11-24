import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');
    const schema = tenant.db_schema_name;
    const body = await request.json();
    const { driver_id } = body;

    if (!driver_id) {
      return NextResponse.json({ error: 'Se requiere driver_id para la asignación' }, { status: 400 });
    }

    const isUuid = (val?: string | null) =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const actorId = isUuid(staff.id) ? staff.id : null;

    const res = await pool.query(
      `SELECT platform.rpc_df_assign_driver($1, $2, $3, $4, $5) AS result`,
      [
        schema,
        id,
        driver_id,
        actorId,
        `${staff.role}: ${staff.full_name}`,
      ]
    );

    return NextResponse.json({
      success: true,
      data: res.rows[0]?.result,
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error assigning driver:', error);
    return NextResponse.json(
      { error: error.message || 'Error al asignar chofer' },
      { status: 500 }
    );
  }
}
