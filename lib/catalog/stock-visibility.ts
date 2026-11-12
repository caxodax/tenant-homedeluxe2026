import { pool } from '@/lib/db';

/**
 * Calcula el inventario visible en la vitrina web aplicando el buffer de seguridad offline.
 * Si el comercio físico pierde conexión por más de 15 minutos (modo contingencia),
 * el stock visible web descuenta automáticamente el buffer (2 unidades por defecto)
 * para evitar sobreventas accidentales entre la tienda física y la vitrina online.
 * 
 * Fórmula canónica:
 * Stock Visible Web = max(0, Stock Real - Buffer)
 */
export async function getVisibleStock(
  tenantSchema: string,
  productId: string
): Promise<{ real: number; visible: number; buffer: number }> {
  // Validación estricta del nombre de esquema (Blast Radius = 0)
  if (!/^tenant_[a-z0-9_]{3,63}$/.test(tenantSchema)) {
    throw new Error(`Schema name inválido: ${tenantSchema}`);
  }

  // Obtener stock real y buffer configurado
  const res = await pool.query(
    `SELECT 
       p.current_stock AS real_stock,
       COALESCE(s.value->>'offline_safety_buffer', '2')::INTEGER AS buffer,
       t.contingency_offline_mode,
       t.last_pos_heartbeat_at,
       EXTRACT(EPOCH FROM (now() - t.last_pos_heartbeat_at)) AS seconds_since_heartbeat
     FROM "${tenantSchema}".products p
     CROSS JOIN "${tenantSchema}".settings s
     CROSS JOIN platform.tenants t
     WHERE p.id = $1 
       AND s.key = 'general'
       AND t.db_schema_name = $2`,
    [productId, tenantSchema]
  );
  
  if (res.rowCount === 0) {
    return { real: 0, visible: 0, buffer: 0 };
  }
  
  const row = res.rows[0];
  const realStock = parseFloat(row.real_stock);
  const buffer = row.buffer;
  const inContingency = 
    row.contingency_offline_mode !== 'normal' &&
    row.last_pos_heartbeat_at !== null &&
    parseFloat(row.seconds_since_heartbeat) > 900; // 15 minutos sin latido
  
  // Aplicar buffer solo si está en contingencia
  const visibleStock = inContingency 
    ? Math.max(0, realStock - buffer)
    : realStock;
  
  return { real: realStock, visible: visibleStock, buffer };
}
