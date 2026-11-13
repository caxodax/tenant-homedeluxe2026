import { requireTenantStaff } from '@/lib/auth/tenant-guard';
import { withTenantDb } from '@/lib/db';
import { CategoriesClientView, CategoryData } from './CategoriesClientView';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenant } = await requireTenantStaff(slug, 'inventory');

  const categories = await withTenantDb(tenant.db_schema_name, null, async (client) => {
    const res = await client.query(`
      SELECT c.id, c.name, c.slug, c.sort_order, c.is_active, c.created_at,
             COUNT(p.id)::int as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `);
    return res.rows.map((r) => ({
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    })) as CategoryData[];
  });

  return <CategoriesClientView slug={slug} initialCategories={categories} />;
}
