import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');

    const categories = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `SELECT id, name, slug 
         FROM categories 
         ORDER BY name ASC`
      );
      return res.rows;
    });

    return NextResponse.json({ categories });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Error interno' },
      { status: 500 }
    );
  }
}
