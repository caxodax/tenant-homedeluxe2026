'use server';

import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi } from '@/lib/auth/tenant-guard';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';
import { invalidateTenantCache } from '@/lib/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const SettingsSchema = z.object({
  business_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  category: z.string().optional().default('Comercio General'),
  phone: z.string().optional().nullable(),
  whatsapp_number: z.string().min(8, 'El número de WhatsApp es requerido para notificaciones de órdenes'),
  address: z.string().min(5, 'La dirección física es requerida para el retiro en tienda (Pick-up)'),
  primary_currency: z.string().default('USD'),
  secondary_currency: z.string().default('USD'),
  exchange_rate: z.coerce.number().optional().default(0),
  contingency_offline_mode: z.enum(['preorder_request', 'read_only_catalog', 'maintenance']),
  offline_safety_buffer: z.coerce.number().int().min(0, 'El buffer no puede ser negativo'),
  logo_url: z.string().optional().nullable(),
  primary_color: z.string().optional().default(TENANT_DEFAULTS.PRIMARY_COLOR),
  secondary_color: z.string().optional().default(TENANT_DEFAULTS.SECONDARY_COLOR),
  accent_color: z.string().optional().default(TENANT_DEFAULTS.ACCENT_COLOR),
});

export type SettingsFormData = z.infer<typeof SettingsSchema>;

export async function updateTenantSettings(slug: string, formData: FormData) {
  try {
    const { tenant } = await requireTenantStaffApi(slug, 'settings');

    const rawData = {
      business_name: formData.get('business_name'),
      category: formData.get('category') || 'Comercio General',
      phone: formData.get('phone') || null,
      whatsapp_number: formData.get('whatsapp_number'),
      address: formData.get('address'),
      primary_currency: formData.get('primary_currency') || 'USD',
      secondary_currency: formData.get('secondary_currency') || 'USD',
      exchange_rate: formData.get('exchange_rate'),
      contingency_offline_mode: formData.get('contingency_offline_mode'),
      offline_safety_buffer: formData.get('offline_safety_buffer'),
      logo_url: formData.get('logo_url') ? (formData.get('logo_url') as string).trim() || null : null,
      primary_color: formData.get('primary_color') || TENANT_DEFAULTS.PRIMARY_COLOR,
      secondary_color: formData.get('secondary_color') || TENANT_DEFAULTS.SECONDARY_COLOR,
      accent_color: formData.get('accent_color') || TENANT_DEFAULTS.ACCENT_COLOR,
    };

    const parsed = SettingsSchema.safeParse(rawData);

    if (!parsed.success) {
      return { 
        success: false, 
        error: parsed.error.issues.map(i => i.message).join('. ') 
      };
    }

    const data = parsed.data;

    // 1. Actualizar configuración en el esquema del tenant
    await withTenantDb(tenant.db_schema_name, null, async (client) => {
      await client.query(`
        UPDATE settings
        SET 
          business_name = $1,
          category = $2,
          phone = $3,
          whatsapp_number = $4,
          address = $5,
          primary_currency = $6,
          secondary_currency = $7,
          exchange_rate = $8,
          contingency_offline_mode = $9,
          offline_safety_buffer = $10,
          logo_url = $11,
          primary_color = $12,
          secondary_color = $13,
          accent_color = $14,
          updated_at = NOW()
        WHERE key = 'general'
      `, [
        data.business_name,
        data.category,
        data.phone,
        data.whatsapp_number,
        data.address,
        data.primary_currency,
        data.secondary_currency,
        data.exchange_rate,
        data.contingency_offline_mode,
        data.offline_safety_buffer,
        data.logo_url,
        data.primary_color,
        data.secondary_color,
        data.accent_color,
      ]);
    });

    // 2. Sincronizar espejo en tabla platform.tenants
    await pool.query(`
      UPDATE platform.tenants
      SET 
        name = $1,
        contingency_offline_mode = $2,
        safety_buffer_units = $3,
        updated_at = NOW()
      WHERE slug = $4
    `, [
      data.business_name,
      data.contingency_offline_mode,
      data.offline_safety_buffer,
      slug
    ]);

    // 3. Revalidar cachés y rutas del storefront, admin y POS
    invalidateTenantCache(slug, 'settings');
    try {
      revalidatePath(`/t/${slug}/admin/settings`);
    } catch {}

    return { success: true };
  } catch (error: unknown) {
    console.error('Error updating tenant settings:', error);
    const message = error instanceof Error ? error.message : 'Error al actualizar configuración';
    return { success: false, error: message };
  }
}
