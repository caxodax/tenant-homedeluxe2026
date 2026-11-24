'use client';

import { useLayoutEffect, useEffect } from 'react';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function ThemeInitializer() {
  useIsomorphicLayoutEffect(() => {
    try {
      const isLoginPage = window.location.pathname.includes('/login');
      const savedTheme = localStorage.getItem('marketos-theme');
      if (isLoginPage) {
        document.documentElement.classList.remove('dark');
      } else if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (_) {}
  }, []);

  return null;
}
