import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'reports');
    const { searchParams } = new URL(request.url);

    const from = searchParams.get('from') || null;
    const to = searchParams.get('to') || null;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `SELECT platform.rpc_st_intel_report($1, $2, $3) AS result`,
        [tenant.db_schema_name, from, to]
      );
      return NextResponse.json({ report: res.rows[0]?.result || [] });
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching sales intel report:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al obtener reporte de ventas' },
      { status: 500 }
    );
  }
}
