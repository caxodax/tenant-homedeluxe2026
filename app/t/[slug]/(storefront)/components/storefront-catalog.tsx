'use client';

import { useState, useMemo, useEffect } from 'react';
import { ProductCard, StorefrontProduct } from './product-card';
import { CategorySelectionModal } from './category-selection-modal';
import { FloatingCartBar } from './floating-cart-bar';
import { useFavorites } from '@/lib/favorites/favorites-store';
import {
  Search,
  PackageX,
  Sparkles,
  ChevronDown,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Heart,
  X,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface StorefrontCatalogProps {
  products: StorefrontProduct[];
  categories: Category[];
  businessName: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  exchangeRate?: number | null;
  primaryCurrency?: string;
  slug: string;
}

export function StorefrontCatalog({
  products,
  categories,
  businessName,
  logoUrl,
  bannerUrl,
  exchangeRate,
  primaryCurrency = 'USD',
  slug,
}: StorefrontCatalogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isFavoritesOnly, setIsFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Paginación reactiva adaptada a cuadrícula de 2 columnas
  const [pageSize, setPageSize] = useState<number>(24);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const { favorites, favoritesCount } = useFavorites();

  // Reset de página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, isFavoritesOnly, searchQuery, pageSize]);

  // Filtrado reactivo en cliente (instantáneo, <1ms)
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // 1. Filtro de Favoritos
      if (isFavoritesOnly && !favorites.includes(product.id)) {
        return false;
      }

      // 2. Filtro de Categoría
      const matchesCategory =
        selectedCategory === 'all' || product.category_name === selectedCategory;

      // 3. Filtro de Texto (Nombre o SKU)
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.sku && product.sku.toLowerCase().includes(query)) ||
        (product.barcode && product.barcode.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, isFavoritesOnly, searchQuery, favorites]);

  // Cálculo de paginación
  const totalProducts = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  function getProductCountByCategory(catName: string): number {
    return products.filter((p) => p.category_name === catName).length;
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 sm:pb-16">
      {/* Hero Banner de la Vitrina */}
      <section className="relative rounded-3xl overflow-hidden tenant-secondary-surface border-b-4 border-stone-200 dark:border-zinc-800 p-6 sm:p-10 shadow-sm">
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt={`Banner de ${businessName}`}
            className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
          />
        )}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tenant-primary-bg text-white shadow-xs w-fit">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Retiro inmediato en mostrador (Pick-up)</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight text-stone-950 dark:text-white">
              Catálogo Online de <span className="tenant-primary-text">{businessName}</span>
            </h1>

            <p className="text-xs sm:text-sm tenant-secondary-muted font-medium leading-relaxed">
              Explora nuestros productos con inventario y precios actualizados en tiempo real. 
              Arma tu pedido y retira en tienda física sin filas.
            </p>
          </div>

          {logoUrl && (
            <div className="hidden md:flex w-24 h-24 rounded-3xl bg-white p-2.5 items-center justify-center shrink-0 shadow-md border border-stone-200 dark:border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={businessName} className="w-full h-full object-contain" />
            </div>
          )}
        </div>
      </section>

      {/* BARRA STICKY FIJA AL HACER SCROLL (Buscador + Selector de Categorías) */}
      <div 
        id="catalog-filters-sticky"
        className="sticky top-[70px] z-30 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md py-3 px-2 sm:px-4 -mx-2 sm:-mx-4 border-b border-stone-200/80 dark:border-zinc-800/80 shadow-2xs space-y-2.5"
      >
        {/* Buscador reactivo principal */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar productos en el catálogo..."
            className="w-full h-11 pl-10 pr-10 rounded-2xl bg-stone-100 dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-zinc-500 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-stone-400/30 dark:focus:ring-zinc-600/30 transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 dark:bg-zinc-700 text-stone-600 dark:text-zinc-300 flex items-center justify-center text-xs cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Botón Disparador del Selector de Categorías (Exacto a Imagen 1 y 3) */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-stone-100 dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 text-stone-900 dark:text-white font-extrabold text-xs shadow-2xs hover:bg-stone-200/60 dark:hover:bg-zinc-800 transition cursor-pointer select-none"
          >
            <div className="flex items-center gap-2 truncate">
              <LayoutGrid className="w-4 h-4 tenant-primary-text shrink-0" />
              <span className="text-stone-400 dark:text-zinc-500 uppercase font-mono text-[10px] tracking-wider shrink-0">
                CATEGORÍAS:
              </span>
              <span className="truncate">
                {isFavoritesOnly ? 'Solo Mis Favoritos' : selectedCategory === 'all' ? 'Todas las categorías' : selectedCategory}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300">
                {totalProducts}
              </span>
              <ChevronDown className="w-4 h-4 text-stone-400" />
            </div>
          </button>

          {/* Botón de Acceso Rápido a Favoritos en Barra */}
          <button
            type="button"
            onClick={() => setIsFavoritesOnly(!isFavoritesOnly)}
            className={`h-10 px-3 rounded-2xl border flex items-center gap-1.5 text-xs font-bold transition cursor-pointer ${
              isFavoritesOnly
                ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                : 'bg-stone-100 dark:bg-zinc-900 border-stone-200/80 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:text-rose-500'
            }`}
            title="Filtrar por favoritos"
          >
            <Heart className={`w-3.5 h-3.5 ${isFavoritesOnly ? 'fill-white' : ''}`} />
            <span className="hidden sm:inline">Favoritos</span>
            <span className="font-mono text-[11px]">{favoritesCount}</span>
          </button>
        </div>
      </div>

      {/* Grid de Productos (2 Columnas en móvil, 3 en tablet, 4 en desktop) */}
      <section className="space-y-6">
        {totalProducts === 0 ? (
          <div className="py-16 text-center rounded-3xl border border-dashed border-stone-200 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/30 p-8 max-w-md mx-auto space-y-3">
            <PackageX className="w-12 h-12 text-stone-300 dark:text-zinc-600 mx-auto" />
            <h3 className="font-extrabold text-base text-stone-800 dark:text-zinc-200">
              {isFavoritesOnly ? 'Aún no tienes productos favoritos guardados' : 'No se encontraron productos'}
            </h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              {isFavoritesOnly
                ? 'Presiona el corazón en cualquier producto para guardarlo en tu lista.'
                : 'Intenta con otro término de búsqueda o selecciona otra categoría.'}
            </p>
            {(selectedCategory !== 'all' || isFavoritesOnly || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setIsFavoritesOnly(false);
                  setSearchQuery('');
                }}
                className="mt-2 px-4 py-2 rounded-xl tenant-primary-bg text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Restablecer Filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5 animate-in fade-in duration-200">
            {paginatedProducts.map((product, idx) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={idx < 4}
                exchangeRate={exchangeRate}
                primaryCurrency={primaryCurrency}
              />
            ))}
          </div>
        )}

        {/* BARRA DE PAGINACIÓN RESPONSIVA */}
        {totalProducts > 0 && (
          <div className="mt-8 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#141416] border border-stone-200/80 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            {/* Selector de cantidad por página */}
            <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-between sm:justify-start">
              <span className="font-bold text-stone-500 dark:text-zinc-400">
                Mostrar:
              </span>
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-zinc-900 p-1 rounded-xl border border-stone-200/60 dark:border-zinc-800">
                {[12, 24, 48].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setPageSize(size);
                      const el = document.getElementById('catalog-filters-sticky');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`px-3 py-1 rounded-lg font-black text-xs transition cursor-pointer ${
                      pageSize === size
                        ? 'tenant-primary-bg text-white shadow-2xs'
                        : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Contador de rango */}
            <div className="text-xs text-stone-500 dark:text-zinc-400 font-medium text-center">
              Mostrando{' '}
              <span className="font-bold text-stone-900 dark:text-white">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              -{' '}
              <span className="font-bold text-stone-900 dark:text-white">
                {Math.min(currentPage * pageSize, totalProducts)}
              </span>{' '}
              de{' '}
              <span className="font-bold text-stone-900 dark:text-white">{totalProducts}</span> productos
            </div>

            {/* Botones de Navegación */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  const el = document.getElementById('catalog-filters-sticky');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={currentPage === 1}
                className="h-9 px-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900 hover:bg-stone-100 text-xs font-bold text-stone-700 dark:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>

              <div className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200/60 dark:border-zinc-800 text-xs font-mono font-black text-stone-800 dark:text-zinc-200 min-w-[65px] text-center">
                {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  const el = document.getElementById('catalog-filters-sticky');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={currentPage === totalPages}
                className="h-9 px-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900 hover:bg-stone-100 text-xs font-bold text-stone-700 dark:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1 cursor-pointer"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Modal / Bottom-Sheet de Selección de Categoría */}
      <CategorySelectionModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        selectedCategory={selectedCategory}
        isFavoritesOnly={isFavoritesOnly}
        onSelectCategory={(catName) => {
          setSelectedCategory(catName);
          setIsCategoryModalOpen(false);
        }}
        onToggleFavorites={() => {
          setIsFavoritesOnly(!isFavoritesOnly);
          if (!isFavoritesOnly) setSelectedCategory('all');
        }}
        totalProductsCount={products.length}
        favoritesCount={favoritesCount}
        getProductCountByCategory={getProductCountByCategory}
      />

      {/* Barra Inferior Flotante Móvil de Carrito */}
      <FloatingCartBar
        slug={slug}
        exchangeRate={exchangeRate}
        primaryCurrency={primaryCurrency}
      />
    </div>
  );
}
