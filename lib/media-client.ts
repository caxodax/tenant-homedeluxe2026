const SKIP_TRANSCODE = new Set(['image/svg+xml', 'image/gif']);

/** Resize (fit inside maxDim) and convert raster images to WebP via native Canvas. */
export async function toWebpFile(file: File, maxDim = 900, quality = 0.82): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/') || SKIP_TRANSCODE.has(file.type)) {
    return file;
  }
  if (file.type === 'image/webp' && file.size <= 150_000) {
    return file;
  }

  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const width = Math.max(1, Math.round(bmp.width * scale));
    const height = Math.max(1, Math.round(bmp.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return file;
    }

    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
  } catch {
    return file;
  }
}

/** Optimize image to WebP when beneficial and upload via /api/media/upload. */
export async function uploadTenantMedia(
  rawFile: File,
  tenantSlug: string,
  folder: string,
  maxDim = 900
): Promise<{ url: string; filename?: string }> {
  const file = await toWebpFile(rawFile, maxDim);
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  formData.append('tenantSlug', tenantSlug);

  const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Error al subir la imagen');
  }
  return { url: data.url as string, filename: data.filename as string | undefined };
}
