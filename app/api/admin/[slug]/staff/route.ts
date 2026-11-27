import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { hashPassword } from '@/lib/auth/session';
import { STAFF_ROLES } from '@/lib/auth/rbac';
import { writeTenantAuditLog } from '@/lib/payment-methods';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createStaffSchema = z.object({
  full_name: z.string().trim().min(2, 'Nombre requerido').max(120),
  email: z.string().trim().email('Correo electrónico inválido').toLowerCase(),
  phone: z.string().trim().max(30).optional().nullable(),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY', 'DELIVERY', 'WAITER', 'KITCHEN', 'SALES_REP']),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100),
  custom_permissions: z.array(z.string()).optional().nullable(),
  assigned_store_id: z.string().uuid().optional().nullable(),
});

const updateStaffSchema = z.object({
  id: z.string().uuid('ID de usuario inválido'),
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY', 'DELIVERY', 'WAITER', 'KITCHEN', 'SALES_REP']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
  custom_permissions: z.array(z.string()).optional().nullable(),
  assigned_store_id: z.string().uuid().optional().nullable(),
});

function handleAuthOrError(err: unknown) {
  if (err instanceof TenantAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  console.error('Staff API error:', err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Error interno del servidor' },
    { status: 400 }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    const pluginsRes = await pool.query(
      `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
      [tenant.id]
    );
    const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);

    const { staffList, stores } = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const [res, storesRes] = await Promise.all([
        client.query(`
          SELECT sp.id, sp.email, sp.full_name, sp.phone, sp.role, sp.is_active, sp.custom_permissions,
                 sp.assigned_store_id, s.name AS assigned_store_name,
                 (sp.auth_user_id IS NOT NULL) AS has_supabase_link,
                 (sp.password_hash IS NOT NULL) AS has_password,
                 sp.created_at, sp.updated_at
          FROM staff_profiles sp
          LEFT JOIN stores s ON s.id = sp.assigned_store_id
          ORDER BY
            CASE sp.role
              WHEN 'OWNER' THEN 1
              WHEN 'MANAGER' THEN 2
              WHEN 'CASHIER' THEN 3
              WHEN 'INVENTORY' THEN 4
              ELSE 5
            END,
            sp.created_at ASC
        `),
        client.query(`SELECT id, name, code, is_default FROM stores WHERE is_active = true ORDER BY is_default DESC, name ASC`),
      ]);
      return { staffList: res.rows, stores: storesRes.rows };
    });

    return NextResponse.json({ 
      staff: staffList, 
      stores,
      roles: STAFF_ROLES, 
      active_plugins: activePlugins 
    });
  } catch (err) {
    return handleAuthOrError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff: actor } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const parsed = createStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const passwordHash = hashPassword(d.password);

    const created = await withTenantDb(tenant.db_schema_name, actor.id, async (client) => {
      const exists = await client.query(
        `SELECT id FROM staff_profiles WHERE lower(email) = lower($1) LIMIT 1`,
        [d.email]
      );
      if ((exists.rowCount || 0) > 0) {
        throw new Error(`Ya existe un miembro del equipo con el correo ${d.email}`);
      }

      let assignedStoreId = d.assigned_store_id || null;
      if (!assignedStoreId && !['OWNER', 'MANAGER'].includes(d.role)) {
        const defStore = await client.query(`SELECT id FROM stores WHERE is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1`);
        assignedStoreId = defStore.rows[0]?.id || null;
      }

      const ins = await client.query(
        `INSERT INTO staff_profiles (email, full_name, phone, role, password_hash, is_active, custom_permissions, assigned_store_id)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         RETURNING id, email, full_name, phone, role, is_active, custom_permissions, assigned_store_id, created_at`,
        [d.email, d.full_name, d.phone || null, d.role, passwordHash, d.custom_permissions || null, assignedStoreId]
      );

      if (d.role === 'SALES_REP') {
        try {
          await client.query('SAVEPOINT sp_sales_rep_create');
          await client.query(`
            INSERT INTO sales_rep_profiles (staff_id, zone_or_route, monthly_target_primary, default_commission_percent)
            VALUES ($1, 'General', 0.00, 0.00)
            ON CONFLICT (staff_id) DO NOTHING
          `, [ins.rows[0].id]);
          await client.query('RELEASE SAVEPOINT sp_sales_rep_create');
        } catch (_) {
          await client.query('ROLLBACK TO SAVEPOINT sp_sales_rep_create').catch(() => {});
        }
      }

      await writeTenantAuditLog(client, {
        actorId: actor.id,
        actorName: actor.full_name,
        actorRole: actor.role,
        action: 'STAFF_CREATED',
        entity: 'staff',
        entityId: ins.rows[0].id,
        newData: { email: d.email, full_name: d.full_name, role: d.role },
      });

      return ins.rows[0];
    });

    await pool.query(
      `UPDATE platform.tenant_quota_usage
       SET staff_count = staff_count + 1, last_recalculated_at = now()
       WHERE tenant_id = $1`,
      [tenant.id]
    );

    return NextResponse.json({ success: true, member: created }, { status: 201 });
  } catch (err) {
    return handleAuthOrError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff: actor } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const parsed = updateStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const newPasswordHash = d.password ? hashPassword(d.password) : null;

    const updated = await withTenantDb(tenant.db_schema_name, actor.id, async (client) => {
      const curRes = await client.query(
        `SELECT id, email, full_name, phone, role, is_active FROM staff_profiles WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [d.id]
      );
      if ((curRes.rowCount || 0) === 0) {
        throw new Error('Miembro de staff no encontrado');
      }
      const prev = curRes.rows[0];

      // Impedir dejar el comercio sin ningún OWNER activo
      const nextRole = d.role ?? prev.role;
      const nextActive = d.is_active ?? prev.is_active;
      if (prev.role === 'OWNER' && (nextRole !== 'OWNER' || !nextActive)) {
        const ownersRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM staff_profiles WHERE role = 'OWNER' AND is_active = true AND id != $1`,
          [d.id]
        );
        if ((ownersRes.rows[0]?.cnt || 0) === 0) {
          throw new Error('Debe permanecer al menos un Propietario (OWNER) activo en el comercio.');
        }
      }

      const upd = await client.query(
        `UPDATE staff_profiles
         SET full_name = COALESCE($1, full_name),
             phone = COALESCE($2, phone),
             role = COALESCE($3, role),
             is_active = COALESCE($4, is_active),
             password_hash = COALESCE($5, password_hash),
             custom_permissions = CASE WHEN $6::boolean THEN $7 ELSE custom_permissions END,
             assigned_store_id = CASE WHEN $8::boolean THEN $9 ELSE assigned_store_id END,
             updated_at = now()
         WHERE id = $10
         RETURNING id, email, full_name, phone, role, is_active, custom_permissions, assigned_store_id, created_at, updated_at`,
        [
          d.full_name ?? null,
          d.phone !== undefined ? d.phone : null,
          d.role ?? null,
          d.is_active !== undefined ? d.is_active : null,
          newPasswordHash,
          d.custom_permissions !== undefined,
          d.custom_permissions ?? null,
          d.assigned_store_id !== undefined,
          d.assigned_store_id ?? null,
          d.id,
        ]
      );

      if (upd.rows[0].role === 'SALES_REP') {
        try {
          await client.query('SAVEPOINT sp_sales_rep_upd');
          await client.query(`
            INSERT INTO sales_rep_profiles (staff_id, zone_or_route, monthly_target_primary, default_commission_percent)
            VALUES ($1, 'General', 0.00, 0.00)
            ON CONFLICT (staff_id) DO NOTHING
          `, [d.id]);
          await client.query('RELEASE SAVEPOINT sp_sales_rep_upd');
        } catch (_) {
          await client.query('ROLLBACK TO SAVEPOINT sp_sales_rep_upd').catch(() => {});
        }
      }

      await writeTenantAuditLog(client, {
        actorId: actor.id,
        actorName: actor.full_name,
        actorRole: actor.role,
        action: 'STAFF_UPDATED',
        entity: 'staff',
        entityId: d.id,
        oldData: { role: prev.role, is_active: prev.is_active, full_name: prev.full_name },
        newData: {
          role: upd.rows[0].role,
          is_active: upd.rows[0].is_active,
          full_name: upd.rows[0].full_name,
          password_reset: Boolean(newPasswordHash),
        },
      });

      return upd.rows[0];
    });

    return NextResponse.json({ success: true, member: updated });
  } catch (err) {
    return handleAuthOrError(err);
  }
}
