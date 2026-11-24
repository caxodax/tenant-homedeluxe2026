-- ============================================================================
-- MIGRACIÓN 029: Generadores DDL Modulares de Plugins (lv_ddl y cw_ddl)
-- Resuelve: error function platform.lv_ddl_local_venezuela(text) does not exist
-- ============================================================================

-- 1. Generador DDL para plugin: local_venezuela
CREATE OR REPLACE FUNCTION platform.lv_ddl_local_venezuela(p_schema TEXT)
RETURNS void AS $$
DECLARE
    v_schema TEXT;
    v_short TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;
    v_short := replace(v_schema, 'tenant_', '');

    -- Métodos de cobro locales en payment_methods del inquilino
    EXECUTE format('
        INSERT INTO %I.payment_methods (code, name, currency, is_active, plugin_id)
        VALUES 
            (''PAGO_MOVIL'', ''Pago Móvil C2P / P2P'', ''VES'', true, ''local_venezuela''),
            (''CASH_EUR'', ''Efectivo Euros (€)'', ''LOCAL'', true, ''local_venezuela'')
        ON CONFLICT (code) DO UPDATE SET is_active = true, name = EXCLUDED.name;
    ', v_schema);

    -- Secuencias fiscales atómicas
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.fiscal_sequences (
            document_type TEXT PRIMARY KEY,
            last_sequence INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        INSERT INTO %I.fiscal_sequences (document_type, last_sequence)
        VALUES (''INVOICE'', 0), (''CREDIT_NOTE'', 0), (''DEBIT_NOTE'', 0), (''DISPATCH_GUIDE'', 0)
        ON CONFLICT (document_type) DO NOTHING;
    ', v_schema, v_schema);

    -- Documentos fiscales legales SENIAT
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.fiscal_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id UUID REFERENCES %I.orders(id) ON DELETE SET NULL,
            document_type TEXT NOT NULL CHECK (document_type IN (''INVOICE'', ''CREDIT_NOTE'', ''DEBIT_NOTE'', ''DISPATCH_GUIDE'')),
            document_number TEXT NOT NULL UNIQUE,
            control_number TEXT,
            customer_name TEXT NOT NULL,
            customer_id_doc TEXT NOT NULL,
            customer_address TEXT,
            items JSONB NOT NULL DEFAULT ''[]''::jsonb,
            subtotal_exempt NUMERIC(12,2) NOT NULL DEFAULT 0.00,
            subtotal_taxable NUMERIC(12,2) NOT NULL DEFAULT 0.00,
            iva_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 16.00,
            iva_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
            igtf_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 3.00,
            igtf_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
            total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
            total_ves NUMERIC(16,2) NOT NULL DEFAULT 0.00,
            exchange_rate_applied NUMERIC(12,4) NOT NULL,
            status TEXT NOT NULL DEFAULT ''ISSUED'' CHECK (status IN (''ISSUED'', ''ANNULLED'')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%I_fiscal_doc_num ON %I.fiscal_documents(document_number);
    ', v_schema, v_schema, v_short, v_schema);

    -- Historial de tasas de cambio oficiales
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.exchange_rate_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            date_rate DATE NOT NULL UNIQUE,
            rate_ves_usd NUMERIC(12,4) NOT NULL,
            rate_eur_usd NUMERIC(12,4),
            rate_usdt NUMERIC(12,4),
            source TEXT NOT NULL DEFAULT ''BCV_TODAY'',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    ', v_schema);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;

-- 2. Generador DDL para plugin: craft_workshop
CREATE OR REPLACE FUNCTION platform.cw_ddl_craft_workshop(p_schema TEXT)
RETURNS void AS $$
DECLARE
    v_schema TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.craft_materials (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT ''sublimacion'',
            sku TEXT UNIQUE,
            pack_quantity NUMERIC(10,3) NOT NULL DEFAULT 1.000 CHECK (pack_quantity > 0),
            pack_price_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            unit_cost_base NUMERIC(10,4) GENERATED ALWAYS AS (pack_price_base / NULLIF(pack_quantity, 0)) STORED,
            unit_measure TEXT NOT NULL DEFAULT ''UNIDAD'',
            is_sheet_material BOOLEAN NOT NULL DEFAULT false,
            default_width_cm NUMERIC(10,2),
            default_height_cm NUMERIC(10,2),
            cost_per_m2 NUMERIC(10,4),
            stock_packs NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    ', v_schema);

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.craft_recipes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id UUID REFERENCES %I.products(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            sku TEXT,
            technique TEXT NOT NULL DEFAULT ''sublimacion'',
            is_dimensional BOOLEAN NOT NULL DEFAULT false,
            default_width_cm NUMERIC(10,2),
            default_height_cm NUMERIC(10,2),
            area_m2 NUMERIC(10,4) GENERATED ALWAYS AS (
                CASE WHEN is_dimensional THEN round((default_width_cm * default_height_cm / 10000.0), 4) ELSE NULL END
            ) STORED,
            pricing_formula_type TEXT NOT NULL DEFAULT ''STANDARD'' CHECK (pricing_formula_type IN (''STANDARD'', ''AREA_M2'', ''PERIMETER_LINEAR'', ''FIXED_PLUS_AREA'')),
            materials_cost_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            waste_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00,
            labor_cost_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            direct_cost_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 30.00,
            selling_price_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            deposit_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    ', v_schema, v_schema);

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.craft_recipe_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            recipe_id UUID NOT NULL REFERENCES %I.craft_recipes(id) ON DELETE CASCADE,
            material_id UUID REFERENCES %I.craft_materials(id) ON DELETE RESTRICT,
            custom_name TEXT NOT NULL,
            qty_to_use NUMERIC(10,3) NOT NULL DEFAULT 1.000,
            cost_used_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
    ', v_schema, v_schema, v_schema);

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.craft_quotes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            quote_number TEXT NOT NULL UNIQUE,
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            items JSONB NOT NULL DEFAULT ''[]''::jsonb,
            total_base NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            deposit_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00,
            deposit_required_base NUMERIC(10,2) GENERATED ALWAYS AS (round(total_base * (deposit_percentage / 100.0), 2)) STORED,
            status TEXT NOT NULL DEFAULT ''draft'' CHECK (status IN (''draft'', ''sent'', ''accepted'', ''converted'')),
            converted_order_id UUID REFERENCES %I.orders(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    ', v_schema, v_schema);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;
