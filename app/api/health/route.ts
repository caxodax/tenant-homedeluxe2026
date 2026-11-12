import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = performance.now();
  try {
    await pool.query('SELECT 1');
    const latency_ms = Number((performance.now() - start).toFixed(2));
    return NextResponse.json(
      {
        status: 'ok',
        db: 'connected',
        latency_ms,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const latency_ms = Number((performance.now() - start).toFixed(2));
    return NextResponse.json(
      {
        status: 'error',
        db: 'disconnected',
        latency_ms,
        error: error instanceof Error ? error.message : 'Database connection failed',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
