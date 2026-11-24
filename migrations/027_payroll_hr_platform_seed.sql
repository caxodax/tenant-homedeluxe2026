-- ============================================================================
-- MIGRACIÓN 027: SEMILLA PLATFORM PARA PLUGIN payroll_hr (FASE 18.1)
-- ============================================================================

INSERT INTO platform.plugins_catalog (
  id, name, category, description, version, manifest_path, migration_dir, dependencies,
  config_schema, price_usd_monthly, is_active
) VALUES (
  'payroll_hr', 'Nómina y Salarios', 'fintech',
  'Gestión de nómina: empleados con roles salariales, cálculo de comisiones desde ventas, períodos configurables, recibos PDF con tasa snapshot inmutable, reportes de rendimiento.',
  '1.0.0', '/packages/plugins/payroll-hr/manifest.json', '/packages/plugins/payroll-hr/migrations', '{}',
  '{
    "commission_rules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "role": {"type": "string"},
          "commission_pct": {"type": "number", "minimum": 0, "maximum": 100},
          "min_sales_primary": {"type": "number", "minimum": 0}
        },
        "required": ["role", "commission_pct"]
      }
    },
    "roles_manage_payroll": {
      "type": "array",
      "items": {"type": "string"},
      "default": ["OWNER", "MANAGER"]
    },
    "default_period_days": {"type": "integer", "default": 15},
    "receipt_footer": {"type": "string", "default": "Gracias por su trabajo."}
  }'::jsonb,
  12.00, true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  manifest_path = EXCLUDED.manifest_path,
  migration_dir = EXCLUDED.migration_dir,
  config_schema = EXCLUDED.config_schema,
  price_usd_monthly = EXCLUDED.price_usd_monthly;

UPDATE platform.subscription_plans
SET allowed_plugins = array_append(allowed_plugins, 'payroll_hr')
WHERE id IN ('GROWTH','ENTERPRISE','INTERNAL_DEMO')
  AND NOT ('payroll_hr' = ANY(allowed_plugins));
