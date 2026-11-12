import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { pool } from '@/lib/db';
import {
  LOGOUT_FLAG_COOKIE,
  STAFF_SESSION_COOKIE,
  verifySignedSessionToken,
} from './session';
import {
  getDefaultLandingPath,
  hasPermission,
  type TenantPermission,
} from './rbac';

export interface TenantStaffContext {
  user: { id: string; email?: string | null };
  tenant: {
    id: string;
    slug: string;
    name: string;
    db_schema_name: string;
    status: string;
    plan_id: string;
    storefront_enabled: boolean;
  };
  staff: {
    id: string;
    role: string;
    full_name: string;
    email?: string;
  };
  isDevFallback?: boolean;
}

export class TenantAuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'TenantAuthError';
    this.statusCode = statusCode;
  }
}

async function resolveTenantContext(
  slug: string
): Promise<
  | { ok: true; ctx: TenantStaffContext }
  | { ok: false; reason: 'not_found' | 'maintenance' | 'unauthenticated'; tenant?: TenantStaffContext['tenant'] }
> {
  const normalizedSlug = slug.toLowerCase().trim();

  const tenantRes = await pool.query(
    `SELECT id, slug, name, db_schema_name, status, plan_id, COALESCE(storefront_enabled, true) AS storefront_enabled
     FROM platform.tenants
     WHERE slug = $1`,
    [normalizedSlug]
  );

  if (tenantRes.rowCount === 0) {
    return { ok: false, reason: 'not_found' };
  }

  const tenant = tenantRes.rows[0];

  if (tenant.status !== 'active' && tenant.status !== 'trial') {
    return { ok: false, reason: 'maintenance', tenant };
  }

  const cookieStore = await cookies();
  const loggedOutFlag = cookieStore.get(LOGOUT_FLAG_COOKIE)?.value === '1';

  // 1. Verificar sesión nativa de Supabase Auth
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.email) {
      let staffRes = await pool.query(
        `SELECT id, role, full_name, email FROM "${tenant.db_schema_name}".staff_profiles
         WHERE auth_user_id = $1 AND is_active = true
         LIMIT 1`,
        [user.id]
      );

      // Auto-vincular por email si el staff fue invitado previamente sin auth_user_id
      if ((staffRes.rowCount || 0) === 0) {
        staffRes = await pool.query(
          `UPDATE "${tenant.db_schema_name}".staff_profiles
           SET auth_user_id = $1, updated_at = now()
           WHERE lower(email) = lower($2) AND auth_user_id IS NULL AND is_active = true
           RETURNING id, role, full_name, email`,
          [user.id, user.email]
        );
      }

      if ((staffRes.rowCount || 0) > 0) {
        return {
          ok: true,
          ctx: { user, tenant, staff: staffRes.rows[0] },
        };
      }

      // Acceso supervisor de Super Admin
      const adminRes = await pool.query(
        `SELECT id, full_name, email FROM platform.super_admins WHERE lower(email) = lower($1) AND is_active = true LIMIT 1`,
        [user.email]
      );
      if ((adminRes.rowCount || 0) > 0) {
        return {
          ok: true,
          ctx: {
            user,
            tenant,
            staff: {
              id: 'super_admin',
              role: 'OWNER',
              full_name: adminRes.rows[0].full_name || 'Super Admin',
              email: adminRes.rows[0].email,
            },
          },
        };
      }

      return { ok: false, reason: 'unauthenticated', tenant };
    }
  } catch {
    // Continuar con cookie de sesión firmada
  }

  // 2. Verificar cookie de sesión firmada (Staff / POS / Super Admin)
  const sessionToken = cookieStore.get(STAFF_SESSION_COOKIE)?.value;
  const sessionPayload = verifySignedSessionToken(sessionToken);

  if (sessionPayload) {
    if (
      sessionPayload.kind === 'tenant_staff' &&
      sessionPayload.schemaName === tenant.db_schema_name
    ) {
      const staffRes = await pool.query(
        `SELECT id, role, full_name, email FROM "${tenant.db_schema_name}".staff_profiles
         WHERE id = $1 AND is_active = true
         LIMIT 1`,
        [sessionPayload.staffId]
      );
      if ((staffRes.rowCount || 0) > 0) {
        const s = staffRes.rows[0];
        return {
          ok: true,
          ctx: {
            user: { id: s.id, email: s.email },
            tenant,
            staff: s,
          },
        };
      }
    } else if (sessionPayload.kind === 'super_admin') {
      const adminRes = await pool.query(
        `SELECT id, full_name, email FROM platform.super_admins WHERE id = $1 AND is_active = true LIMIT 1`,
        [sessionPayload.staffId]
      );
      if ((adminRes.rowCount || 0) > 0) {
        const adm = adminRes.rows[0];
        return {
          ok: true,
          ctx: {
            user: { id: adm.id, email: adm.email },
            tenant,
            staff: {
              id: 'super_admin',
              role: 'OWNER',
              full_name: adm.full_name || 'Super Admin',
              email: adm.email,
            },
          },
        };
      }
    }
  }

  // 3. En producción o tras cierre de sesión explícito, exigir login real
  if (process.env.NODE_ENV === 'production' || loggedOutFlag) {
    return { ok: false, reason: 'unauthenticated', tenant };
  }

  // 4. Fallback seguro de desarrollo si nunca se cerró sesión manualmente
  const defaultStaffRes = await pool.query(
    `SELECT id, role, full_name, email FROM "${tenant.db_schema_name}".staff_profiles
     WHERE role = 'OWNER' AND is_active = true
     ORDER BY created_at ASC LIMIT 1`
  );
  const demoStaff = defaultStaffRes.rows[0] || {
    id: 'demo-owner',
    role: 'OWNER',
    full_name: 'Dueño (Modo Dev)',
    email: 'owner@' + normalizedSlug + '.com',
  };

  return {
    ok: true,
    ctx: {
      user: { id: demoStaff.id, email: demoStaff.email },
      tenant,
      staff: demoStaff,
      isDevFallback: true,
    },
  };
}

