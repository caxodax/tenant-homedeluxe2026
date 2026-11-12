import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import {
  fetchTenantPaymentMethods,
  normalizeMethodConfig,
  SYSTEM_PAYMENT_CODES,
  writeTenantAuditLog,
} from '@/lib/payment-methods';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const detailItemSchema = z.object({
  label: z.string().trim().min(1, 'Etiqueta requerida').max(60),
  value: z.string().trim().min(1, 'Valor requerido').max(180),
});

const createMethodSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) =>
      v
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
    ),
  name: z.string().trim().min(2, 'Nombre requerido').max(80),
  currency: z.string().trim().default('USD'),
  is_active: z.boolean().default(true),
  requires_reference: z.boolean().default(true),
  requires_proof: z.boolean().default(true),
  available_in_storefront: z.boolean().default(true),
  available_in_pos: z.boolean().default(true),
  instructions: z.string().max(600).default(''),
  details: z.array(detailItemSchema).max(10).default([]),
});

const updateMethodSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(80).optional(),
  is_active: z.boolean().optional(),
  requires_reference: z.boolean().optional(),
  requires_proof: z.boolean().optional(),
  available_in_storefront: z.boolean().optional(),
  available_in_pos: z.boolean().optional(),
  instructions: z.string().max(600).optional(),
  details: z.array(detailItemSchema).max(10).optional(),
});

async function upsertPaymentMethodConfig(
  client: import('pg').PoolClient,
  code: string,
  cfg: ReturnType<typeof normalizeMethodConfig>
) {
  await client.query(
    `UPDATE settings
     SET value = jsonb_set(
       COALESCE(value, '{}'::jsonb),
       '{payment_configs}',
       COALESCE(value->'payment_configs', '{}'::jsonb) || jsonb_build_object($1::text, $2::jsonb),
       true
     ),
     updated_at = now()
     WHERE key = 'general'`,
    [code, JSON.stringify(cfg)]
  );
}

