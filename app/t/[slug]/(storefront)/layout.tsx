import { getCachedTenantShell } from '@/lib/tenant';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { StorefrontHeader } from './components/storefront-header';
import { ContingencyBanner } from './components/contingency-banner';
import { TenantThemeInjector } from '@/components/tenant-theme-injector';
import { FavoritesProvider } from '@/lib/favorites/favorites-store';
import { Store, MapPin, Phone, ShieldCheck } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCachedTenantShell(slug);
  const name = data?.settings?.business_name || data?.tenant?.name || 'MarketOS';
  const logoUrl = data?.settings?.logo_url || null;
  return {
    title: `${name} · Vitrina Digital`,
    description: `Catálogo online y compras directas en ${name}`,
    manifest: `/t/${slug}/manifest.webmanifest`,
    icons: {
      icon: logoUrl || '/icons/icon-192.png',
      apple: logoUrl || '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'black-translucent',
    },
  };
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCachedTenantShell(slug);

  if (!data) notFound();
  if (data.tenant.storefront_enabled === false) {
    redirect(`/t/${slug}/login`);
  }

  const { tenant, settings, inContingency } = data;

  return (
    <FavoritesProvider slug={slug}>
      <TenantThemeInjector
        primaryColor={settings?.primary_color}
        secondaryColor={settings?.secondary_color}
        accentColor={settings?.accent_color}
      />
      <div className="min-h-screen flex flex-col bg-stone-50/60 dark:bg-[#09090b] text-stone-900 dark:text-zinc-100 font-sans transition-colors duration-200">
        {/* Banner de contingencia offline inteligente (inicializado desde SSR) */}
        <ContingencyBanner slug={slug} initialInContingency={inContingency} />

        {/* Header pegajoso con identidad, favoritos y carrito */}
        <StorefrontHeader
          slug={slug}
          storeName={settings.business_name || tenant.name}
          whatsappNumber={settings.whatsapp_number}
          logoUrl={settings.logo_url}
          primaryColor={settings.primary_color}
          exchangeRate={settings.exchange_rate}
          primaryCurrency={settings.primary_currency || 'USD'}
        />

        {/* Contenido principal de la vitrina */}
        <main className="flex-1 pb-16">
          {children}
        </main>

        {/* Footer accesible y canónico con identidad de marca */}
        <footer className="border-t border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#121214] text-stone-700 dark:text-zinc-300 py-10 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
            <div>
              <div className="flex items-center gap-3 mb-2.5">
                {settings.logo_url ? (
                  <div className="w-10 h-10 rounded-xl bg-white border border-stone-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden p-1 shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.logo_url} alt={settings.business_name} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <Store className="w-6 h-6 tenant-primary-text" />
                )}
                <span className="font-black text-lg text-stone-950 dark:text-white">
                  {settings.business_name}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
                Vitrina digital oficial conectada en tiempo real al inventario de nuestro comercio físico.
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold uppercase tracking-wider text-[11px] text-stone-950 dark:text-zinc-200">
                Punto de Retiro (Pick-up)
              </span>
              <p className="flex items-start gap-2 text-stone-600 dark:text-zinc-300">
                <MapPin className="w-4 h-4 shrink-0 tenant-primary-text mt-0.5" />
                <span>{settings.address || 'Tienda física'}</span>
              </p>
              {settings.phone && (
                <p className="flex items-center gap-2 text-stone-600 dark:text-zinc-300">
                  <Phone className="w-4 h-4 text-stone-400 dark:text-zinc-500" />
                  <span>{settings.phone}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5 text-xs md:text-right">
              <span className="font-bold uppercase tracking-wider text-[11px] text-stone-950 dark:text-zinc-200">
                Garantía Operativa
              </span>
              <p className="flex items-center gap-1.5 text-stone-600 dark:text-zinc-300 md:justify-end">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Retiro en mostrador sin cargos extra</span>
              </p>
              <p className="text-[11px] text-stone-400 dark:text-zinc-500 pt-2 font-mono">
                © {new Date().getFullYear()} {settings.business_name}. Powered by <strong className="text-stone-800 dark:text-zinc-200">MarketOS v4.0</strong>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </FavoritesProvider>
  );
}
