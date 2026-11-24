import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const payBillSchema = z.object({
  bill_id: z.string().uuid('ID de factura requerido'),
  account_id: z.string().uuid('ID de cuenta de pago requerido'),
  amount_primary: z.number().positive().optional(),
  amount_usd: z.number().positive().optional(),
  currency: z.string().default('USD'),
  original_amount: z.number().positive('El monto debe ser mayor a 0'),
  exchange_rate: z.number().positive('La tasa debe ser mayor a 0').default(1.0),
  rate_override_reason: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  voucher_r2_key: z.string().trim().optional().nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const { searchParams } = new URL(request.url);

    const billId = searchParams.get('bill_id');
    const supplierId = searchParams.get('supplier_id');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const conditions: string[] = ['1=1'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (billId) {
        conditions.push(`p.bill_id = $${paramIdx++}`);
        values.push(billId);
      }
      if (supplierId) {
        conditions.push(`b.supplier_id = $${paramIdx++}`);
        values.push(supplierId);
      }

      const query = `
        SELECT 
          p.id,
          p.payment_number,
          p.bill_id,
          b.internal_number as bill_number,
          s.name as supplier_name,
          p.account_id,
          pa.name as account_name,
          pa.type as account_type,
          p.currency,
          p.original_amount,
          p.exchange_rate,
          p.amount_primary,
          p.amount_usd,
          p.balance_before_primary,
          p.balance_before_usd,
          p.balance_after_primary,
          p.balance_after_usd,
          p.paid_at,
          p.notes,
          st.full_name as paid_by_name
        FROM ${tenant.db_schema_name}.cxp_payments p
        JOIN ${tenant.db_schema_name}.cxp_bills b ON b.id = p.bill_id
        JOIN ${tenant.db_schema_name}.cxp_suppliers s ON s.id = b.supplier_id
        JOIN ${tenant.db_schema_name}.cxp_payment_accounts pa ON pa.id = p.account_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles st ON st.id = p.paid_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.paid_at DESC
        LIMIT 100;
      `;

      const res = await client.query(query, values);

      return NextResponse.json({
        success: true,
        payments: res.rows.map((p) => {
          const amt = parseFloat(p.amount_primary ?? p.amount_usd) || 0;
          const bBefore = parseFloat(p.balance_before_primary ?? p.balance_before_usd) || 0;
          const bAfter = parseFloat(p.balance_after_primary ?? p.balance_after_usd) || 0;
          return {
            ...p,
            amount_primary: amt,
            amount_usd: amt,
            original_amount: parseFloat(p.original_amount) || 0,
            balance_before_primary: bBefore,
            balance_before_usd: bBefore,
            balance_after_primary: bAfter,
            balance_after_usd: bAfter,
          };
        }),
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar pagos';
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
    const data = payBillSchema.parse(body);

    const amountPrimary = data.amount_primary ?? data.amount_usd ?? (
      data.exchange_rate > 0 && data.currency !== 'USD' && data.currency !== 'EUR'
        ? Number((data.original_amount / data.exchange_rate).toFixed(2))
        : data.original_amount
    );

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT platform.rpc_cxp_pay_bill($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result;
      `, [
        tenant.db_schema_name,
        data.bill_id,
        data.account_id,
        amountPrimary,
        data.currency,
        data.exchange_rate,
        data.rate_override_reason || null,
        staff.id,
        data.notes || null,
        data.voucher_r2_key || null,
      ]);

      const result = res.rows[0]?.result;
      if (!result?.success) {
        throw new Error(result?.message || 'Error al procesar el abono a la factura');
      }

      return NextResponse.json({
        success: true,
        payment: result,
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al registrar pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
