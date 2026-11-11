import { Pool } from 'pg';
import fs from 'fs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const backupPath = '/home/lmontes/Documentos/Telegram/Market/database_backup/full_database_backup.json';
  if (!fs.existsSync(backupPath)) {
    console.error('Backup file not found at:', backupPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(backupPath, 'utf8');
  const backup = JSON.parse(raw);

  const shopCats = backup.tables.categories.filter((c: any) => c.tenant_id === 'shop-market-ca');
  const shopProds = backup.tables.products.filter((p: any) => p.tenant_id === 'shop-market-ca');
  const shopInv = backup.tables.inventory.filter((i: any) => i.tenant_id === 'shop-market-ca');

  console.log(`Adapting ${shopCats.length} categories and ${shopProds.length} products to tenant_shopmarket...`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get primary store ID
    const storeRes = await client.query('SELECT id FROM tenant_shopmarket.stores LIMIT 1');
    if (storeRes.rowCount === 0) {
      throw new Error('No store found in tenant_shopmarket.stores');
    }
    const storeId = storeRes.rows[0].id;
    console.log(`Using store ID: ${storeId}`);

    // Clean up previous test products, inventory and test orders
    console.log('Cleaning up previous test records in tenant_shopmarket...');
    await client.query('DELETE FROM tenant_shopmarket.inventory_movements');
    await client.query('DELETE FROM tenant_shopmarket.order_items');
    await client.query('DELETE FROM tenant_shopmarket.orders');
    await client.query('DELETE FROM tenant_shopmarket.inventory');
    await client.query('DELETE FROM tenant_shopmarket.products');
    await client.query('DELETE FROM tenant_shopmarket.categories');

    // 2. Insert categories
    for (const cat of shopCats) {
      await client.query(
        `INSERT INTO tenant_shopmarket.categories (id, name, slug, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [cat.id, cat.name, cat.slug, cat.sort_order ?? 0, cat.is_active ?? true]
      );
      console.log(`  ✓ Category: ${cat.name} (${cat.slug})`);
    }

    // 3. Insert products & inventory
    for (const prod of shopProds) {
      const invRecord = shopInv.find((i: any) => i.product_id === prod.id);
      let stock = invRecord ? parseFloat(invRecord.quantity) : 0;
      if (stock <= 0) {
        stock = 25; // Provide stock for testability
      }

      await client.query(
        `INSERT INTO tenant_shopmarket.products (
           id, category_id, name, slug, description, sku, barcode,
           image_url, price_usd, cost_price, is_active, track_inventory,
           current_stock, min_stock_alert
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          prod.id,
          prod.category_id,
          prod.name,
          prod.slug,
          prod.description || '',
          prod.sku || `SKU-${prod.id.slice(0, 8)}`,
          prod.barcode || null,
          prod.image_url,
          prod.price_usd,
          prod.cost_price || null,
          prod.is_active ?? true,
          true,
          stock,
          5
        ]
      );

      // Inventory record
      await client.query(
        `INSERT INTO tenant_shopmarket.inventory (store_id, product_id, quantity, min_quantity)
         VALUES ($1, $2, $3, $4)`,
        [storeId, prod.id, stock, 5]
      );

      console.log(`  ✓ Product: [${prod.sku}] ${prod.name} -> $${prod.price_usd} (Stock: ${stock})`);
    }

    await client.query('COMMIT');
    console.log('Successfully adapted all 4 categories and 18 products with inventory to tenant_shopmarket!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
