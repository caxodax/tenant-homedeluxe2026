-- ============================================================================
-- MIGRATION 017: CANONICAL ORDER STATUS 'EN_ROUTE' (EN CAMINO) & TWO-WAY SYNC
-- ============================================================================

-- 1. Actualizar restricción CHECK en tenant_machatexmex
ALTER TABLE tenant_machatexmex.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE tenant_machatexmex.orders ADD CONSTRAINT orders_status_check 
  CHECK (status = ANY (ARRAY[
    'CREATED'::text, 
    'PREORDER_PENDING_REVIEW'::text, 
    'PENDING_PAYMENT_VERIFICATION'::text, 
    'CONFIRMED'::text, 
    'PREPARING'::text, 
    'READY_FOR_PICKUP'::text, 
    'EN_ROUTE'::text, 
    'DELIVERED'::text, 
    'CANCELLED'::text
  ]));

-- 2. Actualizar restricción CHECK en tenant_shopmarket
ALTER TABLE tenant_shopmarket.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE tenant_shopmarket.orders ADD CONSTRAINT orders_status_check 
  CHECK (status = ANY (ARRAY[
    'CREATED'::text, 
    'PREORDER_PENDING_REVIEW'::text, 
    'PENDING_PAYMENT_VERIFICATION'::text, 
    'CONFIRMED'::text, 
    'PREPARING'::text, 
    'READY_FOR_PICKUP'::text, 
    'EN_ROUTE'::text, 
    'DELIVERED'::text, 
    'CANCELLED'::text
  ]));

-- 3. Actualizar restricción CHECK en tenant_homedeluxe2026
ALTER TABLE tenant_homedeluxe2026.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE tenant_homedeluxe2026.orders ADD CONSTRAINT orders_status_check 
  CHECK (status = ANY (ARRAY[
    'CREATED'::text, 
    'PREORDER_PENDING_REVIEW'::text, 
    'PENDING_PAYMENT_VERIFICATION'::text, 
    'CONFIRMED'::text, 
    'PREPARING'::text, 
    'READY_FOR_PICKUP'::text, 
    'EN_ROUTE'::text, 
    'DELIVERED'::text, 
    'CANCELLED'::text
  ]));

-- 4. Actualizar función canónica platform.rpc_df_update_status con sincronización bidireccional a Core orders
CREATE OR REPLACE FUNCTION platform.rpc_df_update_status(
    p_schema text, 
    p_dispatch_id uuid, 
    p_new_status text, 
    p_actor_id uuid DEFAULT NULL::uuid, 
    p_actor_label text DEFAULT 'Despachador'::text, 
    p_failure_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
    v_schema TEXT;
    v_dispatch RECORD;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema inválido: %', p_schema;
    END IF;

    IF p_new_status NOT IN ('PENDING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED', 'FAILED') THEN
        RAISE EXCEPTION 'Estado de despacho inválido: %', p_new_status;
    END IF;

    EXECUTE format('SELECT id, order_id, driver_id, status FROM %I.df_dispatch_routes WHERE id = $1', v_schema)
    INTO v_dispatch
    USING p_dispatch_id;

    IF v_dispatch.id IS NULL THEN
        RAISE EXCEPTION 'Ruta de despacho % no encontrada.', p_dispatch_id;
    END IF;

    -- Aplicar transición según estado
    IF p_new_status = 'EN_ROUTE' THEN
        EXECUTE format('
            UPDATE %I.df_dispatch_routes 
            SET status = ''EN_ROUTE'', en_route_at = now(), updated_at = now()
            WHERE id = $1;
        ', v_schema) USING p_dispatch_id;

        -- Sincronización Canónica: Al despachar con motorizado, la orden Core pasa a EN_ROUTE
        EXECUTE format('
            UPDATE %I.orders 
            SET status = ''EN_ROUTE'', updated_at = now()
            WHERE id = $1;
        ', v_schema) USING v_dispatch.order_id;

    ELSIF p_new_status = 'ARRIVED' THEN
        EXECUTE format('
            UPDATE %I.df_dispatch_routes 
            SET status = ''ARRIVED'', arrived_at = now(), updated_at = now()
            WHERE id = $1;
        ', v_schema) USING p_dispatch_id;

    ELSIF p_new_status = 'COMPLETED' THEN
        EXECUTE format('
            UPDATE %I.df_dispatch_routes 
            SET status = ''COMPLETED'', completed_at = now(), updated_at = now()
            WHERE id = $1;
        ', v_schema) USING p_dispatch_id;

        -- Regla canónica: Al completar despacho, la orden Core pasa atómicamente a DELIVERED
        EXECUTE format('
            UPDATE %I.orders 
            SET status = ''DELIVERED'', updated_at = now()
            WHERE id = $1;
        ', v_schema) USING v_dispatch.order_id;

    ELSIF p_new_status = 'FAILED' THEN
        EXECUTE format('
            UPDATE %I.df_dispatch_routes 
            SET status = ''FAILED'', failed_at = now(), failure_reason = $2, updated_at = now()
            WHERE id = $1;
        ', v_schema) USING p_dispatch_id, COALESCE(p_failure_reason, 'No entregado');
    ELSE
        EXECUTE format('
            UPDATE %I.df_dispatch_routes 
            SET status = $2, updated_at = now()
            WHERE id = $1;
        ', v_schema) USING p_dispatch_id, p_new_status;
    END IF;

    -- Auditoría
    EXECUTE format('
        INSERT INTO %I.df_audit_logs (actor_type, actor_id, actor_label, action, entity, entity_id, old_data, new_data)
        VALUES (''STAFF'', $1, $2, ''STATUS_CHANGED'', ''df_dispatch_routes'', $3, $4, $5)
    ', v_schema)
    USING p_actor_id, p_actor_label, p_dispatch_id, 
          jsonb_build_object('old_status', v_dispatch.status),
          jsonb_build_object('new_status', p_new_status, 'failure_reason', p_failure_reason);

    RETURN jsonb_build_object(
        'success', true,
        'dispatch_id', p_dispatch_id,
        'order_id', v_dispatch.order_id,
        'previous_status', v_dispatch.status,
        'current_status', p_new_status
    );
END;
$function$;
