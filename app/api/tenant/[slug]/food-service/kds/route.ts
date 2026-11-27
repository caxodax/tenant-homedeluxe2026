import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, resolveOperationalStoreId, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  getActiveKitchenTickets,
  sendToKitchen,
  FsSendToKitchenInputSchema,
} from '@/lib/plugins/food-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    // Permiso orders para personal de cocina y meseros
    const ctx = await requireTenantStaffApi(slug, 'orders');
    const storeId = await resolveOperationalStoreId(ctx, request.nextUrl.searchParams.get('store_id'));

    const tickets = await getActiveKitchenTickets(ctx.tenant.db_schema_name, storeId);

    return NextResponse.json({
      success: true,
      store_id: storeId,
      tickets,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching KDS tickets:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();

    const parsed = FsSendToKitchenInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de envío a cocina inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await sendToKitchen(
      tenant.db_schema_name,
      parsed.data.order_id,
      parsed.data.ticket_id || null,
      parsed.data.prep_notes || {}
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error sending order to kitchen:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
