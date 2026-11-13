import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import {
  createSignedSessionToken,
  LOGOUT_FLAG_COOKIE,
  STAFF_SESSION_COOKIE,
  verifyPassword,
} from '@/lib/auth/session';
import { getDefaultLandingPath } from '@/lib/auth/rbac';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().trim().email('Correo electrónico inválido'),
  password: z.string().min(4, 'Contraseña requerida'),
  slug: z.string().trim().optional(),
});

async function verifySuperAdminPassword(email: string, password: string): Promise<{
  id: string;
  email: string;
  full_name: string;
} | null> {
  const res = await pool.query(
    `SELECT id, email, full_name, password_hash FROM platform.super_admins
     WHERE lower(email) = lower($1) AND is_active = true
     LIMIT 1`,
    [email]
  );
  if ((res.rowCount || 0) === 0) return null;
  const admin = res.rows[0];

  if (verifyPassword(password, admin.password_hash)) {
    return { id: admin.id, email: admin.email, full_name: admin.full_name };
  }

  // Verificar hashes bcrypt/pgcrypto generados desde SQL inicial
  if (admin.password_hash && admin.password_hash.startsWith('$2')) {
    const pgCheck = await pool.query(
      `SELECT (password_hash = crypt($1, password_hash)) AS ok FROM platform.super_admins WHERE id = $2`,
      [password, admin.id]
    );
    if (pgCheck.rows[0]?.ok === true) {
      return { id: admin.id, email: admin.email, full_name: admin.full_name };
    }
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      return { id: admin.id, email: admin.email, full_name: admin.full_name };
    }
  } catch {
    // ignore
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Credenciales inválidas' },
        { status: 400 }
      );
    }

    const { email, password, slug } = parsed.data;
    const isProd = process.env.NODE_ENV === 'production';

    if (slug) {
      const normalizedSlug = slug.toLowerCase().trim();
      const tRes = await pool.query(
        `SELECT id, slug, db_schema_name, status FROM platform.tenants WHERE slug = $1 LIMIT 1`,
        [normalizedSlug]
      );
      if ((tRes.rowCount || 0) === 0) {
        return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 });
      }
      const tenant = tRes.rows[0];
      if (tenant.status !== 'active' && tenant.status !== 'trial') {
        return NextResponse.json({ error: 'Comercio inactivo o suspendido' }, { status: 403 });
      }

      // 1. Buscar staff del comercio
      const staffRes = await pool.query(
        `SELECT id, email, full_name, role, password_hash, auth_user_id
         FROM "${tenant.db_schema_name}".staff_profiles
         WHERE lower(email) = lower($1) AND is_active = true
         LIMIT 1`,
        [email]
      );

      if ((staffRes.rowCount || 0) > 0) {
        const staff = staffRes.rows[0];
        let authenticated = verifyPassword(password, staff.password_hash);

        if (!authenticated) {
          try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (!error && data.user) {
              authenticated = true;
              if (!staff.auth_user_id) {
                await pool.query(
                  `UPDATE "${tenant.db_schema_name}".staff_profiles SET auth_user_id = $1, updated_at = now() WHERE id = $2`,
                  [data.user.id, staff.id]
                );
              }
            }
          } catch {
            // ignore
          }
        }

        if (authenticated) {
          const token = createSignedSessionToken({
            kind: 'tenant_staff',
            staffId: staff.id,
            email: staff.email,
            fullName: staff.full_name,
            role: staff.role,
            tenantSlug: tenant.slug,
            schemaName: tenant.db_schema_name,
          });

          const response = NextResponse.json({
            success: true,
            redirectTo: getDefaultLandingPath(tenant.slug, staff.role),
            staff: {
              id: staff.id,
              email: staff.email,
              full_name: staff.full_name,
              role: staff.role,
            },
          });

          response.cookies.set(STAFF_SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: isProd,
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
          });
          response.cookies.delete(LOGOUT_FLAG_COOKIE);
          return response;
        }
      }

      // 2. Verificar si es Super Admin supervisando ese comercio
      const superAdmin = await verifySuperAdminPassword(email, password);
      if (superAdmin) {
        const token = createSignedSessionToken({
          kind: 'super_admin',
          staffId: superAdmin.id,
          email: superAdmin.email,
          fullName: superAdmin.full_name,
          role: 'OWNER',
        });
        const response = NextResponse.json({
          success: true,
          redirectTo: `/t/${tenant.slug}/admin`,
          staff: { id: 'super_admin', email: superAdmin.email, full_name: superAdmin.full_name, role: 'OWNER' },
        });
        response.cookies.set(STAFF_SESSION_COOKIE, token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: isProd,
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
        response.cookies.delete(LOGOUT_FLAG_COOKIE);
        return response;
      }

      return NextResponse.json(
        { error: 'Correo o contraseña incorrectos, o usuario sin acceso a este comercio.' },
        { status: 401 }
      );
    }

    // Login global (/login -> /)
    const superAdmin = await verifySuperAdminPassword(email, password);
    if (!superAdmin) {
      return NextResponse.json(
        { error: 'Credenciales de administrador inválidas.' },
        { status: 401 }
      );
    }

    const token = createSignedSessionToken({
      kind: 'super_admin',
      staffId: superAdmin.id,
      email: superAdmin.email,
      fullName: superAdmin.full_name,
      role: 'SUPER_ADMIN',
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: '/',
      user: superAdmin,
    });
    response.cookies.set(STAFF_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.delete(LOGOUT_FLAG_COOKIE);
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Error al iniciar sesión' }, { status: 500 });
  }
}
