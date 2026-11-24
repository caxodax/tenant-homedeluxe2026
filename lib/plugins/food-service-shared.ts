/**
 * MarketOS — Food Service Shared Types & Pure Functions
 * Módulo puro (Client-Safe) para consumo tanto en componentes de React ('use client')
 * como en Server Components y API Routes.
 * CERO dependencias de Node.js nativo (fs, net, dns, pg).
 */

import { z } from 'zod';

// ============================================================================
// 1. ESQUEMAS DE CONFIGURACIÓN Y VALIDACIÓN (ZOD)
// ============================================================================

export const FoodServiceConfigSchema = z.object({
  service_charge_mode: z
    .enum(['NONE', 'TIP_VOLUNTARY', 'SERVICE_CHARGE_FIXED'])
    .default('TIP_VOLUNTARY'),
  service_charge_pct: z.number().min(0).max(100).default(10),
  kitchen_output: z.enum(['KDS', 'PRINT', 'BOTH']).default('BOTH'),
  hidden_category_slugs: z.array(z.string()).default(['adicionales', 'ingredientes']),
  kds_sound: z.boolean().default(true),
  kds_warn_minutes: z.number().int().min(1).max(120).default(12),
});

export type FoodServiceConfig = z.infer<typeof FoodServiceConfigSchema>;

export const FsZoneInputSchema = z.object({
  name: z.string().min(2, 'El nombre de la zona debe tener al menos 2 caracteres').max(60),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
export type FsZoneInput = z.infer<typeof FsZoneInputSchema>;

export const FsTableInputSchema = z.object({
  zone_id: z.string().uuid().nullable().optional(),
  label: z.string().min(1, 'El identificador de mesa es requerido').max(30),
  seats: z.number().int().min(1, 'Mínimo 1 comensal').default(4),
  status: z.enum(['FREE', 'OCCUPIED', 'RESERVED', 'CLEANING']).default('FREE'),
  is_active: z.boolean().default(true),
});
export type FsTableInput = z.infer<typeof FsTableInputSchema>;

export const FsOpenTableInputSchema = z.object({
  table_id: z.string().uuid('ID de mesa inválido'),
  staff_id: z.string().uuid().optional().nullable(),
  covers: z.number().int().min(1).default(1),
  notes: z.string().max(300).optional().nullable(),
});
export type FsOpenTableInput = z.infer<typeof FsOpenTableInputSchema>;

export const FsSendToKitchenInputSchema = z.object({
  order_id: z.string().uuid('ID de orden inválido'),
  ticket_id: z.string().uuid('ID de ticket inválido').optional().nullable(),
  prep_notes: z.record(z.string(), z.string()).optional().default({}),
});
export type FsSendToKitchenInput = z.infer<typeof FsSendToKitchenInputSchema>;

export const FsKitchenUpdateInputSchema = z.object({
  kitchen_ticket_id: z.string().uuid('ID de comanda inválido'),
  item_ids: z.array(z.string().uuid()).optional().nullable(),
  action: z.enum(['READY_ITEM', 'READY_ALL', 'SERVED', 'VOID', 'RECALL']).default('READY_ALL'),
});
export type FsKitchenUpdateInput = z.infer<typeof FsKitchenUpdateInputSchema>;

export const FsSplitItemSchema = z.object({
  split_no: z.number().int().min(1),
  label: z.string().max(50).optional(),
  amount_primary: z.number().min(0),
  amount_secondary: z.number().min(0).optional(),
  method: z.string().default('CASH'),
  reference: z.string().max(60).optional(),
  item_refs: z.array(z.string()).optional().default([]),
});

export const FsPayTableInputSchema = z.object({
  ticket_id: z.string().uuid('ID de comanda de mesa inválido'),
  pay_mode: z.enum(['FULL', 'EQUAL', 'ITEMS']).default('FULL'),
  splits: z.array(FsSplitItemSchema).optional().default([]),
  tip_amount_primary: z.number().min(0).default(0.0),
  payment_method: z.string().default('CASH'),
  exchange_rate: z.number().positive().default(1.0),
  staff_id: z.string().uuid().optional().nullable(),
});
export type FsPayTableInput = z.infer<typeof FsPayTableInputSchema>;

export const FsToggle86InputSchema = z.object({
  product_id: z.string().uuid('ID de producto inválido'),
  is_86: z.boolean().default(true),
});
export type FsToggle86Input = z.infer<typeof FsToggle86InputSchema>;

export const FsModifierGroupInputSchema = z.object({
  name: z.string().min(2).max(100),
  min_select: z.number().int().min(0).default(0),
  max_select: z.number().int().min(1).default(1),
  required: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});
export type FsModifierGroupInput = z.infer<typeof FsModifierGroupInputSchema>;

export const FsRawMaterialInputSchema = z.object({
  name: z.string().min(2).max(120),
  unit: z.enum(['GR', 'KG', 'ML', 'LT', 'UNID', 'PORCION']).default('GR'),
  current_stock: z.number().default(0.0),
  min_stock: z.number().min(0).default(0.0),
  cost_per_unit_primary: z.number().min(0).default(0.0),
  is_active: z.boolean().default(true),
});
export type FsRawMaterialInput = z.infer<typeof FsRawMaterialInputSchema>;

export const FsRecipeItemInputSchema = z.object({
  raw_material_id: z.string().uuid(),
  quantity: z.number().positive(),
  waste_pct: z.number().min(0).max(100).default(0),
});

export const FsRecipeInputSchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().min(2).max(120),
  yield_portions: z.number().positive().default(1.0),
  preparation_time_minutes: z.number().int().min(1).default(15),
  instructions: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  items: z.array(FsRecipeItemInputSchema).default([]),
});
export type FsRecipeInput = z.infer<typeof FsRecipeInputSchema>;

