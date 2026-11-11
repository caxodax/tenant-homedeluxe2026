import { MetadataRoute } from 'next';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';

export default function manifest(): MetadataRoute.Manifest {
  const defaultSlug = TENANT_DEFAULTS.DEFAULT_TENANT_SLUG;
  const startUrl = defaultSlug ? `/t/${defaultSlug}` : '/';

  return {
    id: '/',
    name: 'MarketOS · Plataforma Multi-Tenant',
    short_name: 'MarketOS',
    description:
      'Plataforma Multi-Tenant de comercio minorista, vitrina digital y terminal POS con soporte offline.',
    start_url: startUrl,
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
