import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; catId: string }> }
) {
  try {
    const { slug, catId } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const body = await request.json();

    const updated = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const existingRes = await client.query('SELECT id, slug, name FROM categories WHERE id = $1', [catId]);
      if (existingRes.rows.length === 0) {
        return null;
      }
      const existing = existingRes.rows[0];

      let newName = existing.name;
      let newSlug = existing.slug;
      if (body.name && body.name.trim() !== '') {
        newName = body.name.trim();
        if (newName !== existing.name) {
          const baseSlug = slugify(newName) || 'categoria';
          let finalSlug = baseSlug;
          let counter = 1;
          while (true) {
            const check = await client.query(
              'SELECT id FROM categories WHERE slug = $1 AND id != $2 LIMIT 1',
              [finalSlug, catId]
            );
            if (check.rows.length === 0) break;
            finalSlug = `${baseSlug}-${counter}`;
            counter++;
          }
          newSlug = finalSlug;
        }
      }

      const sets: string[] = ['name = $2', 'slug = $3', 'updated_at = now()'];
      const vals: unknown[] = [catId, newName, newSlug];

      if (body.sort_order !== undefined) {
        vals.push(Number(body.sort_order));
        sets.push(`sort_order = $${vals.length}`);
      }
      if (body.is_active !== undefined) {
        vals.push(Boolean(body.is_active));
        sets.push(`is_active = $${vals.length}`);
      }
      if (body.image_url !== undefined) {
        vals.push(body.image_url);
        sets.push(`image_url = $${vals.length}`);
      }

      const query = `
        UPDATE categories 
        SET ${sets.join(', ')} 
        WHERE id = $1 
        RETURNING id, name, slug, sort_order, image_url, is_active, updated_at
      `;
      const res = await client.query(query, vals);
      return res.rows[0];
    });

    if (!updated) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ category: updated });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating category:', error);
    return NextResponse.json({ error: 'Error al actualizar categoría' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; catId: string }> }
) {
  try {
    const { slug, catId } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');

    const result = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // Soft-delete: se marca is_active = false para preservar integridad referencial de pedidos/productos
      const res = await client.query(
        `UPDATE categories SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id, name`,
        [catId]
      );
      return res.rows[0];
    });

    if (!result) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedCategory: result });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting category:', error);
    return NextResponse.json({ error: 'Error al eliminar categoría' }, { status: 500 });
  }
}
