import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateAccountSchema = z.object({
  action: z.enum(['UPDATE_DETAILS', 'RELEASE_CUSTODY', 'MARK_DELIVERED', 'EXTEND_TERM', 'CANCEL_APARTADO']).optional(),
  notes: z.string().trim().optional().nullable(),
  additional_days: z.number().int().min(1).optional(),
  cancellation_reason: z.string().trim().optional(),
  penalty_percent: z.number().min(0).max(100).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // 1. Account details with customer and seller
      const accRes = await client.query(`
        SELECT 
          a.*,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          c.id_number as customer_id_number,
          c.address as customer_address,
          sp.full_name as seller_name,
          (a.due_date - CURRENT_DATE) as days_remaining
        FROM ${tenant.db_schema_name}.cxc_accounts a
        JOIN ${tenant.db_schema_name}.customers c ON c.id = a.customer_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = a.seller_id
        WHERE a.id = $1
      `, [id]);

      if (accRes.rows.length === 0) {
        return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
      }

      const account = accRes.rows[0];

      // 2. Tranches
      const tranchesRes = await client.query(`
        SELECT *
        FROM ${tenant.db_schema_name}.cxc_financing_tranches
        WHERE account_id = $1
        ORDER BY tranche_number ASC
      `, [id]);

      // 3. Payments
      const paymentsRes = await client.query(`
        SELECT 
          p.*,
          sp.full_name as received_by_name
        FROM ${tenant.db_schema_name}.cxc_payments p
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = p.received_by
        WHERE p.account_id = $1
        ORDER BY p.created_at DESC
      `, [id]);

      // 4. Linked order items if order_id exists
      let orderItems: unknown[] = [];
      if (account.order_id) {
        const itemsRes = await client.query(`
          SELECT 
            oi.id,
            oi.product_id,
            p.name as product_name,
            oi.quantity,
            oi.unit_price_primary as unit_price_usd,
            oi.total_primary as total_usd
          FROM ${tenant.db_schema_name}.order_items oi
          LEFT JOIN ${tenant.db_schema_name}.products p ON p.id = oi.product_id
          WHERE oi.order_id = $1
        `, [account.order_id]);
        orderItems = itemsRes.rows;
      }

      return NextResponse.json({
        success: true,
        account,
        tranches: tranchesRes.rows,
        payments: paymentsRes.rows,
        order_items: orderItems,
      });
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching account details:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al consultar cuenta' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  try {
    const { slug, id } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const parsed = updateAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { action, notes, additional_days, cancellation_reason, penalty_percent } = parsed.data;

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const currentRes = await client.query(`
        SELECT * FROM ${tenant.db_schema_name}.cxc_accounts WHERE id = $1
      `, [id]);

      if (currentRes.rows.length === 0) {
        return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
      }

      const acc = currentRes.rows[0];

      if (action === 'RELEASE_CUSTODY') {
        // Solo si saldo es 0.00 o si es OWNER/MANAGER
        if (Number(acc.balance_usd) > 0 && !['OWNER', 'MANAGER'].includes(staff.role)) {
          return NextResponse.json(
            { error: 'No se puede autorizar liberación física si existe saldo pendiente' },
            { status: 400 }
          );
        }

        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET custody_status = 'RELEASED_FOR_DELIVERY', updated_at = now()
          WHERE id = $1
        `, [id]);

        return NextResponse.json({ success: true, message: 'Custodia liberada para entrega' });
      }

      if (action === 'MARK_DELIVERED') {
        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET custody_status = 'DELIVERED', updated_at = now()
          WHERE id = $1
        `, [id]);

        return NextResponse.json({ success: true, message: 'Mercancía entregada al cliente' });
      }

      if (action === 'EXTEND_TERM' && additional_days) {
        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET 
            due_date = due_date + $2 * INTERVAL '1 day',
            term_days = term_days + $2,
            status = CASE WHEN due_date + $2 * INTERVAL '1 day' >= CURRENT_DATE THEN 'CURRENT' ELSE status END,
            notes = COALESCE(notes, '') || E'\n[Prórroga]: Extendidos ' || $2 || ' días el ' || to_char(now(), 'YYYY-MM-DD HH24:MI'),
            updated_at = now()
          WHERE id = $1
        `, [id, additional_days]);

        return NextResponse.json({ success: true, message: `Plazo extendido por ${additional_days} días` });
      }

      if (action === 'CANCEL_APARTADO') {
        const penalty = penalty_percent !== undefined ? penalty_percent : 15;
        const totalPaid = Number(acc.total_paid_usd);
        const penaltyAmount = Number(((totalPaid * penalty) / 100).toFixed(2));
        const refundOrCreditAmount = Number((totalPaid - penaltyAmount).toFixed(2));

        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET 
            status = 'CANCELLED',
            custody_status = 'CANCELLED_FORFEITED',
            closed_at = now(),
            notes = COALESCE(notes, '') || E'\n[Cancelación Apartado]: ' || $2 || 
                    '. Penalidad retenida: $' || $3 || ' (' || $4 || '%). Saldo a favor/reembolso: $' || $5,
            updated_at = now()
          WHERE id = $1
        `, [id, cancellation_reason || 'Cancelado por vencimiento', penaltyAmount, penalty, refundOrCreditAmount]);

        return NextResponse.json({
          success: true,
          message: 'Apartado cancelado y mercancía devuelta a stock',
          penalty_usd: penaltyAmount,
          credit_balance_usd: refundOrCreditAmount,
        });
      }

      // Default: Update notes
      if (notes !== undefined) {
        await client.query(`
          UPDATE ${tenant.db_schema_name}.cxc_accounts
          SET notes = $2, updated_at = now()
          WHERE id = $1
        `, [id, notes]);
      }

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating account:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar cuenta' },
      { status: 500 }
    );
  }
}
