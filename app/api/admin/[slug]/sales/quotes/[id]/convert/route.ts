import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');
    let orderExtras = {};
    try {
      orderExtras = await request.json();
    } catch {
      // Body opcional
    }

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `SELECT platform.rpc_st_convert_quote($1, $2, $3, $4, $5) AS result`,
        [tenant.db_schema_name, id, staff.id, staff.role, JSON.stringify(orderExtras)]
      );
      return NextResponse.json(res.rows[0]?.result);
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error converting quote to order:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al convertir cotización en pedido' },
      { status: 400 }
    );
  }
}
