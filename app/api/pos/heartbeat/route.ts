import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { invalidateTenantCache } from '@/lib/tenant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenant_slug, register_id } = body;
    
    if (!tenant_slug || !register_id) {
      return NextResponse.json(
        { error: 'tenant_slug and register_id are required' },
        { status: 400 }
      );
    }
    
    // Obtener tenant_id desde slug
    const tenantRes = await pool.query(
      `SELECT id FROM platform.tenants WHERE slug = $1 AND status IN ('active', 'trial')`,
      [tenant_slug]
    );
    
    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    
    const tenantId = tenantRes.rows[0].id;
    
    // Ejecutar RPC de heartbeat
    const result = await pool.query(
      `SELECT platform.rpc_record_pos_heartbeat($1)`,
      [tenantId]
    );

    invalidateTenantCache(tenant_slug, 'settings', 'swr');
    return NextResponse.json(result.rows[0].rpc_record_pos_heartbeat);
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
