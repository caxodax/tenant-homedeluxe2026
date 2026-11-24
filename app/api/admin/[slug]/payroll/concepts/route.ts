import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const conceptSchema = z.object({
  code: z.string().trim().min(2, 'Código de concepto requerido').toUpperCase(),
  name: z.string().trim().min(2, 'Nombre de concepto requerido'),
  concept_type: z.enum(['EARNING', 'DEDUCTION', 'COMMISSION', 'RETENTION', 'BONUS']),
  calculation_mode: z.enum(['FIXED', 'PERCENTAGE', 'DYNAMIC_COMMISSION', 'STATUTORY_FORMULA']).default('FIXED'),
  default_amount_primary: z.number().min(0).default(0.00),
  percentage_rate: z.number().min(0).max(100).default(0.00),
  is_statutory: z.boolean().default(false),
  is_active: z.boolean().default(true),
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
        SELECT * FROM ${tenant.db_schema_name}.pay_concepts
        ORDER BY concept_type ASC, name ASC;
      `;
      const res = await client.query(query);

      return NextResponse.json({
        success: true,
        concepts: res.rows.map((row) => ({
          ...row,
          default_amount_primary: parseFloat(row.default_amount_primary || '0'),
          percentage_rate: parseFloat(row.percentage_rate || '0'),
        })),
      });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /payroll/concepts:', error);
    return NextResponse.json({ error: error.message || 'Error al listar conceptos' }, { status: 500 });
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
    const validated = conceptSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const query = `
        INSERT INTO ${tenant.db_schema_name}.pay_concepts (
          code, name, concept_type, calculation_mode,
          default_amount_primary, percentage_rate, is_statutory, is_active
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8
        )
        RETURNING *;
      `;

      const values = [
        validated.code,
        validated.name,
        validated.concept_type,
        validated.calculation_mode,
        validated.default_amount_primary,
        validated.percentage_rate,
        validated.is_statutory,
        validated.is_active,
      ];

      const res = await client.query(query, values);
      return NextResponse.json({ success: true, concept: res.rows[0] }, { status: 201 });
    });
  } catch (error: any) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Datos inválidos' }, { status: 400 });
    }
    console.error('Error in POST /payroll/concepts:', error);
    return NextResponse.json({ error: error.message || 'Error al crear concepto' }, { status: 500 });
  }
}
