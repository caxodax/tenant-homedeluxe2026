import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { getCachedTenantShell } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const shell = await getCachedTenantShell(slug);

    if (!shell || shell.tenant.storefront_enabled === false) {
      return NextResponse.json({ error: 'Vitrina no disponible' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(6, parseInt(searchParams.get('limit') || '24', 10)));
    const offset = (page - 1) * limit;
    const categoryName = searchParams.get('category');
    const query = searchParams.get('q')?.trim().toLowerCase() || '';

    const schema = shell.tenant.db_schema_name;

    const data = await withTenantDb(schema, null, async (client) => {
      const conditions: string[] = ['p.is_active = true', 'p.deleted_at IS NULL'];
      const values: unknown[] = [];
      let idx = 1;

      if (categoryName && categoryName !== 'all') {
        conditions.push(`c.name = $${idx}`);
        values.push(categoryName);
        idx++;
      }

      if (query) {
        conditions.push(`(p.name ILIKE $${idx} OR p.sku ILIKE $${idx} OR p.barcode ILIKE $${idx})`);
        values.push(`%${query}%`);
        idx++;
      }

      const whereClause = conditions.join(' AND ');

      // Total de productos que cumplen el filtro
      const countRes = await client.query(
        `SELECT COUNT(*)::int as total
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE ${whereClause}`,
        values
      );
      const totalCount = countRes.rows[0]?.total || 0;

      // Consulta paginada con orden determinista
      values.push(limit);
      const limitIdx = idx++;
      values.push(offset);
      const offsetIdx = idx++;

      // Verificar plugins activos del tenant
      const pluginsRes = await client.query(
        `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
        [shell.tenant.id]
      );
      const activePlugins = pluginsRes.rows.map((r: { plugin_id: string }) => r.plugin_id);
      const isFoodService = activePlugins.includes('food_service');

      const modifierGroupsSql = isFoodService
        ? `, COALESCE(
             (SELECT jsonb_agg(jsonb_build_object(
               'group_id', mg.id,
               'group_name', mg.name,
               'min_select', mg.min_select,
               'max_select', mg.max_select,
               'required', mg.required,
               'options', (
                 SELECT jsonb_agg(jsonb_build_object(
                   'product_id', opt.id,
                   'name', opt.name,
                   'price_primary', opt.price_primary
                 ))
                 FROM fs_group_modifiers gm
                 JOIN products opt ON opt.id = gm.product_id
                 WHERE gm.group_id = mg.id AND opt.is_active = true
               )
             ))
             FROM fs_product_groups pg
             JOIN fs_modifier_groups mg ON mg.id = pg.group_id
             WHERE pg.product_id = p.id AND mg.is_active = true),
             '[]'::jsonb
           ) as modifier_groups`
        : `, '[]'::jsonb as modifier_groups`;

      const productsRes = await client.query(
        `SELECT p.id, p.name, p.slug, p.description, p.barcode, p.sku,
                COALESCE(p.price_primary, 0) AS price_usd,
                p.current_stock, p.min_stock_alert, p.image_url, p.is_tax_exempt,
                c.name AS category_name,
                COALESCE(
                  (SELECT jsonb_agg(jsonb_build_object(
                    'id', pv.id,
                    'name', pv.name,
                    'sku', pv.sku,
                    'attributes', pv.attributes,
                    'price_adjustment_primary', pv.price_adjustment_primary
                  )) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true),
                  '[]'::jsonb
                ) as variants
                ${modifierGroupsSql}
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE ${whereClause}
         ORDER BY p.name ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values
      );

      return {
        products: productsRes.rows,
        totalCount,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching storefront products:', error);
    return NextResponse.json({ error: 'Error al consultar productos' }, { status: 500 });
  }
}
