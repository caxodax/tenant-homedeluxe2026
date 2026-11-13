'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Save, Package } from 'lucide-react';
import { toast } from 'sonner';
import { ImageUploader } from '@/components/admin/image-uploader';
import { CategoryCombobox } from '@/components/admin/category-combobox';

const productSchema = z.object({
  name: z.string().min(2, 'Nombre requerido').max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  price_usd: z.number().min(0, 'Precio debe ser >= 0'),
  cost_price: z.number().min(0).optional().nullable(),
  is_tax_exempt: z.boolean(),
  track_inventory: z.boolean(),
  current_stock: z.number().min(0),
  min_stock_alert: z.number().min(0),
  is_active: z.boolean(),
  image_url: z.string().optional().nullable(),
});

type ProductForm = z.infer<typeof productSchema>;

export default function ProductFormPage() {
  const params = useParams() as { slug: string; id: string };
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const isEditing = params.id !== 'new';

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      sku: '',
      barcode: '',
      price_usd: 0,
      cost_price: 0,
      is_tax_exempt: false,
      track_inventory: true,
      current_stock: 0,
      min_stock_alert: 5,
      is_active: true,
      image_url: '',
    },
  });

  useEffect(() => {
    fetchCategories();
    if (isEditing) {
      fetchProduct();
    } else {
      setFetching(false);
    }
  }, [params.id]);

  async function fetchCategories() {
    try {
      const res = await fetch(`/api/admin/${params.slug}/categories`);
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }

  async function fetchProduct() {
    try {
      const res = await fetch(`/api/admin/${params.slug}/products/${params.id}`);
      const data = await res.json();

      form.reset({
        name: data.name,
        slug: data.slug,
        description: data.description || '',
        sku: data.sku || '',
        barcode: data.barcode || '',
        category_id: data.category_id || undefined,
        price_usd: parseFloat(data.price_usd),
        cost_price: parseFloat(data.cost_price) || 0,
        is_tax_exempt: data.is_tax_exempt ?? false,
        track_inventory: data.track_inventory ?? true,
        current_stock: parseFloat(data.current_stock || '0'),
        min_stock_alert: parseFloat(data.min_stock_alert || '5'),
        is_active: data.is_active ?? true,
        image_url: data.image_url || '',
      });
    } catch (error) {
      toast.error('Error al cargar producto');
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(data: ProductForm) {
    setLoading(true);
    try {
      const url = isEditing
        ? `/api/admin/${params.slug}/products/${params.id}`
        : `/api/admin/${params.slug}/products`;

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        toast.success(isEditing ? 'Producto actualizado' : 'Producto creado exitosamente');
        router.push(`/t/${params.slug}/admin/inventory`);
      } else {
        const error = await res.json();
        toast.error('Error al guardar', { description: error.error });
      }
    } catch (error) {
      toast.error('Error inesperado al procesar producto');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <div className="p-8 text-slate-500 dark:text-zinc-500 text-xs font-mono">Cargando datos del producto...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push(`/t/${params.slug}/admin/inventory`)}
          className="text-slate-600 dark:text-zinc-400 h-10 w-10 rounded-xl"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 text-xs mt-1">
            {isEditing ? 'Actualiza la información del producto en el catálogo' : 'Agrega un nuevo producto maestro al catálogo del comercio'}
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-1 rounded-2xl">
            <TabsTrigger value="general" className="rounded-xl text-xs font-bold cursor-pointer">General & Multimedia</TabsTrigger>
            <TabsTrigger value="pricing" className="rounded-xl text-xs font-bold cursor-pointer">Precios</TabsTrigger>
            <TabsTrigger value="inventory" className="rounded-xl text-xs font-bold cursor-pointer">Inventario</TabsTrigger>
          </TabsList>

          {/* Tab: General */}
          <TabsContent value="general" className="space-y-4">
            <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214]">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white text-sm font-extrabold">Información Básica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre del producto *</Label>
                    <Input
                      id="name"
                      {...form.register('name')}
                      onChange={(e) => {
                        form.setValue('name', e.target.value);
                        if (!isEditing) {
                          form.setValue(
                            'slug',
                            e.target.value
                              .toLowerCase()
                              .trim()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/(^-|-$)/g, '')
                          );
                        }
                      }}
                      className="text-xs h-10 rounded-xl"
                      placeholder="Ej. Harina de Maíz Blanco 1kg"
                    />
                    {form.formState.errors.name && (
                      <p className="text-xs text-rose-500">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="slug">Slug (URL) *</Label>
                    <Input
                      id="slug"
                      {...form.register('slug')}
                      className="text-xs h-10 rounded-xl font-mono"
                      placeholder="harina-de-maiz-blanco-1kg"
                    />
                    {form.formState.errors.slug && (
                      <p className="text-xs text-rose-500">{form.formState.errors.slug.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    {...form.register('description')}
                    rows={3}
                    placeholder="Descripción visible para clientes en la vitrina digital..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">Código SKU</Label>
                    <Input
                      id="sku"
                      {...form.register('sku')}
                      placeholder="Ej: HAR-001"
                      className="text-xs h-10 rounded-xl font-mono uppercase"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="barcode">Código de Barras</Label>
                    <Input
                      id="barcode"
                      {...form.register('barcode')}
                      placeholder="Ej: 7591001234567"
                      className="text-xs h-10 rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="category_id">Categoría</Label>
                    <span className="text-[11px] text-stone-400 dark:text-zinc-500">
                      Organiza el producto en vitrina y caja
                    </span>
                  </div>
                  <CategoryCombobox
                    slug={params.slug}
                    value={form.watch('category_id')}
                    categories={categories}
                    onChange={(val) => form.setValue('category_id', val, { shouldDirty: true })}
                    onCategoryCreated={(newCat) => {
                      setCategories((prev) => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
                    }}
                  />
                </div>

                {/* Subida Compacta de Imagen (Cloudflare R2) */}
                <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-2">
                  <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Foto del Producto (Cloudflare R2)
                  </Label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="w-32 h-32 shrink-0">
                      <ImageUploader
                        tenantSlug={params.slug}
                        path="products"
                        value={form.watch('image_url')}
                        onChange={(url) => form.setValue('image_url', url, { shouldDirty: true })}
                        aspectRatio="square"
                        maxSize={5}
                      />
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-500 dark:text-zinc-400">
                      <p className="font-semibold text-slate-800 dark:text-zinc-200">
                        Previsualización adaptada al catálogo
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 leading-relaxed max-w-md">
                        Sube o arrastra una imagen (JPG, PNG, WebP máx. 5MB). Se almacena directamente en Cloudflare R2 sin costo de egress y se mostrará en mostrador y vitrina digital.
                      </p>
                      {form.watch('image_url') && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md">
                          ✓ Foto enlazada en R2
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Precios */}
          <TabsContent value="pricing" className="space-y-4">
            <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214]">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white text-sm font-extrabold">Precios e Impuestos (Core en USD)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price_usd">Precio de Venta Base (USD $) *</Label>
                    <Input
                      id="price_usd"
                      type="number"
                      step="0.01"
                      {...form.register('price_usd', { valueAsNumber: true })}
                      className="text-xs h-10 rounded-xl font-mono font-bold"
                    />
                    {form.formState.errors.price_usd && (
                      <p className="text-xs text-rose-500">{form.formState.errors.price_usd.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cost_price">Precio de Costo (USD $)</Label>
                    <Input
                      id="cost_price"
                      type="number"
                      step="0.01"
                      {...form.register('cost_price', { valueAsNumber: true })}
                      className="text-xs h-10 rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_tax_exempt"
                    {...form.register('is_tax_exempt')}
                    className="w-4 h-4 rounded text-lime-600 cursor-pointer"
                  />
                  <Label htmlFor="is_tax_exempt" className="text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                    Producto exento de impuestos
                  </Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Inventario */}
          <TabsContent value="inventory" className="space-y-4">
            <Card className="border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121214]">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white text-sm font-extrabold">Control de Stock y Kardex</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="track_inventory"
                    {...form.register('track_inventory')}
                    className="w-4 h-4 rounded text-lime-600 cursor-pointer"
                  />
                  <Label htmlFor="track_inventory" className="text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                    Rastrear inventario de este producto
                  </Label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="current_stock">Stock Actual</Label>
                    <Input
                      id="current_stock"
                      type="number"
                      step="0.001"
                      {...form.register('current_stock', { valueAsNumber: true })}
                      className="text-xs h-10 rounded-xl font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="min_stock_alert">Stock Mínimo (Alerta de reposición)</Label>
                    <Input
                      id="min_stock_alert"
                      type="number"
                      step="0.001"
                      {...form.register('min_stock_alert', { valueAsNumber: true })}
                      className="text-xs h-10 rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                    <strong>Sincronización Atómica:</strong> El stock se descuenta automáticamente con cada venta 
                    en mostrador y vitrina digital mediante la RPC atómica del Core (`rpc_core_create_order`).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Acciones */}
        <div className="flex justify-end gap-2.5 pt-6 border-t border-slate-200 dark:border-zinc-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/t/${params.slug}/admin/inventory`)}
            className="text-xs h-10 px-4 font-bold"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="text-xs h-10 px-6 font-extrabold bg-lime-500 hover:bg-lime-600 text-black shadow-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Producto'}
          </Button>
        </div>
      </form>
    </div>
  );
}
