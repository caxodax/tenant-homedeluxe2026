import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional().nullable(),
  first_name: z.string().trim().min(2, 'El nombre es requerido'),
  last_name: z.string().trim().min(2, 'El apellido es requerido'),
  id_document: z.string().trim().min(5, 'Documento de identidad requerido'),
  phone: z.string().trim().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  job_title: z.string().trim().min(2, 'El cargo es requerido'),
  department: z.string().trim().default('Ventas'),
  hired_at: z.string().optional().default(() => new Date().toISOString().split('T')[0]),
  terminated_at: z.string().optional().nullable(),
  base_salary_primary: z.number().min(0, 'El sueldo base no puede ser negativo').default(0.00),
  base_salary_secondary: z.number().min(0).default(0.00),
  payment_frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).default('BIWEEKLY'),
  bank_name: z.string().trim().optional().nullable(),
  bank_account_number: z.string().trim().optional().nullable(),
  bank_account_type: z.string().trim().default('CORRIENTE'),
  mobile_payment_phone: z.string().trim().optional().nullable(),
  mobile_payment_id_doc: z.string().trim().optional().nullable(),
  can_login: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: z.string().trim().optional().nullable(),
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
          e.*,
          sp.email as staff_email,
          sp.role as staff_role,
          COALESCE(
            (SELECT SUM(pending_amount_primary) 
             FROM ${tenant.db_schema_name}.pay_advances a 
             WHERE a.employee_id = e.id AND a.status IN ('APPROVED', 'PARTIALLY_DEDUCTED')), 
            0.00
          ) as active_advances_balance
        FROM ${tenant.db_schema_name}.pay_employees e
        LEFT JOIN ${tenant.db_schema_name}.staff_profiles sp ON sp.id = e.staff_id
        ORDER BY e.is_active DESC, e.last_name ASC, e.first_name ASC;
      `;
      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        employees: res.rows.map((row) => ({
          ...row,
          base_salary_primary: parseFloat(row.base_salary_primary || '0'),
          base_salary_secondary: parseFloat(row.base_salary_secondary || '0'),
          active_advances_balance: parseFloat(row.active_advances_balance || '0'),
        })),
      });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/employees:', error);
    return NextResponse.json({ error: error.message || 'Error al listar empleados' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const validated = employeeSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const insertQuery = `
        INSERT INTO ${tenant.db_schema_name}.pay_employees (
          staff_id, first_name, last_name, id_document, phone, email,
          job_title, department, hired_at, terminated_at,
          base_salary_primary, base_salary_secondary, payment_frequency,
          bank_name, bank_account_number, bank_account_type,
          mobile_payment_phone, mobile_payment_id_doc,
          can_login, is_active, notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18,
          $19, $20, $21
        )
        RETURNING *;
      `;

      const values = [
        validated.staff_id || null,
        validated.first_name,
        validated.last_name,
        validated.id_document,
        validated.phone || null,
        validated.email || null,
        validated.job_title,
        validated.department,
        validated.hired_at,
        validated.terminated_at || null,
        validated.base_salary_primary,
        validated.base_salary_secondary,
        validated.payment_frequency,
        validated.bank_name || null,
        validated.bank_account_number || null,
        validated.bank_account_type,
        validated.mobile_payment_phone || null,
        validated.mobile_payment_id_doc || null,
        validated.can_login,
        validated.is_active,
        validated.notes || null,
      ];

      const res = await client.query(insertQuery, values);
      return NextResponse.json({ success: true, employee: res.rows[0] }, { status: 201 });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in POST /payroll/employees:', error);
    return NextResponse.json({ error: error.message || 'Error al crear empleado' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'staff');

    const body = await request.json();
    const validated = employeeSchema.parse(body);

    if (!validated.id) {
      return NextResponse.json({ error: 'El ID de colaborador es requerido para actualizar' }, { status: 400 });
    }

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const updateQuery = `
        UPDATE ${tenant.db_schema_name}.pay_employees
        SET 
          staff_id = $2,
          first_name = $3,
          last_name = $4,
          id_document = $5,
          phone = $6,
          email = $7,
          job_title = $8,
          department = $9,
          hired_at = $10,
          terminated_at = $11,
          base_salary_primary = $12,
          base_salary_secondary = $13,
          payment_frequency = $14,
          bank_name = $15,
          bank_account_number = $16,
          bank_account_type = $17,
          mobile_payment_phone = $18,
          mobile_payment_id_doc = $19,
          can_login = $20,
          is_active = $21,
          notes = $22,
          updated_at = now()
        WHERE id = $1
        RETURNING *;
      `;

      const values = [
        validated.id,
        validated.staff_id || null,
        validated.first_name,
        validated.last_name,
        validated.id_document,
        validated.phone || null,
        validated.email || null,
        validated.job_title,
        validated.department,
        validated.hired_at,
        validated.terminated_at || null,
        validated.base_salary_primary,
        validated.base_salary_secondary,
        validated.payment_frequency,
        validated.bank_name || null,
        validated.bank_account_number || null,
        validated.bank_account_type,
        validated.mobile_payment_phone || null,
        validated.mobile_payment_id_doc || null,
        validated.can_login,
        validated.is_active,
        validated.notes || null,
      ];

      const res = await client.query(updateQuery, values);
      if (res.rowCount === 0) {
        return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, employee: res.rows[0] });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in PUT /payroll/employees:', error);
    return NextResponse.json({ error: error.message || 'Error al actualizar empleado' }, { status: 500 });
  }
}
