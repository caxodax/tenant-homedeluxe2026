import { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { getCachedTenantShell } from '@/lib/tenant';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';

function getIconType(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/png';
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let slug: string | null = null;

  try {
    const h = await headers();
    const referer = h.get('referer') || '';
    const host = (h.get('host') || '').toLowerCase();

    // 1. Extraer slug si la petición proviene de /t/[slug]
    const refMatch = referer.match(/\/t\/([a-z0-9_-]+)/i);
    if (refMatch) {
      slug = refMatch[1];
    } else {
      // 2. Extraer slug si proviene de tenant-[slug].vercel.app o [slug].marketos.app
      const hostMatch = host.match(/^(?:tenant-)?([a-z0-9_-]+)\.(?:vercel\.app|marketos\.app|localhost)/i);
      if (hostMatch && !['www', 'app', 'platform'].includes(hostMatch[1])) {
        slug = hostMatch[1];
      }
    }
  } catch {
    // ignore
  }

  if (slug) {
    try {
      const shell = await getCachedTenantShell(slug);
      if (shell) {
        const businessName = shell.settings.business_name || shell.tenant.name;
        const shortName =
          businessName.length > 14 ? businessName.slice(0, 12).trim() + '…' : businessName;
        const logoUrl = shell.settings.logo_url;
        const themeColor = shell.settings.primary_color || TENANT_DEFAULTS.PRIMARY_COLOR;
        const bgColor = shell.settings.secondary_color || TENANT_DEFAULTS.SECONDARY_COLOR;
        const logoMime = logoUrl ? getIconType(logoUrl) : 'image/png';

        const customIcons = logoUrl
          ? [
              {
                src: logoUrl,
                sizes: '192x192 512x512',
                type: logoMime,
                purpose: 'any' as const,
              },
              {
                src: logoUrl,
                sizes: '512x512',
                type: logoMime,
                purpose: 'maskable' as const,
              },
            ]
          : [];

        const startUrl =
          shell.tenant.storefront_enabled === false ? `/t/${slug}/login` : `/t/${slug}`;

        return {
          id: `/t/${slug}`,
          name: businessName,
          short_name: shortName,
          description: `Vitrina digital, pedidos y terminal POS de ${businessName}`,
          start_url: startUrl,
          scope: `/t/${slug}`,
          display: 'standalone',
          orientation: 'any',
          background_color: bgColor,
          theme_color: themeColor,
          categories: ['shopping', 'business'],
          icons: [
            ...customIcons,
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        };
      }
    } catch {
      // fallback
    }
  }

  // Fallback global de la plataforma
  return {
    id: '/',
    name: 'MarketOS · Plataforma Multi-Tenant',
    short_name: 'MarketOS',
    description:
      'Plataforma Multi-Tenant de comercio minorista, vitrina digital y terminal POS con soporte offline.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: TENANT_DEFAULTS.SECONDARY_COLOR,
    theme_color: TENANT_DEFAULTS.SECONDARY_COLOR,
    categories: ['business', 'shopping', 'productivity'],
    icons: [
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
    ],
  };
}
