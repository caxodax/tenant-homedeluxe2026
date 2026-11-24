-- ============================================================================
-- MIGRACIÓN 031: RPCS TRANSACCIONALES CANÓNICOS DE NÓMINA (FASE 18.3)
-- ============================================================================

-- 1. rpc_pay_generate_run
CREATE OR REPLACE FUNCTION platform.rpc_pay_generate_run(
    p_schema TEXT,
    p_period_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_short TEXT;
    v_period RECORD;
    v_run RECORD;
    v_run_id UUID;
    v_run_number TEXT;
    v_emp RECORD;
    v_days_in_period INTEGER;
    v_days_worked INTEGER;
    v_prorated_base NUMERIC(10,2);
    v_advance_deduction NUMERIC(10,2);
    v_adv RECORD;
    v_installment_amount NUMERIC(10,2);
    v_net_primary NUMERIC(10,2);
    v_lines_count INTEGER := 0;
    v_tot_base NUMERIC(10,2) := 0.00;
    v_tot_deductions NUMERIC(10,2) := 0.00;
    v_tot_net NUMERIC(10,2) := 0.00;
    v_concepts JSONB;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;
    v_short := replace(v_schema, 'tenant_', '');

    -- 1. Validar período
    EXECUTE format('
        SELECT * FROM %1$I.pay_periods WHERE id = $1
    ', v_schema) INTO v_period USING p_period_id;

    IF v_period.id IS NULL THEN
        RAISE EXCEPTION 'El período de nómina no existe.';
    END IF;

    IF v_period.status = 'DISBURSED' THEN
        RAISE EXCEPTION 'El período ya ha sido liquidado y pagado.';
    END IF;

    -- Días del período calendario
    v_days_in_period := (v_period.end_date - v_period.start_date + 1);
    IF v_days_in_period <= 0 THEN v_days_in_period := 15; END IF;

    -- 2. Buscar corrida existente en DRAFT o crear nueva
    EXECUTE format('
        SELECT * FROM %1$I.pay_runs WHERE period_id = $1 FOR UPDATE
    ', v_schema) INTO v_run USING p_period_id;

    IF v_run.id IS NOT NULL THEN
        IF v_run.status IN ('APPROVED', 'DISBURSED') THEN
            RAISE EXCEPTION 'La corrida de nómina para este período ya está % y no puede regenerarse.', v_run.status;
        END IF;
        v_run_id := v_run.id;
        v_run_number := v_run.run_number;
    ELSE
        -- Generar run_number
        EXECUTE format('
            SELECT ''RUN-'' || to_char(now(), ''YYYYMM'') || ''-'' || lpad(nextval(''%1$I.pay_run_seq'')::text, 6, ''0'')
        ', v_schema) INTO v_run_number;

        EXECUTE format('
            INSERT INTO %1$I.pay_runs (
                run_number, period_id, run_type, status, notes
            ) VALUES (
                $1, $2, ''REGULAR'', ''DRAFT'', ''Generado automáticamente''
            ) RETURNING id
        ', v_schema) INTO v_run_id USING v_run_number, p_period_id;
    END IF;

    -- 3. Limpiar líneas previas de la corrida en DRAFT si se está recalculando
    EXECUTE format('DELETE FROM %1$I.pay_run_lines WHERE run_id = $1', v_schema) USING v_run_id;

    -- 4. Iterar sobre colaboradores activos con la frecuencia del período
    FOR v_emp IN EXECUTE format('
        SELECT * FROM %1$I.pay_employees 
        WHERE is_active = true 
          AND payment_frequency = $1
        ORDER BY last_name, first_name
    ', v_schema) USING v_period.payment_frequency LOOP

        -- Calcular días laborados considerando hired_at y terminated_at
        v_days_worked := v_days_in_period;

        IF v_emp.hired_at > v_period.start_date THEN
            v_days_worked := (v_period.end_date - v_emp.hired_at + 1);
        END IF;

        IF v_emp.terminated_at IS NOT NULL AND v_emp.terminated_at < v_period.end_date THEN
            v_days_worked := (v_emp.terminated_at - GREATEST(v_period.start_date, v_emp.hired_at) + 1);
        END IF;

        IF v_days_worked < 0 THEN v_days_worked := 0; END IF;
        IF v_days_worked > v_days_in_period THEN v_days_worked := v_days_in_period; END IF;

        -- Prorrateo del sueldo base (asumiendo que base_salary_primary es el monto para el período estándar)
        IF v_days_worked >= v_days_in_period THEN
            v_prorated_base := v_emp.base_salary_primary;
        ELSE
            v_prorated_base := ROUND((v_emp.base_salary_primary * v_days_worked) / v_days_in_period, 2);
        END IF;

        -- Buscar adelantos activos por descontar
        v_advance_deduction := 0.00;
        FOR v_adv IN EXECUTE format('
            SELECT * FROM %1$I.pay_advances 
            WHERE employee_id = $1 
              AND status IN (''APPROVED'', ''PARTIALLY_DEDUCTED'') 
              AND pending_amount_primary > 0
            ORDER BY created_at ASC
        ', v_schema) USING v_emp.id LOOP
            -- Calcular cuota por cuota
            v_installment_amount := ROUND(v_adv.approved_amount_primary / NULLIF(v_adv.installments_total, 0), 2);
            IF v_installment_amount > v_adv.pending_amount_primary THEN
                v_installment_amount := v_adv.pending_amount_primary;
            END IF;
            -- No deducir más que el sueldo base prorrateado
            IF (v_advance_deduction + v_installment_amount) <= v_prorated_base THEN
                v_advance_deduction := v_advance_deduction + v_installment_amount;
            END IF;
        END LOOP;

        v_net_primary := GREATEST(0.00, v_prorated_base - v_advance_deduction);

        -- Construir desglose de conceptos inicial
        v_concepts := jsonb_build_array(
            jsonb_build_object(
                'code', 'SUELDO_BASE',
                'name', 'Sueldo Base (' || v_days_worked || ' días)',
                'type', 'EARNING',
                'amount_primary', v_prorated_base
            )
        );

        IF v_advance_deduction > 0.00 THEN
            v_concepts := v_concepts || jsonb_build_object(
                'code', 'ANTICIPO_SUELDO',
                'name', 'Amortización de Adelanto',
                'type', 'DEDUCTION',
                'amount_primary', v_advance_deduction
            );
        END IF;

        -- Insertar línea de corrida
        EXECUTE format('
            INSERT INTO %1$I.pay_run_lines (
                run_id, employee_id, days_worked,
                base_salary_primary, commissions_primary, allowances_primary,
                deductions_primary, net_salary_primary,
                exchange_rate_snapshot, net_salary_secondary,
                concepts_breakdown, status
            ) VALUES (
                $1, $2, $3, $4, 0.00, 0.00, $5, $6, 1.0000, $6, $7, ''PENDING''
            )
        ', v_schema) USING v_run_id, v_emp.id, v_days_worked, v_prorated_base, v_advance_deduction, v_net_primary, v_concepts;

        v_lines_count := v_lines_count + 1;
        v_tot_base := v_tot_base + v_prorated_base;
        v_tot_deductions := v_tot_deductions + v_advance_deduction;
        v_tot_net := v_tot_net + v_net_primary;
    END LOOP;

    -- Actualizar cabecera de la corrida
    EXECUTE format('
        UPDATE %1$I.pay_runs
        SET total_base_primary = $2,
            total_commissions_primary = 0.00,
            total_allowances_primary = 0.00,
            total_deductions_primary = $3,
            total_net_primary = $4,
            total_net_secondary = $4,
            status = ''CALCULATED'',
            updated_at = now()
        WHERE id = $1
    ', v_schema) USING v_run_id, v_tot_base, v_tot_deductions, v_tot_net;

    -- Actualizar estado del período
    EXECUTE format('
        UPDATE %1$I.pay_periods SET status = ''PROJECTED'', updated_at = now() WHERE id = $1
    ', v_schema) USING p_period_id;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', v_run_id,
        'run_number', v_run_number,
        'period_id', p_period_id,
        'employees_count', v_lines_count,
        'total_base_primary', v_tot_base,
        'total_deductions_primary', v_tot_deductions,
        'total_net_primary', v_tot_net
    );
END;
$$;


-- 2. rpc_pay_import_sales_commissions
CREATE OR REPLACE FUNCTION platform.rpc_pay_import_sales_commissions(
    p_schema TEXT,
    p_run_id UUID,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_run RECORD;
    v_period RECORD;
    v_has_orders BOOLEAN := false;
    v_line RECORD;
    v_sales_base NUMERIC(10,2);
    v_commission_pct NUMERIC(5,2);
    v_comm_amount NUMERIC(10,2);
    v_imported_count INTEGER := 0;
    v_tot_commissions NUMERIC(10,2) := 0.00;
    v_new_net NUMERIC(10,2);
    v_new_concepts JSONB;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    -- Validar corrida
    EXECUTE format('
        SELECT * FROM %1$I.pay_runs WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_run USING p_run_id;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'La corrida de nómina no existe.';
    END IF;

    IF v_run.status IN ('APPROVED', 'DISBURSED') THEN
        RAISE EXCEPTION 'No se pueden modificar comisiones en una corrida en estado %.', v_run.status;
    END IF;

    -- Obtener fechas del período
    EXECUTE format('SELECT * FROM %1$I.pay_periods WHERE id = $1', v_schema)
    INTO v_period USING v_run.period_id;

    -- Verificar si existe tabla orders
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = v_schema AND table_name = 'orders'
    ) INTO v_has_orders;

    IF NOT v_has_orders THEN
        RETURN jsonb_build_object(
            'success', true,
            'imported_count', 0,
            'total_commissions_primary', 0.00,
            'message', 'Tabla orders no existe en el esquema. Comisiones en 0.00.'
        );
    END IF;

    -- Iterar sobre las líneas de la corrida
    FOR v_line IN EXECUTE format('
        SELECT rl.*, e.staff_id, e.job_title, e.department
        FROM %1$I.pay_run_lines rl
        JOIN %1$I.pay_employees e ON e.id = rl.employee_id
        WHERE rl.run_id = $1
    ', v_schema) USING p_run_id LOOP

        v_comm_amount := 0.00;

        -- Si el empleado está vinculado a staff_profiles, buscar ventas confirmadas/entregadas
        IF v_line.staff_id IS NOT NULL THEN
            -- Base = subtotal_primary - discount_primary en órdenes confirmadas/entregadas
            EXECUTE format('
                SELECT COALESCE(SUM(GREATEST(0, subtotal_primary - discount_primary)), 0.00)
                FROM %1$I.orders
                WHERE sales_rep_id = $1
                  AND status IN (''CONFIRMED'', ''READY_FOR_PICKUP'', ''DELIVERED'')
                  AND created_at >= $2::timestamptz
                  AND created_at <= ($3::date + 1)::timestamptz
            ', v_schema) INTO v_sales_base 
            USING v_line.staff_id, v_period.start_date, v_period.end_date;

            -- Porcentaje de comisión estándar (3% para ventas)
            v_commission_pct := 3.00;
            IF v_sales_base > 0.00 THEN
                v_comm_amount := ROUND((v_sales_base * v_commission_pct) / 100.0, 2);
            END IF;
        END IF;

        IF v_comm_amount > 0.00 THEN
            v_imported_count := v_imported_count + 1;
            v_tot_commissions := v_tot_commissions + v_comm_amount;

            -- Recalcular neto de la línea
            v_new_net := GREATEST(0.00, (v_line.base_salary_primary + v_comm_amount + v_line.allowances_primary) - v_line.deductions_primary);

            -- Actualizar desglose de conceptos
            v_new_concepts := v_line.concepts_breakdown;
            -- Remover comisión previa si existía
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(v_new_concepts) elem
            WHERE elem->>'code' != 'COMISION_VENTAS'
            INTO v_new_concepts;

            v_new_concepts := v_new_concepts || jsonb_build_object(
                'code', 'COMISION_VENTAS',
                'name', 'Comisión Ventas (Base: $' || v_sales_base || ' al ' || v_commission_pct || '%)',
                'type', 'COMMISSION',
                'amount_primary', v_comm_amount
            );

            EXECUTE format('
                UPDATE %1$I.pay_run_lines
                SET commissions_primary = $2,
                    net_salary_primary = $3,
                    net_salary_secondary = $3,
                    concepts_breakdown = $4
                WHERE id = $1
            ', v_schema) USING v_line.id, v_comm_amount, v_new_net, v_new_concepts;
        END IF;
    END LOOP;

    -- Recalcular totales de pay_runs
    EXECUTE format('
        UPDATE %1$I.pay_runs
        SET total_commissions_primary = COALESCE((SELECT SUM(commissions_primary) FROM %1$I.pay_run_lines WHERE run_id = $1), 0.00),
            total_net_primary = COALESCE((SELECT SUM(net_salary_primary) FROM %1$I.pay_run_lines WHERE run_id = $1), 0.00),
            total_net_secondary = COALESCE((SELECT SUM(net_salary_primary) FROM %1$I.pay_run_lines WHERE run_id = $1), 0.00),
            updated_at = now()
        WHERE id = $1
    ', v_schema) USING p_run_id;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', p_run_id,
        'imported_count', v_imported_count,
        'total_commissions_primary', v_tot_commissions
    );
END;
$$;


-- 3. rpc_pay_approve_run
CREATE OR REPLACE FUNCTION platform.rpc_pay_approve_run(
    p_schema TEXT,
    p_run_id UUID,
    p_exchange_rate NUMERIC,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_run RECORD;
    v_line RECORD;
    v_rate NUMERIC(12,4);
    v_ivss_secondary NUMERIC(10,2);
    v_faov_secondary NUMERIC(10,2);
    v_retentions_sec NUMERIC(10,2);
    v_retentions_pri NUMERIC(10,2);
    v_tot_deductions_pri NUMERIC(10,2);
    v_line_net_pri NUMERIC(10,2);
    v_line_net_sec NUMERIC(10,2);
    v_concepts JSONB;
    v_new_concepts JSONB;
    v_tot_base NUMERIC(10,2) := 0.00;
    v_tot_comm NUMERIC(10,2) := 0.00;
    v_tot_allow NUMERIC(10,2) := 0.00;
    v_tot_ded NUMERIC(10,2) := 0.00;
    v_tot_net_pri NUMERIC(10,2) := 0.00;
    v_tot_net_sec NUMERIC(10,2) := 0.00;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'Tasa de cambio inválida: debe ser mayor a 0.';
    END IF;
    v_rate := ROUND(p_exchange_rate, 4);

    -- Bloquear corrida
    EXECUTE format('
        SELECT * FROM %1$I.pay_runs WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_run USING p_run_id;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'La corrida de nómina no existe.';
    END IF;

    IF v_run.status != 'CALCULATED' AND v_run.status != 'DRAFT' THEN
        RAISE EXCEPTION 'Solo se pueden aprobar corridas en estado DRAFT o CALCULATED (actual: %).', v_run.status;
    END IF;

    -- Iterar y congelar cada línea aplicando retenciones de ley (IVSS 4% y FAOV 1% sobre base en Bs)
    FOR v_line IN EXECUTE format('
        SELECT * FROM %1$I.pay_run_lines WHERE run_id = $1 FOR UPDATE
    ', v_schema) USING p_run_id LOOP

        -- IVSS: 4% sobre base en Bs
        v_ivss_secondary := ROUND((v_line.base_salary_primary * v_rate) * 0.04, 2);
        -- FAOV: 1% sobre base en Bs
        v_faov_secondary := ROUND((v_line.base_salary_primary * v_rate) * 0.01, 2);
        v_retentions_sec := v_ivss_secondary + v_faov_secondary;
        v_retentions_pri := ROUND(v_retentions_sec / v_rate, 2);

        -- Limpiar deducciones de ley previas si existían en el desglose
        v_concepts := v_line.concepts_breakdown;
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(v_concepts) elem
        WHERE elem->>'code' NOT IN ('RET_IVSS', 'RET_FAOV')
        INTO v_new_concepts;

        -- Sumar al desglose
        v_new_concepts := v_new_concepts || jsonb_build_object(
            'code', 'RET_IVSS',
            'name', 'Seguro Social Obligatorio (IVSS 4%)',
            'type', 'RETENTION',
            'amount_primary', ROUND(v_ivss_secondary / v_rate, 2),
            'amount_secondary', v_ivss_secondary
        ) || jsonb_build_object(
            'code', 'RET_FAOV',
            'name', 'Fondo de Ahorro para la Vivienda (FAOV 1%)',
            'type', 'RETENTION',
            'amount_primary', ROUND(v_faov_secondary / v_rate, 2),
            'amount_secondary', v_faov_secondary
        );

        -- Deducciones totales de la línea = deducciones previas (adelantos) + retenciones de ley
        v_tot_deductions_pri := v_line.deductions_primary + v_retentions_pri;
        v_line_net_pri := GREATEST(0.00, (v_line.base_salary_primary + v_line.commissions_primary + v_line.allowances_primary) - v_tot_deductions_pri);
        v_line_net_sec := ROUND(v_line_net_pri * v_rate, 2);

        EXECUTE format('
            UPDATE %1$I.pay_run_lines
            SET exchange_rate_snapshot = $2,
                deductions_primary = $3,
                net_salary_primary = $4,
                net_salary_secondary = $5,
                concepts_breakdown = $6
            WHERE id = $1
        ', v_schema) USING v_line.id, v_rate, v_tot_deductions_pri, v_line_net_pri, v_line_net_sec, v_new_concepts;

        v_tot_base := v_tot_base + v_line.base_salary_primary;
        v_tot_comm := v_tot_comm + v_line.commissions_primary;
        v_tot_allow := v_tot_allow + v_line.allowances_primary;
        v_tot_ded := v_tot_ded + v_tot_deductions_pri;
        v_tot_net_pri := v_tot_net_pri + v_line_net_pri;
        v_tot_net_sec := v_tot_net_sec + v_line_net_sec;
    END LOOP;

    -- Actualizar cabecera de corrida
    EXECUTE format('
        UPDATE %1$I.pay_runs
        SET exchange_rate_snapshot = $2,
            total_base_primary = $3,
            total_commissions_primary = $4,
            total_allowances_primary = $5,
            total_deductions_primary = $6,
            total_net_primary = $7,
            total_net_secondary = $8,
            status = ''APPROVED'',
            approved_by = $9,
            approved_at = now(),
            updated_at = now()
        WHERE id = $1
    ', v_schema) USING p_run_id, v_rate, v_tot_base, v_tot_comm, v_tot_allow, v_tot_ded, v_tot_net_pri, v_tot_net_sec, p_staff_id;

    -- Actualizar estado del período
    EXECUTE format('
        UPDATE %1$I.pay_periods SET status = ''APPROVED'', updated_at = now() WHERE id = $1
    ', v_schema) USING v_run.period_id;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', p_run_id,
        'status', 'APPROVED',
        'exchange_rate_snapshot', v_rate,
        'total_net_primary', v_tot_net_pri,
        'total_net_secondary', v_tot_net_sec
    );
END;
$$;


-- 4. rpc_pay_disburse_run
CREATE OR REPLACE FUNCTION platform.rpc_pay_disburse_run(
    p_schema TEXT,
    p_run_id UUID,
    p_account_id UUID,
    p_disbursement_method TEXT,
    p_reference TEXT DEFAULT NULL,
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_run RECORD;
    v_line RECORD;
    v_account RECORD;
    v_disb_number TEXT;
    v_disb_count INTEGER := 0;
    v_adv RECORD;
    v_deducted_adv NUMERIC(10,2);
    v_open_shift RECORD;
    v_disb_id UUID;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    -- Bloquear corrida
    EXECUTE format('
        SELECT * FROM %1$I.pay_runs WHERE id = $1 FOR UPDATE
    ', v_schema) INTO v_run USING p_run_id;

    IF v_run.id IS NULL THEN
        RAISE EXCEPTION 'La corrida de nómina no existe.';
    END IF;

    IF v_run.status != 'APPROVED' THEN
        RAISE EXCEPTION 'Solo se pueden dispersar corridas en estado APPROVED (actual: %).', v_run.status;
    END IF;

    -- Validar cuenta de tesorería en cxp_payment_accounts
    EXECUTE format('
        SELECT * FROM %1$I.cxp_payment_accounts WHERE id = $1 AND is_active = true
    ', v_schema) INTO v_account USING p_account_id;

    IF v_account.id IS NULL THEN
        RAISE EXCEPTION 'La cuenta de tesorería seleccionada no existe o está inactiva.';
    END IF;

    -- Iterar sobre cada línea de corrida y crear su dispersión
    FOR v_line IN EXECUTE format('
        SELECT * FROM %1$I.pay_run_lines WHERE run_id = $1 AND status != ''PAID'' FOR UPDATE
    ', v_schema) USING p_run_id LOOP

        -- Generar número de dispersión único
        EXECUTE format('
            SELECT ''DISB-'' || to_char(now(), ''YYYYMM'') || ''-'' || lpad(nextval(''%1$I.pay_disb_seq'')::text, 6, ''0'')
        ', v_schema) INTO v_disb_number;

        -- Insertar dispersión
        EXECUTE format('
            INSERT INTO %1$I.pay_disbursements (
                disbursement_number, run_id, run_line_id, account_id,
                amount_primary, amount_secondary, exchange_rate_snapshot,
                currency_paid, disbursement_method, transaction_reference,
                disbursed_by, disbursed_at
            ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7,
                ''PRIMARY'', $8, $9,
                $10, now()
            ) RETURNING id
        ', v_schema) INTO v_disb_id
        USING v_disb_number, p_run_id, v_line.id, p_account_id,
              v_line.net_salary_primary, v_line.net_salary_secondary, v_line.exchange_rate_snapshot,
              p_disbursement_method, p_reference, p_staff_id;

        -- Marcar línea como PAID
        EXECUTE format('
            UPDATE %1$I.pay_run_lines
            SET status = ''PAID'', paid_at = now()
            WHERE id = $1
        ', v_schema) USING v_line.id;

        -- Amortizar adelantos si esta línea tuvo deducción por adelanto
        FOR v_adv IN EXECUTE format('
            SELECT * FROM %1$I.pay_advances 
            WHERE employee_id = $1 
              AND status IN (''APPROVED'', ''PARTIALLY_DEDUCTED'') 
              AND pending_amount_primary > 0
            ORDER BY created_at ASC
        ', v_schema) USING v_line.employee_id LOOP
            -- Calcular cuota amortizada
            v_deducted_adv := ROUND(v_adv.approved_amount_primary / NULLIF(v_adv.installments_total, 0), 2);
            IF v_deducted_adv > v_adv.pending_amount_primary THEN
                v_deducted_adv := v_adv.pending_amount_primary;
            END IF;

            EXECUTE format('
                UPDATE %1$I.pay_advances
                SET pending_amount_primary = GREATEST(0.00, pending_amount_primary - $2),
                    installments_remaining = GREATEST(0, installments_remaining - 1),
                    status = CASE WHEN pending_amount_primary - $2 <= 0 THEN ''SETTLED'' ELSE ''PARTIALLY_DEDUCTED'' END,
                    updated_at = now()
                WHERE id = $1
            ', v_schema) USING v_adv.id, v_deducted_adv;
        END LOOP;

        v_disb_count := v_disb_count + 1;
    END LOOP;

    -- Si la cuenta de tesorería es de tipo CASH (Efectivo), verificar si hay turno de caja abierto y registrar salida referencial
    IF v_account.type = 'CASH' THEN
        EXECUTE format('
            SELECT id FROM %1$I.cash_shifts 
            WHERE status = ''OPEN'' 
            ORDER BY opened_at DESC LIMIT 1
        ', v_schema) INTO v_open_shift;

        IF v_open_shift.id IS NOT NULL THEN
            EXECUTE format('
                INSERT INTO %1$I.pay_cash_shift_refs (
                    cash_shift_id, disbursement_id, amount_primary, notes
                ) VALUES (
                    $1, $2, $3, ''Egreso de nómina corrida '' || $4
                ) ON CONFLICT DO NOTHING
            ', v_schema) USING v_open_shift.id, v_disb_id, v_run.total_net_primary, v_run.run_number;
        END IF;
    END IF;

    -- Actualizar estado de la corrida a DISBURSED
    EXECUTE format('
        UPDATE %1$I.pay_runs
        SET status = ''DISBURSED'',
            disbursed_by = $2,
            disbursed_at = now(),
            updated_at = now()
        WHERE id = $1
    ', v_schema) USING p_run_id, p_staff_id;

    -- Actualizar período a DISBURSED
    EXECUTE format('
        UPDATE %1$I.pay_periods SET status = ''DISBURSED'', updated_at = now() WHERE id = $1
    ', v_schema) USING v_run.period_id;

    RETURN jsonb_build_object(
        'success', true,
        'run_id', p_run_id,
        'disbursements_created', v_disb_count,
        'status', 'DISBURSED',
        'disbursed_at', now()
    );
END;
$$;


-- 5. rpc_pay_intel_report
CREATE OR REPLACE FUNCTION platform.rpc_pay_intel_report(
    p_schema TEXT,
    p_from DATE DEFAULT NULL,
    p_to DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_from DATE;
    v_to DATE;
    v_kpis RECORD;
    v_dept_summary JSONB;
    v_reps_summary JSONB;
    v_advances_summary RECORD;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    v_from := COALESCE(p_from, CURRENT_DATE - 30);
    v_to := COALESCE(p_to, CURRENT_DATE);

    -- KPIs consolidados de corridas en el rango
    EXECUTE format('
        SELECT 
            COALESCE(COUNT(DISTINCT r.id), 0) AS runs_count,
            COALESCE(COUNT(rl.id), 0) AS total_payslips,
            COALESCE(SUM(r.total_base_primary), 0.00) AS total_base_primary,
            COALESCE(SUM(r.total_commissions_primary), 0.00) AS total_commissions_primary,
            COALESCE(SUM(r.total_deductions_primary), 0.00) AS total_deductions_primary,
            COALESCE(SUM(r.total_net_primary), 0.00) AS total_net_primary,
            COALESCE(SUM(r.total_net_secondary), 0.00) AS total_net_secondary
        FROM %1$I.pay_runs r
        LEFT JOIN %1$I.pay_run_lines rl ON rl.run_id = r.id
        WHERE r.status = ''DISBURSED''
          AND r.disbursed_at::date >= $1 
          AND r.disbursed_at::date <= $2
    ', v_schema) INTO v_kpis USING v_from, v_to;

    -- Costo por departamento
    EXECUTE format('
        SELECT COALESCE(jsonb_agg(d), ''[]''::jsonb)
        FROM (
            SELECT 
                e.department,
                COUNT(DISTINCT e.id) AS employees_count,
                COALESCE(SUM(rl.base_salary_primary), 0.00) AS base_primary,
                COALESCE(SUM(rl.commissions_primary), 0.00) AS commissions_primary,
                COALESCE(SUM(rl.net_salary_primary), 0.00) AS net_primary
            FROM %1$I.pay_run_lines rl
            JOIN %1$I.pay_employees e ON e.id = rl.employee_id
            JOIN %1$I.pay_runs r ON r.id = rl.run_id
            WHERE r.status = ''DISBURSED''
              AND r.disbursed_at::date >= $1 
              AND r.disbursed_at::date <= $2
            GROUP BY e.department
            ORDER BY net_primary DESC
        ) d
    ', v_schema) INTO v_dept_summary USING v_from, v_to;

    -- Comisiones por vendedor
    EXECUTE format('
        SELECT COALESCE(jsonb_agg(c), ''[]''::jsonb)
        FROM (
            SELECT 
                e.first_name || '' '' || e.last_name AS employee_name,
                e.job_title,
                COALESCE(SUM(rl.commissions_primary), 0.00) AS commissions_primary,
                COALESCE(SUM(rl.net_salary_primary), 0.00) AS net_salary_primary
            FROM %1$I.pay_run_lines rl
            JOIN %1$I.pay_employees e ON e.id = rl.employee_id
            JOIN %1$I.pay_runs r ON r.id = rl.run_id
            WHERE r.status = ''DISBURSED''
              AND r.disbursed_at::date >= $1 
              AND r.disbursed_at::date <= $2
              AND rl.commissions_primary > 0
            GROUP BY e.id, e.first_name, e.last_name, e.job_title
            ORDER BY commissions_primary DESC
        ) c
    ', v_schema) INTO v_reps_summary USING v_from, v_to;

    -- Resumen de adelantos activos
    EXECUTE format('
        SELECT 
            COALESCE(COUNT(*), 0) AS active_advances_count,
            COALESCE(SUM(pending_amount_primary), 0.00) AS total_pending_primary
        FROM %1$I.pay_advances
        WHERE status IN (''APPROVED'', ''PARTIALLY_DEDUCTED'')
    ', v_schema) INTO v_advances_summary;

    RETURN jsonb_build_object(
        'success', true,
        'from_date', v_from,
        'to_date', v_to,
        'runs_count', v_kpis.runs_count,
        'total_payslips', v_kpis.total_payslips,
        'total_base_primary', v_kpis.total_base_primary,
        'total_commissions_primary', v_kpis.total_commissions_primary,
        'total_deductions_primary', v_kpis.total_deductions_primary,
        'total_net_primary', v_kpis.total_net_primary,
        'total_net_secondary', v_kpis.total_net_secondary,
        'department_breakdown', v_dept_summary,
        'commission_breakdown', v_reps_summary,
        'active_advances_count', v_advances_summary.active_advances_count,
        'advances_pending_primary', v_advances_summary.total_pending_primary
    );
END;
$$;
