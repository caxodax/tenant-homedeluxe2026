/**
 * Constantes globales configurables del Core Agnóstico de MarketOS.
 * Ningún nombre de comercio, teléfono ni moneda local debe hardcodearse en la capa de aplicación.
 */

export const TENANT_DEFAULTS = {
  // Paleta neutra agnóstica por defecto (Grafito / Onyx / Blanco)
  PRIMARY_COLOR: process.env.NEXT_PUBLIC_DEFAULT_PRIMARY_COLOR || '#18181B',
  SECONDARY_COLOR: process.env.NEXT_PUBLIC_DEFAULT_SECONDARY_COLOR || '#09090B',
  ACCENT_COLOR: process.env.NEXT_PUBLIC_DEFAULT_ACCENT_COLOR || '#FFFFFF',

  // Tipografía y moneda base canónica del Core
  FONT_FAMILY: 'Plus Jakarta Sans',
  BASE_CURRENCY: 'USD' as const,

  // Tenant por defecto opcional para manifest raíz y redirección desde "/"
  DEFAULT_TENANT_SLUG: (
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ||
    ''
  )
    .trim()
    .toLowerCase(),

  // Dominio y soporte configurables por entorno
  PLATFORM_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'marketos.app',
  SERVER_IPV4: process.env.NEXT_PUBLIC_SERVER_IPV4 || '',
  SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '',
  PLATFORM_ADMIN_EMAIL:
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || 'admin@marketos.app',
} as const;

export function validateCriticalEnvVars(): {
  valid: boolean;
  missingRequired: string[];
  missingRecommended: string[];
} {
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];

  if (!process.env.DATABASE_URL) missingRequired.push('DATABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingRequired.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missingRequired.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  if (!process.env.AUTH_SESSION_SECRET) missingRecommended.push('AUTH_SESSION_SECRET');
  if (!process.env.NEXT_PUBLIC_PLATFORM_DOMAIN) {
    missingRecommended.push('NEXT_PUBLIC_PLATFORM_DOMAIN');
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
  };
}
