'use client';

import { useState, useMemo } from 'react';
import { ProductCard, StorefrontProduct } from './product-card';
import { Search, PackageX, Sparkles, ChevronDown, Layers } from 'lucide-react';

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
}

export function StorefrontCatalog({
  products,
  categories,
  businessName,
  logoUrl,
  bannerUrl,
  exchangeRate,
  primaryCurrency = 'USD',
}: StorefrontCatalogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtrado reactivo en cliente (instantáneo, <1ms)
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === 'all' || product.category_name === selectedCategory;

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.sku && product.sku.toLowerCase().includes(query));

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero Banner de la Vitrina con Identidad Completa (3 Colores + Logo/Banner) */}
      <section className="relative rounded-3xl overflow-hidden tenant-secondary-surface border-b-4 border-lime-500 p-6 sm:p-10 shadow-md">
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt={`Banner de ${businessName}`}
            className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
          />
        )}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-lime-500 shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Retiro inmediato en mostrador (Pick-up)</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
              Catálogo Online de <span className="text-lime-400">{businessName}</span>
            </h1>

            <p className="text-sm sm:text-base tenant-secondary-muted font-medium leading-relaxed">
              Explora nuestros productos con inventario y precios actualizados en tiempo real. 
              Arma tu carrito y retira en tienda física sin filas.
            </p>
          </div>

          {logoUrl && (
            <div className="hidden md:flex w-28 h-28 rounded-3xl bg-white p-3 items-center justify-center shrink-0 shadow-lg border-2 border-lime-500/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={businessName} className="w-full h-full object-contain" />
            </div>
          )}
        </div>
      </section>

      {/* Barra de Filtros: Categorías y Búsqueda */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* MÓVIL: Combobox / Selector de Categorías (Óptimo para pantallas táctiles) */}
          <div className="sm:hidden w-full relative">
            <div className="relative flex items-center">
              <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-lime-600 dark:text-lime-400 pointer-events-none" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white font-extrabold text-xs shadow-xs focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 appearance-none cursor-pointer"
              >
                <option value="all">Todas las Categorías ({products.length} productos)</option>
                {categories.map((cat) => {
                  const count = products.filter((p) => p.category_name === cat.name).length;
                  return (
                    <option key={cat.id} value={cat.name}>
                      {cat.name} ({count})
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            </div>
          </div>

          {/* DESKTOP / TABLET: Chips horizontales para pantallas amplias */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-lime-500 text-black shadow-sm ring-1 ring-lime-600/30'
                  : 'bg-white hover:bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-zinc-200'
              }`}
            >
              Todos ({products.length})
            </button>

            {categories.map((cat) => {
              const count = products.filter((p) => p.category_name === cat.name).length;
              const isSelected = selectedCategory === cat.name;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-lime-500 text-black shadow-sm ring-1 ring-lime-600/30'
                      : 'bg-white hover:bg-slate-100 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-zinc-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Buscador reactivo (Adaptable tanto a móvil como desktop) */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar producto o SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 text-xs font-medium text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 transition-all shadow-xs"
            />
          </div>
        </div>
      </section>

      {/* Grid de Productos */}
      <section>
        {filteredProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-zinc-800 p-10 sm:p-12 text-center bg-white/70 dark:bg-zinc-900/30">
            <PackageX className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-200">
              No se encontraron productos
            </h3>
            <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
              No hay artículos que coincidan con tu criterio de búsqueda o categoría seleccionada.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 transition"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-6">
            {filteredProducts.map((product, idx) => (
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
      </section>
    </div>
  );
}
