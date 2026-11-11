import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCachedTenantDirectory } from '@/lib/tenant';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';
import { Store, Monitor, ExternalLink } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export const revalidate = 120;

export default async function HomePage() {
  if (TENANT_DEFAULTS.DEFAULT_TENANT_SLUG) {
    redirect(`/t/${TENANT_DEFAULTS.DEFAULT_TENANT_SLUG}`);
  }

  const tenants = await getCachedTenantDirectory();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0b] text-slate-950 dark:text-zinc-100 flex flex-col">
      <header className="border-b border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0f0f11]/95 backdrop-blur px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 dark:bg-lime-500 flex items-center justify-center font-black text-white dark:text-black">
            M
          </div>
          <div>
            <span className="font-black text-base tracking-tight block leading-none">
              MarketOS
            </span>
            <span className="text-[11px] font-mono text-slate-600 dark:text-zinc-400">
              SaaS Multi-Tenant · Core USD
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-12 space-y-10">
        <section className="text-center max-w-2xl mx-auto space-y-3">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold uppercase bg-lime-500/15 text-lime-800 dark:text-lime-300 border border-lime-500/30">
            Directorio de Comercios Activos
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white">
            Plataforma Comercial Multi-Tenant
          </h1>
          <p className="text-sm sm:text-base text-slate-700 dark:text-zinc-300">
            Selecciona un comercio para acceder a su vitrina digital, caja POS offline o panel administrativo con aislamiento estricto de esquema.
          </p>
        </section>

        {tenants.length === 0 ? (
          <div className="rounded-3xl border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-6 max-w-xl mx-auto space-y-3">
            <h2 className="font-extrabold text-amber-950 dark:text-amber-300 text-base">
              Aún no hay comercios activos aprovisionados
            </h2>
            <p className="text-sm text-amber-900 dark:text-amber-200">
              Aprovisiona el primer comercio desde tu Control Plane / PostgreSQL o configura{' '}
              <code className="font-mono font-bold">NEXT_PUBLIC_DEFAULT_TENANT_SLUG</code> en{' '}
              <code className="font-mono font-bold">.env.local</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 p-5 space-y-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-extrabold text-base text-slate-950 dark:text-white truncate">
                        {t.name}
                      </h2>
                      <p className="text-xs font-mono text-slate-600 dark:text-zinc-400">
                        /t/{t.slug}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                    {t.status}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {t.storefront_enabled && (
                    <Link
                      href={`/t/${t.slug}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-black hover:opacity-90 transition"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Vitrina
                    </Link>
                  )}
                  <Link
                    href={`/t/${t.slug}/pos`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-zinc-700 hover:border-lime-500 transition"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    Caja POS
                  </Link>
                  <Link
                    href={`/t/${t.slug}/admin`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-zinc-700 hover:border-lime-500 transition"
                  >
                    Admin
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/60 dark:bg-[#121214]/60 p-4 text-xs text-slate-600 dark:text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            Dominio configurado: <strong className="font-mono">{TENANT_DEFAULTS.PLATFORM_DOMAIN}</strong>
          </span>
          <span>
            Para modo mono-tienda directa en raíz, define{' '}
            <code className="font-mono font-bold">NEXT_PUBLIC_DEFAULT_TENANT_SLUG</code>.
          </span>
        </div>
      </main>
    </div>
  );
}
