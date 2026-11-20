import { NextRequest, NextResponse } from 'next/server';
import { getCachedTenantShell } from '@/lib/tenant';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
  'CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
};

async function getLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    // 1. URL externa absoluta
    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    }

    // 2. Ruta interna /api/media/
    const cleanKey = logoUrl.startsWith('/api/media/')
      ? logoUrl.replace(/^\/api\/media\//, '')
      : logoUrl.replace(/^\//, '');

    const candidateKeys = [cleanKey];
    if (cleanKey.endsWith('.jpg')) {
      candidateKeys.push(cleanKey.replace(/\.jpg$/, '.webp'), cleanKey.replace(/\.jpg$/, '.png'));
    } else if (cleanKey.endsWith('.webp')) {
      candidateKeys.push(cleanKey.replace(/\.webp$/, '.png'), cleanKey.replace(/\.webp$/, '.jpg'));
    }

    // A. Búsqueda en Filesystem local
    const fallbackDirs = [
      path.resolve(process.cwd(), 'public/media'),
      path.resolve(process.cwd(), 'public'),
      '/home/lmontes/Documentos/Telegram/Market/apps/web/public/media',
    ];

    for (const dir of fallbackDirs) {
      for (const k of candidateKeys) {
        const filePath = path.resolve(dir, k);
        try {
          const stats = await fs.stat(/*turbopackIgnore: true*/ filePath);
          if (stats.isFile()) {
            return await fs.readFile(/*turbopackIgnore: true*/ filePath);
          }
        } catch {
          // Continuar
        }
      }
    }

    // B. Búsqueda en Cloudflare R2
    const s3 = getR2Client();
    if (s3) {
      for (const k of candidateKeys) {
        try {
          const command = new GetObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: k,
          });
          const response = await s3.send(command);
          if (response.Body) {
            const bytes = await response.Body.transformToByteArray();
            return Buffer.from(bytes);
          }
        } catch {
          // Continuar
        }
      }
    }
  } catch (err) {
    console.error('[TenantIconAPI] Error loading logo buffer:', err);
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);

    // Parámetros de generación
    const rawSize = parseInt(searchParams.get('size') || '192', 10);
    const size = isNaN(rawSize) ? 192 : Math.min(Math.max(rawSize, 16), 1024);
    const purpose = searchParams.get('purpose') || 'any'; // any | maskable | apple

    const shell = await getCachedTenantShell(slug);
    if (!shell) {
      return new NextResponse('Tenant Not Found', { status: 404 });
    }

    const logoUrl = shell.settings?.logo_url;
    let logoBuffer: Buffer | null = null;

    if (logoUrl) {
      logoBuffer = await getLogoBuffer(logoUrl);
    }

    // Fallback a icono genérico del sistema si el comercio no tiene logo
    if (!logoBuffer) {
      try {
        const defaultIconPath = path.resolve(process.cwd(), 'public/icons/icon-512.png');
        logoBuffer = await fs.readFile(defaultIconPath);
      } catch {
        // Fallback emergente en caso de no hallar el icono físico
        logoBuffer = null;
      }
    }

    // Generar canvas de fondo según propósito W3C / Apple
    let canvasBackground: { r: number; g: number; b: number; alpha: number } = {
      r: 0,
      g: 0,
      b: 0,
      alpha: 0,
    }; // Transparente por defecto para "any"

    let scaleFactor = 0.85; // Margen óptico estándar

    if (purpose === 'apple') {
      // iOS Apple Touch Icon no soporta transparencia (se vería negro en Safari)
      canvasBackground = { r: 255, g: 255, b: 255, alpha: 1 };
      scaleFactor = 0.8;
    } else if (purpose === 'maskable') {
      // Iconos maskable requieren safe-zone circular del 70%
      canvasBackground = { r: 255, g: 255, b: 255, alpha: 1 };
      scaleFactor = 0.68;
    }

    if (logoBuffer) {
      const innerSize = Math.max(12, Math.round(size * scaleFactor));
      const resizedLogo = await sharp(logoBuffer)
        .resize(innerSize, innerSize, {
          fit: 'inside',
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        })
        .toBuffer();

      const finalPng = await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: canvasBackground,
        },
      })
        .composite([{ input: resizedLogo, gravity: 'center' }])
        .png({ quality: 95, compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();

      return new NextResponse(finalPng, {
        status: 200,
        headers: CACHE_HEADERS,
      });
    }

    // Si no hubo ningún buffer, crear un monograma con la inicial del comercio
    const initial = (shell.settings?.business_name || shell.tenant.name || 'M')[0].toUpperCase();
    const svgBadge = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#18181b"/>
        <text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="${Math.round(size * 0.45)}" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${initial}</text>
      </svg>
    `;

    const generatedPng = await sharp(Buffer.from(svgBadge))
      .png()
      .toBuffer();

    return new NextResponse(generatedPng, {
      status: 200,
      headers: CACHE_HEADERS,
    });
  } catch (error) {
    console.error('[TenantIconAPI] Fatal generation error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
