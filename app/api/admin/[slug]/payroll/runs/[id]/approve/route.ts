import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({
  exchange_rate: z.number().positive('La tasa de cambio debe ser mayor a cero'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const { exchange_rate } = approveSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        'SELECT platform.rpc_pay_approve_run($1, $2, $3, $4) as result',
        [tenant.db_schema_name, id, exchange_rate, staff.id]
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
    console.error('Error in POST /payroll/runs/[id]/approve:', error);
    return NextResponse.json({ error: error.message || 'Error al aprobar corrida' }, { status: 500 });
  }
}
