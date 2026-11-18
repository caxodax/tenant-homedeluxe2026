import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  updateKitchenStatus,
  FsKitchenUpdateInputSchema,
} from '@/lib/plugins/food-service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id: kitchenTicketId } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const body = await request.json();

    const parsed = FsKitchenUpdateInputSchema.safeParse({
      ...body,
      kitchen_ticket_id: kitchenTicketId,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de actualización de comanda inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await updateKitchenStatus(
      tenant.db_schema_name,
      parsed.data.kitchen_ticket_id,
      parsed.data.item_ids || null,
      parsed.data.action
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating KDS ticket:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
