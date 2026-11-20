import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const registerPaymentSchema = z.object({
  account_id: z.string().uuid('ID de cuenta requerido'),
  amount_usd: z.number().positive('El monto a abonar debe ser mayor a 0'),
  amount_original: z.number().positive().optional(),
  currency: z.string().trim().default('USD'),
  exchange_rate_applied: z.number().positive().default(1.0),
  payment_method: z.string().trim().min(2, 'Método de pago requerido'),
  reference: z.string().trim().optional().nullable(),
  tranche_id: z.string().uuid().optional().nullable(),
  fee_amount_usd: z.number().min(0).default(0), // Para comisiones Cashea
  notes: z.string().trim().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const parsed = registerPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de abono inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      await client.query('BEGIN');

      try {
        // 1. Obtener cuenta actual bloqueada para update
        const accRes = await client.query(`
          SELECT * 
          FROM ${tenant.db_schema_name}.cxc_accounts 
          WHERE id = $1 
          FOR UPDATE
        `, [data.account_id]);

        if (accRes.rows.length === 0) {
          throw new Error('Cuenta no encontrada');
        }

        const account = accRes.rows[0];

        if (account.status === 'SETTLED' || Number(account.balance_usd) <= 0) {
          throw new Error('Esta cuenta ya se encuentra totalmente liquidada');
        }

        if (account.status === 'CANCELLED') {
          throw new Error('No se pueden registrar abonos en una cuenta cancelada');
        }

        const balanceBefore = Number(account.balance_usd);
        const amountUsd = Number(data.amount_usd.toFixed(2));

        if (amountUsd > balanceBefore + 0.009) {
          throw new Error(`El monto ($${amountUsd}) excede el saldo pendiente ($${balanceBefore})`);
        }

        const balanceAfter = Math.max(0, Number((balanceBefore - amountUsd).toFixed(2)));
        const newTotalPaid = Number((Number(account.total_paid_usd) + amountUsd).toFixed(2));
        const isSettled = balanceAfter <= 0.00;

        // 2. Correlativo de recibo REC-YYYYMM-XXXXX
        const now = new Date();
        const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const seqRes = await client.query(`
          SELECT nextval('${tenant.db_schema_name}.cxc_receipt_seq') as seq
        `);
        const receiptNumber = `REC-${yyyymm}-${String(seqRes.rows[0].seq).padStart(5, '0')}`;

        const exRate = Number(data.exchange_rate_applied || 1.0);
        const origAmt = data.amount_original !== undefined
          ? Number(data.amount_original.toFixed(2))
          : data.currency === 'USD'
            ? amountUsd
            : Number((amountUsd * exRate).toFixed(2));

        // 3. Insertar abono en cxc_payments
        const insertPaymentRes = await client.query(`
          INSERT INTO ${tenant.db_schema_name}.cxc_payments (
            receipt_number,
            account_id,
            tranche_id,
            amount_usd,
            amount_original,
            currency,
            exchange_rate_applied,
            payment_method,
            reference,
            balance_before_usd,
            balance_after_usd,
            received_by,
            notes
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
          ) RETURNING *
        `, [
          receiptNumber,
          account.id,
          data.tranche_id || null,
          amountUsd,
          origAmt,
          data.currency,
          exRate,
          data.payment_method,
          data.reference || null,
          balanceBefore,
          balanceAfter,
          staff.id,
          data.notes || null,
        ]);

        const newPayment = insertPaymentRes.rows[0];

        // 4. Actualizar cuenta CxC
        let newCustody = account.custody_status;
        if (account.account_type === 'LAYAWAY' && isSettled) {
          newCustody = 'RELEASED_FOR_DELIVERY';
        }

        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET 
            balance_usd = $1,
            total_paid_usd = $2,
            status = $3,
            custody_status = $4,
            closed_at = CASE WHEN $3 = 'SETTLED' THEN now() ELSE closed_at END,
            updated_at = now()
          WHERE id = $5
        `, [
          balanceAfter,
          newTotalPaid,
          isSettled ? 'SETTLED' : account.status,
          newCustody,
          account.id,
        ]);

        // 5. Si está vinculado a un Tranche (Cashea / BNPL), actualizarlo
        if (data.tranche_id) {
          await client.query(`
            UPDATE ${tenant.db_schema_name}.cxc_financing_tranches
            SET 
              settled_amount_usd = settled_amount_usd + $1,
              fee_amount_usd = fee_amount_usd + $2,
              settled_date = CURRENT_DATE,
              status = 'SETTLED',
              settlement_reference = $3,
              settled_by = $4,
              updated_at = now()
            WHERE id = $5
          `, [
            amountUsd,
            data.fee_amount_usd || 0.00,
            data.reference || null,
            staff.id,
            data.tranche_id,
          ]);
        }

        await client.query('COMMIT');

        return NextResponse.json({
          success: true,
          payment: newPayment,
          balance_before_usd: balanceBefore,
          balance_after_usd: balanceAfter,
          is_settled: isSettled,
          receipt_number: receiptNumber,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error registering payment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar abono' },
      { status: 500 }
    );
  }
}
