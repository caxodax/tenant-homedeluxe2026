import { NextRequest, NextResponse } from 'next/server';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { hasPermission } from '@/lib/auth/rbac';
import {
  getZonesAndTables,
  FsZoneInputSchema,
  FsTableInputSchema,
} from '@/lib/plugins/food-service';
import { withTenantDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');

    const [zones, meta] = await Promise.all([
      getZonesAndTables(tenant.db_schema_name),
      withTenantDb(tenant.db_schema_name, null, async (client) => {
        const sRes = await client.query(
          `SELECT exchange_rate, secondary_currency, primary_currency FROM settings WHERE key = 'general' LIMIT 1`
        );
        let rate = Number(sRes.rows[0]?.exchange_rate || 0);
        if (!rate || rate <= 0) {
          try {
            const hRes = await client.query(
              `SELECT rate_ves_usd FROM exchange_rate_history ORDER BY date_rate DESC LIMIT 1`
            );
            rate = Number(hRes.rows[0]?.rate_ves_usd || 0);
          } catch {
            // tabla exchange_rate_history opcional si local_venezuela no está activo
          }
        }
        const pmRes = await client.query(
          `SELECT code, name, currency FROM payment_methods WHERE is_active = true ORDER BY name ASC`
        );
        let pagoMovilConfig: Record<string, unknown> | null = null;
        try {
          const pmSettingsRes = await client.query(
            `SELECT value FROM settings WHERE key IN ('payment_methods', 'pago_movil') LIMIT 1`
          );
          if (pmSettingsRes.rows[0]?.value) {
            const val = pmSettingsRes.rows[0].value;
            pagoMovilConfig = val?.pago_movil || val || null;
          }
        } catch {
          // opcional
        }
        return {
          exchange_rate: rate > 0 ? rate : 0,
          primary_currency: sRes.rows[0]?.primary_currency || 'USD',
          secondary_currency: sRes.rows[0]?.secondary_currency || 'VES',
          payment_methods: pmRes.rows.map((r) => ({
            ...r,
            config: r.code === 'PAGO_MOVIL' ? pagoMovilConfig : undefined,
          })),
        };
      }),
    ]);

    const canManageTables = hasPermission(staff.role, 'settings', staff.custom_permissions);
    const canValidatePayments = staff.role !== 'WAITER';

    return NextResponse.json({
      success: true,
      zones,
      can_manage_tables: canManageTables,
      can_validate_payments: canValidatePayments,
      staff_role: staff.role,
      exchange_rate: meta.exchange_rate,
      primary_currency: meta.primary_currency,
      secondary_currency: meta.secondary_currency,
      payment_methods: meta.payment_methods,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching food service tables:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
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

    if (body.type === 'zone') {
      const parsed = FsZoneInputSchema.safeParse(body.data);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Datos de zona inválidos', details: parsed.error.flatten() }, { status: 400 });
      }

      const zone = await withTenantDb(tenant.db_schema_name, null, async (client) => {
        const res = await client.query(
          `INSERT INTO fs_zones (name, sort_order, is_active) VALUES ($1, $2, $3) RETURNING *`,
          [parsed.data.name, parsed.data.sort_order, parsed.data.is_active]
        );
        return res.rows[0];
      });

      return NextResponse.json({ success: true, zone });
    }

    // Creación de Mesa
    const parsedTable = FsTableInputSchema.safeParse(body.data || body);
    if (!parsedTable.success) {
      return NextResponse.json({ error: 'Datos de mesa inválidos', details: parsedTable.error.flatten() }, { status: 400 });
    }

    const table = await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const res = await client.query(
        `INSERT INTO fs_tables (zone_id, label, seats, status, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          parsedTable.data.zone_id,
          parsedTable.data.label,
          parsedTable.data.seats,
          parsedTable.data.status,
          parsedTable.data.is_active,
        ]
      );
      return res.rows[0];
    });

    return NextResponse.json({ success: true, table });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating food service table/zone:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'table';
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    if (type === 'zone') {
      await withTenantDb(tenant.db_schema_name, null, async (client) => {
        const busy = await client.query(
          `SELECT COUNT(*) FROM fs_tables WHERE zone_id = $1 AND is_active = true AND status != 'FREE'`,
          [id]
        );
        if (Number(busy.rows[0].count) > 0) {
          throw new TenantAuthError('No se puede eliminar una zona con mesas ocupadas o pendientes.', 400);
        }
        await client.query(`UPDATE fs_tables SET is_active = false WHERE zone_id = $1`, [id]);
        await client.query(`UPDATE fs_zones SET is_active = false WHERE id = $1`, [id]);
      });
      return NextResponse.json({ success: true });
    }

    await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const check = await client.query(`SELECT status FROM fs_tables WHERE id = $1`, [id]);
      if ((check.rowCount || 0) === 0) {
        throw new TenantAuthError('Mesa no encontrada', 404);
      }
      if (check.rows[0].status !== 'FREE') {
        throw new TenantAuthError('Solo se pueden eliminar mesas en estado LIBRE.', 400);
      }
      await client.query(`UPDATE fs_tables SET is_active = false WHERE id = $1`, [id]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error deleting food service table/zone:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
