'use client';

import { useState } from 'react';
import {
  Tag,
  Plus,
  Search,
  Edit2,
  Check,
  X,
  Loader2,
  Trash2,
  Package,
  Layers,
  Power,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
  created_at: string;
}

interface CategoriesClientViewProps {
  slug: string;
  initialCategories: CategoryData[];
}

export function CategoriesClientView({ slug, initialCategories }: CategoriesClientViewProps) {
  const [categories, setCategories] = useState<CategoryData[]>(initialCategories);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Estado para edición inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filtrado reactivo
  const filtered = categories.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
  });

  const activeCount = categories.filter((c) => c.is_active).length;
  const totalProducts = categories.reduce((acc, c) => acc + (c.product_count || 0), 0);

  // Crear categoría
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || isCreating) return;

    try {
      setIsCreating(true);
      const res = await fetch(`/api/admin/${slug}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear categoría');
      }

      toast.success(`Categoría "${data.category.name}" creada exitosamente`);
      setCategories((prev) => [
        ...prev,
        {
          ...data.category,
          product_count: 0,
        },
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear categoría';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  }

  // Renombrar categoría
  async function handleSaveEdit(catId: string) {
    const trimmed = editingName.trim();
    if (!trimmed || isUpdating) return;

    try {
      setIsUpdating(true);
      const res = await fetch(`/api/admin/${slug}/categories/${catId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar categoría');
      }

      toast.success('Categoría actualizada');
      setCategories((prev) =>
        prev.map((c) =>
          c.id === catId
            ? { ...c, name: data.category.name, slug: data.category.slug }
            : c
        )
      );
      setEditingId(null);
      setEditingName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar cambios';
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  }

  // Alternar estado activo / inactivo
  async function handleToggleActive(cat: CategoryData) {
    const nextState = !cat.is_active;
    setActionLoadingId(cat.id);

    try {
      const res = await fetch(`/api/admin/${slug}/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al cambiar estado');
      }

      toast.success(`Categoría ${nextState ? 'activada' : 'desactivada'}`);
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: nextState } : c))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar estado';
      toast.error(msg);
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-stone-200/80 dark:border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
              <Tag className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-stone-900 dark:text-white tracking-tight">
              Categorías de Productos
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Organiza tu catálogo para filtrar en Vitrina Digital y terminal de Caja.
          </p>
        </div>

        {/* Badges de Resumen */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-stone-900 dark:text-white">{activeCount}</span>
            <span className="text-stone-400 dark:text-zinc-500">activas</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-bold text-stone-900 dark:text-white">{totalProducts}</span>
            <span className="text-stone-400 dark:text-zinc-500">productos</span>
          </div>
        </div>
      </div>

      {/* Formulario Rápido de Creación */}
      <Card className="border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-r from-emerald-50/30 via-white to-white dark:from-emerald-950/20 dark:via-zinc-900 dark:to-zinc-900">
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Tag className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la nueva categoría (ej: Bebidas, Víveres, Panadería...)"
                className="pl-9 h-11 text-xs sm:text-sm rounded-xl font-medium bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800"
                disabled={isCreating}
              />
            </div>
            <Button
              type="submit"
              disabled={isCreating || !newName.trim()}
              className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 shadow-xs transition"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Crear Categoría
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Barra de Filtro / Búsqueda */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar categoría por nombre o slug..."
            className="pl-9 h-10 text-xs rounded-xl bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800"
          />
        </div>
        {search && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSearch('')}
            className="h-10 text-xs px-3 text-stone-500 hover:text-stone-900 dark:hover:text-white"
          >
            Limpiar filtro
          </Button>
        )}
      </div>

      {/* Lista de Categorías */}
      <Card>
        <CardHeader className="py-4 px-5 border-b border-stone-200/80 dark:border-zinc-800/80 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-stone-800 dark:text-zinc-200">
            Listado de Categorías ({filtered.length})
          </CardTitle>
          <Link
            href={`/t/${slug}/admin/inventory`}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Ir a Inventario</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-zinc-800 text-stone-400 flex items-center justify-center mx-auto mb-3">
                <Tag className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-stone-800 dark:text-zinc-200">
                {search ? 'Sin resultados para la búsqueda' : 'Aún no tienes categorías'}
              </h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {search
                  ? 'Prueba con otro término o limpia el buscador.'
                  : 'Crea tu primera categoría usando el campo de arriba para comenzar a estructurar tus productos.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200/80 dark:divide-zinc-800/80">
              {filtered.map((cat) => {
                const isEditingThis = editingId === cat.id;
                const isLoadingAction = actionLoadingId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={cn(
                      'p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors',
                      !cat.is_active
                        ? 'bg-stone-50/60 dark:bg-zinc-900/30 opacity-70'
                        : 'hover:bg-stone-50/50 dark:hover:bg-zinc-900/40'
                    )}
                  >
                    {/* Información Principal o Input de Edición */}
                    <div className="flex-1 min-w-0">
                      {isEditingThis ? (
                        <div className="flex items-center gap-2 max-w-md">
                          <Input
                            autoFocus
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(cat.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="h-9 text-xs rounded-lg"
                            disabled={isUpdating}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(cat.id)}
                            disabled={isUpdating || !editingName.trim()}
                            className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 rounded-lg"
                          >
                            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={isUpdating}
                            className="h-9 px-2 text-stone-500 shrink-0 rounded-lg"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-stone-900 dark:text-white">
                              {cat.name}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-stone-200 dark:border-zinc-700">
                              /{cat.slug}
                            </span>
                            {!cat.is_active && (
                              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                                Inactiva
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-stone-400 dark:text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              {cat.product_count} {cat.product_count === 1 ? 'producto vinculado' : 'productos vinculados'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {!isEditingThis && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(cat.id);
                            setEditingName(cat.name);
                          }}
                          className="h-8 px-2.5 text-xs text-stone-600 dark:text-zinc-300 hover:bg-stone-200/60 dark:hover:bg-zinc-800 rounded-lg font-medium"
                          title="Renombrar categoría"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Renombrar
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isLoadingAction}
                        onClick={() => handleToggleActive(cat)}
                        className={cn(
                          'h-8 px-2.5 text-xs rounded-lg font-medium transition',
                          cat.is_active
                            ? 'text-stone-600 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        )}
                        title={cat.is_active ? 'Desactivar de vitrina y caja' : 'Reactivar categoría'}
                      >
                        {isLoadingAction ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <Power className="w-3.5 h-3.5 mr-1" />
                        )}
                        {cat.is_active ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
