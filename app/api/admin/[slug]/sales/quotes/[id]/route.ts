import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'orders');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const qRes = await client.query(`
        SELECT 
          q.*,
          sp.full_name AS sales_rep_name,
          o.order_number AS converted_order_number
        FROM ${tenant.db_schema_name}.sales_quotes q
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = q.sales_rep_id
        LEFT JOIN ${tenant.db_schema_name}.orders o ON o.id = q.converted_order_id
        WHERE q.id = $1
      `, [id]);

      if (qRes.rows.length === 0) {
        return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
      }

      const quote = qRes.rows[0];

      const itemsRes = await client.query(`
        SELECT 
          i.*,
          p.sku,
          p.image_url
        FROM ${tenant.db_schema_name}.sales_quote_items i
        LEFT JOIN ${tenant.db_schema_name}.products p ON p.id = i.product_id
        WHERE i.quote_id = $1
        ORDER BY i.sort_order ASC
      `, [id]);

      return NextResponse.json({
        quote,
        items: itemsRes.rows,
      });
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching quote:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al obtener la cotización' },
      { status: 500 }
    );
  }
}
