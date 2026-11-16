import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleResolveZone(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleResolveZone(request, params);
}

async function handleResolveZone(
  request: NextRequest,
  paramsPromise: Promise<{ slug: string }>
) {
  try {
    const { slug } = await paramsPromise;
    let lat: number | null = null;
    let lng: number | null = null;

    if (request.method === 'POST') {
      try {
        const body = await request.json();
        lat = body.lat !== undefined ? Number(body.lat) : (body.latitude !== undefined ? Number(body.latitude) : null);
        lng = body.lng !== undefined ? Number(body.lng) : (body.longitude !== undefined ? Number(body.longitude) : null);
      } catch {
        // Fallback to URL search params if body parsing fails
      }
    }

    if (lat === null || lng === null) {
      const url = new URL(request.url);
      const latParam = url.searchParams.get('lat') || url.searchParams.get('latitude');
      const lngParam = url.searchParams.get('lng') || url.searchParams.get('longitude');
      if (latParam && lngParam) {
        lat = parseFloat(latParam);
        lng = parseFloat(lngParam);
      }
    }

    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Coordenadas inválidas. Se requieren latitud y longitud numéricas.' },
        { status: 400 }
      );
    }

    const tenantRes = await pool.query(
      `SELECT db_schema_name FROM platform.tenants WHERE slug = $1`,
      [slug.toLowerCase().trim()]
    );

    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 });
    }

    const schema = tenantRes.rows[0].db_schema_name;

    // Llamada a la RPC nativa en PostgreSQL (Haversine < 2ms)
    const rpcRes = await pool.query(
      `SELECT platform.rpc_df_resolve_zone($1, $2, $3) AS zone`,
      [schema, lat, lng]
    );

    const zone = rpcRes.rows[0]?.zone || null;

    return NextResponse.json({
      success: true,
      found: zone !== null,
      zone,
      coordinates: { lat, lng },
    });
  } catch (error) {
    console.error('Error resolving delivery zone:', error);
    return NextResponse.json({ error: 'Error al resolver zona de delivery' }, { status: 500 });
  }
}
