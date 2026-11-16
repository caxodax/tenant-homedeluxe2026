import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { DeliveryFleetConfigSchema } from '@/lib/plugins/delivery-fleet';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');

    const pluginRes = await pool.query(
      `SELECT is_active, config FROM platform.tenant_plugins WHERE tenant_id = $1 AND plugin_id = 'delivery_fleet'`,
      [tenant.id]
    );

    const is_active = Boolean(pluginRes.rows[0]?.is_active);
    const config = pluginRes.rows[0]?.config || {
      gps_consent_required: true,
      default_zone_id: null,
      auto_resolve_zone_on_gps: true,
      fallback_enabled: true,
      whatsapp_template_enabled: true,
    };

    return NextResponse.json({
      success: true,
      plugin_id: 'delivery_fleet',
      is_active,
      config,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching delivery_fleet plugin config:', error);
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

    const parsedConfig = DeliveryFleetConfigSchema.partial().safeParse(body.config || body);
    if (!parsedConfig.success) {
      return NextResponse.json(
        { error: 'Configuración inválida', details: parsedConfig.error.flatten() },
        { status: 400 }
      );
    }

    const is_active = body.is_active !== undefined ? Boolean(body.is_active) : true;

    // Actualizar configuración en platform.tenant_plugins
    const res = await pool.query(
      `SELECT platform.rpc_toggle_tenant_plugin($1, $2, $3, $4::jsonb, $5, $6) AS result`,
      [
        tenant.id,
        'delivery_fleet',
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
    console.error('Error updating delivery_fleet plugin config:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
