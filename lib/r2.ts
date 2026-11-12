import { S3Client } from '@aws-sdk/client-s3';

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'marketos-media';

let cachedClient: S3Client | null | undefined;

/**
 * Reutiliza una única instancia de S3Client por proceso/contenedor cálido
 * para evitar la instanciación repetitiva de SDK AWS en cada imagen o carga.
 */
export function getR2Client(): S3Client | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    cachedClient = null;
    return null;
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedClient;
}
