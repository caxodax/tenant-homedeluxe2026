-- Migration 028: Soporte para Recall / Deshacer despacho en KDS
CREATE OR REPLACE FUNCTION platform.rpc_fs_kitchen_update(
    p_schema text, 
    p_kitchen_ticket_id uuid, 
    p_item_ids uuid[] DEFAULT NULL::uuid[], 
    p_action text DEFAULT 'READY_ALL'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
    v_schema TEXT;
    v_pending_count INTEGER;
BEGIN
    v_schema := lower(trim(p_schema));
    IF v_schema !~ '^tenant_[a-z0-9_]{3,63}$' THEN
        RAISE EXCEPTION 'Esquema "%" inválido.', p_schema;
    END IF;

    IF p_action = 'READY_ITEM' AND p_item_ids IS NOT NULL THEN
        EXECUTE format('
            UPDATE %I.fs_kitchen_ticket_items
            SET status = ''READY'', ready_at = now()
            WHERE kitchen_ticket_id = %L AND id = ANY(%L)
        ', v_schema, p_kitchen_ticket_id, p_item_ids);
    ELSIF p_action = 'READY_ALL' THEN
        EXECUTE format('
            UPDATE %I.fs_kitchen_ticket_items
            SET status = ''READY'', ready_at = now()
            WHERE kitchen_ticket_id = %L AND status = ''PENDING''
        ', v_schema, p_kitchen_ticket_id);
    ELSIF p_action = 'SERVED' THEN
        EXECUTE format('
            UPDATE %I.fs_kitchen_tickets
            SET status = ''SERVED'', served_at = now()
            WHERE id = %L
        ', v_schema, p_kitchen_ticket_id);
        RETURN jsonb_build_object('success', true, 'status', 'SERVED');
    ELSIF p_action = 'RECALL' THEN
        EXECUTE format('
            UPDATE %I.fs_kitchen_tickets
            SET status = ''READY'', served_at = NULL
            WHERE id = %L
        ', v_schema, p_kitchen_ticket_id);
        RETURN jsonb_build_object('success', true, 'status', 'READY');
    ELSIF p_action = 'VOID' THEN
        EXECUTE format('
            UPDATE %I.fs_kitchen_tickets SET status = ''VOIDED'' WHERE id = %L;
            UPDATE %I.fs_kitchen_ticket_items SET status = ''VOIDED'' WHERE kitchen_ticket_id = %L;
        ', v_schema, p_kitchen_ticket_id, v_schema, p_kitchen_ticket_id);
        RETURN jsonb_build_object('success', true, 'status', 'VOIDED');
    END IF;

    EXECUTE format('
        SELECT COUNT(*)
        FROM %I.fs_kitchen_ticket_items
        WHERE kitchen_ticket_id = %L AND status = ''PENDING''
    ', v_schema, p_kitchen_ticket_id) INTO v_pending_count;

    IF v_pending_count = 0 THEN
        EXECUTE format('
            UPDATE %I.fs_kitchen_tickets
            SET status = ''READY'', ready_at = now()
            WHERE id = %L AND status IN (''PENDING'', ''FIRED'', ''PREPARING'')
        ', v_schema, p_kitchen_ticket_id);
    ELSE
        EXECUTE format('
            UPDATE %I.fs_kitchen_tickets
            SET status = ''PREPARING''
            WHERE id = %L AND status = ''FIRED''
        ', v_schema, p_kitchen_ticket_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'kitchen_ticket_id', p_kitchen_ticket_id,
        'pending_items', v_pending_count,
        'status', CASE WHEN v_pending_count = 0 THEN 'READY' ELSE 'PREPARING' END
    );
END;
$function$;
