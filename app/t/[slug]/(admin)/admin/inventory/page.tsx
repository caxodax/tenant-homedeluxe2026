'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Search,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  AlertTriangle,
  Package,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  price_usd: number | string;
  current_stock: number;
  min_stock_alert: number;
  is_active: boolean;
  category_name: string | null;
  image_url: string | null;
}

export default function InventoryPage() {
  const params = useParams() as { slug: string };
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  useEffect(() => {
    if (params?.slug) {
      fetchProducts();
    }
  }, [params?.slug]);

  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/${params.slug}/products`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      toast.error('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(productId: string, currentActive: boolean) {
    try {
      const res = await fetch(`/api/admin/${params.slug}/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });

      if (res.ok) {
        toast.success(`Producto ${!currentActive ? 'activado' : 'desactivado'}`);
        fetchProducts();
      } else {
        toast.error('Error al actualizar estado del producto');
      }
    } catch {
      toast.error('Error inesperado al conectar con el servidor');
    }
  }

  async function handleDelete(productId: string) {
    if (!confirm('¿Estás seguro de eliminar este producto del inventario?')) return;

    try {
      const res = await fetch(`/api/admin/${params.slug}/products/${productId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Producto desactivado del catálogo');
        fetchProducts();
      } else {
        toast.error('Error al eliminar producto');
      }
    } catch {
      toast.error('Error inesperado al eliminar producto');
    }
  }

  const columns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Producto',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center">
              {row.original.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.original.image_url}
                  alt={row.original.name}
                  className="object-cover w-full h-full"
                />
              ) : (
                <Package className="w-5 h-5 text-slate-400 dark:text-zinc-600" />
              )}
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
                {row.original.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {row.original.category_name || 'Sin categoría'}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ row }) => (
          <span className="text-xs font-mono text-slate-600 dark:text-zinc-400 font-semibold">
            {row.original.sku || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'price_usd',
        header: 'Precio (USD)',
        cell: ({ row }) => {
          const val = typeof row.original.price_usd === 'number'
            ? row.original.price_usd
            : parseFloat(row.original.price_usd || '0');
          return (
            <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
              ${val.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: 'current_stock',
        header: 'Stock',
        cell: ({ row }) => {
          const stock = Number(row.original.current_stock || 0);
          const min = Number(row.original.min_stock_alert || 0);
          const isLow = stock <= min && stock > 0;
          const isOut = stock === 0;

          return (
            <div className="flex items-center gap-2 font-mono">
              {isLow && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
              <span
                className={cn(
                  'text-sm font-extrabold',
                  isOut
                    ? 'text-red-600 dark:text-red-400'
                    : isLow
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-900 dark:text-white'
                )}
              >
                {stock}
              </span>
              <span className="text-xs text-slate-400 dark:text-zinc-600">/ {min}</span>
            </div>
          );
        },
        filterFn: (row, id, value) => {
          const stock = Number(row.original.current_stock || 0);
          const min = Number(row.original.min_stock_alert || 0);
          if (value === 'low') {
            return stock <= min && stock > 0;
          }
          if (value === 'out') {
            return stock === 0;
          }
          if (value === 'ok') {
            return stock > min;
          }
          return true;
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Estado',
        cell: ({ row }) => (
          <Badge
            className={cn(
              'border font-bold text-xs px-2.5 py-0.5',
              row.original.is_active
                ? 'bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-500/30'
                : 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20'
            )}
          >
            {row.original.is_active ? (
              <>
                <Eye className="w-3 h-3 mr-1" />
                Activo
              </>
            ) : (
              <>
                <EyeOff className="w-3 h-3 mr-1" />
                Inactivo
              </>
            )}
          </Badge>
        ),
        filterFn: (row, id, value) => {
          if (value === 'active') return row.original.is_active;
          if (value === 'inactive') return !row.original.is_active;
          return true;
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const product = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-white dark:bg-[#141416] border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 shadow-xl"
              >
                <DropdownMenuItem
                  onClick={() => router.push(`/t/${params.slug}/admin/inventory/${product.id}`)}
                  className="cursor-pointer font-medium"
                >
                  <Edit className="w-4 h-4 mr-2 text-slate-500 dark:text-zinc-400" />
                  Editar Producto
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleToggleActive(product.id, product.is_active)}
                  className="cursor-pointer font-medium"
                >
                  {product.is_active ? (
                    <>
                      <EyeOff className="w-4 h-4 mr-2 text-slate-500 dark:text-zinc-400" />
                      Desactivar
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2 text-lime-600 dark:text-lime-400" />
                      Activar
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDelete(product.id)}
                  className="text-red-600 dark:text-red-400 cursor-pointer font-medium focus:text-red-600 dark:focus:text-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar (Soft-delete)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [params.slug, router]
  );

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
    initialState: {
      pagination: { pageSize: 15 },
    },
  });

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-lime-600 dark:text-lime-400" />
        <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">Cargando inventario...</p>
      </div>
    );
  }

  const lowStockCount = products.filter(
    (p) => Number(p.current_stock || 0) <= Number(p.min_stock_alert || 0)
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Inventario & Catálogo
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            {products.length} productos registrados ·{' '}
            <span className={lowStockCount > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
              {lowStockCount} con alerta de stock bajo
            </span>
          </p>
        </div>
        <Button
          onClick={() => router.push(`/t/${params.slug}/admin/inventory/new`)}
          className="bg-lime-500 hover:bg-lime-600 text-black font-extrabold shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Producto
        </Button>
      </div>

      <div className="space-y-4">
        {/* Barra de Búsqueda y Filtros */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
            <Input
              placeholder="Buscar por nombre de producto..."
              value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
              onChange={(event) => table.getColumn('name')?.setFilterValue(event.target.value)}
              className="pl-10 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white rounded-xl text-xs h-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={(table.getColumn('current_stock')?.getFilterValue() as string) ?? ''}
              onChange={(event) => table.getColumn('current_stock')?.setFilterValue(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs text-slate-800 dark:text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="">Todo el stock</option>
              <option value="ok">Stock Normal</option>
              <option value="low">Stock Bajo</option>
              <option value="out">Agotados</option>
            </select>

            <select
              value={(table.getColumn('is_active')?.getFilterValue() as string) ?? ''}
              onChange={(event) => table.getColumn('is_active')?.setFilterValue(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs text-slate-800 dark:text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="">Todos los estados</option>
              <option value="active">Solo Activos</option>
              <option value="inactive">Solo Inactivos</option>
            </select>
          </div>
        </div>

        {/* Tabla TanStack */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214] overflow-hidden shadow-xs">
          <Table>
            <TableHeader className="bg-slate-50/80 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 py-3.5"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/40 border-b border-slate-100 dark:border-zinc-800/80 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-slate-500 dark:text-zinc-400 text-xs"
                  >
                    No se encontraron productos coincidentes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
            Página {table.getState().pagination.pageIndex + 1} de {Math.max(1, table.getPageCount())} (
            {table.getFilteredRowModel().rows.length} resultado{table.getFilteredRowModel().rows.length !== 1 ? 's' : ''})
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 text-xs h-8 cursor-pointer disabled:opacity-40"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 text-xs h-8 cursor-pointer disabled:opacity-40"
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
