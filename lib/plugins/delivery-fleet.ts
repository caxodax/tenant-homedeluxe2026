/**
 * MarketOS — Plugin Delivery Fleet (`delivery_fleet`)
 * Módulo de dominio de logística, despacho motorizado, geocálculo y comanda WhatsApp.
 * Principio Ponytail & Impeccable: Tipado estricto, funciones puras y cero dependencias pesadas.
 */

import { z } from 'zod';

// ============================================================================
// 1. ESQUEMAS DE CONFIGURACIÓN Y VALIDACIÓN (ZOD)
// ============================================================================

export const DeliveryFleetConfigSchema = z.object({
  gps_consent_required: z.boolean().default(true),
  default_zone_id: z.string().nullable().default(null),
  auto_resolve_zone_on_gps: z.boolean().default(true),
  fallback_enabled: z.boolean().default(true),
  whatsapp_template_enabled: z.boolean().default(true),
});

export type DeliveryFleetConfig = z.infer<typeof DeliveryFleetConfigSchema>;

export const DeliveryZoneInputSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  description: z.string().optional().nullable(),
  center_lat: z.number().nullable().optional(),
  center_lng: z.number().nullable().optional(),
  radius_km: z.number().positive('El radio debe ser mayor a 0').default(3.0),
  rate_primary: z.number().min(0, 'La tarifa no puede ser negativa').default(0.0),
  estimated_time: z.string().default('30-45 min'),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export type DeliveryZoneInput = z.infer<typeof DeliveryZoneInputSchema>;

export const DeliveryDriverInputSchema = z.object({
  full_name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').max(120),
  id_document: z.string().min(5, 'Documento de identidad requerido').max(30),
  license_plate: z.string().min(2, 'Placa requerida').max(20),
  phone: z.string().min(7, 'Teléfono debe tener al menos 7 dígitos').max(25),
  home_zone_id: z.string().uuid().optional().nullable(),
  vehicle_type: z.enum(['motorcycle', 'bicycle', 'car', 'on_foot', 'MOTO', 'CARRO', 'BICICLETA']).default('motorcycle'),
  is_active: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

export type DeliveryDriverInput = z.infer<typeof DeliveryDriverInputSchema>;

// ============================================================================
// 2. MODELOS DE DOMINIO Y TIPOS
// ============================================================================

export interface DeliveryZone {
  id: string;
  name: string;
  description: string | null;
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number;
  rate_primary: number;
  rate_usd: number;
  estimated_time: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveryDriver {
  id: string;
  full_name: string;
  id_document: string;
  license_plate: string;
  phone: string;
  home_zone_id: string | null;
  home_zone_name?: string | null;
  vehicle_type: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type DispatchStatus = 'PENDING' | 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED' | 'FAILED';

export interface DispatchRoute {
  id: string;
  order_id: string;
  order_number?: string;
  zone_id: string | null;
  zone_name_snapshot: string | null;
  zone_rate_snapshot_primary: number;
  zone_rate_snapshot_usd: number;
  driver_id: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  driver_plate?: string | null;
  driver_vehicle?: string | null;
  delivery_address: string;
  reference_point: string | null;
  customer_name: string;
  customer_phone: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  gps_consent: boolean;
  pinned_at: string | null;
  status: DispatchStatus;
  assigned_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  cash_tendered_primary: number | null;
  cash_change_primary: number | null;
  notes: string | null;
  order_total_primary?: number;
  order_total_secondary?: number;
  order_currency?: string;
  order_secondary_currency?: string;
  order_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price_primary: number;
    selected_modifiers?: Array<{ group_name: string; option_name: string }>;
  }>;
  created_at: string;
  updated_at: string;
}

export interface DeliveryIntelReport {
  delivery_revenue_primary: number;
  delivery_revenue_usd: number;
  total_deliveries: number;
  completed_deliveries: number;
  failed_deliveries: number;
  avg_delivery_minutes: number;
  zones_top_revenue: Array<{
    zone_name: string;
    count: number;
    total_primary: number;
  }>;
  drivers_performance: Array<{
    driver_name: string;
    license_plate: string;
    completed_count: number;
    avg_minutes: number;
  }>;
}

// ============================================================================
// 3. GEOLOCALIZACIÓN Y HAVERSINE
// ============================================================================

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Cálculo matemático Haversine en kilómetros entre dos coordenadas
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio medio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Extrae coordenadas GPS si el texto de la dirección contiene un enlace o pin
 */
export function extractGpsCoordinatesFromText(text: string): {
  lat: number | null;
  lng: number | null;
  cleanText: string;
  mapsUrl: string | null;
} {
  if (!text) {
    return { lat: null, lng: null, cleanText: '', mapsUrl: null };
  }

  // Patrón 1: @lat,lng (Google Maps URL común)
  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    return {
      lat,
      lng,
      cleanText: text.replace(/https?:\/\/\S+/gi, '').trim(),
      mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
    };
  }

  // Patrón 2: q=lat,lng o ll=lat,lng
  const qMatch = text.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    const lat = parseFloat(qMatch[1]);
    const lng = parseFloat(qMatch[2]);
    return {
      lat,
      lng,
      cleanText: text.replace(/https?:\/\/\S+/gi, '').trim(),
      mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
    };
  }

  // Patrón 3: lat,lng directo (ej. "10.0543,-69.2981")
  const rawMatch = text.match(/(-?\d{1,2}\.\d{4,7})\s*,\s*(-?\d{1,3}\.\d{4,7})/);
  if (rawMatch) {
    const lat = parseFloat(rawMatch[1]);
    const lng = parseFloat(rawMatch[2]);
    return {
      lat,
      lng,
      cleanText: text.replace(rawMatch[0], '').trim(),
      mapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
    };
  }

  return { lat: null, lng: null, cleanText: text.trim(), mapsUrl: null };
}

// ============================================================================
// 4. FORMATEADOR DE COMANDA WHATSAPP AL MOTORIZADO
// ============================================================================

export interface DriverDispatchPayload {
  dispatch: DispatchRoute;
  storeName?: string;
  currencySymbol?: string;
  secondaryCurrencySymbol?: string;
}

export function sanitizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Si empieza con 0 y tiene 11 dígitos (Venezuela: 04121234567 -> 584121234567)
  if (digits.startsWith('0') && digits.length === 11) {
    return `58${digits.slice(1)}`;
  }
  return digits;
}

