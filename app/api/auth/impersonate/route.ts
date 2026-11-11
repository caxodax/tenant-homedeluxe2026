import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { pool, withTenantDb } from '@/lib/db';
import {
  createSignedSessionToken,
  getSessionSecret,
  LOGOUT_FLAG_COOKIE,
  STAFF_SESSION_COOKIE,
} from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

interface ImpersonateJwtPayload {
  purpose?: string;
  tenant_slug?: string;
  admin_id?: string;
  admin_email?: string;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token de impersonación requerido' }, { status: 400 });
    }

    const secretRaw = process.env.IMPERSONATION_SECRET || getSessionSecret();
    const secret = new TextEncoder().encode(secretRaw);

    let payload: ImpersonateJwtPayload;
    try {
      const verified = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      payload = verified.payload as unknown as ImpersonateJwtPayload;
    } catch {
      return NextResponse.json(
        { error: 'Token de impersonación inválido o expirado' },
        { status: 401 }
      );
    }

    if (payload.purpose !== 'impersonate' || !payload.tenant_slug || !payload.admin_id) {
      return NextResponse.json(
        { error: 'Claims de token inválidos' },
        { status: 401 }
      );
    }

    const tenantSlug = payload.tenant_slug.toLowerCase().trim();

    // 1. Verificar que el Super Admin firmante sigue activo
    const adminRes = await pool.query(
      `SELECT id, email, full_name
       FROM platform.super_admins
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [payload.admin_id]
    );
    if ((adminRes.rowCount || 0) === 0) {
      return NextResponse.json({ error: 'Super Admin no autorizado o inactivo' }, { status: 403 });
    }
    const admin = adminRes.rows[0];

    // 2. Obtener el comercio activo/trial
    const tenantRes = await pool.query(
      `SELECT id, slug, db_schema_name, status
       FROM platform.tenants
       WHERE slug = $1 AND status IN ('active', 'trial')
       LIMIT 1`,
      [tenantSlug]
    );
    if ((tenantRes.rowCount || 0) === 0) {
      return NextResponse.json({ error: 'Comercio no encontrado o inactivo' }, { status: 404 });
    }
    const tenant = tenantRes.rows[0];

    // 3. Buscar el propietario activo dentro del esquema aislado del comercio
    const owner = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const oRes = await client.query(
        `SELECT id, email, full_name, role
         FROM staff_profiles
         WHERE role = 'OWNER' AND is_active = true
         ORDER BY created_at ASC
         LIMIT 1`
      );
      return oRes.rows[0] ?? null;
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'No se encontró un propietario activo en el comercio' },
        { status: 404 }
      );
    }

    // 4. Registrar evento en bitácora global de auditoría
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    await pool.query(
      `INSERT INTO platform.global_audit_logs
         (actor_type, actor_id, actor_label, action, target_tenant_id, details, ip_address)
       VALUES ('SUPER_ADMIN', $1, $2, 'IMPERSONATE_TENANT', $3, $4::jsonb, $5)`,
      [
        admin.id,
        admin.email,
        tenant.id,
        JSON.stringify({
          tenant_slug: tenant.slug,
          impersonated_email: owner.email,
          impersonated_staff_id: owner.id,
        }),
        ipAddress,
      ]
    );

    // 5. Emitir cookie de sesión firmada del comercio (TTL 4h) y redirigir al Admin
    const sessionToken = createSignedSessionToken(
      {
        kind: 'tenant_staff',
        staffId: owner.id,
        tenantSlug: tenant.slug,
        schemaName: tenant.db_schema_name,
        role: owner.role,
        email: owner.email,
        fullName: owner.full_name,
      },
      60 * 60 * 4
    );

    const response = NextResponse.redirect(new URL(`/t/${tenant.slug}/admin`, request.url));
    response.cookies.set(STAFF_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 4,
    });
    response.cookies.delete(LOGOUT_FLAG_COOKIE);
    return response;
  } catch (error) {
    console.error('Impersonate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error de impersonación' },
      { status: 500 }
    );
  }
}
