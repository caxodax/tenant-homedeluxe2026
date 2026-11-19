import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  reason: z.string().trim().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');
    const json = await request.json();
    const { status, reason } = statusSchema.parse(json);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `SELECT platform.rpc_st_set_quote_status($1, $2, $3, $4, $5, $6) AS result`,
        [tenant.db_schema_name, id, status, staff.id, staff.role, reason || null]
      );
      return NextResponse.json(res.rows[0]?.result);
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: (err as z.ZodError).issues?.[0]?.message || 'Estado inválido' }, { status: 400 });
    }
    console.error('Error changing quote status:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al cambiar estado' },
      { status: 400 }
    );
  }
}
