import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createStoreSchema = z.object({
  name: z.string().trim().min(2, 'El nombre de la sede es requerido').max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9_-]/g, '')),
  address: z.string().trim().min(4, 'La dirección es requerida').max(300),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp_number: z.string().trim().max(40).optional().nullable(),
  tax_id: z.string().trim().max(40).optional().nullable(),
  schedule: z.record(z.string(), z.unknown()).optional(),
});

const patchStoreSchema = z.object({
  id: z.string().uuid('ID de sede inválido'),
  name: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().min(4).max(300).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  whatsapp_number: z.string().trim().max(40).optional().nullable(),
  tax_id: z.string().trim().max(40).optional().nullable(),
  schedule: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug);

    const [planRes, stores] = await Promise.all([
      pool.query(
        `SELECT sp.max_stores
         FROM platform.tenants t
         LEFT JOIN platform.subscription_plans sp ON sp.id = t.plan_id
         WHERE t.id = $1
         LIMIT 1`,
        [tenant.id]
      ),
      withTenantDb(tenant.db_schema_name, null, async (client) => {
        const res = await client.query(`
          SELECT id, name, code, address, phone, is_default, schedule, whatsapp_number, tax_id, is_active, created_at
          FROM stores
          ORDER BY is_default DESC, created_at ASC
        `);
        return res.rows;
      }),
    ]);

    return NextResponse.json({
      success: true,
      max_stores: Number(planRes.rows[0]?.max_stores ?? 1),
      stores,
    });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching stores:', err);
    return NextResponse.json({ error: 'Error al consultar sucursales' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const body = await request.json();
    const parsed = createStoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const planRes = await pool.query(
      `SELECT COALESCE(sp.max_stores, 1) AS max_stores
       FROM platform.tenants t
       LEFT JOIN platform.subscription_plans sp ON sp.id = t.plan_id
       WHERE t.id = $1`,
      [tenant.id]
    );
    const maxStores = Number(planRes.rows[0]?.max_stores ?? 1);

    const created = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const countRes = await client.query(`SELECT COUNT(*)::int AS cnt FROM stores WHERE is_active = true`);
      const activeCount = Number(countRes.rows[0]?.cnt || 0);

      if (activeCount >= maxStores) {
        throw new TenantAuthError(
          `Límite de sucursales alcanzado (${activeCount}/${maxStores}). Actualiza tu plan para agregar más sedes.`,
          403
        );
      }

      const d = parsed.data;
      const ins = await client.query(
        `INSERT INTO stores (name, code, address, phone, whatsapp_number, tax_id, schedule, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, false)
         RETURNING *`,
        [
          d.name,
          d.code,
          d.address,
          d.phone || null,
          d.whatsapp_number || null,
          d.tax_id || null,
          JSON.stringify(d.schedule || {}),
        ]
      );
      const store = ins.rows[0];

      // Crear caja registradora por defecto para que la nueva sede pueda operar en POS de inmediato
      await client.query(
        `INSERT INTO cash_registers (store_id, name, code)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [store.id, `Caja ${d.name}`, `POS-${d.code}`]
      );

      return store;
    });

    return NextResponse.json({ success: true, store: created }, { status: 201 });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message, code: err.statusCode === 403 ? 'QUOTA_EXCEEDED' : undefined }, { status: err.statusCode });
    }
    console.error('Error creating store:', err);
    return NextResponse.json({ error: 'Error al crear sucursal' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const body = await request.json();
    const parsed = patchStoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const updated = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      if (d.is_default === true) {
        await client.query(`UPDATE stores SET is_default = false WHERE is_default = true AND id != $1`, [d.id]);
      }

      const res = await client.query(
        `UPDATE stores
         SET name = COALESCE($1, name),
             address = COALESCE($2, address),
             phone = COALESCE($3, phone),
             whatsapp_number = COALESCE($4, whatsapp_number),
             tax_id = COALESCE($5, tax_id),
             schedule = COALESCE($6::jsonb, schedule),
             is_active = COALESCE($7, is_active),
             is_default = COALESCE($8, is_default),
             updated_at = now()
         WHERE id = $9
         RETURNING *`,
        [
          d.name ?? null,
          d.address ?? null,
          d.phone !== undefined ? d.phone : null,
          d.whatsapp_number !== undefined ? d.whatsapp_number : null,
          d.tax_id !== undefined ? d.tax_id : null,
          d.schedule ? JSON.stringify(d.schedule) : null,
          d.is_active !== undefined ? d.is_active : null,
          d.is_default !== undefined ? d.is_default : null,
          d.id,
        ]
      );
      if ((res.rowCount || 0) === 0) {
        throw new TenantAuthError('Sucursal no encontrada', 404);
      }
      return res.rows[0];
    });

    return NextResponse.json({ success: true, store: updated });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error updating store:', err);
    return NextResponse.json({ error: 'Error al actualizar sucursal' }, { status: 500 });
  }
}
