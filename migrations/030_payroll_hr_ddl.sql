-- ============================================================================
-- MIGRACIÓN 030: DDL DEL PLUGIN payroll_hr / payroll_personal (FASE 18.2)
-- ============================================================================

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

-- Actualizar rpc_install_plugin_tables para admitir 'payroll_hr' y 'payroll_personal'
CREATE OR REPLACE FUNCTION platform.rpc_install_plugin_tables(
    p_schema TEXT,
    p_plugin_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_schema TEXT;
    v_short TEXT;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido para instalación de plugins.', p_schema;
    END IF;
    v_short := replace(v_schema, 'tenant_', '');

    IF p_plugin_id = 'local_venezuela' THEN
        PERFORM platform.lv_ddl_local_venezuela(v_schema);
    ELSIF p_plugin_id = 'craft_workshop' THEN
        PERFORM platform.cw_ddl_craft_workshop(v_schema);
    ELSIF p_plugin_id = 'delivery_fleet' THEN
        PERFORM platform.df_ddl_delivery_fleet(v_schema);
    ELSIF p_plugin_id = 'food_service' THEN
        PERFORM platform.fs_ddl_food_service(v_schema);
    ELSIF p_plugin_id IN ('sales_team', 'sales_commission') THEN
        PERFORM platform.st_ddl_sales_team(v_schema);
    ELSIF p_plugin_id = 'credit_cxc' THEN
        PERFORM platform.cxc_ddl_credit(v_schema);
    ELSIF p_plugin_id IN ('supplier_cxp', 'payables_cxp') THEN
        PERFORM platform.cxp_ddl_supplier(v_schema);
    ELSIF p_plugin_id IN ('payroll_hr', 'payroll_personal') THEN
        PERFORM platform.pay_ddl_payroll(v_schema);
    ELSE
        RAISE EXCEPTION 'Plugin "%" no reconocido en el instalador DDL.', p_plugin_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'schema_name', v_schema,
        'plugin_id', p_plugin_id,
        'installed_at', now()
    );
END;
$$;
