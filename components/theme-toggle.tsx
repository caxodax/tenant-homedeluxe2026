'use client';

import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('theme-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('theme-change', callback);
  };
}

function getSnapshot() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot() {
  return 'dark';
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = (newTheme: 'dark' | 'light') => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('marketos-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('marketos-theme', 'light');
    }
    window.dispatchEvent(new Event('theme-change'));
  };

  return (
    <div className="flex items-center p-1 bg-zinc-200/90 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-full shadow-inner transition-colors">
      <button
        type="button"
        onClick={() => toggleTheme('light')}
        title="Cambiar a Modo Claro"
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
          theme === 'light'
            ? 'bg-white text-amber-600 shadow-sm font-semibold'
            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
        }`}
      >
        <Sun className="w-3.5 h-3.5 text-amber-500" />
        <span className="hidden sm:inline">Claro</span>
      </button>

      <button
        type="button"
        onClick={() => toggleTheme('dark')}
        title="Cambiar a Modo Oscuro"
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-zinc-800 text-lime-400 shadow-sm font-semibold border border-zinc-700/60'
            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
        }`}
      >
        <Moon className="w-3.5 h-3.5 text-lime-400" />
        <span className="hidden sm:inline">Oscuro</span>
      </button>
    </div>
  );
}
