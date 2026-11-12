'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { ConnectivityIndicator } from '../components/connectivity-indicator';
import { usePosBrand } from '../components/pos-brand-provider';
import { startPosHeartbeat, stopPosHeartbeat, refreshPosPendingCount } from '@/lib/pos/heartbeat';
import { ThemeToggle } from '@/components/theme-toggle';
import { TenantThemeInjector } from '@/components/tenant-theme-injector';
import { enqueueOfflineSale, processSyncQueue } from '@/lib/pos/sync-queue';
import { generateOfflineTicketRef } from '@/lib/pos/offline-numbering';
import { posDb } from '@/lib/pos/offline-db';
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart, 
  CreditCard, Banknote, CheckCircle2, RotateCcw,
  Package, Printer, Lock, Unlock, X, Calculator
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price_usd: string;
  current_stock: string;
  min_stock_alert: string;
  category_id: string;
  image_url?: string;
}

interface PosSettings {
  business_name: string;
  primary_currency: string;
  store_id?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
}

interface TicketItem {
  product: Product;
  quantity: number;
}

interface PosPageProps {
  params: Promise<{ slug: string }>;
}

function PosQuantityInput({
  value,
  onChange,
  productName,
}: {
  value: number;
  onChange: (newQty: number) => void;
  productName: string;
}) {
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    setDraft(digitsOnly);
    if (digitsOnly.length > 0) {
      const parsed = parseInt(digitsOnly, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        onChange(Math.min(parsed, 9999));
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const allowedControl = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Home',
      'End',
      'Enter',
    ];
    if (allowedControl.includes(e.key) || e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      }
      return;
    }
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  }

  function handleBlur() {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setDraft(String(value));
    } else {
      const clamped = Math.min(parsed, 9999);
      setDraft(String(clamped));
      if (clamped !== value) {
        onChange(clamped);
      }
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={`Cantidad para ${productName}`}
      value={draft}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onFocus={(e) => e.currentTarget.select()}
      className="w-12 h-7 text-center text-sm font-extrabold font-mono bg-white dark:bg-zinc-900 text-slate-950 dark:text-white border border-slate-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 select-text"
    />
  );
}

interface PosPaymentMethod {
  code: string;
  name: string;
  requires_reference?: boolean;
}

interface ActiveShift {
  id: string;
  register_code?: string;
  cashier_name: string;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  opening_balance_primary: string;
}

interface ShiftSummary {
  expectedByMethod: Record<string, number>;
  methods: Array<{ code: string; name: string }>;
  salesCount: number;
  totalCollectedUsd: number;
  openingUsd: number;
}

const DEFAULT_POS_METHODS: PosPaymentMethod[] = [
  { code: 'CASH_USD', name: 'Efectivo USD ($)', requires_reference: false },
  { code: 'CARD', name: 'Punto / Tarjeta', requires_reference: false },
];

