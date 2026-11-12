'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function LogoutButton({
  slug,
  className,
  onLoggedOut,
}: {
  slug?: string;
  className?: string;
  onLoggedOut?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.success('Sesión cerrada');
      onLoggedOut?.();
      router.push(slug ? `/t/${slug}/login` : '/login');
      router.refresh();
    } catch {
      toast.error('No se pudo cerrar la sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className={cn(
        'flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-sm text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 transition-colors font-semibold cursor-pointer',
        className
      )}
    >
      <LogOut className="w-4 h-4 shrink-0" />
      <span>{busy ? 'Cerrando...' : 'Cerrar Sesión'}</span>
    </button>
  );
}
