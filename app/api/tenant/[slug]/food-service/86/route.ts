import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
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
    const { tenant } = await requireTenantStaffApi(slug, 'pos');

    const products86 = await getDaily86Products(tenant.db_schema_name);

    return NextResponse.json({
      success: true,
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
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();

    const parsed = FsToggle86InputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos para agotados (86)', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await toggleProduct86(
      tenant.db_schema_name,
      parsed.data.product_id,
      parsed.data.is_86
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
