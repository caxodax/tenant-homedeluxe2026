import Link from 'next/link';
import { Monitor, ShieldCheck, Store } from 'lucide-react';

export function DisabledStorefrontNotice({
  slug,
  businessName,
}: {
  slug: string;
  businessName: string;
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 p-8 text-center space-y-5 shadow-sm">
        <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          <Store className="w-7 h-7 text-[var(--tenant-primary)]" />
        </div>

        <div className="space-y-2">
          <span className="inline-block text-xs font-mono font-bold uppercase px-3 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
            Modo Solo ERP / POS Interno
          </span>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight">
            {businessName}
          </h1>
          <p className="text-sm text-slate-700 dark:text-zinc-300">
            La vitrina digital pública de este comercio no está habilitada. Si perteneces al equipo operativo, ingresa a la caja o panel administrativo.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
          <Link
            href={`/t/${slug}/pos`}
            style={{
              backgroundColor: 'var(--tenant-primary)',
              color: 'var(--tenant-primary-fg)',
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-opacity hover:opacity-90"
          >
            <Monitor className="w-4 h-4" />
            Abrir Caja POS
          </Link>
          <Link
            href={`/t/${slug}/login`}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-slate-900 dark:text-white hover:border-[var(--tenant-primary)] transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            Iniciar Sesión Staff
          </Link>
        </div>
      </div>
    </div>
  );
}
