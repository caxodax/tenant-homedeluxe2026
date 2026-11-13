import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/r2";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const ALLOWED_FOLDERS = new Set([
  "products",
  "categories",
  "logos",
  "banners",
  "proofs",
  "branding",
  "general",
]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawFolder = ((formData.get("folder") as string) || "products").trim().toLowerCase();
    const folder = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : "general";
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
    const buffer = Buffer.from(bytes);

    // Normalizar nombre de archivo
    const sanitizedName = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
    const filename = `${Date.now()}-${sanitizedName}`;
    const storageKey = `${tenantSlug}/${folder}/${filename}`;
    const relativeUrl = `/api/media/${storageKey}`;

    // 1. Intentar subir a Cloudflare R2
    const s3 = getR2Client();
    let uploadedToR2 = false;

    if (s3) {
      try {
        const command = new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: storageKey,
          Body: buffer,
          ContentType: file.type || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        });

        await s3.send(command);
        uploadedToR2 = true;
      } catch (r2Error) {
        console.error("Error subiendo a Cloudflare R2, usando fallback local:", r2Error);
      }
    }

    // 2. Fallback de persistencia local si no se pudo subir a R2 o para caché de desarrollo
    try {
      const localDir = path.resolve(process.cwd(), "public/media", tenantSlug, folder);
      await fs.mkdir(localDir, { recursive: true });
      await fs.writeFile(path.join(localDir, filename), buffer);
    } catch (localError) {
      console.warn("Advertencia guardando copia local:", localError);
    }

    return NextResponse.json({
      success: true,
      url: relativeUrl,
      filename,
      storage: uploadedToR2 ? "cloudflare_r2" : "local_storage",
    });
  } catch (error: unknown) {
    console.error("Error en upload de media:", error);
    const message = error instanceof Error ? error.message : "Error al procesar la imagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