export default function PosPage({ params }: PosPageProps) {
  const { slug } = use(params);
  const brandContext = usePosBrand();

  // Estados de datos
  const [products, setProducts] = useState<Product[]>([]);
  const [posPaymentMethods, setPosPaymentMethods] = useState<PosPaymentMethod[]>(DEFAULT_POS_METHODS);
  const [settings, setSettings] = useState<PosSettings>({
    business_name: brandContext?.business_name || 'Mi Comercio',
    primary_currency: 'USD',
    store_id: brandContext?.store_id || null,
    logo_url: brandContext?.logo_url || null,
    primary_color: brandContext?.primary_color || null,
    secondary_color: brandContext?.secondary_color || null,
    accent_color: brandContext?.accent_color || null,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Estado de Turno / Caja Registradora
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummary | null>(null);
  const [shiftModalMode, setShiftModalMode] = useState<'open' | 'close' | null>(null);
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [actualCounted, setActualCounted] = useState<Record<string, string>>({});
  const [shiftNotes, setShiftNotes] = useState('');
  const [shiftBusy, setShiftBusy] = useState(false);

  // Estado del ticket de venta actual
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [customerName, setCustomerName] = useState('Cliente Mostrador');
  const [customerPhone, setCustomerPhone] = useState('');

  // Estado del modal de cobro
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH_USD');
  const [paymentRef, setPaymentRef] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    ticketRef: string;
    totalUsd: number;
    itemsCount: number;
    customerName: string;
    paymentMethod: string;
    items: { name: string; quantity: number; unitPrice: number; subtotal: number }[];
    timestamp: string;
    syncStatus: 'synced' | 'pending' | 'error';
  } | null>(null);

  // Inicializar heartbeat, caché offline de marca/catálogo en Dexie y turno de caja
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`marketos_pos_brand_${slug}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore localStorage errors
    }

    posDb.catalog_cache
      .get(slug)
      .then((cachedCatalog) => {
        if (cachedCatalog) {
          setProducts((prev) => (prev.length === 0 ? cachedCatalog.products : prev));
          if (cachedCatalog.payment_methods?.length > 0) {
            setPosPaymentMethods(cachedCatalog.payment_methods);
          }
          if (cachedCatalog.settings) {
            setSettings((prev) => ({ ...prev, ...cachedCatalog.settings }));
          }
          setLoading(false);
        }
      })
      .catch(() => {});

    startPosHeartbeat(slug, 'POS-01');
    loadShift();
    loadProducts(false).then(() => {
      // Refrescar catálogo tras posible sincronización automática de ventas pendientes al abrir la caja
      setTimeout(() => loadProducts(true), 1200);
    });

    return () => {
      stopPosHeartbeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function loadShift() {
    try {
      const res = await fetch(`/api/tenant/${slug}/pos/shift`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setActiveShift(data.active_shift || null);
      setShiftSummary(data.active_summary || null);
      if (data.active_summary?.expectedByMethod) {
        const initial: Record<string, string> = {};
        for (const k of Object.keys(data.active_summary.expectedByMethod)) {
          initial[k] = '';
        }
        setActualCounted((prev) => (Object.keys(prev).length > 0 ? prev : initial));
      }
    } catch {
      // ignore when offline
    }
  }

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault();
    if (shiftBusy) return;
    setShiftBusy(true);
    try {
      const res = await fetch(`/api/tenant/${slug}/pos/shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          register_code: 'POS-01',
          opening_balance_primary: parseFloat(openingBalance || '0') || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir turno');
      setActiveShift(data.active_shift);
      setShiftSummary(data.active_summary);
      setShiftModalMode(null);
      toast.success('Turno de caja abierto correctamente');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error abriendo turno');
    } finally {
      setShiftBusy(false);
    }
  }

  async function handleCloseShift(e: React.FormEvent) {
    e.preventDefault();
    if (!activeShift || shiftBusy) return;
    setShiftBusy(true);
    try {
      const actualNumeric: Record<string, number> = {};
      const methodsList = shiftSummary?.methods || posPaymentMethods;
      for (const m of methodsList) {
        actualNumeric[m.code] = Number(parseFloat(actualCounted[m.code] || '0').toFixed(2)) || 0;
      }

      const res = await fetch(`/api/tenant/${slug}/pos/shift`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_id: activeShift.id,
          actual_by_method: actualNumeric,
          cashier_notes: shiftNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cerrar el turno');
      toast.success('Cierre y arqueo de caja registrado');
      setActiveShift(null);
      setShiftSummary(null);
      setShiftNotes('');
      setActualCounted({});
      setShiftModalMode(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error cerrando turno');
    } finally {
      setShiftBusy(false);
    }
  }

  async function loadProducts(silent = false) {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/tenant/${slug}/pos/products`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const loadedProducts: Product[] = data.products || [];
        const loadedMethods: PosPaymentMethod[] =
          Array.isArray(data.payment_methods) && data.payment_methods.length > 0
            ? data.payment_methods
            : posPaymentMethods;

        setProducts(loadedProducts);
        if (Array.isArray(data.payment_methods) && data.payment_methods.length > 0) {
          setPosPaymentMethods(data.payment_methods);
          setPaymentMethod((prev) =>
            data.payment_methods.some((m: PosPaymentMethod) => m.code === prev)
              ? prev
              : data.payment_methods[0].code
          );
        }
        const nextSettings: PosSettings = {
          business_name: data.business_name || 'Mi Comercio',
          primary_currency: data.currency || 'USD',
          store_id: data.store_id || null,
          logo_url: data.logo_url || null,
          primary_color: data.primary_color || null,
          secondary_color: data.secondary_color || null,
          accent_color: data.accent_color || null,
        };
        setSettings(nextSettings);
        try {
          localStorage.setItem(`marketos_pos_brand_${slug}`, JSON.stringify(nextSettings));
        } catch {
          // ignore localStorage quota errors
        }
        posDb.catalog_cache
          .put({
            slug,
            products: loadedProducts,
            payment_methods: loadedMethods,
            settings: nextSettings,
            updated_at: Date.now(),
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Error loading POS catalog:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query))
    );
  }, [products, searchQuery]);

  // Cálculos del ticket en USD canónico
  const totalUsd = useMemo(() => {
    return ticket.reduce((sum, item) => {
      return sum + parseFloat(item.product.price_usd) * item.quantity;
    }, 0);
  }, [ticket]);

  // Acciones sobre el ticket
  function addToTicket(product: Product) {
    setTicket((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setTicket((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: Math.min(newQty, 9999) } : null;
          }
          return item;
        })
        .filter(Boolean) as TicketItem[];
    });
  }

  function setExactQuantity(productId: string, newQty: number) {
    if (!Number.isInteger(newQty) || newQty < 1) return;
    setTicket((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(newQty, 9999) }
          : item
      )
    );
  }

  function removeFromTicket(productId: string) {
    setTicket((prev) => prev.filter((item) => item.product.id !== productId));
  }

  function clearTicket() {
    setTicket([]);
  }

  // Procesar cobro y guardar en Dexie (Offline-First en USD)
  async function handleCompleteSale() {
    if (ticket.length === 0 || isProcessing) return;

    try {
      setIsProcessing(true);
      const ticketRef = await generateOfflineTicketRef('POS-01');

      const safePhone = customerPhone.trim().length >= 7 ? customerPhone.trim() : '0000000000';
      const saleRecord = {
        offline_ticket_ref: ticketRef,
        offline_timestamp: Date.now(),
        store_id: settings.store_id || 'default',
        customer_name: customerName.trim() || 'Cliente Mostrador',
        customer_phone: safePhone,
        items: ticket.map((i) => ({
          product_id: i.product.id,
          product_name: i.product.name,
          quantity: i.quantity,
          unit_price_usd: parseFloat(i.product.price_usd),
          total_price_usd: Number((parseFloat(i.product.price_usd) * i.quantity).toFixed(2)),
        })),
        subtotal_usd: Number(totalUsd.toFixed(2)),
        discount_usd: 0,
        tax_usd: 0,
        shipping_usd: 0,
        total_usd: Number(totalUsd.toFixed(2)),
        exchange_rate_applied: 1.0,
        payment: {
          method: paymentMethod,
          amount: Number(totalUsd.toFixed(2)),
          currency: 'USD',
          reference_number: paymentRef || undefined,
        },
        notes: `Cobrado en Mostrador POS-01 · ${settings.business_name} (USD)`,
      };

      // 1. Guardar localmente en Dexie IndexedDB
      await enqueueOfflineSale(saleRecord);

      // 2. Reconciliar inmediatamente con PostgreSQL si hay conexión y actualizar inventario en pantalla
      let syncStatus: 'synced' | 'pending' | 'error' = 'pending';
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const syncRes = await processSyncQueue(slug);
          if (syncRes.success && syncRes.failed === 0) {
            syncStatus = 'synced';
            await Promise.all([loadProducts(true), loadShift()]);
          } else {
            syncStatus = 'error';
          }
        } catch (err) {
          console.warn('Sync queued for next cycle:', err);
          syncStatus = 'pending';
        }
      }
      await refreshPosPendingCount();

      // 3. Confirmación visual de éxito
      setCompletedSale({
        ticketRef,
        totalUsd,
        itemsCount: ticket.reduce((s, i) => s + i.quantity, 0),
        customerName: customerName.trim() || 'Cliente Mostrador',
        paymentMethod,
        items: ticket.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: parseFloat(i.product.price_usd),
          subtotal: parseFloat(i.product.price_usd) * i.quantity,
        })),
        timestamp: new Date().toLocaleString('es-VE'),
        syncStatus,
      });

      // Limpiar ticket
      setTicket([]);
      setIsCheckoutOpen(false);
      setPaymentRef('');
    } catch (err) {
      console.error('Error completing sale:', err);
      alert('Error al registrar la venta en la terminal');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100/80 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col font-sans select-none transition-colors duration-200">
      <TenantThemeInjector
        primaryColor={settings.primary_color}
        secondaryColor={settings.secondary_color}
        accentColor={settings.accent_color}
      />

      {/* Header del POS con identidad de marca reforzada */}
      <header
        className="min-h-[72px] py-2 border-b border-slate-200 dark:border-zinc-800 px-4 sm:px-6 flex items-center justify-between bg-white dark:bg-zinc-900/95 backdrop-blur sticky top-0 z-20 transition-colors print:hidden shadow-xs"
        style={settings.primary_color ? { borderTop: `4px solid ${settings.primary_color}` } : undefined}
      >
        <div className="flex items-center gap-3.5">
          <Link 
            href={`/t/${slug}/admin`} 
            title="Volver al Panel Administrativo"
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 flex items-center justify-center text-slate-800 dark:text-zinc-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-zinc-700 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {settings.logo_url ? (
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.logo_url}
                alt={settings.business_name}
                className="w-full h-full object-contain p-1"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-2xl tenant-secondary-surface border border-lime-500/40 flex items-center justify-center font-black text-base shadow-sm shrink-0">
              {settings.business_name?.charAt(0).toUpperCase() || 'M'}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-extrabold text-slate-950 dark:text-white tracking-tight leading-tight">
                {settings.business_name}
              </h1>
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tenant-secondary-badge border font-mono tracking-wide">
                POS · {slug}
              </span>
            </div>
            <p className="text-xs font-medium text-slate-700 dark:text-zinc-300 mt-0.5">
              Terminal <span className="font-mono font-bold text-slate-950 dark:text-white">POS-01</span> · Moneda <span className="font-mono font-bold text-lime-600 dark:text-lime-400">USD ($)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {activeShift ? (
            <button
              type="button"
              onClick={() => {
                loadShift();
                setShiftModalMode('close');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-500/20 transition cursor-pointer"
              title="Ver resumen y cerrar caja"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Turno Abierto ·</span>
              <span>Cerrar Caja</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShiftModalMode('open')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Abrir Turno</span>
            </button>
          )}
          <ConnectivityIndicator />
          <div className="h-5 w-px bg-slate-200 dark:bg-zinc-800 hidden sm:block" />
          <ThemeToggle />
        </div>
      </header>

      {/* Cuerpo Principal del POS */}
      <main className="flex-1 p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl w-full mx-auto print:hidden">
        {/* Catálogo Rápido de Productos (8 columnas en desktop) */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {/* Barra de búsqueda y conteo */}
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-3 shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por producto, marca o SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-900/80 border border-slate-300 dark:border-zinc-800 rounded-xl text-sm font-medium text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 select-text"
              />
            </div>
            <span className="text-xs font-bold tenant-secondary-badge border font-mono px-3 py-1.5 rounded-xl shrink-0">
              {filteredProducts.length} productos
            </span>
          </div>

          {/* Grid de productos interactivos */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12 bg-white dark:bg-[#121214] rounded-2xl border border-slate-200 dark:border-zinc-800">
              <div className="text-center space-y-2">
                <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">Cargando catálogo de {settings.business_name}...</p>
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white dark:bg-[#121214] rounded-2xl border border-slate-200 dark:border-zinc-800 text-center">
              <Package className="w-10 h-10 text-slate-400 dark:text-zinc-600 mb-2" />
              <p className="text-base font-bold text-slate-800 dark:text-zinc-200">No se encontraron productos</p>
              <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">Prueba con otro término de búsqueda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 overflow-y-auto max-h-[calc(100vh-14.5rem)] pr-1">
              {filteredProducts.map((product) => {
                const price = parseFloat(product.price_usd);
                const stock = parseFloat(product.current_stock || '0');
                const isLow = stock <= parseFloat(product.min_stock_alert || '5');
                const inTicket = ticket.find((item) => item.product.id === product.id);

                return (
                  <button
                    key={product.id}
                    onClick={() => addToTicket(product)}
                    className={`flex flex-col justify-between text-left p-3.5 rounded-2xl bg-white dark:bg-[#121214] border transition-all group active:scale-[0.98] ${
                      inTicket
                        ? 'border-lime-500 ring-1 ring-lime-500/30 shadow-sm'
                        : 'border-slate-200 dark:border-zinc-800/80 hover:border-lime-500/50 hover:shadow-md dark:hover:border-lime-500/40'
                    }`}
                  >
                    <div>
                      {/* Imagen o Placeholder */}
                      <div className="w-full aspect-square rounded-xl bg-slate-100 dark:bg-zinc-800/60 overflow-hidden mb-3 flex items-center justify-center relative">
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={product.image_url} 
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                        ) : (
                          <Package className="w-8 h-8 text-slate-400 dark:text-zinc-600" />
                        )}
                        {inTicket && (
                          <span className="absolute top-2 left-2 text-xs font-mono font-black px-2 py-0.5 rounded-md bg-lime-500 text-black shadow-xs">
                            ×{inTicket.quantity}
                          </span>
                        )}
                        <span className={`absolute top-2 right-2 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xs backdrop-blur-xs ${
                          isLow 
                            ? 'bg-amber-600 text-white' 
                            : 'tenant-secondary-surface opacity-90'
                        }`}>
                          {stock} uds
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-mono font-bold uppercase text-slate-700 dark:text-zinc-300 truncate">
                          {product.sku || 'SKU'}
                        </span>
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-950 dark:text-white line-clamp-2 leading-snug group-hover:text-lime-700 dark:group-hover:text-lime-400 transition-colors">
                        {product.name}
                      </h3>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 dark:border-zinc-800/60 flex items-center justify-between">
                      <p className="text-lg font-black font-mono text-slate-950 dark:text-white">
                        ${price.toFixed(2)}
                      </p>
                      <div className="w-8 h-8 rounded-xl bg-lime-500/10 text-lime-700 dark:text-lime-400 flex items-center justify-center group-hover:bg-lime-500 group-hover:text-black transition-colors">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Panel del Ticket Actual (4-5 columnas en desktop) */}
        <section className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between shadow-sm overflow-hidden h-[calc(100vh-7.5rem)] sticky top-[5.25rem]">
          {/* Header del Ticket con Color Secundario + Borde Primario de Marca */}
          <div
            className="p-4 flex items-center justify-between tenant-secondary-surface border-b-2"
            style={settings.primary_color ? { borderBottomColor: settings.primary_color } : undefined}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-lime-500 flex items-center justify-center shrink-0 shadow-xs">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold uppercase tracking-wider truncate">
                  Ticket Actual
                </h2>
                <p className="text-xs tenant-secondary-muted font-medium mt-0.5 truncate">
                  {ticket.reduce((s, i) => s + i.quantity, 0)} artículos · {settings.business_name}
                </p>
              </div>
            </div>
            {ticket.length > 0 && (
              <button
                onClick={clearTicket}
                className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 transition flex items-center gap-1 cursor-pointer shrink-0"
                title="Vaciar ticket"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar
              </button>
            )}
          </div>

          {/* Listado de ítems en el ticket */}
          <div className="flex-1 p-4 overflow-y-auto divide-y divide-slate-200/80 dark:divide-zinc-800/60">
            {ticket.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600 dark:text-zinc-400">
                {settings.logo_url ? (
                  <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden p-2 mb-3 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settings.logo_url}
                      alt={settings.business_name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-lime-500/10 border border-lime-500/20 flex items-center justify-center mb-3 text-lime-600 dark:text-lime-400">
                    <ShoppingCart className="w-7 h-7" />
                  </div>
                )}
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Mostrador · {settings.business_name}
                </p>
                <p className="text-xs font-medium text-slate-600 dark:text-zinc-400 mt-1 max-w-xs">
                  Haz clic en cualquier producto del catálogo para añadirlo a la venta.
                </p>
              </div>
            ) : (
              ticket.map((item) => {
                const unitPrice = parseFloat(item.product.price_usd);
                const subtotal = unitPrice * item.quantity;
                return (
                  <div key={item.product.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-950 dark:text-white truncate">
                        {item.product.name}
                      </h4>
                      <p className="text-xs font-mono font-semibold text-slate-700 dark:text-zinc-300">
                        ${unitPrice.toFixed(2)} c/u
                      </p>
                    </div>

                    {/* Controles de cantidad con input numérico validado */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer"
                        title="Restar 1"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <PosQuantityInput
                        value={item.quantity}
                        productName={item.product.name}
                        onChange={(newQty) => setExactQuantity(item.product.id, newQty)}
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer"
                        title="Sumar 1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right min-w-[4.5rem] shrink-0">
                      <p className="text-sm font-black font-mono text-slate-950 dark:text-white">
                        ${subtotal.toFixed(2)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeFromTicket(item.product.id)}
                        className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 cursor-pointer mt-0.5 inline-flex items-center gap-0.5"
                        title="Quitar del ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer del Ticket y Botón de Cobro */}
          <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/40 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-base font-extrabold text-slate-950 dark:text-white">
                  Total a Cobrar (USD)
                </span>
                <span className="text-2xl font-black font-mono text-lime-600 dark:text-lime-400">
                  ${totalUsd.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsCheckoutOpen(true)}
              disabled={ticket.length === 0}
              className="w-full py-3.5 px-4 rounded-xl font-extrabold text-base bg-lime-500 hover:bg-lime-600 disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-500 dark:disabled:text-zinc-600 text-black shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <CreditCard className="w-5 h-5" />
              <span>Cobrar Ticket (${totalUsd.toFixed(2)})</span>
            </button>

            <div className="pt-2 text-center border-t border-slate-200/80 dark:border-zinc-800/60">
              <p className="text-xs font-medium text-slate-600 dark:text-zinc-400 truncate">
                Terminal autorizada · <span className="font-bold text-slate-900 dark:text-zinc-200">{settings.business_name}</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Modal de Cobro */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                {settings.logo_url ? (
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settings.logo_url}
                      alt={settings.business_name}
                      className="w-full h-full object-contain p-0.5"
                    />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-lime-500/10 border border-lime-500/30 flex items-center justify-center text-lime-700 dark:text-lime-400 font-extrabold text-xs shrink-0">
                    {settings.business_name?.charAt(0).toUpperCase() || 'POS'}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                    Cobro en Mostrador · {settings.business_name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                    Terminal POS-01 · Operación Offline-First (USD)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Totalizador en Modal con branding */}
            <div className="p-4 rounded-2xl bg-lime-500/10 border border-lime-500/20 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-lime-800 dark:text-lime-400">
                Monto Total a Recibir (USD)
              </p>
              <p className="text-3xl font-black font-mono text-lime-800 dark:text-lime-300 mt-1">
                ${totalUsd.toFixed(2)}
              </p>
            </div>

            {/* Datos del Cliente */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Nombre del Cliente
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                placeholder="Cliente Mostrador"
              />
            </div>

            {/* Selección de Método de Pago (Administrables por el comercio) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                Método de Pago
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {posPaymentMethods.map((pm) => {
                  const selected = paymentMethod === pm.code;
                  const isCash = pm.code.includes('CASH');
                  return (
                    <button
                      key={pm.code}
                      type="button"
                      onClick={() => setPaymentMethod(pm.code)}
                      className={`p-3 rounded-xl border flex flex-col items-center text-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
                        selected
                          ? 'bg-lime-500/15 border-lime-500 text-lime-700 dark:text-lime-400 ring-1 ring-lime-500/30'
                          : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      {isCash ? (
                        <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <CreditCard className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      )}
                      <span className="line-clamp-1">{pm.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Referencia para pagos no en efectivo */}
            {paymentMethod !== 'CASH_USD' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                  Número de Referencia / Aprobación (Opcional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Ej: APROB-8492 o 123456"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                />
              </div>
            )}

            {/* Botones de acción */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 rounded-xl font-extrabold text-xs bg-lime-500 hover:bg-lime-600 text-black shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Procesando...' : `Confirmar ($${totalUsd.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ticket Completado */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header del Ticket con Logo de la Empresa */}
            <div className="flex flex-col items-center justify-center gap-2">
              {settings.logo_url ? (
                <div className="w-14 h-14 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center overflow-hidden shadow-xs p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.logo_url}
                    alt={settings.business_name}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto text-2xl">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
              )}
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  ¡Venta Despachada!
                </h3>
                <p className="text-xs font-bold text-lime-700 dark:text-lime-400 uppercase tracking-wider">
                  {settings.business_name}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 font-mono">
                  {completedSale.timestamp}
                </p>
              </div>
            </div>

            {/* Resumen del Ticket Físico / Digital */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 space-y-2 text-xs text-left">
              <div className="flex justify-between border-b border-slate-200 dark:border-zinc-800 pb-1.5">
                <span className="text-slate-500">Ticket Ref:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {completedSale.ticketRef}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cliente:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {completedSale.customerName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Método:</span>
                <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                  {posPaymentMethods.find((m) => m.code === completedSale.paymentMethod)?.name ||
                    completedSale.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Artículos:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {completedSale.itemsCount} uds
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-zinc-800 pt-1.5">
                <span className="font-bold text-slate-900 dark:text-white">Total USD:</span>
                <span className="font-mono font-black text-lime-600 dark:text-lime-400 text-sm">
                  ${completedSale.totalUsd.toFixed(2)}
                </span>
              </div>
              <div className="pt-1 flex justify-end">
                {completedSale.syncStatus === 'synced' ? (
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                    ✓ Inventario descontado y sincronizado
                  </span>
                ) : completedSale.syncStatus === 'error' ? (
                  <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                    ⚠ Reintento pendiente en sincronización
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                    ⏳ Guardado en cola offline
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-lime-500 hover:bg-lime-600 text-black shadow-sm transition cursor-pointer"
              >
                Nuevo Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket imprimible para impresora térmica o estándar (Solo visible al imprimir) */}
      {completedSale && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-4 font-mono text-xs z-[9999]">
          <div className="text-center pb-2 border-b border-black">
            {settings.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo_url}
                alt={settings.business_name}
                className="w-12 h-12 object-contain mx-auto mb-1"
              />
            )}
            <h2 className="text-sm font-bold uppercase">{settings.business_name}</h2>
            <p className="text-[10px]">Punto de Venta Mostrador (POS-01)</p>
            <p className="text-[10px] mt-0.5">{completedSale.timestamp}</p>
          </div>
          <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
            <p><strong>Ticket:</strong> {completedSale.ticketRef}</p>
            <p><strong>Cliente:</strong> {completedSale.customerName}</p>
            <p><strong>Pago:</strong> {posPaymentMethods.find((m) => m.code === completedSale.paymentMethod)?.name || completedSale.paymentMethod}</p>
          </div>
          <div className="py-2 border-b border-black space-y-1.5">
            {completedSale.items.map((it, idx) => (
              <div key={idx} className="flex justify-between items-start gap-3 text-[11px] leading-snug">
                <span className="flex-1 break-words whitespace-normal font-medium">
                  {it.quantity}x {it.name}
                </span>
                <span className="shrink-0 font-bold tabular-nums">
                  ${it.subtotal.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="pt-2 text-right">
            <p className="text-sm font-black">TOTAL USD: ${completedSale.totalUsd.toFixed(2)}</p>
          </div>
          <div className="text-center pt-4 text-[9px] text-zinc-600">
            <p>¡Gracias por su compra en {settings.business_name}!</p>
            <p>MarketOS v4.0 · Offline-First Retail Core</p>
          </div>
        </div>
      )}

      {/* Modal de Apertura / Cierre de Caja (Arqueo) */}
      {shiftModalMode && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
          onClick={() => !shiftBusy && setShiftModalMode(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950 dark:text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-[var(--tenant-primary)]" />
                {shiftModalMode === 'open' ? 'Abrir Turno de Caja (POS-01)' : 'Cierre y Arqueo de Caja'}
              </h3>
              <button
                type="button"
                disabled={shiftBusy}
                onClick={() => setShiftModalMode(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {shiftModalMode === 'open' ? (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <p className="text-xs text-slate-700 dark:text-zinc-300">
                  Registra el fondo inicial de efectivo en USD para iniciar el arqueo del turno.
                </p>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 block mb-1">
                    Fondo Inicial en Efectivo (USD $)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-base font-mono font-bold text-slate-950 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={shiftBusy}
                  style={{
                    backgroundColor: 'var(--tenant-primary)',
                    color: 'var(--tenant-primary-fg)',
                  }}
                  className="w-full h-11 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50"
                >
                  {shiftBusy ? 'Abriendo turno...' : 'Confirmar Apertura de Caja'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleCloseShift} className="space-y-4">
                {shiftSummary && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">Fondo inicial USD:</span>
                      <span className="font-mono font-bold text-slate-950 dark:text-white">
                        ${shiftSummary.openingUsd.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-zinc-400">Cobrado en turno ({shiftSummary.salesCount} ops):</span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        ${shiftSummary.totalCollectedUsd.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {(shiftSummary?.methods || posPaymentMethods).map((m) => {
                    const expectedVal = shiftSummary?.expectedByMethod?.[m.code] ?? 0;
                    return (
                      <div key={m.code} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <label className="font-bold text-slate-800 dark:text-zinc-200">
                            {m.name} ({m.code})
                          </label>
                          <span className="font-mono text-slate-600 dark:text-zinc-400">
                            Esperado: ${expectedVal.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={expectedVal.toFixed(2)}
                          value={actualCounted[m.code] ?? ''}
                          onChange={(e) =>
                            setActualCounted((prev) => ({ ...prev, [m.code]: e.target.value }))
                          }
                          className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-sm font-mono font-bold text-slate-950 dark:text-white"
                        />
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                    Observaciones de cierre (opcional)
                  </label>
                  <input
                    type="text"
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Ej: Cuadre exacto sin novedades"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 text-sm text-slate-950 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={shiftBusy}
                  style={{
                    backgroundColor: 'var(--tenant-primary)',
                    color: 'var(--tenant-primary-fg)',
                  }}
                  className="w-full h-11 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50"
                >
                  {shiftBusy ? 'Sellando arqueo...' : 'Sellar Cierre de Caja'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
