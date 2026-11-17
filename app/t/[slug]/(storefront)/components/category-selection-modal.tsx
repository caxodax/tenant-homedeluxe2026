'use client';

import React from 'react';
import { LayoutGrid, Heart, Check, X } from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-portal';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategorySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  selectedCategory: string;
  isFavoritesOnly: boolean;
  onSelectCategory: (categoryName: string) => void;
  onToggleFavorites: () => void;
  totalProductsCount: number;
  favoritesCount: number;
  getProductCountByCategory: (catName: string) => number;
}

export function CategorySelectionModal({
  isOpen,
  onClose,
  categories,
  selectedCategory,
  isFavoritesOnly,
  onSelectCategory,
  onToggleFavorites,
  totalProductsCount,
  favoritesCount,
  getProductCountByCategory,
}: CategorySelectionModalProps) {
  return (
    <ModalPortal
      isOpen={isOpen}
      onClose={onClose}
      backdropClassName="bg-black/60 backdrop-blur-xs"
      containerClassName="p-0 sm:p-4 items-end sm:items-center"
    >
      {/* Contenedor Modal / Bottom Sheet */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#141416] border border-stone-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200">
        
        {/* Cabecera del Selector */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2 text-stone-900 dark:text-white font-extrabold text-sm tracking-wide uppercase">
            <LayoutGrid className="w-4 h-4 tenant-primary-text" />
            <span>Elige una Categoría</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Categorías con Radio Buttons */}
        <div className="p-4 space-y-1.5 overflow-y-auto flex-1 divide-y divide-stone-100/80 dark:divide-zinc-800/40">
          
          {/* Opción 1: Todas las Categorías */}
          <button
            type="button"
            onClick={() => {
              if (isFavoritesOnly) onToggleFavorites();
              onSelectCategory('all');
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800/50 group text-left"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  selectedCategory === 'all' && !isFavoritesOnly
                    ? 'border-transparent tenant-primary-bg text-white shadow-xs'
                    : 'border-stone-300 dark:border-zinc-600 bg-transparent group-hover:border-stone-400'
                }`}
              >
                {selectedCategory === 'all' && !isFavoritesOnly && (
                  <Check className="w-3 h-3 stroke-[3]" />
                )}
              </div>
              <span className={`text-xs sm:text-sm font-extrabold ${
                selectedCategory === 'all' && !isFavoritesOnly 
                  ? 'tenant-primary-text font-black' 
                  : 'text-stone-800 dark:text-zinc-200'
              }`}>
                Todas las categorías
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-stone-400 dark:text-zinc-500">
              {totalProductsCount}
            </span>
          </button>

          {/* Opción 2: Solo Mis Favoritos */}
          <button
            type="button"
            onClick={() => {
              onToggleFavorites();
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800/50 group text-left pt-2.5"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  isFavoritesOnly
                    ? 'border-transparent bg-rose-500 text-white shadow-xs'
                    : 'border-stone-300 dark:border-zinc-600 bg-transparent group-hover:border-rose-400'
                }`}
              >
                {isFavoritesOnly && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <div className="flex items-center gap-2">
                <Heart className={`w-4 h-4 ${isFavoritesOnly ? 'fill-rose-500 text-rose-500' : 'text-stone-400 dark:text-zinc-500'}`} />
                <span className={`text-xs sm:text-sm font-extrabold ${
                  isFavoritesOnly ? 'text-rose-600 dark:text-rose-400 font-black' : 'text-stone-800 dark:text-zinc-200'
                }`}>
                  Solo Mis Favoritos
                </span>
              </div>
            </div>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
              favoritesCount > 0 ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'text-stone-400 dark:text-zinc-500'
            }`}>
              {favoritesCount}
            </span>
          </button>

          {/* Lista de Categorías Dinámicas */}
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.name && !isFavoritesOnly;
            const count = getProductCountByCategory(cat.name);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (isFavoritesOnly) onToggleFavorites();
                  onSelectCategory(cat.name);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl transition-all cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800/50 group text-left pt-2.5"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'border-transparent tenant-primary-bg text-white shadow-xs'
                        : 'border-stone-300 dark:border-zinc-600 bg-transparent group-hover:border-stone-400'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span className={`text-xs sm:text-sm font-bold ${
                    isSelected ? 'tenant-primary-text font-black' : 'text-stone-800 dark:text-zinc-200'
                  }`}>
                    {cat.name}
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-stone-400 dark:text-zinc-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Botones Inferiores de Acción */}
        <div className="p-4 bg-stone-50 dark:bg-zinc-900/60 border-t border-stone-100 dark:border-zinc-800 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (isFavoritesOnly) onToggleFavorites();
              onSelectCategory('all');
              onClose();
            }}
            className="flex-1 py-3 px-4 rounded-xl border border-stone-200 dark:border-zinc-700 font-extrabold text-xs text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 transition cursor-pointer text-center"
          >
            Ver Todas
          </button>
          
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl tenant-primary-bg text-white font-extrabold text-xs shadow-md hover:brightness-105 active:scale-[0.99] transition cursor-pointer text-center"
          >
            Listo ({isFavoritesOnly ? favoritesCount : selectedCategory === 'all' ? totalProductsCount : getProductCountByCategory(selectedCategory)})
          </button>
        </div>

      </div>
    </ModalPortal>
  );
}
