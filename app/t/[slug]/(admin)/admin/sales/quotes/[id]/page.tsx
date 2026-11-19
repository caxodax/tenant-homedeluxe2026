import { notFound } from 'next/navigation';
import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { QuoteDetailView } from './quote-detail-view';

export const dynamic = 'force-dynamic';

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'orders');

  const { quote, items, settings } = await withTenantDb(
    tenant.db_schema_name,
    null,
    async (client) => {
      const qRes = await client.query(`
        SELECT 
          q.*,
          sp.full_name AS sales_rep_name,
          sp.email AS sales_rep_email,
          sp.phone AS sales_rep_phone,
          o.order_number AS converted_order_number
        FROM ${tenant.db_schema_name}.sales_quotes q
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = q.sales_rep_id
        LEFT JOIN ${tenant.db_schema_name}.orders o ON o.id = q.converted_order_id
        WHERE q.id = $1
      `, [id]);

      if (qRes.rows.length === 0) return { quote: null, items: [], settings: null };

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

      const sRes = await client.query(`
        SELECT business_name, logo_url, phone, address, primary_currency, secondary_currency, exchange_rate 
        FROM ${tenant.db_schema_name}.settings 
        WHERE key = 'general' LIMIT 1
      `);

      return {
        quote: qRes.rows[0],
        items: itemsRes.rows,
        settings: sRes.rows[0] || null,
      };
    }
  );

  if (!quote) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <QuoteDetailView
        slug={slug}
        currentUser={staff}
        quote={quote}
        items={items}
        settings={settings}
      />
    </div>
  );
}
