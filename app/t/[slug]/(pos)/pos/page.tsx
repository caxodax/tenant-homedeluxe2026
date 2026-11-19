'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { usePosBrand } from '../components/pos-brand-provider';
import { startPosHeartbeat, stopPosHeartbeat, refreshPosPendingCount } from '@/lib/pos/heartbeat';
import { ThemeToggle } from '@/components/theme-toggle';
import { LogoutButton } from '@/components/auth/logout-button';
import { TenantThemeInjector } from '@/components/tenant-theme-injector';
import { enqueueOfflineSale, processSyncQueue } from '@/lib/pos/sync-queue';
import { generateOfflineTicketRef } from '@/lib/pos/offline-numbering';
import { posDb } from '@/lib/pos/offline-db';
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  ArrowLeft, ArrowRight, Search, Plus, Minus, Trash2, ShoppingCart, ShoppingBag,
  CreditCard, Banknote, CheckCircle2, RotateCcw,
  Package, Printer, Lock, Unlock, X, Calculator, ChevronDown,
  Bike, MapPin, Store, Tag, Percent, UtensilsCrossed, SlidersHorizontal, FileText
} from 'lucide-react';
import { ModalPortal } from '@/components/ui/modal-portal';
import { FormattedDescription } from '@/components/ui/formatted-description';
import { PosPreordersModal } from './pos-preorders-modal';
import {
  FoodProductCustomizerModal,
  type ProductVariant,
  type ModifierGroup,
  type CustomizerResult,
} from '@/components/food-service/food-product-customizer-modal';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  price_usd: string;
  current_stock: string;
  min_stock_alert: string;
  category_id: string;
  category_name?: string;
  image_url?: string;
  is_tax_exempt?: boolean;
  variants?: ProductVariant[];
  modifier_groups?: ModifierGroup[];
}

interface PosSettings {
  business_name: string;
  primary_currency: string;
  secondary_currency?: string | null;
  exchange_rate?: number | null;
  store_id?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  tax_enabled?: boolean;
  tax_rate?: number;
  prices_include_tax?: boolean;
  discount_settings?: {
    allow_stacked: boolean;
    presets: Array<{
      id: string;
      name: string;
      type: 'PERCENTAGE' | 'FIXED_AMOUNT';
      value: number;
      is_active: boolean;
    }>;
  };
}

interface TicketItem {
  ticket_item_id?: string;
  product: Product;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  unit_price?: number;
  selected_modifiers?: Array<{ id: string; name: string; price: number }>;
  prep_notes?: string;
}

interface PosPageProps {
  params: Promise<{ slug: string }>;
}

