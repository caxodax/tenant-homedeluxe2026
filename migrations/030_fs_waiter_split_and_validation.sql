-- ============================================================================
-- MIGRACIÓN 030: Food Service Pro — Estados de Cuenta Pedida / Por Validar,
-- Split Bill Parcial, Pago Móvil con Validación de Caja, Traslado y Liberación
-- ============================================================================

-- 1. Actualizar constraints en todos los esquemas con food_service instalado
DO $$
DECLARE
    v_schema TEXT;
    v_con_name TEXT;
BEGIN
    FOR v_schema IN
        SELECT table_schema
        FROM information_schema.tables
        WHERE table_schema LIKE 'tenant_%'
          AND table_name = 'fs_tables'
    LOOP
        -- Actualizar CHECK constraint de fs_tables.status
        FOR v_con_name IN
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = v_schema
              AND t.relname = 'fs_tables'
              AND c.contype = 'c'
              AND pg_get_constraintdef(c.oid) LIKE '%status%'
        LOOP
            EXECUTE format('ALTER TABLE %I.fs_tables DROP CONSTRAINT IF EXISTS %I', v_schema, v_con_name);
        END LOOP;

        EXECUTE format(
            'ALTER TABLE %I.fs_tables ADD CONSTRAINT fs_tables_status_check CHECK (status IN (''FREE'',''OCCUPIED'',''RESERVED'',''CLEANING'',''BILL_REQUESTED'',''PENDING_VALIDATION''))',
            v_schema
        );

        -- Actualizar CHECK constraint de fs_bill_splits.status para soportar VOID
        FOR v_con_name IN
            SELECT c.conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = v_schema
              AND t.relname = 'fs_bill_splits'
              AND c.contype = 'c'
              AND pg_get_constraintdef(c.oid) LIKE '%status%'
        LOOP
            EXECUTE format('ALTER TABLE %I.fs_bill_splits DROP CONSTRAINT IF EXISTS %I', v_schema, v_con_name);
        END LOOP;

        EXECUTE format(
            'ALTER TABLE %I.fs_bill_splits ADD CONSTRAINT fs_bill_splits_status_check CHECK (status IN (''PENDING'',''PAID'',''VOID''))',
            v_schema
        );
    END LOOP;
END $$;

