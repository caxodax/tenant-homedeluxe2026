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
    const { status, failure_reason } = body;

    if (!status) {
      return NextResponse.json({ error: 'Se requiere status' }, { status: 400 });
    }

    const res = await pool.query(
      `SELECT platform.rpc_df_update_status($1, $2, $3, $4, $5, $6) AS result`,
      [
        schema,
        id,
        status,
        staff.id,
        `${staff.role}: ${staff.full_name}`,
        failure_reason || null,
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
    console.error('Error updating dispatch status:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar estado del despacho' },
      { status: 500 }
    );
  }
}
