import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  product_id: string;
  product_name: string;
  product_slug: string;
  price_usd: number;
  image_url?: string;
  quantity: number;
  max_stock: number;
  is_tax_exempt?: boolean;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      
      addItem: (newItem) => {
        set((state) => {
          const existingItem = state.items.find(item => item.product_id === newItem.product_id);
          
          if (existingItem) {
            const newQuantity = Math.min(
              existingItem.quantity + newItem.quantity,
              existingItem.max_stock
            );
            
            return {
              items: state.items.map(item =>
                item.product_id === newItem.product_id
                  ? { ...item, quantity: newQuantity }
                  : item
              ),
            };
          }
          
          return { items: [...state.items, newItem] };
        });
      },
      
      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter(item => item.product_id !== productId),
        }));
      },
      
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        
        set((state) => ({
          items: state.items.map(item =>
            item.product_id === productId
              ? { ...item, quantity: Math.min(quantity, item.max_stock) }
              : item
          ),
        }));
      },
      
      clearCart: () => {
        set({ items: [] });
      },
      
      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },
      
      getTotalPrice: () => {
        return get().items.reduce((sum, item) => 
          sum + (item.price_usd * item.quantity), 0
        );
      },
    }),
    {
      name: 'marketos-cart',
    }
  )
);