function PosQuantityInput({
  value,
  onChange,
  productName,
  maxStock,
}: {
  value: number;
  onChange: (newQty: number) => void;
  productName: string;
  maxStock?: number;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const effectiveMax = typeof maxStock === 'number' && maxStock > 0 ? maxStock : 9999;

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    setDraft(digitsOnly);
    if (digitsOnly.length > 0) {
      const parsed = parseInt(digitsOnly, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        onChange(Math.min(parsed, effectiveMax));
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
      const clamped = Math.min(parsed, effectiveMax);
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

  // Estado de descuentos aplicados al ticket (Core V4)
  const [appliedDiscounts, setAppliedDiscounts] = useState<Array<{
    id: string;
    name: string;
    type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    value: number;
    amount_primary: number;
  }>>([]);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [manualDiscountName, setManualDiscountName] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [manualDiscountValue, setManualDiscountValue] = useState('');
  const [tenderCurrency, setTenderCurrency] = useState<'BASE' | 'VES'>('BASE');
  const [tenderAmount, setTenderAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<Product | null>(null);
  const [customizerProduct, setCustomizerProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState<number>(1);
  const [isMobileTicketOpen, setIsMobileTicketOpen] = useState<boolean>(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Plugins Delivery Fleet y Food Service en POS
  const [isDeliveryActive, setIsDeliveryActive] = useState(false);
  const [deliveryZones, setDeliveryZones] = useState<Array<{ id: string; name: string; rate_primary: number; estimated_time?: string }>>([]);
  const [isFoodServiceActive, setIsFoodServiceActive] = useState(false);
  const [foodServiceTables, setFoodServiceTables] = useState<Array<{ id: string; label: string; status: string; seats: number }>>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [daily86Ids, setDaily86Ids] = useState<string[]>([]);
  const [posDeliveryType, setPosDeliveryType] = useState<'PICKUP' | 'DELIVERY' | 'DINE_IN'>('PICKUP');
  const [selectedPosZoneId, setSelectedPosZoneId] = useState<string>('');
  const [posDeliveryAddress, setPosDeliveryAddress] = useState<string>('');

  // Plugin Vendedores y Cotizaciones (sales_team)
  const [isSalesTeamActive, setIsSalesTeamActive] = useState<boolean>(false);
  const [salesReps, setSalesReps] = useState<Array<{ id: string; full_name: string }>>([]);
  const [selectedSalesRepId, setSelectedSalesRepId] = useState<string>('');
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [activeQuoteNumber, setActiveQuoteNumber] = useState<string | null>(null);
  const [activeQuoteDetails, setActiveQuoteDetails] = useState<{
    customer_name?: string;
    customer_whatsapp?: string;
    customer_id_number?: string;
    sales_rep_name?: string;
    customer_notes?: string;
    internal_notes?: string;
    additional_services_primary?: number;
    additional_services_note?: string;
  } | null>(null);
  const [posNotes, setPosNotes] = useState<string>('');
  const [isPreordersModalOpen, setIsPreordersModalOpen] = useState<boolean>(false);

  const baseCurrency = settings.primary_currency || 'USD';
  const currencySymbol = baseCurrency === 'EUR' ? '€' : '$';
  const effectiveRate = Number(settings.exchange_rate || 0);

  const selectedPosZone = deliveryZones.find((z) => z.id === selectedPosZoneId) || deliveryZones[0] || null;
  const selectedTable = foodServiceTables.find((t) => t.id === selectedTableId) || foodServiceTables[0] || null;
  const posDeliveryRate = posDeliveryType === 'DELIVERY' ? Number(selectedPosZone?.rate_primary || 0) : 0;

  const [completedSale, setCompletedSale] = useState<{
    ticketRef: string;
    totalUsd: number;
    totalSecondary?: number;
    itemsCount: number;
    customerName: string;
    paymentMethod: string;
    deliveryType?: 'PICKUP' | 'DELIVERY' | 'DINE_IN';
    deliveryRate?: number;
    deliveryZoneName?: string;
    deliveryAddress?: string;
    tableLabel?: string;
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
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
        if (Array.isArray(data.payment_methods) && data.payment_methods.length > 0) {
          setPosPaymentMethods(data.payment_methods);
          setPaymentMethod((prev) =>
            data.payment_methods.some((m: PosPaymentMethod) => m.code === prev)
              ? prev
              : data.payment_methods[0].code
          );
        }
        if (typeof data.is_delivery_active === 'boolean') {
          setIsDeliveryActive(data.is_delivery_active);
        }
        if (typeof data.is_food_service_active === 'boolean') {
          setIsFoodServiceActive(data.is_food_service_active);
        }
        if (Array.isArray(data.food_service_tables)) {
          setFoodServiceTables(data.food_service_tables);
          if (data.food_service_tables.length > 0) {
            setSelectedTableId((prev) => prev || data.food_service_tables[0].id);
          }
        }
        if (Array.isArray(data.daily_86_ids)) {
          setDaily86Ids(data.daily_86_ids);
        }
        if (Array.isArray(data.delivery_zones)) {
          setDeliveryZones(data.delivery_zones);
          if (data.delivery_zones.length > 0) {
            setSelectedPosZoneId((prev) => prev || data.delivery_zones[0].id);
          }
        }
        if (typeof data.is_sales_team_active === 'boolean') {
          setIsSalesTeamActive(data.is_sales_team_active);
        }
        if (Array.isArray(data.sales_reps)) {
          setSalesReps(data.sales_reps);
        }
        const nextSettings: PosSettings = {
          business_name: data.business_name || 'Mi Comercio',
          primary_currency: data.currency || 'USD',
          secondary_currency: data.secondary_currency || 'VES',
          exchange_rate: data.exchange_rate ? Number(data.exchange_rate) : null,
          store_id: data.store_id || null,
          logo_url: data.logo_url || null,
          primary_color: data.primary_color || null,
          secondary_color: data.secondary_color || null,
          accent_color: data.accent_color || null,
          tax_enabled: data.tax_settings?.tax_enabled ?? true,
          tax_rate: typeof data.tax_settings?.tax_rate === 'number' ? data.tax_settings.tax_rate : 16.0,
          prices_include_tax: Boolean(data.tax_settings?.prices_include_tax),
          discount_settings: data.discount_settings || {
            allow_stacked: false,
            presets: [],
          },
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

  // Lista de categorías disponibles (de API o inferidas de productos)
  const availableCategories = useMemo(() => {
    if (categories.length > 0) return categories;
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.category_id) {
        map.set(p.category_id, p.category_name || 'Categoría');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [categories, products]);

  // Filtrado de productos por búsqueda de texto y por categoría (Combobox)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Filtro de categoría seleccionada
      if (selectedCategory !== 'ALL' && p.category_id !== selectedCategory) {
        return false;
      }
      // Filtro de texto de búsqueda
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.category_name && p.category_name.toLowerCase().includes(query))
      );
    });
  }, [products, searchQuery, selectedCategory]);

  // Cálculos tributarios canónicos (Core + Plugin)
  const taxCalculations = useMemo(() => {
    const isTaxActive = settings.tax_enabled ?? true;
    const taxRatePercent = Number(settings.tax_rate ?? 16);
    const taxRate = taxRatePercent / 100;
    const pricesIncludeTax = Boolean(settings.prices_include_tax);

    let subtotalExempt = 0;
    let subtotalTaxable = 0;

    for (const item of ticket) {
      const itemPrice = item.unit_price ?? parseFloat(item.product.price_usd);
      const line = itemPrice * item.quantity;
      if (item.product.is_tax_exempt) {
        subtotalExempt += line;
      } else {
        subtotalTaxable += line;
      }
    }

    const subtotal = subtotalExempt + subtotalTaxable;

    // Calcular montos de descuento según subtotal bruto
    let totalDiscountAmount = 0;
    for (const d of appliedDiscounts) {
      if (d.type === 'PERCENTAGE') {
        totalDiscountAmount += Number(((subtotal * d.value) / 100).toFixed(2));
      } else {
        totalDiscountAmount += Number(d.value);
      }
    }
    const discountAmount = Number(Math.min(totalDiscountAmount, subtotal).toFixed(2));
    const netSubtotal = Math.max(0, subtotal - discountAmount);

    // Ajustar bases imponibles proporcionalmente
    const taxableRatio = subtotal > 0 ? subtotalTaxable / subtotal : 0;
    const netTaxable = Math.max(0, subtotalTaxable - (discountAmount * taxableRatio));
    const netExempt = Math.max(0, subtotalExempt - (discountAmount * (1 - taxableRatio)));

    let vatAmount = 0;
    if (isTaxActive && taxRate > 0) {
      if (pricesIncludeTax) {
        vatAmount = Number((netTaxable - netTaxable / (1 + taxRate)).toFixed(2));
      } else {
        vatAmount = Number((netTaxable * taxRate).toFixed(2));
      }
    }

    // IGTF 3% (Regla del Plugin local_venezuela sobre pagos en divisas en efectivo - solo si modo fiscal activo)
    const isCashDivisas = paymentMethod === 'CASH_USD' || paymentMethod === 'CASH_EUR';
    const baseForIgtf = pricesIncludeTax ? netSubtotal : netSubtotal + vatAmount;
    const igtfAmount = (isTaxActive && isCashDivisas) ? Number((baseForIgtf * 0.03).toFixed(2)) : 0;

    const finalTotal = !isTaxActive
      ? Number((netSubtotal + posDeliveryRate).toFixed(2))
      : pricesIncludeTax
        ? Number((netSubtotal + posDeliveryRate + igtfAmount).toFixed(2))
        : Number((netSubtotal + vatAmount + igtfAmount + posDeliveryRate).toFixed(2));

    return {
      subtotalExempt: Number(netExempt.toFixed(2)),
      subtotalTaxable: Number(netTaxable.toFixed(2)),
      rawSubtotal: Number(subtotal.toFixed(2)),
      subtotal: Number(subtotal.toFixed(2)),
      netSubtotal: Number(netSubtotal.toFixed(2)),
      discountAmount,
      vatAmount: Number(vatAmount.toFixed(2)),
      igtfAmount: Number(igtfAmount.toFixed(2)),
      deliveryRate: posDeliveryRate,
      finalTotal,
      taxRatePercent,
      pricesIncludeTax,
      isTaxActive,
    };
  }, [ticket, settings, paymentMethod, posDeliveryRate, appliedDiscounts]);

  const totalUsd = taxCalculations.finalTotal;

  function applyPresetDiscount(preset: { id: string; name: string; type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number }) {
    const rawSubtotal = taxCalculations.rawSubtotal;
    if (rawSubtotal <= 0) {
      toast.error('Agrega productos al ticket antes de aplicar un descuento');
      return;
    }

    let calculatedAmount = 0;
    if (preset.type === 'PERCENTAGE') {
      calculatedAmount = Number(((rawSubtotal * preset.value) / 100).toFixed(2));
    } else {
      calculatedAmount = Number(Math.min(preset.value, rawSubtotal).toFixed(2));
    }

    const newDisc = {
      id: preset.id || `disc_${Date.now()}`,
      name: preset.name,
      type: preset.type,
      value: preset.value,
      amount_primary: calculatedAmount,
    };

    const allowStacked = Boolean(settings.discount_settings?.allow_stacked);
    if (allowStacked) {
      setAppliedDiscounts((prev) => [...prev.filter((d) => d.id !== newDisc.id), newDisc]);
    } else {
      setAppliedDiscounts([newDisc]);
    }
    setIsDiscountModalOpen(false);
    toast.success(`Descuento "${preset.name}" aplicado`);
  }

  function applyCustomDiscount(e: React.FormEvent) {
    e.preventDefault();
    const rawSubtotal = taxCalculations.rawSubtotal;
    if (rawSubtotal <= 0) {
      toast.error('Agrega productos al ticket antes de aplicar un descuento');
      return;
    }
    const val = parseFloat(manualDiscountValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Ingresa un valor de descuento válido');
      return;
    }
    if (manualDiscountType === 'PERCENTAGE' && val > 100) {
      toast.error('El porcentaje no puede ser mayor a 100%');
      return;
    }

    const name = manualDiscountName.trim() || (manualDiscountType === 'PERCENTAGE' ? `Descuento ${val}%` : `Descuento -$${val.toFixed(2)}`);
    let calculatedAmount = 0;
    if (manualDiscountType === 'PERCENTAGE') {
      calculatedAmount = Number(((rawSubtotal * val) / 100).toFixed(2));
    } else {
      calculatedAmount = Number(Math.min(val, rawSubtotal).toFixed(2));
    }

    const newDisc = {
      id: `manual_${Date.now()}`,
      name,
      type: manualDiscountType,
      value: val,
      amount_primary: calculatedAmount,
    };

    const allowStacked = Boolean(settings.discount_settings?.allow_stacked);
    if (allowStacked) {
      setAppliedDiscounts((prev) => [...prev, newDisc]);
    } else {
      setAppliedDiscounts([newDisc]);
    }

    setManualDiscountName('');
    setManualDiscountValue('');
    setIsDiscountModalOpen(false);
    toast.success(`Descuento "${name}" aplicado`);
  }

  function removeDiscount(id: string) {
    setAppliedDiscounts((prev) => prev.filter((d) => d.id !== id));
    toast.info('Descuento eliminado');
  }

  function handleLoadQuote(quoteData: any, quoteItems: any[]) {
    const cName = quoteData.customer_name || 'Cliente Mostrador';
    const cPhone = quoteData.customer_whatsapp || '';
    setCustomerName(cName);
    setCustomerPhone(cPhone);
    setActiveQuoteId(quoteData.id);
    setActiveQuoteNumber(quoteData.quote_number);
    if (quoteData.sales_rep_id) {
      setSelectedSalesRepId(quoteData.sales_rep_id);
    }

    const repName = quoteData.sales_rep_name || salesReps.find((r) => r.id === quoteData.sales_rep_id)?.full_name || 'Asesor Asignado';
    setActiveQuoteDetails({
      customer_name: cName,
      customer_whatsapp: cPhone,
      customer_id_number: quoteData.customer_id_number || '',
      sales_rep_name: repName,
      customer_notes: quoteData.customer_notes || '',
      internal_notes: quoteData.internal_notes || '',
      additional_services_primary: parseFloat(String(quoteData.additional_services_primary || 0)),
      additional_services_note: quoteData.additional_services_note || '',
    });

    const combinedNotes = [quoteData.customer_notes, quoteData.internal_notes].filter(Boolean).join(' · ');
    setPosNotes(combinedNotes);

    const newTicketItems = quoteItems.map((qi: any) => {
      const prodMatch = products.find((p) => p.id === qi.product_id);
      const fallbackProd: Product = {
        id: qi.product_id,
        name: qi.product_name,
        sku: qi.sku || '',
        price_usd: String(qi.unit_price_primary || 0),
        current_stock: '999',
        min_stock_alert: '0',
        category_id: '',
        is_tax_exempt: false,
      };
      return {
        product: prodMatch || fallbackProd,
        quantity: parseFloat(String(qi.quantity)) || 1,
        unit_price: parseFloat(String(qi.unit_price_primary)) || 0,
        prep_notes: qi.notes || undefined,
      };
    });

    // Cargar servicios adicionales de la cotización si existen (ej. flete, instalación, almohadas)
    const additionalAmt = parseFloat(String(quoteData.additional_services_primary || 0));
    if (additionalAmt > 0) {
      newTicketItems.push({
        product: {
          id: 'servicios-adicionales-st',
          name: quoteData.additional_services_note || 'Servicios Adicionales (Transporte / Instalación)',
          sku: 'SERV-ST',
          price_usd: String(additionalAmt),
          current_stock: '999',
          min_stock_alert: '0',
          category_id: '',
          is_tax_exempt: false,
        },
        quantity: 1,
        unit_price: additionalAmt,
        prep_notes: quoteData.additional_services_note || 'Servicio cotizado',
      });
    }

    setTicket(newTicketItems);

    const discPrimary = parseFloat(String(quoteData.discount_primary || 0));
    if (discPrimary > 0) {
      setAppliedDiscounts([
        {
          id: `quote-disc-${quoteData.id}`,
          name: `Descuento Cotización ${quoteData.quote_number}`,
          type: 'FIXED_AMOUNT',
          value: discPrimary,
          amount_primary: discPrimary,
        },
      ]);
    } else {
      setAppliedDiscounts([]);
    }

    toast.success(`Preorden ${quoteData.quote_number} cargada con ${newTicketItems.length} ítem(s)`);
  }

  // Acciones sobre el ticket
  function addToTicket(product: Product) {
    if (daily86Ids.includes(product.id)) {
      toast.error(`"${product.name}" está marcado como AGOTADO (86) hoy en cocina`, {
        icon: '🚫',
      });
      return;
    }
    const stock = Math.max(0, parseFloat(product.current_stock || '0'));
    if (stock <= 0) {
      toast.error(`"${product.name}" no tiene existencias disponibles en inventario.`, {
        icon: '🚫',
      });
      return;
    }

    setTicket((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= stock) {
          toast.warning(`Tope alcanzado: Solo hay ${stock} uds disponibles de "${product.name}".`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, stock) }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function handleCustomizerConfirm(res: CustomizerResult) {
    const itemKey = `${res.product_id}_${res.variant_id || 'base'}_${(res.selected_modifiers || []).map((m) => m.id).sort().join(',')}`;
    const p = products.find((prod) => prod.id === res.product_id);
    if (!p) return;
    const stock = Math.max(0, parseFloat(p.current_stock || '0'));
    if (stock <= 0) {
      toast.error(`"${p.name}" está agotado en inventario.`);
      return;
    }

    setTicket((prev) => {
      const existingIdx = prev.findIndex((item) => (item.ticket_item_id || item.product.id) === itemKey);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        if (existing.quantity >= stock) {
          toast.warning(`Tope alcanzado: Solo hay ${stock} unidades disponibles de "${p.name}".`);
          return prev;
        }
        const next = [...prev];
        next[existingIdx] = {
          ...existing,
          quantity: Math.min(existing.quantity + res.quantity, stock),
        };
        return next;
      }

      const safeQty = Math.min(res.quantity, stock);
      return [
        ...prev,
        {
          ticket_item_id: itemKey,
          product: p,
          quantity: safeQty,
          variant_id: res.variant_id,
          variant_name: res.variant_name,
          unit_price: res.unit_price,
          selected_modifiers: res.selected_modifiers,
          prep_notes: res.prep_notes,
        },
      ];
    });

    toast.success(`${res.quantity} × ${p.name} en el ticket`, {
      description: res.variant_name ? `${res.variant_name}` : undefined,
    });
  }

  function updateQuantity(itemKeyOrId: string, delta: number) {
    setTicket((prev) => {
      return prev
        .map((item) => {
          if ((item.ticket_item_id || item.product.id) === itemKeyOrId || item.product.id === itemKeyOrId) {
            const stock = Math.max(0, parseFloat(item.product.current_stock || '0'));
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (delta > 0 && stock > 0 && newQty > stock) {
              toast.warning(`Tope alcanzado: Solo hay ${stock} unidades disponibles de "${item.product.name}".`);
              return { ...item, quantity: stock };
            }
            return { ...item, quantity: stock > 0 ? Math.min(newQty, stock) : newQty };
          }
          return item;
        })
        .filter(Boolean) as TicketItem[];
    });
  }

  function setExactQuantity(productId: string, newQty: number) {
    if (!Number.isInteger(newQty) || newQty < 1) return;
    const targetProd = products.find((p) => p.id === productId);
    const stock = targetProd ? Math.max(0, parseFloat(targetProd.current_stock || '0')) : 9999;
    const clamped = stock > 0 ? Math.min(newQty, stock) : newQty;

    setTicket((prev) => {
      const existing = prev.find((item) => item.product.id === productId);
      if (existing) {
        return prev.map((item) =>
          item.product.id === productId
            ? { ...item, quantity: clamped }
            : item
        );
      }
      if (targetProd && clamped > 0) {
        return [...prev, { product: targetProd, quantity: clamped }];
      }
      return prev;
    });
  }

  function removeFromTicket(itemKeyOrId: string) {
    setTicket((prev) => prev.filter((item) => (item.ticket_item_id || item.product.id) !== itemKeyOrId && item.product.id !== itemKeyOrId));
  }

  function clearTicket() {
    setTicket([]);
    setAppliedDiscounts([]);
    setActiveQuoteId(null);
    setActiveQuoteNumber(null);
    setActiveQuoteDetails(null);
    setSelectedSalesRepId('');
    setCustomerName('Cliente Mostrador');
    setCustomerPhone('');
    setPosNotes('');
  }

  function handleUnlinkQuote() {
    clearTicket();
    toast.info('Ticket limpiado y preorden desvinculada exitosamente');
  }

  // Procesar cobro y guardar en Dexie (Offline-First en USD)
  async function handleCompleteSale() {
    if (ticket.length === 0 || isProcessing) return;

    if (!activeShift || activeShift.status !== 'OPEN') {
      toast.error('Caja Cerrada', {
        description: 'Debes abrir un turno de caja antes de registrar cobros en mostrador.',
      });
      setIsCheckoutOpen(false);
      setShiftModalMode('open');
      return;
    }

    try {
      setIsProcessing(true);
      const ticketRef = await generateOfflineTicketRef('POS-01');

      const safePhone = customerPhone.trim().length >= 7 ? customerPhone.trim() : '0000000000';
      const discNote = appliedDiscounts.length > 0 
        ? ` · Desc: ${appliedDiscounts.map(d => `${d.name} (-$${d.amount_primary.toFixed(2)})`).join(', ')}` 
        : '';

      const saleRecord = {
        offline_ticket_ref: ticketRef,
        offline_timestamp: Date.now(),
        store_id: settings.store_id || 'default',
        customer_name: customerName.trim() || 'Cliente Mostrador',
        customer_phone: safePhone,
        items: ticket.map((i) => {
          const itemPrice = i.unit_price ?? parseFloat(i.product.price_usd);
          return {
            product_id: i.product.id,
            product_name: i.variant_name ? `${i.product.name} (${i.variant_name})` : i.product.name,
            quantity: i.quantity,
            variant_id: i.variant_id,
            unit_price_usd: itemPrice,
            total_price_usd: Number((itemPrice * i.quantity).toFixed(2)),
            unit_price_primary: itemPrice,
            total_price_primary: Number((itemPrice * i.quantity).toFixed(2)),
            metadata: {
              variant_id: i.variant_id,
              variant_name: i.variant_name,
              modifiers: i.selected_modifiers,
              prep_notes: i.prep_notes,
              is_custom_quote: Boolean(i.selected_modifiers && i.selected_modifiers.length > 0),
            },
          };
        }),
        subtotal_usd: taxCalculations.subtotal,
        subtotal_primary: taxCalculations.subtotal,
        discount_usd: taxCalculations.discountAmount,
        discount_primary: taxCalculations.discountAmount,
        tax_usd: !taxCalculations.isTaxActive ? 0 : taxCalculations.pricesIncludeTax ? taxCalculations.igtfAmount : Number((taxCalculations.vatAmount + taxCalculations.igtfAmount).toFixed(2)),
        tax_primary: !taxCalculations.isTaxActive ? 0 : taxCalculations.pricesIncludeTax ? taxCalculations.igtfAmount : Number((taxCalculations.vatAmount + taxCalculations.igtfAmount).toFixed(2)),
        shipping_usd: posDeliveryRate,
        shipping_primary: posDeliveryRate,
        total_usd: Number(totalUsd.toFixed(2)),
        total_primary: Number(totalUsd.toFixed(2)),
        total_secondary: effectiveRate > 0 ? Number((totalUsd * effectiveRate).toFixed(2)) : null,
        exchange_rate_applied: effectiveRate > 0 ? effectiveRate : 1.0,
        discounts_applied: appliedDiscounts,
        payment: {
          method: paymentMethod,
          amount: (paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'CASH_LOCAL' || ((paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'CARD') && effectiveRate > 1))
            ? Number((totalUsd * (effectiveRate > 0 ? effectiveRate : 1.0)).toFixed(2))
            : Number(totalUsd.toFixed(2)),
          currency: (paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'CASH_LOCAL' || ((paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'CARD') && effectiveRate > 1)) ? 'VES' : 'USD',
          reference_number: paymentRef || undefined,
        },
        notes: [
          posDeliveryType === 'DELIVERY'
            ? `Delivery: ${selectedPosZone?.name || 'Zona'} · Dirección: ${posDeliveryAddress || customerName} · Cobrado en Mostrador POS-01`
            : `Cobrado en Mostrador POS-01 · ${settings.business_name}${effectiveRate > 0 ? ` (Tasa: ${effectiveRate.toFixed(2)})` : ''}`,
          discNote ? discNote.replace(/^ · /, '') : null,
          posNotes.trim() ? `Observaciones: ${posNotes.trim()}` : null,
        ].filter(Boolean).join(' · '),
        sales_rep_id: selectedSalesRepId || null,
        quote_id: activeQuoteId || null,
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
        totalSecondary: effectiveRate > 0 ? Number((totalUsd * effectiveRate).toFixed(2)) : undefined,
        itemsCount: ticket.reduce((s, i) => s + i.quantity, 0),
        customerName: customerName.trim() || 'Cliente Mostrador',
        paymentMethod,
        deliveryType: posDeliveryType,
        deliveryRate: posDeliveryRate,
        deliveryZoneName: selectedPosZone?.name,
        deliveryAddress: posDeliveryAddress,
        tableLabel: selectedTable?.label,
        items: ticket.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: parseFloat(i.product.price_usd),
          subtotal: parseFloat(i.product.price_usd) * i.quantity,
        })),
        timestamp: new Date().toLocaleString('es-VE'),
        syncStatus,
      });

      // Limpiar ticket y estado de cobro
      setTicket([]);
      setAppliedDiscounts([]);
      setIsCheckoutOpen(false);
      setPaymentRef('');
      setTenderAmount('');
      setActiveQuoteId(null);
      setActiveQuoteNumber(null);
      setSelectedSalesRepId('');
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

      {/* Header del POS con identidad de marca y navegación multi-rol */}
      <header
        className="min-h-[72px] py-2 border-b border-stone-200/80 dark:border-zinc-800 px-4 sm:px-6 flex items-center justify-between bg-white/95 dark:bg-[#141416]/95 backdrop-blur-md sticky top-0 z-20 transition-colors print:hidden shadow-xs"
        style={settings.primary_color ? { borderTop: `4px solid ${settings.primary_color}` } : undefined}
      >
        <div className="flex items-center gap-3">
          {/* Navegación según Rol: Cajero va a Pedidos/Clientes, Admin va al Dashboard */}
          {brandContext?.staff?.role === 'CASHIER' ? (
            <div className="flex items-center gap-1.5">
              <Link 
                href={`/t/${slug}/admin/orders`} 
                title="Ver Pedidos"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-stone-800 dark:text-zinc-200 text-xs font-bold transition shrink-0"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span className="hidden sm:inline">Pedidos</span>
              </Link>
              <Link 
                href={`/t/${slug}/admin/customers`} 
                title="Ver Clientes"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-stone-800 dark:text-zinc-200 text-xs font-bold transition shrink-0"
              >
                <Search className="w-3.5 h-3.5 text-stone-500" />
                <span className="hidden sm:inline">Clientes</span>
              </Link>
            </div>
          ) : (
            <Link 
              href={`/t/${slug}/admin`} 
              title="Volver al Panel Administrativo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-stone-800 dark:text-zinc-200 text-xs font-bold transition shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Panel Admin</span>
            </Link>
          )}

          {isSalesTeamActive && (
            <button
              type="button"
              onClick={() => setIsPreordersModalOpen(true)}
              title="Cargar Preorden o Cotización de Vendedor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300 text-xs font-bold transition shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span className="hidden sm:inline">Cotizaciones</span>
            </button>
          )}

          {settings.logo_url ? (
            <div className="h-10 max-w-[120px] flex items-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={settings.logo_url}
                alt={settings.business_name}
                className="max-h-10 max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 flex items-center justify-center font-bold text-sm shrink-0">
              {settings.business_name?.charAt(0).toUpperCase() || 'M'}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-extrabold text-stone-950 dark:text-white tracking-tight leading-tight">
                {settings.business_name}
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.2 rounded text-[10px] font-bold font-mono tracking-wide bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300">
                POS · {slug}
              </span>
            </div>
            <p className="text-[11px] font-medium text-stone-500 dark:text-zinc-400 mt-0.5">
              Terminal <span className="font-mono font-bold text-stone-800 dark:text-zinc-200">POS-01</span> · Moneda <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{baseCurrency} ({currencySymbol})</span>
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

          {/* Perfil del Staff y Botón de Salir */}
          {brandContext?.staff && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100 dark:bg-zinc-800/80 border border-stone-200 dark:border-zinc-700/80 text-xs">
              <span className="font-mono font-bold uppercase text-[10px] text-stone-500 dark:text-zinc-400">
                {brandContext.staff.role}:
              </span>
              <span className="font-bold text-stone-900 dark:text-zinc-200 truncate max-w-[110px]">
                {brandContext.staff.full_name}
              </span>
            </div>
          )}

          <LogoutButton 
            slug={slug} 
            className="w-auto px-2.5 py-1.5 rounded-xl text-xs font-bold border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20 shadow-xs" 
          />

          <div className="h-5 w-px bg-stone-200 dark:bg-zinc-800 hidden sm:block" />
          <ThemeToggle />
        </div>
      </header>

      {/* Cuerpo Principal del POS */}
      <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl w-full mx-auto print:hidden">
        {/* Catálogo Rápido de Productos (8 columnas en desktop, 12 en móvil) */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          {/* Barra de búsqueda y selector de categorías (Combobox) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl p-2.5 sm:p-3 shadow-xs">
            {/* Buscador de texto */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por producto, marca, SKU o código de barras (Enter para agregar)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = searchQuery.trim().toLowerCase();
                    if (!q) return;
                    // 1. Coincidencia exacta por código de barras o SKU
                    const exactMatch = products.find(
                      (p) =>
                        (p.barcode && p.barcode.toLowerCase() === q) ||
                        (p.sku && p.sku.toLowerCase() === q)
                    );
                    if (exactMatch) {
                      addToTicket(exactMatch);
                      setSearchQuery('');
                      return;
                    }
                    // 2. Si hay exactamente 1 producto filtrado en los resultados
                    if (filteredProducts.length === 1) {
                      addToTicket(filteredProducts[0]);
                      setSearchQuery('');
                      return;
                    }
                  }
                }}
                className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-50 dark:bg-zinc-900/80 border border-slate-300 dark:border-zinc-800 rounded-xl text-sm font-medium text-slate-950 dark:text-white placeholder:text-slate-500 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 select-text"
              />
            </div>

            {/* Combobox de Categorías */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1 sm:w-56">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full py-2 sm:py-2.5 pl-3 pr-8 bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 appearance-none cursor-pointer truncate"
                >
                  <option value="ALL">Todas las Categorías ({products.length})</option>
                  {availableCategories.map((c) => {
                    const count = products.filter((p) => p.category_id === c.id).length;
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} ({count})
                      </option>
                    );
                  })}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-zinc-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              <span className="text-xs font-bold tenant-secondary-badge border font-mono px-3 py-2 sm:py-2.5 rounded-xl shrink-0">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'prod.' : 'prods.'}
              </span>
            </div>
          </div>

          {/* Grid de productos interactivos (2 columnas fijas en móvil) */}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-3.5 overflow-y-auto max-h-[calc(100vh-14.5rem)] pr-1">
              {filteredProducts.map((product) => {
                const price = Math.max(0, parseFloat(product.price_usd || '0'));
                const stock = Math.max(0, parseFloat(product.current_stock || '0'));
                const isOutOfStock = stock <= 0;
                const isLow = !isOutOfStock && stock <= parseFloat(product.min_stock_alert || '5');
                const inTicket = ticket.find((item) => item.product.id === product.id);
                const isMaxInTicket = !isOutOfStock && Boolean(inTicket && inTicket.quantity >= stock);
                const isTaxActive = Boolean(settings.tax_enabled);
                const taxRatePercent = Number(settings.tax_rate ?? 16);
                const taxRate = taxRatePercent / 100;
                const isExempt = Boolean(product.is_tax_exempt);
                const pricesIncludeTax = Boolean(settings.prices_include_tax);

                let cardTaxUsd = 0;
                if (isTaxActive && !isExempt && taxRate > 0) {
                  cardTaxUsd = pricesIncludeTax
                    ? price - price / (1 + taxRate)
                    : price * taxRate;
                }
                const cardTaxVes = effectiveRate > 0 ? cardTaxUsd * effectiveRate : 0;

                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (isOutOfStock) {
                          toast.error(`"${product.name}" no tiene existencias.`);
                          return;
                        }
                        if (
                          isFoodServiceActive &&
                          ((product.variants && product.variants.length > 0) ||
                            (product.modifier_groups && product.modifier_groups.length > 0))
                        ) {
                          setCustomizerProduct(product);
                        } else {
                          setSelectedProductDetail(product);
                          const inT = ticket.find((item) => item.product.id === product.id);
                          setDetailQuantity(inT ? inT.quantity : Math.min(1, stock));
                        }
                      }
                    }}
                    onClick={() => {
                      if (isOutOfStock) {
                        toast.error(`"${product.name}" no tiene existencias.`);
                        return;
                      }
                      if (
                        isFoodServiceActive &&
                        ((product.variants && product.variants.length > 0) ||
                          (product.modifier_groups && product.modifier_groups.length > 0))
                      ) {
                        setCustomizerProduct(product);
                      } else {
                        setSelectedProductDetail(product);
                        const inT = ticket.find((item) => item.product.id === product.id);
                        setDetailQuantity(inT ? inT.quantity : Math.min(1, stock));
                      }
                    }}
                    className={`flex flex-col justify-between text-left p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-[#121214] border transition-all group active:scale-[0.98] select-none ${
                      isOutOfStock || daily86Ids.includes(product.id)
                        ? 'opacity-60 grayscale-[40%] border-rose-300 dark:border-rose-900/60 cursor-not-allowed'
                        : inTicket
                        ? 'border-lime-500 ring-1 ring-lime-500/30 shadow-sm cursor-pointer'
                        : 'border-slate-200 dark:border-zinc-800/80 hover:border-lime-500/50 hover:shadow-md dark:hover:border-lime-500/40 cursor-pointer'
                    }`}
                  >
                    <div>
                      {/* Imagen o Placeholder */}
                      <div className="w-full aspect-square rounded-xl bg-slate-100 dark:bg-zinc-800/60 overflow-hidden mb-2.5 flex items-center justify-center relative">
                        {isOutOfStock ? (
                          <span className="absolute top-2 left-2 z-10 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white shadow-xs">
                            AGOTADO
                          </span>
                        ) : daily86Ids.includes(product.id) ? (
                          <span className="absolute top-2 left-2 z-10 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white shadow-xs">
                            AGOTADO (86)
                          </span>
                        ) : null}
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
                        <span className={`absolute top-2 right-2 text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 rounded-md shadow-xs backdrop-blur-xs ${
                          isOutOfStock
                            ? 'bg-rose-600 text-white'
                            : isLow 
                            ? 'bg-amber-600 text-white' 
                            : 'tenant-secondary-surface opacity-90'
                        }`}>
                          {stock} uds
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] sm:text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-zinc-400 truncate">
                          {product.sku || 'SKU'}
                        </span>
                      </div>
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-950 dark:text-white line-clamp-2 leading-snug group-hover:text-lime-700 dark:group-hover:text-lime-400 transition-colors">
                        {product.name}
                      </h3>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-zinc-800/60 flex items-end justify-between gap-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-black font-mono text-slate-950 dark:text-white leading-none">
                          {currencySymbol}{price.toFixed(2)}
                        </p>
                        {effectiveRate > 0 && (
                          <p className="text-[11px] font-mono font-bold text-lime-700 dark:text-lime-400 mt-0.5 truncate">
                            Bs. {(price * effectiveRate).toFixed(2)}
                          </p>
                        )}
                        {/* Indicador de Impuesto Fiscal (Solo si el tenant opera en modo fiscal) */}
                        {isTaxActive && (
                          isExempt ? (
                            <span className="inline-block text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded mt-0.5">
                              Exento IVA
                            </span>
                          ) : (
                            <span className="block text-[9px] font-mono text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                              {pricesIncludeTax
                                ? `IVA inc. ${currencySymbol}${cardTaxUsd.toFixed(2)}`
                                : `+IVA ${currencySymbol}${cardTaxUsd.toFixed(2)}`}
                              {effectiveRate > 0 ? ` · Bs. ${cardTaxVes.toFixed(2)}` : ''}
                            </span>
                          )
                        )}
                      </div>
                      {isOutOfStock ? (
                        <button
                          type="button"
                          disabled
                          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 flex items-center justify-center cursor-not-allowed shrink-0"
                          title="Sin existencias"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      ) : isMaxInTicket ? (
                        <button
                          type="button"
                          disabled
                          className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center cursor-not-allowed shrink-0"
                          title={`Tope alcanzado en ticket (${stock} uds)`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToTicket(product);
                            toast.success(`+1 ${product.name}`, { duration: 1000 });
                          }}
                          className="w-8 h-8 rounded-xl bg-lime-500/15 text-lime-700 dark:text-lime-400 hover:bg-lime-500 hover:text-black flex items-center justify-center transition-all active:scale-90 shrink-0"
                          title="Añadir 1 rápido al ticket"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Panel del Ticket Actual (4-5 columnas en desktop, oculto en móvil para usar barra flotante) */}
        <section className="hidden lg:flex lg:col-span-5 xl:col-span-4 bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl flex-col justify-between shadow-sm overflow-hidden h-[calc(100vh-7.5rem)] sticky top-[5.25rem]">
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

          {activeQuoteNumber && (
            <div className="px-4 py-2.5 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-800 space-y-1.5 text-xs text-purple-950 dark:text-purple-100 animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold flex items-center gap-1.5 truncate text-purple-900 dark:text-purple-200">
                  <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                  Preorden: <strong className="font-mono text-xs">{activeQuoteNumber}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleUnlinkQuote}
                  className="px-2 py-0.5 rounded bg-purple-200/70 hover:bg-red-100 hover:text-red-700 dark:bg-purple-900/60 dark:hover:bg-red-900/40 text-[10px] font-bold text-purple-800 dark:text-purple-200 transition cursor-pointer shrink-0"
                  title="Desvincular cotización y limpiar el ticket por completo"
                >
                  ✕ Desvincular
                </button>
              </div>

              {activeQuoteDetails && (
                <div className="text-[11px] space-y-0.5 text-purple-800/90 dark:text-purple-300/90 border-t border-purple-200/60 dark:border-purple-800/60 pt-1.5">
                  {activeQuoteDetails.customer_name && (
                    <p className="truncate">
                      👤 <span className="font-bold">{activeQuoteDetails.customer_name}</span>
                      {activeQuoteDetails.customer_whatsapp && (
                        <span className="ml-1 opacity-80">({activeQuoteDetails.customer_whatsapp})</span>
                      )}
                    </p>
                  )}
                  {activeQuoteDetails.sales_rep_name && (
                    <p className="truncate">
                      💼 Asesor: <span className="font-semibold">{activeQuoteDetails.sales_rep_name}</span>
                    </p>
                  )}
                  {activeQuoteDetails.additional_services_primary && activeQuoteDetails.additional_services_primary > 0 ? (
                    <p className="text-[10px] text-purple-700 dark:text-purple-300">
                      ✨ Serv. Adicional: {activeQuoteDetails.additional_services_note || 'Servicios'} (+${Number(activeQuoteDetails.additional_services_primary).toFixed(2)})
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}

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
                const itemKey = item.ticket_item_id || item.product.id;
                const unitPrice = item.unit_price ?? parseFloat(item.product.price_usd);
                const subtotal = unitPrice * item.quantity;
                return (
                  <div key={itemKey} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-950 dark:text-white truncate">
                        {item.product.name}
                      </h4>
                      {item.variant_name && (
                        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          {item.variant_name}
                        </p>
                      )}
                      {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                        <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                          + {item.selected_modifiers.map((m) => m.name).join(', ')}
                        </p>
                      )}
                      {item.prep_notes && (
                        <p className="text-[10px] text-purple-700 dark:text-purple-300 font-medium italic truncate max-w-[200px]" title={item.prep_notes}>
                          📝 {item.prep_notes}
                        </p>
                      )}
                      <p className="text-xs font-mono font-semibold text-slate-700 dark:text-zinc-300">
                        {currencySymbol}{unitPrice.toFixed(2)} c/u
                      </p>
                    </div>

                    {/* Controles de cantidad con input numérico validado */}
                    {(() => {
                      const itemStock = Math.max(0, parseFloat(item.product.current_stock || '0'));
                      return (
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemKey, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer"
                            title="Restar 1"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <PosQuantityInput
                            value={item.quantity}
                            productName={item.product.name}
                            maxStock={itemStock}
                            onChange={(newQty) => setExactQuantity(item.product.id, newQty)}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemKey, 1)}
                            disabled={itemStock > 0 && item.quantity >= itemStock}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title={itemStock > 0 && item.quantity >= itemStock ? `Tope de stock alcanzado (${itemStock} uds)` : 'Sumar 1'}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })()}

                    <div className="text-right min-w-[4.5rem] shrink-0">
                      <p className="text-sm font-black font-mono text-slate-950 dark:text-white">
                        {currencySymbol}{subtotal.toFixed(2)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeFromTicket(itemKey)}
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
            {/* Selector de Modo de Entrega (Mostrador vs Mesa vs Delivery) */}
            {(isDeliveryActive || isFoodServiceActive) && ticket.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800/80 space-y-2 border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200 dark:bg-zinc-700 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPosDeliveryType('PICKUP')}
                    className={`flex-1 py-1 px-2 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      posDeliveryType === 'PICKUP' ? 'bg-white dark:bg-zinc-800 text-slate-950 dark:text-white shadow-xs font-black' : 'text-slate-500'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Mostrador</span>
                  </button>
                  {isFoodServiceActive && (
                    <button
                      type="button"
                      onClick={() => setPosDeliveryType('DINE_IN')}
                      className={`flex-1 py-1 px-2 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        posDeliveryType === 'DINE_IN' ? 'bg-orange-600 text-white shadow-xs font-black' : 'text-slate-500'
                      }`}
                    >
                      <UtensilsCrossed className="w-3.5 h-3.5" />
                      <span>Mesa</span>
                    </button>
                  )}
                  {isDeliveryActive && (
                    <button
                      type="button"
                      onClick={() => setPosDeliveryType('DELIVERY')}
                      className={`flex-1 py-1 px-2 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        posDeliveryType === 'DELIVERY' ? 'bg-emerald-500 text-white shadow-xs font-black' : 'text-slate-500'
                      }`}
                    >
                      <Bike className="w-3.5 h-3.5" />
                      <span>Delivery</span>
                    </button>
                  )}
                </div>

                {posDeliveryType === 'DINE_IN' && (
                  <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-zinc-400 uppercase">
                      Mesa de Sala:
                    </label>
                    <select
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs font-semibold text-slate-950 dark:text-white focus:outline-none"
                    >
                      {foodServiceTables.length === 0 ? (
                        <option value="">Sin mesas configuradas</option>
                      ) : (
                        foodServiceTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            Mesa {t.label} ({t.status === 'OCCUPIED' ? 'Ocupada' : 'Libre'} · {t.seats} puestos)
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {posDeliveryType === 'DELIVERY' && (
                  <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                    <select
                      value={selectedPosZoneId}
                      onChange={(e) => setSelectedPosZoneId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs font-semibold text-slate-950 dark:text-white focus:outline-none"
                    >
                      {deliveryZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} (+{currencySymbol}{Number(z.rate_primary).toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={posDeliveryAddress}
                      onChange={(e) => setPosDeliveryAddress(e.target.value)}
                      placeholder="Dirección exacta de entrega..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs text-slate-950 dark:text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {ticket.length > 0 && (
              <div className="space-y-1 text-xs border-b border-slate-200 dark:border-zinc-800 pb-2 text-slate-600 dark:text-zinc-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {currencySymbol}{taxCalculations.subtotal.toFixed(2)}
                  </span>
                </div>

                {/* Descuentos aplicados (Desktop) */}
                {appliedDiscounts.length > 0 && (
                  <div className="space-y-1 py-1 border-y border-dashed border-emerald-500/30 my-1">
                    {appliedDiscounts.map((d) => (
                      <div key={d.id} className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 font-semibold">
                        <span className="flex items-center gap-1 text-[11px] truncate max-w-[170px]" title={d.name}>
                          <Tag className="w-3 h-3 shrink-0" />
                          <span className="truncate">{d.name} {d.type === 'PERCENTAGE' ? `(${d.value}%)` : ''}</span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="font-mono">-{currencySymbol}{d.amount_primary.toFixed(2)}</span>
                          <button
                            type="button"
                            onClick={() => removeDiscount(d.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                            title="Quitar descuento"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botón trigger para aplicar/gestionar descuento */}
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="w-full flex items-center justify-between py-1 text-xs text-lime-600 dark:text-lime-400 hover:underline font-bold cursor-pointer"
                >
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" />
                    <span>{appliedDiscounts.length > 0 ? '+ Gestionar Descuentos' : '+ Aplicar Descuento'}</span>
                  </span>
                  {taxCalculations.discountAmount > 0 && (
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      Total desc: -{currencySymbol}{taxCalculations.discountAmount.toFixed(2)}
                    </span>
                  )}
                </button>
                {taxCalculations.isTaxActive && taxCalculations.subtotalExempt > 0 && taxCalculations.subtotalTaxable > 0 && (
                  <>
                    <div className="flex justify-between text-[11px] pl-2 text-slate-500">
                      <span>• Base Gravada</span>
                      <span className="font-mono">{currencySymbol}{taxCalculations.subtotalTaxable.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] pl-2 text-slate-500">
                      <span>• Base Exenta</span>
                      <span className="font-mono">{currencySymbol}{taxCalculations.subtotalExempt.toFixed(2)}</span>
                    </div>
                  </>
                )}
                {taxCalculations.isTaxActive && taxCalculations.vatAmount > 0 && (
                  <div className="flex justify-between">
                    <span>IVA ({taxCalculations.taxRatePercent}%){taxCalculations.pricesIncludeTax ? ' (inc.)' : ''}</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {taxCalculations.pricesIncludeTax ? '' : '+'}{currencySymbol}{taxCalculations.vatAmount.toFixed(2)}
                    </span>
                  </div>
                )}
                {taxCalculations.igtfAmount > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                    <span>IGTF (3% Divisas)</span>
                    <span className="font-mono">+{currencySymbol}{taxCalculations.igtfAmount.toFixed(2)}</span>
                  </div>
                )}
                {posDeliveryRate > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span className="flex items-center gap-1">
                      <Bike className="w-3.5 h-3.5" />
                      <span>Flete Delivery ({selectedPosZone?.name})</span>
                    </span>
                    <span className="font-mono">+{currencySymbol}{posDeliveryRate.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notas / Observaciones de Venta */}
            {ticket.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-200/80 dark:border-zinc-800/80">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <span>Observaciones / Notas</span>
                  {posNotes && (
                    <button 
                      type="button" 
                      onClick={() => setPosNotes('')} 
                      className="text-[9px] text-slate-400 hover:text-red-500 lowercase cursor-pointer"
                    >
                      limpiar
                    </button>
                  )}
                </div>
                <textarea
                  value={posNotes}
                  onChange={(e) => setPosNotes(e.target.value)}
                  placeholder="Escribe notas de despacho, especificaciones, términos..."
                  rows={2}
                  className="w-full text-xs p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-lime-500 text-slate-900 dark:text-white resize-none"
                />
              </div>
            )}

            <div className="space-y-1">
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-base font-extrabold text-slate-950 dark:text-white">
                  Total a Cobrar ({baseCurrency})
                </span>
                <span className="text-2xl font-black font-mono text-lime-600 dark:text-lime-400">
                  {currencySymbol}{totalUsd.toFixed(2)}
                </span>
              </div>
              {effectiveRate > 0 && (
                <div className="flex justify-between items-baseline pt-0.5">
                  <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Total Bolívares (BCV)
                  </span>
                  <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                    Bs. {(totalUsd * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {!activeShift || activeShift.status !== 'OPEN' ? (
              <button
                type="button"
                onClick={() => setShiftModalMode('open')}
                disabled={ticket.length === 0}
                className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm sm:text-base bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-500 dark:disabled:text-zinc-600 text-black shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <Lock className="w-5 h-5" />
                <span>Abrir Caja para Cobrar ({currencySymbol}{totalUsd.toFixed(2)})</span>
              </button>
            ) : (
              <button
                onClick={() => setIsCheckoutOpen(true)}
                disabled={ticket.length === 0}
                className="w-full py-3.5 px-4 rounded-xl font-extrabold text-base bg-lime-500 hover:bg-lime-600 disabled:bg-slate-200 dark:disabled:bg-zinc-800 disabled:text-slate-500 dark:disabled:text-zinc-600 text-black shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                <CreditCard className="w-5 h-5" />
                <span>Cobrar Ticket ({currencySymbol}{totalUsd.toFixed(2)})</span>
              </button>
            )}

            <div className="pt-2 text-center border-t border-slate-200/80 dark:border-zinc-800/60">
              <p className="text-xs font-medium text-slate-600 dark:text-zinc-400 truncate">
                Terminal autorizada · <span className="font-bold text-slate-900 dark:text-zinc-200">{settings.business_name}</span>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Barra Flotante Inferior de Ticket en Móvil (Estilo Vitrina Impeccable) */}
      {ticket.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden animate-in slide-in-from-bottom-5 duration-300">
          <div
            onClick={() => setIsMobileTicketOpen(true)}
            className="w-full text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between border border-white/20 active:scale-[0.99] transition-transform cursor-pointer"
            style={{
              backgroundColor: settings.primary_color || '#dc2626',
            }}
          >
            {/* Lado Izquierdo: Icono + Detalle Bimonetario */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center relative shadow-inner shrink-0">
                <ShoppingBag className="w-5 h-5 text-white" />
                <span
                  className="absolute -top-1 -right-1 bg-white font-black text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md border"
                  style={{
                    color: settings.primary_color || '#dc2626',
                    borderColor: settings.primary_color || '#dc2626',
                  }}
                >
                  {ticket.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              <div className="text-left font-mono">
                <p className="text-xs font-black leading-tight text-white font-sans">
                  {ticket.reduce((s, i) => s + i.quantity, 0)} {ticket.reduce((s, i) => s + i.quantity, 0) === 1 ? 'producto en ticket' : 'productos en ticket'}
                </p>
                <p className="text-[11px] font-bold text-white/95">
                  {currencySymbol}{totalUsd.toFixed(2)}
                  {effectiveRate > 0 && (
                    <span className="text-white/80 font-normal">
                      {' '}· Bs. {(totalUsd * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Lado Derecho: Botón Blanco de Acción con texto en color de marca */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMobileTicketOpen(true);
              }}
              className="flex items-center gap-1.5 bg-white px-3.5 py-2 rounded-xl font-black text-xs shadow-md shrink-0 hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
              style={{ color: settings.primary_color || '#dc2626' }}
            >
              <span>Ver Ticket</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sheet / Drawer del Ticket Móvil (< lg) */}
      {isMobileTicketOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0 lg:hidden print:hidden animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#121214] border-t border-slate-200 dark:border-zinc-800 rounded-t-3xl w-full p-4 sm:p-5 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom-8 duration-200">
            {/* Header del Drawer */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-lime-500 flex items-center justify-center shrink-0 shadow-xs">
                  <ShoppingCart className="w-4 h-4 text-black" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                    Ticket Actual
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {ticket.reduce((s, i) => s + i.quantity, 0)} artículos seleccionados
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {ticket.length > 0 && (
                  <button
                    type="button"
                    onClick={clearTicket}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 transition flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMobileTicketOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {activeQuoteNumber && (
              <div className="p-2.5 my-2 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 space-y-1 text-xs text-purple-950 dark:text-purple-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold flex items-center gap-1.5 truncate text-purple-900 dark:text-purple-200">
                    <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    Preorden: <strong className="font-mono">{activeQuoteNumber}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleUnlinkQuote}
                    className="px-2 py-0.5 rounded bg-purple-200/70 hover:bg-red-100 hover:text-red-700 text-[10px] font-bold text-purple-800 transition cursor-pointer shrink-0"
                    title="Desvincular cotización y limpiar el ticket por completo"
                  >
                    ✕ Desvincular
                  </button>
                </div>
                {activeQuoteDetails?.customer_name && (
                  <p className="text-[10px] truncate text-purple-800 dark:text-purple-300">
                    👤 {activeQuoteDetails.customer_name} {activeQuoteDetails.sales_rep_name ? `· 💼 ${activeQuoteDetails.sales_rep_name}` : ''}
                  </p>
                )}
              </div>
            )}

            {/* Lista de productos del ticket */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80 dark:divide-zinc-800/60 py-2">
              {ticket.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  No hay productos en el ticket
                </div>
              ) : (
                ticket.map((item) => {
                  const unitPrice = item.unit_price ?? parseFloat(item.product.price_usd);
                  const subtotal = unitPrice * item.quantity;
                  return (
                    <div key={item.ticket_item_id || item.product.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-950 dark:text-white truncate">
                          {item.product.name}
                        </h4>
                        {item.prep_notes && (
                          <p className="text-[10px] text-purple-700 dark:text-purple-300 font-medium italic truncate max-w-[180px]" title={item.prep_notes}>
                            📝 {item.prep_notes}
                          </p>
                        )}
                        <p className="text-[11px] font-mono text-slate-600 dark:text-zinc-400">
                          {currencySymbol}{unitPrice.toFixed(2)} c/u
                        </p>
                      </div>

                      {(() => {
                        const itemStock = Math.max(0, parseFloat(item.product.current_stock || '0'));
                        return (
                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/80 rounded-lg p-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, -1)}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <PosQuantityInput
                              value={item.quantity}
                              productName={item.product.name}
                              maxStock={itemStock}
                              onChange={(newQty) => setExactQuantity(item.product.id, newQty)}
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, 1)}
                              disabled={itemStock > 0 && item.quantity >= itemStock}
                              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title={itemStock > 0 && item.quantity >= itemStock ? `Tope de stock alcanzado (${itemStock} uds)` : 'Sumar 1'}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })()}

                      <div className="text-right min-w-[4rem] shrink-0">
                        <p className="text-xs sm:text-sm font-black font-mono text-slate-950 dark:text-white">
                          {currencySymbol}{subtotal.toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeFromTicket(item.product.id)}
                          className="text-[11px] text-red-600 dark:text-red-400 cursor-pointer mt-0.5 inline-flex items-center gap-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selector de Modo de Entrega Móvil (Mostrador vs Delivery) */}
            {/* Selector de Modo de Entrega Móvil (Mostrador vs Mesa vs Delivery) */}
            {(isDeliveryActive || isFoodServiceActive) && ticket.length > 0 && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800/80 space-y-2 border border-slate-200 dark:border-zinc-700">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200 dark:bg-zinc-700 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPosDeliveryType('PICKUP')}
                    className={`flex-1 py-1 px-2 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      posDeliveryType === 'PICKUP' ? 'bg-white dark:bg-zinc-800 text-slate-950 dark:text-white shadow-xs font-black' : 'text-slate-500'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Mostrador</span>
                  </button>
                  {isFoodServiceActive && (
                    <button
                      type="button"
                      onClick={() => setPosDeliveryType('DINE_IN')}
                      className={`flex-1 py-1 px-2 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        posDeliveryType === 'DINE_IN' ? 'bg-orange-600 text-white shadow-xs font-black' : 'text-slate-500'
                      }`}
                    >
                      <UtensilsCrossed className="w-3.5 h-3.5" />
                      <span>Mesa</span>
                    </button>
                  )}
                  {isDeliveryActive && (
                    <button
                      type="button"
                      onClick={() => setPosDeliveryType('DELIVERY')}
                      className={`flex-1 py-1 px-2 rounded-md text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        posDeliveryType === 'DELIVERY' ? 'bg-emerald-500 text-white shadow-xs font-black' : 'text-slate-500'
                      }`}
                    >
                      <Bike className="w-3.5 h-3.5" />
                      <span>Delivery</span>
                    </button>
                  )}
                </div>

                {posDeliveryType === 'DINE_IN' && (
                  <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-zinc-400 uppercase">
                      Mesa de Sala:
                    </label>
                    <select
                      value={selectedTableId}
                      onChange={(e) => setSelectedTableId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs font-semibold text-slate-950 dark:text-white focus:outline-none"
                    >
                      {foodServiceTables.length === 0 ? (
                        <option value="">Sin mesas configuradas</option>
                      ) : (
                        foodServiceTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            Mesa {t.label} ({t.status === 'OCCUPIED' ? 'Ocupada' : 'Libre'} · {t.seats} puestos)
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {posDeliveryType === 'DELIVERY' && (
                  <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                    <select
                      value={selectedPosZoneId}
                      onChange={(e) => setSelectedPosZoneId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs font-semibold text-slate-950 dark:text-white focus:outline-none"
                    >
                      {deliveryZones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} (+{currencySymbol}{Number(z.rate_primary).toFixed(2)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={posDeliveryAddress}
                      onChange={(e) => setPosDeliveryAddress(e.target.value)}
                      placeholder="Dirección exacta de entrega..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-xs text-slate-950 dark:text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Resumen Fiscal y Botón de Cobro */}
            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2.5">
              {ticket.length > 0 && (
                <div className="space-y-1 text-xs text-slate-600 dark:text-zinc-400">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {currencySymbol}{taxCalculations.subtotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Descuentos aplicados (Móvil) */}
                  {appliedDiscounts.length > 0 && (
                    <div className="space-y-1 py-1 border-y border-dashed border-emerald-500/30 my-1">
                      {appliedDiscounts.map((d) => (
                        <div key={d.id} className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 font-semibold">
                          <span className="flex items-center gap-1 text-[11px] truncate max-w-[200px]" title={d.name}>
                            <Tag className="w-3 h-3 shrink-0" />
                            <span className="truncate">{d.name} {d.type === 'PERCENTAGE' ? `(${d.value}%)` : ''}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-mono">-{currencySymbol}{d.amount_primary.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => removeDiscount(d.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                              title="Quitar descuento"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsDiscountModalOpen(true)}
                    className="w-full flex items-center justify-between py-1 text-xs text-lime-600 dark:text-lime-400 hover:underline font-bold cursor-pointer"
                  >
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{appliedDiscounts.length > 0 ? '+ Gestionar Descuentos' : '+ Aplicar Descuento'}</span>
                    </span>
                    {taxCalculations.discountAmount > 0 && (
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Total desc: -{currencySymbol}{taxCalculations.discountAmount.toFixed(2)}
                      </span>
                    )}
                  </button>
                </div>
              )}

              {ticket.length > 0 && taxCalculations.isTaxActive && taxCalculations.vatAmount > 0 && (
                <div className="flex justify-between text-xs text-slate-500 font-mono">
                  <span>IVA ({taxCalculations.taxRatePercent}%){taxCalculations.pricesIncludeTax ? ' (inc.)' : ''}</span>
                  <span className="font-bold text-slate-800 dark:text-zinc-200">
                    {taxCalculations.pricesIncludeTax ? '' : '+'}{currencySymbol}{taxCalculations.vatAmount.toFixed(2)}
                  </span>
                </div>
              )}

              {posDeliveryRate > 0 && (
                <div className="flex justify-between text-xs text-emerald-700 dark:text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Bike className="w-3.5 h-3.5" />
                    <span>Flete Delivery ({selectedPosZone?.name})</span>
                  </span>
                  <span className="font-mono">+{currencySymbol}{posDeliveryRate.toFixed(2)}</span>
                </div>
              )}

              {/* Notas / Observaciones de Venta Móvil */}
              {ticket.length > 0 && (
                <div className="space-y-1 py-1">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <span>Observaciones / Notas</span>
                    {posNotes && (
                      <button type="button" onClick={() => setPosNotes('')} className="text-[9px] text-slate-400 hover:text-red-500 lowercase cursor-pointer">
                        limpiar
                      </button>
                    )}
                  </div>
                  <textarea
                    value={posNotes}
                    onChange={(e) => setPosNotes(e.target.value)}
                    placeholder="Notas de entrega o especificaciones..."
                    rows={1}
                    className="w-full text-xs p-2 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white resize-none"
                  />
                </div>
              )}

              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Total a Cobrar</span>
                <div className="text-right font-mono">
                  <span className="text-xl font-black text-lime-600 dark:text-lime-400">
                    {currencySymbol}{totalUsd.toFixed(2)}
                  </span>
                  {effectiveRate > 0 && (
                    <span className="block text-xs font-bold text-slate-800 dark:text-zinc-200">
                      Bs. {(totalUsd * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>

              {!activeShift || activeShift.status !== 'OPEN' ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileTicketOpen(false);
                    setShiftModalMode('open');
                  }}
                  disabled={ticket.length === 0}
                  className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm bg-amber-500 hover:bg-amber-600 text-black shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  <span>Abrir Caja para Cobrar ({currencySymbol}{totalUsd.toFixed(2)})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileTicketOpen(false);
                    setIsCheckoutOpen(true);
                  }}
                  disabled={ticket.length === 0}
                  className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm bg-lime-500 hover:bg-lime-600 text-black shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  style={settings.primary_color ? { backgroundColor: settings.primary_color, color: '#ffffff' } : undefined}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Proceder al Cobro ({currencySymbol}{totalUsd.toFixed(2)})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Producto con Desglose Fiscal y Selector Táctil */}
      {selectedProductDetail && (() => {
        const p = selectedProductDetail;
        const price = Math.max(0, parseFloat(p.price_usd || '0'));
        const stock = Math.max(0, parseFloat(p.current_stock || '0'));
        const isOutOfStock = stock <= 0;
        const isLow = !isOutOfStock && stock <= parseFloat(p.min_stock_alert || '5');
        const taxRate = (settings.tax_rate ?? 16) / 100;
        const isTaxActive = Boolean(settings.tax_enabled);
        const isExempt = Boolean(p.is_tax_exempt);
        
        let unitTaxUsd = 0;
        let unitFinalUsd = price;
        if (isTaxActive && !isExempt && taxRate > 0) {
          if (settings.prices_include_tax) {
            unitTaxUsd = price - price / (1 + taxRate);
            unitFinalUsd = price;
          } else {
            unitTaxUsd = price * taxRate;
            unitFinalUsd = price + unitTaxUsd;
          }
        }

        const safeDetailQuantity = Math.min(Math.max(1, detailQuantity), stock > 0 ? stock : 1);
        const lineTotalUsd = unitFinalUsd * safeDetailQuantity;
        const lineTotalVes = effectiveRate > 0 ? lineTotalUsd * effectiveRate : 0;
        const inT = ticket.find((i) => i.product.id === p.id);

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden animate-in fade-in duration-150">
            <div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto overscroll-contain animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
              {/* Header con botón cerrar */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 overflow-hidden flex items-center justify-center relative shrink-0 border border-slate-200 dark:border-zinc-800">
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-7 h-7 text-slate-400 dark:text-zinc-600" />
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-zinc-400">
                      {p.sku || 'SKU'}
                    </span>
                    <h3 className="text-base font-extrabold text-slate-950 dark:text-white leading-tight">
                      {p.name}
                    </h3>
                    <p className={`text-xs font-mono font-bold mt-1 ${isOutOfStock ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-500 dark:text-zinc-400'}`}>
                      {isOutOfStock ? 'Sin existencias (Agotado)' : `Disponible: ${stock} unidades`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProductDetail(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Descripción formateada del producto si existe */}
              {p.description && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 max-h-48 overflow-y-auto overscroll-contain space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block mb-1">
                    Descripción y Detalles
                  </span>
                  <FormattedDescription description={p.description} />
                </div>
              )}

              {/* Desglose de Precios e Impuestos */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Precio Unitario Base</span>
                  <div className="text-right font-mono">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{currencySymbol}{price.toFixed(2)}</span>
                    {effectiveRate > 0 && (
                      <span className="text-xs text-slate-500 dark:text-zinc-400 ml-1.5">(Bs. {(price * effectiveRate).toFixed(2)})</span>
                    )}
                  </div>
                </div>

                {/* Desglose Fiscal Solo si tax_enabled */}
                {isTaxActive && (
                  <div className="pt-2 border-t border-slate-200/80 dark:border-zinc-800/80 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 dark:text-zinc-400">Régimen Fiscal</span>
                      {isExempt ? (
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md text-[11px]">
                          Exento de IVA
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-slate-700 dark:text-zinc-300">
                          IVA ({(settings.tax_rate ?? 16)}%) {settings.prices_include_tax ? '(Incluido)' : '(No incluido)'}
                        </span>
                      )}
                    </div>

                    {!isExempt && (
                      <div className="flex justify-between items-baseline font-mono text-[11px]">
                        <span className="text-slate-500">Monto Impuesto unitario:</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                          {currencySymbol}{unitTaxUsd.toFixed(2)} {effectiveRate > 0 ? `· Bs. ${(unitTaxUsd * effectiveRate).toFixed(2)}` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex justify-between items-baseline">
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white">Precio Final Unitario</span>
                  <div className="text-right font-mono">
                    <span className="text-base font-black text-lime-600 dark:text-lime-400">{currencySymbol}{unitFinalUsd.toFixed(2)}</span>
                    {effectiveRate > 0 && (
                      <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 ml-1.5">
                        Bs. {(unitFinalUsd * effectiveRate).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Selector Táctil de Cantidad con tope estricto al stock */}
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Cantidad a Despachar
                </span>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 rounded-2xl p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailQuantity((q) => Math.max(1, q - 1))}
                    disabled={detailQuantity <= 1 || isOutOfStock}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-700 text-slate-900 dark:text-white font-bold text-base hover:opacity-80 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isOutOfStock}
                    value={detailQuantity}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '');
                      if (!digitsOnly) {
                        setDetailQuantity(1);
                      } else {
                        const val = parseInt(digitsOnly, 10);
                        if (val >= 1) setDetailQuantity(Math.min(val, stock > 0 ? stock : 1));
                      }
                    }}
                    className="w-14 text-center font-mono font-black text-base bg-transparent text-slate-950 dark:text-white focus:outline-none disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setDetailQuantity((q) => Math.min(stock, q + 1))}
                    disabled={detailQuantity >= stock || isOutOfStock}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-700 text-slate-900 dark:text-white font-bold text-base hover:opacity-80 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Botón de Acción Principal */}
              {isOutOfStock ? (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 px-4 rounded-2xl font-black text-xs text-stone-400 dark:text-zinc-500 bg-stone-100 dark:bg-zinc-800 cursor-not-allowed flex items-center justify-center"
                >
                  Sin existencias en almacén para despacho
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const finalQty = Math.min(safeDetailQuantity, stock);
                    setExactQuantity(p.id, finalQty);
                    toast.success(`${finalQty} × ${p.name} en el ticket`);
                    setSelectedProductDetail(null);
                  }}
                  className="w-full py-3.5 px-4 rounded-2xl font-black text-sm text-black bg-lime-500 hover:bg-lime-600 transition-all flex items-center justify-between shadow-sm active:scale-[0.99] cursor-pointer"
                  style={settings.primary_color ? { backgroundColor: settings.primary_color, color: '#ffffff' } : undefined}
                >
                  <span>{inT ? 'Actualizar en Ticket' : 'Añadir al Ticket'}</span>
                  <span className="font-mono text-sm">
                    {currencySymbol}{lineTotalUsd.toFixed(2)} {effectiveRate > 0 ? `· Bs. ${lineTotalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                  </span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal de Descuentos (Core V4) */}
      {isDiscountModalOpen && (
        <ModalPortal isOpen={isDiscountModalOpen} onClose={() => setIsDiscountModalOpen(false)}>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:hidden">
            <div className="relative w-full max-w-md max-h-[90vh] flex flex-col bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-lime-500/10 text-lime-600 dark:text-lime-400 flex items-center justify-center">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Descuentos en Mostrador
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Subtotal actual: <span className="font-mono font-bold">{currencySymbol}{taxCalculations.rawSubtotal.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Contenido scrolleable */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
                {/* Descuentos actualmente activos en el ticket */}
                {appliedDiscounts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                        Aplicados ({appliedDiscounts.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setAppliedDiscounts([])}
                        className="text-[11px] font-semibold text-red-600 hover:underline"
                      >
                        Quitar todos
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {appliedDiscounts.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {d.name} {d.type === 'PERCENTAGE' ? `(${d.value}%)` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              -{currencySymbol}{d.amount_primary.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDiscount(d.id)}
                              className="text-slate-400 hover:text-red-500 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Presets Rápidos */}
                {settings.discount_settings?.presets && settings.discount_settings.presets.filter(p => p.is_active).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Promociones Rápidas
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {settings.discount_settings.presets
                        .filter((p) => p.is_active)
                        .map((p) => {
                          const isApplied = appliedDiscounts.some((ad) => ad.id === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyPresetDiscount(p)}
                              className={`p-3 rounded-xl border text-left transition-all active:scale-95 flex flex-col justify-between min-h-[58px] ${
                                isApplied
                                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                                  : 'border-slate-200 dark:border-zinc-800 hover:border-lime-500 bg-white dark:bg-zinc-900'
                              }`}
                            >
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {p.name}
                              </span>
                              <span className="text-xs font-black font-mono text-lime-600 dark:text-lime-400 mt-1">
                                {p.type === 'PERCENTAGE' ? `${p.value}% OFF` : `-${currencySymbol}${p.value.toFixed(2)}`}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Descuento Manual / Personalizado */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    Descuento Manual / Personalizado
                  </span>
                  <form onSubmit={applyCustomDiscount} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                        Motivo (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Cortesía, Detalle de Empaque, Amigo"
                        value={manualDiscountName}
                        onChange={(e) => setManualDiscountName(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:border-lime-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                          Tipo
                        </label>
                        <div className="flex rounded-xl bg-slate-100 dark:bg-zinc-800 p-0.5 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setManualDiscountType('PERCENTAGE')}
                            className={`flex-1 py-1.5 rounded-lg transition-all ${
                              manualDiscountType === 'PERCENTAGE'
                                ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            % Porc.
                          </button>
                          <button
                            type="button"
                            onClick={() => setManualDiscountType('FIXED_AMOUNT')}
                            className={`flex-1 py-1.5 rounded-lg transition-all ${
                              manualDiscountType === 'FIXED_AMOUNT'
                                ? 'bg-white dark:bg-zinc-900 text-slate-900 dark:text-white shadow-xs'
                                : 'text-slate-500'
                            }`}
                          >
                            $ Fijo
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700 dark:text-zinc-300">
                          Valor {manualDiscountType === 'PERCENTAGE' ? '(%)' : '($)'}
                        </label>
                        <input
                          type="number"
                          step={manualDiscountType === 'PERCENTAGE' ? '1' : '0.01'}
                          min="0.01"
                          max={manualDiscountType === 'PERCENTAGE' ? '100' : '9999'}
                          placeholder={manualDiscountType === 'PERCENTAGE' ? '10' : '5.00'}
                          value={manualDiscountValue}
                          onChange={(e) => setManualDiscountValue(e.target.value)}
                          required
                          className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:border-lime-500"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-lime-600 hover:bg-lime-700 text-white shadow-xs transition-all cursor-pointer active:scale-98"
                    >
                      Aplicar Descuento
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal de Cobro */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:hidden">
          <div className="relative w-full max-w-lg max-h-[92dvh] flex flex-col bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header Fijo */}
            <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 shrink-0 bg-white dark:bg-[#121214]">
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
                    Terminal POS-01 · Operación Offline-First ({baseCurrency})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Cuerpo Scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
              {/* Totalizador en Modal con branding */}
              <div className="p-4 rounded-2xl bg-lime-500/10 border border-lime-500/20 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-lime-800 dark:text-lime-400">
                  Monto Total a Recibir
                </p>
                <div className="flex items-baseline justify-center gap-2 mt-1 flex-wrap">
                  <span className="text-3xl font-black font-mono text-lime-800 dark:text-lime-300">
                    {currencySymbol}{totalUsd.toFixed(2)}
                  </span>
                  {effectiveRate > 0 && (
                    <span className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                      / Bs. {(totalUsd * effectiveRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                {effectiveRate > 0 && (
                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 mt-1">
                    Tasa oficial: Bs. {effectiveRate.toFixed(2)} / {baseCurrency}
                  </p>
                )}
              </div>

              {/* Calculadora de Vuelto / Importe Recibido */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Calculadora de Vuelto
                  </label>
                  <div className="flex items-center rounded-lg p-0.5 bg-slate-200 dark:bg-zinc-800 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => { setTenderCurrency('BASE'); setTenderAmount(''); }}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        tenderCurrency === 'BASE'
                          ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {baseCurrency} ({currencySymbol})
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTenderCurrency('VES'); setTenderAmount(''); }}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                        tenderCurrency === 'VES'
                          ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      VES (Bs.)
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-slate-400">
                    {tenderCurrency === 'BASE' ? currencySymbol : 'Bs.'}
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={tenderAmount}
                    onChange={(e) => setTenderAmount(e.target.value.replace(/-/g, ''))}
                    placeholder={
                      tenderCurrency === 'BASE'
                        ? `Ej: ${Math.ceil(totalUsd)} o ${totalUsd.toFixed(2)}`
                        : `Ej: ${(totalUsd * (effectiveRate || 1)).toFixed(2)}`
                    }
                    className="w-full pl-8 pr-3.5 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500"
                  />
                </div>

                {/* Botones de sugerencia rápida */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setTenderAmount(
                        tenderCurrency === 'BASE'
                          ? totalUsd.toFixed(2)
                          : (totalUsd * (effectiveRate || 1)).toFixed(2)
                      )
                    }
                    className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 cursor-pointer"
                  >
                    Exacto
                  </button>
                  {tenderCurrency === 'BASE'
                    ? [5, 10, 20, 50, 100]
                        .filter((val) => val >= totalUsd)
                        .slice(0, 3)
                        .map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setTenderAmount(val.toString())}
                            className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 cursor-pointer"
                          >
                            {currencySymbol}{val}
                          </button>
                        ))
                    : null}
                </div>

                {/* Resultado del Cambio / Faltante */}
                {(() => {
                  const amountNum = parseFloat(tenderAmount) || 0;
                  if (amountNum <= 0) return null;

                  if (tenderCurrency === 'BASE') {
                    const diff = amountNum - totalUsd;
                    if (diff >= 0) {
                      const diffVes = effectiveRate > 0 ? diff * effectiveRate : 0;
                      return (
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-800 dark:text-emerald-300">
                            Vuelto al cliente:
                          </span>
                          <div className="text-right font-mono">
                            <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                              {currencySymbol}{diff.toFixed(2)} {baseCurrency}
                            </p>
                            {diffVes > 0 && (
                              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-500">
                                Bs. {diffVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    } else {
                      const missingUsd = Math.abs(diff);
                      const missingVes = effectiveRate > 0 ? missingUsd * effectiveRate : 0;
                      return (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-800 dark:text-amber-300">
                            Faltante por cobrar:
                          </span>
                          <div className="text-right font-mono">
                            <p className="font-extrabold text-amber-700 dark:text-amber-400">
                              {currencySymbol}{missingUsd.toFixed(2)} {baseCurrency}
                            </p>
                            {missingVes > 0 && (
                              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-500">
                                Bs. {missingVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }
                  } else {
                    const totalVes = totalUsd * (effectiveRate || 1);
                    const diffVes = amountNum - totalVes;
                    if (diffVes >= 0) {
                      const diffUsd = effectiveRate > 0 ? diffVes / effectiveRate : 0;
                      return (
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-800 dark:text-emerald-300">
                            Vuelto al cliente:
                          </span>
                          <div className="text-right font-mono">
                            <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                              Bs. {diffVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            {diffUsd > 0 && (
                              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-500">
                                {currencySymbol}{diffUsd.toFixed(2)} {baseCurrency}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    } else {
                      const missingVes = Math.abs(diffVes);
                      const missingUsd = effectiveRate > 0 ? missingVes / effectiveRate : 0;
                      return (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-800 dark:text-amber-300">
                            Faltante por cobrar:
                          </span>
                          <div className="text-right font-mono">
                            <p className="font-extrabold text-amber-700 dark:text-amber-400">
                              Bs. {missingVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            {missingUsd > 0 && (
                              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-500">
                                {currencySymbol}{missingUsd.toFixed(2)} {baseCurrency}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }
                  }
                })()}
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
            </div>

            {/* Footer Fijo */}
            <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-white/95 dark:bg-[#121214]/95 backdrop-blur-xs flex items-center gap-2.5 shrink-0">
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
                {isProcessing ? 'Procesando...' : `Confirmar y Cobrar (${currencySymbol}${totalUsd.toFixed(2)})`}
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
              {completedSale.deliveryType === 'DELIVERY' && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                  <span className="flex items-center gap-1">
                    <Bike className="w-3.5 h-3.5" />
                    <span>Flete ({completedSale.deliveryZoneName || 'Delivery'}):</span>
                  </span>
                  <span className="font-mono">+${Number(completedSale.deliveryRate || 0).toFixed(2)}</span>
                </div>
              )}
              {completedSale.deliveryType === 'DINE_IN' && (
                <div className="flex justify-between text-orange-600 dark:text-orange-400 font-bold">
                  <span className="flex items-center gap-1">
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                    <span>Consumo en Sala:</span>
                  </span>
                  <span className="font-mono">Mesa {completedSale.tableLabel || 'General'}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 dark:border-zinc-800 pt-1.5">
                <span className="font-bold text-slate-900 dark:text-white">Total USD:</span>
                <span className="font-mono font-black text-lime-600 dark:text-lime-400 text-sm">
                  ${completedSale.totalUsd.toFixed(2)}
                </span>
              </div>
              {completedSale.totalSecondary != null && completedSale.totalSecondary > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-zinc-400 text-xs font-mono">
                  <span>Equivalente Bs.:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Bs. {completedSale.totalSecondary.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
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
            {completedSale.deliveryType === 'DINE_IN' && (
              <p><strong>MESA / SALÓN:</strong> {completedSale.tableLabel || 'GENERAL'}</p>
            )}
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
            {completedSale.deliveryType === 'DELIVERY' && (
              <div className="flex justify-between text-[11px] font-bold py-0.5 border-t border-dashed border-black">
                <span>FLETE ({completedSale.deliveryZoneName || 'DELIVERY'}):</span>
                <span>+${Number(completedSale.deliveryRate || 0).toFixed(2)}</span>
              </div>
            )}
            <p className="text-sm font-black">TOTAL USD: ${completedSale.totalUsd.toFixed(2)}</p>
            {completedSale.totalSecondary != null && completedSale.totalSecondary > 0 && (
              <p className="text-xs font-bold font-mono">
                TOTAL BS: Bs. {completedSale.totalSecondary.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
            {effectiveRate > 0 && (
              <p className="text-[9px] text-zinc-600 font-mono">
                Tasa BCV: Bs. {effectiveRate.toFixed(2)} / USD
              </p>
            )}
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
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 p-6 shadow-2xl space-y-4"
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

      {/* Modal Gastronómico Avanzado para Restaurantes (Tamaños, Proteína y Extras) */}
      {customizerProduct && (
        <FoodProductCustomizerModal
          product={{
            id: customizerProduct.id,
            name: customizerProduct.name,
            price_usd: parseFloat(customizerProduct.price_usd),
            image_url: customizerProduct.image_url,
            variants: customizerProduct.variants,
            modifier_groups: customizerProduct.modifier_groups,
          }}
          isOpen={Boolean(customizerProduct)}
          onClose={() => setCustomizerProduct(null)}
          onConfirm={handleCustomizerConfirm}
          primaryCurrency={settings.primary_currency || 'USD'}
          exchangeRate={effectiveRate}
        />
      )}

      {/* Modal de Preórdenes y Cotizaciones de Vendedores */}
      <PosPreordersModal
        slug={slug}
        isOpen={isPreordersModalOpen}
        onClose={() => setIsPreordersModalOpen(false)}
        onLoadQuote={handleLoadQuote}
        primaryCurrency={baseCurrency}
      />
    </div>
  );
}
