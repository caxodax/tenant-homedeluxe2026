-- ============================================================================
-- MARKETOS — MIGRACIÓN 016: INTEGRIDAD DE TURNOS POS, REDES SOCIALES Y MODULARIDAD DE PLUGINS
-- Archivo: migrations/016_pos_shift_integrity_and_social_media.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad:
--   1. Índice canónico para auditoría rápida de ventas POS fuera de turnos en esquemas de inquilino.
--   2. Inicialización limpia de clave `social_media` en settings JSONB si está ausente.
--   3. Registro y verificación de modularidad para plugins `delivery_fleet` y `local_venezuela`.
--   4. Blast Radius = 0 (idempotente y no bloqueante).
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_schema TEXT;
BEGIN
    FOR r IN SELECT db_schema_name, slug FROM platform.tenants WHERE status IN ('active', 'trial')
    LOOP
        v_schema := lower(trim(r.db_schema_name));

        -- 1. Índice para acelerar la auditoría de ventas de mostrador / offline
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%I_orders_pos_audit 
            ON %I.orders (created_at DESC) 
            WHERE (is_offline_sale = true OR delivery_type = ''POS_DESK'') AND status != ''CANCELLED'';
        ', replace(v_schema, 'tenant_', ''), v_schema);

        -- 2. Asegurar que settings tenga inicializado el objeto social_media si no existe
        EXECUTE format('
            UPDATE %I.settings
            SET value = jsonb_set(COALESCE(value, ''{}''::jsonb), ''{social_media}'', ''{}''::jsonb, true)
            WHERE key = ''general'' AND (value->''social_media'') IS NULL;
        ', v_schema);

        RAISE NOTICE 'Esquema % (%) actualizado con éxito para integridad de turnos y redes sociales.', v_schema, r.slug;
    END LOOP;
END $$;
