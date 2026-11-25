import { getCachedTenantShell } from '@/lib/tenant';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { StorefrontHeader } from './components/storefront-header';
import { ContingencyBanner } from './components/contingency-banner';
import { TenantThemeInjector } from '@/components/tenant-theme-injector';
import { FavoritesProvider } from '@/lib/favorites/favorites-store';
import { CartTenantSync } from '@/lib/cart/cart-tenant-sync';
import { PwaSplashScreen } from '@/components/storefront/pwa-splash-screen';
import { Store, MapPin, Phone, ShieldCheck, Clock } from 'lucide-react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCachedTenantShell(slug);
  const name = data?.settings?.business_name || data?.tenant?.name || 'MarketOS';
  return {
    title: `${name} · Vitrina Digital`,
    description: `Catálogo online y compras directas en ${name}`,
    manifest: `/t/${slug}/manifest.webmanifest`,
    icons: {
      icon: [
        { url: `/api/tenant/${slug}/icon?size=192`, sizes: '192x192', type: 'image/png' },
        { url: `/api/tenant/${slug}/icon?size=512`, sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: `/api/tenant/${slug}/icon?size=180&purpose=apple`, sizes: '180x180', type: 'image/png' },
      ],
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
    const cookieStore = await cookies();
    if (cookieStore.has('marketos_staff_session')) {
      redirect(`/t/${slug}/admin`);
    }
    redirect(`/t/${slug}/login`);
  }

  const { tenant, settings, inContingency } = data;

  return (
    <FavoritesProvider slug={slug}>
      <CartTenantSync slug={slug} />
      <TenantThemeInjector
        primaryColor={settings?.primary_color}
        secondaryColor={settings?.secondary_color}
        accentColor={settings?.accent_color}
      />
      <div 
        className="min-h-screen flex flex-col text-stone-900 dark:text-zinc-100 font-sans w-full max-w-full overflow-x-hidden transition-colors"
        style={{ backgroundColor: 'var(--tenant-canvas-bg, #FAF7F2)' }}
      >
        {/* Pantalla Splash PWA con Animación Heartbeat al Abrir */}
        <PwaSplashScreen
          businessName={settings.business_name || tenant.name}
          logoUrl={settings.logo_url}
          primaryColor={settings.primary_color}
        />

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
        <main className="flex-1 pb-16 w-full max-w-full overflow-x-hidden">
          {children}
        </main>

        {/* Footer accesible y canónico con identidad de marca */}
        <footer 
          className="border-t border-black/15 py-12 transition-colors relative"
          style={{ 
            backgroundColor: 'var(--tenant-secondary, #4D2109)', 
            color: 'var(--tenant-secondary-contrast, #FCE8C8)' 
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
            <div>
              <div className="flex items-center gap-3 mb-2.5">
                {settings.logo_url ? (
                  <div className="w-10 h-10 rounded-xl bg-white border border-white/20 flex items-center justify-center overflow-hidden p-1 shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={settings.logo_url} alt={settings.business_name} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <Store className="w-6 h-6 text-white" style={{ color: 'var(--tenant-accent, #FCE8C8)' }} />
                )}
                <span className="font-black text-lg text-white" style={{ color: 'var(--tenant-secondary-contrast, #FCE8C8)' }}>
                  {settings.business_name}
                </span>
              </div>
              {(() => {
                const sm = settings.social_media || {};
                const wa = sm.whatsapp || settings.whatsapp_number || '';
                const channels = [
                  { id: 'instagram', url: sm.instagram ? (sm.instagram.startsWith('http') ? sm.instagram : `https://instagram.com/${sm.instagram.replace(/^@/, '')}`) : '', label: 'Instagram', svg: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg> },
                  { id: 'facebook', url: sm.facebook ? (sm.facebook.startsWith('http') ? sm.facebook : `https://facebook.com/${sm.facebook}`) : '', label: 'Facebook', svg: <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
                  { id: 'tiktok', url: sm.tiktok ? (sm.tiktok.startsWith('http') ? sm.tiktok : `https://tiktok.com/@${sm.tiktok.replace(/^@/, '')}`) : '', label: 'TikTok', svg: <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg> },
                  { id: 'twitter', url: sm.twitter ? (sm.twitter.startsWith('http') ? sm.twitter : `https://x.com/${sm.twitter.replace(/^@/, '')}`) : '', label: 'X', svg: <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                  { id: 'youtube', url: sm.youtube ? (sm.youtube.startsWith('http') ? sm.youtube : `https://youtube.com/@${sm.youtube.replace(/^@/, '')}`) : '', label: 'YouTube', svg: <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
                  { id: 'whatsapp', url: wa ? `https://wa.me/${wa.replace(/\D/g, '')}` : '', label: 'WhatsApp', svg: <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> },
                ].filter((c) => Boolean(c.url));

                if (channels.length === 0) {
                  return (
                    <p className="text-xs opacity-80 leading-relaxed">
                      Atención al cliente personalizada y catálogo con inventario en tiempo real.
                    </p>
                  );
                }

                return (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                      Conéctate con nosotros
                    </p>
                    <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                      {channels.map((c) => (
                        <a
                          key={c.id}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={c.label}
                          className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all duration-150 shadow-2xs hover:scale-105 active:scale-95"
                        >
                          {c.svg}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="font-bold uppercase tracking-wider text-[11px] opacity-90">
                Punto de Retiro (Pick-up)
              </span>
              <p className="flex items-start gap-2 opacity-90">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--tenant-primary, #B3511E)' }} />
                <span>{settings.address || 'Tienda física'}</span>
              </p>
              {settings.business_hours && (
                <p className="flex items-start gap-2 opacity-90">
                  <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span className="leading-tight">{settings.business_hours}</span>
                </p>
              )}
              {settings.phone && (
                <p className="flex items-center gap-2 opacity-80">
                  <Phone className="w-4 h-4" />
                  <span>{settings.phone}</span>
                </p>
              )}
            </div>

            <div className="space-y-1.5 text-xs md:text-right">
              <span className="font-bold uppercase tracking-wider text-[11px] opacity-90">
                Garantía Operativa
              </span>
              <p className="flex items-center gap-1.5 opacity-90 md:justify-end">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Retiro en mostrador sin cargos extra</span>
              </p>
              <p className="text-[11px] opacity-60 pt-2 font-mono">
                © {new Date().getFullYear()} {settings.business_name}. Powered by <strong className="opacity-90">MarketOS v4.0</strong>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </FavoritesProvider>
  );
}
