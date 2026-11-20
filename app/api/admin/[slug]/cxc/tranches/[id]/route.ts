import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const settleTrancheSchema = z.object({
  settled_amount_usd: z.number().positive('El monto liquidado debe ser mayor a 0'),
  fee_amount_usd: z.number().min(0).default(0),
  settlement_reference: z.string().trim().min(2, 'Referencia de liquidación requerida'),
  notes: z.string().trim().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const parsed = settleTrancheSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      await client.query('BEGIN');

      try {
        const trancheRes = await client.query(`
          SELECT t.*, a.id as account_id, a.balance_usd, a.total_paid_usd
          FROM ${tenant.db_schema_name}.cxc_financing_tranches t
          JOIN ${tenant.db_schema_name}.cxc_accounts a ON a.id = t.account_id
          WHERE t.id = $1
          FOR UPDATE
        `, [id]);

        if (trancheRes.rows.length === 0) {
          throw new Error('Bloque financiero no encontrado');
        }

        const tranche = trancheRes.rows[0];

        // 1. Actualizar tranche
        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_financing_tranches
          SET 
            settled_amount_usd = $1,
            fee_amount_usd = $2,
            settled_date = CURRENT_DATE,
            status = 'SETTLED',
            settlement_reference = $3,
            settled_by = $4,
            notes = $5,
            updated_at = now()
          WHERE id = $6
        `, [
          data.settled_amount_usd,
          data.fee_amount_usd,
          data.settlement_reference,
          staff.id,
          data.notes || null,
          id,
        ]);

        // 2. Registrar en cxc_payments como abono de Cashea
        const now = new Date();
        const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const seqRes = await client.query(`
          SELECT nextval('${tenant.db_schema_name}.cxc_receipt_seq') as seq
        `);
        const receiptNumber = `REC-${yyyymm}-${String(seqRes.rows[0].seq).padStart(5, '0')}`;
        const balanceBefore = Number(tranche.balance_usd);
        const balanceAfter = Math.max(0, Number((balanceBefore - data.settled_amount_usd).toFixed(2)));
        const newTotalPaid = Number((Number(tranche.total_paid_usd) + data.settled_amount_usd).toFixed(2));
        const isSettled = balanceAfter <= 0.00;

        await client.query(`
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
            $1, $2, $3, $4, $4, 'USD', 1.0, 'CASHEA_SETTLEMENT', $5, $6, $7, $8, $9
          )
        `, [
          receiptNumber,
          tranche.account_id,
          id,
          data.settled_amount_usd,
          data.settlement_reference,
          balanceBefore,
          balanceAfter,
          staff.id,
          `Liquidación Cashea (${tranche.tranche_name}) - Retención fee: $${data.fee_amount_usd}`,
        ]);

        // 3. Actualizar cuenta
        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET 
            balance_usd = $1,
            total_paid_usd = $2,
            status = $3,
            closed_at = CASE WHEN $3 = 'SETTLED' THEN now() ELSE closed_at END,
            updated_at = now()
          WHERE id = $4
        `, [
          balanceAfter,
          newTotalPaid,
          isSettled ? 'SETTLED' : 'CURRENT',
          tranche.account_id,
        ]);

        await client.query('COMMIT');

        return NextResponse.json({
          success: true,
          message: 'Bloque liquidado exitosamente',
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
    console.error('Error settling tranche:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al liquidar bloque' },
      { status: 500 }
    );
  }
}
