import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();

    if (!q || q.length < 3) {
      return NextResponse.json(
        { error: 'Ingresa al menos 3 caracteres para buscar tu pedido' },
        { status: 400 }
      );
    }

    const tenantRes = await pool.query(
      `SELECT db_schema_name, name FROM platform.tenants WHERE slug = $1 AND status IN ('active', 'trial')`,
      [slug.toLowerCase().trim()]
    );

    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 });
    }

    const { db_schema_name } = tenantRes.rows[0];

    const cleanDigits = q.replace(/\D/g, '');
    const cleanUpper = q.toUpperCase();

    const orders = await withTenantDb(db_schema_name, null, async (client) => {
      const query = `
        SELECT o.id, o.order_number, o.customer_name, o.customer_phone,
               COALESCE(c.id_number, 'N/A') as customer_id_number,
               o.status, o.delivery_type, o.delivery_address,
               o.subtotal_primary, o.shipping_primary, o.total_primary, o.total_secondary,
               o.exchange_rate_applied, o.notes, o.created_at,
               (
                 SELECT json_agg(json_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'unit_price', oi.unit_price_primary, 'metadata', oi.metadata))
                 FROM order_items oi WHERE oi.order_id = o.id
               ) as items,
               (
                 SELECT json_build_object('status', py.status, 'method', py.method, 'reference', py.reference_number)
                 FROM payments py WHERE py.order_id = o.id ORDER BY py.created_at DESC LIMIT 1
               ) as payment
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE UPPER(o.order_number) = $1
           OR UPPER(o.order_number) LIKE $2
           OR (length($3) >= 6 AND REPLACE(COALESCE(c.id_number, ''), '-', '') LIKE '%' || $3 || '%')
           OR (length($3) >= 7 AND REPLACE(REPLACE(COALESCE(o.customer_phone, ''), ' ', ''), '-', '') LIKE '%' || $3 || '%')
           OR UPPER(COALESCE(o.notes, '')) LIKE '%' || $1 || '%'
        ORDER BY o.created_at DESC
        LIMIT 6
      `;

      const res = await client.query(query, [
        cleanUpper,
        `%${cleanUpper}%`,
        cleanDigits,
      ]);

      return res.rows;
    });

    return NextResponse.json({
      success: true,
      orders,
    });
  } catch (error: any) {
    console.error('Error tracking order:', error);
    return NextResponse.json({ error: 'Error al consultar órdenes' }, { status: 500 });
  }
}
