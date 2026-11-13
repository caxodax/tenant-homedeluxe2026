'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, Store, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LoginCardProps {
  slug?: string;
  businessName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  subtitle?: string;
}

export function LoginCard({
  slug,
  businessName,
  logoUrl,
  primaryColor,
  subtitle,
}: LoginCardProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          slug: slug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo iniciar sesión');
      }
      toast.success('Bienvenido', {
        description: `Sesión iniciada como ${data.staff?.full_name || data.user?.full_name || email}`,
      });
      router.push(data.redirectTo || (slug ? `/t/${slug}/admin` : '/'));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0b] flex flex-col items-center justify-center p-4">
      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 p-7 sm:p-8 shadow-xl space-y-6"
        style={primaryColor ? { borderTop: `4px solid ${primaryColor}` } : undefined}
      >
        <div className="text-center space-y-3">
          {logoUrl ? (
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 dark:border-zinc-700 mx-auto flex items-center justify-center overflow-hidden shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={businessName} className="w-full h-full object-contain p-1.5" />
            </div>
          ) : (
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-sm"
              style={{
                backgroundColor: primaryColor ? `${primaryColor}20` : 'rgba(132,204,22,0.15)',
                color: primaryColor || '#84cc16',
              }}
            >
              {slug ? <Store className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight">
              {businessName}
            </h1>
            <p className="text-sm text-slate-700 dark:text-zinc-300 mt-1">
              {subtitle ||
                (slug
                  ? 'Inicia sesión con tu cuenta de staff para acceder al Panel o POS'
                  : 'Portal Super Admin · Gobernanza MarketOS')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 block">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={slug ? `usuario@${slug}.com` : 'admin@marketos.app'}
                className="pl-9 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 block">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 text-slate-950 dark:text-white"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            style={
              primaryColor
                ? { backgroundColor: primaryColor, color: '#ffffff' }
                : undefined
            }
            className="w-full h-11 font-bold text-sm rounded-xl shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verificando acceso...
              </>
            ) : (
              <>
                <span>Ingresar al Sistema</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>

        {slug && (
          <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 text-center">
            <Link
              href={`/t/${slug}`}
              className="text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:underline"
            >
              ← Volver al inicio de {businessName}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
