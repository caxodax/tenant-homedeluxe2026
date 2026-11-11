import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const settingsUpdateSchema = z.object({
  business_name: z.string().min(2).max(200).optional(),
  category: z.string().optional(),
  phone: z.string().optional().nullable(),
  whatsapp_number: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  banner_url: z.string().optional().nullable(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  accent_color: z.string().optional(),
  font_family: z.string().optional(),
  primary_currency: z.string().optional(),
  secondary_currency: z.string().optional(),
  contingency_offline_mode: z.string().optional(),
  offline_safety_buffer: z.number().min(0).optional(),
  social_media: z.record(z.string(), z.string()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const tenantId = tenant.id;
    const schema = tenant.db_schema_name;

    const [settings, pluginsRes] = await Promise.all([
      withTenantDb(schema, null, async (client) => {
        const res = await client.query(`SELECT * FROM settings WHERE key = 'general' LIMIT 1`);
        return res.rows[0] ?? null;
      }),
      pool.query(
        `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
        [tenantId]
      ),
    ]);

    if (!settings) {
      return NextResponse.json({ error: 'Configuración no encontrada' }, { status: 404 });
    }

    // Aplanar social_media desde el JSONB 'value' para el frontend
    const socialMedia = settings.value?.social_media || {};
    const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);

    return NextResponse.json({ 
      settings: {
        ...settings,
        social_media: socialMedia,
      },
      active_plugins: activePlugins,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const schema = tenant.db_schema_name;
    const body = await request.json();
    const parsed = settingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if (key === 'social_media') {
          // Guardar dentro del campo JSONB 'value'
          fields.push(`value = jsonb_set(COALESCE(value, '{}'::jsonb), '{social_media}', $${paramIndex}::jsonb)`);
          values.push(JSON.stringify(value));
          paramIndex++;
        } else {
          fields.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    await withTenantDb(schema, null, async (client) => {
      await client.query(
        `UPDATE settings SET ${fields.join(', ')}, updated_at = now() WHERE key = 'general'`,
        values
      );
    });

    // Sincronizar en platform.tenants si aplica
    if (data.business_name || data.contingency_offline_mode || data.offline_safety_buffer !== undefined) {
      await pool.query(
        `UPDATE platform.tenants SET
          name = COALESCE($1, name),
          contingency_offline_mode = COALESCE($2, contingency_offline_mode),
          safety_buffer_units = COALESCE($3, safety_buffer_units),
          updated_at = now()
         WHERE slug = $4`,
        [data.business_name || null, data.contingency_offline_mode || null, data.offline_safety_buffer ?? null, slug]
      );
    }

    invalidateTenantCache(slug, 'settings');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
