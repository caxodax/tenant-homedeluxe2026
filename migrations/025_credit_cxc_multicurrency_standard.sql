-- ============================================================================
-- MARKETOS — MIGRACIÓN 025: ESTÁNDAR MULTIMONEDA CANÓNICO PLUGIN CREDIT_CXC
-- Archivo: migrations/025_credit_cxc_multicurrency_standard.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad:
--   1. Asegurar columnas canónicas `*_primary` en cxc_accounts, cxc_customer_profiles,
--      cxc_financing_tranches y cxc_payments para todo tenant activo.
--   2. Respaldar retrocompatibilidad absoluta mediante triggers de sincronización
--      bidireccional entre `*_primary` y las columnas legadas `*_usd` (Blast Radius = 0).
--   3. Actualizar la función DDL generadora `platform.cxc_ddl_credit` en plataforma.
-- ============================================================================

-- 1. Función de sincronización bidireccional en plataforma
CREATE OR REPLACE FUNCTION platform.fn_sync_cxc_accounts_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.original_amount_primary := COALESCE(NEW.original_amount_primary, NEW.original_amount_usd, 0.00);
    NEW.original_amount_usd := NEW.original_amount_primary;

    NEW.down_payment_primary := COALESCE(NEW.down_payment_primary, NEW.down_payment_usd, 0.00);
    NEW.down_payment_usd := NEW.down_payment_primary;

    NEW.financed_amount_primary := COALESCE(NEW.financed_amount_primary, NEW.financed_amount_usd, 0.00);
    NEW.financed_amount_usd := NEW.financed_amount_primary;

    NEW.balance_primary := COALESCE(NEW.balance_primary, NEW.balance_usd, 0.00);
    NEW.balance_usd := NEW.balance_primary;

    NEW.total_paid_primary := COALESCE(NEW.total_paid_primary, NEW.total_paid_usd, 0.00);
    NEW.total_paid_usd := NEW.total_paid_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxc_profiles_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.credit_limit_primary := COALESCE(NEW.credit_limit_primary, NEW.credit_limit_usd, 0.00);
    NEW.credit_limit_usd := NEW.credit_limit_primary;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxc_tranches_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.expected_amount_primary := COALESCE(NEW.expected_amount_primary, NEW.expected_amount_usd, 0.00);
    NEW.expected_amount_usd := NEW.expected_amount_primary;

    NEW.settled_amount_primary := COALESCE(NEW.settled_amount_primary, NEW.settled_amount_usd, 0.00);
    NEW.settled_amount_usd := NEW.settled_amount_primary;

    NEW.fee_amount_primary := COALESCE(NEW.fee_amount_primary, NEW.fee_amount_usd, 0.00);
    NEW.fee_amount_usd := NEW.fee_amount_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxc_payments_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount_primary := COALESCE(NEW.amount_primary, NEW.amount_usd, 0.00);
    NEW.amount_usd := NEW.amount_primary;

    NEW.balance_before_primary := COALESCE(NEW.balance_before_primary, NEW.balance_before_usd, 0.00);
    NEW.balance_before_usd := NEW.balance_before_primary;

    NEW.balance_after_primary := COALESCE(NEW.balance_after_primary, NEW.balance_after_usd, 0.00);
    NEW.balance_after_usd := NEW.balance_after_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Propagar columnas y triggers a todos los esquemas tenant con credit_cxc
DO $$
DECLARE
    r RECORD;
    v_schema TEXT;
