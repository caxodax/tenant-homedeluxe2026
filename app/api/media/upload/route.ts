import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/r2";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

export const dynamic = "force-dynamic";

const ALLOWED_FOLDERS = new Set([
  "products",
  "categories",
  "logos",
  "banners",
  "proofs",
  "payment-proofs",
  "branding",
  "general",
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawFolder = ((formData.get("folder") as string) || "products").trim().toLowerCase();
    const normalizedFolder = rawFolder === "payment-proofs" ? "proofs" : rawFolder;
    const folder = ALLOWED_FOLDERS.has(normalizedFolder) ? normalizedFolder : "general";
    const rawTenantSlug =
      (formData.get("tenantSlug") as string) || (formData.get("tenantId") as string) || "";
    const tenantSlug = rawTenantSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "");

    if (!tenantSlug) {
      return NextResponse.json(
        { error: "tenantSlug es requerido para aislar el almacenamiento multimedia" },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const rawBuffer = Buffer.from(bytes);

    // Normalizar nombre base
    const sanitizedName = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
    let finalBuffer: Buffer = rawBuffer;
    let finalContentType = file.type || "application/octet-stream";
    let filename = `${Date.now()}-${sanitizedName}`;

    // OPTIMIZACIÓN PONITAIL ULTRA: Transcodificar y comprimir a WebP de alta eficiencia
    if (file.type?.startsWith("image/") && !file.type.includes("svg") && !file.type.includes("gif")) {
      try {
        const isProof = folder === "proofs";
        const maxDimension = isProof ? 1280 : 1600;
        const quality = isProof ? 80 : 85;

        finalBuffer = await sharp(rawBuffer)
          .rotate() // Respeta orientación EXIF de fotos móviles
          .resize({
            width: maxDimension,
            height: maxDimension,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality })
          .toBuffer();

        finalContentType = "image/webp";
        const baseName = sanitizedName.replace(/\.[^.]+$/, "");
        filename = `${Date.now()}-${baseName}.webp`;
      } catch (sharpError) {
        console.warn("Compresión sharp omitida, usando original:", sharpError);
      }
    }

    const storageKey = `${tenantSlug}/${folder}/${filename}`;
    const relativeUrl = `/api/media/${storageKey}`;

    // 1. Subir a Cloudflare R2 con tamaño optimizado
    const s3 = getR2Client();
    let uploadedToR2 = false;

    if (s3) {
      try {
        const command = new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: storageKey,
          Body: finalBuffer,
          ContentType: finalContentType,
          CacheControl: "public, max-age=31536000, immutable",
        });

        await s3.send(command);
        uploadedToR2 = true;
      } catch (r2Error) {
        console.error("Error subiendo a Cloudflare R2, usando fallback local:", r2Error);
      }
    }

    // 2. Fallback de persistencia local
    try {
      const localDir = path.resolve(process.cwd(), "public/media", tenantSlug, folder);
      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(path.join(localDir, filename), finalBuffer);
    } catch (localError) {
      console.warn("Advertencia guardando copia local:", localError);
    }

    return NextResponse.json({
      success: true,
      url: relativeUrl,
      filename,
      size_bytes: finalBuffer.length,
      optimized: finalBuffer.length < rawBuffer.length,
      original_bytes: rawBuffer.length,
      storage: uploadedToR2 ? "cloudflare_r2" : "local_filesystem",
    });
  } catch (error: any) {
    console.error("Error en /api/media/upload:", error);
    return NextResponse.json(
      { error: error.message || "Error procesando el archivo multimedia" },
      { status: 500 }
    );
  }
}
