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
    const { tenant, staff } = await requireTenantStaffApi(slug, 'staff');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        'SELECT platform.rpc_pay_import_sales_commissions($1, $2, $3) as result',
        [tenant.db_schema_name, id, staff.id]
      );

      const result = res.rows[0]?.result;
      return NextResponse.json(result);
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /payroll/runs/[id]/commissions:', error);
    return NextResponse.json({ error: error.message || 'Error al importar comisiones' }, { status: 500 });
  }
}