BEGIN
    FOR r IN SELECT db_schema_name, slug FROM platform.tenants WHERE status IN ('active', 'trial')
    LOOP
        v_schema := lower(trim(r.db_schema_name));

        -- Verificar si el esquema tiene tablas de cxc
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = v_schema AND table_name = 'cxc_accounts') THEN

            -- A. cxc_accounts
            EXECUTE format('
                ALTER TABLE %1$I.cxc_accounts
                    ADD COLUMN IF NOT EXISTS original_amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS down_payment_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS financed_amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS balance_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS total_paid_primary NUMERIC(10,2);

                UPDATE %1$I.cxc_accounts SET
                    original_amount_primary = COALESCE(original_amount_primary, original_amount_usd, 0.00),
                    down_payment_primary = COALESCE(down_payment_primary, down_payment_usd, 0.00),
                    financed_amount_primary = COALESCE(financed_amount_primary, financed_amount_usd, 0.00),
                    balance_primary = COALESCE(balance_primary, balance_usd, 0.00),
                    total_paid_primary = COALESCE(total_paid_primary, total_paid_usd, 0.00)
                WHERE original_amount_primary IS NULL;

                ALTER TABLE %1$I.cxc_accounts
                    ALTER COLUMN original_amount_primary SET NOT NULL,
                    ALTER COLUMN down_payment_primary SET NOT NULL,
                    ALTER COLUMN down_payment_primary SET DEFAULT 0.00,
                    ALTER COLUMN financed_amount_primary SET NOT NULL,
                    ALTER COLUMN balance_primary SET NOT NULL,
                    ALTER COLUMN total_paid_primary SET NOT NULL,
                    ALTER COLUMN total_paid_primary SET DEFAULT 0.00;

                DROP TRIGGER IF EXISTS trg_sync_cxc_accounts_currency ON %1$I.cxc_accounts;
                CREATE TRIGGER trg_sync_cxc_accounts_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxc_accounts
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_accounts_multicurrency();
            ', v_schema);

            -- B. cxc_customer_profiles
            EXECUTE format('
                ALTER TABLE %1$I.cxc_customer_profiles
                    ADD COLUMN IF NOT EXISTS credit_limit_primary NUMERIC(10,2);

                UPDATE %1$I.cxc_customer_profiles SET
                    credit_limit_primary = COALESCE(credit_limit_primary, credit_limit_usd, 0.00)
                WHERE credit_limit_primary IS NULL;

                ALTER TABLE %1$I.cxc_customer_profiles
                    ALTER COLUMN credit_limit_primary SET NOT NULL,
                    ALTER COLUMN credit_limit_primary SET DEFAULT 0.00;

                DROP TRIGGER IF EXISTS trg_sync_cxc_profiles_currency ON %1$I.cxc_customer_profiles;
                CREATE TRIGGER trg_sync_cxc_profiles_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxc_customer_profiles
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_profiles_multicurrency();
            ', v_schema);

            -- C. cxc_financing_tranches
            EXECUTE format('
                ALTER TABLE %1$I.cxc_financing_tranches
                    ADD COLUMN IF NOT EXISTS expected_amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS settled_amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS fee_amount_primary NUMERIC(10,2);

                UPDATE %1$I.cxc_financing_tranches SET
                    expected_amount_primary = COALESCE(expected_amount_primary, expected_amount_usd, 0.00),
                    settled_amount_primary = COALESCE(settled_amount_primary, settled_amount_usd, 0.00),
                    fee_amount_primary = COALESCE(fee_amount_primary, fee_amount_usd, 0.00)
                WHERE expected_amount_primary IS NULL;

                ALTER TABLE %1$I.cxc_financing_tranches
                    ALTER COLUMN expected_amount_primary SET NOT NULL,
                    ALTER COLUMN settled_amount_primary SET NOT NULL,
                    ALTER COLUMN settled_amount_primary SET DEFAULT 0.00,
                    ALTER COLUMN fee_amount_primary SET NOT NULL,
                    ALTER COLUMN fee_amount_primary SET DEFAULT 0.00;

                DROP TRIGGER IF EXISTS trg_sync_cxc_tranches_currency ON %1$I.cxc_financing_tranches;
                CREATE TRIGGER trg_sync_cxc_tranches_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxc_financing_tranches
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_tranches_multicurrency();
            ', v_schema);

            -- D. cxc_payments
            EXECUTE format('
                ALTER TABLE %1$I.cxc_payments
                    ADD COLUMN IF NOT EXISTS amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS balance_before_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS balance_after_primary NUMERIC(10,2);

                UPDATE %1$I.cxc_payments SET
                    amount_primary = COALESCE(amount_primary, amount_usd, 0.00),
                    balance_before_primary = COALESCE(balance_before_primary, balance_before_usd, 0.00),
                    balance_after_primary = COALESCE(balance_after_primary, balance_after_usd, 0.00)
                WHERE amount_primary IS NULL;

                ALTER TABLE %1$I.cxc_payments
                    ALTER COLUMN amount_primary SET NOT NULL,
                    ALTER COLUMN balance_before_primary SET NOT NULL,
                    ALTER COLUMN balance_after_primary SET NOT NULL;

                DROP TRIGGER IF EXISTS trg_sync_cxc_payments_currency ON %1$I.cxc_payments;
                CREATE TRIGGER trg_sync_cxc_payments_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxc_payments
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_payments_multicurrency();
            ', v_schema);

            RAISE NOTICE 'Esquema % (%) migrado con éxito al estándar multimoneda _primary en CxC.', v_schema, r.slug;
        END IF;
    END LOOP;
END $$;

-- 3. Actualizar función DDL canónica de plataforma para nuevos inquilinos
CREATE OR REPLACE FUNCTION platform.cxc_ddl_credit(p_schema TEXT)
RETURNS void AS $$
DECLARE
    v_schema TEXT;
    v_short TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema de inquilino "%" inválido para DDL de crédito.', p_schema;
    END IF;
    v_short := replace(v_schema, 'tenant_', '');

    EXECUTE format('
        -- Secuencias de numeración correlativa
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxc_account_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxc_receipt_seq START WITH 1 INCREMENT BY 1;

        -- 1. Expediente y perfil crediticio del cliente
        CREATE TABLE IF NOT EXISTS %1$I.cxc_customer_profiles (
            customer_id UUID PRIMARY KEY REFERENCES %1$I.customers(id) ON DELETE CASCADE,
            credit_limit_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (credit_limit_primary >= 0.00),
            credit_limit_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (credit_limit_usd >= 0.00),
            max_term_days INTEGER NOT NULL DEFAULT 30 CHECK (max_term_days > 0),
            is_blocked BOOLEAN NOT NULL DEFAULT false,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- 2. Cuentas por Cobrar (Crédito Directo, Apartados y Cashea/BNPL)
        CREATE TABLE IF NOT EXISTS %1$I.cxc_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_number TEXT NOT NULL UNIQUE,
            order_id UUID REFERENCES %1$I.orders(id) ON DELETE SET NULL,
            customer_id UUID NOT NULL REFERENCES %1$I.customers(id) ON DELETE RESTRICT,
            seller_id UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            account_type TEXT NOT NULL DEFAULT ''DIRECT_CREDIT'' CHECK (account_type IN (''DIRECT_CREDIT'', ''LAYAWAY'', ''BNPL_FINANCING'')),
            document_type TEXT NOT NULL DEFAULT ''COMMERCIAL_NOTE'' CHECK (document_type IN (''FISCAL_INVOICE'', ''COMMERCIAL_NOTE'')),
            financing_provider TEXT,
            external_reference TEXT,
            custody_status TEXT NOT NULL DEFAULT ''NOT_APPLICABLE'' CHECK (custody_status IN (''NOT_APPLICABLE'', ''IN_CUSTODY'', ''RELEASED_FOR_DELIVERY'', ''DELIVERED'', ''CANCELLED_FORFEITED'')),
            original_amount_primary NUMERIC(10,2) NOT NULL CHECK (original_amount_primary > 0.00),
            original_amount_usd NUMERIC(10,2) NOT NULL CHECK (original_amount_usd > 0.00),
            down_payment_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (down_payment_primary >= 0.00),
            down_payment_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (down_payment_usd >= 0.00),
            down_payment_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (down_payment_percent >= 0.00 AND down_payment_percent <= 100.00),
            financed_amount_primary NUMERIC(10,2) NOT NULL CHECK (financed_amount_primary >= 0.00),
            financed_amount_usd NUMERIC(10,2) NOT NULL CHECK (financed_amount_usd >= 0.00),
            balance_primary NUMERIC(10,2) NOT NULL CHECK (balance_primary >= 0.00),
            balance_usd NUMERIC(10,2) NOT NULL CHECK (balance_usd >= 0.00),
            total_paid_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_paid_primary >= 0.00),
            total_paid_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_paid_usd >= 0.00),
            term_days INTEGER NOT NULL DEFAULT 15 CHECK (term_days > 0),
            issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
            due_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT ''CURRENT'' CHECK (status IN (''CURRENT'', ''OVERDUE'', ''SETTLED'', ''DEFAULTED'', ''CANCELLED'')),
            notes TEXT,
            opened_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            closed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_acc_cust ON %1$I.cxc_accounts(customer_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_acc_order ON %1$I.cxc_accounts(order_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_acc_type ON %1$I.cxc_accounts(account_type);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_acc_status_due ON %1$I.cxc_accounts(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_acc_seller ON %1$I.cxc_accounts(seller_id);

        -- 3. Bloques de Liquidación Financiera (Cashea / BNPL / Financiamiento Externo)
        CREATE TABLE IF NOT EXISTS %1$I.cxc_financing_tranches (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL REFERENCES %1$I.cxc_accounts(id) ON DELETE CASCADE,
            tranche_number INTEGER NOT NULL CHECK (tranche_number > 0),
            tranche_name TEXT NOT NULL,
            expected_amount_primary NUMERIC(10,2) NOT NULL CHECK (expected_amount_primary > 0.00),
            expected_amount_usd NUMERIC(10,2) NOT NULL CHECK (expected_amount_usd > 0.00),
            settled_amount_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (settled_amount_primary >= 0.00),
            settled_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (settled_amount_usd >= 0.00),
            fee_amount_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (fee_amount_primary >= 0.00),
            fee_amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (fee_amount_usd >= 0.00),
            expected_date DATE NOT NULL,
            settled_date DATE,
            status TEXT NOT NULL DEFAULT ''PENDING'' CHECK (status IN (''PENDING'', ''SETTLED'', ''DISPUTED'', ''CANCELLED'')),
            settlement_reference TEXT,
            settled_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_tranches_acc ON %1$I.cxc_financing_tranches(account_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_tranches_status ON %1$I.cxc_financing_tranches(status, expected_date);

        -- 4. Abonos, Amortizaciones y Recibos de Cobro Multimoneda
        CREATE TABLE IF NOT EXISTS %1$I.cxc_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            receipt_number TEXT NOT NULL UNIQUE,
            account_id UUID NOT NULL REFERENCES %1$I.cxc_accounts(id) ON DELETE CASCADE,
            tranche_id UUID REFERENCES %1$I.cxc_financing_tranches(id) ON DELETE SET NULL,
            amount_primary NUMERIC(10,2) NOT NULL CHECK (amount_primary > 0.00),
            amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0.00),
            amount_original NUMERIC(14,2) NOT NULL CHECK (amount_original > 0.00),
            currency TEXT NOT NULL DEFAULT ''USD'',
            exchange_rate_applied NUMERIC(12,4) NOT NULL DEFAULT 1.0000 CHECK (exchange_rate_applied > 0.0000),
            payment_method TEXT NOT NULL,
            reference TEXT,
            balance_before_primary NUMERIC(10,2) NOT NULL CHECK (balance_before_primary >= 0.00),
            balance_before_usd NUMERIC(10,2) NOT NULL CHECK (balance_before_usd >= 0.00),
            balance_after_primary NUMERIC(10,2) NOT NULL CHECK (balance_after_primary >= 0.00),
            balance_after_usd NUMERIC(10,2) NOT NULL CHECK (balance_after_usd >= 0.00),
            received_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_pay_acc ON %1$I.cxc_payments(account_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_pay_created ON %1$I.cxc_payments(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxc_pay_method ON %1$I.cxc_payments(payment_method);

        -- Triggers de sincronización de estándar de moneda
        DROP TRIGGER IF EXISTS trg_sync_cxc_accounts_currency ON %1$I.cxc_accounts;
        CREATE TRIGGER trg_sync_cxc_accounts_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxc_accounts
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_accounts_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxc_profiles_currency ON %1$I.cxc_customer_profiles;
        CREATE TRIGGER trg_sync_cxc_profiles_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxc_customer_profiles
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_profiles_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxc_tranches_currency ON %1$I.cxc_financing_tranches;
        CREATE TRIGGER trg_sync_cxc_tranches_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxc_financing_tranches
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_tranches_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxc_payments_currency ON %1$I.cxc_payments;
        CREATE TRIGGER trg_sync_cxc_payments_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxc_payments
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxc_payments_multicurrency();
    ', v_schema, v_short);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;
