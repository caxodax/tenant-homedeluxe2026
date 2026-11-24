'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

interface FavoritesContextType {
  favorites: string[];
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => void;
  favoritesCount: number;
  clearFavorites: () => void;
  isFavoritesOnly: boolean;
  setIsFavoritesOnly: (value: boolean) => void;
  toggleFavoritesOnly: () => void;
  syncWithAvailableProducts: (availableProductIds: string[]) => void;
  isInitialized: boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

interface FavoritesProviderProps {
  children: React.ReactNode;
  slug: string;
}

export function FavoritesProvider({ children, slug }: FavoritesProviderProps) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isFavoritesOnly, setIsFavoritesOnly] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const storageKey = useMemo(() => `marketos_favorites_${slug}`, [slug]);

  // Restaurar y desinfectar favoritos desde localStorage en el cliente
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filtrar valores no válidos, nulos, strings vacíos y duplicados
          const sanitized = Array.from(
            new Set(
              parsed.filter(
                (id): id is string => typeof id === 'string' && id.trim().length > 0
              )
            )
          );
          setFavorites(sanitized);
        }
      }
    } catch {
      // Ignorar si el almacenamiento local está restringido
    } finally {
      setIsInitialized(true);
    }
  }, [storageKey]);

  // Persistir cambios en localStorage
  useEffect(() => {
    if (isInitialized) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(favorites));
      } catch {
        // Ignorar excepciones de almacenamiento
      }
    }
  }, [favorites, isInitialized, storageKey]);

  // Sincronizar y purgar automáticamente IDs huérfanos que ya no existen en el catálogo activo
  const syncWithAvailableProducts = React.useCallback(
    (availableProductIds: string[]) => {
      if (!isInitialized || !availableProductIds || availableProductIds.length === 0) return;
      const validSet = new Set(availableProductIds.filter((id) => typeof id === 'string' && id.trim().length > 0));

      setFavorites((prev) => {
        const purged = prev.filter((id) => validSet.has(id));
        if (purged.length === prev.length) {
          return prev;
        }
        return purged;
      });
    },
    [isInitialized]
  );

  const isFavorite = (productId: string) => {
    if (!productId || typeof productId !== 'string') return false;
    return favorites.includes(productId.trim());
  };

  const toggleFavorite = (productId: string) => {
    if (!productId || typeof productId !== 'string' || !productId.trim()) return;
    const cleanId = productId.trim();

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignorar soporte táctil
      }
    }

    setFavorites((prev) => {
      if (prev.includes(cleanId)) {
        return prev.filter((id) => id !== cleanId);
      } else {
        return [...prev, cleanId];
      }
    });
  };

  const clearFavorites = () => setFavorites([]);

  const toggleFavoritesOnly = () => {
    setIsFavoritesOnly((prev) => !prev);
  };

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        isFavorite,
        toggleFavorite,
        favoritesCount: favorites.length,
        clearFavorites,
        isFavoritesOnly,
        setIsFavoritesOnly,
        toggleFavoritesOnly,
        syncWithAvailableProducts,
        isInitialized,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites debe ser utilizado dentro de un FavoritesProvider');
  }
  return context;
}