export function formatDriverWhatsAppDispatchMessage({
  dispatch,
  storeName = 'MarketOS Delivery',
  currencySymbol = '$',
  secondaryCurrencySymbol = 'Bs.',
}: DriverDispatchPayload): string {
  const lines: string[] = [];

  lines.push(`🛵 *NUEVO DESPACHO ASIGNADO*`);
  lines.push(`🏪 *Tienda:* ${storeName}`);
  if (dispatch.driver_name) {
    lines.push(`👤 *Chofer:* ${dispatch.driver_name} (${dispatch.driver_vehicle || 'Motorizado'}${dispatch.driver_plate ? ` · Placa ${dispatch.driver_plate}` : ''})`);
  }
  lines.push(`────────────────────────`);
  lines.push(`📦 *Orden:* #${dispatch.order_number || dispatch.order_id.slice(0, 8)}`);
  lines.push(`👤 *Cliente:* ${dispatch.customer_name}`);
  lines.push(`📞 *Teléfono:* ${dispatch.customer_phone}`);

  const hasCoords = dispatch.latitude != null && dispatch.longitude != null;
  const parsed = extractGpsCoordinatesFromText(dispatch.delivery_address);
  const displayAddress = parsed.cleanText || dispatch.delivery_address;
  lines.push(`📍 *Dirección:* ${displayAddress}`);

  if (dispatch.reference_point) {
    lines.push(`🏷️ *Referencia:* ${dispatch.reference_point}`);
  }

  if (dispatch.zone_name_snapshot) {
    lines.push(`🗺️ *Zona:* ${dispatch.zone_name_snapshot}`);
  }

  const finalLat = dispatch.latitude ?? parsed.lat;
  const finalLng = dispatch.longitude ?? parsed.lng;
  if (finalLat != null && finalLng != null) {
    lines.push(`🛰️ *Ubicación GPS Exacta:*`);
    lines.push(`https://www.google.com/maps?q=${finalLat},${finalLng}`);
  } else {
    lines.push(`🗺️ *Buscar Dirección:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress)}`);
  }

  lines.push(`────────────────────────`);
  lines.push(`📋 *PRODUCTOS A ENTREGAR:*`);
  if (dispatch.order_items && dispatch.order_items.length > 0) {
    for (const item of dispatch.order_items) {
      lines.push(` • ${item.quantity}x ${item.product_name} (${currencySymbol} ${(Number(item.unit_price_primary) * item.quantity).toFixed(2)})`);
      if (item.selected_modifiers && item.selected_modifiers.length > 0) {
        for (const mod of item.selected_modifiers) {
          lines.push(`   └ ${mod.group_name}: ${mod.option_name}`);
        }
      }
    }
  } else {
    lines.push(` • Ver comanda física o detalle en sistema`);
  }

  lines.push(`────────────────────────`);
  lines.push(`💰 *INFORMACIÓN DE COBRO:*`);
  const totalPrimary = dispatch.order_total_primary != null ? Number(dispatch.order_total_primary) : null;
  const totalSecondary = dispatch.order_total_secondary != null ? Number(dispatch.order_total_secondary) : null;

  if (totalPrimary != null) {
    let totalStr = ` • *Total a Cobrar:* ${currencySymbol} ${totalPrimary.toFixed(2)}`;
    if (totalSecondary != null && totalSecondary > 0) {
      totalStr += ` (${secondaryCurrencySymbol} ${totalSecondary.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    }
    lines.push(totalStr);
  }

  lines.push(` • *Flete Delivery:* ${currencySymbol} ${Number(dispatch.zone_rate_snapshot_primary).toFixed(2)}`);

  if (dispatch.cash_tendered_primary && Number(dispatch.cash_tendered_primary) > 0) {
    const tendered = Number(dispatch.cash_tendered_primary);
    const change = dispatch.cash_change_primary != null ? Number(dispatch.cash_change_primary) : (totalPrimary ? Math.max(0, tendered - totalPrimary) : 0);
    lines.push(` • 💵 *El cliente paga con:* ${currencySymbol} ${tendered.toFixed(2)}`);
    lines.push(` • 🔄 *Llevar cambio / vuelto:* ${currencySymbol} ${change.toFixed(2)}`);
  }

  if (dispatch.notes?.trim()) {
    lines.push(`────────────────────────`);
    lines.push(`📝 *Observaciones:* ${dispatch.notes.trim()}`);
  }

  lines.push(`────────────────────────`);
  lines.push(`Por favor confirmar recepción y salida a ruta. ¡Maneja seguro! 🛵💨`);

  return lines.join('\n');
}

export function buildDriverWhatsAppDispatchUrl(payload: DriverDispatchPayload): string {
  const phone = payload.dispatch.driver_phone || payload.dispatch.customer_phone;
  const cleanPhone = sanitizeWhatsAppPhone(phone);
  const message = formatDriverWhatsAppDispatchMessage(payload);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
