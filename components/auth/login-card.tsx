'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, Store, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme-toggle';

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

  // Requisito: Pantalla de login siempre inicia en Modo Claro por defecto
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('marketos-theme', 'light');
    window.dispatchEvent(new Event('theme-change'));
  }, []);

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
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0D0D0E] flex flex-col items-center justify-center p-4 relative transition-colors duration-200">
      {/* Botón minimalista de modo claro/oscuro en esquina superior derecha */}
      <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
        {slug && (
          <Link
            href={`/t/${slug}`}
            className="text-xs font-bold text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/70 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 border border-stone-200/80 dark:border-zinc-700/80 transition-colors hidden sm:inline-flex items-center gap-1.5"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Ir a Vitrina</span>
          </Link>
        )}
        <ThemeToggle />
      </div>

      <div
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#141416] border border-stone-200/80 dark:border-zinc-800 p-7 sm:p-9 shadow-[0_4px_30px_-4px_rgba(0,0,0,0.06)] dark:shadow-none space-y-6"
        style={primaryColor ? { borderTop: `4px solid ${primaryColor}` } : undefined}
      >
        <div className="text-center space-y-3">
          {logoUrl ? (
            <div className="h-16 max-w-[200px] mx-auto flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={businessName}
                className="max-h-16 max-w-full object-contain"
              />
            </div>
          ) : (
            <div
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center shadow-xs"
              style={{
                backgroundColor: primaryColor ? `${primaryColor}20` : 'rgba(132,204,22,0.15)',
                color: primaryColor || '#84cc16',
              }}
            >
              {slug ? <Store className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-black text-stone-950 dark:text-white tracking-tight">
              {businessName}
            </h1>
            <p className="text-xs text-stone-600 dark:text-zinc-400 font-medium mt-1">
              {subtitle ||
                (slug
                  ? 'Inicia sesión con tu cuenta de staff para acceder al Panel o POS'
                  : 'Portal Super Admin · Gobernanza MarketOS')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 block">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={slug ? `usuario@${slug}.com` : 'admin@marketos.app'}
                className="pl-9 bg-stone-50 dark:bg-zinc-900/60 border-stone-200 dark:border-zinc-700/80 text-stone-950 dark:text-white rounded-xl focus:border-stone-400"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 block">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 bg-stone-50 dark:bg-zinc-900/60 border-stone-200 dark:border-zinc-700/80 text-stone-950 dark:text-white rounded-xl focus:border-stone-400"
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
            className="w-full h-11 font-bold text-sm rounded-xl shadow-xs cursor-pointer transition-transform active:scale-[0.99]"
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
          <div className="pt-3 border-t border-stone-100 dark:border-zinc-800 text-center">
            <Link
              href={`/t/${slug}`}
              className="text-xs font-semibold text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white transition-colors"
            >
              ← Volver a la vitrina digital de {businessName}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
