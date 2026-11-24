import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const receiptItemSchema = z.object({
  product_id: z.string().uuid('ID de producto requerido'),
  quantity: z.number().positive('La cantidad debe ser mayor a 0'),
  unit_cost_primary: z.number().min(0, 'El costo unitario no puede ser negativo').optional(),
  unit_cost_usd: z.number().min(0, 'El costo unitario no puede ser negativo').optional(),
}).refine(data => (data.unit_cost_primary ?? data.unit_cost_usd) !== undefined, {
  message: 'El costo unitario es requerido',
  path: ['unit_cost_primary'],
});

const createReceiptSchema = z.object({
  supplier_id: z.string().uuid('ID de proveedor requerido'),
  store_id: z.string().uuid('ID de sucursal requerido').optional().nullable(),
  supplier_bill_number: z.string().trim().optional().nullable(),
  with_stock_entry: z.boolean().default(true),
  notes: z.string().trim().optional().nullable(),
  items: z.array(receiptItemSchema).min(1, 'Debe incluir al menos un producto a recibir'),
  auto_confirm: z.boolean().default(true),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant } = await requireTenantStaffApi(slug, 'pos');
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || 'ALL';
    const supplierId = searchParams.get('supplier_id');

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      const conditions: string[] = ['1=1'];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (status !== 'ALL') {
        conditions.push(`r.status = $${paramIdx++}`);
        values.push(status);
      }
      if (supplierId) {
        conditions.push(`r.supplier_id = $${paramIdx++}`);
        values.push(supplierId);
      }

      const query = `
        SELECT 
          r.id,
          r.receipt_number,
          r.supplier_id,
          s.name as supplier_name,
          r.store_id,
          st.name as store_name,
          r.status,
          r.with_stock_entry,
          r.supplier_bill_number,
          r.notes,
          r.confirmed_at,
          r.created_at,
          b.id as bill_id,
          b.internal_number as bill_number,
          b.total_primary as bill_total_primary,
          b.total_usd as bill_total_usd,
          b.balance_primary as bill_balance_primary,
          b.balance_usd as bill_balance_usd,
          b.status as bill_status,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ri.id,
                'product_id', ri.product_id,
                'product_name', p.name,
                'product_sku', p.sku,
                'quantity', ri.quantity,
                'unit_cost_primary', ri.unit_cost_primary,
                'unit_cost_usd', ri.unit_cost_usd,
                'total_primary', ri.total_primary,
                'total_usd', ri.total_usd
              )
            ) FILTER (WHERE ri.id IS NOT NULL), '[]'::json
          ) as items,
          COALESCE(SUM(ri.total_primary), 0.00) as total_primary,
          COALESCE(SUM(ri.total_primary), 0.00) as total_usd
        FROM ${tenant.db_schema_name}.cxp_goods_receipts r
        JOIN ${tenant.db_schema_name}.cxp_suppliers s ON s.id = r.supplier_id
        LEFT JOIN ${tenant.db_schema_name}.stores st ON st.id = r.store_id
        LEFT JOIN ${tenant.db_schema_name}.cxp_bills b ON b.goods_receipt_id = r.id
        LEFT JOIN ${tenant.db_schema_name}.cxp_goods_receipt_items ri ON ri.receipt_id = r.id
        LEFT JOIN ${tenant.db_schema_name}.products p ON p.id = ri.product_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY r.id, s.name, st.name, b.id, b.internal_number, b.total_primary, b.total_usd, b.balance_primary, b.balance_usd, b.status
        ORDER BY r.created_at DESC
        LIMIT 100;
      `;

      const res = await client.query(query, values);

      return NextResponse.json({
        success: true,
        receipts: res.rows.map((r) => {
          const tot = parseFloat(r.total_primary ?? r.total_usd) || 0;
          return {
            ...r,
            total_primary: tot,
            total_usd: tot,
          };
        }),
      });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al listar recepciones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'pos');
    const body = await request.json();
    const data = createReceiptSchema.parse(body);

    return await withTenantDb(tenant.db_schema_name, null, async (client) => {
      // 1. Resolver sucursal por defecto si no se especificó
      let storeId = data.store_id;
      if (!storeId) {
        const storeRes = await client.query(
          `SELECT id FROM ${tenant.db_schema_name}.stores WHERE is_active = true ORDER BY created_at ASC LIMIT 1;`
        );
        if (storeRes.rows.length === 0) {
          throw new Error('No hay sucursales activas en el tenant.');
        }
        storeId = storeRes.rows[0].id;
      }

      // 2. Generar correlativo REC-YYYYMM-######
      const seqRes = await client.query(
        `SELECT format('REC-%s-%s', to_char(CURRENT_DATE, 'YYYYMM'), lpad(nextval('${tenant.db_schema_name}.cxp_receipt_seq')::text, 6, '0')) as num;`
      );
      const receiptNumber = seqRes.rows[0].num;

      // 3. Insertar la recepción base en DRAFT
      const receiptRes = await client.query(`
        INSERT INTO ${tenant.db_schema_name}.cxp_goods_receipts (
          receipt_number, supplier_id, store_id, received_by, status,
          with_stock_entry, supplier_bill_number, notes
        ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7)
        RETURNING id, receipt_number;
      `, [
        receiptNumber,
        data.supplier_id,
        storeId,
        staff.id,
        data.with_stock_entry,
        data.supplier_bill_number || null,
        data.notes || null,
      ]);
      const receiptId = receiptRes.rows[0].id;

      // 4. Insertar los ítems
      for (const item of data.items) {
        const unitCost = item.unit_cost_primary ?? item.unit_cost_usd ?? 0;
        const itemTotal = Number((item.quantity * unitCost).toFixed(2));
        await client.query(`
          INSERT INTO ${tenant.db_schema_name}.cxp_goods_receipt_items (
            receipt_id, product_id, quantity, unit_cost_primary, unit_cost_usd, total_primary, total_usd
          ) VALUES ($1, $2, $3, $4, $4, $5, $5);
        `, [
          receiptId,
          item.product_id,
          item.quantity,
          unitCost,
          itemTotal,
        ]);
      }

      // 5. Si auto_confirm está activado, ejecutar confirmación e inserción al kardex
      let confirmResult = null;
      if (data.auto_confirm) {
        const confRes = await client.query(`
          SELECT platform.rpc_cxp_confirm_goods_receipt($1, $2, $3, $4, $5) as result;
        `, [
          tenant.db_schema_name,
          receiptId,
          staff.id,
          staff.role,
          data.supplier_bill_number || null,
        ]);
        confirmResult = confRes.rows[0]?.result;
      }

      return NextResponse.json({
        success: true,
        receipt_id: receiptId,
        receipt_number: receiptNumber,
        confirmed: !!confirmResult,
        confirmation: confirmResult,
      }, { status: 201 });
    });
  } catch (err: unknown) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al registrar recepción';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
