import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  product_slug: string;
  price_usd: number;
  image_url?: string;
  quantity: number;
  max_stock: number;
  is_tax_exempt?: boolean;
  item_key?: string;
  variant_id?: string;
  variant_name?: string;
  selected_modifiers?: CartModifier[];
  prep_notes?: string;
  tenant_slug?: string;
}

export function computeCartItemKey(item: {
  product_id: string;
  variant_id?: string;
  selected_modifiers?: Array<{ id: string }>;
}): string {
  const modKey = (item.selected_modifiers || [])
    .map((m) => m.id)
    .sort()
    .join(',');
  return `${item.product_id}_${item.variant_id || 'base'}_${modKey}`;
}

export function getCurrentTenantSlug(): string {
  if (typeof window === 'undefined') return 'default';
  const match = window.location.pathname.match(/^\/t\/([^\/]+)/);
  return match ? match[1] : 'default';
}

interface CartState {
  // Carritos aislados de forma multi-tenant por comercio
  tenantCarts: Record<string, CartItem[]>;
  activeSlug: string;
  items: CartItem[];
  setActiveSlug: (slug: string) => void;
  addItem: (item: CartItem, tenantSlug?: string) => void;
  removeItem: (itemKeyOrId: string, tenantSlug?: string) => void;
  updateQuantity: (itemKeyOrId: string, quantity: number, tenantSlug?: string) => void;
  clearCart: (tenantSlug?: string | unknown) => void;
  getTotalItems: (tenantSlug?: string) => number;
  getTotalPrice: (tenantSlug?: string) => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      tenantCarts: {},
      activeSlug: typeof window !== 'undefined' ? getCurrentTenantSlug() : 'default',
      items: [],

      setActiveSlug: (slug) => {
        if (!slug) return;
        const currentCarts = get().tenantCarts || {};
        const tenantItems = currentCarts[slug] || [];
        set({
          activeSlug: slug,
          items: tenantItems,
        });
      },

      addItem: (newItem, tenantSlug) => {
        const targetSlug = typeof tenantSlug === 'string' && tenantSlug ? tenantSlug : get().activeSlug || getCurrentTenantSlug();
        const stockLimit = typeof newItem.max_stock === 'number' ? Math.max(0, newItem.max_stock) : 0;
        if (stockLimit <= 0) {
          return;
        }

        const safePrice = Math.max(0, Number(newItem.price_usd || 0));
        const safeRequestedQty = Math.max(1, Math.floor(Number(newItem.quantity || 1)));

        set((state) => {
          const currentCarts = { ...(state.tenantCarts || {}) };
          const tenantItems = [...(currentCarts[targetSlug] || [])];
          const key = newItem.item_key || computeCartItemKey(newItem);
          const existingIndex = tenantItems.findIndex(
            (item) => (item.item_key || computeCartItemKey(item)) === key
          );

          if (existingIndex >= 0) {
            const existing = tenantItems[existingIndex];
            const max = typeof existing.max_stock === 'number' && existing.max_stock > 0
              ? existing.max_stock
              : stockLimit;
            const newQuantity = Math.min(existing.quantity + safeRequestedQty, max);

            tenantItems[existingIndex] = {
              ...existing,
              price_usd: safePrice,
              max_stock: max,
              quantity: newQuantity,
              tenant_slug: targetSlug,
            };
          } else {
            const clampedQty = Math.min(safeRequestedQty, stockLimit);
            const itemWithKey = {
              ...newItem,
              price_usd: safePrice,
              quantity: clampedQty,
              max_stock: stockLimit,
              item_key: key,
              tenant_slug: targetSlug,
            };
            tenantItems.push(itemWithKey);
          }

          currentCarts[targetSlug] = tenantItems;

          return {
            tenantCarts: currentCarts,
            items: targetSlug === state.activeSlug ? tenantItems : state.items,
          };
        });
      },

