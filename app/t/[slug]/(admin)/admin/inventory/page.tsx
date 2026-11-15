'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Package,
  Layers,
  Power,
  RefreshCw,
  FileSpreadsheet,
  UploadCloud,
  ExternalLink,
  List,
  LayoutGrid,
  RotateCcw,
  Archive,
  Image as ImageIcon,
  Loader2,
  X,
  Check,
  CheckCircle2,
  Tag,
  DollarSign,
  Barcode as BarcodeIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { uploadTenantMedia } from '@/lib/media-client';
import { CategoryCombobox } from '@/components/admin/category-combobox';

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  price_usd: number | string;
  cost_price?: number | string | null;
  current_stock: number;
  min_stock_alert: number;
  is_active: boolean;
  is_tax_exempt?: boolean;
  deleted_at?: string | null;
  category_id: string | null;
  category_name: string | null;
  image_url: string | null;
  description?: string | null;
}

interface TenantPlanInfo {
  plan_name: string;
  max_products: number;
}

export default function InventoryPage() {
  const params = useParams() as { slug: string };
  const slug = params?.slug;
  const router = useRouter();

  // Estados principales de catálogo
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  const [secondaryCurrency, setSecondaryCurrency] = useState<string>('VES');
  const [planInfo, setPlanInfo] = useState<TenantPlanInfo>({
    plan_name: 'PRO COMERCIAL',
    max_products: 300,
  });

  // Filtros reactivos y vista
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formPriceUsd, setFormPriceUsd] = useState('');
  const [formCurrentStock, setFormCurrentStock] = useState('10');
  const [formSku, setFormSku] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsTaxExempt, setFormIsTaxExempt] = useState(false);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Modal de Importación Masiva (Excel / CSV)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal de Eliminación Lógica (Papelera)
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Loading individual de fila (para stepper de stock o toggle activo)
  const [stockUpdatingId, setStockUpdatingId] = useState<string | null>(null);

  // Carga inicial
  useEffect(() => {
    if (slug) {
      loadInventoryData();
    }
  }, [slug]);

  async function loadInventoryData() {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/${slug}/products?include_deleted=true`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al cargar productos');
      }

      setProducts(data.products || []);

      if (data.settings?.exchange_rate) {
        setExchangeRate(Number(data.settings.exchange_rate) || 0);
      }
      if (data.settings?.secondary_currency) {
        setSecondaryCurrency(data.settings.secondary_currency);
      }
      if (data.plan) {
        setPlanInfo({
          plan_name: data.plan.plan_name || 'PRO COMERCIAL',
          max_products: Number(data.plan.max_products) || 300,
        });
      }
    } catch {
      toast.error('Error al sincronizar inventario con el servidor');
    } finally {
      setLoading(false);
    }
  }

  // Separar productos activos vs archivados en papelera
  const activeProducts = useMemo(() => products.filter((p) => !p.deleted_at), [products]);
  const archivedProducts = useMemo(() => products.filter((p) => !!p.deleted_at), [products]);

  // Lista según la pestaña seleccionada
  const currentTabProducts = activeTab === 'active' ? activeProducts : archivedProducts;

  // Categorías únicas para el selector de filtro
  const categoriesFilterOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const p of activeProducts) {
      const catId = p.category_id || 'none';
      const catName = p.category_name || 'Sin categoría';
      if (!map.has(catId)) {
        map.set(catId, { id: catId, name: catName, count: 0 });
      }
      map.get(catId)!.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeProducts]);

  // Filtrado reactivo por texto y categoría
  const filteredProducts = useMemo(() => {
    return currentTabProducts.filter((p) => {
      // Filtro de categoría
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'none' && p.category_id) return false;
        if (selectedCategory !== 'none' && p.category_id !== selectedCategory) return false;
      }

      // Filtro de texto (nombre, SKU o código de barra)
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;

      const nameMatch = p.name?.toLowerCase().includes(q);
      const skuMatch = p.sku ? p.sku.toLowerCase().includes(q) : false;
      const barcodeMatch = p.barcode ? p.barcode.toLowerCase().includes(q) : false;

      return nameMatch || skuMatch || barcodeMatch;
    });
  }, [currentTabProducts, selectedCategory, searchQuery]);

  // Capacidad de catálogo
  const catalogCount = activeProducts.length;
  const maxProducts = planInfo.max_products || 300;
  const usagePercentage = Math.min(100, Math.round((catalogCount / maxProducts) * 100));
  const remainingSlots = Math.max(0, maxProducts - catalogCount);

  // ===========================================================================
  // ACCIONES: DESCARGA DE PLANTILLA EXCEL (CSV UTF-8 BOM NATIVO)
  // ===========================================================================
  function handleDownloadTemplate() {
    const headers = [
      'Nombre',
      'Categoria',
      'Precio_USD',
      'Stock',
      'SKU',
      'Codigo_Barra',
      'Exento_IVA',
      'Descripcion',
    ];

    const sampleRows = [
      [
        'Harina de Maíz Blanco 1kg',
        'Víveres y Despensa',
        '1.25',
        '50',
        'HAR-001',
        '7591011000101',
        'SI',
        'Harina de maíz precocida para arepas',
      ],
      [
        'Refresco Frescolita 1.5L',
        'Bebidas & Snacks',
        '1.80',
        '24',
        'REF-016',
        '7591023000623',
        'NO',
        'Bebida gaseosa sabor colita',
      ],
      [
        'Detergente Limón 1kg',
        'Cuidado y Aseo',
        '2.50',
        '30',
        'DET-088',
        '7591099882211',
        'NO',
        'Detergente multiuso para ropa',
      ],
    ];

    const csvContent =
      '\uFEFF' + // UTF-8 BOM para apertura perfecta en Excel
      [headers.join(';'), ...sampleRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `plantilla_inventario_${slug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Plantilla descargada. Ábrela y edítala directamente en Excel o Sheets.');
  }

  // ===========================================================================
  // ACCIONES: PARSER Y CARGA MASIVA DE ARCHIVO
  // ===========================================================================
  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) || '';
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length < 2) {
          toast.error('El archivo está vacío o solo contiene encabezados');
          return;
        }

        // Determinar separador (; o ,)
        const headerLine = lines[0];
        const separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map((h) => h.replace(/^["'\uFEFF]+|["']+$/g, '').trim().toLowerCase());

        const parsedProducts: Array<Record<string, unknown>> = [];

        for (let i = 1; i < lines.length; i++) {
          const rawRow = lines[i];
          // Parser básico respetando comillas
          const tokens: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let c = 0; c < rawRow.length; c++) {
            const ch = rawRow[c];
            if (ch === '"') {
              inQuotes = !inQuotes;
            } else if (ch === separator && !inQuotes) {
              tokens.push(current.trim().replace(/^"|"$/g, ''));
              current = '';
            } else {
              current += ch;
            }
          }
          tokens.push(current.trim().replace(/^"|"$/g, ''));

          const nameIdx = headers.findIndex((h) => h.includes('nombre') || h.includes('name') || h.includes('producto'));
          const catIdx = headers.findIndex((h) => h.includes('categor'));
          const priceIdx = headers.findIndex((h) => h.includes('precio') || h.includes('price'));
          const stockIdx = headers.findIndex((h) => h.includes('stock') || h.includes('cantidad'));
          const skuIdx = headers.findIndex((h) => h.includes('sku') || h.includes('codigo'));
          const barcodeIdx = headers.findIndex((h) => h.includes('barra') || h.includes('barcode'));
          const exemptIdx = headers.findIndex((h) => h.includes('exento') || h.includes('iva'));
          const descIdx = headers.findIndex((h) => h.includes('descrip'));

          const name = nameIdx !== -1 ? tokens[nameIdx] : tokens[0];
          if (!name) continue;

          const rawPrice = priceIdx !== -1 ? tokens[priceIdx]?.replace(',', '.') : '1.00';
          const price = parseFloat(rawPrice) || 1.0;
          const stock = stockIdx !== -1 ? parseInt(tokens[stockIdx]) || 0 : 10;
          const category_name = catIdx !== -1 ? tokens[catIdx] : '';
          const sku = skuIdx !== -1 ? tokens[skuIdx] : '';
          const barcode = barcodeIdx !== -1 ? tokens[barcodeIdx] : '';
          const is_tax_exempt = exemptIdx !== -1 ? ['si', 'yes', 'true', '1'].includes(tokens[exemptIdx]?.toLowerCase() || '') : false;
          const description = descIdx !== -1 ? tokens[descIdx] : '';

          parsedProducts.push({
            name,
            price_usd: price,
            current_stock: stock,
            category_name,
            sku,
            barcode,
            is_tax_exempt,
            description,
          });
        }

        if (parsedProducts.length === 0) {
          toast.error('No se pudieron extraer productos válidos del archivo.');
          return;
        }

        setImportRows(parsedProducts);
        setIsImportModalOpen(true);
      } catch {
        toast.error('Error al procesar el archivo. Asegúrate de usar formato CSV/Excel UTF-8.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleConfirmImport() {
    if (importRows.length === 0 || isImporting) return;

    try {
      setIsImporting(true);
      const res = await fetch(`/api/admin/${slug}/products/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: importRows }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al importar productos');
      }

      toast.success(`¡Éxito! Se importaron ${data.count} productos al catálogo.`);
      setIsImportModalOpen(false);
      setImportRows([]);
      loadInventoryData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error en la importación';
      toast.error(msg);
    } finally {
      setIsImporting(false);
    }
  }

  // ===========================================================================
  // ACCIONES: MODAL NUEVO / EDITAR PRODUCTO (GRID 2 COLUMNAS + WEBP)
  // ===========================================================================
  function openCreateModal() {
    setEditingProduct(null);
    setFormName('');
    setFormCategoryId('');
    setFormPriceUsd('');
    setFormCurrentStock('20');
    setFormSku(`SKU-${Math.floor(100 + Math.random() * 900)}`);
    setFormBarcode('');
    setFormDescription('');
    setFormIsTaxExempt(false);
    setFormImageUrl('');
    setIsModalOpen(true);
  }

  function openEditModal(prod: Product) {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategoryId(prod.category_id || '');
    const priceNum = typeof prod.price_usd === 'number' ? prod.price_usd : parseFloat(prod.price_usd || '0');
    setFormPriceUsd(priceNum.toFixed(2));
    setFormCurrentStock(String(prod.current_stock ?? 0));
    setFormSku(prod.sku || '');
    setFormBarcode(prod.barcode || '');
    setFormDescription(prod.description || '');
    setFormIsTaxExempt(Boolean(prod.is_tax_exempt));
    setFormImageUrl(prod.image_url || '');
    setIsModalOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingImage(true);
      const res = await uploadTenantMedia(file, slug, 'products');
      setFormImageUrl(res.url);
      toast.success('Fotografía comprimida en WebP y cargada con éxito');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al subir la imagen';
      toast.error(msg);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast.error('El nombre del producto es obligatorio');
      return;
    }

    const price = parseFloat(formPriceUsd.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      toast.error('Ingresa un precio válido en USD');
      return;
    }

    const stock = parseInt(formCurrentStock, 10);
    if (isNaN(stock) || stock < 0) {
      toast.error('Ingresa un stock válido');
      return;
    }

    try {
      setIsSavingProduct(true);
      const payload = {
        name: trimmedName,
        category_id: formCategoryId || null,
        price_usd: price,
        current_stock: stock,
        sku: formSku.trim() || null,
        barcode: formBarcode.trim() || null,
        description: formDescription.trim() || null,
        is_tax_exempt: formIsTaxExempt,
        image_url: formImageUrl || null,
      };

      if (editingProduct) {
        // Actualizar
        const res = await fetch(`/api/admin/${slug}/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al actualizar producto');
        toast.success(`Producto "${trimmedName}" actualizado`);
      } else {
        // Crear
        const res = await fetch(`/api/admin/${slug}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al registrar producto');
        toast.success(`Producto "${trimmedName}" registrado con éxito`);
      }

      setIsModalOpen(false);
      loadInventoryData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el producto';
      toast.error(msg);
    } finally {
      setIsSavingProduct(false);
    }
  }

  // ===========================================================================
  // ACCIONES: STEPPER DE STOCK RÁPIDO [- 25 +]
  // ===========================================================================
  async function handleQuickStockChange(prod: Product, delta: number) {
    const current = Number(prod.current_stock || 0);
    const newStock = Math.max(0, current + delta);
    if (newStock === current) return;

    // Actualización optimista inmediata
    setProducts((prev) =>
      prev.map((p) => (p.id === prod.id ? { ...p, current_stock: newStock } : p))
    );

    try {
      setStockUpdatingId(prod.id);
      const res = await fetch(`/api/admin/${slug}/products/${prod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_stock: newStock }),
      });
      if (!res.ok) {
        // Revertir si falló
        setProducts((prev) =>
          prev.map((p) => (p.id === prod.id ? { ...p, current_stock: current } : p))
        );
        toast.error('No se pudo guardar el stock');
      }
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, current_stock: current } : p))
      );
      toast.error('Error de red al actualizar stock');
    } finally {
      setStockUpdatingId(null);
    }
  }

  // ===========================================================================
  // ACCIONES: TOGGLE ACTIVO / PAUSADO
  // ===========================================================================
  async function handleToggleActive(prod: Product) {
    const nextState = !prod.is_active;
    try {
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, is_active: nextState } : p))
      );
      const res = await fetch(`/api/admin/${slug}/products/${prod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextState }),
      });
      if (res.ok) {
        toast.success(`Producto ${nextState ? 'activado' : 'pausado'} en vitrina y caja`);
      } else {
        setProducts((prev) =>
          prev.map((p) => (p.id === prod.id ? { ...p, is_active: prod.is_active } : p))
        );
        toast.error('Error al cambiar estado del producto');
      }
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, is_active: prod.is_active } : p))
      );
      toast.error('Error de conexión');
    }
  }

  // ===========================================================================
  // ACCIONES: SOFT-DELETE (MOVER A PAPELERA) & RESTAURAR
  // ===========================================================================
  async function handleConfirmDelete() {
    if (!deletingProduct || isDeleting) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/admin/${slug}/products/${deletingProduct.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al archivar producto');
      }

      toast.success(`Producto "${deletingProduct.name}" movido a la papelera`);
      const nowIso = new Date().toISOString();
      setProducts((prev) =>
        prev.map((p) =>
          p.id === deletingProduct.id ? { ...p, deleted_at: nowIso, is_active: false } : p
        )
      );
      setDeletingProduct(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar producto';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRestoreProduct(prod: Product) {
    try {
      const res = await fetch(`/api/admin/${slug}/products/${prod.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al restaurar producto');
      }

      toast.success(`Producto "${prod.name}" restaurado al catálogo activo`);
      setProducts((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, deleted_at: null, is_active: true } : p))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al restaurar';
      toast.error(msg);
    }
  }

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-7 h-7 animate-spin text-emerald-600 dark:text-emerald-400" />
        <p className="text-xs text-stone-500 dark:text-zinc-400 font-mono tracking-wide">
          Sincronizando inventario maestro con PostgreSQL...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Input oculto para carga de archivo Excel/CSV */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Cabecera Superior: Título + Tasa BCV + Enlace a Vitrina */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-stone-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight">
            Inventario en Tienda
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400">
            Catálogo de productos, existencias y precios en tiempo real
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {exchangeRate > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs flex items-center gap-1.5 font-bold font-mono text-stone-800 dark:text-zinc-200 shadow-2xs">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Bs.</span>
              <span>
                {exchangeRate.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <RefreshCw className="w-3 h-3 text-stone-400 ml-0.5" />
            </div>
          )}

          <Link
            href={`/t/${slug}`}
            target="_blank"
            className="h-8.5 px-3 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-stone-50 dark:hover:bg-zinc-800 text-xs font-bold text-stone-700 dark:text-zinc-300 flex items-center gap-1.5 transition shadow-2xs"
          >
            <span>Vitrina</span>
            <ExternalLink className="w-3 h-3 text-stone-400" />
          </Link>
        </div>
      </div>

      {/* Tarjeta Principal de Control & Acciones (Excel, Importar, Categorías, Nuevo) */}
      <Card className="border-stone-200/90 dark:border-zinc-800/90 shadow-xs">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                  <Package className="w-4 h-4" />
                </span>
                <h2 className="font-black text-base text-stone-900 dark:text-white">
                  Catálogo & Control de Inventario
                </h2>
              </div>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Administra existencias, códigos de barra, precios en USD/Bs y catálogo de productos.
              </p>
            </div>

            {/* Botonera de Acciones Superiores */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Plantilla Excel */}
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadTemplate}
                className="h-9 px-3 text-xs font-bold rounded-xl border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Plantilla Excel</span>
              </Button>

              {/* Importar Excel */}
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 px-3 text-xs font-bold rounded-xl border-stone-200 dark:border-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5 shadow-2xs"
              >
                <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
                <span>Importar Excel</span>
              </Button>

              {/* Categorías */}
              <Link
                href={`/t/${slug}/admin/categories`}
                className="h-9 px-3 text-xs font-bold rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition shadow-2xs"
              >
                <Tag className="w-3.5 h-3.5 text-rose-500" />
                <span>Categorías</span>
              </Link>

              {/* + Nuevo Producto */}
              <Button
                type="button"
                onClick={openCreateModal}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-sm hover:shadow transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Nuevo Producto</span>
              </Button>
            </div>
          </div>

          {/* Barra de Capacidad de Catálogo */}
          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200/80 dark:border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <span className="text-stone-900 dark:text-white">
                  Capacidad de Catálogo ({catalogCount} / {maxProducts} productos)
                </span>
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  {usagePercentage}% EN USO
                </span>
              </div>
              <span className="text-[11px] text-stone-400 font-normal">
                Plan actual: <strong className="text-stone-700 dark:text-zinc-300 font-semibold">{planInfo.plan_name}</strong>
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-stone-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300 rounded-full',
                  usagePercentage > 90 ? 'bg-rose-500' : usagePercentage > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.max(2, usagePercentage)}%` }}
              />
            </div>
            <p className="text-[11px] text-stone-500 dark:text-zinc-400">
              Te quedan <strong className="text-stone-800 dark:text-zinc-200">{remainingSlots}</strong> espacios para nuevos productos en tu catálogo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Selector de Pestañas: Catálogo Activo vs Papelera / Archivados */}
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 dark:border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
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
            <Package className="w-3.5 h-3.5" />
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
              {activeProducts.length}
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
            <span>Papelera / Archivados</span>
            {archivedProducts.length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0.2 border-amber-300 dark:border-amber-800 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
              >
                {archivedProducts.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Selector de Modo de Vista (Lista vs Grid) */}
        <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-zinc-900 rounded-xl border border-stone-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded-lg transition cursor-pointer',
              viewMode === 'list'
                ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-white shadow-2xs'
                : 'text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200'
            )}
            title="Vista en Lista / Tabla"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded-lg transition cursor-pointer',
              viewMode === 'grid'
                ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-white shadow-2xs'
                : 'text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200'
            )}
            title="Vista en Cuadrícula / Tarjetas"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtro de Categoría */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, SKU, código de barra..."
            className="pl-9.5 h-10 text-xs sm:text-sm rounded-xl font-medium bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800"
          />
        </div>

        {/* Dropdown de Categorías */}
        <div className="w-full sm:w-64">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full h-10 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs text-stone-800 dark:text-zinc-200 font-bold focus:outline-none cursor-pointer"
          >
            <option value="all">Todas las Categorías ({activeProducts.length})</option>
            {categoriesFilterOptions.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.count})
              </option>
            ))}
          </select>
        </div>

        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSearchQuery('')}
            className="h-10 text-xs px-3 text-stone-500 hover:text-stone-900 dark:hover:text-white shrink-0"
          >
            Limpiar filtro
          </Button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: LISTADO EN TABLA (MODO EXACTO A LA REFERENCIA)                  */}
      {/* ========================================================================= */}
      {viewMode === 'list' && (
        <Card className="border-stone-200/80 dark:border-zinc-800/80 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50/80 dark:bg-zinc-900/60 border-b border-stone-200/80 dark:border-zinc-800 text-[11px] font-black uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                <tr>
                  <th className="py-3.5 px-4 w-14">Foto</th>
                  <th className="py-3.5 px-4">Producto & Códigos</th>
                  <th className="py-3.5 px-4">Categoría</th>
                  <th className="py-3.5 px-4">Precio (USD)</th>
                  <th className="py-3.5 px-4">Precio VES</th>
                  <th className="py-3.5 px-4 text-center">Stock / Control</th>
                  <th className="py-3.5 px-4 text-center">Estado</th>
                  <th className="py-3.5 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-zinc-800/80">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-stone-500 dark:text-zinc-400">
                      <Package className="w-8 h-8 text-stone-300 dark:text-zinc-600 mx-auto mb-2" />
                      <p className="font-bold text-sm text-stone-700 dark:text-zinc-300">
                        {searchQuery ? 'Sin productos coincidentes con la búsqueda' : 'No hay productos en esta sección'}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">
                        {activeTab === 'active'
                          ? 'Crea un nuevo producto o importa tu catálogo mediante Excel.'
                          : 'No tienes productos archivados en la papelera.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod) => {
                    const priceNum = typeof prod.price_usd === 'number' ? prod.price_usd : parseFloat(prod.price_usd || '0');
                    const priceVes = exchangeRate > 0 ? priceNum * exchangeRate : 0;
                    const stockNum = Number(prod.current_stock || 0);
                    const isArchived = !!prod.deleted_at;

                    return (
                      <tr
                        key={prod.id}
                        className={cn(
                          'hover:bg-stone-50/60 dark:hover:bg-zinc-900/40 transition-colors',
                          isArchived
                            ? 'bg-rose-50/20 dark:bg-rose-950/10'
                            : !prod.is_active
                            ? 'bg-stone-50/60 dark:bg-zinc-900/30 opacity-75'
                            : ''
                        )}
                      >
                        {/* FOTO */}
                        <td className="py-3 px-4">
                          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                            {prod.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-stone-400 dark:text-zinc-600" />
                            )}
                          </div>
                        </td>

                        {/* PRODUCTO & CÓDIGOS */}
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            <p
                              className={cn(
                                'font-bold text-sm leading-snug',
                                isArchived
                                  ? 'text-stone-500 dark:text-zinc-400 line-through'
                                  : 'text-stone-900 dark:text-white'
                              )}
                            >
                              {prod.name}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-zinc-400 font-mono">
                              {prod.sku && <span>SKU: {prod.sku}</span>}
                              {prod.sku && prod.barcode && <span>·</span>}
                              {prod.barcode && <span>Barra: {prod.barcode}</span>}
                              {!prod.sku && !prod.barcode && <span className="italic">Sin código</span>}
                            </div>
                          </div>
                        </td>

                        {/* CATEGORÍA */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border border-rose-200 dark:border-rose-950/60 bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400">
                            <Tag className="w-3 h-3" />
                            {prod.category_name || 'Sin categoría'}
                          </span>
                        </td>

                        {/* PRECIO USD */}
                        <td className="py-3 px-4 font-mono font-black text-sm text-stone-900 dark:text-white">
                          ${priceNum.toFixed(2)}
                        </td>

                        {/* PRECIO VES */}
                        <td className="py-3 px-4 font-mono text-xs font-bold text-stone-700 dark:text-zinc-300">
                          {priceVes > 0 ? (
                            <>
                              Bs. {priceVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>

                        {/* STOCK / STEPPER INTERACTIVO [- 25 +] */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5 font-mono">
                            <button
                              type="button"
                              onClick={() => handleQuickStockChange(prod, -1)}
                              disabled={isArchived || stockNum <= 0}
                              className="w-7 h-7 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 flex items-center justify-center font-bold text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition"
                              title="Restar 1 existencia"
                            >
                              -
                            </button>
                            <span
                              className={cn(
                                'w-10 text-center font-extrabold text-sm',
                                stockNum === 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : stockNum <= prod.min_stock_alert
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-stone-900 dark:text-white'
                              )}
                            >
                              {stockNum}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuickStockChange(prod, 1)}
                              disabled={isArchived}
                              className="w-7 h-7 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 flex items-center justify-center font-bold text-xs cursor-pointer disabled:opacity-30 transition"
                              title="Añadir 1 existencia"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* ESTADO */}
                        <td className="py-3 px-4 text-center">
                          {isArchived ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-rose-600 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 uppercase font-bold"
                            >
                              Papelera
                            </Badge>
                          ) : prod.is_active ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-600 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 uppercase font-bold"
                            >
                              Activo
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-amber-600 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 uppercase font-bold"
                            >
                              Pausado
                            </Badge>
                          )}
                        </td>

                        {/* ACCIONES */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isArchived ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestoreProduct(prod)}
                                className="h-7.5 px-2.5 text-xs border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg font-bold cursor-pointer transition flex items-center gap-1"
                                title="Restaurar al catálogo activo"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restaurar</span>
                              </Button>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditModal(prod)}
                                  className="h-7.5 px-2 text-xs text-stone-700 dark:text-zinc-300 hover:bg-stone-200/60 dark:hover:bg-zinc-800 rounded-lg font-medium cursor-pointer"
                                  title="Editar producto"
                                >
                                  <Edit2 className="w-3.5 h-3.5 mr-1 text-stone-500" />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleToggleActive(prod)}
                                  className="h-7.5 px-2 text-xs text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white rounded-lg cursor-pointer"
                                  title={prod.is_active ? 'Pausar visibilidad' : 'Reactivar en vitrina'}
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeletingProduct(prod)}
                                  className="h-7.5 px-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                                  title="Mover a la papelera (soft-delete)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: CUADRÍCULA / TARJETAS (MODO TÁCTIL O VISUAL)                    */}
      {/* ========================================================================= */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((prod) => {
            const priceNum = typeof prod.price_usd === 'number' ? prod.price_usd : parseFloat(prod.price_usd || '0');
            const priceVes = exchangeRate > 0 ? priceNum * exchangeRate : 0;
            const stockNum = Number(prod.current_stock || 0);
            const isArchived = !!prod.deleted_at;

            return (
              <Card
                key={prod.id}
                className={cn(
                  'border-stone-200 dark:border-zinc-800 overflow-hidden shadow-2xs flex flex-col justify-between transition-all hover:shadow-md',
                  isArchived ? 'opacity-70 bg-rose-50/20' : !prod.is_active ? 'opacity-80' : ''
                )}
              >
                <div className="p-4 space-y-3">
                  <div className="relative aspect-video w-full rounded-xl bg-stone-100 dark:bg-zinc-800 border border-stone-200/80 dark:border-zinc-700/80 overflow-hidden flex items-center justify-center">
                    {prod.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-stone-300 dark:text-zinc-600" />
                    )}

                    <div className="absolute top-2 right-2">
                      {isArchived ? (
                        <Badge variant="outline" className="text-[10px] bg-rose-600 text-white font-bold">
                          Papelera
                        </Badge>
                      ) : prod.is_active ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-600 text-white font-bold">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-500 text-white font-bold">
                          Pausado
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      {prod.category_name || 'Sin categoría'}
                    </span>
                    <h3 className="font-bold text-sm text-stone-900 dark:text-white line-clamp-2">
                      {prod.name}
                    </h3>
                    <p className="text-[11px] text-stone-400 font-mono mt-0.5">
                      {prod.sku ? `SKU: ${prod.sku}` : ''} {prod.barcode ? `· Barra: ${prod.barcode}` : ''}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-100 dark:border-zinc-800 flex items-baseline justify-between">
                    <div>
                      <div className="text-base font-black font-mono text-stone-900 dark:text-white">
                        ${priceNum.toFixed(2)}
                      </div>
                      {priceVes > 0 && (
                        <div className="text-[11px] font-bold font-mono text-stone-500">
                          Bs. {priceVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-1 font-mono">
                      <button
                        type="button"
                        onClick={() => handleQuickStockChange(prod, -1)}
                        disabled={isArchived || stockNum <= 0}
                        className="w-6 h-6 rounded-md border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold text-xs">{stockNum}</span>
                      <button
                        type="button"
                        onClick={() => handleQuickStockChange(prod, 1)}
                        disabled={isArchived}
                        className="w-6 h-6 rounded-md border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-stone-50 dark:bg-zinc-900/60 border-t border-stone-100 dark:border-zinc-800 flex items-center justify-between">
                  {isArchived ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestoreProduct(prod)}
                      className="w-full text-xs font-bold text-emerald-600 border-emerald-300"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Restaurar Producto
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditModal(prod)}
                        className="text-xs font-medium"
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingProduct(prod)}
                        className="text-xs text-rose-600"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Papelera
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: NUEVO / EDITAR PRODUCTO (DISEÑO 2 COLUMNAS + COMPRESOR WEBP)     */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div
          onClick={() => !isSavingProduct && setIsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 my-8"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-stone-900 dark:text-white leading-tight">
                    {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-zinc-400">
                    Información, precios, categoría y disponibilidad en catálogo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSavingProduct}
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* Fotografía del Producto (con Compresor WebP optimizado) */}
              <div className="p-4 rounded-2xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200/80 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-stone-800 dark:text-zinc-200">
                    Fotografía del Producto
                  </label>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800/40">
                    Compresor WebP optimizado
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-800 border-2 border-dashed border-stone-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 relative group">
                    {formImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={formImageUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-7 h-7 text-stone-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-xs font-bold text-stone-700 dark:text-zinc-200 hover:bg-stone-50 cursor-pointer shadow-2xs transition">
                      {isUploadingImage ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          <span>Optimizando WebP...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Subir Fotografía</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={isUploadingImage}
                      />
                    </label>
                    <p className="text-[11px] text-stone-400 dark:text-zinc-500">
                      Se comprime automáticamente en el navegador a formato WebP HD sin perder nitidez.
                    </p>
                  </div>
                </div>
              </div>

              {/* Grid de 2 Columnas (Campos Principales) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Nombre */}
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                    Nombre del Producto *
                  </label>
                  <Input
                    required
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. Harina PAN 1kg"
                    className="h-10 text-xs sm:text-sm rounded-xl font-medium"
                    disabled={isSavingProduct}
                  />
                </div>

                {/* Categoría con Combobox y atajo rápido */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                      Categoría *
                    </label>
                    <Link
                      href={`/t/${slug}/admin/categories`}
                      target="_blank"
                      className="text-[11px] font-bold text-emerald-600 hover:underline"
                    >
                      + Nueva Categoría
                    </Link>
                  </div>
                  <CategoryCombobox
                    slug={slug}
                    value={formCategoryId}
                    onChange={(val) => setFormCategoryId(val || '')}
                    className="h-10 text-xs rounded-xl"
                    disabled={isSavingProduct}
                  />
                </div>

                {/* Precio USD */}
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                    Precio USD ($) *
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={formPriceUsd}
                      onChange={(e) => setFormPriceUsd(e.target.value)}
                      placeholder="1.25"
                      className="pl-9 h-10 text-xs sm:text-sm rounded-xl font-mono font-bold"
                      disabled={isSavingProduct}
                    />
                  </div>
                </div>

                {/* Stock en Tienda */}
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                    Stock en Tienda *
                  </label>
                  <div className="relative">
                    <Package className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      required
                      type="number"
                      min="0"
                      value={formCurrentStock}
                      onChange={(e) => setFormCurrentStock(e.target.value)}
                      placeholder="20"
                      className="pl-9 h-10 text-xs sm:text-sm rounded-xl font-mono"
                      disabled={isSavingProduct}
                    />
                  </div>
                </div>

                {/* SKU */}
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                    Código / SKU (opcional)
                  </label>
                  <Input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    placeholder="PAN-001"
                    className="h-10 text-xs rounded-xl font-mono"
                    disabled={isSavingProduct}
                  />
                </div>

                {/* Código de Barra */}
                <div>
                  <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                    Código de Barra (opcional)
                  </label>
                  <div className="relative">
                    <BarcodeIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="text"
                      value={formBarcode}
                      onChange={(e) => setFormBarcode(e.target.value)}
                      placeholder="7591011000012"
                      className="pl-9 h-10 text-xs rounded-xl font-mono"
                      disabled={isSavingProduct}
                    />
                  </div>
                </div>
              </div>

              {/* Descripción breve */}
              <div>
                <label className="text-xs font-bold text-stone-700 dark:text-zinc-300 block mb-1">
                  Descripción breve (opcional)
                </label>
                <Input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Detalles sobre el producto, peso, presentación..."
                  className="h-10 text-xs rounded-xl"
                  disabled={isSavingProduct}
                />
              </div>

              {/* Checkbox Exento de IVA Art. 18 */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-900/60 border border-stone-200/80 dark:border-zinc-800 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="prod_tax_exempt"
                  checked={formIsTaxExempt}
                  onChange={(e) => setFormIsTaxExempt(e.target.checked)}
                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer mt-0.5"
                  disabled={isSavingProduct}
                />
                <label htmlFor="prod_tax_exempt" className="text-xs text-stone-700 dark:text-zinc-300 cursor-pointer">
                  <span className="font-bold">Producto Exento de IVA (Art. 18)</span>{' '}
                  <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded">IVA 0%</span>
                  <span className="block text-[11px] text-stone-400 dark:text-zinc-500 mt-0.5">
                    Alimentos básicos (harina, arroz, huevos, leche, carnes, pan) o medicinas.
                  </span>
                </label>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSavingProduct}
                  className="h-10 text-xs px-4 rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingProduct || !formName.trim() || !formPriceUsd}
                  className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingProduct ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingProduct ? 'Guardar Cambios' : 'Crear Producto'}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRMACIÓN DE IMPORTACIÓN MASIVA (PREVIEW CSV)                 */}
      {/* ========================================================================= */}
      {isImportModalOpen && (
        <div
          onClick={() => !isImporting && setIsImportModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 my-8"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-stone-900 dark:text-white leading-tight">
                    Importación Masiva de Catálogo
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-zinc-400">
                    Se detectaron {importRows.length} productos listos para procesar
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImporting}
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Previsualización de filas */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-stone-700 dark:text-zinc-300">
                Previsualización de las primeras filas:
              </p>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-900">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 font-bold border-b border-stone-200 dark:border-zinc-700">
                    <tr>
                      <th className="py-2 px-3">Producto</th>
                      <th className="py-2 px-3">Categoría</th>
                      <th className="py-2 px-3">Precio USD</th>
                      <th className="py-2 px-3">Stock</th>
                      <th className="py-2 px-3">SKU</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/60 dark:divide-zinc-800 font-mono">
                    {importRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-sans font-bold text-stone-800 dark:text-zinc-200">
                          {String(row.name)}
                        </td>
                        <td className="py-1.5 px-3 font-sans text-stone-500">
                          {String(row.category_name || 'Sin categoría')}
                        </td>
                        <td className="py-1.5 px-3 text-emerald-600 font-bold">
                          ${Number(row.price_usd).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-3">{String(row.current_stock)}</td>
                        <td className="py-1.5 px-3 text-stone-400">{String(row.sku || '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importRows.length > 5 && (
                <p className="text-[11px] text-stone-400 text-right italic">
                  + {importRows.length - 5} productos más en el archivo...
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
                Carga Idempotente y Automática
              </p>
              <p className="text-[11px] leading-relaxed opacity-90">
                Las categorías no existentes se crearán automáticamente. Los productos con SKU ya registrado se vincularán limpiamente a la sede principal.
              </p>
            </div>

            <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImporting}
                className="h-10 text-xs px-4 rounded-xl cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    Procesando {importRows.length} productos...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Confirmar e Importar {importRows.length} Productos</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ELIMINACIÓN LÓGICA (MOVER A PAPELERA / SOFT-DELETE)             */}
      {/* ========================================================================= */}
      {deletingProduct && (
        <div
          onClick={() => !isDeleting && setDeletingProduct(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
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
                  ¿Mover producto a la papelera?
                </h3>
                <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                  Estás a punto de archivar{' '}
                  <strong className="text-stone-900 dark:text-white font-bold">
                    &quot;{deletingProduct.name}&quot;
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
                El producto dejará de estar disponible en vitrina y caja. Los pedidos históricos que contengan este producto mantendrán intacta su información, y podrás restaurarlo cuando lo desees desde la pestaña &quot;Papelera / Archivados&quot;.
              </p>
            </div>

            <div className="pt-3 border-t border-stone-200/80 dark:border-zinc-800 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeletingProduct(null)}
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
        </div>
      )}
    </div>
  );
}