async function getActivePluginIds(tenantId: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  return res.rows.map((r: { plugin_id: string }) => r.plugin_id);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug);
    const activePlugins = await getActivePluginIds(tenant.id);

    const methods = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      return fetchTenantPaymentMethods(client, { activePlugins });
    });

    return NextResponse.json({ methods, active_plugins: activePlugins });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching payment methods:', error);
    return NextResponse.json({ error: 'Error al cargar métodos de pago' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'settings');
    const body = await request.json();
    const parsed = createMethodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (d.code.length < 2) {
      return NextResponse.json({ error: 'Código de método inválido' }, { status: 400 });
    }

    await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const existing = await client.query(`SELECT code FROM payment_methods WHERE code = $1`, [d.code]);
      if ((existing.rowCount || 0) > 0) {
        throw new Error(`El método con código "${d.code}" ya existe.`);
      }

      // Core Agnóstico: métodos propios creados desde el Core se almacenan en USD (plugin_id = NULL)
      await client.query(
        `INSERT INTO payment_methods (code, name, currency, is_active, plugin_id)
         VALUES ($1, $2, $3, $4, NULL)`,
        [d.code, d.name, 'USD', d.is_active]
      );

      const cfg = normalizeMethodConfig(d.code, {
        requires_reference: d.requires_reference,
        requires_proof: d.requires_proof,
        available_in_storefront: d.available_in_storefront,
        available_in_pos: d.available_in_pos,
        instructions: d.instructions,
        details: d.details,
      });

      await upsertPaymentMethodConfig(client, d.code, cfg);

      await writeTenantAuditLog(client, {
        actorId: staff.id,
        actorName: staff.full_name,
        actorRole: staff.role,
        action: 'PAYMENT_METHOD_CREATED',
        entity: 'payment_method',
        entityId: d.code,
        newData: { code: d.code, name: d.name, ...cfg },
      });
    });

    const activePlugins = await getActivePluginIds(tenant.id);
    const methods = await withTenantDb(tenant.db_schema_name, null, async (client) =>
      fetchTenantPaymentMethods(client, { activePlugins })
    );

    return NextResponse.json({ success: true, methods }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating payment method:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'settings');
    const body = await request.json();
    const parsed = updateMethodSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;

    await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const currentRes = await client.query(
        `SELECT code, name, currency, is_active FROM payment_methods WHERE code = $1`,
        [d.code]
      );
      if ((currentRes.rowCount || 0) === 0) {
        throw new Error(`Método de pago "${d.code}" no encontrado.`);
      }
      const prevRow = currentRes.rows[0];

      await client.query(
        `UPDATE payment_methods
         SET name = COALESCE($1, name),
             is_active = COALESCE($2, is_active)
         WHERE code = $3`,
        [d.name ?? null, d.is_active ?? null, d.code]
      );

      const settingsRes = await client.query(
        `SELECT value->'payment_configs'->$1 AS cfg FROM settings WHERE key = 'general' LIMIT 1`,
        [d.code]
      );
      const prevCfg = normalizeMethodConfig(d.code, settingsRes.rows[0]?.cfg);

      const nextCfg = normalizeMethodConfig(d.code, {
        requires_reference: d.requires_reference ?? prevCfg.requires_reference,
        requires_proof: d.requires_proof ?? prevCfg.requires_proof,
        available_in_storefront: d.available_in_storefront ?? prevCfg.available_in_storefront,
        available_in_pos: d.available_in_pos ?? prevCfg.available_in_pos,
        instructions: d.instructions ?? prevCfg.instructions,
        details: d.details ?? prevCfg.details,
      });

      await upsertPaymentMethodConfig(client, d.code, nextCfg);

      await writeTenantAuditLog(client, {
        actorId: staff.id,
        actorName: staff.full_name,
        actorRole: staff.role,
        action: 'PAYMENT_METHOD_UPDATED',
        entity: 'payment_method',
        entityId: d.code,
        oldData: { name: prevRow.name, is_active: prevRow.is_active, ...prevCfg },
        newData: {
          name: d.name ?? prevRow.name,
          is_active: d.is_active ?? prevRow.is_active,
          ...nextCfg,
        },
      });
    });

    const activePlugins = await getActivePluginIds(tenant.id);
    const methods = await withTenantDb(tenant.db_schema_name, null, async (client) =>
      fetchTenantPaymentMethods(client, { activePlugins })
    );

    return NextResponse.json({ success: true, methods });
  } catch (error: unknown) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating payment method:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'settings');
    const code = request.nextUrl.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Código requerido' }, { status: 400 });
    }

    if (SYSTEM_PAYMENT_CODES.has(code)) {
      return NextResponse.json(
        { error: 'Los métodos base del sistema no se eliminan; puedes desactivarlos.' },
        { status: 400 }
      );
    }

    await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const usedRes = await client.query(
        `SELECT COUNT(*) AS cnt FROM payments WHERE method = $1`,
        [code]
      );
      const usedCount = parseInt(usedRes.rows[0]?.cnt || '0', 10);

      if (usedCount > 0) {
        await client.query(`UPDATE payment_methods SET is_active = false WHERE code = $1`, [code]);
      } else {
        await client.query(`DELETE FROM payment_methods WHERE code = $1`, [code]);
        await client.query(
          `UPDATE settings
           SET value = jsonb_set(
             COALESCE(value, '{}'::jsonb),
             '{payment_configs}',
             COALESCE(value->'payment_configs', '{}'::jsonb) - $1::text,
             true
           ),
           updated_at = now()
           WHERE key = 'general'`,
          [code]
        );
      }

      await writeTenantAuditLog(client, {
        actorId: staff.id,
        actorName: staff.full_name,
        actorRole: staff.role,
        action: usedCount > 0 ? 'PAYMENT_METHOD_DEACTIVATED' : 'PAYMENT_METHOD_DELETED',
        entity: 'payment_method',
        entityId: code,
      });
    });

    const activePlugins = await getActivePluginIds(tenant.id);
    const methods = await withTenantDb(tenant.db_schema_name, null, async (client) =>
      fetchTenantPaymentMethods(client, { activePlugins })
    );

    return NextResponse.json({ success: true, methods });
  } catch (error: unknown) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting payment method:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    );
  }
}
