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
        'SELECT platform.rpc_pay_intel_report($1, $2, $3) as result',
        [tenant.db_schema_name, from, to]
      );

      const result = res.rows[0]?.result;
      return NextResponse.json(result);
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/reports:', error);
    return NextResponse.json({ error: error.message || 'Error al obtener reporte de nómina' }, { status: 500 });
  }
}
