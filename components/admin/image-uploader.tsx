'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { toWebpFile, uploadTenantMedia } from '@/lib/media-client';

interface ImageUploaderProps {
  tenantSlug: string;
  path: 'products' | 'categories' | 'logos' | 'banners' | 'branding';
  value?: string | null;
  onChange: (url: string) => void;
  aspectRatio?: 'square' | 'wide' | 'portrait';
  maxSize?: number; // en MB
}

export function ImageUploader({
  tenantSlug,
  path,
  value,
  onChange,
  aspectRatio = 'square',
  maxSize = 5,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const rawFile = acceptedFiles[0];
      if (!rawFile) return;

      if (rawFile.size > maxSize * 1024 * 1024) {
        toast.error(`La imagen es muy grande. Máximo ${maxSize}MB`);
        return;
      }

      setUploading(true);

      try {
        const maxDim = path === 'logos' || path === 'branding' ? 512 : 900;
        const file = await toWebpFile(rawFile, maxDim);

        // 1. Intentar presigned upload directo a Cloudflare R2
        let uploadedUrl = '';
        try {
          const presignRes = await fetch('/api/media/presign-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenant_slug: tenantSlug,
              filename: file.name,
              content_type: file.type || 'image/jpeg',
              path,
            }),
          });

          if (presignRes.ok) {
            const { presigned_url, public_url } = await presignRes.json();

            // Subida PUT directa al bucket R2
            const uploadRes = await fetch(presigned_url, {
              method: 'PUT',
              headers: { 'Content-Type': file.type || 'image/jpeg' },
              body: file,
            });

            if (uploadRes.ok) {
              uploadedUrl = public_url;
            }
          }
        } catch (r2DirectError) {
          console.warn('Presigned direct upload falló o CORS pendiente, usando streaming API:', r2DirectError);
        }

        // 2. Fallback de streaming si PUT directo falló por CORS en bucket
        if (!uploadedUrl) {
          const fallbackData = await uploadTenantMedia(file, tenantSlug, path, maxDim);
          uploadedUrl = fallbackData.url;
        }

        setPreview(uploadedUrl);
        onChange(uploadedUrl);
        toast.success('Imagen subida exitosamente a Cloudflare R2');
      } catch (error) {
        toast.error('Error al subir imagen');
        console.error('Error en ImageUploader:', error);
      } finally {
        setUploading(false);
      }
    },
    [tenantSlug, path, onChange, maxSize]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
      'image/svg+xml': ['.svg'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  const aspectClasses = {
    square: 'aspect-square',
    wide: 'aspect-video',
    portrait: 'aspect-[3/4]',
  };

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          'relative rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden flex items-center justify-center',
          'hover:border-lime-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800/50',
          isDragActive 
            ? 'border-lime-500 bg-lime-500/10' 
            : 'border-slate-300 dark:border-zinc-800 bg-slate-100/60 dark:bg-zinc-900/40',
          aspectClasses[aspectRatio]
        )}
      >
        <input {...getInputProps()} />

        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-contain p-2"
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-lime-400 animate-spin" />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
                onChange('');
              }}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-md transition cursor-pointer"
              title="Quitar imagen"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-500 dark:text-zinc-400">
            {uploading ? (
              <Loader2 className="w-8 h-8 text-lime-600 dark:text-lime-400 animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-slate-500 dark:text-zinc-400 shadow-xs">
                  <Upload className="w-6 h-6 text-lime-600 dark:text-lime-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    {isDragActive ? 'Suelta la imagen aquí' : 'Arrastra o haz clic para subir imagen'}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    JPG, PNG, WebP o SVG · Máximo {maxSize}MB
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
