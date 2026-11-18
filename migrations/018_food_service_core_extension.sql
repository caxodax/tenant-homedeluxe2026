-- ============================================================================
-- MARKETOS — MIGRACIÓN 018: EXTENSIONES CORE PARA FOOD SERVICE (DINE_IN, WAITER/KITCHEN, IS_HIDDEN)
-- Archivo: migrations/018_food_service_core_extension.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad:
--   1. Habilitar delivery_type = 'DINE_IN' en %I.orders.
--   2. Habilitar roles 'WAITER' y 'KITCHEN' en %I.staff_profiles.
--   3. Agregar columna 'is_hidden' en %I.categories para aislamiento de modificadores e insumos.
--   4. Blast Radius = 0 (idempotente, no bloqueante y reversible).
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_schema TEXT;
BEGIN
    FOR r IN SELECT db_schema_name, slug FROM platform.tenants WHERE status IN ('active', 'trial')
    LOOP
        v_schema := lower(trim(r.db_schema_name));

        -- 1. Actualizar CHECK de delivery_type en orders
        EXECUTE format('
            ALTER TABLE %1$I.orders DROP CONSTRAINT IF EXISTS orders_delivery_type_check;
            ALTER TABLE %1$I.orders ADD CONSTRAINT orders_delivery_type_check
                CHECK (delivery_type IN (''PICKUP'', ''POS_DESK'', ''DELIVERY'', ''DINE_IN''));
        ', v_schema);

        -- 2. Actualizar CHECK de roles en staff_profiles
        EXECUTE format('
            ALTER TABLE %1$I.staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_role_check;
            ALTER TABLE %1$I.staff_profiles ADD CONSTRAINT staff_profiles_role_check
                CHECK (role IN (''OWNER'', ''MANAGER'', ''CASHIER'', ''INVENTORY'', ''DELIVERY'', ''WAITER'', ''KITCHEN''));
        ', v_schema);

        -- 3. Agregar columna is_hidden en categories
        EXECUTE format('
            ALTER TABLE %1$I.categories ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
            CREATE INDEX IF NOT EXISTS idx_%2$I_categories_visible ON %1$I.categories(is_active, is_hidden);
        ', v_schema, replace(v_schema, 'tenant_', ''));

        RAISE NOTICE 'Esquema % (%) adaptado con éxito para extensiones de Food Service (DINE_IN, WAITER, KITCHEN).', v_schema, r.slug;
    END LOOP;
END $$;
