import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { FoodServiceConfigSchema, getFoodServiceConfig } from '@/lib/plugins/food-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');

    const result = await getFoodServiceConfig(tenant.id);

    return NextResponse.json({
      success: true,
      plugin_id: 'food_service',
      is_active: result.is_active,
      config: result.config,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching food_service plugin config:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'settings');
    const body = await request.json();

    const parsedConfig = FoodServiceConfigSchema.partial().safeParse(body.config || body);
    if (!parsedConfig.success) {
      return NextResponse.json(
        { error: 'Configuración inválida', details: parsedConfig.error.flatten() },
        { status: 400 }
      );
    }

    const is_active = body.is_active !== undefined ? Boolean(body.is_active) : true;

    // Actualizar configuración llamando al router canónico platform.rpc_toggle_tenant_plugin
    const res = await pool.query(
      `SELECT platform.rpc_toggle_tenant_plugin($1, $2, $3, $4::jsonb, $5, $6) AS result`,
      [
        tenant.id,
        'food_service',
        is_active,
        JSON.stringify(parsedConfig.data),
        staff.id,
        `${staff.role}: ${staff.full_name}`,
      ]
    );

    return NextResponse.json({
      success: true,
      result: res.rows[0]?.result,
      config: parsedConfig.data,
      is_active,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating food_service plugin config:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
