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

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemKeyOrId: string) => void;
  updateQuantity: (itemKeyOrId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (newItem) => {
        // Validación estricta anti-negativos y de stock disponible
        const stockLimit = typeof newItem.max_stock === 'number' ? Math.max(0, newItem.max_stock) : 0;
        if (stockLimit <= 0) {
          return;
        }

        const safePrice = Math.max(0, Number(newItem.price_usd || 0));
        const safeRequestedQty = Math.max(1, Math.floor(Number(newItem.quantity || 1)));

        set((state) => {
          const key = newItem.item_key || computeCartItemKey(newItem);
          const existingIndex = state.items.findIndex(
            (item) => (item.item_key || computeCartItemKey(item)) === key
          );

          if (existingIndex >= 0) {
            const existing = state.items[existingIndex];
            const max = typeof existing.max_stock === 'number' && existing.max_stock > 0
              ? existing.max_stock
              : stockLimit;
            const newQuantity = Math.min(existing.quantity + safeRequestedQty, max);

            const updatedItems = [...state.items];
            updatedItems[existingIndex] = {
              ...existing,
              price_usd: safePrice,
              max_stock: max,
              quantity: newQuantity,
            };
            return { items: updatedItems };
          }

          const clampedQty = Math.min(safeRequestedQty, stockLimit);
          const itemWithKey = {
            ...newItem,
            price_usd: safePrice,
            quantity: clampedQty,
            max_stock: stockLimit,
            item_key: key,
          };

          return { items: [...state.items, itemWithKey] };
        });
      },

      removeItem: (itemKeyOrId) => {
        set((state) => ({
          items: state.items.filter(
            (item) =>
              item.item_key !== itemKeyOrId &&
              item.product_id !== itemKeyOrId
          ),
        }));
      },

      updateQuantity: (itemKeyOrId, quantity) => {
        const safeQty = Math.floor(quantity);
        if (safeQty <= 0) {
          get().removeItem(itemKeyOrId);
          return;
        }

        set((state) => ({
          items: state.items.map((item) => {
            const match =
              item.item_key === itemKeyOrId ||
              item.product_id === itemKeyOrId;
            if (!match) return item;
            const max = typeof item.max_stock === 'number' && item.max_stock > 0
              ? item.max_stock
              : safeQty;
            return { ...item, quantity: Math.min(safeQty, max) };
          }),
        }));
      },

      clearCart: () => {
        set({ items: [] });
      },

      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      getTotalPrice: () => {
        return get().items.reduce(
          (sum, item) => sum + item.price_usd * item.quantity,
          0
        );
      },
    }),
    {
      name: 'marketos-cart',
    }
  )
);
