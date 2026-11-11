'use client';

import { useState, useTransition } from 'react';
import { updateTenantSettings } from '@/app/actions/tenant/settings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Store, Phone, MapPin, DollarSign, ShieldAlert, 
  CheckCircle2, AlertCircle, Palette, UploadCloud, 
  Loader2, Sparkles, Check, X 
} from 'lucide-react';
import { toast } from 'sonner';

interface SettingsData {
  business_name: string;
  category: string;
  phone: string | null;
  whatsapp_number: string | null;
  address: string | null;
  primary_currency: string;
  secondary_currency: string;
  exchange_rate: string | number;
  contingency_offline_mode: string;
  offline_safety_buffer: number;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
}

const COLOR_PRESETS = [
  { name: 'Lima Retail (Default)', hex: '#84cc16', text: '#000000' },
  { name: 'Esmeralda Fresh', hex: '#10b981', text: '#ffffff' },
  { name: 'Azul Market', hex: '#2563eb', text: '#ffffff' },
  { name: 'Violeta Gourmet', hex: '#7c3aed', text: '#ffffff' },
  { name: 'Ámbar Deli', hex: '#f59e0b', text: '#000000' },
  { name: 'Rojo Express', hex: '#dc2626', text: '#ffffff' },
  { name: 'Onyx Minimal', hex: '#18181b', text: '#ffffff' },
];