/**
 * Guardia para Server Components / páginas administrativas.
 * Redirige a `/t/[slug]/login` si falta sesión o al destino permitido por RBAC.
 */
export async function requireTenantStaff(
  slug: string,
  requiredPermission?: TenantPermission
): Promise<TenantStaffContext> {
  const normalizedSlug = slug.toLowerCase().trim();
  const res = await resolveTenantContext(normalizedSlug);

  if (!res.ok) {
    if (res.reason === 'not_found') redirect('/');
    if (res.reason === 'maintenance') redirect(`/t/${normalizedSlug}/maintenance`);
    redirect(`/t/${normalizedSlug}/login`);
  }

  if (requiredPermission && !hasPermission(res.ctx.staff.role, requiredPermission)) {
    redirect(getDefaultLandingPath(normalizedSlug, res.ctx.staff.role));
  }

  return res.ctx;
}

/**
 * Guardia para API Route Handlers (devuelve errores HTTP 401/403/404 limpios sin redirect).
 */
export async function requireTenantStaffApi(
  slug: string,
  requiredPermission?: TenantPermission
): Promise<TenantStaffContext> {
  const normalizedSlug = slug.toLowerCase().trim();
  const res = await resolveTenantContext(normalizedSlug);

  if (!res.ok) {
    if (res.reason === 'not_found') {
      throw new TenantAuthError('Comercio no encontrado', 404);
    }
    if (res.reason === 'maintenance') {
      throw new TenantAuthError('Comercio inactivo o en mantenimiento', 403);
    }
    throw new TenantAuthError('Sesión requerida. Inicia sesión para continuar.', 401);
  }

  if (requiredPermission && !hasPermission(res.ctx.staff.role, requiredPermission)) {
    throw new TenantAuthError(
      `Permisos insuficientes para el rol ${res.ctx.staff.role}`,
      403
    );
  }

  return res.ctx;
}