      removeItem: (itemKeyOrId, tenantSlug) => {
        const targetSlug = typeof tenantSlug === 'string' && tenantSlug ? tenantSlug : get().activeSlug || getCurrentTenantSlug();
        set((state) => {
          const currentCarts = { ...(state.tenantCarts || {}) };
          const tenantItems = (currentCarts[targetSlug] || []).filter(
            (item) =>
              item.item_key !== itemKeyOrId &&
              item.product_id !== itemKeyOrId
          );
          currentCarts[targetSlug] = tenantItems;

          return {
            tenantCarts: currentCarts,
            items: targetSlug === state.activeSlug ? tenantItems : state.items,
          };
        });
      },

      updateQuantity: (itemKeyOrId, quantity, tenantSlug) => {
        const targetSlug = typeof tenantSlug === 'string' && tenantSlug ? tenantSlug : get().activeSlug || getCurrentTenantSlug();
        const safeQty = Math.floor(quantity);
        if (safeQty <= 0) {
          get().removeItem(itemKeyOrId, targetSlug);
          return;
        }

        set((state) => {
          const currentCarts = { ...(state.tenantCarts || {}) };
          const tenantItems = (currentCarts[targetSlug] || []).map((item) => {
            const match =
              item.item_key === itemKeyOrId ||
              item.product_id === itemKeyOrId;
            if (!match) return item;
            const max = typeof item.max_stock === 'number' && item.max_stock > 0
              ? item.max_stock
              : safeQty;
            return { ...item, quantity: Math.min(safeQty, max) };
          });
          currentCarts[targetSlug] = tenantItems;

          return {
            tenantCarts: currentCarts,
            items: targetSlug === state.activeSlug ? tenantItems : state.items,
          };
        });
      },

      clearCart: (tenantSlug) => {
        const targetSlug = typeof tenantSlug === 'string' && tenantSlug ? tenantSlug : get().activeSlug || getCurrentTenantSlug();
        set((state) => {
          const currentCarts = { ...(state.tenantCarts || {}) };
          currentCarts[targetSlug] = [];
          return {
            tenantCarts: currentCarts,
            items: targetSlug === state.activeSlug ? [] : state.items,
          };
        });
      },

      getTotalItems: (tenantSlug) => {
        const targetSlug = tenantSlug || get().activeSlug || getCurrentTenantSlug();
        const items = get().tenantCarts?.[targetSlug] || (targetSlug === get().activeSlug ? get().items : []) || [];
        return items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getTotalPrice: (tenantSlug) => {
        const targetSlug = tenantSlug || get().activeSlug || getCurrentTenantSlug();
        const items = get().tenantCarts?.[targetSlug] || (targetSlug === get().activeSlug ? get().items : []) || [];
        return items.reduce(
          (sum, item) => sum + item.price_usd * item.quantity,
          0
        );
      },
    }),
    {
      name: 'marketos-cart',
      version: 2,
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as any;
        if (!state) return state;

        if (version < 2 || !state.tenantCarts) {
          const legacyItems: CartItem[] = Array.isArray(state.items) ? state.items : [];
          const tenantCarts: Record<string, CartItem[]> = {};

          for (const item of legacyItems) {
            // Clasificación heurística de items preexistentes
            const isMacha = /combo|burrito|nacho|churro|desnudo|bowl/i.test(
              `${item.product_name || ''} ${item.product_slug || ''}`
            );
            const assignedSlug = item.tenant_slug || (isMacha ? 'machatexmex' : 'shopmarket');
            if (!tenantCarts[assignedSlug]) {
              tenantCarts[assignedSlug] = [];
            }
            tenantCarts[assignedSlug].push({
              ...item,
              tenant_slug: assignedSlug,
            });
          }

          const activeSlug = typeof window !== 'undefined' ? getCurrentTenantSlug() : 'default';

          return {
            ...state,
            tenantCarts,
            activeSlug,
            items: tenantCarts[activeSlug] || [],
          };
        }

        return state;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          const slug = typeof window !== 'undefined' ? getCurrentTenantSlug() : state.activeSlug;
          if (slug && state.tenantCarts) {
            state.activeSlug = slug;
            state.items = state.tenantCarts[slug] || [];
          }
        }
      },
    }
  )
);
