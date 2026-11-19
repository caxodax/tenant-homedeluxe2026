import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { QuoteBuilder } from './quote-builder';

export const dynamic = 'force-dynamic';

export default async function NewQuotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, staff } = await requireTenantStaff(slug, 'orders');

  const { products, reps, repProfile, generalSettings } = await withTenantDb(
    tenant.db_schema_name,
    null,
    async (client) => {
      // Catálogo de productos disponibles
      const prodRes = await client.query(`
        SELECT id, name, sku, price_primary, current_stock, image_url, track_inventory
        FROM ${tenant.db_schema_name}.products
        WHERE is_active = true AND deleted_at IS NULL
        ORDER BY name ASC
      `);

      // Vendedores
      const repsRes = await client.query(`
        SELECT id, full_name, email, role FROM ${tenant.db_schema_name}.staff_profiles
        WHERE role = 'SALES_REP' OR role IN ('OWNER', 'MANAGER')
        ORDER BY full_name ASC
      `);

      // Perfil del usuario actual si es SALES_REP
      let profile = null;
      if (staff.role === 'SALES_REP') {
        const profRes = await client.query(`
          SELECT * FROM ${tenant.db_schema_name}.sales_rep_profiles WHERE staff_id = $1
        `, [staff.id]);
        profile = profRes.rows[0] || null;
      }

      // Settings
      const setRes = await client.query(`
        SELECT primary_currency, secondary_currency, exchange_rate 
        FROM ${tenant.db_schema_name}.settings 
        WHERE key = 'general' LIMIT 1
      `);

      return {
        products: prodRes.rows,
        reps: repsRes.rows,
        repProfile: profile,
        generalSettings: setRes.rows[0] || null,
      };
    }
  );

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
      />
    </div>
  );
}
