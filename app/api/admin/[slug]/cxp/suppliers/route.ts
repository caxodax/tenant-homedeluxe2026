import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const supplierSchema = z.object({
  name: z.string().trim().min(2, 'El nombre o razón social del taller es requerido'),
  tax_id: z.string().trim().optional().nullable(),
  contact_name: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().trim().optional().nullable(),
  category: z.enum(['RAW_MATERIAL', 'MERCHANDISE', 'SERVICE', 'FIXED_COST', 'OTHER']).default('MERCHANDISE'),
  default_currency: z.enum(['USD', 'VES']).default('USD'),
  payment_terms_days: z.number().int().min(0).default(15),
  notes: z.string().trim().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const query = `
        SELECT 
          s.id,
          s.name,
          s.tax_id,
          s.contact_name,
          s.phone,
          s.whatsapp,
          s.email,
          s.address,
          s.category,
          s.default_currency,
          s.payment_terms_days,
          s.notes,
          s.is_active,
          s.created_at,
          COALESCE(SUM(b.balance_primary) FILTER (WHERE b.status IN ('OPEN', 'PARTIAL')), 0.00) as total_debt_primary,
          COALESCE(SUM(a.amount_primary - a.applied_primary) FILTER (WHERE a.status = 'OPEN'), 0.00) as open_advances_primary,
          COUNT(b.id) FILTER (WHERE b.status IN ('OPEN', 'PARTIAL')) as open_bills_count
        FROM ${tenant.db_schema_name}.cxp_suppliers s
        LEFT JOIN ${tenant.db_schema_name}.cxp_bills b ON b.supplier_id = s.id
        LEFT JOIN ${tenant.db_schema_name}.cxp_advances a ON a.supplier_id = s.id
        WHERE s.is_active = true
        GROUP BY s.id
        ORDER BY s.name ASC;
      `;
      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        suppliers: res.rows.map((row) => {
          const debt = parseFloat(row.total_debt_primary) || 0;
          const adv = parseFloat(row.open_advances_primary) || 0;
          return {
            ...row,
            total_debt_primary: debt,
            total_debt_usd: debt,
            open_advances_primary: adv,
            open_advances_usd: adv,
            open_bills_count: parseInt(row.open_bills_count, 10) || 0,
          };
        }),
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar proveedores';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const data = supplierSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        INSERT INTO ${tenant.db_schema_name}.cxp_suppliers (
          name, tax_id, contact_name, phone, whatsapp, email,
          address, category, default_currency, payment_terms_days, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `, [
        data.name,
        data.tax_id || null,
        data.contact_name || null,
        data.phone || null,
        data.whatsapp || null,
        data.email || null,
        data.address || null,
        data.category,
        data.default_currency,
        data.payment_terms_days,
        data.notes || null,
      ]);

      return NextResponse.json({
        success: true,
        supplier: res.rows[0],
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al crear proveedor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
