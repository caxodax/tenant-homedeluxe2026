import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');
    const summaryOnly = request.nextUrl.searchParams.get('summary') === '1';

    if (summaryOnly) {
      const pendingCount = await withTenantDb(tenant.db_schema_name, null, async (client) => {
        const res = await client.query(`
          SELECT COUNT(*)::int AS pending_count
          FROM orders o
          LEFT JOIN LATERAL (
            SELECT status
            FROM payments
            WHERE order_id = o.id
            ORDER BY created_at DESC
            LIMIT 1
          ) p ON true
          WHERE o.status IN ('CREATED', 'PENDING_PAYMENT_VERIFICATION')
             OR (p.status = 'PENDING' AND o.status <> 'CANCELLED')
        `);
        return Number(res.rows[0]?.pending_count || 0);
      });

      return NextResponse.json(
        { pendingCount },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const orders = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT
          o.id,
          o.order_number,
          o.customer_name,
          o.customer_phone,
          o.status,
          o.delivery_type,
          o.total_usd,
          o.is_offline_sale,
          o.offline_ticket_ref,
          o.created_at,
          o.updated_at,
          p.method AS payment_method,
          p.status AS payment_status,
          p.reference_number AS payment_reference,
          p.proof_image_url AS payment_proof_url,
          (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS items_count
        FROM orders o
        LEFT JOIN LATERAL (
          SELECT method, status, reference_number, proof_image_url
          FROM payments
          WHERE order_id = o.id
          ORDER BY created_at DESC
          LIMIT 1
        ) p ON true
        ORDER BY o.created_at DESC
        LIMIT 100
      `);
      return res.rows;
    });

    const pendingCount = orders.filter(
      (o) =>
        o.status === 'CREATED' ||
        o.status === 'PENDING_PAYMENT_VERIFICATION' ||
        (o.payment_status === 'PENDING' && o.status !== 'CANCELLED')
    ).length;

    return NextResponse.json(
      { orders, pendingCount },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error listing orders:', error);
    return NextResponse.json({ error: 'Error al listar pedidos' }, { status: 500 });
  }
}
