import { NextRequest, NextResponse } from 'next/server';
import { getCachedTenantShell } from '@/lib/tenant';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const entry = request.nextUrl.searchParams.get('entry');
    const isPosEntry = entry === 'pos';

    const shell = await getCachedTenantShell(slug);
    if (!shell) {
      return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 });
    }

    const businessName = shell.settings.business_name || shell.tenant.name || 'MarketOS';
    const shortName =
      businessName.length > 14 ? businessName.slice(0, 12).trim() + '…' : businessName;
    const themeColor = shell.settings.primary_color || '#09090b';
    const backgroundColor = shell.settings.secondary_color || '#09090b';

    const logoUrl = shell.settings.logo_url;
    const icons = logoUrl
      ? [
          {
            src: logoUrl,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: logoUrl,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: logoUrl,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ]
      : [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ];

    const manifestPayload = {
      id: isPosEntry ? `/t/${slug}/pos` : `/t/${slug}`,
      name: isPosEntry ? `${businessName} · Caja POS` : `${businessName}`,
      short_name: isPosEntry ? `${shortName} POS` : shortName,
      description: isPosEntry
        ? `Terminal de Punto de Venta Offline-First para ${businessName}`
        : `Vitrina digital, pedidos y terminal POS de ${businessName}`,
      start_url: isPosEntry ? `/t/${slug}/pos` : `/t/${slug}`,
      scope: `/t/${slug}`,
      display: 'standalone',
      orientation: 'any',
      theme_color: themeColor,
      background_color: backgroundColor,
      categories: ['shopping', 'business'],
      icons,
    };

    return new NextResponse(JSON.stringify(manifestPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error generating tenant manifest:', error);
    return NextResponse.json(
      { error: 'Error al generar manifiesto PWA' },
      { status: 500 }
    );
  }
}
