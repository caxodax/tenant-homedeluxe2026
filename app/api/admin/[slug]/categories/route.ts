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
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes/acentos
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    const categories = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      let query = `
        SELECT c.id, c.name, c.slug, c.image_url, c.sort_order, c.is_active, c.created_at,
               COUNT(p.id)::int as product_count
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
      `;
      const values: unknown[] = [];

      if (activeOnly) {
        query += ` WHERE c.is_active = true `;
      }

      query += `
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.name ASC
      `;

      const res = await client.query(query, values);
      return res.rows;
    });

    return NextResponse.json({ categories });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Error interno al consultar categorías' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'inventory');
    const body = await request.json();
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json(
        { error: 'El nombre de la categoría es requerido' },
        { status: 400 }
      );
    }

    const baseSlug = slugify(name) || 'categoria';
    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;
    const imageUrl = body.image_url || null;

    const newCategory = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // Garantizar slug único
      let finalSlug = baseSlug;
      let counter = 1;
      while (true) {
        const check = await client.query(
          'SELECT id FROM categories WHERE slug = $1 LIMIT 1',
          [finalSlug]
        );
        if (check.rows.length === 0) break;
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      const res = await client.query(
        `INSERT INTO categories (name, slug, sort_order, image_url, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id, name, slug, sort_order, image_url, is_active, created_at`,
        [name, finalSlug, sortOrder, imageUrl]
      );
      return res.rows[0];
    });

    return NextResponse.json({ category: newCategory }, { status: 201 });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Error al registrar la categoría' },
      { status: 500 }
    );
  }
}
