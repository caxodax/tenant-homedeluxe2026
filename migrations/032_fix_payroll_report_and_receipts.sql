-- ============================================================================
-- MIGRACIÓN 032: CORRECCIÓN DE REPORTE INTEL Y CORRELATIVOS DE RECIBOS
-- ============================================================================

-- 1. Agregar receipt_number al DDL de payroll
CREATE OR REPLACE FUNCTION platform.pay_ddl_payroll(p_schema TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_short TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido para DDL de payroll.', p_schema;
    END IF;
    v_short := replace(v_schema, 'tenant_', '');

    EXECUTE format('
        -- Secuencias correlativas para Nómina
        CREATE SEQUENCE IF NOT EXISTS %1$I.pay_advance_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.pay_run_seq START WITH 1 INCREMENT BY 1;
        CREATE SEQUENCE IF NOT EXISTS %1$I.pay_disb_seq START WITH 1 INCREMENT BY 1;

        -- 1. EXPEDIENTE DE COLABORADORES Y ROLES SALARIALES
        CREATE TABLE IF NOT EXISTS %1$I.pay_employees (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            staff_id UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            id_document TEXT NOT NULL UNIQUE,
            phone TEXT CHECK (length(trim(phone)) >= 7),
            email TEXT,
            job_title TEXT NOT NULL,
            department TEXT NOT NULL DEFAULT ''Ventas'',
            hired_at DATE NOT NULL DEFAULT CURRENT_DATE,
            terminated_at DATE,
            base_salary_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (base_salary_primary >= 0.00),
            base_salary_secondary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            payment_frequency TEXT NOT NULL DEFAULT ''BIWEEKLY'' CHECK (payment_frequency IN (''WEEKLY'', ''BIWEEKLY'', ''MONTHLY'')),
            bank_name TEXT,
            bank_account_number TEXT,
            bank_account_type TEXT DEFAULT ''CORRIENTE'',
            mobile_payment_phone TEXT,
            mobile_payment_id_doc TEXT,
            can_login BOOLEAN NOT NULL DEFAULT false,
            can_create_runs BOOLEAN NOT NULL DEFAULT false,
            can_approve_runs BOOLEAN NOT NULL DEFAULT false,
            can_disburse_runs BOOLEAN NOT NULL DEFAULT false,
            can_manage_employees BOOLEAN NOT NULL DEFAULT false,
            can_manage_advances BOOLEAN NOT NULL DEFAULT false,
            can_manage_concepts BOOLEAN NOT NULL DEFAULT false,
            can_view_reports BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_emp_staff ON %1$I.pay_employees(staff_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_emp_active ON %1$I.pay_employees(is_active);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_emp_doc ON %1$I.pay_employees(id_document);

        -- 2. CALENDARIO Y PERÍODOS DE LIQUIDACIÓN
        CREATE TABLE IF NOT EXISTS %1$I.pay_periods (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            period_code TEXT NOT NULL UNIQUE,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            payment_frequency TEXT NOT NULL DEFAULT ''BIWEEKLY'' CHECK (payment_frequency IN (''WEEKLY'', ''BIWEEKLY'', ''MONTHLY'')),
            status TEXT NOT NULL DEFAULT ''DRAFT'' CHECK (status IN (''DRAFT'', ''PROJECTED'', ''APPROVED'', ''DISBURSED'', ''CANCELLED'')),
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_%2$I_pay_per_dates CHECK (end_date >= start_date)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_per_dates ON %1$I.pay_periods(start_date, end_date);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_per_status ON %1$I.pay_periods(status);

        -- 3. CATÁLOGO DE CONCEPTOS SALARIALES Y DEDUCCIONES
        CREATE TABLE IF NOT EXISTS %1$I.pay_concepts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            concept_type TEXT NOT NULL CHECK (concept_type IN (''EARNING'', ''DEDUCTION'', ''COMMISSION'', ''RETENTION'', ''BONUS'')),
            calculation_mode TEXT NOT NULL DEFAULT ''FIXED'' CHECK (calculation_mode IN (''FIXED'', ''PERCENTAGE'', ''DYNAMIC_COMMISSION'', ''STATUTORY_FORMULA'')),
            default_amount_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            percentage_rate NUMERIC(5,2) DEFAULT 0.00,
            is_statutory BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_con_code ON %1$I.pay_concepts(code);

        -- 4. ADELANTOS DE SUELDO Y PRÉSTAMOS
        CREATE TABLE IF NOT EXISTS %1$I.pay_advances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            advance_number TEXT NOT NULL UNIQUE,
            employee_id UUID NOT NULL REFERENCES %1$I.pay_employees(id) ON DELETE RESTRICT,
            requested_amount_primary NUMERIC(10,2) NOT NULL CHECK (requested_amount_primary > 0.00),
            approved_amount_primary NUMERIC(10,2) NOT NULL CHECK (approved_amount_primary > 0.00),
            pending_amount_primary NUMERIC(10,2) NOT NULL CHECK (pending_amount_primary >= 0.00),
            exchange_rate_snapshot NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
            reason TEXT NOT NULL,
            installments_total INTEGER NOT NULL DEFAULT 1 CHECK (installments_total >= 1),
            installments_remaining INTEGER NOT NULL DEFAULT 1 CHECK (installments_remaining >= 0),
            status TEXT NOT NULL DEFAULT ''PENDING'' CHECK (status IN (''PENDING'', ''APPROVED'', ''REJECTED'', ''PARTIALLY_DEDUCTED'', ''SETTLED'', ''CANCELLED'')),
            requested_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            approved_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_adv_emp ON %1$I.pay_advances(employee_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_adv_status ON %1$I.pay_advances(status);

        -- 5. CORRIDAS DE NÓMINA (CABECERA DE LIQUIDACIÓN)
        CREATE TABLE IF NOT EXISTS %1$I.pay_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            run_number TEXT NOT NULL UNIQUE,
            period_id UUID NOT NULL REFERENCES %1$I.pay_periods(id) ON DELETE RESTRICT,
            run_type TEXT NOT NULL DEFAULT ''REGULAR'' CHECK (run_type IN (''REGULAR'', ''SPECIAL'', ''SETTLEMENT'', ''BONUS'')),
            exchange_rate_snapshot NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
            total_base_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            total_commissions_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            total_allowances_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            total_deductions_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            total_net_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            total_net_secondary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            status TEXT NOT NULL DEFAULT ''DRAFT'' CHECK (status IN (''DRAFT'', ''CALCULATED'', ''APPROVED'', ''DISBURSED'', ''CANCELLED'')),
            approved_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            disbursed_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            disbursed_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_runs_period ON %1$I.pay_runs(period_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_runs_status ON %1$I.pay_runs(status);

        -- 6. LÍNEAS DE LIQUIDACIÓN INDIVIDUAL Y RECIBO DIGITAL
        CREATE TABLE IF NOT EXISTS %1$I.pay_run_lines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            run_id UUID NOT NULL REFERENCES %1$I.pay_runs(id) ON DELETE CASCADE,
            employee_id UUID NOT NULL REFERENCES %1$I.pay_employees(id) ON DELETE RESTRICT,
            days_worked INTEGER NOT NULL DEFAULT 15 CHECK (days_worked >= 0),
            base_salary_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            commissions_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            allowances_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            deductions_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            net_salary_primary NUMERIC(10,2) NOT NULL CHECK (net_salary_primary >= 0.00),
            exchange_rate_snapshot NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
            net_salary_secondary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            concepts_breakdown JSONB NOT NULL DEFAULT ''[]''::jsonb,
            receipt_number TEXT,
            pdf_r2_key TEXT,
            pdf_generated_at TIMESTAMPTZ,
            sent_via_whatsapp_at TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT ''PENDING'' CHECK (status IN (''PENDING'', ''PAID'', ''VOID'')),
            paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_%2$I_pay_run_emp UNIQUE (run_id, employee_id)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_rl_run ON %1$I.pay_run_lines(run_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_rl_emp ON %1$I.pay_run_lines(employee_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_rl_rec ON %1$I.pay_run_lines(receipt_number);

        -- 7. DISPERSIONES FINANCIERAS DE FONDOS (EGRESO DE TESORERÍA)
        CREATE TABLE IF NOT EXISTS %1$I.pay_disbursements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            disbursement_number TEXT NOT NULL UNIQUE,
            run_id UUID NOT NULL REFERENCES %1$I.pay_runs(id) ON DELETE RESTRICT,
            run_line_id UUID NOT NULL REFERENCES %1$I.pay_run_lines(id) ON DELETE CASCADE,
            account_id UUID NOT NULL,
            amount_primary NUMERIC(10,2) NOT NULL CHECK (amount_primary > 0.00),
            amount_secondary NUMERIC(10,2) NOT NULL DEFAULT 0.00,
            exchange_rate_snapshot NUMERIC(12,4) NOT NULL DEFAULT 1.0000,
            currency_paid TEXT NOT NULL DEFAULT ''PRIMARY'',
            disbursement_method TEXT NOT NULL CHECK (disbursement_method IN (''TRANSFER'', ''PAGO_MOVIL'', ''ZELLE'', ''CASH'', ''BINANCE'', ''OTHER'')),
            transaction_reference TEXT,
            notes TEXT,
            disbursed_by UUID REFERENCES %1$I.staff_profiles(id) ON DELETE SET NULL,
            disbursed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_disb_run ON %1$I.pay_disbursements(run_id);
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_disb_acc ON %1$I.pay_disbursements(account_id);

        -- TABLA SATÉLITE: REFERENCIAS DE SALIDAS DE CAJA EN EFECTIVO (CORE INTACTO)
        CREATE TABLE IF NOT EXISTS %1$I.pay_cash_shift_refs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            cash_shift_id UUID NOT NULL REFERENCES %1$I.cash_shifts(id) ON DELETE CASCADE,
            disbursement_id UUID NOT NULL REFERENCES %1$I.pay_disbursements(id) ON DELETE CASCADE,
            amount_primary NUMERIC(10,2) NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_%2$I_pay_cash_shift_ref UNIQUE (cash_shift_id, disbursement_id)
        );
        CREATE INDEX IF NOT EXISTS idx_%2$I_pay_csr_shift ON %1$I.pay_cash_shift_refs(cash_shift_id);

        -- TRIGGERS DE updated_at
        DROP TRIGGER IF EXISTS trg_%2$I_pay_emp_upd ON %1$I.pay_employees;
        CREATE TRIGGER trg_%2$I_pay_emp_upd BEFORE UPDATE ON %1$I.pay_employees
            FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();

        DROP TRIGGER IF EXISTS trg_%2$I_pay_per_upd ON %1$I.pay_periods;
        CREATE TRIGGER trg_%2$I_pay_per_upd BEFORE UPDATE ON %1$I.pay_periods
            FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();

        DROP TRIGGER IF EXISTS trg_%2$I_pay_con_upd ON %1$I.pay_concepts;
        CREATE TRIGGER trg_%2$I_pay_con_upd BEFORE UPDATE ON %1$I.pay_concepts
            FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();

        DROP TRIGGER IF EXISTS trg_%2$I_pay_adv_upd ON %1$I.pay_advances;
        CREATE TRIGGER trg_%2$I_pay_adv_upd BEFORE UPDATE ON %1$I.pay_advances
            FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();

        DROP TRIGGER IF EXISTS trg_%2$I_pay_runs_upd ON %1$I.pay_runs;
        CREATE TRIGGER trg_%2$I_pay_runs_upd BEFORE UPDATE ON %1$I.pay_runs
            FOR EACH ROW EXECUTE FUNCTION platform.fn_set_updated_at();

        -- SEMILLA DE CONCEPTOS BASE (IDEMPOTENTE)
        INSERT INTO %1$I.pay_concepts (code, name, concept_type, calculation_mode, default_amount_primary, percentage_rate, is_statutory)
        VALUES
            (''SUELDO_BASE'', ''Sueldo Base Quincenal/Mensual'', ''EARNING'', ''FIXED'', 0.00, 0.00, false),
            (''COMISION_VENTAS'', ''Comisión por Ventas Cobradas'', ''COMMISSION'', ''DYNAMIC_COMMISSION'', 0.00, 0.00, false),
            (''RET_IVSS'', ''Seguro Social Obligatorio (IVSS)'', ''RETENTION'', ''STATUTORY_FORMULA'', 0.00, 4.00, true),
            (''RET_FAOV'', ''Fondo de Ahorro para la Vivienda (FAOV)'', ''RETENTION'', ''STATUTORY_FORMULA'', 0.00, 1.00, true),
            (''ANTICIPO_SUELDO'', ''Deducción por Anticipo de Sueldo'', ''DEDUCTION'', ''FIXED'', 0.00, 0.00, false),
            (''BONO_TRANSPORTE'', ''Bono Asignación Transporte'', ''BONUS'', ''FIXED'', 0.00, 0.00, false)
        ON CONFLICT (code) DO NOTHING;

    ', v_schema, v_short);
END;
$$;


-- 2. Actualizar rpc_pay_approve_run para asignar receipt_number
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
    v_receipt_number TEXT;
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

    -- Iterar y congelar cada línea aplicando retenciones de ley y asignando recibo oficial
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

        -- Generar número correlativo de recibo si no tiene
        EXECUTE format('
            SELECT ''PAY-'' || to_char(now(), ''YYYYMM'') || ''-'' || lpad(nextval(''%1$I.pay_run_seq'')::text, 6, ''0'')
        ', v_schema) INTO v_receipt_number;

        EXECUTE format('
            UPDATE %1$I.pay_run_lines
            SET exchange_rate_snapshot = $2,
                deductions_primary = $3,
                net_salary_primary = $4,
                net_salary_secondary = $5,
                concepts_breakdown = $6,
                receipt_number = COALESCE(receipt_number, $7)
            WHERE id = $1
        ', v_schema) USING v_line.id, v_rate, v_tot_deductions_pri, v_line_net_pri, v_line_net_sec, v_new_concepts, v_receipt_number;

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


-- 3. Actualizar rpc_pay_intel_report (Solución exacta a producto cartesiano)
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

    -- KPIs consolidados de corridas en el rango (sin join cartesiano)
    EXECUTE format('
        SELECT 
            COALESCE(COUNT(r.id), 0) AS runs_count,
            COALESCE(SUM(r.total_base_primary), 0.00) AS total_base_primary,
            COALESCE(SUM(r.total_commissions_primary), 0.00) AS total_commissions_primary,
            COALESCE(SUM(r.total_deductions_primary), 0.00) AS total_deductions_primary,
            COALESCE(SUM(r.total_net_primary), 0.00) AS total_net_primary,
            COALESCE(SUM(r.total_net_secondary), 0.00) AS total_net_secondary,
            COALESCE((
                SELECT COUNT(rl.id) 
                FROM %1$I.pay_run_lines rl 
                JOIN %1$I.pay_runs r2 ON r2.id = rl.run_id 
                WHERE r2.status = ''DISBURSED'' 
                  AND r2.disbursed_at::date >= $1 
                  AND r2.disbursed_at::date <= $2
            ), 0) AS total_payslips
        FROM %1$I.pay_runs r
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
