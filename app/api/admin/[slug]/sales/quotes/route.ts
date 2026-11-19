import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const saveQuoteSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  sales_rep_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().min(2, 'Nombre de cliente requerido'),
  customer_id_number: z.string().trim().optional().nullable(),
  customer_whatsapp: z.string().trim().min(7, 'Teléfono WhatsApp requerido (mínimo 7 dígitos)'),
  customer_email: z.string().trim().email().optional().nullable().or(z.literal('')),
  internal_notes: z.string().trim().optional().nullable(),
  customer_notes: z.string().trim().optional().nullable(),
  additional_services_primary: z.number().min(0).default(0),
  additional_services_note: z.string().trim().optional().nullable(),
  discount_primary: z.number().min(0).default(0),
  expires_at: z.string().optional().nullable(),
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      product_name: z.string().trim().min(1),
      quantity: z.number().positive('Cantidad debe ser mayor a 0'),
      unit_price_primary: z.number().min(0, 'Precio debe ser mayor o igual a 0'),
      notes: z.string().trim().optional().nullable(),
    })
  ).default([]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || 'ALL';
    const repId = searchParams.get('rep_id') || 'ALL';
    const search = searchParams.get('search') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '15', 10)));
    const offset = (page - 1) * pageSize;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // Lazy check de quotes expiradas
      await client.query(`
        UPDATE ${tenant.db_schema_name}.sales_quotes
        SET status = 'EXPIRED', updated_at = now()
        WHERE status IN ('DRAFT', 'SENT')
          AND expires_at IS NOT NULL
          AND expires_at < now()
      `);

      let query = `
        SELECT 
          q.id,
          q.quote_number,
          q.sales_rep_id,
          sp.full_name AS sales_rep_name,
          q.customer_id,
          q.customer_name,
          q.customer_id_number,
          q.customer_whatsapp,
          q.customer_email,
          q.status,
          q.items_subtotal_primary,
          q.additional_services_primary,
          q.additional_services_note,
          q.subtotal_primary,
          q.discount_primary,
          q.tax_primary,
          q.total_primary,
          q.total_secondary,
          q.exchange_rate_applied,
          q.internal_notes,
          q.customer_notes,
          q.expires_at,
          q.converted_order_id,
          o.order_number AS converted_order_number,
          q.created_at,
          q.updated_at,
          (SELECT count(*)::int FROM ${tenant.db_schema_name}.sales_quote_items WHERE quote_id = q.id) AS items_count
        FROM ${tenant.db_schema_name}.sales_quotes q
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = q.sales_rep_id
        LEFT JOIN ${tenant.db_schema_name}.orders o ON o.id = q.converted_order_id
        WHERE 1=1
      `;
      const queryParams: unknown[] = [];
      let pIdx = 1;

      // Si es rol SALES_REP sin permiso de ver las ajenas, filtrar solo las suyas
      if (staff.role === 'SALES_REP') {
        const repProfile = await client.query(`
          SELECT can_edit_others_quotes, can_view_all_reports FROM ${tenant.db_schema_name}.sales_rep_profiles WHERE staff_id = $1
        `, [staff.id]);
        const canSeeAll = repProfile.rows[0]?.can_edit_others_quotes || repProfile.rows[0]?.can_view_all_reports;
        if (!canSeeAll) {
          query += ` AND q.sales_rep_id = $${pIdx++}`;
          queryParams.push(staff.id);
        }
      }

      if (status !== 'ALL') {
        query += ` AND q.status = $${pIdx++}`;
        queryParams.push(status);
      }

      if (repId !== 'ALL') {
        query += ` AND q.sales_rep_id = $${pIdx++}`;
        queryParams.push(repId);
      }

      if (search.trim()) {
        query += ` AND (
          q.quote_number ILIKE $${pIdx} 
          OR q.customer_name ILIKE $${pIdx} 
          OR q.customer_whatsapp ILIKE $${pIdx}
          OR q.customer_id_number ILIKE $${pIdx}
        )`;
        queryParams.push(`%${search.trim()}%`);
        pIdx++;
      }

      // Count total
      const countRes = await client.query(
        `SELECT count(*)::int AS total FROM (${query}) AS sub`,
        queryParams
      );
      const total = countRes.rows[0]?.total || 0;

      query += ` ORDER BY q.created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
      queryParams.push(pageSize, offset);

      const res = await client.query(query, queryParams);

      return NextResponse.json({
        quotes: res.rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching quotes:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno al consultar cotizaciones' },
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
    const { tenant, staff } = await requireTenantStaffApi(slug, 'orders');
    const json = await request.json();
    const data = saveQuoteSchema.parse(json);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      let actorId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id) ? staff.id : null;
      if (!actorId) {
        const ownerRes = await client.query(
          `SELECT id FROM ${tenant.db_schema_name}.staff_profiles WHERE role = 'OWNER' LIMIT 1`
        );
        actorId = ownerRes.rows[0]?.id || null;
      }

      if (!data.sales_rep_id && actorId) {
        data.sales_rep_id = actorId;
      }

      const res = await client.query(
        `SELECT platform.rpc_st_save_quote($1, $2, $3, $4, $5) AS result`,
        [
          tenant.db_schema_name,
          data.id || null,
          actorId,
          staff.role,
          JSON.stringify(data),
        ]
      );
      return NextResponse.json(res.rows[0]?.result);
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: (err as z.ZodError).issues?.[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error saving quote:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al guardar la cotización' },
      { status: 400 }
    );
  }
}
