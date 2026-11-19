import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `SELECT platform.rpc_st_duplicate_quote($1, $2, $3, $4) AS result`,
        [tenant.db_schema_name, id, staff.id, staff.role]
      );
      return NextResponse.json(res.rows[0]?.result);
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error duplicating quote:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al duplicar cotización' },
      { status: 400 }
    );
  }
}
