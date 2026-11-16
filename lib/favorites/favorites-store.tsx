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

  // Restaurar favoritos desde localStorage en el cliente
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setFavorites(parsed);
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

  const isFavorite = (productId: string) => favorites.includes(productId);

  const toggleFavorite = (productId: string) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignorar soporte táctil
      }
    }

    setFavorites((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      } else {
        return [...prev, productId];
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
