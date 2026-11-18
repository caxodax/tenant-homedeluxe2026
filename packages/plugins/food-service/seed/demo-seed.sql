-- ============================================================================
-- MARKETOS — SEED DEMO: PLUGIN FOOD SERVICE & GASTRONOMÍA
-- Archivo: packages/plugins/food-service/seed/demo-seed.sql
-- Motor: PostgreSQL 16+
-- Responsabilidad: Poblar datos de demostración en un tenant con food_service activo.
-- ============================================================================

DO $$
DECLARE
    v_schema TEXT := 'tenant_shopmarket';
    v_zone_salon UUID;
    v_zone_terraza UUID;
    v_cat_food UUID;
    v_cat_modifiers UUID;
    v_prod_burger UUID;
    v_prod_fries UUID;
    v_rm_pan UUID;
    v_rm_carne UUID;
    v_rm_queso UUID;
    v_rm_tocineta UUID;
    v_rm_papas UUID;
    v_recipe_burger UUID;
    v_mod_group UUID;
BEGIN
    RAISE NOTICE 'Iniciando Seed Demo de Food Service en %...', v_schema;

    -- 1. Zonas de Sala
    INSERT INTO tenant_shopmarket.fs_zones (name, sort_order, is_active)
    VALUES ('Salón Principal', 1, true)
    ON CONFLICT DO NOTHING;

    INSERT INTO tenant_shopmarket.fs_zones (name, sort_order, is_active)
    VALUES ('Terraza VIP', 2, true)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_zone_salon FROM tenant_shopmarket.fs_zones WHERE name = 'Salón Principal' LIMIT 1;
    SELECT id INTO v_zone_terraza FROM tenant_shopmarket.fs_zones WHERE name = 'Terraza VIP' LIMIT 1;

    -- 2. Mesas
    INSERT INTO tenant_shopmarket.fs_tables (zone_id, label, seats, status, is_active)
    VALUES
        (v_zone_salon, 'M1', 4, 'FREE', true),
        (v_zone_salon, 'M2', 4, 'FREE', true),
        (v_zone_salon, 'M3', 6, 'FREE', true),
        (v_zone_salon, 'M4', 2, 'FREE', true),
        (v_zone_terraza, 'T1', 4, 'FREE', true),
        (v_zone_terraza, 'T2', 6, 'FREE', true)
    ON CONFLICT (label) DO UPDATE SET is_active = true;

    -- 3. Categorías (Comida y Adicionales Ocultos)
    INSERT INTO tenant_shopmarket.categories (name, slug, is_active, is_hidden)
    VALUES ('Gastronomía & Platos', 'gastronomia', true, false)
    ON CONFLICT (slug) DO UPDATE SET is_active = true, is_hidden = false
    RETURNING id INTO v_cat_food;

    IF v_cat_food IS NULL THEN
        SELECT id INTO v_cat_food FROM tenant_shopmarket.categories WHERE slug = 'gastronomia';
    END IF;

    INSERT INTO tenant_shopmarket.categories (name, slug, is_active, is_hidden)
    VALUES ('Adicionales & Toppings', 'adicionales', true, true)
    ON CONFLICT (slug) DO UPDATE SET is_active = true, is_hidden = true
    RETURNING id INTO v_cat_modifiers;

    IF v_cat_modifiers IS NULL THEN
        SELECT id INTO v_cat_modifiers FROM tenant_shopmarket.categories WHERE slug = 'adicionales';
    END IF;

    -- 4. Productos de Comida
    INSERT INTO tenant_shopmarket.products (
        name, slug, sku, category_id, price_primary, cost_price, current_stock, is_active
    ) VALUES (
        'Hamburguesa Gourmet Angus MarketOS', 'hamburguesa-gourmet-angus-marketos', 'FOOD-HMB-01', v_cat_food, 8.50, 3.20, 100, true
    )
    ON CONFLICT (sku) DO UPDATE SET is_active = true
    RETURNING id INTO v_prod_burger;

    IF v_prod_burger IS NULL THEN
        SELECT id INTO v_prod_burger FROM tenant_shopmarket.products WHERE sku = 'FOOD-HMB-01';
    END IF;

    INSERT INTO tenant_shopmarket.products (
        name, slug, sku, category_id, price_primary, cost_price, current_stock, is_active
    ) VALUES (
        'Papas Rústicas con Queso & Tocineta', 'papas-rusticas-con-queso-tocineta', 'FOOD-PAP-01', v_cat_food, 4.00, 1.20, 100, true
    )
    ON CONFLICT (sku) DO UPDATE SET is_active = true
    RETURNING id INTO v_prod_fries;

    IF v_prod_fries IS NULL THEN
        SELECT id INTO v_prod_fries FROM tenant_shopmarket.products WHERE sku = 'FOOD-PAP-01';
    END IF;

    -- 5. Materias Primas de Cocina
    INSERT INTO tenant_shopmarket.fs_raw_materials (name, unit, current_stock, min_stock, cost_per_unit_primary, is_active)
    VALUES
        ('Pan Brioche Artesanal', 'UNID', 80.000, 20.000, 0.6000, true),
        ('Carne Angus 150g', 'UNID', 75.000, 15.000, 1.8000, true),
        ('Queso Cheddar Lonja', 'UNID', 120.000, 30.000, 0.3500, true),
        ('Tocineta Ahumada', 'GR', 4000.000, 1000.000, 0.0150, true),
        ('Papas Rústicas', 'GR', 15000.000, 3000.000, 0.0030, true);

    SELECT id INTO v_rm_pan FROM tenant_shopmarket.fs_raw_materials WHERE name = 'Pan Brioche Artesanal' LIMIT 1;
    SELECT id INTO v_rm_carne FROM tenant_shopmarket.fs_raw_materials WHERE name = 'Carne Angus 150g' LIMIT 1;
    SELECT id INTO v_rm_queso FROM tenant_shopmarket.fs_raw_materials WHERE name = 'Queso Cheddar Lonja' LIMIT 1;
    SELECT id INTO v_rm_tocineta FROM tenant_shopmarket.fs_raw_materials WHERE name = 'Tocineta Ahumada' LIMIT 1;
    SELECT id INTO v_rm_papas FROM tenant_shopmarket.fs_raw_materials WHERE name = 'Papas Rústicas' LIMIT 1;

    -- 6. Receta de Hamburguesa Gourmet (BOM con 5% de merma en tocineta y carne)
    INSERT INTO tenant_shopmarket.fs_recipes (product_id, name, yield_portions, preparation_time_minutes, instructions, is_active)
    VALUES (v_prod_burger, 'Receta Hamburguesa Angus Especial', 1.00, 12, 'Sellar carne 3min por lado, tostar pan con mantequilla.', true)
    ON CONFLICT (product_id) DO UPDATE SET is_active = true
    RETURNING id INTO v_recipe_burger;

    IF v_recipe_burger IS NULL THEN
        SELECT id INTO v_recipe_burger FROM tenant_shopmarket.fs_recipes WHERE product_id = v_prod_burger;
    END IF;

    -- Ítems de la Receta
    IF v_recipe_burger IS NOT NULL AND v_rm_pan IS NOT NULL THEN
        INSERT INTO tenant_shopmarket.fs_recipe_items (recipe_id, raw_material_id, quantity, waste_pct)
        VALUES
            (v_recipe_burger, v_rm_pan, 1.0000, 0.00),
            (v_recipe_burger, v_rm_carne, 1.0000, 5.00),
            (v_recipe_burger, v_rm_queso, 2.0000, 0.00),
            (v_recipe_burger, v_rm_tocineta, 40.0000, 5.00)
        ON CONFLICT (recipe_id, raw_material_id) DO NOTHING;
    END IF;

    -- 7. Personal de Sala y Cocina
    INSERT INTO tenant_shopmarket.staff_profiles (email, full_name, role, is_active)
    VALUES
        ('carlos.mesero@shopmarket.com', 'Carlos Mendoza (Mesero)', 'WAITER', true),
        ('elena.cocina@shopmarket.com', 'Elena Rivas (Chef Cocina)', 'KITCHEN', true)
    ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, is_active = true;

    RAISE NOTICE 'Seed Demo de Food Service completado con éxito en %.', v_schema;
END $$;
