'use client';

import { useEffect } from 'react';
import { useCart } from './cart-store';

export function CartTenantSync({ slug }: { slug: string }) {
  const setActiveSlug = useCart((state) => state.setActiveSlug);

  useEffect(() => {
    if (slug) {
      setActiveSlug(slug);
    }
  }, [slug, setActiveSlug]);

  return null;
}
