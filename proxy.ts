// proxy.ts — Proxy multi-tenant Next.js 16 (sin conexión a base de datos ni intercepción de estáticos)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'platform']);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
