'use client';

import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('theme-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('theme-change', callback);
  };
}

function getSnapshot() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot() {
  return 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('marketos-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('marketos-theme', 'light');
    }
    window.dispatchEvent(new Event('theme-change'));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={cn(
        "relative w-9 h-9 flex items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 border border-stone-200/80 dark:border-zinc-700/80 text-stone-700 dark:text-zinc-200 shadow-xs transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-stone-400/30",
        className
      )}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
      ) : (
        <Moon className="w-4 h-4 text-stone-700 transition-transform duration-300 hover:-rotate-12" />
      )}
    </button>
  );
}
