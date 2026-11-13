import { posDb } from './offline-db';

/**
 * Genera una referencia de ticket offline determinista con formato canónico:
 * OFFLINE-{registerCode}-{YYYYMMDD}-{seq}
 * Ejemplo: OFFLINE-POS1-20261110-0001
 * 
 * Consulta la base de datos local Dexie para obtener la secuencia correlativa del día
 * por caja registradora, garantizando trazabilidad hasta la reconciliación oficial.
 */
export async function generateOfflineTicketRef(
  registerCode: string
): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Inicio del día actual en milisegundos locales
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  // Contar ventas offline registradas hoy para esta terminal específica
  const count = await posDb.sales
    .where('offline_timestamp')
    .aboveOrEqual(todayStart)
    .filter((s) => s.offline_ticket_ref.includes(registerCode))
    .count();
  
  const seq = (count + 1).toString().padStart(4, '0');
  return `OFFLINE-${registerCode}-${dateStr}-${seq}`;
}
