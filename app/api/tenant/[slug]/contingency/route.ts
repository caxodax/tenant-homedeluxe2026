import { NextRequest, NextResponse } from 'next/server';
import { getCachedTenantShell } from '@/lib/tenant';

const CONTINGENCY_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
  'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const shell = await getCachedTenantShell(slug);

    if (!shell) {
      return NextResponse.json({ inContingency: false }, { headers: CONTINGENCY_CACHE_HEADERS });
    }

    return NextResponse.json(
      {
        inContingency: shell.inContingency,
        lastHeartbeatAt: shell.tenant.last_pos_heartbeat_at,
        mode: shell.tenant.contingency_offline_mode,
      },
      { headers: CONTINGENCY_CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Contingency check error:', error);
    return NextResponse.json({ inContingency: false });
  }
}
