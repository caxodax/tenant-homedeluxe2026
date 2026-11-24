import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const advanceSchema = z.object({
  employee_id: z.string().uuid('ID de empleado requerido'),
  requested_amount_primary: z.number().positive('El monto solicitado debe ser mayor a 0'),
  approved_amount_primary: z.number().positive('El monto aprobado debe ser mayor a 0'),
  reason: z.string().trim().min(3, 'El motivo es requerido'),
  installments_total: z.number().int().min(1, 'Mínimo 1 cuota').default(1),
  account_id: z.string().uuid().optional().nullable(),
  exchange_rate_snapshot: z.number().min(0.0001).default(1.0000),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const query = `
        SELECT 
          a.*,
          e.first_name,
          e.last_name,
          e.id_document,
          e.job_title,
          e.department,
          sp_req.full_name as requested_by_name,
          sp_app.full_name as approved_by_name
        FROM ${tenant.db_schema_name}.pay_advances a
        JOIN ${tenant.db_schema_name}.pay_employees e ON e.id = a.employee_id
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_req ON sp_req.id = a.requested_by
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp_app ON sp_app.id = a.approved_by
        ORDER BY a.created_at DESC;
      `;
      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        advances: res.rows.map((row) => ({
          ...row,
          requested_amount_primary: parseFloat(row.requested_amount_primary || '0'),
          approved_amount_primary: parseFloat(row.approved_amount_primary || '0'),
          pending_amount_primary: parseFloat(row.pending_amount_primary || '0'),
          exchange_rate_snapshot: parseFloat(row.exchange_rate_snapshot || '1'),
          installments_total: parseInt(row.installments_total || '1', 10),
          installments_remaining: parseInt(row.installments_remaining || '1', 10),
        })),
      });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/advances:', error);
    return NextResponse.json({ error: error.message || 'Error al listar adelantos' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const validated = advanceSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // Generar correlativo ADV-YYYYMM-######
      const seqRes = await client.query(`
        SELECT 'ADV-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('${tenant.db_schema_name}.pay_advance_seq')::text, 6, '0') as advance_number
      `);
      const advance_number = seqRes.rows[0].advance_number;

      const insertQuery = `
        INSERT INTO ${tenant.db_schema_name}.pay_advances (
          advance_number, employee_id, requested_amount_primary, approved_amount_primary,
          pending_amount_primary, exchange_rate_snapshot, reason,
          installments_total, installments_remaining, status,
          requested_by, approved_by, approved_at
        ) VALUES (
          $1, $2, $3, $4,
          $4, $5, $6,
          $7, $7, 'APPROVED',
          $8, $8, now()
        )
        RETURNING *;
      `;

      const values = [
        advance_number,
        validated.employee_id,
        validated.requested_amount_primary,
        validated.approved_amount_primary,
        validated.exchange_rate_snapshot,
        validated.reason,
        validated.installments_total,
        staff.id,
      ];

      const res = await client.query(insertQuery, values);
      return NextResponse.json({ success: true, advance: res.rows[0] }, { status: 201 });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in POST /payroll/advances:', error);
    return NextResponse.json({ error: error.message || 'Error al emitir adelanto' }, { status: 500 });
  }
}
