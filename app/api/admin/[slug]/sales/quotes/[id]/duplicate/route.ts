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
      let actorId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id) ? staff.id : null;
      if (!actorId) {
        const ownerRes = await client.query(
          `SELECT id FROM ${tenant.db_schema_name}.staff_profiles WHERE role = 'OWNER' LIMIT 1`
        );
        actorId = ownerRes.rows[0]?.id || null;
      }

      const res = await client.query(
        `SELECT platform.rpc_st_duplicate_quote($1, $2, $3, $4) AS result`,
        [tenant.db_schema_name, id, actorId, staff.role]
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
