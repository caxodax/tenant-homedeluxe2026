'use client';

import { useState, useEffect } from 'react';

/**
 * Hook para evitar errores de hidratación (SSR mismatch)
 * con stores persistentes en localStorage (Zustand).
 */
export function useHasMounted() {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return hasMounted;
}
