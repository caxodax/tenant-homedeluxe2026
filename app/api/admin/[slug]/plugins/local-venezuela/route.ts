import { NextRequest, NextResponse } from 'next/server';
import { pool, withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { invalidateTenantCache } from '@/lib/tenant';
import {
  fetchOfficialBcvRate,
  generateSeniatSalesBookCsv,
  OrderForSalesBook,
  calculateEffectiveRate,
  BcvRegimeMode,
} from '@/lib/plugins/local-venezuela';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const schema = tenant.db_schema_name;
    const format = request.nextUrl.searchParams.get('format');

    // 1. Exportación de Libro de Ventas SENIAT en CSV
    if (format === 'csv') {
      const [ordersData, settingsData] = await withTenantDb(schema, null, async (client) => {
        const oRes = await client.query(`
          SELECT id, order_number, created_at, status, customer_name, customer_id_number,
                 total_primary AS total_usd, total_secondary AS total_ves, exchange_rate_applied, subtotal_exempt_usd,
                 subtotal_taxable_usd, iva_amount_usd, igtf_amount_usd,
                 fiscal_invoice_number, fiscal_control_number
          FROM orders
          ORDER BY created_at ASC
          LIMIT 1000
        `);
        const sRes = await client.query(`
          SELECT business_name, value FROM settings WHERE key = 'general' LIMIT 1
        `);
        return [oRes.rows, sRes.rows[0]];
      });

      const emitterRif = settingsData?.value?.fiscal_rif || 'J-50123456-7';
      const emitterName = settingsData?.business_name || tenant.name;
      const period = new Date().toISOString().slice(0, 7);

      const csvContent = generateSeniatSalesBookCsv({
        orders: ordersData as OrderForSalesBook[],
        businessName: emitterName,
        rif: emitterRif,
        periodLabel: `PERIODO ${period}`,
      });

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Libro_Ventas_SENIAT_${period}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // 2. Información bimonetaria completa para la UI de Administración
    const [settingsRow, historyRows, pluginConfigRes] = await Promise.all([
      withTenantDb(schema, null, async (client) => {
        const s = await client.query(
          `SELECT exchange_rate, secondary_currency, primary_currency, value FROM settings WHERE key = 'general' LIMIT 1`
        );
        return s.rows[0];
      }),
      withTenantDb(schema, null, async (client) => {
        const h = await client.query(`
          SELECT id, date_rate, rate_ves_usd, rate_eur_usd, rate_usdt, source, created_at
          FROM exchange_rate_history
          ORDER BY date_rate DESC
          LIMIT 50
        `);
        return h.rows;
      }),
      pool.query(
        `SELECT is_active, config FROM platform.tenant_plugins WHERE tenant_id = $1 AND plugin_id = 'local_venezuela'`,
        [tenant.id]
      ),
    ]);

    const liveBcv = await fetchOfficialBcvRate();
    const isPluginActive = Boolean(pluginConfigRes.rows[0]?.is_active);
    const pluginConfig = pluginConfigRes.rows[0]?.config || {};
    const primaryCurrency = settingsRow?.primary_currency || 'USD';
    const fallbackRate = primaryCurrency === 'EUR' ? (liveBcv.eurRate || liveBcv.usdRate) : liveBcv.usdRate;

    // Calcular variación día contra día para el historial inmutable
    const historyWithVariation = historyRows.map((row: any, idx: number, arr: any[]) => {
      const prev = arr[idx + 1];
      let variation = 0;
      if (prev && parseFloat(prev.rate_ves_usd) > 0) {
        const curr = parseFloat(row.rate_ves_usd);
        const p = parseFloat(prev.rate_ves_usd);
        variation = Number((((curr - p) / p) * 100).toFixed(2));
      }
      return {
        ...row,
        variation,
      };
    });

    const bcvRegime = settingsRow?.value?.bcv_regime || {
      mode: 'bcv_direct',
      customRate: null,
    };

    return NextResponse.json({
      isPluginActive,
      primaryCurrency,
      activeRate: Number(settingsRow?.exchange_rate || fallbackRate),
      secondaryCurrency: settingsRow?.secondary_currency || 'VES',
      liveBcv,
      bcvRegime,
      igtfEnabled: Boolean(pluginConfig.igtf_enabled ?? true),
      fiscalRif: settingsRow?.value?.fiscal_rif || '',
      history: historyWithVariation,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[plugins/local-venezuela] GET error:', error);
    return NextResponse.json({ error: 'Error al consultar módulo de tasas' }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_base_currency'),
    currency: z.enum(['USD', 'EUR']),
  }),
  z.object({
    action: z.literal('set_regime'),
    mode: z.enum(['bcv_direct', 'bcv_average', 'bcv_cross_eur', 'custom_spread']),
    customRate: z.number().positive().optional().nullable(),
  }),
  z.object({
    action: z.literal('toggle_plugin'),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal('sync'),
  }),
  z.object({
    action: z.literal('manual'),
    rate: z.number().positive('La tasa debe ser mayor a cero'),
  }),
  z.object({
    action: z.literal('toggle_igtf'),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal('fiscal_info'),
    fiscalRif: z.string().min(6),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'settings');
    const schema = tenant.db_schema_name;

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const today = new Date().toISOString().split('T')[0];

    if (payload.action === 'set_base_currency') {
      const selectedCurr = payload.currency;
      const liveBcv = await fetchOfficialBcvRate();
      let newEffectiveRate = 0;

      await withTenantDb(schema, null, async (client) => {
        const sRes = await client.query(`SELECT value FROM settings WHERE key = 'general' LIMIT 1`);
        const regime = sRes.rows[0]?.value?.bcv_regime || { mode: 'bcv_direct' };
        newEffectiveRate = calculateEffectiveRate(regime, liveBcv, selectedCurr);

        if (selectedCurr === 'EUR') {
          await client.query(`
            INSERT INTO payment_methods (code, name, currency, is_active, plugin_id)
            VALUES ('CASH_EUR', 'Efectivo Euros (€)', 'LOCAL', true, 'local_venezuela')
            ON CONFLICT (code) DO UPDATE SET is_active = true, name = 'Efectivo Euros (€)';
          `);
        } else {
          await client.query(`
            UPDATE payment_methods SET is_active = false WHERE code = 'CASH_EUR';
          `);
        }

        await client.query(`
          UPDATE settings
          SET primary_currency = $1, exchange_rate = $2, secondary_currency = 'VES', updated_at = now()
          WHERE key = 'general'
        `, [selectedCurr, newEffectiveRate]);
      });

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        primaryCurrency: selectedCurr,
        activeRate: newEffectiveRate,
        message: `Moneda base cambiada a ${selectedCurr === 'EUR' ? 'Euros (€)' : 'Dólares ($)'} con tasa oficial correspondiente.`,
      });
    }

    if (payload.action === 'set_regime') {
      const liveBcv = await fetchOfficialBcvRate();
      let effectiveRate = 0;
      const regimeObj = {
        mode: payload.mode as BcvRegimeMode,
        customRate: payload.customRate || null,
        updated_at: new Date().toISOString(),
      };

      await withTenantDb(schema, null, async (client) => {
        const sRes = await client.query(`SELECT primary_currency FROM settings WHERE key = 'general' LIMIT 1`);
        const primaryCurrency = sRes.rows[0]?.primary_currency || 'USD';
        effectiveRate = calculateEffectiveRate(
          { mode: payload.mode as BcvRegimeMode, customRate: payload.customRate || undefined },
          liveBcv,
          primaryCurrency
        );

        await client.query(
          `UPDATE settings
           SET exchange_rate = $1,
               value = jsonb_set(COALESCE(value, '{}'::jsonb), '{bcv_regime}', $2::jsonb),
               updated_at = now()
           WHERE key = 'general'`,
          [effectiveRate, JSON.stringify(regimeObj)]
        );
      });

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        message: 'Régimen de conversión a Bolívares actualizado exitosamente',
        effectiveRate,
        regime: regimeObj,
      });
    }

    if (payload.action === 'toggle_plugin') {
      await pool.query(
        `SELECT platform.rpc_toggle_tenant_plugin($1, 'local_venezuela', $2, $3)`,
        [tenant.id, payload.active, JSON.stringify({ igtf_enabled: true, auto_bcv_sync: true })]
      );

      await withTenantDb(schema, null, async (client) => {
        await client.query(
          `UPDATE payment_methods SET is_active = $1, updated_at = now() WHERE plugin_id = 'local_venezuela'`,
          [payload.active]
        );

        if (!payload.active) {
          await client.query(`
            UPDATE settings
            SET exchange_rate = NULL, secondary_currency = NULL, updated_at = now()
            WHERE key = 'general'
          `);
        } else {
          const lastRateRes = await client.query(`
            SELECT rate_ves_usd FROM exchange_rate_history ORDER BY date_rate DESC LIMIT 1
          `);
          const restoredRate = Number(lastRateRes.rows[0]?.rate_ves_usd || 904.4485);
          await client.query(`
            UPDATE settings
            SET exchange_rate = $1, secondary_currency = 'VES', updated_at = now()
            WHERE key = 'general'
          `, [restoredRate]);
        }
      });

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        isPluginActive: payload.active,
        message: payload.active
          ? 'Plugin Local Venezuela activado exitosamente'
          : 'Plugin Local Venezuela desactivado. El comercio opera en modo agnóstico USD base',
      });
    }

    if (payload.action === 'sync') {
      const rateInfo = await fetchOfficialBcvRate();
      if (!rateInfo.usdRate || rateInfo.usdRate <= 0) {
        return NextResponse.json({ error: 'No se pudo obtener la tasa oficial' }, { status: 502 });
      }

      let effectiveRate = rateInfo.usdRate;

      await withTenantDb(schema, null, async (client) => {
        await client.query(`
          INSERT INTO exchange_rate_history (date_rate, rate_ves_usd, rate_eur_usd, rate_usdt, source)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (date_rate) DO UPDATE
          SET rate_ves_usd = EXCLUDED.rate_ves_usd,
              rate_eur_usd = EXCLUDED.rate_eur_usd,
              rate_usdt = EXCLUDED.rate_usdt,
              source = EXCLUDED.source,
              created_at = now()
        `, [today, rateInfo.usdRate, rateInfo.eurRate || null, rateInfo.usdtRate || null, rateInfo.source]);

        const sRes = await client.query(`SELECT primary_currency, value FROM settings WHERE key = 'general' LIMIT 1`);
        const baseCurr = sRes.rows[0]?.primary_currency || 'USD';
        const regime = sRes.rows[0]?.value?.bcv_regime || { mode: 'bcv_direct' };
        effectiveRate = calculateEffectiveRate(regime, rateInfo, baseCurr);

        await client.query(`
          UPDATE settings
          SET exchange_rate = $1, secondary_currency = 'VES', updated_at = now()
          WHERE key = 'general'
        `, [effectiveRate]);
      });

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        message: 'Tasa oficial BCV sincronizada exitosamente',
        rateInfo,
        effectiveRate,
      });
    }

    if (payload.action === 'manual') {
      const manualRate = Number(payload.rate.toFixed(4));
      const regimeObj = {
        mode: 'custom_spread',
        customRate: manualRate,
        updated_at: new Date().toISOString(),
      };

      await withTenantDb(schema, null, async (client) => {
        await client.query(`
          INSERT INTO exchange_rate_history (date_rate, rate_ves_usd, rate_eur_usd, source)
          VALUES ($1, $2, null, 'MANUAL_CONTINGENCIA')
          ON CONFLICT (date_rate) DO UPDATE
          SET rate_ves_usd = EXCLUDED.rate_ves_usd,
              source = EXCLUDED.source,
              created_at = now()
        `, [today, manualRate]);

        await client.query(`
          UPDATE settings
          SET exchange_rate = $1, secondary_currency = 'VES',
              value = jsonb_set(COALESCE(value, '{}'::jsonb), '{bcv_regime}', $2::jsonb),
              updated_at = now()
          WHERE key = 'general'
        `, [manualRate, JSON.stringify(regimeObj)]);
      });

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        message: 'Tasa manual de contingencia fijada exitosamente',
        rate: manualRate,
      });
    }

    if (payload.action === 'toggle_igtf') {
      await pool.query(`
        UPDATE platform.tenant_plugins
        SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{igtf_enabled}', $1::jsonb),
            updated_at = now()
        WHERE tenant_id = $2 AND plugin_id = 'local_venezuela'
      `, [JSON.stringify(payload.enabled), tenant.id]);

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        message: payload.enabled ? 'Régimen IGTF 3% activado' : 'Régimen IGTF 3% desactivado',
        igtfEnabled: payload.enabled,
      });
    }

    if (payload.action === 'fiscal_info') {
      await withTenantDb(schema, null, async (client) => {
        await client.query(`
          UPDATE settings
          SET value = jsonb_set(COALESCE(value, '{}'::jsonb), '{fiscal_rif}', $1::jsonb),
              updated_at = now()
          WHERE key = 'general'
        `, [JSON.stringify(payload.fiscalRif.toUpperCase())]);
      });

      await invalidateTenantCache(slug);

      return NextResponse.json({
        success: true,
        message: 'RIF de facturación guardado',
      });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[plugins/local-venezuela] POST error:', error);
    return NextResponse.json({ error: 'Error al procesar acción' }, { status: 500 });
  }
}
