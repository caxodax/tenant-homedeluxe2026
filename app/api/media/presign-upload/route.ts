import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@/lib/supabase/server';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const presignSchema = z.object({
  tenant_slug: z.string().min(3),
  filename: z.string().min(1).max(255),
  content_type: z.string().regex(/^image\/(jpeg|png|webp|gif|svg\+xml)$/),
  path: z.enum(['products', 'categories', 'logos', 'banners', 'proofs', 'branding']),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    // En producción se requiere usuario autenticado; en dev se permite testing fluido
    if (!user && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    const body = await request.json();
    const parsed = presignSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    
    const { tenant_slug, filename, content_type, path } = parsed.data;
    
    // Sanitizar filename
    const sanitized = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-');
    
    const key = `${tenant_slug}/${path}/${Date.now()}-${sanitized}`;
    
    const s3Client = getR2Client();
    if (!s3Client) {
      return NextResponse.json(
        { error: 'Almacenamiento R2 no configurado' },
        { status: 503 }
      );
    }

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: content_type,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900, // 15 minutos
    });
    
    const proxyUrl = `/api/media/${key}`;
    const publicUrl = process.env.R2_PUBLIC_DOMAIN 
      ? `https://${process.env.R2_PUBLIC_DOMAIN.replace(/^https?:\/\//, '')}/${key}`
      : proxyUrl;
    
    return NextResponse.json({
      presigned_url: presignedUrl,
      public_url: proxyUrl, // Siempre entregamos URL segura accesible vía proxy streaming
      cdn_url: publicUrl,
      key,
    });
  } catch (error) {
    console.error('Presign error:', error);
    return NextResponse.json(
      { error: 'Error al generar URL de carga' },
      { status: 500 }
    );
  }
}
