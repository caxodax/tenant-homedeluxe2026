import type { Metadata } from 'next';
import { getCachedTenantShell } from '@/lib/tenant';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const normalizedSlug = slug.toLowerCase().trim();
  const shell = await getCachedTenantShell(normalizedSlug);
  const name = shell?.settings.business_name || shell?.tenant.name || 'MarketOS';
  const logo = shell?.settings.logo_url || '/icons/icon-192.png';

  return {
    title: {
      template: `%s · ${name}`,
      default: name,
    },
    description: `Plataforma y operaciones de ${name}`,
    manifest: `/t/${normalizedSlug}/manifest.webmanifest`,
    icons: {
      icon: logo,
      apple: logo,
    },
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'black-translucent',
    },
  };
}

export default function TenantRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
