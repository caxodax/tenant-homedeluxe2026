import { NextRequest, NextResponse } from 'next/server';
import { withTenantDb } from '@/lib/db';
import { requireTenantStaffApi, resolveOperationalStoreId, TenantAuthError } from '@/lib/auth/tenant-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createTransferSchema = z.object({
  origin_store_id: z.string().uuid(),
  destination_store_id: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
  auto_dispatch: z.boolean().optional().default(false),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().optional().nullable(),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1, 'Agrega al menos un producto al traslado'),
});

const patchTransferSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('DISPATCH'),
    transfer_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('RECEIVE'),
    transfer_id: z.string().uuid(),
    items_received: z
      .array(
        z.object({
          item_id: z.string().uuid(),
          quantity_received: z.coerce.number().min(0),
          discrepancy_reason: z.string().max(300).optional().nullable(),
        })
      )
      .optional(),
  }),
  z.object({
    action: z.literal('CANCEL'),
    transfer_id: z.string().uuid(),
  }),
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = await requireTenantStaffApi(slug, 'inventory');
    const storeId = await resolveOperationalStoreId(ctx, request.nextUrl.searchParams.get('store_id'), {
      allowConsolidatedForManagers: true,
    });

    const data = await withTenantDb(ctx.tenant.db_schema_name, null, async (client) => {
      const [storesRes, productsRes, transfersRes] = await Promise.all([
        client.query(`SELECT id, name, code, is_default FROM stores WHERE is_active = true ORDER BY is_default DESC, name ASC`),
        client.query(`
          SELECT p.id, p.name, p.sku,
            COALESCE(
              (SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku))
               FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = true),
              '[]'::jsonb
            ) AS variants
          FROM products p
          WHERE p.is_active = true AND p.deleted_at IS NULL AND p.track_inventory = true
          ORDER BY p.name ASC
        `),
        client.query(
          `
          SELECT
            st.*,
            so.name AS origin_store_name,
            sd.name AS destination_store_name,
            COALESCE(
              (SELECT jsonb_agg(jsonb_build_object(
                'id', sti.id,
                'product_id', sti.product_id,
                'product_name', p.name,
                'sku', p.sku,
                'variant_id', sti.variant_id,
                'variant_name', pv.name,
                'quantity_dispatched', sti.quantity_dispatched,
                'quantity_received', sti.quantity_received,
                'discrepancy_reason', sti.discrepancy_reason
              ))
               FROM stock_transfer_items sti
               JOIN products p ON p.id = sti.product_id
               LEFT JOIN product_variants pv ON pv.id = sti.variant_id
               WHERE sti.transfer_id = st.id),
              '[]'::jsonb
            ) AS items
          FROM stock_transfers st
          JOIN stores so ON so.id = st.origin_store_id
          JOIN stores sd ON sd.id = st.destination_store_id
          ${storeId ? 'WHERE st.origin_store_id = $1 OR st.destination_store_id = $1' : ''}
          ORDER BY st.created_at DESC
          LIMIT 50
        `,
          storeId ? [storeId] : []
        ),
      ]);

      return {
        stores: storesRes.rows,
        products: productsRes.rows,
        transfers: transfersRes.rows,
      };
    });

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('Error fetching transfers:', err);
    return NextResponse.json({ error: 'Error al consultar traslados' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'inventory');
    const body = await request.json();
    const parsed = createTransferSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (d.origin_store_id === d.destination_store_id) {
      return NextResponse.json({ error: 'La sede origen y destino deben ser distintas' }, { status: 400 });
    }

    const staffUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id)
      ? staff.id
      : null;

    const result = await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      const seqRes = await client.query(`SELECT nextval('stock_transfer_seq') AS seq`);
      const seq = String(seqRes.rows[0]?.seq || '1').padStart(6, '0');
      const now = new Date();
      const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const transferNumber = `TRF-${yyyymm}-${seq}`;

      const ins = await client.query(
        `INSERT INTO stock_transfers (transfer_number, origin_store_id, destination_store_id, status, notes)
         VALUES ($1, $2, $3, 'DRAFT', $4)
         RETURNING id, transfer_number`,
        [transferNumber, d.origin_store_id, d.destination_store_id, d.notes || null]
      );
      const transfer = ins.rows[0];

      for (const item of d.items) {
        await client.query(
          `INSERT INTO stock_transfer_items (transfer_id, product_id, variant_id, quantity_dispatched)
           VALUES ($1, $2, $3, $4)`,
          [transfer.id, item.product_id, item.variant_id || null, item.quantity]
        );
      }

      if (d.auto_dispatch) {
        const rpcRes = await client.query(
          `SELECT platform.rpc_core_dispatch_transfer($1::text, $2::uuid, $3::uuid) AS res`,
          [tenant.db_schema_name, transfer.id, staffUuid]
        );
        const dispatchOut = rpcRes.rows[0]?.res;
        if (!dispatchOut?.success) {
          throw new Error(dispatchOut?.error || 'Error al despachar traslado');
        }
      }

      return transfer;
    });

    return NextResponse.json({ success: true, transfer: result }, { status: 201 });
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al crear traslado';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { tenant, staff } = await requireTenantStaffApi(slug, 'inventory');
    const body = await request.json();
    const parsed = patchTransferSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    const d = parsed.data;
    const staffUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(staff.id)
      ? staff.id
      : null;

    const out = await withTenantDb(tenant.db_schema_name, staff.id, async (client) => {
      if (d.action === 'CANCEL') {
        const res = await client.query(
          `UPDATE stock_transfers SET status = 'CANCELLED', updated_at = now()
           WHERE id = $1 AND status = 'DRAFT' RETURNING id`,
          [d.transfer_id]
        );
        if ((res.rowCount || 0) === 0) throw new Error('Solo se pueden cancelar traslados en borrador');
        return { success: true, status: 'CANCELLED' };
      }

      if (d.action === 'DISPATCH') {
        const res = await client.query(
          `SELECT platform.rpc_core_dispatch_transfer($1::text, $2::uuid, $3::uuid) AS res`,
          [tenant.db_schema_name, d.transfer_id, staffUuid]
        );
        const r = res.rows[0]?.res;
        if (!r?.success) throw new Error(r?.error || 'No se pudo despachar el traslado');
        return r;
      }

      // RECEIVE: si no se especifican cantidades, se asume recepción completa de lo despachado
      let itemsReceived = d.items_received;
      if (!itemsReceived || itemsReceived.length === 0) {
        const itRes = await client.query(
          `SELECT id AS item_id, quantity_dispatched AS quantity_received
           FROM stock_transfer_items WHERE transfer_id = $1`,
          [d.transfer_id]
        );
        itemsReceived = itRes.rows;
      }

      const res = await client.query(
        `SELECT platform.rpc_core_receive_transfer($1::text, $2::uuid, $3::jsonb, $4::uuid) AS res`,
        [tenant.db_schema_name, d.transfer_id, JSON.stringify(itemsReceived), staffUuid]
      );
      const r = res.rows[0]?.res;
      if (!r?.success) throw new Error(r?.error || 'No se pudo recibir el traslado');
      return r;
    });

    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof TenantAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error al procesar traslado';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
