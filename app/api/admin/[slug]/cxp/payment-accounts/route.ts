import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const paymentAccountSchema = z.object({
  name: z.string().trim().min(2, 'Nombre de la cuenta requerido'),
  type: z.enum(['BANK', 'ZELLE', 'BINANCE', 'CASH', 'PAGO_MOVIL', 'OTHER']),
  details: z.record(z.string(), z.any()).default({}),
  is_default: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(`
        SELECT id, name, type, details, is_default, is_active, sort_order, created_at
        FROM ${tenant.db_schema_name}.cxp_payment_accounts
        WHERE is_active = true
        ORDER BY is_default DESC, sort_order ASC, name ASC;
      `);

      return NextResponse.json({
        success: true,
        accounts: res.rows,
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar cuentas de pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const data = paymentAccountSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      if (data.is_default) {
        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxp_payment_accounts
          SET is_default = false
          WHERE is_default = true;
        `);
      }

      const res = await client.query(`
        INSERT INTO ${tenant.db_schema_name}.cxp_payment_accounts (
          name, type, details, is_default, sort_order
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `, [
        data.name,
        data.type,
        JSON.stringify(data.details),
        data.is_default,
        data.sort_order,
      ]);

      return NextResponse.json({
        success: true,
        account: res.rows[0],
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al crear cuenta de pago';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
