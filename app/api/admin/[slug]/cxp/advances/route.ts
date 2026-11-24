import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const registerAdvanceSchema = z.object({
  supplier_id: z.string().uuid('ID de proveedor requerido'),
  amount_primary: z.number().positive('El monto debe ser mayor a 0').optional(),
  amount_usd: z.number().positive('El monto debe ser mayor a 0').optional(),
  account_id: z.string().uuid('ID de cuenta de pago requerido'),
  currency: z.string().default('USD'),
  original_amount: z.number().positive('El monto original debe ser mayor a 0'),
  exchange_rate: z.number().positive('La tasa debe ser mayor a 0').default(1.0),
  purpose: z.string().trim().min(3, 'Indique el propósito o motivo del anticipo (ej. compra de madera)'),
  link_option: z.enum(['LINK_EXISTING', 'UNLINKED']).default('UNLINKED'),
  bill_id: z.string().uuid().optional().nullable(),
}).refine(data => (data.amount_primary ?? data.amount_usd) !== undefined, {
  message: 'El monto del anticipo es requerido',
  path: ['amount_primary'],
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const { searchParams } = new URL(request.url);

    const supplierId = searchParams.get('supplier_id');
    const status = searchParams.get('status') || 'ALL';

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const conditions: string[] = ['1=1'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (supplierId) {
        conditions.push(`a.supplier_id = $${paramIdx++}`);
        values.push(supplierId);
      }
      if (status !== 'ALL') {
        conditions.push(`a.status = $${paramIdx++}`);
        values.push(status);
      }

      const query = `
        SELECT 
          a.id,
          a.advance_number,
          a.supplier_id,
          s.name as supplier_name,
          a.amount_primary,
          a.amount_usd,
          a.applied_primary,
          a.applied_usd,
          (a.amount_primary - a.applied_primary) as remaining_primary,
          (a.amount_primary - a.applied_primary) as remaining_usd,
          a.account_id,
          pa.name as account_name,
          a.currency,
          a.original_amount,
          a.exchange_rate,
          a.purpose,
          a.status,
          a.created_at,
          COALESCE(
            (SELECT json_agg(
              json_build_object(
                'id', app.id,
                'bill_id', app.bill_id,
                'bill_number', b.internal_number,
                'amount_primary', app.amount_primary,
                'amount_usd', app.amount_usd,
                'applied_at', app.applied_at
              )
            ) FROM ${tenant.db_schema_name}.cxp_advance_applications app
              JOIN ${tenant.db_schema_name}.cxp_bills b ON b.id = app.bill_id
              WHERE app.advance_id = a.id
            ), '[]'::json
          ) as applications
        FROM ${tenant.db_schema_name}.cxp_advances a
        JOIN ${tenant.db_schema_name}.cxp_suppliers s ON s.id = a.supplier_id
        JOIN ${tenant.db_schema_name}.cxp_payment_accounts pa ON pa.id = a.account_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY a.created_at DESC;
      `;

      const res = await client.query(query, values);

      return NextResponse.json({
        success: true,
        advances: res.rows.map((r) => {
          const amt = parseFloat(r.amount_primary ?? r.amount_usd) || 0;
          const app = parseFloat(r.applied_primary ?? r.applied_usd) || 0;
          const rem = parseFloat(r.remaining_primary ?? r.remaining_usd) || 0;
          return {
            ...r,
            amount_primary: amt,
            amount_usd: amt,
            applied_primary: app,
            applied_usd: app,
            remaining_primary: rem,
            remaining_usd: rem,
            original_amount: parseFloat(r.original_amount) || 0,
          };
        }),
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar anticipos';
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
    const data = registerAdvanceSchema.parse(body);
    const amountPrimary = data.amount_primary ?? data.amount_usd ?? 0;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT platform.rpc_cxp_register_advance($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result;
      `, [
        tenant.db_schema_name,
        data.supplier_id,
        amountPrimary,
        data.account_id,
        data.currency,
        data.original_amount,
        data.exchange_rate,
        data.purpose,
        staff.id,
        data.link_option,
        data.bill_id || null,
        null, // new_bill_data
      ]);

      const result = res.rows[0]?.result;
      if (!result?.success) {
        throw new Error(result?.message || 'Error al registrar anticipo');
      }

      return NextResponse.json({
        success: true,
        advance: result,
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al registrar anticipo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
