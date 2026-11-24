-- ============================================================================
-- MARKETOS — MIGRACIÓN 024: RPCS CANÓNICOS DEL PLUGIN CUENTAS POR PAGAR (CXP)
-- Archivo: migrations/024_payables_cxp_rpcs_and_functions.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad:
--   1. Asegurar catálogo y alias de payables_cxp / supplier_cxp.
--   2. Implementar funciones RPC transaccionales y de seguridad para CxP:
--      - rpc_cxp_confirm_goods_receipt (con entrada al kardex PURCHASE_IN)
--      - rpc_cxp_pay_bill (con validación estricta anti-sobrepago)
--      - rpc_cxp_register_advance (con las 3 opciones de vínculo: LINK, CREATE, UNLINKED)
--      - rpc_cxp_apply_advance (aplicación de saldo a favor)
--      - rpc_cxp_record_compensation (cruce Sheraton / talleres)
--   3. Idempotente y con Blast Radius = 0 (Zero Touch al Core).
-- ============================================================================

-- 1. Catálogo idempotente
INSERT INTO platform.plugins_catalog (
  id, name, category, description, version, manifest_path, migration_dir, dependencies, price_usd_monthly
) VALUES (
  'payables_cxp', 'Cuentas por Pagar & Proveedores', 'fintech',
  'Expediente de proveedores y talleres, anticipos directos con vinculación flexible, recepción física de mercancía al kardex, cuentas de pago multi-billetera, abonos bimoneda con comprobante PDF y aging de pasivos.',
  '1.0.0', '/packages/plugins/payables-cxp/manifest.json', '/packages/plugins/payables-cxp/migrations', '{}', 12.00
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_usd_monthly = EXCLUDED.price_usd_monthly;

UPDATE platform.subscription_plans
SET allowed_plugins = array_append(allowed_plugins, 'payables_cxp')
WHERE id IN ('GROWTH', 'ENTERPRISE', 'INTERNAL_DEMO')
  AND NOT ('payables_cxp' = ANY(allowed_plugins));


-- ----------------------------------------------------------------------------
-- RPC 1: Confirmación de Recepción de Mercancía e Inserción al Kardex Core
-- ----------------------------------------------------------------------------
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
    v_total_usd NUMERIC(10,2) := 0.00;
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

    -- Obtener la recepción
    EXECUTE format('
        SELECT id, receipt_number, supplier_id, store_id, status, with_stock_entry, supplier_bill_number
        FROM %I.cxp_goods_receipts
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_receipt USING p_receipt_id;

    IF v_receipt.id IS NULL THEN
        RAISE EXCEPTION 'Recepción de mercancía no encontrada.';
    END IF;

    -- Idempotencia
    IF v_receipt.status = 'CONFIRMED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'La recepción ya fue confirmada previamente.');
    END IF;

    IF v_receipt.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'No se puede confirmar una recepción anulada.';
    END IF;

    -- Obtener proveedor
    EXECUTE format('
        SELECT id, name, payment_terms_days
        FROM %I.cxp_suppliers
        WHERE id = $1
    ', v_schema) INTO v_supplier USING v_receipt.supplier_id;

    v_store_id := v_receipt.store_id;

    -- Procesar cada ítem: kardex + cálculo de total
    FOR v_item IN
        EXECUTE format('
            SELECT id, product_id, quantity, unit_cost_usd, total_usd
            FROM %I.cxp_goods_receipt_items
            WHERE receipt_id = $1
        ', v_schema) USING p_receipt_id
    LOOP
        v_total_usd := v_total_usd + v_item.total_usd;

        -- Entrada al kardex e inventario físico si aplica
        IF v_receipt.with_stock_entry THEN
            -- Asegurar fila en inventario por sucursal
            EXECUTE format('
                INSERT INTO %I.inventory (store_id, product_id, quantity)
                VALUES ($1, $2, 0)
                ON CONFLICT (store_id, product_id) DO NOTHING
            ', v_schema) USING v_store_id, v_item.product_id;

            -- Leer stock anterior
            EXECUTE format('
                SELECT quantity FROM %I.inventory
                WHERE store_id = $1 AND product_id = $2 FOR UPDATE
            ', v_schema) INTO v_cur_stock USING v_store_id, v_item.product_id;

            v_new_stock := COALESCE(v_cur_stock, 0) + v_item.quantity;

            -- Actualizar stock de inventario (el trigger sincroniza products.current_stock)
            EXECUTE format('
                UPDATE %I.inventory
                SET quantity = $1, updated_at = now()
                WHERE store_id = $2 AND product_id = $3
            ', v_schema) USING v_new_stock, v_store_id, v_item.product_id;

            -- Movimiento Kardex PURCHASE_IN
            EXECUTE format('
                INSERT INTO %I.inventory_movements (
                    store_id, product_id, movement_type, quantity,
                    previous_quantity, new_quantity, reference_id, notes, created_by
                ) VALUES ($1, $2, ''PURCHASE_IN'', $3, $4, $5, $6, $7, $8)
            ', v_schema) USING
                v_store_id,
                v_item.product_id,
                v_item.quantity,
                COALESCE(v_cur_stock, 0),
                v_new_stock,
                v_receipt.receipt_number,
                format('Recepción de taller / proveedor: %s', v_supplier.name),
                p_actor_id;
        END IF;
    END LOOP;

    IF v_total_usd <= 0 THEN
        RAISE EXCEPTION 'La recepción no contiene ítems con monto válido.';
    END IF;

    -- Generar correlativo de factura CXP-YYYYMM-######
    EXECUTE format('
        SELECT format(''CXP-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_bill_seq'')::text, 6, ''0''))
    ', v_schema) INTO v_bill_num;

    -- Crear factura/nota por pagar
    EXECUTE format('
        INSERT INTO %I.cxp_bills (
            internal_number, supplier_bill_number, supplier_id, origin,
            goods_receipt_id, issue_date, due_date, total_usd, balance_usd,
            status, created_by
        ) VALUES (
            $1, $2, $3, ''GOODS_RECEIPT'',
            $4, CURRENT_DATE, CURRENT_DATE + COALESCE($5, 15), $6, $6,
            ''OPEN'', $7
        ) RETURNING id
    ', v_schema) INTO v_bill_id USING
        v_bill_num,
        COALESCE(p_supplier_bill_number, v_receipt.supplier_bill_number),
        v_receipt.supplier_id,
        v_receipt.id,
        v_supplier.payment_terms_days,
        v_total_usd,
        p_actor_id;

    -- Marcar recepción CONFIRMED
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
        'internal_number', v_bill_num,
        'total_usd', v_total_usd
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- ----------------------------------------------------------------------------
-- RPC 2: Registro de Pagos / Abonos a Facturas (con anti-sobrepago)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.rpc_cxp_pay_bill(
    p_schema TEXT,
    p_bill_id UUID,
    p_account_id UUID,
    p_currency TEXT,
    p_original_amount NUMERIC,
    p_exchange_rate NUMERIC,
    p_rate_override_reason TEXT,
    p_actor_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_bill RECORD;
    v_pay_num TEXT;
    v_amount_usd NUMERIC(10,2);
    v_new_balance NUMERIC(10,2);
    v_new_status TEXT;
    v_payment_id UUID;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    -- Validar factura
    EXECUTE format('
        SELECT id, internal_number, supplier_id, total_usd, balance_usd, status
        FROM %I.cxp_bills
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_bill USING p_bill_id;

    IF v_bill.id IS NULL THEN
        RAISE EXCEPTION 'Factura / Nota de compra no encontrada.';
    END IF;

    IF v_bill.status NOT IN ('OPEN', 'PARTIAL') OR v_bill.balance_usd <= 0 THEN
        RAISE EXCEPTION 'La factura ya se encuentra totalmente liquidada o anulada.';
    END IF;

    -- Calcular monto en USD
    IF p_currency = 'VES' THEN
        IF p_exchange_rate <= 0 THEN
            RAISE EXCEPTION 'Tasa de cambio inválida para pago en bolívares.';
        END IF;
        v_amount_usd := round(p_original_amount / p_exchange_rate, 2);
    ELSE
        v_amount_usd := round(p_original_amount, 2);
    END IF;

    -- Anti-sobrepago estricto
    IF v_amount_usd > (v_bill.balance_usd + 0.01) THEN
        RAISE EXCEPTION 'El monto abonado ($%) excede el saldo pendiente ($%).', v_amount_usd, v_bill.balance_usd;
    END IF;

    -- Ajustar redondeo al centavo si cubre el saldo total
    IF abs(v_amount_usd - v_bill.balance_usd) <= 0.02 THEN
        v_amount_usd := v_bill.balance_usd;
    END IF;

    v_new_balance := round(v_bill.balance_usd - v_amount_usd, 2);
    IF v_new_balance <= 0.005 THEN
        v_new_balance := 0.00;
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
            payment_number, bill_id, account_id, currency,
            original_amount, exchange_rate, amount_usd,
            balance_before_usd, balance_after_usd,
            rate_override_reason, paid_by, notes
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9,
            $10, $11, $12
        ) RETURNING id
    ', v_schema) INTO v_payment_id USING
        v_pay_num,
        v_bill.id,
        p_account_id,
        p_currency,
        p_original_amount,
        COALESCE(p_exchange_rate, 1.0000),
        v_amount_usd,
        v_bill.balance_usd,
        v_new_balance,
        p_rate_override_reason,
        p_actor_id,
        p_notes;

    -- Actualizar factura
    EXECUTE format('
        UPDATE %I.cxp_bills
        SET balance_usd = $1,
            status = $2,
            updated_at = now()
        WHERE id = $3
    ', v_schema) USING v_new_balance, v_new_status, v_bill.id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_number', v_pay_num,
        'amount_usd', v_amount_usd,
        'balance_before', v_bill.balance_usd,
        'balance_after', v_new_balance,
        'status', v_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- ----------------------------------------------------------------------------
-- RPC 3: Registro de Anticipos a Fabricantes (con 3 modalidades)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.rpc_cxp_register_advance(
    p_schema TEXT,
    p_supplier_id UUID,
    p_amount_usd NUMERIC,
    p_account_id UUID,
    p_currency TEXT,
    p_original_amount NUMERIC,
    p_exchange_rate NUMERIC,
    p_purpose TEXT,
    p_actor_id UUID,
    p_link_option TEXT,               -- 'LINK_EXISTING' | 'UNLINKED'
    p_bill_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_adv_num TEXT;
    v_adv_id UUID;
    v_bill RECORD;
    v_applied NUMERIC(10,2) := 0.00;
    v_app_status TEXT := 'OPEN';
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    -- Generar correlativo ANT-YYYYMM-######
    EXECUTE format('
        SELECT format(''ANT-%s-%s'', to_char(CURRENT_DATE, ''YYYYMM''), lpad(nextval(''%I.cxp_advance_seq'')::text, 6, ''0''))
    ', v_schema) INTO v_adv_num;

    -- Crear anticipo en estado base
    EXECUTE format('
        INSERT INTO %I.cxp_advances (
            advance_number, supplier_id, amount_usd, applied_usd,
            account_id, currency, original_amount, exchange_rate,
            purpose, status, created_by
        ) VALUES (
            $1, $2, $3, 0.00,
            $4, $5, $6, COALESCE($7, 1.0000),
            $8, ''OPEN'', $9
        ) RETURNING id
    ', v_schema) INTO v_adv_id USING
        v_adv_num,
        p_supplier_id,
        p_amount_usd,
        p_account_id,
        p_currency,
        p_original_amount,
        p_exchange_rate,
        p_purpose,
        p_actor_id;

    -- Si se solicita vincular a una factura existente de inmediato
    IF p_link_option = 'LINK_EXISTING' AND p_bill_id IS NOT NULL THEN
        EXECUTE format('
            SELECT id, balance_usd, status
            FROM %I.cxp_bills
            WHERE id = $1 AND supplier_id = $2 FOR UPDATE
        ', v_schema) INTO v_bill USING p_bill_id, p_supplier_id;

        IF v_bill.id IS NOT NULL AND v_bill.balance_usd > 0 THEN
            v_applied := LEAST(p_amount_usd, v_bill.balance_usd);

            -- Crear aplicación de anticipo
            EXECUTE format('
                INSERT INTO %I.cxp_advance_applications (
                    advance_id, bill_id, amount_usd, applied_by
                ) VALUES ($1, $2, $3, $4)
            ', v_schema) USING v_adv_id, v_bill.id, v_applied, p_actor_id;

            -- Actualizar anticipo
            v_app_status := CASE WHEN v_applied >= p_amount_usd THEN 'APPLIED' ELSE 'OPEN' END;
            EXECUTE format('
                UPDATE %I.cxp_advances
                SET applied_usd = $1, status = $2, updated_at = now()
                WHERE id = $3
            ', v_schema) USING v_applied, v_app_status, v_adv_id;

            -- Actualizar factura
            EXECUTE format('
                UPDATE %I.cxp_bills
                SET balance_usd = round(balance_usd - $1, 2),
                    status = CASE WHEN balance_usd - $1 <= 0.005 THEN ''PAID'' ELSE ''PARTIAL'' END,
                    updated_at = now()
                WHERE id = $2
            ', v_schema) USING v_applied, v_bill.id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'advance_id', v_adv_id,
        'advance_number', v_adv_num,
        'amount_usd', p_amount_usd,
        'applied_usd', v_applied,
        'status', v_app_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- ----------------------------------------------------------------------------
-- RPC 4: Aplicar Anticipo Libre Existente a una Factura
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.rpc_cxp_apply_advance(
    p_schema TEXT,
    p_advance_id UUID,
    p_bill_id UUID,
    p_amount_usd NUMERIC,
    p_actor_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_adv RECORD;
    v_bill RECORD;
    v_avail NUMERIC(10,2);
    v_new_adv_applied NUMERIC(10,2);
    v_new_bill_bal NUMERIC(10,2);
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    -- Validar anticipo
    EXECUTE format('
        SELECT id, supplier_id, amount_usd, applied_usd, status
        FROM %I.cxp_advances
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_adv USING p_advance_id;

    IF v_adv.id IS NULL OR v_adv.status != 'OPEN' THEN
        RAISE EXCEPTION 'Anticipo no disponible o ya totalmente aplicado.';
    END IF;

    v_avail := round(v_adv.amount_usd - v_adv.applied_usd, 2);
    IF p_amount_usd > v_avail THEN
        RAISE EXCEPTION 'El monto a aplicar ($%) excede el saldo disponible del anticipo ($%).', p_amount_usd, v_avail;
    END IF;

    -- Validar factura
    EXECUTE format('
        SELECT id, supplier_id, balance_usd, status
        FROM %I.cxp_bills
        WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_bill USING p_bill_id;

    IF v_bill.id IS NULL OR v_bill.status NOT IN ('OPEN', 'PARTIAL') THEN
        RAISE EXCEPTION 'La factura no se encuentra pendiente de cobro.';
    END IF;

    IF p_amount_usd > v_bill.balance_usd THEN
        RAISE EXCEPTION 'El monto a aplicar ($%) excede el saldo de la factura ($%).', p_amount_usd, v_bill.balance_usd;
    END IF;

    -- Insertar o actualizar la aplicación
    EXECUTE format('
        INSERT INTO %I.cxp_advance_applications (
            advance_id, bill_id, amount_usd, applied_by
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (advance_id, bill_id) DO UPDATE SET
            amount_usd = %I.cxp_advance_applications.amount_usd + EXCLUDED.amount_usd,
            applied_at = now()
    ', v_schema, v_schema) USING p_advance_id, p_bill_id, p_amount_usd, p_actor_id;

    -- Actualizar anticipo
    v_new_adv_applied := round(v_adv.applied_usd + p_amount_usd, 2);
    EXECUTE format('
        UPDATE %I.cxp_advances
        SET applied_usd = $1,
            status = CASE WHEN $1 >= amount_usd THEN ''APPLIED'' ELSE ''OPEN'' END,
            updated_at = now()
        WHERE id = $2
    ', v_schema) USING v_new_adv_applied, p_advance_id;

    -- Actualizar factura
    v_new_bill_bal := round(v_bill.balance_usd - p_amount_usd, 2);
    EXECUTE format('
        UPDATE %I.cxp_bills
        SET balance_usd = $1,
            status = CASE WHEN $1 <= 0.005 THEN ''PAID'' ELSE ''PARTIAL'' END,
            updated_at = now()
        WHERE id = $2
    ', v_schema) USING v_new_bill_bal, p_bill_id;

    RETURN jsonb_build_object(
        'success', true,
        'applied_usd', p_amount_usd,
        'advance_remaining', round(v_adv.amount_usd - v_new_adv_applied, 2),
        'bill_balance', v_new_bill_bal
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;


-- ----------------------------------------------------------------------------
-- RPC 5: Compensaciones y Cruces entre Fabricantes (Doble Asiento Auditado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.rpc_cxp_record_compensation(
    p_schema TEXT,
    p_from_supplier_id UUID,
    p_to_supplier_id UUID,
    p_amount_usd NUMERIC,
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

    IF p_amount_usd <= 0 THEN
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
            from_bill_id, to_bill_id, amount_usd, reason, authorized_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
        ) RETURNING id
    ', v_schema) INTO v_comp_id USING
        v_comp_num,
        p_from_supplier_id,
        p_to_supplier_id,
        p_from_bill_id,
        p_to_bill_id,
        p_amount_usd,
        p_reason,
        p_authorized_by;

    -- Si se vinculó una factura origen (proveedor que entrega material / Sheraton), se reduce su deuda
    IF p_from_bill_id IS NOT NULL THEN
        EXECUTE format('
            UPDATE %I.cxp_bills
            SET balance_usd = round(GREATEST(0, balance_usd - $1), 2),
                status = CASE WHEN balance_usd - $1 <= 0.005 THEN ''PAID'' ELSE ''PARTIAL'' END,
                updated_at = now()
            WHERE id = $2
        ', v_schema) USING p_amount_usd, p_from_bill_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'compensation_id', v_comp_id,
        'compensation_number', v_comp_num,
        'amount_usd', p_amount_usd
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;
