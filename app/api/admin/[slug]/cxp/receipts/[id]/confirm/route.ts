import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: receiptId } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json().catch(() => ({}));
    const supplierBillNumber = body?.supplier_bill_number || null;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const confRes = await client.query(`
        SELECT platform.rpc_cxp_confirm_goods_receipt($1, $2, $3, $4, $5) as result;
      `, [
        tenant.db_schema_name,
        receiptId,
        staff.id,
        staff.role,
        supplierBillNumber,
      ]);

      const result = confRes.rows[0]?.result;
      if (!result?.success) {
        throw new Error(result?.message || 'Error al confirmar la recepción');
      }

      return NextResponse.json({
        success: true,
        confirmation: result,
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al confirmar recepción';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
