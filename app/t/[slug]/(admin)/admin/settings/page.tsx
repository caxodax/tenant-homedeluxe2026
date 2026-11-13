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
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2, 
  Save, 
  Store, 
  Palette, 
  MessageCircle, 
  Share2, 
  RefreshCw,
  Sparkles,
  CreditCard,
  Coins,
  Receipt,
  CheckCircle2,
  Ban
} from 'lucide-react';
import { toast } from 'sonner';
import { ImageUploader } from '@/components/admin/image-uploader';
import { PaymentMethodsManager } from './payment-methods-manager';
import { BcvRateTab } from './bcv-rate-tab';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';

const settingsSchema = z.object({
  business_name: z.string().min(2, 'Nombre requerido').max(200),
  category: z.string().optional(),
  phone: z.string().optional().nullable(),
  whatsapp_number: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
  banner_url: z.string().optional().nullable(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hexadecimal inválido'),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hexadecimal inválido'),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hexadecimal inválido'),
  font_family: z.string(),
  primary_currency: z.string(),
  secondary_currency: z.string(),
  contingency_offline_mode: z.enum(['preorder_request', 'safety_buffer', 'normal']),
  offline_safety_buffer: z.number().min(0),
  social_media: z.object({
    instagram: z.string().optional(),
    facebook: z.string().optional(),
    tiktok: z.string().optional(),
    twitter: z.string().optional(),
    youtube: z.string().optional(),
  }).optional(),
  taxes: z.object({
    tax_enabled: z.boolean(),
    tax_rate: z.number().min(0).max(100),
    prices_include_tax: z.boolean(),
  }),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const COLOR_PRESETS = [
  { name: 'Lima Retail (Oficial)', hex: '#84cc16' },
  { name: 'Esmeralda Fresh', hex: '#10b981' },
  { name: 'Azul Market', hex: '#2563eb' },
  { name: 'Violeta Gourmet', hex: '#7c3aed' },
  { name: 'Ámbar Deli', hex: '#f59e0b' },
  { name: 'Rojo Express', hex: '#dc2626' },
  { name: 'Grafito Minimal', hex: '#27272a' },
];

interface SettingsSection {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  pluginId?: string;
  badge?: string;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', label: 'General & Datos Básicos', description: 'Nombre comercial, dirección física y monedas canónicas', icon: Store },
  { id: 'branding', label: 'Marca & Logo', description: 'Colores corporativos, logotipo y banner de tienda', icon: Palette },
  { id: 'payments', label: 'Métodos de Pago', description: 'Pasarelas, cuentas y formas de cobro habilitadas', icon: CreditCard },
  { id: 'bcv', label: 'Tasa & Moneda (BCV)', description: 'Sincronización cambiaria oficial, Pago Móvil e IGTF', icon: Coins, pluginId: 'local_venezuela', badge: 'Plugin VE' },
  { id: 'contact', label: 'Contacto & Contingencia', description: 'WhatsApp de atención y modo offline de contingencia', icon: MessageCircle },
  { id: 'social', label: 'Redes Sociales', description: 'Canales y enlaces directos a perfiles sociales', icon: Share2 },
];

export default function SettingsPage() {
  const params = useParams() as { slug: string };
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [activePlugins, setActivePlugins] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('general');
  const hasLocalizationPlugin = activePlugins.includes('local_venezuela');

  const availableSections = SETTINGS_SECTIONS.filter(
    (sec) => !sec.pluginId || activePlugins.includes(sec.pluginId)
  );
  const currentSection = availableSections.find((s) => s.id === activeTab) || availableSections[0] || SETTINGS_SECTIONS[0];
  const CurrentIcon = currentSection.icon;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab) setActiveTab(tab);
    }
  }, []);

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      business_name: '',
      category: '',
      phone: '',
      whatsapp_number: '',
      address: '',
      logo_url: '',
      banner_url: '',
      primary_color: TENANT_DEFAULTS.PRIMARY_COLOR,
      secondary_color: TENANT_DEFAULTS.SECONDARY_COLOR,
      accent_color: TENANT_DEFAULTS.ACCENT_COLOR,
      font_family: TENANT_DEFAULTS.FONT_FAMILY,
      primary_currency: TENANT_DEFAULTS.BASE_CURRENCY,
      secondary_currency: TENANT_DEFAULTS.BASE_CURRENCY,
      contingency_offline_mode: 'normal',
      offline_safety_buffer: 2,
      social_media: {
        instagram: '',
        facebook: '',
        tiktok: '',
        twitter: '',
        youtube: '',
      },
      taxes: {
        tax_enabled: true,
        tax_rate: 16,
        prices_include_tax: false,
      },
    },
  });

  useEffect(() => {
    if (params?.slug) {
      fetchSettings();
    }
  }, [params?.slug]);

  async function fetchSettings() {
    try {
      setFetching(true);
      const res = await fetch(`/api/admin/${params.slug}/settings`);
      const data = await res.json();

      if (Array.isArray(data.active_plugins)) {
        setActivePlugins(data.active_plugins);
      }

      if (data.settings) {
        const s = data.settings;
        form.reset({
          business_name: s.business_name || '',
          category: s.category || '',
          phone: s.phone || '',
          whatsapp_number: s.whatsapp_number || '',
          address: s.address || '',
          logo_url: s.logo_url || '',
          banner_url: s.banner_url || '',
          primary_color: s.primary_color || TENANT_DEFAULTS.PRIMARY_COLOR,
          secondary_color: s.secondary_color || TENANT_DEFAULTS.SECONDARY_COLOR,
          accent_color: s.accent_color || TENANT_DEFAULTS.ACCENT_COLOR,
          font_family: s.font_family || TENANT_DEFAULTS.FONT_FAMILY,
          primary_currency: s.primary_currency || TENANT_DEFAULTS.BASE_CURRENCY,
          secondary_currency: s.secondary_currency || TENANT_DEFAULTS.BASE_CURRENCY,
          contingency_offline_mode: s.contingency_offline_mode || 'normal',
          offline_safety_buffer: s.offline_safety_buffer !== undefined ? Number(s.offline_safety_buffer) : 2,
          social_media: {
            instagram: s.social_media?.instagram || '',
            facebook: s.social_media?.facebook || '',
            tiktok: s.social_media?.tiktok || '',
            twitter: s.social_media?.twitter || '',
            youtube: s.social_media?.youtube || '',
          },
          taxes: {
            tax_enabled: s.taxes?.tax_enabled ?? true,
            tax_rate: typeof s.taxes?.tax_rate === 'number' ? s.taxes.tax_rate : 16,
            prices_include_tax: s.taxes?.prices_include_tax ?? false,
          },
        });
      }
    } catch {
      toast.error('Error al cargar la configuración');
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(data: SettingsForm) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/${params.slug}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        toast.success('Configuración y Branding guardados exitosamente', {
          description: 'Los cambios se aplican de inmediato en la vitrina digital.',
        });
        router.refresh();
      } else {
        const err = await res.json();
        toast.error('Error al guardar configuración', { description: err.error });
      }
    } catch {
      toast.error('Error de red al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-lime-600 dark:text-lime-400" />
        <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Configuración del Comercio
          </h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 font-medium mt-1">
            Personaliza la identidad visual, logo, métodos de pago y plugins del comercio
          </p>
        </div>

        {/* SELECTOR DE SECCIÓN ÚNICO (SIN DUPLICACIÓN NI TÍTULOS REDUNDANTES) */}
        <div className="w-full sm:w-72 shrink-0">
          <Select 
            value={activeTab} 
            onValueChange={(val) => {
              setActiveTab(val);
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', val);
                window.history.replaceState({}, '', url.toString());
              }
            }}
          >
            <SelectTrigger 
              aria-label="Seleccionar sección de configuración"
              className="w-full h-11 bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 font-bold text-slate-900 dark:text-white rounded-xl shadow-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <CurrentIcon className="w-4 h-4 text-red-600 dark:text-red-500 shrink-0" />
                <span className="truncate">{currentSection?.label}</span>
                {currentSection?.badge && (
                  <span className="ml-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-600 dark:text-lime-400 border border-lime-500/20 shrink-0">
                    {currentSection.badge}
                  </span>
                )}
              </div>
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-xl max-h-80">
              {availableSections.map((sec) => {
                const SecIcon = sec.icon;
                return (
                  <SelectItem key={sec.id} value={sec.id} className="font-semibold cursor-pointer py-2.5">
                    <div className="flex items-center gap-2.5 w-full">
                      <SecIcon className="w-4 h-4 text-slate-500 dark:text-zinc-400 shrink-0" />
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">{sec.label}</span>
                        <span className="text-[11px] font-normal text-slate-500 dark:text-zinc-400 line-clamp-1">{sec.description}</span>
                      </div>
                      {sec.badge && (
                        <span className="ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-lime-500/10 text-lime-600 dark:text-lime-400 border border-lime-500/20 shrink-0">
                          {sec.badge}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* TAB 1: GENERAL */}
          <TabsContent value="general" className="space-y-4">
            <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-extrabold uppercase tracking-wider text-slate-950 dark:text-white">
                  Identidad Comercial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="business_name" className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Nombre Comercial *
                  </Label>
                  <Input
                    id="business_name"
                    {...form.register('business_name')}
                    placeholder="Ej. Mi Comercio C.A."
                    className="bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-950 dark:text-white text-sm font-medium h-11"
                  />
                  {form.formState.errors.business_name && (
                    <p className="text-xs text-red-600 font-semibold">
                      {form.formState.errors.business_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="category" className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Rubro o Categoría Comercial
                  </Label>
                  <Input
                    id="category"
                    {...form.register('category')}
                    placeholder="Ej. Supermercado & Delicatessen"
                    className="bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-950 dark:text-white text-sm font-medium h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address" className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Dirección Física (Punto de Retiro Pick-up)
                  </Label>
                  <Textarea
                    id="address"
                    {...form.register('address')}
                    rows={2}
                    placeholder="Ej. Dirección física para retiro en tienda"
                    className="bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-950 dark:text-white text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="primary_currency" className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                      Moneda Base Canónica (Precios de Productos)
                    </Label>
                    <Select
                      value={form.watch('primary_currency') || 'USD'}
                      onValueChange={(val) => form.setValue('primary_currency', val)}
                    >
                      <SelectTrigger className="bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-950 dark:text-white text-sm h-11 font-mono font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-[#141416] border-slate-200 dark:border-zinc-800 text-sm">
                        <SelectItem value="USD">USD ($) - Dólares Americanos</SelectItem>
                        <SelectItem value="EUR">EUR (€) - Euros Unión Europea</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-700 dark:text-zinc-400">
                      Moneda principal en la que fijas los precios en inventario y catálogo.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="secondary_currency" className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                      Moneda Secundaria (Multimoneda / Localización)
                    </Label>
                    {hasLocalizationPlugin ? (
                      <Select
                        value={form.watch('secondary_currency')}
                        onValueChange={(value) => form.setValue('secondary_currency', value)}
                      >
                        <SelectTrigger className="bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-800 text-slate-950 dark:text-white text-sm h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-[#141416] border-slate-200 dark:border-zinc-800 text-sm">
                          <SelectItem value="VES">VES - Bolívares (Plugin Venezuela)</SelectItem>
                          <SelectItem value="COP">COP - Pesos Colombianos</SelectItem>
                          <SelectItem value="EUR">EUR - Euros</SelectItem>
                          <SelectItem value="USD">USD - Solo Dólares</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-zinc-900/60 border border-slate-300 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-zinc-300 truncate">
                          Solo USD activo (Sin plugin de localización)
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold tenant-secondary-badge border shrink-0">
                          CORE USD
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-slate-700 dark:text-zinc-400">
                      {hasLocalizationPlugin
                        ? 'Plugin de localización activo para conversión bimonetaria.'
                        : 'Requiere activar el plugin de localización/multimoneda para habilitar conversiones.'}
                    </p>
                  </div>
                </div>

                {/* POLÍTICA FISCAL Y DE IMPUESTOS (CORE) */}
                <div className="pt-5 border-t border-slate-200 dark:border-zinc-800 space-y-4">
                  <div>
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-red-600 dark:text-red-500" />
                      Régimen Tributario del Comercio (Core)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Define si el comercio opera con desglose fiscal (IVA) o en modalidad no fiscal (venta plana directa).
                    </p>
                  </div>

                  {/* Selector de Modo Fiscal vs No Fiscal */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => form.setValue('taxes.tax_enabled', false, { shouldDirty: true })}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        !form.watch('taxes.tax_enabled')
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-500'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 text-slate-700 dark:text-zinc-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Ban className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          Modo No Fiscal (Sin Impuestos)
                        </span>
                        {!form.watch('taxes.tax_enabled') && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                        Precios planos. Sin desglose de IVA ni retención de IGTF en mostrador ni vitrina. Subtotal = Total.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => form.setValue('taxes.tax_enabled', true, { shouldDirty: true })}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        form.watch('taxes.tax_enabled')
                          ? 'border-red-500 bg-red-500/10 text-red-950 dark:text-red-100 ring-1 ring-red-500'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 text-slate-700 dark:text-zinc-300 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                          Modo Fiscal (Con IVA / Alícuotas)
                        </span>
                        {form.watch('taxes.tax_enabled') && (
                          <CheckCircle2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-snug">
                        Cálculo tributario con desglose de base gravada/exenta y recargos fiscales aplicables.
                      </p>
                    </button>
                  </div>

                  {/* Parámetros fiscales si Modo Fiscal está activo */}
                  {form.watch('taxes.tax_enabled') ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
                      <div className="space-y-1.5">
                        <Label htmlFor="tax_rate" className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                          Alícuota General de Impuesto (%)
                        </Label>
                        <Input
                          id="tax_rate"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          {...form.register('taxes.tax_rate', { valueAsNumber: true })}
                          className="bg-white dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-950 dark:text-white text-sm font-mono font-bold h-10"
                        />
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Porcentaje de IVA general (ej. 16.00% en Venezuela, 19.00% en Colombia).
                        </p>
                      </div>

                      <div className="space-y-2 pt-2">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            {...form.register('taxes.prices_include_tax')}
                            className="w-4 h-4 rounded text-red-600 cursor-pointer"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              Precios de catálogo ya incluyen impuesto (PVP neto)
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                              Si está activo, el IVA se desglosa del precio sin aumentarlo al cliente.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Modo No Fiscal activo: El POS y la Vitrina operarán de forma plana sin IVA ni IGTF.</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: BRANDING (LOGO Y PALETA) */}
          <TabsContent value="branding" className="space-y-4">
            <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Logotipo y Banner en Cloudflare R2
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Logotipo del Negocio (Cuadrado 1:1)
                    </Label>
                    <ImageUploader
                      tenantSlug={params.slug}
                      path="logos"
                      value={form.watch('logo_url')}
                      onChange={(url) => form.setValue('logo_url', url, { shouldDirty: true })}
                      aspectRatio="square"
                      maxSize={2}
                    />
                    <p className="text-[10px] text-slate-400">
                      Aparecerá en el encabezado de la vitrina digital, el panel admin y los tickets de venta.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Banner Promocional Superior (16:9 o Panorámico)
                    </Label>
                    <ImageUploader
                      tenantSlug={params.slug}
                      path="banners"
                      value={form.watch('banner_url')}
                      onChange={(url) => form.setValue('banner_url', url, { shouldDirty: true })}
                      aspectRatio="wide"
                      maxSize={5}
                    />
                    <p className="text-[10px] text-slate-400">
                      Banner decorativo para el hero de la vitrina digital de tu tienda.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Paleta Cromática de Marca
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Presets rápidos */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
                    Estilos Prediseñados
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => {
                          form.setValue('primary_color', preset.hex, { shouldDirty: true });
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          form.watch('primary_color').toLowerCase() === preset.hex.toLowerCase()
                            ? 'border-slate-900 dark:border-white shadow-xs bg-slate-100 dark:bg-zinc-800'
                            : 'border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-850'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: preset.hex }}
                        />
                        <span className="text-slate-800 dark:text-zinc-200">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="primary_color" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Color Primario (Botones & Acentos)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="primary_color"
                        type="color"
                        {...form.register('primary_color')}
                        className="w-12 h-10 p-1 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 rounded-xl cursor-pointer"
                      />
                      <Input
                        {...form.register('primary_color')}
                        className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-mono text-xs h-10 uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="secondary_color" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Color Secundario (Fondos / Paneles)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="secondary_color"
                        type="color"
                        {...form.register('secondary_color')}
                        className="w-12 h-10 p-1 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 rounded-xl cursor-pointer"
                      />
                      <Input
                        {...form.register('secondary_color')}
                        className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-mono text-xs h-10 uppercase"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="accent_color" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Color de Contraste
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="accent_color"
                        type="color"
                        {...form.register('accent_color')}
                        className="w-12 h-10 p-1 bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 rounded-xl cursor-pointer"
                      />
                      <Input
                        {...form.register('accent_color')}
                        className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white font-mono text-xs h-10 uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Previsualización en vivo de los 3 colores */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/50 space-y-3">
                  <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                    Vista previa integral de tus 3 colores de marca:
                  </p>
                  <div
                    className="p-4 rounded-xl border-b-4 flex flex-wrap items-center justify-between gap-3"
                    style={{
                      backgroundColor: form.watch('secondary_color') || '#09090b',
                      color: form.watch('accent_color') || '#ffffff',
                      borderBottomColor: form.watch('primary_color') || '#dc2626',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      {form.watch('logo_url') && (
                        <div className="w-9 h-9 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={form.watch('logo_url')!} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-extrabold leading-tight">
                          {form.watch('business_name') || 'Tu Comercio'}
                        </p>
                        <p className="text-[11px] opacity-80">Panel Secundario + Color Contraste</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        style={{
                          backgroundColor: form.watch('primary_color') || '#dc2626',
                          color: form.watch('accent_color') || '#ffffff',
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Botón Primario
                      </button>
                      <div
                        style={{
                          borderColor: form.watch('primary_color') || '#dc2626',
                          color: form.watch('accent_color') || '#ffffff',
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                      >
                        Badge
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: CONTACTO & CONTINGENCIA */}
          <TabsContent value="contact" className="space-y-4">
            <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Canales de Comunicación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp_number" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      WhatsApp Oficial de Pedidos *
                    </Label>
                    <Input
                      id="whatsapp_number"
                      {...form.register('whatsapp_number')}
                      placeholder="+00 000 0000000"
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                    <p className="text-[10px] text-slate-400">
                      A este número llegarán las confirmaciones automáticas de pedidos desde la vitrina.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Teléfono Fijo o Soporte
                    </Label>
                    <Input
                      id="phone"
                      {...form.register('phone')}
                      placeholder="+00 000 0000000"
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Políticas de Contingencia Eléctrica / Offline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="contingency_offline_mode" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Modo ante ausencia de conexión del POS (&gt;15 min)
                  </Label>
                  <Select
                    value={form.watch('contingency_offline_mode')}
                    onValueChange={(value) =>
                      form.setValue('contingency_offline_mode', value as 'preorder_request' | 'safety_buffer' | 'normal', {
                        shouldDirty: true,
                      })
                    }
                  >
                    <SelectTrigger className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#141416] border-slate-200 dark:border-zinc-800 text-xs">
                      <SelectItem value="normal">
                        Operación Normal (Sin aviso de contingencia)
                      </SelectItem>
                      <SelectItem value="preorder_request">
                        Aceptar Pre-orders de Contingencia (Aviso de corte eléctrico)
                      </SelectItem>
                      <SelectItem value="safety_buffer">
                        Buffer de Seguridad (Descuenta margen de inventario en vitrina)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-400">
                    Controla el comportamiento automático cuando la sede física pierde electricidad o conectividad.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="offline_safety_buffer" className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                    Buffer de Seguridad de Stock (Unidades de Reserva)
                  </Label>
                  <Input
                    id="offline_safety_buffer"
                    type="number"
                    min="0"
                    {...form.register('offline_safety_buffer', { valueAsNumber: true })}
                    className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10 w-32 font-mono"
                  />
                  <p className="text-[10px] text-slate-400">
                    Unidades restadas automáticamente del catálogo web durante contingencia para evitar sobreventa.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: REDES SOCIALES */}
          <TabsContent value="social" className="space-y-4">
            <Card className="bg-white dark:bg-[#121214] border-slate-200 dark:border-zinc-800 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Presencia Digital & Redes Sociales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Instagram
                    </Label>
                    <Input
                      placeholder="@tu_negocio"
                      {...form.register('social_media.instagram')}
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Facebook
                    </Label>
                    <Input
                      placeholder="facebook.com/tu_negocio"
                      {...form.register('social_media.facebook')}
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      TikTok
                    </Label>
                    <Input
                      placeholder="@tu_negocio"
                      {...form.register('social_media.tiktok')}
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      Twitter / X
                    </Label>
                    <Input
                      placeholder="@tu_negocio"
                      {...form.register('social_media.twitter')}
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                      YouTube
                    </Label>
                    <Input
                      placeholder="youtube.com/@tu_negocio"
                      {...form.register('social_media.youtube')}
                      className="bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white text-xs h-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* TAB 5: MÉTODOS DE PAGO */}
          <TabsContent value="payments" className="space-y-4">
            <PaymentMethodsManager slug={params.slug} />
          </TabsContent>
          {/* TAB 6: TASA & MONEDA (BCV) */}
          {hasLocalizationPlugin && (
            <TabsContent value="bcv" className="space-y-4">
              <BcvRateTab slug={params.slug} />
            </TabsContent>
          )}
        </Tabs>

        {/* Botón Guardar Flotante / Sticky (solo para pestañas del formulario general) */}
        {activeTab !== 'payments' && activeTab !== 'bcv' && (
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
            <Button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: form.watch('primary_color') || TENANT_DEFAULTS.PRIMARY_COLOR,
                color: '#ffffff',
              }}
              className="hover:opacity-90 font-extrabold px-6 py-2.5 rounded-xl shadow-md cursor-pointer disabled:opacity-50 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Guardando Cambios...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Configuración
                </>
              )}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
