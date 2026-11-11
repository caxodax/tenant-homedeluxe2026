import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, R2_BUCKET_NAME } from "@/lib/r2";
import fs from "fs/promises";
import path from "path";

const IMMUTABLE_CDN_HEADERS = {
  "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
  "CDN-Cache-Control": "public, max-age=31536000, immutable",
  "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
};

function getContentType(key: string, reportedType?: string): string {
  if (reportedType && reportedType !== "application/octet-stream") {
    return reportedType;
  }
  const lower = key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathSegments = resolvedParams.path;

  if (!pathSegments || pathSegments.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const rawKey = pathSegments.join("/");
  const candidateKeys = [rawKey];

  if (rawKey.endsWith(".jpg")) {
    candidateKeys.push(rawKey.replace(/\.jpg$/, ".webp"), rawKey.replace(/\.jpg$/, ".png"));
  } else if (rawKey.endsWith(".webp")) {
    candidateKeys.push(rawKey.replace(/\.webp$/, ".jpg"), rawKey.replace(/\.webp$/, ".png"));
  }

  // 1. Primary Source: Cloudflare R2
  const s3 = getR2Client();
  if (s3) {
    for (const key of candidateKeys) {
      try {
        const command = new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        });

        const response = await s3.send(command);

        if (response.ETag && request.headers.get("if-none-match") === response.ETag) {
          void response.Body?.transformToWebStream().cancel().catch(() => {});
          return new NextResponse(null, {
            status: 304,
            headers: {
              ...IMMUTABLE_CDN_HEADERS,
              ETag: response.ETag,
            },
          });
        }

        if (response.Body) {
          const contentType = getContentType(key, response.ContentType);
          const stream = response.Body.transformToWebStream();

          return new NextResponse(stream, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              ...IMMUTABLE_CDN_HEADERS,
              ...(response.ETag ? { ETag: response.ETag } : {}),
            },
          });
        }
      } catch {
        // Continue to try next candidate
      }
    }
  }

  // 2. Local filesystem fallback
  const fallbackDirs = [
    path.resolve(process.cwd(), "public/media"),
    "/home/lmontes/Documentos/Telegram/Market/apps/web/public/media",
  ];

  for (const dir of fallbackDirs) {
    for (const key of candidateKeys) {
      const resolvedFilePath = path.resolve(dir, key);
      try {
        const stats = await fs.stat(/*turbopackIgnore: true*/ resolvedFilePath);
        if (stats.isFile()) {
          const fileBuffer = await fs.readFile(/*turbopackIgnore: true*/ resolvedFilePath);
          const contentType = getContentType(key);
          return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
            },
          });
        }
      } catch {
        // Continue
      }
    }
  }

  return new NextResponse("Image Not Found", { status: 404 });
}
