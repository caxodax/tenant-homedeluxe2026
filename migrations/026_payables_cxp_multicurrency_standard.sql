-- ============================================================================
-- MARKETOS — MIGRACIÓN 026: ESTÁNDAR MULTIMONEDA CANÓNICO PLUGIN PAYABLES_CXP
-- Archivo: migrations/026_payables_cxp_multicurrency_standard.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad:
--   1. Asegurar columnas canónicas `*_primary` como columnas reales y almacenadas en
--      todas las tablas cxp_* (cxp_bills, cxp_goods_receipt_items, cxp_advances,
--      cxp_advance_applications, cxp_payments, cxp_compensations).
--   2. Respaldar retrocompatibilidad absoluta mediante triggers bidireccionales
--      entre `*_primary` y las columnas legadas `*_usd` (Blast Radius = 0).
--   3. Actualizar los 5 RPCs transaccionales de CxP para recibir y operar con *_primary.
--   4. Actualizar la función DDL generadora `platform.cxp_ddl_supplier`.
-- ============================================================================

-- 1. Funciones de sincronización bidireccional en plataforma
CREATE OR REPLACE FUNCTION platform.fn_sync_cxp_gri_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.unit_cost_primary := COALESCE(NEW.unit_cost_primary, NEW.unit_cost_usd, 0.00);
    NEW.unit_cost_usd := NEW.unit_cost_primary;

    NEW.total_primary := COALESCE(NEW.total_primary, NEW.total_usd, 0.00);
    NEW.total_usd := NEW.total_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxp_bills_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_primary := COALESCE(NEW.total_primary, NEW.total_usd, 0.00);
    NEW.total_usd := NEW.total_primary;

    NEW.balance_primary := COALESCE(NEW.balance_primary, NEW.balance_usd, 0.00);
    NEW.balance_usd := NEW.balance_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxp_advances_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount_primary := COALESCE(NEW.amount_primary, NEW.amount_usd, 0.00);
    NEW.amount_usd := NEW.amount_primary;

    NEW.applied_primary := COALESCE(NEW.applied_primary, NEW.applied_usd, 0.00);
    NEW.applied_usd := NEW.applied_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxp_advance_apps_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount_primary := COALESCE(NEW.amount_primary, NEW.amount_usd, 0.00);
    NEW.amount_usd := NEW.amount_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION platform.fn_sync_cxp_payments_multicurrency()
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

CREATE OR REPLACE FUNCTION platform.fn_sync_cxp_compensations_multicurrency()
RETURNS TRIGGER AS $$
BEGIN
    NEW.amount_primary := COALESCE(NEW.amount_primary, NEW.amount_usd, 0.00);
    NEW.amount_usd := NEW.amount_primary;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 2. Migrar tablas de inquilinos existentes a columnas reales
DO $$
DECLARE
    r RECORD;
    v_schema TEXT;
