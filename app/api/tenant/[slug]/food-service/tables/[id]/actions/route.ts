import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  openTable,
  payTable,
  validateTablePayment,
  moveTable,
  releaseEmptyTable,
  FsOpenTableInputSchema,
  FsPayTableInputSchema,
} from '@/lib/plugins/food-service';
import { withTenantDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DIGITAL_METHODS = new Set(['PAGO_MOVIL', 'ZELLE', 'TRANSFER', 'TRANSFERENCIA']);

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

    if (action === 'REQUEST_BILL') {
      await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
        await client.query(
          `UPDATE fs_tables SET status = 'BILL_REQUESTED' WHERE id = $1 AND status IN ('OCCUPIED', 'BILL_REQUESTED')`,
          [tableId]
        );
      });
      return NextResponse.json({ success: true, table_id: tableId, status: 'BILL_REQUESTED' });
    }

    if (action === 'PAY') {
      const parsed = FsPayTableInputSchema.safeParse({
        ...body,
        staff_id: staff.id,
      });

      if (!parsed.success) {
        return NextResponse.json({ error: 'Datos de pago inválidos', details: parsed.error.flatten() }, { status: 400 });
      }

      const isWaiter = staff.role === 'WAITER';
      const data = parsed.data;

      // Si es mesero reportando Pago Móvil / Transferencia, debe quedar pendiente de validar por Caja
      const globalMethodUpper = (data.payment_method || '').toUpperCase();
      const markGlobalPending =
        Boolean(data.mark_pending) || (isWaiter && DIGITAL_METHODS.has(globalMethodUpper));

      if (data.pay_mode === 'FULL' && DIGITAL_METHODS.has(globalMethodUpper) && !data.reference_number?.trim()) {
        return NextResponse.json(
          { error: 'Debes ingresar el número de referencia para Pago Móvil o Transferencia.' },
          { status: 400 }
        );
      }

      const normalizedSplits = (data.splits || []).map((s) => {
        const mUpper = (s.method || data.payment_method || '').toUpperCase();
        if (DIGITAL_METHODS.has(mUpper) && !s.reference?.trim() && !data.reference_number?.trim()) {
          throw new TenantAuthError(
            `Falta el número de referencia para ${s.label || 'la subcuenta'} (${mUpper}).`,
            400
          );
        }
        return {
          ...s,
          mark_pending: Boolean(s.mark_pending) || (isWaiter && DIGITAL_METHODS.has(mUpper)),
        };
      });

      const result = await payTable(tenant.db_schema_name, {
        ...data,
        splits: normalizedSplits,
        mark_pending: markGlobalPending,
      });
      return NextResponse.json({ success: true, result });
    }

    if (action === 'VALIDATE_PAYMENT') {
      if (staff.role === 'WAITER') {
        return NextResponse.json(
          { error: 'Solo Cajero, Gerente o Propietario pueden confirmar o rechazar pagos reportados.' },
          { status: 403 }
        );
      }
      if (!body.ticket_id || !body.payment_id) {
        return NextResponse.json({ error: 'ticket_id y payment_id son requeridos.' }, { status: 400 });
      }
      const result = await validateTablePayment(
        tenant.db_schema_name,
        body.ticket_id,
        body.payment_id,
        Boolean(body.approve),
        staff.id,
        body.rejection_reason || null
      );
      return NextResponse.json({ success: true, result });
    }

    if (action === 'MOVE_TABLE') {
      if (!body.to_table_id) {
        return NextResponse.json({ error: 'Mesa de destino requerida.' }, { status: 400 });
      }
      const result = await moveTable(tenant.db_schema_name, tableId, body.to_table_id);
      return NextResponse.json({ success: true, result });
    }

    if (action === 'RELEASE_EMPTY') {
      const result = await releaseEmptyTable(tenant.db_schema_name, tableId);
      return NextResponse.json({ success: true, result });
    }

    if (action === 'SET_STATUS') {
      const status = body.status;
      if (!['FREE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'BILL_REQUESTED', 'PENDING_VALIDATION'].includes(status)) {
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
    const msg = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
