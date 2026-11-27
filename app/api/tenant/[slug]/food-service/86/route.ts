import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, resolveOperationalStoreId, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  getDaily86Products,
  toggleProduct86,
  FsToggle86InputSchema,
} from '@/lib/plugins/food-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    // La lista de agotados se puede consultar con cualquier nivel de acceso staff
    const ctx = await requireTenantStaffApi(slug, 'pos');
    const storeId = await resolveOperationalStoreId(ctx, request.nextUrl.searchParams.get('store_id'));

    const products86 = await getDaily86Products(ctx.tenant.db_schema_name, storeId);

    return NextResponse.json({
      success: true,
      store_id: storeId,
      products_86: products86,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching 86 list:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();

    const parsed = FsToggle86InputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos para agotados (86)', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const storeId = await resolveOperationalStoreId(ctx, typeof body?.store_id === 'string' ? body.store_id : null);

    const result = await toggleProduct86(
      ctx.tenant.db_schema_name,
      parsed.data.product_id,
      parsed.data.is_86,
      storeId
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error toggling product 86:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
