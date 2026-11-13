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
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY', 'DELIVERY']),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(100),
});

const updateStaffSchema = z.object({
  id: z.string().uuid('ID de usuario inválido'),
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  role: z.enum(['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY', 'DELIVERY']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(6).max(100).optional(),
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

    const staffList = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT id, email, full_name, phone, role, is_active,
               (auth_user_id IS NOT NULL) AS has_supabase_link,
               (password_hash IS NOT NULL) AS has_password,
               created_at, updated_at
        FROM staff_profiles
        ORDER BY
          CASE role
            WHEN 'OWNER' THEN 1
            WHEN 'MANAGER' THEN 2
            WHEN 'CASHIER' THEN 3
            WHEN 'INVENTORY' THEN 4
            ELSE 5
          END,
          created_at ASC
      `);
      return res.rows;
    });

    return NextResponse.json({ staff: staffList, roles: STAFF_ROLES });
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

      const ins = await client.query(
        `INSERT INTO staff_profiles (email, full_name, phone, role, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, email, full_name, phone, role, is_active, created_at`,
        [d.email, d.full_name, d.phone || null, d.role, passwordHash]
      );

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
             updated_at = now()
         WHERE id = $6
         RETURNING id, email, full_name, phone, role, is_active, created_at, updated_at`,
        [
          d.full_name ?? null,
          d.phone !== undefined ? d.phone : null,
          d.role ?? null,
          d.is_active !== undefined ? d.is_active : null,
          newPasswordHash,
          d.id,
        ]
      );

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
