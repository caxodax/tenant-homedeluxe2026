import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb, pool } from '@/lib/db';
import { fetchTenantPaymentMethods } from '@/lib/payment-methods';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const tenantRes = await pool.query(
      `SELECT id, db_schema_name, name, status FROM platform.tenants WHERE slug = $1`,
      [slug]
    );

    if (tenantRes.rowCount === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const { id: tenantId, db_schema_name, name } = tenantRes.rows[0];
    const pluginsRes = await pool.query(
      `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
      [tenantId]
    );
    const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);

    const data = await withTenantDb(db_schema_name, null, async (client) => {
      const [pRes, sRes, storeRes, pmRows] = await Promise.all([
        client.query(`
          SELECT 
            id, 
            name, 
            sku, 
            barcode,
            price_usd, 
            current_stock, 
            min_stock_alert, 
            category_id,
            image_url
          FROM products
          WHERE is_active = true
          ORDER BY name ASC
        `),
        client.query(`
          SELECT business_name, logo_url, primary_color, secondary_color, accent_color
          FROM settings
          WHERE key = 'general'
          LIMIT 1
        `),
        client.query(`
          SELECT id
          FROM stores
          WHERE is_active = true
          ORDER BY created_at ASC
          LIMIT 1
        `),
        fetchTenantPaymentMethods(client, {
          activePlugins,
          onlyActive: true,
          channel: 'pos',
        }),
      ]);

      return {
        products: pRes.rows,
        settings: sRes.rows[0] ?? null,
        store_id: storeRes.rows[0]?.id || null,
        payment_methods: pmRows,
      };
    });

    return NextResponse.json({
      products: data.products,
      payment_methods: data.payment_methods,
      store_id: data.store_id,
      business_name: data.settings?.business_name || name || 'Comercio',
      logo_url: data.settings?.logo_url || null,
      primary_color: data.settings?.primary_color || null,
      secondary_color: data.settings?.secondary_color || null,
      accent_color: data.settings?.accent_color || null,
      currency: 'USD'
    });
  } catch (error: unknown) {
    console.error('Error fetching POS products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products for POS' },
      { status: 500 }
    );
  }
}
