'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Plus, Loader2, Tag, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface CategoryOption {
  id: string;
  name: string;
  slug?: string;
  is_active?: boolean;
}

interface CategoryComboboxProps {
  slug: string;
  value?: string | null;
  onChange: (value: string | undefined) => void;
  categories?: CategoryOption[];
  onCategoryCreated?: (category: CategoryOption) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function CategoryCombobox({
  slug,
  value,
  onChange,
  categories: initialCategories,
  onCategoryCreated,
  className,
  disabled = false,
  placeholder = 'Seleccionar o crear categoría',
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<CategoryOption[]>(initialCategories || []);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cargar categorías si no se pasaron por props
  useEffect(() => {
    if (initialCategories && initialCategories.length > 0) {
      setCategories(initialCategories);
    } else {
      fetchCategories();
    }
  }, [initialCategories, slug]);

  async function fetchCategories() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/${slug}/categories?active_only=true`);
      const data = await res.json();
      if (data.categories) {
        setCategories(data.categories);
      }
    } catch {
      // Silenciar error en background
    } finally {
      setLoading(false);
    }
  }

  // Cerrar al hacer clic fuera o presionar Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => inputRef.current?.focus(), 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectedCategory = categories.find((c) => c.id === value);

  // Filtrado insensible a mayúsculas y acentos
  const normalize = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const query = normalize(search);
  const filteredCategories = categories.filter((c) =>
    normalize(c.name).includes(query)
  );

  const exactMatch = categories.some((c) => normalize(c.name) === query);
  const canCreate = search.trim().length >= 2 && !exactMatch;

  async function handleCreateCategory() {
    const trimmed = search.trim();
    if (!trimmed || creating) return;

    try {
      setCreating(true);
      const res = await fetch(`/api/admin/${slug}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear la categoría');
      }

      const newCat: CategoryOption = data.category;
      toast.success(`Categoría "${newCat.name}" creada`);

      // Actualizar estado local
      const updatedList = [...categories, newCat].sort((a, b) => a.name.localeCompare(b.name));
      setCategories(updatedList);
      onCategoryCreated?.(newCat);
      onChange(newCat.id);
      setSearch('');
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al registrar categoría';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Botón Trigger del Combobox */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-stone-900 dark:text-zinc-100 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all text-left',
          className
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Tag className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          {selectedCategory ? (
            <span className="font-semibold text-stone-900 dark:text-white truncate">
              {selectedCategory.name}
            </span>
          ) : (
            <span className="text-stone-400 dark:text-zinc-500 truncate">{placeholder}</span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="p-0.5 rounded hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200 transition"
              title="Quitar categoría"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 opacity-50 text-stone-400" />
        </div>
      </button>

      {/* Popover Desplegable */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Input de Búsqueda / Creación */}
          <div className="p-2 border-b border-stone-100 dark:border-zinc-800/80 bg-stone-50/50 dark:bg-zinc-900/50">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (canCreate) {
                      handleCreateCategory();
                    } else if (filteredCategories.length === 1) {
                      onChange(filteredCategories[0].id);
                      setOpen(false);
                    }
                  }
                }}
                placeholder="Buscar o escribir nombre..."
                className="w-full text-xs bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700/80 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-zinc-500 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista de Categorías */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-stone-100/50 dark:divide-zinc-800/50 text-xs">
            {/* Opción Sin Categoría */}
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition font-medium',
                !value
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold'
                  : 'text-stone-500 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800/60'
              )}
            >
              <span>(Sin categoría asignada)</span>
              {!value && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-4 text-stone-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span>Cargando categorías...</span>
              </div>
            ) : filteredCategories.length === 0 && !canCreate ? (
              <div className="py-4 text-center text-stone-400 dark:text-zinc-500 text-[11px]">
                No hay categorías registradas. Escribe un nombre arriba para crear una.
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = cat.id === value;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      onChange(cat.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition',
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold'
                        : 'text-stone-800 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800/60'
                    )}
                  >
                    <span className="truncate">{cat.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 ml-2" />}
                  </button>
                );
              })
            )}

            {/* Opción Crear Nueva Categoría al Vuelo */}
            {canCreate && (
              <button
                type="button"
                disabled={creating}
                onClick={handleCreateCategory}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition font-bold mt-1 border border-dashed border-emerald-300 dark:border-emerald-800/60"
              >
                {creating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="truncate">
                  Crear categoría &ldquo;<strong>{search.trim()}</strong>&rdquo;
                </span>
              </button>
            )}
          </div>

          {/* Footer de Enlace a Gestión Completa */}
          <div className="p-2 border-t border-stone-100 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-900/80 flex items-center justify-between text-[11px]">
            <span className="text-stone-400 dark:text-zinc-500 font-medium">
              {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
            </span>
            <Link
              href={`/t/${slug}/admin/categories`}
              target="_blank"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
            >
              <span>Gestionar categorías</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
