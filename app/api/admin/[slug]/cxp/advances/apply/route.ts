import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const applyAdvanceSchema = z.object({
  advance_id: z.string().uuid('ID de anticipo requerido'),
  bill_id: z.string().uuid('ID de factura requerido'),
  amount_primary: z.number().positive('El monto a aplicar debe ser mayor a 0').optional(),
  amount_usd: z.number().positive().optional(),
}).refine(data => data.amount_primary !== undefined || data.amount_usd !== undefined, {
  message: 'El monto a aplicar debe ser mayor a 0',
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const data = applyAdvanceSchema.parse(body);
    const amountPrimary = data.amount_primary ?? data.amount_usd!;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT platform.rpc_cxp_apply_advance($1, $2, $3, $4, $5) as result;
      `, [
        tenant.db_schema_name,
        data.advance_id,
        data.bill_id,
        amountPrimary,
        staff.id,
      ]);

      const result = res.rows[0]?.result;
      if (!result?.success) {
        throw new Error(result?.message || 'Error al aplicar el anticipo a la factura');
      }

      return NextResponse.json({
        success: true,
        application: result,
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al aplicar anticipo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