export function SettingsForm({ slug, initialSettings }: { slug: string; initialSettings: SettingsData }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Estados de Branding
  const [logoUrl, setLogoUrl] = useState<string>(initialSettings.logo_url || '');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [primaryColor, setPrimaryColor] = useState<string>(initialSettings.primary_color || '#84cc16');

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingLogo(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'branding');
      formData.append('tenantSlug', slug);

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.url) {
        setLogoUrl(data.url);
        toast.success('Logotipo subido a Cloudflare R2');
      } else {
        toast.error('Error al subir el logo', {
          description: data.error || 'Verifica el formato del archivo.',
        });
      }
    } catch {
      toast.error('Error de red al conectar con Cloudflare R2');
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const formData = new FormData(e.currentTarget);
    formData.set('logo_url', logoUrl);
    formData.set('primary_color', primaryColor);

    startTransition(async () => {
      const result = await updateTenantSettings(slug, formData);
      if (result.success) {
        setStatus({
          type: 'success',
          message: 'Configuración y Branding guardados exitosamente. Los cambios se reflejarán de inmediato en la vitrina digital y el panel.',
        });
        toast.success('Configuración actualizada exitosamente');
      } else {
        setStatus({
          type: 'error',
          message: result.error || 'Ocurrió un error al guardar los cambios.',
        });
        toast.error(result.error || 'Error al guardar');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {status && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-medium border ${
          status.type === 'success' 
            ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-500/20' 
            : 'bg-rose-500/10 text-rose-800 dark:text-rose-400 border-rose-500/20'
        }`}>
          {status.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{status.message}</span>
        </div>
      )}

      {/* 1. Branding & Identidad Visual (Logo y Paleta de Colores) */}
      <Card className="border-slate-200 dark:border-zinc-800">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-lime-600 dark:text-lime-400" />
            <CardTitle>Identidad Visual & Branding del Comercio</CardTitle>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Personaliza el logotipo y la paleta de colores para que tu vitrina digital y punto de venta reflejen la esencia única de tu negocio.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Subida de Logo */}
          <div className="space-y-3">
            <label className="text-xs font-extrabold text-slate-700 dark:text-zinc-300 block">
              Logotipo Oficial (Cloudflare R2)
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-zinc-850 border-2 border-dashed border-slate-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden shrink-0 relative shadow-xs">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Logo Preview"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <Store className="w-10 h-10 text-slate-300 dark:text-zinc-600" />
                )}

                {isUploadingLogo && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </div>

              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold text-xs cursor-pointer transition shadow-xs">
                    <UploadCloud className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    <span>{isUploadingLogo ? 'Subiendo Logo...' : 'Subir Nuevo Logotipo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      disabled={isUploadingLogo}
                      onChange={handleLogoUpload}
                    />
                  </label>

                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLogoUrl('')}
                      className="text-xs h-9 text-rose-500 hover:text-rose-600"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Quitar Logo
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Formato recomendado: PNG o SVG transparente (relación cuadrada o 1:1). Visible en el header de la vitrina digital, el POS y los tickets.
                </p>
              </div>
            </div>
          </div>

          {/* Paleta de Colores de Marca */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-zinc-850">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-extrabold text-slate-700 dark:text-zinc-300 block">
                  Color Primario de Marca (Accent)
                </label>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Afecta botones de compra, badges de stock y acentos de navegación.
                </p>
              </div>

              {/* Selector Hexadecimal Directo */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 dark:border-zinc-700 bg-transparent"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-24 h-8 text-xs font-mono uppercase font-bold text-center"
                />
              </div>
            </div>

            {/* Presets de Color */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2">
              {COLOR_PRESETS.map((preset) => {
                const isSelected = primaryColor.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setPrimaryColor(preset.hex)}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-16 ${
                      isSelected
                        ? 'border-slate-900 dark:border-white ring-2 ring-lime-500/30 shadow-xs'
                        : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: preset.hex }}
                      />
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-white" />}
                    </div>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 truncate mt-1">
                      {preset.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Previsualización en Vivo */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between gap-4 mt-3">
              <span className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
                Previsualización de Botón en Vitrina:
              </span>
              <button
                type="button"
                className="h-9 px-4 rounded-xl font-black text-xs shadow-xs transition cursor-default flex items-center gap-1.5"
                style={{
                  backgroundColor: primaryColor,
                  color: primaryColor === '#84cc16' || primaryColor === '#f59e0b' ? '#000000' : '#ffffff',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ Añadir al Carrito</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Perfil del Negocio */}
      <Card className="border-slate-200 dark:border-zinc-800">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-lime-600 dark:text-lime-400" />
            <CardTitle>Identidad & Contacto del Comercio</CardTitle>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Información visible en la vitrina digital y tickets de compra.
          </p>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Nombre Comercial *
            </label>
            <Input 
              name="business_name" 
              defaultValue={initialSettings.business_name} 
              required 
              placeholder="Ej. Mi Comercio C.A."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Rubro o Categoría
            </label>
            <Input 
              name="category" 
              defaultValue={initialSettings.category || 'Minimarket & Bodegón'} 
              placeholder="Ej. Supermercado, Bodegón, Farmacia..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              Teléfono de Contacto
            </label>
            <Input 
              name="phone" 
              defaultValue={initialSettings.phone || ''} 
              placeholder="+00 000 0000000"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              WhatsApp Oficial de Pedidos *
            </label>
            <Input 
              name="whatsapp_number" 
              defaultValue={initialSettings.whatsapp_number || ''} 
              required 
              placeholder="+00 000 0000000"
            />
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              Los clientes enviarán la confirmación de su orden directamente a este número.
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Dirección de Retiro en Tienda (Pick-up) *
            </label>
            <Input 
              name="address" 
              defaultValue={initialSettings.address || 'Av. Francisco de Miranda, Edif. Centro Plaza, PB, Local 12'} 
              required 
              placeholder="Dirección física exacta donde el cliente retira su pedido"
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Moneda & Configuración Monetaria (Core Agnóstico) */}
      <Card className="border-slate-200 dark:border-zinc-800">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <CardTitle>Régimen Monetario (Core Agnóstico)</CardTitle>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Moneda base fiduciaria canónica del sistema. Los plugins de localización gestionan tasas y monedas secundarias.
          </p>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Moneda Base Canónica
            </label>
            <Input 
              name="primary_currency" 
              defaultValue="USD" 
              readOnly 
              className="bg-slate-100 dark:bg-zinc-800/50 cursor-not-allowed font-mono font-bold"
            />
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">Estricto por Blueprint (USD $)</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Plugin de Localización
            </label>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400 flex items-center justify-between">
              <span>local_venezuela (Inactivo en Core)</span>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400">
                Core USD
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              Al activar el plugin de localización se habilitará la conversión automática y tasas oficiales.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Operación Vitrina & Modo de Contingencia */}
      <Card className="border-slate-200 dark:border-zinc-800">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <CardTitle>Políticas de Contingencia Offline</CardTitle>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Comportamiento automático de la vitrina digital cuando el POS físico pierde conexión (&gt;15 min).
          </p>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Modo de Contingencia
            </label>
            <select 
              name="contingency_offline_mode" 
              defaultValue={initialSettings.contingency_offline_mode || 'preorder_request'}
              className="flex h-10 w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 px-3.5 py-2 text-sm text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lime-500/20 focus:border-lime-500 dark:focus:border-lime-400 transition-all font-medium"
            >
              <option value="preorder_request">Aceptar Pedidos de Contingencia (Pre-order Pick-up)</option>
              <option value="read_only_catalog">Catálogo Informativo (Solo Lectura, sin compra)</option>
              <option value="maintenance">Pausa Temporal / Mantenimiento</option>
            </select>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              En modo Pre-order, los pedidos web entran en cola sujeta a confirmación en mostrador.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Buffer de Seguridad de Stock (Unidades) *
            </label>
            <Input 
              name="offline_safety_buffer" 
              type="number" 
              min="0" 
              max="50" 
              defaultValue={initialSettings.offline_safety_buffer ?? 2} 
              required 
              className="font-mono font-semibold"
            />
            <p className="text-[11px] text-slate-400 dark:text-zinc-500">
              Unidades restadas automáticamente del catálogo web durante contingencia para evitar sobreventas.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button 
          type="submit" 
          disabled={isPending || isUploadingLogo}
          className="bg-lime-500 hover:bg-lime-600 text-black font-extrabold px-6 py-2.5 rounded-xl shadow-sm transition-all"
        >
          {isPending ? 'Guardando Cambios...' : 'Guardar Configuración & Branding'}
        </Button>
      </div>
    </form>
  );
}
