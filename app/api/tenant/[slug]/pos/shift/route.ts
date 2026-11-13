import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { fetchTenantPaymentMethods, writeTenantAuditLog } from '@/lib/payment-methods';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const openShiftSchema = z.object({
  register_code: z.string().trim().default('POS-01'),
  opening_balance_primary: z.coerce.number().min(0, 'El fondo inicial debe ser >= 0').max(1000000),
});

const closeShiftSchema = z.object({
  shift_id: z.string().uuid('ID de turno inválido'),
  actual_by_method: z.record(z.string(), z.coerce.number().min(0)),
  cashier_notes: z.string().max(500).optional(),
});

async function getActivePlugins(tenantId: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT plugin_id FROM platform.tenant_plugins WHERE tenant_id = $1 AND is_active = true`,
    [tenantId]
  );
  return res.rows.map((r: { plugin_id: string }) => r.plugin_id);
}

async function computeShiftExpected(
  client: PoolClient,
  shift: { id: string; opened_at: string; opening_balance_primary: string | number },
  activePlugins: string[]
) {
  const methods = await fetchTenantPaymentMethods(client, {
    activePlugins,
    onlyActive: true,
    channel: 'pos',
  });

  const payAggRes = await client.query(
    `SELECT
       py.method,
       COUNT(DISTINCT o.id)::int AS orders_count,
       COALESCE(SUM(py.amount), 0) AS total_amount
     FROM payments py
     JOIN orders o ON o.id = py.order_id
     WHERE o.created_at >= $1
       AND o.status != 'CANCELLED'
       AND py.status != 'REJECTED'
     GROUP BY py.method`,
    [shift.opened_at]
  );

  const expectedByMethod: Record<string, number> = {};
  for (const m of methods) {
    expectedByMethod[m.code] = 0;
  }

  let salesCount = 0;
  let totalCollectedUsd = 0;
  for (const row of payAggRes.rows) {
    const val = Number(parseFloat(row.total_amount || '0').toFixed(2));
    expectedByMethod[row.method] = Number(((expectedByMethod[row.method] || 0) + val).toFixed(2));
    salesCount += Number(row.orders_count || 0);
    totalCollectedUsd += val;
  }

  const openingUsd = Number(parseFloat(String(shift.opening_balance_primary || '0')).toFixed(2));
  if (Object.prototype.hasOwnProperty.call(expectedByMethod, 'CASH_USD') || openingUsd > 0) {
    expectedByMethod.CASH_USD = Number(((expectedByMethod.CASH_USD || 0) + openingUsd).toFixed(2));
  }

  return {
    expectedByMethod,
    methods: methods.map((m) => ({ code: m.code, name: m.name })),
    salesCount,
    totalCollectedUsd: Number(totalCollectedUsd.toFixed(2)),
    openingUsd,
  };
}

function handleError(err: unknown) {
  if (err instanceof TenantAuthError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  console.error('POS Shift API error:', err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Error en operación de caja' },
    { status: 400 }
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const activePlugins = await getActivePlugins(tenant.id);

    const payload = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const [regRes, openRes, historyRes] = await Promise.all([
        client.query(`SELECT id, name, code FROM cash_registers WHERE is_active = true ORDER BY code ASC`),
        client.query(
          `SELECT cs.*, cr.name AS register_name, cr.code AS register_code
           FROM cash_shifts cs
           JOIN cash_registers cr ON cr.id = cs.register_id
           WHERE cs.status = 'OPEN'
           ORDER BY cs.opened_at DESC
           LIMIT 1`
        ),
        client.query(
          `SELECT cs.*, cr.name AS register_name, cr.code AS register_code
           FROM cash_shifts cs
           JOIN cash_registers cr ON cr.id = cs.register_id
           ORDER BY cs.opened_at DESC
           LIMIT 12`
        ),
      ]);

      const activeShift = openRes.rows[0] || null;
      let shiftSummary = null;
      if (activeShift) {
        shiftSummary = await computeShiftExpected(client, activeShift, activePlugins);
      }

      return {
        registers: regRes.rows,
        active_shift: activeShift,
        active_summary: shiftSummary,
        recent_shifts: historyRes.rows,
      };
    });

    return NextResponse.json(payload);
  } catch (err) {
    return handleError(err);
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
    const parsed = openShiftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const activePlugins = await getActivePlugins(tenant.id);

    const opened = await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const regRes = await client.query(
        `SELECT id, name, code FROM cash_registers WHERE code = $1 AND is_active = true LIMIT 1`,
        [parsed.data.register_code]
      );
      let register = regRes.rows[0];
      if (!register) {
        const fallbackReg = await client.query(
          `SELECT id, name, code FROM cash_registers WHERE is_active = true ORDER BY created_at ASC LIMIT 1`
        );
        register = fallbackReg.rows[0];
      }
      if (!register) {
        throw new Error('No hay cajas registradoras activas configuradas');
      }

      const existingOpen = await client.query(
        `SELECT id FROM cash_shifts WHERE register_id = $1 AND status = 'OPEN' LIMIT 1`,
        [register.id]
      );
      if ((existingOpen.rowCount || 0) > 0) {
        throw new Error(`La caja ${register.code} ya tiene un turno abierto.`);
      }

      // Resolver UUID válido en staff_profiles (cash_shifts.cashier_id NOT NULL FK)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id);
      let cashierUuid: string | null = null;
      if (isUuid) {
        const chk = await client.query(`SELECT id FROM staff_profiles WHERE id = $1 LIMIT 1`, [staff.id]);
        if ((chk.rowCount || 0) > 0) cashierUuid = staff.id;
      }
      if (!cashierUuid) {
        const ownerRes = await client.query(
          `SELECT id FROM staff_profiles WHERE is_active = true ORDER BY CASE WHEN role='OWNER' THEN 1 ELSE 2 END, created_at ASC LIMIT 1`
        );
        cashierUuid = ownerRes.rows[0]?.id || null;
      }
      if (!cashierUuid) {
        throw new Error('No se encontró un perfil de staff válido para abrir el turno');
      }

      const ins = await client.query(
        `INSERT INTO cash_shifts (
           register_id, cashier_id, cashier_name, status, opening_balance_primary
         ) VALUES ($1, $2, $3, 'OPEN', $4)
         RETURNING *`,
        [register.id, cashierUuid, staff.full_name, parsed.data.opening_balance_primary]
      );

      const newShift = { ...ins.rows[0], register_name: register.name, register_code: register.code };

      await writeTenantAuditLog(client, {
        actorId: cashierUuid,
        actorName: staff.full_name,
        actorRole: staff.role,
        action: 'POS_SHIFT_OPENED',
        entity: 'cash_shift',
        entityId: newShift.id,
        newData: {
          register_code: register.code,
          opening_balance_primary: parsed.data.opening_balance_primary,
        },
      });

      const summary = await computeShiftExpected(client, newShift, activePlugins);
      return { active_shift: newShift, active_summary: summary };
    });

    return NextResponse.json({ success: true, ...opened }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');

    const body = await request.json();
    const parsed = closeShiftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos para cierre de caja' },
        { status: 400 }
      );
    }

    const activePlugins = await getActivePlugins(tenant.id);

    const closeResult = await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const shiftRes = await client.query(
        `SELECT * FROM cash_shifts WHERE id = $1 AND status = 'OPEN' LIMIT 1`,
        [parsed.data.shift_id]
      );
      if ((shiftRes.rowCount || 0) === 0) {
        throw new Error('Turno de caja no encontrado o ya fue cerrado.');
      }
      const shift = shiftRes.rows[0];
      const computed = await computeShiftExpected(client, shift, activePlugins);

      // Asegurar simetría exacta de claves entre expected_by_method y actual_by_method
      const expectedAligned: Record<string, number> = { ...computed.expectedByMethod };
      const actualAligned: Record<string, number> = {};
      const allKeys = new Set([
        ...Object.keys(expectedAligned),
        ...Object.keys(parsed.data.actual_by_method),
      ]);

      for (const k of allKeys) {
        expectedAligned[k] = Number((expectedAligned[k] || 0).toFixed(2));
        actualAligned[k] = Number((parsed.data.actual_by_method[k] ?? 0).toFixed(2));
      }

      const rpcRes = await client.query(
        `SELECT platform.rpc_core_close_pos_shift($1::text, $2::uuid, $3::jsonb, $4::jsonb, $5::text) AS res`,
        [
          tenant.db_schema_name,
          parsed.data.shift_id,
          JSON.stringify(expectedAligned),
          JSON.stringify(actualAligned),
          parsed.data.cashier_notes || null,
        ]
      );

      await writeTenantAuditLog(client, {
        actorId: staff.id,
        actorName: staff.full_name,
        actorRole: staff.role,
        action: 'POS_SHIFT_CLOSED',
        entity: 'cash_shift',
        entityId: parsed.data.shift_id,
        newData: {
          expected_by_method: expectedAligned,
          actual_by_method: actualAligned,
          discrepancy_by_method: rpcRes.rows[0]?.res?.discrepancy_by_method,
        },
      });

      return rpcRes.rows[0]?.res;
    });

    return NextResponse.json({ success: true, result: closeResult });
  } catch (err) {
    return handleError(err);
  }
}
