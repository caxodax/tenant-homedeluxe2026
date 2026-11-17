'use client';

import { useState } from 'react';
import {
  Tag,
  Plus,
  Search,
  Edit2,
  Trash2,
  Package,
  Power,
  ExternalLink,
  Loader2,
  X,
  AlertTriangle,
  ArrowUpDown,
  RotateCcw,
  Archive,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ModalPortal } from '@/components/ui/modal-portal';

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  deleted_at?: string | null;
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
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // Quick inline creation
  const [quickName, setQuickName] = useState('');
  const [isQuickCreating, setIsQuickCreating] = useState(false);

  // Modal Crear
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newModalName, setNewModalName] = useState('');
  const [newModalSortOrder, setNewModalSortOrder] = useState<number>(0);
  const [newModalIsActive, setNewModalIsActive] = useState(true);
  const [isCreatingModal, setIsCreatingModal] = useState(false);

  // Modal Editar
  const [editingCategory, setEditingCategory] = useState<CategoryData | null>(null);
  const [editName, setEditName] = useState('');
  const [editSortOrder, setEditSortOrder] = useState<number>(0);
  const [editIsActive, setEditIsActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Modal Eliminar Lógico (Archivar en Papelera)
  const [deletingCategory, setDeletingCategory] = useState<CategoryData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Loading individual para acciones (toggle o restaurar)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Categorías activas (no eliminadas) y archivadas (eliminadas lógicamente)
  const activeCategories = categories.filter((c) => !c.deleted_at);
  const archivedCategories = categories.filter((c) => !!c.deleted_at);

  // Lista visible según la pestaña activa
  const currentList = activeTab === 'active' ? activeCategories : archivedCategories;

  // Filtrado reactivo en la pestaña actual
  const filtered = currentList.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
  });

  const activeCount = activeCategories.filter((c) => c.is_active).length;
  const totalProducts = activeCategories.reduce((acc, c) => acc + (c.product_count || 0), 0);

  // 1. Crear categoría rápida (inline)
  async function handleQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = quickName.trim();
    if (!trimmed) {
      toast.info('Escribe el nombre de la categoría para continuar');
      return;
    }

    try {
      setIsQuickCreating(true);
      const res = await fetch(`/api/admin/${slug}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, sort_order: activeCategories.length }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear categoría');
      }

      toast.success(`Categoría "${data.category.name}" creada exitosamente`);
      setCategories((prev) =>
        [
          ...prev,
          {
            ...data.category,
            deleted_at: null,
            product_count: 0,
          },
        ].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      );
      setQuickName('');
      setActiveTab('active');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear categoría';
      toast.error(msg);
    } finally {
      setIsQuickCreating(false);
    }
  }

  // 2. Crear categoría desde modal
  async function handleModalCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newModalName.trim();
    if (!trimmed) {
      toast.error('El nombre de la categoría es obligatorio');
      return;
    }

    try {
      setIsCreatingModal(true);
      const res = await fetch(`/api/admin/${slug}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          sort_order: Number(newModalSortOrder) || 0,
          is_active: newModalIsActive,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear categoría');
      }

      toast.success(`Categoría "${data.category.name}" creada exitosamente`);
      setCategories((prev) =>
        [
          ...prev,
          {
            ...data.category,
            deleted_at: null,
            product_count: 0,
          },
        ].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      );

      setIsCreateModalOpen(false);
      setNewModalName('');
      setNewModalSortOrder(0);
      setNewModalIsActive(true);
      setActiveTab('active');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear categoría';
      toast.error(msg);
    } finally {
      setIsCreatingModal(false);
    }
  }

  // 3. Abrir modal de edición
  function handleOpenEdit(cat: CategoryData) {
    setEditingCategory(cat);
    setEditName(cat.name);
    setEditSortOrder(cat.sort_order ?? 0);
    setEditIsActive(cat.is_active);
  }

  // 4. Guardar edición
  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('El nombre no puede estar vacío');
      return;
    }

    try {
      setIsUpdating(true);
      const res = await fetch(`/api/admin/${slug}/categories/${editingCategory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          sort_order: Number(editSortOrder) || 0,
          is_active: editIsActive,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar categoría');
      }

      toast.success('Categoría actualizada');
      setCategories((prev) =>
        prev
          .map((c) =>
            c.id === editingCategory.id
              ? {
                  ...c,
                  name: data.category.name,
                  slug: data.category.slug,
                  sort_order: data.category.sort_order,
                  is_active: data.category.is_active,
                }
              : c
          )
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      );
      setEditingCategory(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar cambios';
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  }

  // 5. Alternar estado operativo activo / inactivo
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

      toast.success(`Categoría ${nextState ? 'activada en vitrina y POS' : 'pausada / desactivada'}`);
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

  // 6. Eliminación lógica canónica (Soft-delete -> deleted_at = now())
  async function handleConfirmDelete() {
    if (!deletingCategory) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/admin/${slug}/categories/${deletingCategory.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al archivar categoría');
      }

      toast.success(`Categoría "${deletingCategory.name}" movida a la papelera`);
      const nowIso = new Date().toISOString();
      setCategories((prev) =>
        prev.map((c) => (c.id === deletingCategory.id ? { ...c, deleted_at: nowIso, is_active: false } : c))
      );
      setDeletingCategory(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al archivar categoría';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }

  // 7. Restaurar categoría archivada
  async function handleRestoreCategory(cat: CategoryData) {
    setActionLoadingId(cat.id);

    try {
      const res = await fetch(`/api/admin/${slug}/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al restaurar categoría');
      }

      toast.success(`Categoría "${cat.name}" restaurada con éxito`);
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, deleted_at: null, is_active: true } : c))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al restaurar categoría';
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

        {/* Acciones de Cabecera y Resumen */}
        <div className="flex items-center gap-2.5 flex-wrap">
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

          <Button
            type="button"
            onClick={() => {
              setNewModalName('');
              setNewModalSortOrder(activeCategories.length);
              setNewModalIsActive(true);
              setIsCreateModalOpen(true);
            }}
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm hover:shadow transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Categoría</span>
          </Button>
        </div>
      </div>

      {/* Formulario Rápido de Creación (Solo en vista activa) */}
      {activeTab === 'active' && (
        <Card className="border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-r from-emerald-50/40 via-white to-white dark:from-emerald-950/20 dark:via-zinc-900 dark:to-zinc-900">
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleQuickCreate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Tag className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <Input
                  type="text"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="Creación rápida: escribe el nombre (ej: Bebidas, Víveres, Panadería...)"
                  className="pl-9.5 h-11 text-xs sm:text-sm rounded-xl font-medium bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 focus-visible:ring-emerald-500"
                  disabled={isQuickCreating}
                />
              </div>
              <Button
                type="submit"
                disabled={isQuickCreating}
                className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 shadow-xs transition cursor-pointer"
              >
                {isQuickCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1.5" />
                    Crear Rápido
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Selector de Pestañas: Catálogo Activo vs Papelera / Archivadas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 border-b sm:border-b-0 border-stone-200 dark:border-zinc-800 pb-2 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={cn(
              'px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer',
              activeTab === 'active'
                ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-sm'
                : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800'
            )}
          >
            <span>Catálogo Activo</span>
            <Badge
              variant="neutral"
              className={cn(
                'text-[10px] px-1.5 py-0.2',
                activeTab === 'active'
                  ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-stone-200 dark:bg-zinc-800'
              )}
            >
              {activeCategories.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={cn(
              'px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer',
              activeTab === 'archived'
                ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-sm'
                : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800'
            )}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Papelera / Archivadas</span>
            {archivedCategories.length > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0.2 border-amber-300 dark:border-amber-800 text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                )}
              >
                {archivedCategories.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Barra de Búsqueda */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoría..."
              className="pl-9 h-9.5 text-xs rounded-xl bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800"
            />
          </div>
          {search && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSearch('')}
              className="h-9.5 text-xs px-2.5 text-stone-500 hover:text-stone-900 dark:hover:text-white"
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Lista de Categorías */}
      <Card>
        <CardHeader className="py-4 px-5 border-b border-stone-200/80 dark:border-zinc-800/80 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-stone-800 dark:text-zinc-200">
            {activeTab === 'active'
              ? `Listado del Catálogo (${filtered.length})`
              : `Categorías Archivadas / Papelera (${filtered.length})`}
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
                {activeTab === 'active' ? <Tag className="w-6 h-6" /> : <Archive className="w-6 h-6" />}
              </div>
              <h3 className="text-sm font-bold text-stone-800 dark:text-zinc-200">
                {search
                  ? 'Sin resultados para la búsqueda'
                  : activeTab === 'active'
                  ? 'Aún no tienes categorías'
                  : 'La papelera está vacía'}
              </h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {search
                  ? 'Prueba con otro término o limpia el buscador.'
                  : activeTab === 'active'
                  ? 'Crea tu primera categoría con el botón "+ Nueva Categoría" o con el campo rápido de arriba.'
                  : 'Las categorías que elimines lógicamente aparecerán aquí para auditoría y restauración.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-200/80 dark:divide-zinc-800/80">
              {filtered.map((cat) => {
                const isLoadingAction = actionLoadingId === cat.id;
                const isArchived = !!cat.deleted_at;

                return (
                  <div
                    key={cat.id}
                    className={cn(
                      'p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors',
                      isArchived
                        ? 'bg-rose-50/20 dark:bg-rose-950/10'
                        : !cat.is_active
                        ? 'bg-stone-50/60 dark:bg-zinc-900/30 opacity-75'
                        : 'hover:bg-stone-50/50 dark:hover:bg-zinc-900/40'
                    )}
                  >
                    {/* Información Principal */}
                    <div className="flex-1 min-w-0">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              'font-bold text-sm',
                              isArchived
                                ? 'text-stone-500 dark:text-zinc-400 line-through'
                                : 'text-stone-900 dark:text-white'
                            )}
                          >
                            {cat.name}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-stone-200 dark:border-zinc-700">
                            /{cat.slug}
                          </span>
                          {cat.sort_order !== undefined && !isArchived && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40 font-mono">
                              #{cat.sort_order}
                            </span>
                          )}

                          {isArchived ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-rose-600 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"
                            >
                              En Papelera (Archivada)
                            </Badge>
                          ) : !cat.is_active ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
                            >
                              Pausada
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
                            >
                              Activa
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-stone-400 dark:text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {cat.product_count} {cat.product_count === 1 ? 'producto vinculado' : 'productos vinculados'}
                          </span>
                          {isArchived && cat.deleted_at && (
                            <span className="text-stone-400 dark:text-zinc-500 italic">
                              Archivada el {new Date(cat.deleted_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                      {isArchived ? (
                        /* Botón Restaurar desde papelera */
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isLoadingAction}
                          onClick={() => handleRestoreCategory(cat)}
                          className="h-8 px-3 text-xs border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg font-bold cursor-pointer transition flex items-center gap-1.5"
                          title="Restaurar categoría al catálogo activo"
                        >
                          {isLoadingAction ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          <span>Restaurar</span>
                        </Button>
                      ) : (
                        /* Acciones Catálogo Activo */
                        <>
                          {/* Editar */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(cat)}
                            className="h-8 px-2.5 text-xs text-stone-700 dark:text-zinc-300 hover:bg-stone-200/60 dark:hover:bg-zinc-800 rounded-lg font-medium cursor-pointer"
                            title="Editar nombre, orden y estado"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1 text-stone-500" />
                            Editar
                          </Button>

                          {/* Alternar Activo/Pausado */}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isLoadingAction}
                            onClick={() => handleToggleActive(cat)}
                            className={cn(
                              'h-8 px-2.5 text-xs rounded-lg font-medium transition cursor-pointer',
                              cat.is_active
                                ? 'text-stone-700 dark:text-zinc-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold'
                            )}
                            title={cat.is_active ? 'Pausar visibilidad en vitrina y caja' : 'Reactivar en vitrina y caja'}
                          >
                            {isLoadingAction ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                              <Power className="w-3.5 h-3.5 mr-1" />
                            )}
                            {cat.is_active ? 'Pausar' : 'Activar'}
                          </Button>

                          {/* Eliminar Lógico (Papelera) */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeletingCategory(cat)}
                            className="h-8 px-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg font-medium cursor-pointer"
                            title="Mover a la papelera (eliminación lógica)"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Papelera
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* MODAL 1: NUEVA CATEGORÍA                                                   */}
      {/* ========================================================================= */}
      <ModalPortal
        isOpen={isCreateModalOpen}
        onClose={() => !isCreatingModal && setIsCreateModalOpen(false)}
        backdropClassName="bg-black/70 backdrop-blur-xs"
        containerClassName="p-4 items-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-stone-900 dark:text-white leading-tight">
                    Nueva Categoría
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-zinc-400">
                    Estructura tu catálogo para navegación web y caja
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreatingModal}
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalCreate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                  Nombre de la Categoría *
                </label>
                <Input
                  autoFocus
                  type="text"
                  value={newModalName}
                  onChange={(e) => setNewModalName(e.target.value)}
                  placeholder="Ej: Víveres, Bebidas, Lácteos, Limpieza..."
                  className="h-10 text-xs sm:text-sm rounded-xl font-medium"
                  disabled={isCreatingModal}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                  Orden de Visualización
                </label>
                <div className="relative">
                  <ArrowUpDown className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    value={newModalSortOrder}
                    onChange={(e) => setNewModalSortOrder(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="pl-9 h-10 text-xs rounded-xl"
                    disabled={isCreatingModal}
                  />
                </div>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 mt-1">
                  Menor número aparece primero en el menú y filtros.
                </p>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="new_category_active"
                  checked={newModalIsActive}
                  onChange={(e) => setNewModalIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  disabled={isCreatingModal}
                />
                <label
                  htmlFor="new_category_active"
                  className="text-xs font-medium text-stone-700 dark:text-zinc-300 cursor-pointer"
                >
                  Visible y activa en el catálogo y POS
                </label>
              </div>

              <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isCreatingModal}
                  className="h-10 text-xs px-4 rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingModal || !newModalName.trim()}
                  className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  {isCreatingModal ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Categoría'
                  )}
                </Button>
              </div>
            </form>
          </div>
      </ModalPortal>

      {/* ========================================================================= */}
      {/* MODAL 2: EDITAR CATEGORÍA                                                 */}
      {/* ========================================================================= */}
      <ModalPortal
        isOpen={!!editingCategory}
        onClose={() => !isUpdating && setEditingCategory(null)}
        backdropClassName="bg-black/70 backdrop-blur-xs"
        containerClassName="p-4 items-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-stone-900 dark:text-white leading-tight">
                    Editar Categoría
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-zinc-400">
                    Modifica el nombre, orden o estado
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                disabled={isUpdating}
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                  Nombre de la Categoría *
                </label>
                <Input
                  autoFocus
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 text-xs sm:text-sm rounded-xl font-medium"
                  disabled={isUpdating}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                  Slug / Identificador URL
                </label>
                <div className="h-9 px-3 rounded-xl bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 text-xs font-mono flex items-center text-stone-500 dark:text-zinc-400">
                  /{editingCategory?.slug}
                </div>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 mt-1">
                  Se actualiza automáticamente al cambiar el nombre.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                  Orden de Visualización
                </label>
                <div className="relative">
                  <ArrowUpDown className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(parseInt(e.target.value) || 0)}
                    className="pl-9 h-10 text-xs rounded-xl"
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_category_active"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  disabled={isUpdating}
                />
                <label
                  htmlFor="edit_category_active"
                  className="text-xs font-medium text-stone-700 dark:text-zinc-300 cursor-pointer"
                >
                  Categoría activa (visible en Vitrina y POS)
                </label>
              </div>

              <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingCategory(null)}
                  disabled={isUpdating}
                  className="h-10 text-xs px-4 rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isUpdating || !editName.trim()}
                  className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      Guardando...
                    </>
                  ) : (
                    'Guardar Cambios'
                  )}
                </Button>
              </div>
            </form>
          </div>
      </ModalPortal>

      {/* ========================================================================= */}
      {/* MODAL 3: ELIMINAR LÓGICAMENTE (MOVER A PAPELERA / SOFT-DELETE)           */}
      {/* ========================================================================= */}
      <ModalPortal
        isOpen={!!deletingCategory}
        onClose={() => !isDeleting && setDeletingCategory(null)}
        backdropClassName="bg-black/70 backdrop-blur-xs"
        containerClassName="p-4 items-center"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#121214] border border-amber-200 dark:border-amber-950/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Archive className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-base text-stone-900 dark:text-white">
                ¿Mover categoría a la papelera?
              </h3>
              <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                Estás a punto de archivar la categoría{' '}
                <strong className="text-stone-900 dark:text-white font-bold">
                  &quot;{deletingCategory?.name}&quot;
                </strong>
                .
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 text-xs text-stone-700 dark:text-zinc-300 space-y-2">
            <p className="flex items-center gap-1.5 font-bold text-stone-800 dark:text-zinc-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              Eliminación Lógica Protegida (Soft-Delete)
            </p>
            <p className="text-[11px] leading-relaxed text-stone-500 dark:text-zinc-400">
              La categoría dejará de mostrarse en la vitrina web y en caja. Ningún dato ni producto se eliminará de la base de datos, y podrás restaurarla cuando lo desees desde la pestaña &quot;Papelera / Archivadas&quot;.
            </p>
            {deletingCategory && deletingCategory.product_count > 0 && (
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {deletingCategory.product_count} producto(s) vinculado(s) conservan su referencia.
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeletingCategory(null)}
              disabled={isDeleting}
              className="h-10 text-xs px-4 rounded-xl cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="h-10 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  Archivando...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4" />
                  <span>Mover a Papelera</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </ModalPortal>
    </div>
  );
}
