import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { fetchOfficialBcvRate } from '@/lib/plugins/local-venezuela';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Validación de seguridad opcional si CRON_SECRET está definido en env
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const rateInfo = await fetchOfficialBcvRate();
    if (!rateInfo.usdRate || rateInfo.usdRate <= 0) {
      return NextResponse.json({ error: 'No se pudo obtener la tasa oficial' }, { status: 502 });
    }

    // Buscar todos los inquilinos con el plugin local_venezuela activo
    const tenantsRes = await pool.query(`
      SELECT t.id, t.slug, t.db_schema_name
      FROM platform.tenants t
      JOIN platform.tenant_plugins tp ON tp.tenant_id = t.id
      WHERE tp.plugin_id = 'local_venezuela' AND tp.is_active = true
    `);

    const updatedTenants: string[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const tenant of tenantsRes.rows) {
      await withTenantDb(tenant.db_schema_name, null, async (client) => {
        // 1. Guardar o actualizar en historial inmutable de tasas
        await client.query(`
          INSERT INTO exchange_rate_history (date_rate, rate_ves_usd, rate_eur_usd, source)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (date_rate) DO UPDATE
          SET rate_ves_usd = EXCLUDED.rate_ves_usd,
              rate_eur_usd = EXCLUDED.rate_eur_usd,
              source = EXCLUDED.source,
              created_at = now()
        `, [today, rateInfo.usdRate, rateInfo.eurRate || null, rateInfo.source]);

        // 2. Actualizar configuración activa del comercio (según su moneda base USD o EUR)
        const sRes = await client.query(`SELECT primary_currency FROM settings WHERE key = 'general' LIMIT 1`);
        const baseCurr = sRes.rows[0]?.primary_currency || 'USD';
        const targetRate = baseCurr === 'EUR' && rateInfo.eurRate ? rateInfo.eurRate : rateInfo.usdRate;

        await client.query(`
          UPDATE settings
          SET exchange_rate = $1,
              secondary_currency = 'VES',
              updated_at = now()
          WHERE key = 'general'
        `, [targetRate]);
      });

      try {
        revalidateTag(`tenant-${tenant.slug}`, 'max');
        revalidateTag(`tenant-settings-${tenant.slug}`, 'max');
      } catch {}

      updatedTenants.push(tenant.slug);
    }

    return NextResponse.json({
      success: true,
      rate: rateInfo.usdRate,
      eur: rateInfo.eurRate,
      usdt: rateInfo.usdtRate,
      source: rateInfo.source,
      timestamp: rateInfo.timestamp,
      updatedTenants,
    });
  } catch (error) {
    console.error('[cron/bcv-sync] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno de sincronización' },
      { status: 500 }
    );
  }
}
