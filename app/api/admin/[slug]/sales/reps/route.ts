import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const saveRepProfileSchema = z.object({
  staff_id: z.string().uuid('ID de vendedor requerido'),
  zone_or_route: z.string().trim().optional().nullable(),
  monthly_target_primary: z.number().min(0).default(0),
  default_commission_percent: z.number().min(0).max(100).default(0),
  commission_notes: z.string().trim().optional().nullable(),
  can_create_quotes: z.boolean().default(true),
  can_convert_to_order: z.boolean().default(true),
  can_edit_own_quotes: z.boolean().default(true),
  can_edit_others_quotes: z.boolean().default(false),
  can_view_all_reports: z.boolean().default(false),
  can_adjust_prices: z.boolean().default(false),
  max_discount_pct: z.number().min(0).max(100).default(0),
  is_active: z.boolean().default(true),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT 
          sp.id,
          sp.email,
          sp.full_name,
          sp.phone,
          sp.role,
          sp.is_active AS staff_is_active,
          sp.created_at AS staff_created_at,
          srp.zone_or_route,
          srp.monthly_target_primary,
          srp.default_commission_percent,
          srp.commission_notes,
          COALESCE(srp.can_create_quotes, true) AS can_create_quotes,
          COALESCE(srp.can_convert_to_order, true) AS can_convert_to_order,
          COALESCE(srp.can_edit_own_quotes, true) AS can_edit_own_quotes,
          COALESCE(srp.can_edit_others_quotes, false) AS can_edit_others_quotes,
          COALESCE(srp.can_view_all_reports, false) AS can_view_all_reports,
          COALESCE(srp.can_adjust_prices, false) AS can_adjust_prices,
          COALESCE(srp.max_discount_pct, 0.00) AS max_discount_pct,
          COALESCE(srp.is_active, true) AS rep_is_active
        FROM ${tenant.db_schema_name}.staff_profiles sp
        LEFT JOIN ${tenant.db_schema_name}.sales_rep_profiles srp ON srp.staff_id = sp.id
        WHERE sp.role = 'SALES_REP'
        ORDER BY sp.full_name ASC
      `);

      return NextResponse.json({ reps: res.rows });
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching sales reps:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al obtener vendedores' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'staff');
    const json = await request.json();
    const data = saveRepProfileSchema.parse(json);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      await client.query(`
        INSERT INTO ${tenant.db_schema_name}.sales_rep_profiles (
          staff_id, zone_or_route, monthly_target_primary, default_commission_percent,
          commission_notes, can_create_quotes, can_convert_to_order, can_edit_own_quotes,
          can_edit_others_quotes, can_view_all_reports, can_adjust_prices, max_discount_pct,
          is_active, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()
        )
        ON CONFLICT (staff_id) DO UPDATE SET
          zone_or_route = EXCLUDED.zone_or_route,
          monthly_target_primary = EXCLUDED.monthly_target_primary,
          default_commission_percent = EXCLUDED.default_commission_percent,
          commission_notes = EXCLUDED.commission_notes,
          can_create_quotes = EXCLUDED.can_create_quotes,
          can_convert_to_order = EXCLUDED.can_convert_to_order,
          can_edit_own_quotes = EXCLUDED.can_edit_own_quotes,
          can_edit_others_quotes = EXCLUDED.can_edit_others_quotes,
          can_view_all_reports = EXCLUDED.can_view_all_reports,
          can_adjust_prices = EXCLUDED.can_adjust_prices,
          max_discount_pct = EXCLUDED.max_discount_pct,
          is_active = EXCLUDED.is_active,
          updated_at = now()
      `, [
        data.staff_id,
        data.zone_or_route || null,
        data.monthly_target_primary,
        data.default_commission_percent,
        data.commission_notes || null,
        data.can_create_quotes,
        data.can_convert_to_order,
        data.can_edit_own_quotes,
        data.can_edit_others_quotes,
        data.can_view_all_reports,
        data.can_adjust_prices,
        data.max_discount_pct,
        data.is_active,
      ]);

      // Auditoría
      let actorUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id) ? staff.id : null;
      if (!actorUuid) {
        const ownerRes = await client.query(
          `SELECT id FROM ${tenant.db_schema_name}.staff_profiles WHERE role = 'OWNER' LIMIT 1`
        );
        actorUuid = ownerRes.rows[0]?.id || null;
      }
      await client.query(`
        INSERT INTO ${tenant.db_schema_name}.audit_logs (actor_id, actor_role, action, entity, entity_id, new_data)
        VALUES ($1, $2, 'SALES_REP_PROFILE_UPDATE', 'sales_rep_profiles', $3, $4)
      `, [actorUuid, staff.role, data.staff_id, JSON.stringify(data)]);

      return NextResponse.json({ success: true });
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: (err as z.ZodError).issues?.[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error saving sales rep profile:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al guardar perfil de vendedor' },
      { status: 400 }
    );
  }
}
