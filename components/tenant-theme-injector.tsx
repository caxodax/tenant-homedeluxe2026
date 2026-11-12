import React from 'react';
import { TENANT_DEFAULTS } from '@/lib/tenant/defaults';

function parseHex(hex?: string | null): [number, number, number] | null {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16) || 0,
    parseInt(clean.substring(2, 4), 16) || 0,
    parseInt(clean.substring(4, 6), 16) || 0,
  ];
}

function getYiq(rgb: [number, number, number]): number {
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}

function pickContrast(bgHex: string, preferredHex?: string | null): string {
  const bgRgb = parseHex(bgHex) || [132, 204, 22];
  const bgYiq = getYiq(bgRgb);
  const prefRgb = parseHex(preferredHex);
  if (prefRgb) {
    const diff = Math.abs(bgYiq - getYiq(prefRgb));
    if (diff >= 110) return preferredHex!;
  }
  return bgYiq >= 140 ? '#09090b' : '#ffffff';
}

export interface TenantThemeInjectorProps {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
}

export function TenantThemeInjector({
  primaryColor,
  secondaryColor,
  accentColor,
}: TenantThemeInjectorProps) {
  const safePrimary = parseHex(primaryColor) ? primaryColor! : TENANT_DEFAULTS.PRIMARY_COLOR;
  const safeSecondary = parseHex(secondaryColor) ? secondaryColor! : TENANT_DEFAULTS.SECONDARY_COLOR;
  const safeAccent = parseHex(accentColor) ? accentColor! : TENANT_DEFAULTS.ACCENT_COLOR;

  const primaryContrast = pickContrast(safePrimary, safeAccent);
  const secondaryContrast = pickContrast(safeSecondary, safeAccent);

  const css = `
    :root {
      --tenant-primary: ${safePrimary};
      --tenant-contrast: ${primaryContrast};
      --tenant-secondary: ${safeSecondary};
      --tenant-secondary-contrast: ${secondaryContrast};
      --tenant-accent: ${safeAccent};
    }
    .tenant-secondary-surface {
      background-color: ${safeSecondary} !important;
      color: ${secondaryContrast} !important;
    }
    .tenant-secondary-muted {
      color: ${secondaryContrast}cc !important;
    }
    .tenant-secondary-badge {
      background-color: ${safeSecondary} !important;
      color: ${secondaryContrast} !important;
      border-color: ${safePrimary}66 !important;
    }
    .bg-lime-500:not(:disabled), .bg-lime-600:not(:disabled) {
      background-color: ${safePrimary} !important;
      color: ${primaryContrast} !important;
    }
    .bg-lime-500:not(:disabled):hover, .hover\\:bg-lime-600:not(:disabled):hover, .hover\\:bg-lime-500:not(:disabled):hover {
      filter: brightness(0.92) !important;
    }
    .text-lime-400, .text-lime-500, .text-lime-600, .text-lime-700, .text-lime-800, .dark\\:text-lime-400, .dark\\:text-lime-300 {
      color: ${safePrimary} !important;
    }
    .border-lime-500 {
      border-color: ${safePrimary} !important;
    }
    .border-lime-500\\/50, .hover\\:border-lime-500\\/50:hover, .hover\\:border-lime-500\\/60:hover, .dark\\:hover\\:border-lime-500\\/50:hover {
      border-color: ${safePrimary}88 !important;
    }
    .border-lime-500\\/40, .dark\\:hover\\:border-lime-500\\/40:hover {
      border-color: ${safePrimary}66 !important;
    }
    .border-lime-500\\/30 {
      border-color: ${safePrimary}4d !important;
    }
    .border-lime-500\\/20 {
      border-color: ${safePrimary}33 !important;
    }
    .bg-lime-500\\/10 {
      background-color: ${safePrimary}18 !important;
    }
    .bg-lime-500\\/15 {
      background-color: ${safePrimary}24 !important;
    }
    .bg-lime-500\\/20, .bg-lime-500\\/30, .dark\\:bg-lime-500\\/20, .from-lime-500\\/20 {
      background-color: ${safePrimary}30 !important;
    }
    .ring-lime-500, .ring-lime-500\\/30, .focus\\:ring-lime-500:focus, .focus\\:ring-lime-500\\/20:focus {
      --tw-ring-color: ${safePrimary} !important;
    }
    .focus\\:border-lime-500:focus {
      border-color: ${safePrimary} !important;
    }
    .group:hover .group-hover\\:bg-lime-500 {
      background-color: ${safePrimary} !important;
      color: ${primaryContrast} !important;
    }
    .group:hover .group-hover\\:text-lime-700, .group:hover .dark\\:group-hover\\:text-lime-400 {
      color: ${safePrimary} !important;
    }
  `;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
