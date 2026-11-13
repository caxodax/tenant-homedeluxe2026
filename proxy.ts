// proxy.ts — Proxy multi-tenant y Anillo Perimetral de Seguridad Next.js 16
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'platform']);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Anillo Perimetral 1: Bloqueo en el Edge de rutas privadas si no existe cookie de sesión
  const protectedTenantMatch = pathname.match(/^\/t\/([a-z0-9_-]+)\/(admin|pos)(\/.*)?$/i);
  if (protectedTenantMatch) {
    const slug = protectedTenantMatch[1];
    const hasStaffCookie = request.cookies.has('marketos_staff_session');
    const hasSupabaseCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));

    if (!hasStaffCookie && !hasSupabaseCookie) {
      const loginUrl = new URL(`/t/${slug}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Rutas explícitas por inquilino no requieren reescritura de subdominio
  if (pathname.startsWith('/t/')) {
    return NextResponse.next();
  }

  const host = request.headers.get('host') || '';
  const hostWithoutPort = host.split(':')[0].toLowerCase();

  const subdomainMatch = hostWithoutPort.match(/^([a-z0-9-]+)\.(marketos\.app|localhost)$/);
  if (!subdomainMatch || RESERVED_SUBDOMAINS.has(subdomainMatch[1])) {
    return NextResponse.next();
  }

  const slug = subdomainMatch[1];
  const url = request.nextUrl.clone();
  url.pathname = `/t/${slug}${pathname === '/' ? '' : pathname}`;

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|api/|icons/|media/|sw\\.js|favicon\\.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|woff2?|css|js|map|txt|xml|json)$).*)',
  ],
};
