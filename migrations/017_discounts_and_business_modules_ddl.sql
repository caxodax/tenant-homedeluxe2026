-- ============================================================================
-- MARKETOS — MIGRACIÓN 017: DESCUENTOS CANÓNICOS, GANCHOS COMERCIALES Y NUEVOS PLUGINS
-- Archivo: migrations/017_discounts_and_business_modules_ddl.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad:
--   1. Asegurar columnas de descuentos (`discount_primary`, `discounts_applied`) y vendedor (`seller_id`) en `orders`.
--   2. Crear índices canónicos de auditoría POS y vendedor por esquema de tenant.
--   3. Registrar los 4 nuevos plugins de negocio en el catálogo de plataforma (`sales_commission`, `credit_cxc`, `supplier_cxp`, `payroll_personal`).
--   4. Blast Radius = 0 (idempotente y no bloqueante).
-- ============================================================================

-- 1. Actualizar catálogo de plugins en plataforma
INSERT INTO platform.plugins_catalog (
    id, name, category, description, version, manifest_path, migration_dir, dependencies, price_usd_monthly
) VALUES
('sales_commission', 'Vendedores y Comisiones', 'sales',
 'Fuerza de ventas y comisiones: Asignación de vendedor en POS/pedidos, tasas porcentuales o fijas, metas y liquidación periódica.',
 '1.0.0', '/packages/plugins/sales-commission/manifest.json', '/packages/plugins/sales-commission/migrations', '{}', 12.00),

('credit_cxc', 'Cuentas por Cobrar (CxC)', 'finance',
 'Gestión de crédito a clientes: Plazos flexibles (7, 15, 30 días o personalizados), semáforo de morosidad, amortizaciones bimoneda y estados de cuenta.',
 '1.0.0', '/packages/plugins/credit-cxc/manifest.json', '/packages/plugins/credit-cxc/migrations', '{}', 15.00),

('supplier_cxp', 'Cuentas por Pagar (CxP)', 'finance',
 'Gestión de proveedores y pasivos: Facturas por pagar, cronograma de vencimientos de deuda y amortizaciones de egresos.',
 '1.0.0', '/packages/plugins/supplier-cxp/manifest.json', '/packages/plugins/supplier-cxp/migrations', '{}', 15.00),

('payroll_personal', 'Nómina y Personal', 'hr',
 'Gestión de colaboradores y nómina: Ficha de personal, sueldos base bimoneda, asignaciones (bonos, comisiones integradas), deducciones y recibos digitales.',
 '1.0.0', '/packages/plugins/payroll-personal/manifest.json', '/packages/plugins/payroll-personal/migrations', '{}', 20.00)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    version = EXCLUDED.version,
    manifest_path = EXCLUDED.manifest_path,
    migration_dir = EXCLUDED.migration_dir,
    price_usd_monthly = EXCLUDED.price_usd_monthly;

-- 2. Propagar columnas e índices a todos los esquemas tenant activos
DO $$
DECLARE
    r RECORD;
    v_schema TEXT;
    v_short TEXT;
BEGIN
    FOR r IN SELECT db_schema_name, slug FROM platform.tenants WHERE status IN ('active', 'trial')
    LOOP
        v_schema := lower(trim(r.db_schema_name));
        v_short := replace(v_schema, 'tenant_', '');

        -- Columnas en orders
        EXECUTE format('
            ALTER TABLE %1$I.orders ADD COLUMN IF NOT EXISTS discount_primary NUMERIC(10,2) NOT NULL DEFAULT 0.00;
            ALTER TABLE %1$I.orders ADD COLUMN IF NOT EXISTS discounts_applied JSONB NOT NULL DEFAULT ''[]''::jsonb;
            ALTER TABLE %1$I.orders ADD COLUMN IF NOT EXISTS seller_id UUID;
        ', v_schema);

        -- Índices
        EXECUTE format('
            CREATE INDEX IF NOT EXISTS idx_%2$I_orders_pos_audit 
            ON %1$I.orders (created_at DESC) 
            WHERE (is_offline_sale = true OR delivery_type = ''POS_DESK'') AND status != ''CANCELLED'';

            CREATE INDEX IF NOT EXISTS idx_%2$I_orders_seller 
            ON %1$I.orders(seller_id) 
            WHERE seller_id IS NOT NULL;
        ', v_schema, v_short);

        RAISE NOTICE 'Esquema % (%) actualizado con éxito para descuentos y ganchos de plugins.', v_schema, r.slug;
    END LOOP;
END $$;
