import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  openTable,
  payTable,
  FsOpenTableInputSchema,
  FsPayTableInputSchema,
} from '@/lib/plugins/food-service';
import { withTenantDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: tableId } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const action = body.action || 'OPEN';

    if (action === 'OPEN') {
      const parsed = FsOpenTableInputSchema.safeParse({
        ...body,
        table_id: tableId,
        staff_id: staff.id,
      });

      if (!parsed.success) {
        return NextResponse.json({ error: 'Datos de apertura inválidos', details: parsed.error.flatten() }, { status: 400 });
      }

      const result = await openTable(
        tenant.db_schema_name,
        parsed.data.table_id,
        parsed.data.staff_id || null,
        parsed.data.covers,
        parsed.data.notes || null
      );

      return NextResponse.json({ success: true, result });
    }

    if (action === 'PAY') {
      const parsed = FsPayTableInputSchema.safeParse({
        ...body,
        staff_id: staff.id,
      });

      if (!parsed.success) {
        return NextResponse.json({ error: 'Datos de pago inválidos', details: parsed.error.flatten() }, { status: 400 });
      }

      const result = await payTable(tenant.db_schema_name, parsed.data);
      return NextResponse.json({ success: true, result });
    }

    if (action === 'SET_STATUS') {
      const status = body.status;
      if (!['FREE', 'OCCUPIED', 'RESERVED', 'CLEANING'].includes(status)) {
        return NextResponse.json({ error: 'Estado de mesa no válido' }, { status: 400 });
      }

      await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
        await client.query(`UPDATE fs_tables SET status = $1 WHERE id = $2`, [status, tableId]);
      });

      return NextResponse.json({ success: true, table_id: tableId, status });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error executing table action:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
