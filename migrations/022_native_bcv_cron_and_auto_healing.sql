-- ============================================================================
-- MIGRACIÓN 022: SINCRONIZACIÓN NATIVA RESILIENTE DE TASAS BCV EN SUPABASE (pg_cron + pg_net)
-- Archivo: migrations/022_native_bcv_cron_and_auto_healing.sql
-- ============================================================================

-- 1. Función RPC para propagar tasas a todos los tenants con local_venezuela activo
CREATE OR REPLACE FUNCTION platform.rpc_apply_bcv_rate_all_tenants(
    p_usd NUMERIC,
    p_eur NUMERIC DEFAULT NULL,
    p_usdt NUMERIC DEFAULT NULL,
    p_date DATE DEFAULT CURRENT_DATE,
    p_source TEXT DEFAULT 'BCV Oficial (Nativo Supabase)'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant RECORD;
    v_updated_count INT := 0;
BEGIN
    IF p_usd IS NULL OR p_usd <= 0 THEN
        RAISE EXCEPTION 'Tasa USD inválida: %', p_usd;
    END IF;

    FOR v_tenant IN 
        SELECT tn.id, tn.slug, tn.db_schema_name
        FROM platform.tenants tn
        JOIN platform.tenant_plugins tp ON tp.tenant_id = tn.id
        WHERE tp.plugin_id = 'local_venezuela' AND tp.is_active = true
    LOOP
        -- 1. Insertar o actualizar en el historial inmutable del tenant
        EXECUTE format('
            INSERT INTO %I.exchange_rate_history (date_rate, rate_ves_usd, rate_eur_usd, rate_usdt, source, created_at)
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT (date_rate) DO UPDATE
            SET rate_ves_usd = EXCLUDED.rate_ves_usd,
                rate_eur_usd = COALESCE(EXCLUDED.rate_eur_usd, %I.exchange_rate_history.rate_eur_usd),
                rate_usdt = COALESCE(EXCLUDED.rate_usdt, %I.exchange_rate_history.rate_usdt),
                source = EXCLUDED.source,
                created_at = now();
        ', v_tenant.db_schema_name, v_tenant.db_schema_name, v_tenant.db_schema_name)
        USING p_date, p_usd, p_eur, p_usdt, p_source;

        -- 2. Actualizar configuración activa del comercio
        EXECUTE format('
            UPDATE %I.settings
            SET exchange_rate = $1,
                secondary_currency = ''VES'',
                updated_at = now()
            WHERE key = ''general'';
        ', v_tenant.db_schema_name)
        USING p_usd;

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_tenants_count', v_updated_count,
        'usd_rate', p_usd,
        'eur_rate', p_eur,
        'usdt_rate', p_usdt,
        'date', p_date
    );
END;
$$;

-- 2. Disparador de petición HTTP nativo (sin depender de un host web inexistente)
CREATE OR REPLACE FUNCTION public.trigger_bcv_rate_sync(target_url TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    webhook_url TEXT;
BEGIN
    -- 1. Petición directa a la API de tasas oficiales vía pg_net
    PERFORM net.http_get(
        url := 'https://bcv.today/api/v1/rate.json',
        headers := jsonb_build_object('Accept', 'application/json')
    );

    -- 2. Si existe un webhook o dominio configurado explícitamente, también lo invoca
    webhook_url := COALESCE(
        target_url,
        current_setting('app.settings.bcv_sync_url', true)
    );

    IF webhook_url IS NOT NULL AND webhook_url <> '' THEN
        PERFORM net.http_get(
            url := webhook_url,
            headers := jsonb_build_object(
                'Accept', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.cron_secret', true), '')
            )
        );
    END IF;
END;
$$;

-- 3. Función procesadora de la respuesta HTTP recibida en net._http_response
CREATE OR REPLACE FUNCTION public.process_and_apply_bcv_rates()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_row RECORD;
    v_json JSONB;
    v_usd NUMERIC;
    v_eur NUMERIC;
    v_date DATE;
BEGIN
    -- Obtener la última respuesta exitosa que contenga la tasa USD
    SELECT id, content INTO v_row
    FROM net._http_response
    WHERE status_code = 200 
      AND content IS NOT NULL
      AND content LIKE '%"USD"%'
    ORDER BY id DESC
    LIMIT 1;

    IF v_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'No se encontró respuesta HTTP 200 reciente de tasas.');
    END IF;

    BEGIN
        v_json := v_row.content::jsonb;
        v_usd := (v_json->>'USD')::numeric;
        v_eur := (v_json->>'EUR')::numeric;
        v_date := COALESCE((v_json->>'effective_date')::date, (v_json->>'date')::date, CURRENT_DATE);
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Error parseando JSON de tasas: ' || SQLERRM);
    END;

    IF v_usd IS NULL OR v_usd <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tasa USD en JSON es nula o inválida');
    END IF;

    -- Aplicar a todos los comercios
    RETURN platform.rpc_apply_bcv_rate_all_tenants(v_usd, v_eur, NULL, v_date, 'BCV Oficial (Nativo Supabase)');
END;
$$;

-- 4. Programación en pg_cron:
--    7:00 AM VET (11:00 UTC): Dispara la consulta HTTP
--    7:01 AM VET (11:01 UTC): Procesa la respuesta y actualiza a todos los tenants
--    1:00 PM VET (17:00 UTC): Segundo refresco diario para cierre BCV
--    1:01 PM VET (17:01 UTC): Procesa el segundo refresco
DO $$
BEGIN
    -- Limpiar trabajos previos
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketos-daily-bcv-sync') THEN
        PERFORM cron.unschedule('marketos-daily-bcv-sync');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketos-daily-bcv-process') THEN
        PERFORM cron.unschedule('marketos-daily-bcv-process');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketos-afternoon-bcv-sync') THEN
        PERFORM cron.unschedule('marketos-afternoon-bcv-sync');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketos-afternoon-bcv-process') THEN
        PERFORM cron.unschedule('marketos-afternoon-bcv-process');
    END IF;

    -- Mañana: 7:00 AM VET (11:00 UTC)
    PERFORM cron.schedule('marketos-daily-bcv-sync', '0 11 * * *', 'SELECT public.trigger_bcv_rate_sync();');
    PERFORM cron.schedule('marketos-daily-bcv-process', '1 11 * * *', 'SELECT public.process_and_apply_bcv_rates();');

    -- Tarde: 1:00 PM VET (17:00 UTC)
    PERFORM cron.schedule('marketos-afternoon-bcv-sync', '0 17 * * *', 'SELECT public.trigger_bcv_rate_sync();');
    PERFORM cron.schedule('marketos-afternoon-bcv-process', '1 17 * * *', 'SELECT public.process_and_apply_bcv_rates();');
END;
$$;
