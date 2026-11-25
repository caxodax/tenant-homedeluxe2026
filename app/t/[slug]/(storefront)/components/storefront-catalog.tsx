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
  Flame,
  Zap,
  Truck,
  ShieldCheck,
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
  bannerStyle?: 'clean' | 'card';
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
  bannerStyle = 'clean',
  exchangeRate,
  primaryCurrency = 'USD',
  slug,
}: StorefrontCatalogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Paginación reactiva adaptada a cuadrícula de 2 columnas
  const [pageSize, setPageSize] = useState<number>(24);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const {
    favorites,
    favoritesCount,
    isFavoritesOnly,
    setIsFavoritesOnly,
    syncWithAvailableProducts,
    clearFavorites,
  } = useFavorites();

  // Depurar y reconciliar favoritos huérfanos con los productos reales y activos del catálogo
  useEffect(() => {
    if (products && products.length > 0) {
      syncWithAvailableProducts(products.map((p) => p.id));
    }
  }, [products, syncWithAvailableProducts]);

  // Si la URL contiene ?filter=favorites, activar reactivamente
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('filter') === 'favorites') {
        setIsFavoritesOnly(true);
      }
    }
  }, [setIsFavoritesOnly]);

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
    <div className="space-y-6 sm:space-y-8 pb-32 sm:pb-20">
      {/* Hero Banner de la Vitrina (Proporción Natural Fluida 100% de Ancho, Cero Zoom Forzado) */}
      {bannerUrl && bannerStyle !== 'card' ? (
        <section className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-200/90 dark:border-zinc-800/80 shadow-xs transition-all bg-stone-100 dark:bg-zinc-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt={`Banner oficial de ${businessName}`}
            className="w-full h-auto block object-contain object-center"
            loading="eager"
            fetchPriority="high"
          />
        </section>
      ) : (
        /* Tarjeta Informativa Editorial (Fallback cuando no hay banner o modo 'card') */
        <section 
          className="relative rounded-3xl overflow-hidden bg-white dark:bg-[#141416] border border-stone-200/90 dark:border-zinc-800/80 p-6 sm:p-8 md:p-10 shadow-sm border-l-6 transition-all"
          style={{ borderLeftColor: 'var(--tenant-primary, #dc2626)' }}
        >
          {/* Glow ambiental sutil de fondo */}
          <div 
            className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none"
            style={{ backgroundColor: 'var(--tenant-primary, #dc2626)' }}
          />

          {bannerUrl && (
            <div className="absolute inset-0 pointer-events-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerUrl}
                alt={`Banner de ${businessName}`}
                className="w-full h-full object-cover opacity-15 dark:opacity-10"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-transparent dark:from-[#141416] dark:via-[#141416]/90" />
            </div>
          )}

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl space-y-3.5">
              {/* Micro-badge de bienvenida / tipo de servicio */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-100 dark:bg-zinc-800/90 border border-stone-200/70 dark:border-zinc-700/70 text-[11px] font-extrabold text-stone-700 dark:text-zinc-200 shadow-2xs">
                <Flame className="w-3.5 h-3.5 tenant-primary-text" />
                <span>Menú Digital & Pedidos Directos</span>
              </div>

              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight text-stone-950 dark:text-white">
                  {businessName}
                </h1>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-zinc-400 font-medium leading-relaxed max-w-xl">
                  Arma tu pedido al momento con ingredientes de calidad. Selecciona tus opciones favoritas y retira en tienda o recíbelo por delivery.
                </p>
              </div>

              {/* Badges de servicio rápidos */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-1 text-[11px] font-bold text-stone-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100/80 dark:bg-zinc-900 border border-stone-200/60 dark:border-zinc-800">
                  <Zap className="w-3 h-3 text-amber-500" />
                  Atención en Vivo
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100/80 dark:bg-zinc-900 border border-stone-200/60 dark:border-zinc-800">
                  <Truck className="w-3 h-3 text-emerald-500" />
                  Pick-up & Delivery
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100/80 dark:bg-zinc-900 border border-stone-200/60 dark:border-zinc-800">
                  <ShieldCheck className="w-3 h-3 text-blue-500" />
                  Precios Claros en USD y BCV
                </span>
              </div>
            </div>

            {logoUrl && (
              <div className="hidden md:flex w-24 h-24 sm:w-28 sm:h-28 rounded-2xl sm:rounded-3xl bg-white dark:bg-zinc-900 p-3 items-center justify-center shrink-0 shadow-md border border-stone-200/90 dark:border-zinc-700/80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={businessName} className="w-full h-full object-contain" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* BARRA STICKY FIJA AL HACER SCROLL (Buscador + Selector de Categorías Estilo Brand Capsule) */}
      <div 
        id="catalog-filters-sticky"
        className="sticky top-[70px] z-30 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-md py-3 px-2 sm:px-4 -mx-2 sm:-mx-4 border-b border-stone-200/90 dark:border-zinc-800 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] space-y-2.5 transition-colors"
      >
        {/* Buscador reactivo principal */}
        <div className="relative w-full">
          <Search 
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors" 
            style={{ color: 'var(--tenant-primary, #ea580c)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar productos en el catálogo..."
            className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white dark:bg-zinc-900 border border-stone-300/90 dark:border-zinc-700 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-zinc-500 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--tenant-primary)]/25 focus:border-[var(--tenant-primary)] hover:border-[var(--tenant-primary)]/40 transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-stone-200 dark:bg-zinc-700 text-stone-600 dark:text-zinc-300 flex items-center justify-center text-xs cursor-pointer hover:bg-stone-300 dark:hover:bg-zinc-600 transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Botón Disparador del Selector de Categorías (Estilo Brand Capsule con Elevación) */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex-1 group flex items-center justify-between p-1.5 pr-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-stone-300/90 dark:border-zinc-700 hover:border-[var(--tenant-primary)] dark:hover:border-[var(--tenant-primary)] shadow-xs transition-all cursor-pointer select-none active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Badge icónico con el color primario del comercio */}
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: 'var(--tenant-primary, #ea580c)',
                  color: 'var(--tenant-contrast, #ffffff)',
                }}
              >
                <LayoutGrid className="w-4 h-4" />
              </div>

              {/* Etiqueta y chip de categoría activa */}
              <div className="flex items-center gap-2 truncate">
                <span className="text-stone-500 dark:text-zinc-400 uppercase font-mono text-[10px] font-bold tracking-wider shrink-0 hidden sm:inline">
                  CATEGORÍAS:
                </span>
                <span 
                  className="px-2.5 py-1 rounded-lg text-xs font-black tracking-tight truncate border"
                  style={{
                    backgroundColor: 'var(--tenant-warm-tint, rgba(252,232,200,0.35))',
                    color: 'var(--tenant-brand-title, #4D2109)',
                    borderColor: 'var(--tenant-primary, #ea580c)33',
                  }}
                >
                  {isFavoritesOnly ? 'Solo Mis Favoritos' : selectedCategory === 'all' ? 'Todas las categorías' : selectedCategory}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span 
                className="text-[11px] font-mono font-black px-2 py-0.5 rounded-full border border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200"
              >
                {totalProducts}
              </span>
              <ChevronDown className="w-4 h-4 text-stone-400 group-hover:text-[var(--tenant-primary)] group-hover:translate-y-0.5 transition-all" />
            </div>
          </button>

          {/* Botón de Acceso Rápido a Favoritos en Barra */}
          <button
            type="button"
            onClick={() => setIsFavoritesOnly(!isFavoritesOnly)}
            className={`h-11 px-3 sm:px-3.5 rounded-2xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-[0.98] ${
              isFavoritesOnly
                ? 'bg-rose-500 text-white border-rose-500 ring-2 ring-rose-500/20'
                : 'bg-white dark:bg-zinc-900 border-stone-300/90 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:text-rose-500 hover:border-rose-300'
            }`}
            title="Filtrar por favoritos"
          >
            <Heart className={`w-3.5 h-3.5 ${isFavoritesOnly ? 'fill-white' : ''}`} />
            <span className="hidden sm:inline">Favoritos</span>
            <span className="font-mono text-[11px] font-black">{favoritesCount}</span>
          </button>
        </div>

        {/* Línea sutil de anclaje de marca */}
        <div 
          className="h-[2px] w-full -mb-3 opacity-70"
          style={{
            background: 'linear-gradient(90deg, var(--tenant-primary, #ea580c) 0%, var(--tenant-primary, #ea580c) 30%, transparent 90%)',
          }}
        />
      </div>

      {/* Grid de Productos (2 Columnas en móvil, 3 en tablet, 4 en desktop) */}
      <section className="space-y-6">
        {isFavoritesOnly && (
          <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
                <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
              </div>
              <div className="truncate">
                <p className="text-xs sm:text-sm font-extrabold tracking-tight">
                  Tus Productos Favoritos ({totalProducts})
                </p>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 truncate">
                  {totalProducts === 0 
                    ? 'No has marcado productos todavía' 
                    : 'Filtrando solo los productos que te gustan'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsFavoritesOnly(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-700 transition shrink-0 cursor-pointer shadow-2xs"
            >
              Ver Todo el Catálogo
            </button>
          </div>
        )}

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
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('all');
                    setIsFavoritesOnly(false);
                    setSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-xl tenant-primary-bg text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Restablecer Filtros
                </button>
                {isFavoritesOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      clearFavorites();
                      setIsFavoritesOnly(false);
                    }}
                    className="px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-bold transition cursor-pointer"
                  >
                    Vaciar lista de favoritos
                  </button>
                )}
              </div>
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

        {/* BARRA DE PAGINACIÓN RESPONSIVA (Alto Contraste Impeccable) */}
        {totalProducts > 0 && (
          <div className="mt-8 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#141416] border border-stone-300/90 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            {/* Selector de cantidad por página */}
            <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-between sm:justify-start">
              <span className="font-bold text-stone-700 dark:text-zinc-300">
                Mostrar:
              </span>
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-zinc-900 p-1 rounded-xl border border-stone-200 dark:border-zinc-800">
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
                        : 'text-stone-700 dark:text-zinc-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Contador de rango */}
            <div className="text-xs text-stone-700 dark:text-zinc-300 font-semibold text-center">
              Mostrando{' '}
              <span className="font-extrabold text-stone-950 dark:text-white">
                {(currentPage - 1) * pageSize + 1}
              </span>{' '}
              -{' '}
              <span className="font-extrabold text-stone-950 dark:text-white">
                {Math.min(currentPage * pageSize, totalProducts)}
              </span>{' '}
              de{' '}
              <span className="font-extrabold text-stone-950 dark:text-white">{totalProducts}</span> productos
            </div>

            {/* Botones de Navegación de Alto Contraste */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  const el = document.getElementById('catalog-filters-sticky');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={currentPage === 1}
                className="h-9 px-3.5 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-xs font-extrabold text-stone-950 dark:text-white shadow-2xs disabled:opacity-35 disabled:cursor-not-allowed disabled:bg-stone-100/60 dark:disabled:bg-zinc-900/60 disabled:border-stone-200 dark:disabled:border-zinc-800 transition flex items-center gap-1 cursor-pointer select-none"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                <span>Anterior</span>
              </button>

              <div className="px-3.5 py-1.5 rounded-xl bg-stone-100 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-xs font-mono font-black text-stone-950 dark:text-white min-w-[70px] text-center shadow-2xs">
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
                className="h-9 px-3.5 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-xs font-extrabold text-stone-950 dark:text-white shadow-2xs disabled:opacity-35 disabled:cursor-not-allowed disabled:bg-stone-100/60 dark:disabled:bg-zinc-900/60 disabled:border-stone-200 dark:disabled:border-zinc-800 transition flex items-center gap-1 cursor-pointer select-none"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
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
