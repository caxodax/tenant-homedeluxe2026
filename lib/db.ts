// lib/db.ts — Conexión transaccional PostgreSQL con aislamiento de esquemas (Blast Radius = 0)
import { Pool, PoolClient } from 'pg';

const isProduction = process.env.NODE_ENV === 'production';
const isCloudDb = process.env.DATABASE_URL?.includes('supabase') || process.env.DATABASE_URL?.includes('pooler');

// Pool de conexiones PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 8000,
  keepAlive: true,
  ssl: (isProduction || isCloudDb) ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.warn('[MarketOS pg pool] conexión inactiva cerrada:', err.message);
});

/**
 * Ejecuta una operación de base de datos aislada en el esquema del inquilino.
 * Inyecta SET LOCAL search_path dentro de un bloque BEGIN ... COMMIT.
 * Garantiza que ninguna conexión devuelta al pool retenga variables o esquemas anteriores.
 */
export async function withTenantDb<T>(
  tenantSchema: string,
  userId: string | null,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Validación estricta del nombre de esquema para evitar inyección SQL
  if (!/^tenant_[a-z0-9_]{3,63}$/.test(tenantSchema)) {
    throw new Error(`Schema name inválido: ${tenantSchema}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Inyección de variables con SET LOCAL (vida exclusiva durante la transacción)
    await client.query(
      `SET LOCAL search_path TO "${tenantSchema}", platform, public, pg_temp`
    );
    
    if (userId) {
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    }
    
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Limpieza de estado temporal antes de devolver el cliente al pool
    await client.query('DISCARD ALL').catch(() => {});
    client.release();
  }
}

export { pool };
