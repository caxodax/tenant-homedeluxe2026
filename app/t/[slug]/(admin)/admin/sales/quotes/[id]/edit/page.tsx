import { notFound, redirect } from 'next/navigation';
import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { QuoteBuilder } from '../../new/quote-builder';

export const dynamic = 'force-dynamic';

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'orders');

  const { quote, items, products, reps, repProfile, generalSettings } = await withTenantDb(
    tenant.db_schema_name,
    null,
    async (client) => {
      // 1. Obtener la cotización actual
      const qRes = await client.query(`
        SELECT * FROM ${tenant.db_schema_name}.sales_quotes WHERE id = $1
      `, [id]);

      if (qRes.rows.length === 0) return { quote: null, items: [], products: [], reps: [], repProfile: null, generalSettings: null };

      // 2. Obtener los renglones
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

      // 3. Catálogo de productos disponibles
      const prodRes = await client.query(`
        SELECT id, name, sku, price_primary, current_stock, image_url, track_inventory
        FROM ${tenant.db_schema_name}.products
        WHERE is_active = true AND deleted_at IS NULL
        ORDER BY name ASC
      `);

      // 4. Vendedores
      const repsRes = await client.query(`
        SELECT id, full_name, email, role FROM ${tenant.db_schema_name}.staff_profiles
        WHERE role = 'SALES_REP' OR role IN ('OWNER', 'MANAGER')
        ORDER BY full_name ASC
      `);

      // 5. Perfil si es SALES_REP
      let profile = null;
      if (staff.role === 'SALES_REP') {
        const profRes = await client.query(`
          SELECT * FROM ${tenant.db_schema_name}.sales_rep_profiles WHERE staff_id = $1
        `, [staff.id]);
        profile = profRes.rows[0] || null;
      }

      // 6. Settings
      const setRes = await client.query(`
        SELECT primary_currency, secondary_currency, exchange_rate 
        FROM ${tenant.db_schema_name}.settings 
        WHERE key = 'general' LIMIT 1
      `);

      return {
        quote: qRes.rows[0],
        items: itemsRes.rows,
        products: prodRes.rows,
        reps: repsRes.rows,
        repProfile: profile,
        generalSettings: setRes.rows[0] || null,
      };
    }
  );

  if (!quote) {
    notFound();
  }

  // Solo se puede editar si está en DRAFT o SENT
  if (quote.status !== 'DRAFT' && quote.status !== 'SENT') {
    redirect(`/t/${slug}/admin/sales/quotes/${id}`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <QuoteBuilder
        slug={slug}
        currentUser={staff}
        repProfile={repProfile}
        salesReps={reps}
        products={products}
        primaryCurrency={generalSettings?.primary_currency || 'USD'}
        secondaryCurrency={generalSettings?.secondary_currency || 'BS'}
        exchangeRate={parseFloat(generalSettings?.exchange_rate || '1.0000')}
        initialQuote={quote}
        initialItems={items}
      />
    </div>
  );
}
