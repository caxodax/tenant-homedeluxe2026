-- ============================================================================
-- MIGRACIÓN 023: FIX-VARIANT-UNASSIGNED EN rpc_core_create_order
-- Resuelve error 55000: record "v_variant" is not assigned yet al procesar
-- productos sin variantes en órdenes de compra online y POS.
-- ============================================================================

CREATE OR REPLACE FUNCTION platform.rpc_core_create_order(
    p_schema TEXT,
    p_order_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_schema TEXT;
    v_order_id UUID := gen_random_uuid();
    v_order_number TEXT;
    v_store_id UUID;
    v_customer_id UUID;
    v_customer_name TEXT;
    v_customer_phone TEXT;
    v_delivery_type TEXT;
    v_delivery_address TEXT;
    v_notes TEXT;
    v_subtotal_primary NUMERIC(10,2);
    v_discount_primary NUMERIC(10,2);
    v_discounts_applied JSONB;
    v_seller_id UUID;
    v_tax_primary NUMERIC(10,2);
    v_shipping_primary NUMERIC(10,2);
    v_total_primary NUMERIC(10,2);
    v_total_secondary NUMERIC(14,2);
    v_exchange_rate NUMERIC(12,4);
    v_is_offline BOOLEAN;
    v_offline_ticket_ref TEXT;
    v_item RECORD;
    v_product RECORD;
    v_variant RECORD;
    v_variant_name TEXT;
    v_variant_price_adj NUMERIC(10,2) := 0.00;
    v_item_qty NUMERIC(12,3);
    v_product_id UUID;
    v_variant_id UUID;
    v_initial_stock NUMERIC(12,3);
    v_store_prev_qty NUMERIC(12,3);
    v_seq_val BIGINT;
    v_computed_subtotal NUMERIC(10,2) := 0.00;
    v_computed_order_total NUMERIC(10,2);
    v_expected_unit_price NUMERIC(10,2);
    v_is_custom_quote BOOLEAN;
    v_store_exists BOOLEAN;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    -- Extraer y validar sucursal
    v_store_id := (p_order_data->>'store_id')::UUID;
    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'El store_id es obligatorio para registrar un pedido.';
    END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.stores WHERE id = %L)', v_schema, v_store_id) INTO v_store_exists;
    IF NOT v_store_exists THEN
        RAISE EXCEPTION 'La sucursal con ID % no existe o no pertenece al comercio %.', v_store_id, v_schema;
    END IF;

    -- Extraer datos de cabecera con soporte dual agnóstico (total_primary con fallback total_usd)
    v_customer_id := NULLIF(p_order_data->>'customer_id', '')::UUID;
    v_customer_name := COALESCE(p_order_data->>'customer_name', 'Cliente Mostrador');
    v_customer_phone := COALESCE(NULLIF(trim(p_order_data->>'customer_phone'), ''), '0000000000');
    v_delivery_type := COALESCE(p_order_data->>'delivery_type', 'PICKUP');
    v_delivery_address := p_order_data->>'delivery_address';
    v_notes := p_order_data->>'notes';
    v_discount_primary := COALESCE((COALESCE(p_order_data->>'discount_primary', p_order_data->>'discount_usd'))::NUMERIC, 0.00);
    v_discounts_applied := COALESCE(p_order_data->'discounts_applied', '[]'::jsonb);
    v_seller_id := NULLIF(p_order_data->>'seller_id', '')::UUID;
    v_tax_primary := COALESCE((COALESCE(p_order_data->>'tax_primary', p_order_data->>'tax_usd'))::NUMERIC, 0.00);
    v_shipping_primary := COALESCE((COALESCE(p_order_data->>'shipping_primary', p_order_data->>'shipping_usd'))::NUMERIC, 0.00);
    v_total_primary := COALESCE((COALESCE(p_order_data->>'total_primary', p_order_data->>'total_usd'))::NUMERIC, 0.00);
    v_total_secondary := COALESCE((p_order_data->>'total_secondary')::NUMERIC, 0.00);
    v_exchange_rate := COALESCE((p_order_data->>'exchange_rate_applied')::NUMERIC, 1.0000);
    v_is_offline := COALESCE((p_order_data->>'is_offline_sale')::BOOLEAN, false);
    v_offline_ticket_ref := p_order_data->>'offline_ticket_ref';

    -- Respaldo Bimonetario Agnóstico (Garantiza registro de moneda base y secundaria: VES, COP, CLP, etc.)
    IF v_exchange_rate IS NULL OR v_exchange_rate <= 1.0000 THEN
        EXECUTE format('SELECT COALESCE(exchange_rate, 1.0000) FROM %I.settings WHERE key = ''general'' LIMIT 1', v_schema)
        INTO v_exchange_rate;
        IF v_exchange_rate IS NULL OR v_exchange_rate <= 0 THEN
            v_exchange_rate := 1.0000;
        END IF;
    END IF;

    IF v_total_secondary IS NULL OR v_total_secondary = 0.00 THEN
        v_total_secondary := round(v_total_primary * v_exchange_rate, 2);
    END IF;

    -- Si el cliente envió subtotal explícito, leerlo; de lo contrario se deduce de la ecuación base
    IF (p_order_data->>'subtotal_primary') IS NOT NULL THEN
        v_subtotal_primary := (p_order_data->>'subtotal_primary')::NUMERIC;
    ELSIF (p_order_data->>'subtotal_usd') IS NOT NULL THEN
        v_subtotal_primary := (p_order_data->>'subtotal_usd')::NUMERIC;
    ELSE
        v_subtotal_primary := round(v_total_primary + v_discount_primary - v_tax_primary - v_shipping_primary, 2);
    END IF;

    -- Consumir correlativo oficial
    EXECUTE format('SELECT nextval(%L)', quote_ident(v_schema) || '.order_number_seq') INTO v_seq_val;
    v_order_number := 'ORD-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_seq_val::text, 6, '0');

    -- Auto-upsert / Vincular en directorio de clientes si el teléfono es válido
    IF length(trim(v_customer_phone)) >= 7 AND trim(v_customer_phone) != '0000000000' THEN
        EXECUTE format('
            SELECT id FROM %I.customers
            WHERE phone = %L
            LIMIT 1
        ', v_schema, trim(v_customer_phone)) INTO v_customer_id;

        IF v_customer_id IS NULL THEN
            EXECUTE format('
                INSERT INTO %I.customers (name, phone, id_number, address)
                VALUES (%L, %L, %L, %L)
                RETURNING id
            ', v_schema, v_customer_name, trim(v_customer_phone), NULLIF(trim(p_order_data->>'customer_id_number'), ''), v_delivery_address)
            INTO v_customer_id;
        ELSE
            EXECUTE format('
                UPDATE %I.customers
                SET name = CASE WHEN %L != ''Cliente Mostrador'' THEN %L ELSE name END,
                    id_number = COALESCE(NULLIF(trim(%L), ''''), id_number),
                    address = COALESCE(%L, address),
                    updated_at = now()
                WHERE id = %L
            ', v_schema, v_customer_name, v_customer_name, p_order_data->>'customer_id_number', v_delivery_address, v_customer_id);
        END IF;
    END IF;

    -- Insertar cabecera de orden
    EXECUTE format('
        INSERT INTO %I.orders (
            id, order_number, store_id, customer_id, customer_name, customer_phone,
            status, delivery_type, delivery_address, subtotal_primary, discount_primary,
            discounts_applied, seller_id,
            tax_primary, shipping_primary, total_primary, total_secondary,
            exchange_rate_applied, is_offline_sale, offline_ticket_ref, notes,
            created_at, updated_at
        ) VALUES (
            %L, %L, %L, %L, %L, %L,
            %L, %L, %L, %L, %L,
            %L::jsonb, %L,
            %L, %L, %L, %L,
            %L, %L, %L, %L,
            now(), now()
        );
    ',
        v_schema,
        v_order_id, v_order_number, v_store_id, v_customer_id, v_customer_name, v_customer_phone,
        CASE WHEN v_is_offline OR v_delivery_type = 'POS_DESK' THEN 'DELIVERED' ELSE 'CREATED' END,
        v_delivery_type, v_delivery_address, v_subtotal_primary, v_discount_primary,
        v_discounts_applied, v_seller_id,
        v_tax_primary, v_shipping_primary, v_total_primary, v_total_secondary,
        v_exchange_rate, v_is_offline, v_offline_ticket_ref, v_notes
    );

    -- Procesar renglones con orden determinista anti-deadlock y soporte dual agnóstico
    FOR v_item IN
        SELECT
            (i->>'product_id')::UUID AS product_id,
            COALESCE(i->>'product_name', 'Producto') AS product_name,
            COALESCE((i->>'quantity')::NUMERIC, 1.000) AS quantity,
            COALESCE((COALESCE(i->>'unit_price_primary', i->>'unit_price_usd'))::NUMERIC, 0.00) AS unit_price_primary,
            COALESCE((COALESCE(i->>'total_price_primary', i->>'total_price_usd'))::NUMERIC, 0.00) AS total_price_primary,
            (i->'metadata') AS metadata
        FROM jsonb_array_elements(p_order_data->'items') AS i
        ORDER BY (i->>'product_id')::UUID ASC
    LOOP
        v_product_id := v_item.product_id;
        v_item_qty := v_item.quantity;
        v_variant_id := NULL;

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida (%) para el producto ID %.', v_item_qty, v_product_id;
        END IF;

        IF abs(round(v_item_qty * v_item.unit_price_primary, 2) - v_item.total_price_primary) > 0.01 THEN
            RAISE EXCEPTION 'Inconsistencia de cálculo en item "%": cantidad % * precio unitario % != total %',
                v_item.product_name, v_item_qty, v_item.unit_price_primary, v_item.total_price_primary;
        END IF;

        v_computed_subtotal := v_computed_subtotal + v_item.total_price_primary;

        -- Bloqueo FOR UPDATE del producto
        EXECUTE format('
            SELECT id, name, price_primary, track_inventory, current_stock
            FROM %I.products
            WHERE id = %L
            FOR UPDATE;
        ', v_schema, v_product_id) INTO v_product;

        IF v_product.id IS NULL THEN
            RAISE EXCEPTION 'El producto con ID % no existe en el catálogo.', v_product_id;
        END IF;

        -- Verificar y bloquear variante si aplica
        v_variant_id := NULL;
        v_variant_name := NULL;
        v_variant_price_adj := 0.00;
        IF v_item.metadata IS NOT NULL
           AND (v_item.metadata->>'variant_id') IS NOT NULL
           AND (v_item.metadata->>'variant_id') != '' THEN
            v_variant_id := (v_item.metadata->>'variant_id')::UUID;
            EXECUTE format('
                SELECT id, name, price_adjustment_primary, current_stock
                FROM %I.product_variants
                WHERE id = %L AND product_id = %L
                FOR UPDATE;
            ', v_schema, v_variant_id, v_product_id) INTO v_variant;
            IF v_variant.id IS NULL THEN
                RAISE EXCEPTION 'La variante % no existe para el producto "%".', v_variant_id, v_product.name;
            END IF;
            v_variant_name := v_variant.name;
            v_variant_price_adj := COALESCE(v_variant.price_adjustment_primary, 0.00);
        END IF;

        -- Blindaje de Precios contra Manipulación de Cliente Web (Checkout Online)
        v_is_custom_quote := COALESCE((v_item.metadata->>'is_custom_quote')::BOOLEAN, false);
        IF NOT v_is_offline AND NOT v_is_custom_quote THEN
            v_expected_unit_price := v_product.price_primary + v_variant_price_adj;
            IF abs(v_item.unit_price_primary - v_expected_unit_price) > 0.01 THEN
                RAISE EXCEPTION 'Discrepancia de precio para "%": catálogo %, recibido %. Manipulación de precio detectada.',
                    v_product.name, v_expected_unit_price, v_item.unit_price_primary;
            END IF;
        END IF;

        -- Descuento y trazabilidad de inventario
        IF v_product.track_inventory THEN
            IF v_variant_id IS NOT NULL THEN
                v_initial_stock := COALESCE(v_variant.current_stock, 0.000);
            ELSE
                v_initial_stock := COALESCE(v_product.current_stock, 0.000);
            END IF;

            -- 1. Asegurar registro en tabla inventory para la combinación (store, product, variant) con stock real
            EXECUTE format('
                INSERT INTO %I.inventory (store_id, product_id, variant_id, quantity, min_quantity)
                VALUES (%L, %L, %L, %L, 5.000)
                ON CONFLICT ON CONSTRAINT uq_inventory_store_product_variant 
                DO UPDATE SET quantity = GREATEST(%I.inventory.quantity, EXCLUDED.quantity);
            ', v_schema, v_store_id, v_product_id, v_variant_id,
               v_initial_stock, v_schema);

            -- 2. FOR UPDATE sobre inventario de sucursal
            EXECUTE format('
                SELECT quantity
                FROM %I.inventory
                WHERE store_id = %L AND product_id = %L AND variant_id IS NOT DISTINCT FROM %L
                FOR UPDATE;
            ', v_schema, v_store_id, v_product_id, v_variant_id) INTO v_store_prev_qty;

            IF NOT v_is_offline THEN
                IF v_store_prev_qty < v_item_qty THEN
                    RAISE EXCEPTION 'Stock insuficiente en la sucursal para "%"%. Disponible: %, Solicitado: %',
                        v_product.name,
                        CASE WHEN v_variant_name IS NOT NULL THEN ' (' || v_variant_name || ')' ELSE '' END,
                        trim(to_char(v_store_prev_qty, 'FM999999990.###')),
                        trim(to_char(v_item_qty, 'FM999999990.###'));
                END IF;
            END IF;

            -- 3. Descontar en sucursal (trg_sync_product_stock sincronizará products.current_stock)
            EXECUTE format('
                UPDATE %I.inventory
                SET quantity = quantity - %L, updated_at = now()
                WHERE store_id = %L AND product_id = %L AND variant_id IS NOT DISTINCT FROM %L;
            ', v_schema, v_item_qty, v_store_id, v_product_id, v_variant_id);

            -- 4. Si es variante, actualizar existencias consolidadas de variante
            IF v_variant_id IS NOT NULL THEN
                EXECUTE format('
                    UPDATE %I.product_variants
                    SET current_stock = current_stock - %L, updated_at = now()
                    WHERE id = %L;
                ', v_schema, v_item_qty, v_variant_id);
            END IF;

            -- 5. Kardex inmutable con variant_id
            EXECUTE format('
                INSERT INTO %I.inventory_movements (
                    store_id, product_id, variant_id, quantity_change, previous_quantity,
                    new_quantity, movement_type, reference_id, notes
                ) VALUES (
                    %L, %L, %L, %L, %L,
                    %L, %L, %L, %L
                );
            ',
                v_schema,
                v_store_id, v_product_id, v_variant_id, (-1.000 * v_item_qty), v_store_prev_qty,
                (v_store_prev_qty - v_item_qty),
                CASE WHEN v_is_offline THEN 'OFFLINE_RECONCILE' ELSE 'SALE_OUT' END,
                v_order_number,
                'Venta atómica orden ' || v_order_number
            );
        END IF;

        -- Insertar renglón de orden
        EXECUTE format('
            INSERT INTO %I.order_items (
                order_id, product_id, product_name, quantity, unit_price_primary, total_price_primary, metadata
            ) VALUES (
                %L, %L, %L, %L, %L, %L, %L
            );
        ',
            v_schema,
            v_order_id, v_product_id, v_item.product_name, v_item_qty,
            v_item.unit_price_primary, v_item.total_price_primary, COALESCE(v_item.metadata, '{}'::jsonb)
        );
    END LOOP;

    -- Validar coincidencia de items con el subtotal
    IF abs(v_computed_subtotal - v_subtotal_primary) > 0.05 THEN
        RAISE EXCEPTION 'El subtotal declarado (%) no coincide con la suma de los renglones (%). Tolerancia máxima: 0.05.',
            v_subtotal_primary, v_computed_subtotal;
    END IF;

    -- Validar ecuación contable total
    v_computed_order_total := round(v_subtotal_primary - v_discount_primary + v_tax_primary + v_shipping_primary, 2);
    IF abs(v_computed_order_total - v_total_primary) > 0.05 THEN
        RAISE EXCEPTION 'El total declarado (%) no coincide con la ecuación contable (% subtotal - % desc + % imp + % envío = %). Tolerancia máxima: 0.05.',
            v_total_primary, v_subtotal_primary, v_discount_primary, v_tax_primary, v_shipping_primary, v_computed_order_total;
    END IF;

    -- Pago inmediato con verificación anti-fraude (A-1)
    IF p_order_data->'payment' IS NOT NULL THEN
        -- Si el pago incluye comprobante digital, verificar huella criptográfica
        IF (p_order_data->'payment'->>'proof_file_hash') IS NOT NULL
           AND trim(p_order_data->'payment'->>'proof_file_hash') != '' THEN
            DECLARE
                v_fraud_check JSONB;
                v_ref_to_check TEXT;
            BEGIN
                v_ref_to_check := COALESCE(
                    NULLIF(trim(p_order_data->'payment'->>'reference_number'), ''),
                    v_order_number
                );
                v_fraud_check := platform.rpc_check_payment_fraud(
                    (p_order_data->'payment'->>'proof_file_hash'),
                    (SELECT id FROM platform.tenants WHERE db_schema_name = v_schema),
                    v_ref_to_check,
                    (p_order_data->'payment'->>'bank_source'),
                    (p_order_data->'payment'->>'amount')::NUMERIC
                );
                IF (v_fraud_check->>'is_fraud')::BOOLEAN THEN
                    RAISE EXCEPTION 'Comprobante rechazado por seguridad: %',
                        (v_fraud_check->>'reason');
                END IF;
            END;
        END IF;

        EXECUTE format('
            INSERT INTO %I.payments (
                order_id, method, amount, currency, exchange_rate, reference_number,
                proof_file_hash, proof_image_url, status
            ) VALUES (
                %L, %L, %L, %L, %L, %L,
                %L, %L, %L
            );
        ',
            v_schema,
            v_order_id,
            p_order_data->'payment'->>'method',
            (p_order_data->'payment'->>'amount')::NUMERIC,
            COALESCE(p_order_data->'payment'->>'currency', 'USD'),
            v_exchange_rate,
            p_order_data->'payment'->>'reference_number',
            p_order_data->'payment'->>'proof_file_hash',
            p_order_data->'payment'->>'proof_image_url',
            CASE WHEN v_is_offline OR p_order_data->'payment'->>'method' IN ('CASH_USD', 'CASH_LOCAL') THEN 'VERIFIED' ELSE 'PENDING' END
        );
    END IF;

    -- Registrar evento génesis en la auditoría inmutable del pedido (FIX-AUDIT-GENESIS)
    EXECUTE format('
        INSERT INTO %I.audit_logs (
            actor_name, actor_role, action, entity, entity_id, new_data
        ) VALUES (
            %L, %L, %L, %L, %L, %L::jsonb
        );
    ',
        v_schema,
        COALESCE(v_customer_name, 'Cliente'),
        CASE WHEN v_is_offline OR v_delivery_type = 'POS_DESK' THEN 'POS_CASHIER' ELSE 'CUSTOMER' END,
        'ORDER_CREATED',
        'order',
        v_order_id,
        jsonb_build_object(
            'order_number', v_order_number,
            'total_primary', v_total_primary,
            'total_usd', v_total_primary,
            'total_secondary', v_total_secondary,
            'status', CASE WHEN v_is_offline OR v_delivery_type = 'POS_DESK' THEN 'DELIVERED' ELSE 'CREATED' END,
            'channel', CASE WHEN v_is_offline OR v_delivery_type = 'POS_DESK' THEN 'POS_DESK' ELSE 'STOREFRONT' END,
            'items_count', jsonb_array_length(p_order_data->'items')
        )
    );

    -- Incrementar cuota de órdenes del mes
    UPDATE platform.tenant_quota_usage
    SET orders_this_month = orders_this_month + 1
    WHERE tenant_id = (SELECT id FROM platform.tenants WHERE db_schema_name = v_schema);

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'subtotal_primary', v_subtotal_primary,
        'subtotal_usd', v_subtotal_primary,
        'total_primary', v_total_primary,
        'total_usd', v_total_primary,
        'total_secondary', v_total_secondary,
        'status', CASE WHEN v_is_offline OR v_delivery_type = 'POS_DESK' THEN 'DELIVERED' ELSE 'CREATED' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, public, pg_temp;

COMMENT ON FUNCTION platform.rpc_core_create_order IS 'Crea pedidos con bloqueo FOR UPDATE determinista, deducción de stock en inventory (sincronizada vía trigger a products), variantes y kardex.';

-- ============================================================================
-- 2. RPC: rpc_core_close_pos_shift
-- Corrección: Arqueo ciego desglosado con validación dinámica contra payment_methods