// ============================================================================
// 2. MODELOS DE DOMINIO E INTERFACES
// ============================================================================

export interface FsZone {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  tables?: FsTable[];
}

export interface FsTable {
  id: string;
  zone_id: string | null;
  zone_name?: string | null;
  label: string;
  seats: number;
  status: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  is_active: boolean;
  created_at: string;
  current_ticket?: FsTableTicket | null;
}

export interface FsTableTicket {
  id: string;
  table_id: string;
  table_label?: string;
  opened_by: string | null;
  opened_by_name?: string | null;
  covers: number;
  status: 'OPEN' | 'CLOSED' | 'VOIDED';
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  orders_count?: number;
  total_primary?: number;
}

export interface FsKitchenTicketItem {
  id: string;
  kitchen_ticket_id: string;
  order_item_id: string;
  product_name: string;
  quantity: number;
  modifiers: Array<{ name?: string; group_name?: string; option_name?: string; price?: number; [key: string]: unknown }>;
  prep_notes: string | null;
  status: 'PENDING' | 'READY' | 'VOIDED';
  ready_at: string | null;
}

export interface FsKitchenTicket {
  id: string;
  order_id: string;
  order_number?: string;
  ticket_id: string | null;
  table_label?: string;
  delivery_type?: string;
  status: 'PENDING' | 'FIRED' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED';
  fired_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  notes: string | null;
  created_at: string;
  items: FsKitchenTicketItem[];
}

export interface FsModifierGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  required: boolean;
  sort_order: number;
  is_active: boolean;
  options?: FsModifierOption[];
}

export interface FsModifierOption {
  product_id: string;
  name: string;
  price_primary: number;
  sort_order: number;
}

export interface FsRawMaterial {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  cost_per_unit_primary?: number;
  is_active: boolean;
  created_at: string;
}

export interface FsDaily86 {
  product_id: string;
  service_date: string;
  is_86: boolean;
  product_name?: string;
}

// ============================================================================
// 3. FUNCIONES PURAS DE CÁLCULO (SPLIT BILL, PROPINA Y SEMÁFORO KDS)
// ============================================================================

/**
 * Calcula división en partes iguales de una cuenta bimonetaria.
 * Asigna cualquier centavo residual (diferencia de redondeo) a la última división.
 */
export function calculateSplitBillEqual(
  totalPrimary: number,
  splitsCount: number,
  exchangeRate: number
): Array<{ split_no: number; amount_primary: number; amount_secondary: number }> {
  if (splitsCount <= 1) {
    const p = Math.round(totalPrimary * 100) / 100;
    return [{ split_no: 1, amount_primary: p, amount_secondary: Math.round(p * exchangeRate * 100) / 100 }];
  }

  const basePerSplit = Math.floor((totalPrimary / splitsCount) * 100) / 100;
  const splits = [];
  let accumulated = 0;

  for (let i = 1; i <= splitsCount; i++) {
    const isLast = i === splitsCount;
    const amountP = isLast
      ? Math.round((totalPrimary - accumulated) * 100) / 100
      : basePerSplit;
    accumulated += amountP;
    const amountS = Math.round(amountP * exchangeRate * 100) / 100;
    splits.push({ split_no: i, amount_primary: amountP, amount_secondary: amountS });
  }

  return splits;
}

/**
 * Calcula propina o cargo por servicio según el modo configurado.
 */
export function calculateTipOrServiceCharge(
  subtotalPrimary: number,
  mode: 'NONE' | 'TIP_VOLUNTARY' | 'SERVICE_CHARGE_FIXED',
  pct = 10
): number {
  if (mode === 'NONE') return 0.0;
  const rate = Math.max(0, pct) / 100;
  return Math.round(subtotalPrimary * rate * 100) / 100;
}

/**
 * Determina el estado de alerta del semáforo KDS según minutos transcurridos.
 */
export function getKdsTimeStatus(
  firedAt: string | Date | null,
  warnMinutes = 12
): { elapsedMinutes: number; level: 'NORMAL' | 'WARN' | 'DANGER' } {
  if (!firedAt) return { elapsedMinutes: 0, level: 'NORMAL' };
  const firedTime = new Date(firedAt).getTime();
  const now = Date.now();
  const elapsedMinutes = Math.max(0, Math.floor((now - firedTime) / 60000));

  if (elapsedMinutes >= warnMinutes * 1.5) {
    return { elapsedMinutes, level: 'DANGER' };
  }
  if (elapsedMinutes >= warnMinutes) {
    return { elapsedMinutes, level: 'WARN' };
  }
  return { elapsedMinutes, level: 'NORMAL' };
}
