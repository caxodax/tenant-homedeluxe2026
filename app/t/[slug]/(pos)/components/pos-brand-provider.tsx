'use client';

import React, { createContext, useContext } from 'react';

export interface PosBrandInfo {
  business_name: string;
  store_id?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  staff?: {
    full_name: string;
    role: string;
    email?: string | null;
  } | null;
}

const PosBrandContext = createContext<PosBrandInfo | null>(null);

export function PosBrandProvider({
  initialBrand,
  children,
}: {
  initialBrand: PosBrandInfo;
  children: React.ReactNode;
}) {
  return (
    <PosBrandContext.Provider value={initialBrand}>
      {children}
    </PosBrandContext.Provider>
  );
}

export function usePosBrand() {
  return useContext(PosBrandContext);
}
