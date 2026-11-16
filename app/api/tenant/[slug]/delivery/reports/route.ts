import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'reports');
    const schema = tenant.db_schema_name;

    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    // Fechas por defecto: mes en curso
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const fromDate = fromParam || firstDay;
    const toDate = toParam || lastDay;

    const res = await pool.query(
      `SELECT platform.rpc_df_intel_report($1, $2::date, $3::date) AS report`,
      [schema, fromDate, toDate]
    );

    const report = res.rows[0]?.report || {};

    return NextResponse.json({
      success: true,
      from: fromDate,
      to: toDate,
      report,
    });
  } catch (error) {
    if (error instanceof TenantAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching delivery report:', error);
    return NextResponse.json({ error: 'Error al generar reporte de delivery' }, { status: 500 });
  }
}
