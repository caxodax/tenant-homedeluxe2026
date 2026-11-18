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
      const pRes = await client.query(`
        SELECT 
          p.id, 
          p.name, 
          p.sku, 
          p.barcode,
          p.price_primary, 
          p.price_primary as price_usd, 
          p.current_stock, 
          p.min_stock_alert, 
          p.category_id,
          c.name as category_name,
          p.image_url,
          p.is_tax_exempt
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true AND p.deleted_at IS NULL
        ORDER BY p.name ASC
      `);

      const sRes = await client.query(`
        SELECT business_name, logo_url, primary_color, secondary_color, accent_color,
               primary_currency, exchange_rate, secondary_currency, value
        FROM settings
        WHERE key = 'general'
        LIMIT 1
      `);

      const storeRes = await client.query(`
        SELECT id
        FROM stores
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      `);

      const pmRows = await fetchTenantPaymentMethods(client, {
        activePlugins,
        onlyActive: true,
        channel: 'pos',
      });

      const catRes = await client.query(`
        SELECT id, name
        FROM categories
        WHERE is_active = true AND deleted_at IS NULL
        ORDER BY name ASC
      `);

      let deliveryZones: Array<{
        id: string;
        name: string;
        description: string | null;
        rate_primary: number;
        estimated_time: string;
      }> = [];

      let fsTables: Array<{
        id: string;
        label: string;
        status: string;
        seats: number;
      }> = [];
      let daily86Ids: string[] = [];

      if (activePlugins.includes('delivery_fleet')) {
        const dzRes = await client.query(`
          SELECT id, name, description, rate_primary, estimated_time
          FROM df_zones
          WHERE is_active = true
          ORDER BY sort_order ASC, name ASC
        `);
        deliveryZones = dzRes.rows;
      }

      if (activePlugins.includes('food_service')) {
        const [tablesRes, d86Res] = await Promise.all([
          client.query(`
            SELECT id, label, status, seats
            FROM fs_tables
            WHERE is_active = true
            ORDER BY label ASC
          `),
          client.query(`
            SELECT product_id
            FROM fs_daily_86
            WHERE service_date = CURRENT_DATE AND is_86 = true
          `),
        ]);
        fsTables = tablesRes.rows;
        daily86Ids = d86Res.rows.map((r: { product_id: string }) => r.product_id);
      }

      return {
        products: pRes.rows,
        settings: sRes.rows[0] ?? null,
        store_id: storeRes.rows[0]?.id || null,
        payment_methods: pmRows,
        categories: catRes.rows,
        delivery_zones: deliveryZones,
        is_delivery_active: activePlugins.includes('delivery_fleet'),
        is_food_service_active: activePlugins.includes('food_service'),
        food_service_tables: fsTables,
        daily_86_ids: daily86Ids,
      };
    });

    return NextResponse.json({
      products: data.products,
      categories: data.categories,
      payment_methods: data.payment_methods,
      delivery_zones: data.delivery_zones,
      is_delivery_active: data.is_delivery_active,
      is_food_service_active: data.is_food_service_active,
      food_service_tables: data.food_service_tables,
      daily_86_ids: data.daily_86_ids,
      store_id: data.store_id,
      business_name: data.settings?.business_name || name || 'Comercio',
      logo_url: data.settings?.logo_url || null,
      primary_color: data.settings?.primary_color || null,
      secondary_color: data.settings?.secondary_color || null,
      accent_color: data.settings?.accent_color || null,
      currency: data.settings?.primary_currency || 'USD',
      exchange_rate: data.settings?.exchange_rate ? Number(data.settings.exchange_rate) : null,
      secondary_currency: data.settings?.secondary_currency || 'VES',
      tax_settings: data.settings?.value?.taxes || {
        tax_enabled: true,
        tax_rate: 16.0,
        prices_include_tax: false,
      },
      discount_settings: data.settings?.value?.discounts || {
        allow_stacked: false,
        presets: [],
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching POS products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch products for POS' },
      { status: 500 }
    );
  }
}
