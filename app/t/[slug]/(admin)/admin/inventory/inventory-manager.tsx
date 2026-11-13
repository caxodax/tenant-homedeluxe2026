'use client';

import { useState, useTransition } from 'react';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  UploadCloud,
  Check,
  AlertTriangle,
  X,
  Loader2,
  DollarSign,
  Barcode,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadTenantMedia } from '@/lib/media-client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { createProduct, updateProduct, deleteProduct, ProductInput } from '@/app/actions/tenant/products';
import { cn } from '@/lib/utils';

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  current_stock: string;
  min_stock_alert: string;
  price_usd: string;
  category_id?: string | null;
  category_name?: string | null;
  image_url?: string | null;
  is_active: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
}

interface InventoryManagerProps {
  slug: string;
  initialProducts: ProductItem[];
  categories: CategoryItem[];
}

export function InventoryManager({ slug, initialProducts, categories }: InventoryManagerProps) {
  const [products, setProducts] = useState<ProductItem[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [priceUsd, setPriceUsd] = useState('');
  const [currentStock, setCurrentStock] = useState('10');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Filtrado reactivo en cliente
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  function openCreateModal() {
    setEditingProduct(null);
    setName('');
    setSku(`PROD-${Math.floor(100 + Math.random() * 900)}`);
    setBarcode('');
    setCategoryId(categories[0]?.id || '');
    setDescription('');
    setPriceUsd('1.00');
    setCurrentStock('10');
    setMinStockAlert('5');
    setImageUrl('');
    setIsModalOpen(true);
  }

  function openEditModal(prod: ProductItem) {
    setEditingProduct(prod);
    setName(prod.name);
    setSku(prod.sku || '');
    setBarcode(prod.barcode || '');
    setCategoryId(prod.category_id || '');
    setDescription(prod.description || '');
    setPriceUsd(parseFloat(prod.price_usd).toFixed(2));
    setCurrentStock(parseFloat(prod.current_stock).toString());
    setMinStockAlert(parseFloat(prod.min_stock_alert).toString());
    setImageUrl(prod.image_url || '');
    setIsModalOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const data = await uploadTenantMedia(file, slug, 'products');
      setImageUrl(data.url);
      toast.success('Imagen subida con éxito a Cloudflare R2', {
        description: data.filename,
      });
    } catch (err) {
      toast.error('Error al subir la imagen', {
        description: err instanceof Error ? err.message : 'Verifica los formatos permitidos.',
      });
    } finally {
      setIsUploading(false);
    }
  }

  function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sku.trim() || !priceUsd) {
      toast.error('Por favor completa todos los campos requeridos');
      return;
    }

    const payload: ProductInput = {
      name: name.trim(),
      sku: sku.trim(),
      barcode: barcode.trim() || null,
      category_id: categoryId || null,
      description: description.trim() || null,
      price_usd: parseFloat(priceUsd),
      current_stock: parseFloat(currentStock),
      min_stock_alert: parseFloat(minStockAlert),
      image_url: imageUrl.trim() || null,
    };

    startTransition(async () => {
      if (editingProduct) {
        // Actualizar
        const res = await updateProduct(slug, editingProduct.id, payload);
        if (res.success) {
          toast.success('Producto actualizado correctamente');
          setProducts((prev) =>
            prev.map((p) =>
              p.id === editingProduct.id
                ? {
                    ...p,
                    ...payload,
                    barcode: payload.barcode || null,
                    description: payload.description || null,
                    category_id: payload.category_id || null,
                    image_url: payload.image_url || null,
                    current_stock: payload.current_stock.toString(),
                    price_usd: payload.price_usd.toString(),
                    min_stock_alert: payload.min_stock_alert.toString(),
                  }
                : p
            )
          );
          setIsModalOpen(false);
        } else {
          toast.error(res.error || 'Error al actualizar producto');
        }
      } else {
        // Crear
        const res = await createProduct(slug, payload);
        if (res.success && res.product) {
          toast.success('Producto creado exitosamente');
          setProducts((prev) => [
            {
              id: res.product.id,
              name: res.product.name,
              sku: res.product.sku,
              barcode: payload.barcode || null,
              description: payload.description || null,
              category_id: payload.category_id || null,
              current_stock: res.product.current_stock.toString(),
              min_stock_alert: payload.min_stock_alert.toString(),
              price_usd: res.product.price_usd.toString(),
              image_url: res.product.image_url,
              is_active: true,
            },
            ...prev,
          ]);
          setIsModalOpen(false);
        } else {
          toast.error(res.error || 'Error al crear producto');
        }
      }
    });
  }

  async function handleDeleteProduct(id: string, prodName: string) {
    if (!confirm(`¿Estás seguro de que deseas desactivar "${prodName}" del catálogo?`)) {
      return;
    }

    setIsDeleting(id);
    const res = await deleteProduct(slug, id);
    setIsDeleting(null);

    if (res.success) {
      toast.success(`"${prodName}" desactivado`);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } else {
      toast.error(res.error || 'Error al desactivar producto');
    }
  }

  return (
    <div className="space-y-6">
      {/* Barra Superior con Botón Nuevo Producto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Inventario de Productos
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs mt-1">
            {products.length} productos registrados · Control de stock y sincronización multi-sucursal.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="h-10 px-4 rounded-xl font-extrabold text-xs bg-lime-500 hover:bg-lime-600 text-black shadow-sm gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Producto</span>
        </Button>
      </div>

      {/* Buscador reactivo */}
      <div className="relative max-w-md w-full">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
        <Input
          placeholder="Buscar por nombre, código de barra o SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 text-xs h-10 rounded-xl bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
        />
      </div>

      {/* VISTA MÓVIL (< sm): Tarjetas para pantallas táctiles */}
      <div className="sm:hidden space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214] p-8 text-center text-xs text-slate-500">
            No se encontraron productos.
          </div>
        ) : (
          filteredProducts.map((product) => {
            const currentStock = parseFloat(product.current_stock || '0');
            const minStock = parseFloat(product.min_stock_alert || '5');
            const isLowStock = currentStock <= minStock && currentStock > 0;
            const isOutOfStock = currentStock <= 0;

            return (
              <div
                key={product.id}
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214] p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-zinc-800/80 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200/80 dark:border-zinc-700/60">
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Package className="w-5 h-5 text-slate-400 dark:text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                      SKU: {product.sku || '-'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-zinc-850">
                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400 dark:text-zinc-500 block">
                      Precio USD
                    </span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-white text-sm">
                      ${parseFloat(product.price_usd).toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-400 dark:text-zinc-500 block">
                      Stock Actual
                    </span>
                    <span
                      className={cn(
                        'font-mono font-extrabold text-sm',
                        isOutOfStock
                          ? 'text-rose-600'
                          : isLowStock
                          ? 'text-amber-600'
                          : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {currentStock} uds
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-zinc-850 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditModal(product)}
                    className="flex-1 text-xs h-9 font-bold"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isDeleting === product.id}
                    onClick={() => handleDeleteProduct(product.id, product.name)}
                    className="text-xs h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* VISTA ESCRITORIO / TABLET (>= sm): Tabla */}
      <div className="hidden sm:block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214] overflow-hidden shadow-xs">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400">
            <tr>
              <th className="text-left text-xs font-bold uppercase tracking-wider px-4 py-3.5">Producto</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider px-4 py-3.5">SKU / Barcode</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider px-4 py-3.5">Precio USD</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider px-4 py-3.5">Stock Real</th>
              <th className="text-left text-xs font-bold uppercase tracking-wider px-4 py-3.5">Estado</th>
              <th className="text-right text-xs font-bold uppercase tracking-wider px-4 py-3.5">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-500 text-xs">
                  No se encontraron productos registrados con los filtros aplicados.
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => {
                const currentStock = parseFloat(product.current_stock || '0');
                const minStock = parseFloat(product.min_stock_alert || '5');
                const isLowStock = currentStock <= minStock && currentStock > 0;
                const isOutOfStock = currentStock <= 0;

                return (
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800/80 overflow-hidden flex items-center justify-center shrink-0 border border-slate-200/80 dark:border-zinc-700/60">
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <Package className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
                          )}
                        </div>
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                          {product.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-zinc-400 font-mono">
                      <div>{product.sku || '-'}</div>
                      {product.barcode && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Barcode className="w-3 h-3" />
                          {product.barcode}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-bold text-slate-900 dark:text-white">
                      ${parseFloat(product.price_usd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-xs">
                        {isLowStock && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        <span
                          className={cn(
                            isOutOfStock
                              ? 'text-rose-600'
                              : isLowStock
                              ? 'text-amber-600'
                              : 'text-emerald-600 dark:text-emerald-400'
                          )}
                        >
                          {currentStock} uds
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isOutOfStock ? (
                        <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold">
                          Agotado
                        </Badge>
                      ) : isLowStock ? (
                        <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                          Bajo Stock
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                          Disponible
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(product)}
                          className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          title="Editar producto"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isDeleting === product.id}
                          onClick={() => handleDeleteProduct(product.id, product.name)}
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                          title="Desactivar producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Crear / Editar Producto */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 my-8"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-lime-500/10 border border-lime-500/30 flex items-center justify-center text-lime-600 dark:text-lime-400">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">
                    {editingProduct ? 'Editar Producto' : 'Crear Nuevo Producto'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Catálogo maestro en USD con sincronización Cloudflare R2
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* Sección de Imagen Cloudflare R2 */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-3">
                <label className="text-xs font-extrabold text-slate-700 dark:text-zinc-300 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                  Fotografía del Producto (Cloudflare R2)
                </label>

                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-800 border-2 border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-slate-300 dark:text-zinc-600" />
                    )}

                    {isUploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold text-xs cursor-pointer transition shadow-xs">
                      <UploadCloud className="w-4 h-4" />
                      <span>{isUploading ? 'Subiendo a R2...' : 'Seleccionar Archivo...'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={isUploading}
                        onChange={handleImageUpload}
                      />
                    </label>
                    <p className="text-[10px] text-slate-500 dark:text-zinc-400">
                      Soporta JPG, PNG o WebP. Se almacena en bucket Cloudflare R2 sin costo de egress.
                    </p>
                  </div>
                </div>
              </div>

              {/* Datos Generales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Nombre del Producto *
                  </label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Arroz Blanco Grano Entero 1kg"
                    className="text-xs h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Código SKU *
                  </label>
                  <Input
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ej. ARR-001"
                    className="text-xs h-10 rounded-xl font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Código de Barras (Barcode)
                  </label>
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Ej. 7591001234567"
                    className="text-xs h-10 rounded-xl font-mono"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Categoría
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-900 dark:text-zinc-100"
                  >
                    <option value="">Sin Categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Precio Maestro USD ($) *
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(e.target.value)}
                    placeholder="1.50"
                    className="text-xs h-10 rounded-xl font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Stock en Sede Principal *
                  </label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value)}
                    placeholder="10"
                    className="text-xs h-10 rounded-xl font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Descripción / Detalles
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descripción visible en la vitrina digital..."
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                  />
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-zinc-800 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="text-xs h-10 px-4 font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || isUploading}
                  className="text-xs h-10 px-6 font-extrabold bg-lime-500 hover:bg-lime-600 text-black shadow-sm"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      <span>Guardando...</span>
                    </>
                  ) : editingProduct ? (
                    'Guardar Cambios'
                  ) : (
                    'Crear Producto'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
