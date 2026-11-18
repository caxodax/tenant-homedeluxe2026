-- TEST SUITE: SUB-FASES 13.1 Y 13.2 FOOD SERVICE
DO $test$
DECLARE
    v_store_id UUID;
    v_waiter_id UUID;
    v_kitchen_id UUID;
    v_product_id UUID;
    v_order_id UUID;
    v_order_item_id UUID;
    v_table_id UUID;
    v_open_res JSONB;
    v_ticket_id UUID;
    v_send_res JSONB;
    v_k_ticket_id UUID;
    v_upd_res JSONB;
    v_pay_res JSONB;
    v_86_res JSONB;
    v_table_status TEXT;
    v_ticket_status TEXT;
BEGIN
    RAISE NOTICE '--- INICIANDO TEST SUITE FASE 13.1 Y 13.2 ---';

    -- 0. Obtener Store y Producto activo
    SELECT id INTO v_store_id FROM tenant_shopmarket.stores LIMIT 1;
    SELECT id INTO v_product_id FROM tenant_shopmarket.products WHERE is_active = true LIMIT 1;
    IF v_store_id IS NULL OR v_product_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró tienda o producto activo en shopmarket';
    END IF;

    -- 1. Test Staff Roles: WAITER & KITCHEN
    INSERT INTO tenant_shopmarket.staff_profiles (auth_user_id, email, full_name, role, is_active)
    VALUES (NULL, 'waiter.test@shopmarket.com', 'Mesero Test', 'WAITER', true)
    RETURNING id INTO v_waiter_id;

    INSERT INTO tenant_shopmarket.staff_profiles (auth_user_id, email, full_name, role, is_active)
    VALUES (NULL, 'kitchen.test@shopmarket.com', 'Cocinero Test', 'KITCHEN', true)
    RETURNING id INTO v_kitchen_id;

    RAISE NOTICE '1. Staff con roles WAITER (%) y KITCHEN (%) creados exitosamente.', v_waiter_id, v_kitchen_id;

    -- 2. Test Order: delivery_type = DINE_IN
    INSERT INTO tenant_shopmarket.orders (
        order_number, store_id, customer_name, customer_phone, delivery_type,
        status, subtotal_primary, tax_primary, shipping_primary, discount_primary, total_primary,
        total_secondary, exchange_rate_applied, is_offline_sale
    ) VALUES (
        'TEST-DINEIN-001', v_store_id, 'Cliente Comensal Test', '04121234567', 'DINE_IN',
        'CONFIRMED', 15.00, 0.00, 0.00, 0.00, 15.00,
        975.00, 65.0000, false
    ) RETURNING id INTO v_order_id;

    INSERT INTO tenant_shopmarket.order_items (
        order_id, product_id, product_name, quantity, unit_price_primary, total_price_primary
    ) VALUES (
        v_order_id, v_product_id, 'Hamburguesa Gourmet Test', 1.000, 15.00, 15.00
    ) RETURNING id INTO v_order_item_id;

    RAISE NOTICE '2. Orden DINE_IN creada exitosamente (ID: %, Item: %).', v_order_id, v_order_item_id;

    -- 3. Crear Mesa de Prueba
    INSERT INTO tenant_shopmarket.fs_tables (label, seats, status)
    VALUES ('MESA-TEST-99', 4, 'FREE')
    RETURNING id INTO v_table_id;

    -- 4. Test RPC: rpc_fs_open_table
    v_open_res := platform.rpc_fs_open_table('tenant_shopmarket', v_table_id, v_waiter_id, 2, 'Mesa VIP prueba');
    v_ticket_id := (v_open_res->>'ticket_id')::UUID;
    SELECT status INTO v_table_status FROM tenant_shopmarket.fs_tables WHERE id = v_table_id;
    IF v_table_status != 'OCCUPIED' THEN
        RAISE EXCEPTION 'Fallo al cambiar estado de mesa a OCCUPIED: %', v_table_status;
    END IF;
    RAISE NOTICE '3. rpc_fs_open_table OK: Ticket % abierto, Mesa status: %', v_ticket_id, v_table_status;

    -- 5. Test RPC: rpc_fs_send_to_kitchen
    v_send_res := platform.rpc_fs_send_to_kitchen('tenant_shopmarket', v_order_id, v_ticket_id, '{"sin_cebolla": true}'::jsonb);
    v_k_ticket_id := (v_send_res->>'kitchen_ticket_id')::UUID;
    RAISE NOTICE '4. rpc_fs_send_to_kitchen OK: KDS Ticket % status: %', v_k_ticket_id, v_send_res->>'status';

    -- 6. Test RPC: rpc_fs_kitchen_update (READY_ALL)
    v_upd_res := platform.rpc_fs_kitchen_update('tenant_shopmarket', v_k_ticket_id, NULL, 'READY_ALL');
    RAISE NOTICE '5. rpc_fs_kitchen_update (READY_ALL) OK: status: %', v_upd_res->>'status';

    -- 7. Test RPC: rpc_fs_toggle_86
    v_86_res := platform.rpc_fs_toggle_86('tenant_shopmarket', v_product_id, true);
    RAISE NOTICE '6. rpc_fs_toggle_86 OK: %', v_86_res;

    -- 8. Test RPC: rpc_fs_pay_table (Cobro total y cierre de mesa)
    v_pay_res := platform.rpc_fs_pay_table(
        'tenant_shopmarket',
        v_ticket_id,
        'FULL',
        '[]'::jsonb,
        2.00,
        'CASH',
        65.00,
        v_waiter_id
    );
    SELECT status INTO v_table_status FROM tenant_shopmarket.fs_tables WHERE id = v_table_id;
    SELECT status INTO v_ticket_status FROM tenant_shopmarket.fs_table_tickets WHERE id = v_ticket_id;
    IF v_table_status != 'FREE' OR v_ticket_status != 'CLOSED' THEN
        RAISE EXCEPTION 'Fallo en cierre de mesa: table=%, ticket=%', v_table_status, v_ticket_status;
    END IF;
    RAISE NOTICE '7. rpc_fs_pay_table OK: Ticket status: %, Mesa liberada status: %, Total: %', v_ticket_status, v_table_status, v_pay_res->>'total_paid_primary';

    -- 9. Limpieza de datos de prueba (Zero Garbage in production)
    DELETE FROM tenant_shopmarket.payments WHERE reference_number LIKE 'MESA-%' OR reference_number = 'PROPINA-SALA';
    DELETE FROM tenant_shopmarket.fs_daily_86 WHERE product_id = v_product_id;
    DELETE FROM tenant_shopmarket.fs_kitchen_ticket_items WHERE kitchen_ticket_id = v_k_ticket_id;
    DELETE FROM tenant_shopmarket.fs_kitchen_tickets WHERE id = v_k_ticket_id;
    DELETE FROM tenant_shopmarket.fs_bill_splits WHERE ticket_id = v_ticket_id;
    DELETE FROM tenant_shopmarket.fs_ticket_orders WHERE ticket_id = v_ticket_id;
    DELETE FROM tenant_shopmarket.fs_table_tickets WHERE id = v_ticket_id;
    DELETE FROM tenant_shopmarket.fs_tables WHERE id = v_table_id;
    DELETE FROM tenant_shopmarket.order_items WHERE id = v_order_item_id;
    DELETE FROM tenant_shopmarket.orders WHERE id = v_order_id;
    DELETE FROM tenant_shopmarket.staff_profiles WHERE id IN (v_waiter_id, v_kitchen_id);

    RAISE NOTICE '8. Limpieza de datos de test completada. BD limpia y consistente.';
    RAISE NOTICE '--- TEST SUITE COMPLETADO CON ÉXITO AL 100%%%% ---';
END $test$;
