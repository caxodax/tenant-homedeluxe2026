import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const recordCompSchema = z.object({
  from_supplier_id: z.string().uuid('Proveedor origen requerido (quien entregó material / ej. Sheraton)'),
  to_supplier_id: z.string().uuid('Proveedor destino requerido (quien retiró el material / ej. Fabiana)'),
  amount_primary: z.number().positive('El monto a compensar debe ser mayor a 0').optional(),
  amount_usd: z.number().positive().optional(),
  reason: z.string().trim().min(3, 'Indique el motivo del cruce de cuentas'),
  from_bill_id: z.string().uuid().optional().nullable(),
  to_bill_id: z.string().uuid().optional().nullable(),
}).refine(data => data.amount_primary !== undefined || data.amount_usd !== undefined, {
  message: 'El monto a compensar debe ser mayor a 0',
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
          c.id,
          c.compensation_number,
          c.from_supplier_id,
          sf.name as from_supplier_name,
          c.to_supplier_id,
          st.name as to_supplier_name,
          c.from_bill_id,
          bf.internal_number as from_bill_number,
          c.to_bill_id,
          bt.internal_number as to_bill_number,
          c.amount_primary,
          COALESCE(c.amount_primary, c.amount_usd) as amount_usd,
          c.reason,
          c.created_at,
          sp.full_name as authorized_by_name
        FROM ${tenant.db_schema_name}.cxp_compensations c
        JOIN ${tenant.db_schema_name}.cxp_suppliers sf ON sf.id = c.from_supplier_id
        JOIN ${tenant.db_schema_name}.cxp_suppliers st ON st.id = c.to_supplier_id
        LEFT JOIN ${tenant.db_schema_name}.cxp_bills bf ON bf.id = c.from_bill_id
        LEFT JOIN ${tenant.db_schema_name}.cxp_bills bt ON bt.id = c.to_bill_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = c.authorized_by
        ORDER BY c.created_at DESC;
      `;

      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        compensations: res.rows.map((r) => {
          const amt = parseFloat(r.amount_primary ?? r.amount_usd) || 0;
          return {
            ...r,
            amount_primary: amt,
            amount_usd: amt,
          };
        }),
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar compensaciones';
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
    const data = recordCompSchema.parse(body);
    const amountPrimary = data.amount_primary ?? data.amount_usd!;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT platform.rpc_cxp_record_compensation($1, $2, $3, $4, $5, $6, $7, $8) as result;
      `, [
        tenant.db_schema_name,
        data.from_supplier_id,
        data.to_supplier_id,
        amountPrimary,
        data.reason,
        staff.id,
        data.from_bill_id || null,
        data.to_bill_id || null,
      ]);

      const result = res.rows[0]?.result;
      if (!result?.success) {
        throw new Error(result?.message || 'Error al registrar compensación');
      }

      return NextResponse.json({
        success: true,
        compensation: result,
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al registrar compensación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
