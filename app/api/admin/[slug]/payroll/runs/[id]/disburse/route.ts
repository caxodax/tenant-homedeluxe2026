import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const disburseSchema = z.object({
  account_id: z.string().uuid('ID de cuenta de tesorería requerido'),
  disbursement_method: z.enum(['TRANSFER', 'PAGO_MOVIL', 'ZELLE', 'CASH', 'BINANCE', 'OTHER']).default('TRANSFER'),
  reference: z.string().trim().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const validated = disburseSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        'SELECT platform.rpc_pay_disburse_run($1, $2, $3, $4, $5, $6) as result',
        [
          tenant.db_schema_name,
          id,
          validated.account_id,
          validated.disbursement_method,
          validated.reference || null,
          staff.id,
        ]
      );

      const result = res.rows[0]?.result;
      return NextResponse.json(result);
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in POST /payroll/runs/[id]/disburse:', error);
    return NextResponse.json({ error: error.message || 'Error al liquidar nómina' }, { status: 500 });
  }
}