-- 2. Actualizar platform.rpc_fs_pay_table para soportar Split Parcial, Referencia y Pago Pendiente de Caja
CREATE OR REPLACE FUNCTION platform.rpc_fs_pay_table(
    p_schema TEXT,
    p_ticket_id UUID,
    p_pay_mode TEXT DEFAULT 'FULL',
    p_splits JSONB DEFAULT '[]'::jsonb,
    p_tip_amount_primary NUMERIC DEFAULT 0.00,
    p_payment_method TEXT DEFAULT 'CASH',
    p_exchange_rate NUMERIC DEFAULT 1.0000,
    p_staff_id UUID DEFAULT NULL,
    p_reference_number TEXT DEFAULT NULL,
    p_mark_pending BOOLEAN DEFAULT false
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_table_id UUID;
    v_total_orders_primary NUMERIC(10,2) := 0.00;
    v_existing_covered NUMERIC(10,2) := 0.00;
    v_remaining_before NUMERIC(10,2) := 0.00;
    v_main_order_id UUID;
    v_exchange_rate NUMERIC(12,4);
    v_split JSONB;
    v_split_amount_primary NUMERIC(10,2);
    v_split_amount_secondary NUMERIC(14,2);
    v_next_split_no INTEGER := 1;
    v_payment_id UUID;
    v_pay_status TEXT;
    v_split_status TEXT;
    v_split_pending BOOLEAN;
    v_total_verified NUMERIC(10,2) := 0.00;
    v_total_pending NUMERIC(10,2) := 0.00;
    v_final_table_status TEXT;
    v_final_ticket_status TEXT;
    v_ref TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    v_exchange_rate := COALESCE(NULLIF(p_exchange_rate, 0), 1.0000);

    EXECUTE format('
        SELECT table_id FROM %I.fs_table_tickets WHERE id = %L
    ', v_schema, p_ticket_id) INTO v_table_id;

    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Ticket de mesa % no existe.', p_ticket_id;
    END IF;

    EXECUTE format('
        SELECT
            COALESCE(SUM(o.total_primary), 0.00),
            MIN(o.id::text)::uuid
        FROM %I.fs_ticket_orders tko
        JOIN %I.orders o ON o.id = tko.order_id
        WHERE tko.ticket_id = %L AND o.status != ''CANCELLED''
    ', v_schema, v_schema, p_ticket_id) INTO v_total_orders_primary, v_main_order_id;

    EXECUTE format('
        SELECT COALESCE(SUM(amount_primary), 0.00), COALESCE(MAX(split_no), 0) + 1
        FROM %I.fs_bill_splits
        WHERE ticket_id = %L AND status IN (''PAID'', ''PENDING'')
    ', v_schema, p_ticket_id) INTO v_existing_covered, v_next_split_no;

    v_remaining_before := GREATEST(v_total_orders_primary - v_existing_covered, 0.00);

    IF p_pay_mode = 'FULL' OR jsonb_array_length(p_splits) = 0 THEN
        v_pay_status := CASE WHEN p_mark_pending THEN 'PENDING' ELSE 'VERIFIED' END;
        v_split_status := CASE WHEN p_mark_pending THEN 'PENDING' ELSE 'PAID' END;
        v_ref := COALESCE(NULLIF(trim(p_reference_number), ''), 'MESA-' || left(p_ticket_id::text, 8));

        IF v_main_order_id IS NOT NULL AND v_remaining_before > 0.00 THEN
            EXECUTE format('
                INSERT INTO %I.payments (
                    order_id, method, amount, currency, exchange_rate, reference_number, status, verified_by, verified_at
                ) VALUES (
                    %L, %L, %L, ''USD'', %L, %L, %L, %L, %L
                ) RETURNING id;
            ', v_schema, v_main_order_id, COALESCE(p_payment_method, 'CASH'), v_remaining_before, v_exchange_rate,
               v_ref, v_pay_status,
               CASE WHEN NOT p_mark_pending THEN p_staff_id ELSE NULL END,
               CASE WHEN NOT p_mark_pending THEN now() ELSE NULL END
            ) INTO v_payment_id;
        END IF;

        EXECUTE format('
            INSERT INTO %I.fs_bill_splits (
                ticket_id, split_no, label, amount_primary, amount_secondary,
                exchange_rate_applied, status, payment_id
            ) VALUES (
                %L, %L, %L, %L, %L, %L, %L, %L
            )
        ', v_schema, p_ticket_id, v_next_split_no,
           CASE WHEN v_existing_covered > 0 THEN 'Pago Saldo Restante' ELSE 'Pago Total' END,
           v_remaining_before, round(v_remaining_before * v_exchange_rate, 2),
           v_exchange_rate, v_split_status, v_payment_id);
    ELSE
        FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
        LOOP
            v_split_amount_primary := COALESCE((v_split->>'amount_primary')::NUMERIC, 0.00);
            IF v_split_amount_primary <= 0.00 THEN
                CONTINUE;
            END IF;

            v_split_amount_secondary := COALESCE((v_split->>'amount_secondary')::NUMERIC, round(v_split_amount_primary * v_exchange_rate, 2));
            v_split_pending := COALESCE((v_split->>'mark_pending')::BOOLEAN, p_mark_pending);
            v_pay_status := CASE WHEN v_split_pending THEN 'PENDING' ELSE 'VERIFIED' END;
            v_split_status := CASE WHEN v_split_pending THEN 'PENDING' ELSE 'PAID' END;
            v_ref := COALESCE(NULLIF(trim(v_split->>'reference'), ''), NULLIF(trim(p_reference_number), ''), 'SPLIT-' || v_next_split_no);

            v_payment_id := NULL;
            IF v_main_order_id IS NOT NULL THEN
                EXECUTE format('
                    INSERT INTO %I.payments (
                        order_id, method, amount, currency, exchange_rate, reference_number, status, verified_by, verified_at
                    ) VALUES (
                        %L, %L, %L, ''USD'', %L, %L, %L, %L, %L
                    ) RETURNING id;
                ', v_schema, v_main_order_id, COALESCE(v_split->>'method', p_payment_method, 'CASH'),
                   v_split_amount_primary, v_exchange_rate, v_ref, v_pay_status,
                   CASE WHEN NOT v_split_pending THEN p_staff_id ELSE NULL END,
                   CASE WHEN NOT v_split_pending THEN now() ELSE NULL END
                ) INTO v_payment_id;
            END IF;

            EXECUTE format('
                INSERT INTO %I.fs_bill_splits (
                    ticket_id, split_no, label, item_refs, amount_primary, amount_secondary,
                    exchange_rate_applied, status, payment_id
                ) VALUES (
                    %L, %L, %L, %L::jsonb, %L, %L, %L, %L, %L
                )
            ', v_schema, p_ticket_id, v_next_split_no,
               COALESCE(v_split->>'label', 'Subcuenta ' || v_next_split_no),
               COALESCE(v_split->'item_refs', '[]'::jsonb),
               v_split_amount_primary, v_split_amount_secondary,
               v_exchange_rate, v_split_status, v_payment_id);

            v_next_split_no := v_next_split_no + 1;
        END LOOP;
    END IF;

    -- Recalcular cobertura total del ticket
    EXECUTE format('
        SELECT
            COALESCE(SUM(CASE WHEN status = ''PAID'' THEN amount_primary ELSE 0 END), 0.00),
            COALESCE(SUM(CASE WHEN status = ''PENDING'' THEN amount_primary ELSE 0 END), 0.00)
        FROM %I.fs_bill_splits
        WHERE ticket_id = %L
    ', v_schema, p_ticket_id) INTO v_total_verified, v_total_pending;

    IF (v_total_verified + v_total_pending) >= (v_total_orders_primary - 0.01) THEN
        IF v_total_pending > 0.00 THEN
            -- Todo cubierto, pero hay Pago Móvil/transferencia pendiente de confirmar por Caja
            v_final_ticket_status := 'OPEN';
            v_final_table_status := 'PENDING_VALIDATION';
        ELSE
            -- 100% verificado y liquidado
            v_final_ticket_status := 'CLOSED';
            v_final_table_status := 'FREE';

            EXECUTE format('
                UPDATE %I.fs_table_tickets
                SET status = ''CLOSED'', closed_at = now()
                WHERE id = %L
            ', v_schema, p_ticket_id);

            EXECUTE format('
                UPDATE %I.orders o
                SET status = CASE WHEN o.status IN (''CREATED'', ''CONFIRMED'', ''PREPARING'', ''READY_FOR_PICKUP'') THEN ''DELIVERED'' ELSE o.status END,
                    updated_at = now()
                FROM %I.fs_ticket_orders tko
                WHERE tko.order_id = o.id AND tko.ticket_id = %L AND o.status != ''CANCELLED''
            ', v_schema, v_schema, p_ticket_id);
        END IF;
    ELSE
        -- Pago parcial: aún queda saldo pendiente en la mesa
        v_final_ticket_status := 'OPEN';
        v_final_table_status := 'OCCUPIED';
    END IF;

    EXECUTE format('
        UPDATE %I.fs_tables
        SET status = %L
        WHERE id = %L
    ', v_schema, v_final_table_status, v_table_id);

    RETURN jsonb_build_object(
        'success', true,
        'ticket_id', p_ticket_id,
        'table_id', v_table_id,
        'total_orders_primary', v_total_orders_primary,
        'total_verified_primary', v_total_verified,
        'total_pending_primary', v_total_pending,
        'remaining_primary', GREATEST(v_total_orders_primary - v_total_verified - v_total_pending, 0.00),
        'ticket_status', v_final_ticket_status,
        'table_status', v_final_table_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;

-- 3. RPC para Validar o Rechazar un Pago Reportado por Mesero (desde Caja)
CREATE OR REPLACE FUNCTION platform.rpc_fs_validate_table_payment(
    p_schema TEXT,
    p_ticket_id UUID,
    p_payment_id UUID,
    p_approve BOOLEAN,
    p_staff_id UUID DEFAULT NULL,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_table_id UUID;
    v_total_orders_primary NUMERIC(10,2) := 0.00;
    v_total_verified NUMERIC(10,2) := 0.00;
    v_total_pending NUMERIC(10,2) := 0.00;
    v_final_table_status TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    EXECUTE format('SELECT table_id FROM %I.fs_table_tickets WHERE id = %L', v_schema, p_ticket_id) INTO v_table_id;
    IF v_table_id IS NULL THEN
        RAISE EXCEPTION 'Ticket de mesa % no existe.', p_ticket_id;
    END IF;

    IF p_approve THEN
        EXECUTE format('
            UPDATE %I.payments
            SET status = ''VERIFIED'', verified_by = %L, verified_at = now()
            WHERE id = %L
        ', v_schema, p_staff_id, p_payment_id);

        EXECUTE format('
            UPDATE %I.fs_bill_splits
            SET status = ''PAID''
            WHERE ticket_id = %L AND payment_id = %L
        ', v_schema, p_ticket_id, p_payment_id);
    ELSE
        EXECUTE format('
            UPDATE %I.payments
            SET status = ''REJECTED'', verified_by = %L, verified_at = now(), rejection_reason = %L
            WHERE id = %L
        ', v_schema, p_staff_id, COALESCE(p_rejection_reason, 'Pago no encontrado en cuenta'), p_payment_id);

        EXECUTE format('
            UPDATE %I.fs_bill_splits
            SET status = ''VOID''
            WHERE ticket_id = %L AND payment_id = %L
        ', v_schema, p_ticket_id, p_payment_id);
    END IF;

    EXECUTE format('
        SELECT COALESCE(SUM(o.total_primary), 0.00)
        FROM %I.fs_ticket_orders tko
        JOIN %I.orders o ON o.id = tko.order_id
        WHERE tko.ticket_id = %L AND o.status != ''CANCELLED''
    ', v_schema, v_schema, p_ticket_id) INTO v_total_orders_primary;

    EXECUTE format('
        SELECT
            COALESCE(SUM(CASE WHEN status = ''PAID'' THEN amount_primary ELSE 0 END), 0.00),
            COALESCE(SUM(CASE WHEN status = ''PENDING'' THEN amount_primary ELSE 0 END), 0.00)
        FROM %I.fs_bill_splits
        WHERE ticket_id = %L
    ', v_schema, p_ticket_id) INTO v_total_verified, v_total_pending;

    IF v_total_pending = 0.00 AND v_total_verified >= (v_total_orders_primary - 0.01) THEN
        v_final_table_status := 'FREE';
        EXECUTE format('UPDATE %I.fs_table_tickets SET status = ''CLOSED'', closed_at = now() WHERE id = %L', v_schema, p_ticket_id);
        EXECUTE format('
            UPDATE %I.orders o
            SET status = CASE WHEN o.status IN (''CREATED'', ''CONFIRMED'', ''PREPARING'', ''READY_FOR_PICKUP'') THEN ''DELIVERED'' ELSE o.status END,
                updated_at = now()
            FROM %I.fs_ticket_orders tko
            WHERE tko.order_id = o.id AND tko.ticket_id = %L AND o.status != ''CANCELLED''
        ', v_schema, v_schema, p_ticket_id);
    ELSIF v_total_pending > 0.00 AND (v_total_verified + v_total_pending) >= (v_total_orders_primary - 0.01) THEN
        v_final_table_status := 'PENDING_VALIDATION';
    ELSIF NOT p_approve THEN
        v_final_table_status := 'BILL_REQUESTED';
    ELSE
        v_final_table_status := 'OCCUPIED';
    END IF;

    EXECUTE format('UPDATE %I.fs_tables SET status = %L WHERE id = %L', v_schema, v_final_table_status, v_table_id);

    RETURN jsonb_build_object(
        'success', true,
        'approved', p_approve,
        'table_id', v_table_id,
        'table_status', v_final_table_status,
        'remaining_primary', GREATEST(v_total_orders_primary - v_total_verified - v_total_pending, 0.00)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;

-- 4. RPC para Trasladar Mesa (Mover comanda abierta de una mesa a otra libre)
CREATE OR REPLACE FUNCTION platform.rpc_fs_move_table(
    p_schema TEXT,
    p_from_table_id UUID,
    p_to_table_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_from_status TEXT;
    v_to_status TEXT;
    v_ticket_id UUID;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_from_table_id = p_to_table_id THEN
        RAISE EXCEPTION 'La mesa de origen y destino deben ser diferentes.';
    END IF;

    EXECUTE format('SELECT status FROM %I.fs_tables WHERE id = %L', v_schema, p_from_table_id) INTO v_from_status;
    EXECUTE format('SELECT status FROM %I.fs_tables WHERE id = %L', v_schema, p_to_table_id) INTO v_to_status;

    IF v_from_status IS NULL OR v_to_status IS NULL THEN
        RAISE EXCEPTION 'Mesa de origen o destino no encontrada.';
    END IF;

    IF v_to_status != 'FREE' THEN
        RAISE EXCEPTION 'La mesa destino debe estar LIBRE para recibir el traslado.';
    END IF;

    EXECUTE format('SELECT id FROM %I.fs_table_tickets WHERE table_id = %L AND status = ''OPEN'' LIMIT 1', v_schema, p_from_table_id) INTO v_ticket_id;
    IF v_ticket_id IS NULL THEN
        RAISE EXCEPTION 'La mesa origen no tiene una comanda abierta.';
    END IF;

    EXECUTE format('UPDATE %I.fs_table_tickets SET table_id = %L WHERE id = %L', v_schema, p_to_table_id, v_ticket_id);
    EXECUTE format('UPDATE %I.fs_tables SET status = %L WHERE id = %L', v_schema, v_from_status, p_to_table_id);
    EXECUTE format('UPDATE %I.fs_tables SET status = ''FREE'' WHERE id = %L', v_schema, p_from_table_id);

    RETURN jsonb_build_object(
        'success', true,
        'ticket_id', v_ticket_id,
        'from_table_id', p_from_table_id,
        'to_table_id', p_to_table_id,
        'status', v_from_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;

-- 5. RPC para Liberar Mesa Vacía (abierta por error sin órdenes)
CREATE OR REPLACE FUNCTION platform.rpc_fs_release_empty_table(
    p_schema TEXT,
    p_table_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_ticket_id UUID;
    v_orders_count INTEGER := 0;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    EXECUTE format('SELECT id FROM %I.fs_table_tickets WHERE table_id = %L AND status = ''OPEN'' LIMIT 1', v_schema, p_table_id) INTO v_ticket_id;

    IF v_ticket_id IS NOT NULL THEN
        EXECUTE format('
            SELECT COUNT(*) FROM %I.fs_ticket_orders tko
            JOIN %I.orders o ON o.id = tko.order_id
            WHERE tko.ticket_id = %L AND o.status != ''CANCELLED''
        ', v_schema, v_schema, v_ticket_id) INTO v_orders_count;

        IF v_orders_count > 0 THEN
            RAISE EXCEPTION 'Esta mesa tiene % pedido(s) activo(s) y no puede liberarse vacía.', v_orders_count;
        END IF;

        EXECUTE format('UPDATE %I.fs_table_tickets SET status = ''VOIDED'', closed_at = now() WHERE id = %L', v_schema, v_ticket_id);
    END IF;

    EXECUTE format('UPDATE %I.fs_tables SET status = ''FREE'' WHERE id = %L', v_schema, p_table_id);

    RETURN jsonb_build_object('success', true, 'table_id', p_table_id, 'status', 'FREE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;
