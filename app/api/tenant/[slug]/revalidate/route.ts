import { NextRequest, NextResponse } from 'next/server';
import { invalidateTenantCache } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    invalidateTenantCache(slug, 'all', 'immediate');
    return NextResponse.json({ success: true, message: `Cache invalidada para ${slug}` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error invalidando cache' }, { status: 500 });
  }
}