BEGIN
    FOR r IN SELECT db_schema_name, slug FROM platform.tenants WHERE status IN ('active', 'trial')
    LOOP
        v_schema := lower(trim(r.db_schema_name));

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = v_schema AND table_name = 'cxp_bills') THEN

            -- A. cxp_goods_receipt_items
            EXECUTE format('
                ALTER TABLE %1$I.cxp_goods_receipt_items DROP COLUMN IF EXISTS unit_cost_primary;
                ALTER TABLE %1$I.cxp_goods_receipt_items DROP COLUMN IF EXISTS total_primary;

                ALTER TABLE %1$I.cxp_goods_receipt_items
                    ADD COLUMN IF NOT EXISTS unit_cost_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS total_primary NUMERIC(10,2);

                UPDATE %1$I.cxp_goods_receipt_items SET
                    unit_cost_primary = COALESCE(unit_cost_usd, 0.00),
                    total_primary = COALESCE(total_usd, 0.00)
                WHERE unit_cost_primary IS NULL;

                ALTER TABLE %1$I.cxp_goods_receipt_items
                    ALTER COLUMN unit_cost_primary SET NOT NULL,
                    ALTER COLUMN total_primary SET NOT NULL;

                DROP TRIGGER IF EXISTS trg_sync_cxp_gri_currency ON %1$I.cxp_goods_receipt_items;
                CREATE TRIGGER trg_sync_cxp_gri_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxp_goods_receipt_items
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_gri_multicurrency();
            ', v_schema);

            -- B. cxp_bills
            EXECUTE format('
                ALTER TABLE %1$I.cxp_bills DROP COLUMN IF EXISTS total_primary;
                ALTER TABLE %1$I.cxp_bills DROP COLUMN IF EXISTS balance_primary;

                ALTER TABLE %1$I.cxp_bills
                    ADD COLUMN IF NOT EXISTS total_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS balance_primary NUMERIC(10,2);

                UPDATE %1$I.cxp_bills SET
                    total_primary = COALESCE(total_usd, 0.00),
                    balance_primary = COALESCE(balance_usd, 0.00)
                WHERE total_primary IS NULL;

                ALTER TABLE %1$I.cxp_bills
                    ALTER COLUMN total_primary SET NOT NULL,
                    ALTER COLUMN balance_primary SET NOT NULL;

                DROP TRIGGER IF EXISTS trg_sync_cxp_bills_currency ON %1$I.cxp_bills;
                CREATE TRIGGER trg_sync_cxp_bills_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxp_bills
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_bills_multicurrency();
            ', v_schema);

            -- C. cxp_advances
            EXECUTE format('
                ALTER TABLE %1$I.cxp_advances DROP COLUMN IF EXISTS amount_primary;
                ALTER TABLE %1$I.cxp_advances DROP COLUMN IF EXISTS applied_primary;

                ALTER TABLE %1$I.cxp_advances
                    ADD COLUMN IF NOT EXISTS amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS applied_primary NUMERIC(10,2);

                UPDATE %1$I.cxp_advances SET
                    amount_primary = COALESCE(amount_usd, 0.00),
                    applied_primary = COALESCE(applied_usd, 0.00)
                WHERE amount_primary IS NULL;

                ALTER TABLE %1$I.cxp_advances
                    ALTER COLUMN amount_primary SET NOT NULL,
                    ALTER COLUMN applied_primary SET NOT NULL,
                    ALTER COLUMN applied_primary SET DEFAULT 0.00;

                -- Eliminar restricción rígida de sólo USD/VES si existe
                ALTER TABLE %1$I.cxp_advances DROP CONSTRAINT IF EXISTS cxp_advances_currency_check;

                DROP TRIGGER IF EXISTS trg_sync_cxp_adv_currency ON %1$I.cxp_advances;
                CREATE TRIGGER trg_sync_cxp_adv_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxp_advances
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_advances_multicurrency();
            ', v_schema);

            -- D. cxp_advance_applications
            EXECUTE format('
                ALTER TABLE %1$I.cxp_advance_applications DROP COLUMN IF EXISTS amount_primary;

                ALTER TABLE %1$I.cxp_advance_applications
                    ADD COLUMN IF NOT EXISTS amount_primary NUMERIC(10,2);

                UPDATE %1$I.cxp_advance_applications SET
                    amount_primary = COALESCE(amount_usd, 0.00)
                WHERE amount_primary IS NULL;

                ALTER TABLE %1$I.cxp_advance_applications
                    ALTER COLUMN amount_primary SET NOT NULL;

                DROP TRIGGER IF EXISTS trg_sync_cxp_app_currency ON %1$I.cxp_advance_applications;
                CREATE TRIGGER trg_sync_cxp_app_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxp_advance_applications
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_advance_apps_multicurrency();
            ', v_schema);

            -- E. cxp_payments
            EXECUTE format('
                ALTER TABLE %1$I.cxp_payments DROP COLUMN IF EXISTS amount_primary;
                ALTER TABLE %1$I.cxp_payments DROP COLUMN IF EXISTS balance_before_primary;
                ALTER TABLE %1$I.cxp_payments DROP COLUMN IF EXISTS balance_after_primary;

                ALTER TABLE %1$I.cxp_payments
                    ADD COLUMN IF NOT EXISTS amount_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS balance_before_primary NUMERIC(10,2),
                    ADD COLUMN IF NOT EXISTS balance_after_primary NUMERIC(10,2);

                UPDATE %1$I.cxp_payments SET
                    amount_primary = COALESCE(amount_usd, 0.00),
                    balance_before_primary = COALESCE(balance_before_usd, 0.00),
                    balance_after_primary = COALESCE(balance_after_usd, 0.00)
                WHERE amount_primary IS NULL;

                ALTER TABLE %1$I.cxp_payments
                    ALTER COLUMN amount_primary SET NOT NULL,
                    ALTER COLUMN balance_before_primary SET NOT NULL,
                    ALTER COLUMN balance_after_primary SET NOT NULL;

                ALTER TABLE %1$I.cxp_payments DROP CONSTRAINT IF EXISTS cxp_payments_currency_check;

                DROP TRIGGER IF EXISTS trg_sync_cxp_payments_currency ON %1$I.cxp_payments;
                CREATE TRIGGER trg_sync_cxp_payments_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxp_payments
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_payments_multicurrency();
            ', v_schema);

            -- F. cxp_compensations
            EXECUTE format('
                ALTER TABLE %1$I.cxp_compensations DROP COLUMN IF EXISTS amount_primary;

                ALTER TABLE %1$I.cxp_compensations
                    ADD COLUMN IF NOT EXISTS amount_primary NUMERIC(10,2);

                UPDATE %1$I.cxp_compensations SET
                    amount_primary = COALESCE(amount_usd, 0.00)
                WHERE amount_primary IS NULL;

                ALTER TABLE %1$I.cxp_compensations
                    ALTER COLUMN amount_primary SET NOT NULL;

                DROP TRIGGER IF EXISTS trg_sync_cxp_comp_currency ON %1$I.cxp_compensations;
                CREATE TRIGGER trg_sync_cxp_comp_currency
                BEFORE INSERT OR UPDATE ON %1$I.cxp_compensations
                FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_compensations_multicurrency();
            ', v_schema);

            -- G. cxp_suppliers: flexibilizar moneda por defecto
            EXECUTE format('
                ALTER TABLE %1$I.cxp_suppliers DROP CONSTRAINT IF EXISTS cxp_suppliers_default_currency_check;
            ', v_schema);

            RAISE NOTICE 'Esquema % (%) migrado con éxito al estándar multimoneda _primary en CxP.', v_schema, r.slug;
        END IF;
    END LOOP;
END $$;


-- 3. Actualización canónica de los 5 RPCs de plataforma a *_primary
DROP FUNCTION IF EXISTS platform.rpc_cxp_confirm_goods_receipt(TEXT, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS platform.rpc_cxp_pay_bill(TEXT, UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS platform.rpc_cxp_register_advance(TEXT, UUID, NUMERIC, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS platform.rpc_cxp_apply_advance(TEXT, UUID, UUID, NUMERIC, UUID);
DROP FUNCTION IF EXISTS platform.rpc_cxp_record_compensation(TEXT, UUID, UUID, NUMERIC, TEXT, UUID, UUID, UUID);

-- RPC 1: Confirmación de recepción de mercancía
CREATE OR REPLACE FUNCTION platform.rpc_cxp_confirm_goods_receipt(
    p_schema TEXT,
    p_receipt_id UUID,
    p_actor_id UUID,
    p_actor_role TEXT,
    p_supplier_bill_number TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_receipt RECORD;
    v_supplier RECORD;
    v_store_id UUID;
    v_item RECORD;
    v_total_primary NUMERIC(10,2) := 0.00;
    v_bill_id UUID;
    v_bill_num TEXT;
    v_cur_stock NUMERIC(12,3);
    v_new_stock NUMERIC(12,3);
    v_inv_id UUID;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    EXECUTE format('
        SELECT id, receipt_number, supplier_id, store_id, status, with_stock_entry, supplier_bill_number
        FROM %I.cxp_goods_receipts
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_receipt USING p_receipt_id;

    IF v_receipt.id IS NULL THEN
        RAISE EXCEPTION 'Recepción de mercancía no encontrada.';
    END IF;

    IF v_receipt.status = 'CONFIRMED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'La recepción ya fue confirmada previamente.');
    END IF;

    IF v_receipt.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'No se puede confirmar una recepción anulada.';
    END IF;

    EXECUTE format('
        SELECT id, name, payment_terms_days
        FROM %I.cxp_suppliers
        WHERE id = $1
    ', v_schema) INTO v_supplier USING v_receipt.supplier_id;

    v_store_id := v_receipt.store_id;

    -- Procesar renglones e incrementar stock en Kardex Core
    FOR v_item IN
        EXECUTE format('
            SELECT id, product_id, quantity,
                   COALESCE(unit_cost_primary, unit_cost_usd, 0.00) as unit_cost_primary,
                   COALESCE(total_primary, total_usd, 0.00) as total_primary
            FROM %I.cxp_goods_receipt_items
            WHERE receipt_id = $1
        ', v_schema) USING p_receipt_id
    LOOP
        v_total_primary := v_total_primary + v_item.total_primary;

        IF v_receipt.with_stock_entry THEN
            EXECUTE format('
                SELECT current_stock FROM %I.products WHERE id = $1 FOR UPDATE
            ', v_schema) INTO v_cur_stock USING v_item.product_id;

            IF v_cur_stock IS NULL THEN
                RAISE EXCEPTION 'Producto % no encontrado en catálogo.', v_item.product_id;
            END IF;

            v_new_stock := v_cur_stock + v_item.quantity;

            EXECUTE format('
                UPDATE %I.products
                SET current_stock = $1,
                    cost_price = CASE WHEN $2 > 0 THEN $2 ELSE cost_price END,
                    updated_at = now()
                WHERE id = $3
            ', v_schema) USING v_new_stock, v_item.unit_cost_primary, v_item.product_id;

            -- Inserción canónica de Kardex Core 01
            EXECUTE format('
                INSERT INTO %I.inventory_movements (
                    product_id, store_id, movement_type, quantity,
                    balance_after, reference_type, reference_id, notes, created_by
                ) VALUES (
                    $1, $2, ''PURCHASE_IN'', $3,
                    $4, ''CXP_GOODS_RECEIPT'', $5, $6, $7
                ) RETURNING id
            ', v_schema) INTO v_inv_id USING
                v_item.product_id, v_store_id, v_item.quantity,
                v_new_stock, p_receipt_id,
                format('Entrada física por CxP Recepción %s (Proveedor: %s)', v_receipt.receipt_number, v_supplier.name),
                p_actor_id;
        END IF;
    END LOOP;

    -- Generar factura/pasivo por pagar
    EXECUTE format('
        SELECT format(''CXP-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_bill_seq'')::text, 6, ''0''))
    ', v_schema) INTO v_bill_num;

    EXECUTE format('
        INSERT INTO %I.cxp_bills (
            internal_number, supplier_bill_number, supplier_id, origin,
            goods_receipt_id, issue_date, due_date,
            total_primary, total_usd, balance_primary, balance_usd,
            status, notes, created_by
        ) VALUES (
            $1, $2, $3, ''GOODS_RECEIPT'',
            $4, CURRENT_DATE, CURRENT_DATE + ($5 || '' days'')::interval,
            $6, $6, $6, $6,
            ''OPEN'', $7, $8
        ) RETURNING id
    ', v_schema) INTO v_bill_id USING
        v_bill_num,
        COALESCE(p_supplier_bill_number, v_receipt.supplier_bill_number),
        v_receipt.supplier_id,
        p_receipt_id,
        COALESCE(v_supplier.payment_terms_days, 15),
        v_total_primary,
        format('Generado automáticamente desde Recepción %s', v_receipt.receipt_number),
        p_actor_id;

    -- Confirmar la recepción
    EXECUTE format('
        UPDATE %I.cxp_goods_receipts
        SET status = ''CONFIRMED'',
            confirmed_at = now(),
            supplier_bill_number = COALESCE($1, supplier_bill_number),
            updated_at = now()
        WHERE id = $2
    ', v_schema) USING p_supplier_bill_number, p_receipt_id;

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', p_receipt_id,
        'bill_id', v_bill_id,
        'bill_number', v_bill_num,
        'total_primary', v_total_primary
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- RPC 2: Liquidación de Abono / Pago a Factura
CREATE OR REPLACE FUNCTION platform.rpc_cxp_pay_bill(
    p_schema TEXT,
    p_bill_id UUID,
    p_account_id UUID,
    p_amount_primary NUMERIC,
    p_currency TEXT,
    p_exchange_rate NUMERIC,
    p_rate_override_reason TEXT,
    p_paid_by UUID,
    p_notes TEXT DEFAULT NULL,
    p_voucher_r2_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_bill RECORD;
    v_account RECORD;
    v_pay_num TEXT;
    v_pay_id UUID;
    v_bal_before NUMERIC(10,2);
    v_bal_after NUMERIC(10,2);
    v_orig_amt NUMERIC(14,2);
    v_rate NUMERIC(12,4);
    v_new_status TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_amount_primary <= 0.00 THEN
        RAISE EXCEPTION 'El monto a abonar debe ser estrictamente mayor a 0.';
    END IF;

    v_rate := COALESCE(p_exchange_rate, 1.0000);
    IF v_rate <= 0 THEN
        v_rate := 1.0000;
    END IF;

    v_orig_amt := round(p_amount_primary * v_rate, 2);

    -- Bloquear factura para actualización
    EXECUTE format('
        SELECT id, internal_number, total_primary, balance_primary, status
        FROM %I.cxp_bills
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_bill USING p_bill_id;

    IF v_bill.id IS NULL THEN
        RAISE EXCEPTION 'Factura / Pasivo CxP no encontrado.';
    END IF;

    IF v_bill.status = 'PAID' OR v_bill.balance_primary <= 0.005 THEN
        RAISE EXCEPTION 'La factura % ya se encuentra 100%% cancelada.', v_bill.internal_number;
    END IF;

    IF v_bill.status = 'VOID' THEN
        RAISE EXCEPTION 'No se pueden registrar pagos a una factura anulada.';
    END IF;

    -- Validación anti-sobrepago con tolerancia de centavo
    IF p_amount_primary > (v_bill.balance_primary + 0.01) THEN
        RAISE EXCEPTION 'El monto abonado (%s) excede el saldo pendiente (%s) de la factura %s.',
            p_amount_primary, v_bill.balance_primary, v_bill.internal_number;
    END IF;

    -- Validar cuenta de tesorería
    EXECUTE format('
        SELECT id, name, is_active FROM %I.cxp_payment_accounts WHERE id = $1
    ', v_schema) INTO v_account USING p_account_id;

    IF v_account.id IS NULL OR NOT v_account.is_active THEN
        RAISE EXCEPTION 'La cuenta de tesorería seleccionada no existe o está inactiva.';
    END IF;

    v_bal_before := v_bill.balance_primary;
    v_bal_after := round(GREATEST(0.00, v_bal_before - p_amount_primary), 2);

    IF v_bal_after <= 0.005 THEN
        v_bal_after := 0.00;
        v_new_status := 'PAID';
    ELSE
        v_new_status := 'PARTIAL';
    END IF;

    -- Generar correlativo PAG-YYYYMM-######
    EXECUTE format('
        SELECT format(''PAG-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_payment_seq'')::text, 6, ''0''))
    ', v_schema) INTO v_pay_num;

    -- Insertar pago
    EXECUTE format('
        INSERT INTO %I.cxp_payments (
            payment_number, bill_id, account_id, currency, original_amount,
            exchange_rate, amount_primary, amount_usd,
            balance_before_primary, balance_before_usd,
            balance_after_primary, balance_after_usd,
            rate_override_reason, voucher_r2_key, paid_by, notes
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $7, $8, $8, $9, $9, $10, $11, $12, $13
        ) RETURNING id
    ', v_schema) INTO v_pay_id USING
        v_pay_num, p_bill_id, p_account_id, COALESCE(p_currency, 'USD'), v_orig_amt,
        v_rate, p_amount_primary, v_bal_before, v_bal_after,
        p_rate_override_reason, p_voucher_r2_key, p_paid_by, p_notes;

    -- Actualizar factura
    EXECUTE format('
        UPDATE %I.cxp_bills
        SET balance_primary = $1,
            balance_usd = $1,
            status = $2,
            updated_at = now()
        WHERE id = $3
    ', v_schema) USING v_bal_after, v_new_status, p_bill_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_pay_id,
        'payment_number', v_pay_num,
        'amount_primary', p_amount_primary,
        'balance_after_primary', v_bal_after,
        'status', v_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- RPC 3: Registro de Anticipo a Fabricante
CREATE OR REPLACE FUNCTION platform.rpc_cxp_register_advance(
    p_schema TEXT,
    p_supplier_id UUID,
    p_amount_primary NUMERIC,
    p_account_id UUID,
    p_currency TEXT,
    p_exchange_rate NUMERIC,
    p_purpose TEXT,
    p_created_by UUID,
    p_link_mode TEXT DEFAULT 'UNLINKED',
    p_target_bill_id UUID DEFAULT NULL,
    p_new_bill_data JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_adv_num TEXT;
    v_adv_id UUID;
    v_applied_amt NUMERIC(10,2) := 0.00;
    v_target_bill_id UUID := p_target_bill_id;
    v_bill RECORD;
    v_bill_num TEXT;
    v_new_bal NUMERIC(10,2);
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_amount_primary <= 0 THEN
        RAISE EXCEPTION 'El monto del anticipo debe ser mayor a 0.';
    END IF;

    -- Generar correlativo ANT-YYYYMM-######
    EXECUTE format('
        SELECT format(''ANT-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_advance_seq'')::text, 6, ''0''))
    ', v_schema) INTO v_adv_num;

    -- Modo 2: Crear factura en el momento
    IF p_link_mode = 'CREATE_BILL' AND p_new_bill_data IS NOT NULL THEN
        EXECUTE format('
            SELECT format(''CXP-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_bill_seq'')::text, 6, ''0''))
        ', v_schema) INTO v_bill_num;

        EXECUTE format('
            INSERT INTO %I.cxp_bills (
                internal_number, supplier_bill_number, supplier_id, origin,
                issue_date, due_date, total_primary, total_usd, balance_primary, balance_usd,
                status, notes, created_by
            ) VALUES (
                $1, $2, $3, ''ADVANCE_NOTE'',
                CURRENT_DATE, CURRENT_DATE + interval ''15 days'',
                $4, $4, $4, $4,
                ''OPEN'', $5, $6
            ) RETURNING id
        ', v_schema) INTO v_target_bill_id USING
            v_bill_num,
            p_new_bill_data->>'supplier_bill_number',
            p_supplier_id,
            COALESCE((p_new_bill_data->>'total_primary')::numeric, (p_new_bill_data->>'total_usd')::numeric, p_amount_primary),
            format('Factura/Nota abierta simultáneamente con Anticipo %s', v_adv_num),
            p_created_by;
    END IF;

    -- Modo 1 o 2: Aplicar si hay factura vinculada
    IF (p_link_mode IN ('LINK_EXISTING', 'CREATE_BILL')) AND v_target_bill_id IS NOT NULL THEN
        EXECUTE format('
            SELECT id, balance_primary FROM %I.cxp_bills WHERE id = $1 FOR UPDATE
        ', v_schema) INTO v_bill USING v_target_bill_id;

        IF v_bill.id IS NOT NULL THEN
            v_applied_amt := round(LEAST(p_amount_primary, v_bill.balance_primary), 2);
        END IF;
    END IF;

    -- Insertar el anticipo
    EXECUTE format('
        INSERT INTO %I.cxp_advances (
            advance_number, supplier_id,
            amount_primary, amount_usd,
            applied_primary, applied_usd,
            account_id, currency,
            original_amount, exchange_rate, purpose, status, created_by
        ) VALUES (
            $1, $2, $3, $3, $4, $4, $5, $6, $7, $8, $9,
            CASE WHEN $4 >= $3 THEN ''APPLIED'' ELSE ''OPEN'' END,
            $10
        ) RETURNING id
    ', v_schema) INTO v_adv_id USING
        v_adv_num,
        p_supplier_id,
        p_amount_primary,
        v_applied_amt,
        p_account_id,
        COALESCE(p_currency, 'USD'),
        round(p_amount_primary * COALESCE(p_exchange_rate, 1.0000), 2),
        COALESCE(p_exchange_rate, 1.0000),
        p_purpose,
        p_created_by;

    -- Si hubo aplicación inmediata, registrar vínculo y reducir saldo
    IF v_applied_amt > 0 AND v_target_bill_id IS NOT NULL THEN
        EXECUTE format('
            INSERT INTO %I.cxp_advance_applications (advance_id, bill_id, amount_primary, amount_usd, applied_by)
            VALUES ($1, $2, $3, $3, $4)
        ', v_schema) USING v_adv_id, v_target_bill_id, v_applied_amt, p_created_by;

        v_new_bal := round(v_bill.balance_primary - v_applied_amt, 2);
        EXECUTE format('
            UPDATE %I.cxp_bills
            SET balance_primary = $1,
                balance_usd = $1,
                status = CASE WHEN $1 <= 0.005 THEN ''PAID'' ELSE ''PARTIAL'' END,
                updated_at = now()
            WHERE id = $2
        ', v_schema) USING v_new_bal, v_target_bill_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'advance_id', v_adv_id,
        'advance_number', v_adv_num,
        'amount_primary', p_amount_primary,
        'applied_primary', v_applied_amt,
        'target_bill_id', v_target_bill_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- RPC 4: Aplicación Posterior de Anticipo
CREATE OR REPLACE FUNCTION platform.rpc_cxp_apply_advance(
    p_schema TEXT,
    p_advance_id UUID,
    p_bill_id UUID,
    p_amount_primary NUMERIC,
    p_applied_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_adv RECORD;
    v_bill RECORD;
    v_adv_avail NUMERIC(10,2);
    v_new_adv_applied NUMERIC(10,2);
    v_new_bill_bal NUMERIC(10,2);
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_amount_primary <= 0 THEN
        RAISE EXCEPTION 'El monto a aplicar debe ser mayor a 0.';
    END IF;

    -- Bloquear anticipo
    EXECUTE format('
        SELECT id, supplier_id, amount_primary, applied_primary, status
        FROM %I.cxp_advances
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_adv USING p_advance_id;

    IF v_adv.id IS NULL THEN
        RAISE EXCEPTION 'Anticipo no encontrado.';
    END IF;

    v_adv_avail := round(v_adv.amount_primary - v_adv.applied_primary, 2);
    IF p_amount_primary > (v_adv_avail + 0.005) THEN
        RAISE EXCEPTION 'El monto solicitado (%s) excede el saldo remanente disponible del anticipo (%s).',
            p_amount_primary, v_adv_avail;
    END IF;

    -- Bloquear factura
    EXECUTE format('
        SELECT id, supplier_id, balance_primary, status
        FROM %I.cxp_bills
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_bill USING p_bill_id;

    IF v_bill.id IS NULL THEN
        RAISE EXCEPTION 'Factura no encontrada.';
    END IF;

    IF v_bill.supplier_id != v_adv.supplier_id THEN
        RAISE EXCEPTION 'El anticipo pertenece a un proveedor diferente al de la factura.';
    END IF;

    IF p_amount_primary > (v_bill.balance_primary + 0.005) THEN
        RAISE EXCEPTION 'El monto a aplicar (%s) excede el saldo pendiente de la factura (%s).',
            p_amount_primary, v_bill.balance_primary;
    END IF;

    -- Registrar aplicación
    EXECUTE format('
        INSERT INTO %I.cxp_advance_applications (advance_id, bill_id, amount_primary, amount_usd, applied_by)
        VALUES ($1, $2, $3, $3, $4)
        ON CONFLICT (advance_id, bill_id) DO UPDATE SET
            amount_primary = %I.cxp_advance_applications.amount_primary + EXCLUDED.amount_primary,
            amount_usd = %I.cxp_advance_applications.amount_usd + EXCLUDED.amount_usd
    ', v_schema, v_schema, v_schema) USING p_advance_id, p_bill_id, p_amount_primary, p_applied_by;

    -- Actualizar anticipo
    v_new_adv_applied := round(v_adv.applied_primary + p_amount_primary, 2);
    EXECUTE format('
        UPDATE %I.cxp_advances
        SET applied_primary = $1,
            applied_usd = $1,
            status = CASE WHEN $1 >= amount_primary - 0.005 THEN ''APPLIED'' ELSE ''OPEN'' END,
            updated_at = now()
        WHERE id = $2
    ', v_schema) USING v_new_adv_applied, p_advance_id;

    -- Actualizar factura
    v_new_bill_bal := round(v_bill.balance_primary - p_amount_primary, 2);
    EXECUTE format('
        UPDATE %I.cxp_bills
        SET balance_primary = $1,
            balance_usd = $1,
            status = CASE WHEN $1 <= 0.005 THEN ''PAID'' ELSE ''PARTIAL'' END,
            updated_at = now()
        WHERE id = $2
    ', v_schema) USING v_new_bill_bal, p_bill_id;

    RETURN jsonb_build_object(
        'success', true,
        'applied_primary', p_amount_primary,
        'advance_remaining_primary', round(v_adv.amount_primary - v_new_adv_applied, 2),
        'bill_balance_primary', v_new_bill_bal
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- RPC 5: Compensaciones y Cruces entre Proveedores
CREATE OR REPLACE FUNCTION platform.rpc_cxp_record_compensation(
    p_schema TEXT,
    p_from_supplier_id UUID,
    p_to_supplier_id UUID,
    p_amount_primary NUMERIC,
    p_reason TEXT,
    p_authorized_by UUID,
    p_from_bill_id UUID DEFAULT NULL,
    p_to_bill_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_comp_num TEXT;
    v_comp_id UUID;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_from_supplier_id = p_to_supplier_id THEN
        RAISE EXCEPTION 'No se puede realizar una compensación sobre el mismo fabricante.';
    END IF;

    IF p_amount_primary <= 0 THEN
        RAISE EXCEPTION 'El monto de la compensación debe ser mayor a 0.';
    END IF;

    -- Generar correlativo CRU-YYYYMM-######
    EXECUTE format('
        SELECT format(''CRU-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_comp_seq'')::text, 6, ''0''))
    ', v_schema) INTO v_comp_num;

    -- Registrar compensación
    EXECUTE format('
        INSERT INTO %I.cxp_compensations (
            compensation_number, from_supplier_id, to_supplier_id,
            from_bill_id, to_bill_id,
            amount_primary, amount_usd,
            reason, authorized_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $6, $7, $8
        ) RETURNING id
    ', v_schema) INTO v_comp_id USING
        v_comp_num,
        p_from_supplier_id,
        p_to_supplier_id,
        p_from_bill_id,
        p_to_bill_id,
        p_amount_primary,
        p_reason,
        p_authorized_by;

    -- Si se vinculó factura origen, reducir saldo
    IF p_from_bill_id IS NOT NULL THEN
        EXECUTE format('
            UPDATE %I.cxp_bills
            SET balance_primary = round(GREATEST(0, balance_primary - $1), 2),
                balance_usd = round(GREATEST(0, balance_primary - $1), 2),
                status = CASE WHEN balance_primary - $1 <= 0.005 THEN ''PAID'' ELSE ''PARTIAL'' END,
                updated_at = now()
            WHERE id = $2
        ', v_schema) USING p_amount_primary, p_from_bill_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'compensation_id', v_comp_id,
        'compensation_number', v_comp_num,
        'amount_primary', p_amount_primary
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- 4. Actualizar función DDL canónica de plataforma para nuevos inquilinos
CREATE OR REPLACE FUNCTION platform.cxp_ddl_supplier(p_schema TEXT)
RETURNS void AS $$
DECLARE
    v_schema TEXT;
    v_short TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido para DDL de supplier_cxp.', p_schema;
    END IF;
    v_short := replace(v_schema, 'tenant_', '');

    EXECUTE format('
        -- Secuencias correlativas de documentos CxP
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxp_bill_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxp_receipt_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxp_advance_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxp_payment_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.cxp_comp_seq START WITH 1 INCREMENT BY 1;

        -- 1. Expediente y Directorio de Proveedores / Talleres Fabricantes
        CREATE TABLE IF NOT EXISTS %1$I.cxp_suppliers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            tax_id TEXT,
            contact_name TEXT,
            phone TEXT CHECK (length(trim(phone)) >= 7),
            whatsapp TEXT,
            email TEXT,
            address TEXT,
            category TEXT NOT NULL DEFAULT ''MERCHANDISE''
                CHECK (category IN (''RAW_MATERIAL'', ''MERCHANDISE'', ''SERVICE'', ''FIXED_COST'', ''OTHER'')),
            default_currency TEXT NOT NULL DEFAULT ''USD'',
            payment_terms_days INTEGER NOT NULL DEFAULT 15 CHECK (payment_terms_days >= 0),
            notes TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_sup_tax ON %1$I.cxp_suppliers(tax_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_sup_cat ON %1$I.cxp_suppliers(category);

        -- 2. Cuentas de Pago de Salida Configurables (Multi-billetera / Tesorería)
        CREATE TABLE IF NOT EXISTS %1$I.cxp_payment_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN (''BANK'', ''ZELLE'', ''BINANCE'', ''CASH'', ''PAGO_MOVIL'', ''OTHER'')),
            details JSONB NOT NULL DEFAULT ''{}''::jsonb,
            is_default BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS uq_%2$I_cxp_account_default
            ON %1$I.cxp_payment_accounts(is_default) WHERE is_default = true;

        -- 3. Recepción de Mercancía con Entrada de Stock al Kardex Core
        CREATE TABLE IF NOT EXISTS %1$I.cxp_goods_receipts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            receipt_number TEXT NOT NULL UNIQUE,
            supplier_id UUID NOT NULL REFERENCES %1$I.cxp_suppliers(id) ON DELETE RESTRICT,
            store_id UUID NOT NULL REFERENCES %1$I.stores(id) ON DELETE RESTRICT,
            received_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT ''DRAFT'' CHECK (status IN (''DRAFT'', ''CONFIRMED'', ''CANCELLED'')),
            with_stock_entry BOOLEAN NOT NULL DEFAULT true,
            supplier_bill_number TEXT,
            notes TEXT,
            confirmed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_gr_sup ON %1$I.cxp_goods_receipts(supplier_id, status);

        -- 3.1 Ítems de Recepción de Mercancía
        CREATE TABLE IF NOT EXISTS %1$I.cxp_goods_receipt_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            receipt_id UUID NOT NULL REFERENCES %1$I.cxp_goods_receipts(id) ON DELETE CASCADE,
            product_id UUID NOT NULL REFERENCES %1$I.products(id) ON DELETE RESTRICT,
            quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
            unit_cost_primary NUMERIC(10,2) NOT NULL CHECK (unit_cost_primary >= 0),
            unit_cost_usd NUMERIC(10,2) NOT NULL CHECK (unit_cost_usd >= 0),
            total_primary NUMERIC(10,2) NOT NULL CHECK (total_primary >= 0),
            total_usd NUMERIC(10,2) NOT NULL CHECK (total_usd >= 0)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_gri_receipt ON %1$I.cxp_goods_receipt_items(receipt_id);

        -- 4. Pasivos, Facturas y Notas de Taller por Pagar
        CREATE TABLE IF NOT EXISTS %1$I.cxp_bills (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            internal_number TEXT NOT NULL UNIQUE,
            supplier_bill_number TEXT,
            supplier_id UUID NOT NULL REFERENCES %1$I.cxp_suppliers(id) ON DELETE RESTRICT,
            origin TEXT NOT NULL DEFAULT ''MANUAL'' CHECK (origin IN (''MANUAL'', ''GOODS_RECEIPT'', ''ADVANCE_NOTE'')),
            goods_receipt_id UUID REFERENCES %1$I.cxp_goods_receipts(id) ON DELETE SET NULL,
            issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
            due_date DATE NOT NULL,
            total_primary NUMERIC(10,2) NOT NULL CHECK (total_primary > 0),
            total_usd NUMERIC(10,2) NOT NULL CHECK (total_usd > 0),
            balance_primary NUMERIC(10,2) NOT NULL CHECK (balance_primary >= 0),
            balance_usd NUMERIC(10,2) NOT NULL CHECK (balance_usd >= 0),
            status TEXT NOT NULL DEFAULT ''OPEN'' CHECK (status IN (''OPEN'', ''PARTIAL'', ''PAID'', ''VOID'')),
            attachment_r2_key TEXT,
            notes TEXT,
            created_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_cxp_balance CHECK (balance_primary <= total_primary)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_bills_due ON %1$I.cxp_bills(due_date) WHERE status IN (''OPEN'', ''PARTIAL'');
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_bills_supplier ON %1$I.cxp_bills(supplier_id, status);

        -- 5. Anticipos Directos a Fabricantes / Proveedores
        CREATE TABLE IF NOT EXISTS %1$I.cxp_advances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            advance_number TEXT NOT NULL UNIQUE,
            supplier_id UUID NOT NULL REFERENCES %1$I.cxp_suppliers(id) ON DELETE RESTRICT,
            amount_primary NUMERIC(10,2) NOT NULL CHECK (amount_primary > 0),
            amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
            applied_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (applied_primary >= 0),
            applied_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (applied_usd >= 0),
            account_id UUID NOT NULL REFERENCES %1$I.cxp_payment_accounts(id) ON DELETE RESTRICT,
            currency TEXT NOT NULL DEFAULT ''USD'',
            original_amount NUMERIC(12,2) NOT NULL,
            exchange_rate NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
            purpose TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT ''OPEN'' CHECK (status IN (''OPEN'', ''APPLIED'', ''VOID'')),
            created_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_cxp_adv_applied CHECK (applied_primary <= amount_primary)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_adv_sup ON %1$I.cxp_advances(supplier_id, status);

        -- 5.1 Aplicaciones de Anticipos a Facturas
        CREATE TABLE IF NOT EXISTS %1$I.cxp_advance_applications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            advance_id UUID NOT NULL REFERENCES %1$I.cxp_advances(id) ON DELETE CASCADE,
            bill_id UUID NOT NULL REFERENCES %1$I.cxp_bills(id) ON DELETE CASCADE,
            amount_primary NUMERIC(10,2) NOT NULL CHECK (amount_primary > 0),
            amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
            applied_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_%2$I_cxp_app_pair UNIQUE (advance_id, bill_id)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_app_bill ON %1$I.cxp_advance_applications(bill_id);

        -- 6. Pagos y Abonos a Facturas
        CREATE TABLE IF NOT EXISTS %1$I.cxp_payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            payment_number TEXT NOT NULL UNIQUE,
            bill_id UUID NOT NULL REFERENCES %1$I.cxp_bills(id) ON DELETE RESTRICT,
            account_id UUID NOT NULL REFERENCES %1$I.cxp_payment_accounts(id) ON DELETE RESTRICT,
            currency TEXT NOT NULL DEFAULT ''USD'',
            original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
            exchange_rate NUMERIC(12,4) NOT NULL CHECK (exchange_rate > 0),
            amount_primary NUMERIC(10,2) NOT NULL CHECK (amount_primary > 0),
            amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0),
            balance_before_primary NUMERIC(10,2) NOT NULL,
            balance_before_usd NUMERIC(10,2) NOT NULL,
            balance_after_primary NUMERIC(10,2) NOT NULL,
            balance_after_usd NUMERIC(10,2) NOT NULL,
            rate_override_reason TEXT,
            voucher_r2_key TEXT,
            paid_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            notes TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_payments_bill ON %1$I.cxp_payments(bill_id, paid_at DESC);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_payments_account ON %1$I.cxp_payments(account_id, paid_at DESC);

        -- 7. Compensaciones y Cruces entre Proveedores
        CREATE TABLE IF NOT EXISTS %1$I.cxp_compensations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            compensation_number TEXT NOT NULL UNIQUE,
            from_supplier_id UUID NOT NULL REFERENCES %1$I.cxp_suppliers(id) ON DELETE RESTRICT,
            to_supplier_id UUID NOT NULL REFERENCES %1$I.cxp_suppliers(id) ON DELETE RESTRICT,
            from_bill_id UUID REFERENCES %1$I.cxp_bills(id) ON DELETE SET NULL,
            to_bill_id UUID REFERENCES %1$I.cxp_bills(id) ON DELETE SET NULL,
            amount_primary NUMERIC(10,2) NOT NULL CHECK (amount_primary > 0.00),
            amount_usd NUMERIC(10,2) NOT NULL CHECK (amount_usd > 0.00),
            reason TEXT NOT NULL,
            authorized_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_comp_from ON %1$I.cxp_compensations(from_supplier_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_cxp_comp_to ON %1$I.cxp_compensations(to_supplier_id);

        -- Triggers de sincronización de moneda
        DROP TRIGGER IF EXISTS trg_sync_cxp_gri_currency ON %1$I.cxp_goods_receipt_items;
        CREATE TRIGGER trg_sync_cxp_gri_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxp_goods_receipt_items
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_gri_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxp_bills_currency ON %1$I.cxp_bills;
        CREATE TRIGGER trg_sync_cxp_bills_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxp_bills
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_bills_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxp_adv_currency ON %1$I.cxp_advances;
        CREATE TRIGGER trg_sync_cxp_adv_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxp_advances
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_advances_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxp_app_currency ON %1$I.cxp_advance_applications;
        CREATE TRIGGER trg_sync_cxp_app_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxp_advance_applications
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_advance_apps_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxp_payments_currency ON %1$I.cxp_payments;
        CREATE TRIGGER trg_sync_cxp_payments_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxp_payments
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_payments_multicurrency();

        DROP TRIGGER IF EXISTS trg_sync_cxp_comp_currency ON %1$I.cxp_compensations;
        CREATE TRIGGER trg_sync_cxp_comp_currency
        BEFORE INSERT OR UPDATE ON %1$I.cxp_compensations
        FOR EACH ROW EXECUTE FUNCTION platform.fn_sync_cxp_compensations_multicurrency();

        -- Triggers updated_at automáticos
        CREATE OR REPLACE TRIGGER trg_cxp_suppliers_updated_at BEFORE UPDATE ON %1$I.cxp_suppliers FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();
        CREATE OR REPLACE TRIGGER trg_cxp_accounts_updated_at BEFORE UPDATE ON %1$I.cxp_payment_accounts FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();
        CREATE OR REPLACE TRIGGER trg_cxp_gr_updated_at BEFORE UPDATE ON %1$I.cxp_goods_receipts FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();
        CREATE OR REPLACE TRIGGER trg_cxp_bills_updated_at BEFORE UPDATE ON %1$I.cxp_bills FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();
    ', v_schema, v_short);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;
