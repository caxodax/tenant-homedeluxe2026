const fs = require('fs');
const { Pool } = require('../marketos-app/node_modules/pg');

const envFile = fs.readFileSync('marketos-app/.env.local', 'utf-8');
let dbUrl = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
}

if (!dbUrl) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Setting search_path to tenant_garagechilling53...');
    await client.query('SET search_path TO tenant_garagechilling53, public');

    // 1. Limpieza idempotente previa si existiese
    console.log('2. Cleaning previous catalog data if any...');
    await client.query('DELETE FROM fs_group_modifiers');
    await client.query('DELETE FROM fs_product_groups');
    await client.query('DELETE FROM fs_modifier_groups');
    await client.query('DELETE FROM product_variants');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM categories');

    // 2. Crear Categorías
    console.log('3. Inserting categories...');
    const categoriesData = [
      { name: 'Entradas', slug: 'entradas', sort_order: 1, is_hidden: false },
      { name: 'Almuerzos Ejecutivos', slug: 'almuerzos-ejecutivos', sort_order: 2, is_hidden: false },
      { name: 'Burgers', slug: 'burgers', sort_order: 3, is_hidden: false },
      { name: 'Pepitos', slug: 'pepitos', sort_order: 4, is_hidden: false },
      { name: 'Platos al Grill & Especialidades', slug: 'platos-al-grill', sort_order: 5, is_hidden: false },
      { name: 'Pastas', slug: 'pastas', sort_order: 6, is_hidden: false },
      { name: 'Ensaladas', slug: 'ensaladas', sort_order: 7, is_hidden: false },
      { name: 'Promociones', slug: 'promociones', sort_order: 8, is_hidden: false },
      { name: 'Bebidas & Batidos', slug: 'bebidas-y-batidos', sort_order: 9, is_hidden: false },
      { name: 'Acompañantes y Modificadores', slug: 'adicionales-y-modificadores', sort_order: 99, is_hidden: true },
    ];

    const categoryMap = {};
    for (const cat of categoriesData) {
      const res = await client.query(`
        INSERT INTO categories (name, slug, sort_order, is_active, is_hidden)
        VALUES ($1, $2, $3, true, $4)
        RETURNING id, slug
      `, [cat.name, cat.slug, cat.sort_order, cat.is_hidden]);
      categoryMap[res.rows[0].slug] = res.rows[0].id;
    }
    console.log(`   ✓ ${Object.keys(categoryMap).length} categories created.`);

    // Helper para insertar productos
    const productMap = {};
    async function insertProduct(data) {
      const catId = categoryMap[data.category_slug];
      const res = await client.query(`
        INSERT INTO products (
          category_id, name, slug, description, sku,
          price_primary, cost_price, is_active, is_tax_exempt,
          track_inventory, current_stock, min_stock_alert
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, true, false,
          false, 999, 10
        ) RETURNING id, slug, name
      `, [
        catId,
        data.name,
        data.slug,
        data.description || '',
        data.sku || `GAR-${Math.floor(1000 + Math.random() * 9000)}`,
        data.price_primary,
        data.cost_price || (data.price_primary * 0.4).toFixed(2)
      ]);
      productMap[data.slug] = res.rows[0].id;
      return res.rows[0];
    }

    // 3. Crear Acompañantes (Contornos $0) y Modificadores
    console.log('4. Inserting modifiers and sides ($0 and extras)...');
    
    // Contornos de Almuerzos ($0.00)
    const contornosData = [
      { name: 'Contorno: Arroz Blanco', slug: 'contorno-arroz-blanco', sku: 'GAR-SIDE-ARR' },
      { name: 'Contorno: Tajadas', slug: 'contorno-tajadas', sku: 'GAR-SIDE-TAJ' },
      { name: 'Contorno: Tostones', slug: 'contorno-tostones', sku: 'GAR-SIDE-TOS' },
      { name: 'Contorno: Papas Fritas', slug: 'contorno-papas-fritas', sku: 'GAR-SIDE-PAP' },
      { name: 'Contorno: Papas al Ajillo', slug: 'contorno-papas-al-ajillo', sku: 'GAR-SIDE-PAJ' },
      { name: 'Contorno: Pan al Ajillo', slug: 'contorno-pan-al-ajillo', sku: 'GAR-SIDE-PAN' },
      { name: 'Contorno: Puré de Papas', slug: 'contorno-pure-de-papas', sku: 'GAR-SIDE-PUR' },
      { name: 'Contorno: Ensalada César', slug: 'contorno-ensalada-cesar', sku: 'GAR-SIDE-CES' },
      { name: 'Contorno: Ensalada Criolla', slug: 'contorno-ensalada-criolla', sku: 'GAR-SIDE-CRI' },
      { name: 'Contorno: Ensalada Coleslaw', slug: 'contorno-ensalada-coleslaw', sku: 'GAR-SIDE-COL' },
      { name: 'Contorno: Plátano Dulce', slug: 'contorno-platano-dulce', sku: 'GAR-SIDE-PLA' },
      { name: 'Contorno: Pasta Napolitana', slug: 'contorno-pasta-napolitana', sku: 'GAR-SIDE-PAS' },
      { name: 'Contorno: Yuca (Frita o Sancochada)', slug: 'contorno-yuca', sku: 'GAR-SIDE-YUC' },
    ];
    const contornoIds = [];
    for (const c of contornosData) {
      const p = await insertProduct({
        ...c,
        description: 'Acompañante incluido en tu almuerzo (sin costo)',
        price_primary: 0.00,
        cost_price: 0.00,
        category_slug: 'adicionales-y-modificadores'
      });
      contornoIds.push(p.id);
    }

    // Panes para Hamburguesas ($0.00)
    const panesData = [
      { name: 'Pan Brioche', slug: 'pan-brioche', sku: 'GAR-BREAD-BRI' },
      { name: 'Pan de Papa', slug: 'pan-de-papa', sku: 'GAR-BREAD-PAP' }
    ];
    const panIds = [];
    for (const pData of panesData) {
      const p = await insertProduct({
        ...pData,
        description: 'Tipo de pan a elección (sin costo adicional)',
        price_primary: 0.00,
        cost_price: 0.00,
        category_slug: 'adicionales-y-modificadores'
      });
      panIds.push(p.id);
    }

    // Proteínas para Pepitos ($0.00)
    const proteinasPepitoData = [
      { name: 'Proteína: Pollo', slug: 'pepito-prot-pollo', sku: 'GAR-PEP-POL' },
      { name: 'Proteína: Lomito', slug: 'pepito-prot-lomito', sku: 'GAR-PEP-LOM' },
      { name: 'Proteína: Mixto (Pollo y Lomito)', slug: 'pepito-prot-mixto', sku: 'GAR-PEP-MIX' }
    ];
    const protPepitoIds = [];
    for (const pp of proteinasPepitoData) {
      const p = await insertProduct({
        ...pp,
        description: 'Proteína de tu pepito sin costo adicional',
        price_primary: 0.00,
        cost_price: 0.00,
        category_slug: 'adicionales-y-modificadores'
      });
      protPepitoIds.push(p.id);
    }

    // Proteínas para Pastas ($0.00)
    const proteinasPastaData = [
      { name: 'Pasta: Con Pollo', slug: 'pasta-prot-pollo', sku: 'GAR-PAS-POL' },
      { name: 'Pasta: Con Lomito', slug: 'pasta-prot-lomito', sku: 'GAR-PAS-LOM' },
      { name: 'Pasta: Sin Proteína Adicional', slug: 'pasta-prot-ninguna', sku: 'GAR-PAS-NON' }
    ];
    const protPastaIds = [];
    for (const prp of proteinasPastaData) {
      const p = await insertProduct({
        ...prp,
        description: 'Proteína de preferencia para tu pasta',
        price_primary: 0.00,
        cost_price: 0.00,
        category_slug: 'adicionales-y-modificadores'
      });
      protPastaIds.push(p.id);
    }

    // Adicionales con Costo
    const extrasData = [
      { name: 'Extra: Pepinillos', slug: 'extra-pepinillos', sku: 'GAR-EXT-PEP', price: 1.00 },
      { name: 'Extra: Queso Facilista', slug: 'extra-queso-facilista', sku: 'GAR-EXT-FAC', price: 1.00 },
      { name: 'Extra: Tocineta', slug: 'extra-tocineta', sku: 'GAR-EXT-TOC', price: 1.00 },
      { name: 'Extra: Crema de Champiñones', slug: 'extra-crema-champinones', sku: 'GAR-EXT-CHA', price: 1.00 },
      { name: 'Extra: Cebolla Caramelizada', slug: 'extra-cebolla-caramelizada', sku: 'GAR-EXT-CEB', price: 1.00 },
      { name: 'Extra: Maíz', slug: 'extra-maiz', sku: 'GAR-EXT-MAI', price: 0.50 },
      { name: 'Extra: Chorizo Montserratina', slug: 'extra-chorizo-montserratina', sku: 'GAR-EXT-CHO', price: 2.50 },
      { name: 'Extra: Camarones', slug: 'extra-camarones', sku: 'GAR-EXT-CAM', price: 2.00 },
      { name: 'Extra: Carne Solomo 150g', slug: 'extra-carne-solomo-150g', sku: 'GAR-EXT-CAR', price: 3.00 },
      { name: 'Extra: Pollo Crispy', slug: 'extra-pollo-crispy', sku: 'GAR-EXT-POL', price: 3.00 },
      { name: 'Extra: Agrandar Ración de Papas', slug: 'extra-agranda-papas', sku: 'GAR-EXT-PAP', price: 1.00 },
    ];
    const extraIds = [];
    for (const ext of extrasData) {
      const p = await insertProduct({
        name: ext.name,
        slug: ext.slug,
        sku: ext.sku,
        description: 'Topping / Adicional con costo',
        price_primary: ext.price,
        cost_price: (ext.price * 0.4).toFixed(2),
        category_slug: 'adicionales-y-modificadores'
      });
      extraIds.push(p.id);
    }

    // 4. Crear Grupos de Modificadores en Food Service
    console.log('5. Setting up Food Service modifier groups...');
    
    // Grupo 1: Contornos Almuerzos (Elige exactamente 3 sin costo)
    const mgContornos = await client.query(`
      INSERT INTO fs_modifier_groups (name, min_select, max_select, required, sort_order, is_active)
      VALUES ('Contornos (Elige 3 Acompañantes Gratis)', 3, 3, true, 1, true)
      RETURNING id
    `);
    const mgContornosId = mgContornos.rows[0].id;
    for (let i = 0; i < contornoIds.length; i++) {
      await client.query('INSERT INTO fs_group_modifiers (group_id, product_id, sort_order) VALUES ($1, $2, $3)', [mgContornosId, contornoIds[i], i + 1]);
    }

    // Grupo 2: Pan de Hamburguesas (Elige 1 sin costo)
    const mgPan = await client.query(`
      INSERT INTO fs_modifier_groups (name, min_select, max_select, required, sort_order, is_active)
      VALUES ('Tipo de Pan', 1, 1, true, 2, true)
      RETURNING id
    `);
    const mgPanId = mgPan.rows[0].id;
    for (let i = 0; i < panIds.length; i++) {
      await client.query('INSERT INTO fs_group_modifiers (group_id, product_id, sort_order) VALUES ($1, $2, $3)', [mgPanId, panIds[i], i + 1]);
    }

    // Grupo 3: Proteína de Pepito (Elige 1 sin costo)
    const mgProtPepito = await client.query(`
      INSERT INTO fs_modifier_groups (name, min_select, max_select, required, sort_order, is_active)
      VALUES ('Proteína de tu Pepito', 1, 1, true, 3, true)
      RETURNING id
    `);
    const mgProtPepitoId = mgProtPepito.rows[0].id;
    for (let i = 0; i < protPepitoIds.length; i++) {
      await client.query('INSERT INTO fs_group_modifiers (group_id, product_id, sort_order) VALUES ($1, $2, $3)', [mgProtPepitoId, protPepitoIds[i], i + 1]);
    }

    // Grupo 4: Proteína de Pasta (Elige 1 sin costo)
    const mgProtPasta = await client.query(`
      INSERT INTO fs_modifier_groups (name, min_select, max_select, required, sort_order, is_active)
      VALUES ('Proteína para tu Pasta', 1, 1, true, 4, true)
      RETURNING id
    `);
    const mgProtPastaId = mgProtPasta.rows[0].id;
    for (let i = 0; i < protPastaIds.length; i++) {
      await client.query('INSERT INTO fs_group_modifiers (group_id, product_id, sort_order) VALUES ($1, $2, $3)', [mgProtPastaId, protPastaIds[i], i + 1]);
    }

    // Grupo 5: Adicionales y Toppings (Opcional)
    const mgExtras = await client.query(`
      INSERT INTO fs_modifier_groups (name, min_select, max_select, required, sort_order, is_active)
      VALUES ('Toppings y Adicionales', 0, 8, false, 5, true)
      RETURNING id
    `);
    const mgExtrasId = mgExtras.rows[0].id;
    for (let i = 0; i < extraIds.length; i++) {
      await client.query('INSERT INTO fs_group_modifiers (group_id, product_id, sort_order) VALUES ($1, $2, $3)', [mgExtrasId, extraIds[i], i + 1]);
    }

    // 5. Inserción de Productos de Carta Principal
    console.log('6. Inserting main menu products...');

    // A. ENTRADAS
    const entradas = [
      { name: 'Aros de Cebolla', slug: 'aros-de-cebolla', price_primary: 3.00, sku: 'GAR-ENT-01', description: 'Aros de cebolla crispy, acompañados de salsa BBQ.' },
      { name: 'Ración de Papas', slug: 'racion-de-papas', price_primary: 5.00, sku: 'GAR-ENT-02', description: '300 gr. de papas naturales con sal y paprika.' },
      { name: 'Tenders de Pollo', slug: 'tenders-de-pollo', price_primary: 7.00, sku: 'GAR-ENT-03', description: '250 gr. tiras de pollo crispy, acompañados con papas naturales.' },
      { name: 'Papas Sweet', slug: 'papas-sweet', price_primary: 6.00, sku: 'GAR-ENT-04', description: '300 gr. de papas fritas, bañadas en queso cheddar, tocineta y cebolla caramelizada.' },
      { name: 'Papas Garage', slug: 'papas-garage', price_primary: 8.00, sku: 'GAR-ENT-05', description: '300 gr. de papas fritas, bañadas en queso cheddar, tocineta, pollo o lomito.' },
      { name: 'Papas Cheddar', slug: 'papas-cheddar', price_primary: 6.00, sku: 'GAR-ENT-06', description: '300 gr. de papas fritas, bañadas en queso cheddar y tocineta.' },
      { name: 'Tequeños Tradicionales (10 unid.)', slug: 'tequenos-tradicionales', price_primary: 6.00, sku: 'GAR-ENT-07', description: '10 tequeños artesanales de 7cm acompañados con salsa de la casa.' },
      { name: 'Tequeños Cheddar & Tocineta (10 unid.)', slug: 'tequenos-cheddar', price_primary: 8.00, sku: 'GAR-ENT-08', description: '10 tequeños artesanales de 7 cm bañados en queso cheddar fundido y tocineta crocante.' },
      { name: 'Tostones Coleslaw', slug: 'tostones-coleslaw', price_primary: 4.00, sku: 'GAR-ENT-09', description: 'Cesta de tostón con ensalada coleslaw fresca y queso blanco rallado.' },
    ];
    for (const e of entradas) {
      const prod = await insertProduct({ ...e, category_slug: 'entradas' });
      // Si son tequeños, agregamos variante de 1/2 ración
      if (e.slug === 'tequenos-tradicionales') {
        await client.query(`
          INSERT INTO product_variants (product_id, name, sku, price_adjustment_primary, cost_price, attributes)
          VALUES 
            ($1, 'Ración Completa (10 tequeños)', 'GAR-TEQ-10', 0.00, 2.40, '{"size": "COMPLETA", "qty": 10, "is_default": true}'),
            ($1, 'Media Ración (5 tequeños)', 'GAR-TEQ-05', -2.00, 1.20, '{"size": "MEDIA", "qty": 5, "is_default": false}')
        `, [prod.id]);
      } else if (e.slug === 'tequenos-cheddar') {
        await client.query(`
          INSERT INTO product_variants (product_id, name, sku, price_adjustment_primary, cost_price, attributes)
          VALUES 
            ($1, 'Ración Completa (10 tequeños)', 'GAR-TEQCH-10', 0.00, 3.20, '{"size": "COMPLETA", "qty": 10, "is_default": true}'),
            ($1, 'Media Ración (5 tequeños)', 'GAR-TEQCH-05', -3.00, 1.60, '{"size": "MEDIA", "qty": 5, "is_default": false}')
        `, [prod.id]);
      }
    }

    // B. PASTAS
    const pastas = [
      { name: 'Pasticho de la Casa', slug: 'pasticho-de-la-casa', price_primary: 10.00, sku: 'GAR-PAS-01', description: 'Delicioso pasticho de la casa acompañado con pan al ajillo.' },
      { name: 'Pasta Garage', slug: 'pasta-garage', price_primary: 10.00, sku: 'GAR-PAS-02', description: 'Pasta en pesto con ajo confitado y demi-glace, con tomate cherry, albahaca y medallones de lomito glaseado.' },
      { name: 'Pasta Cuatro Quesos', slug: 'pasta-cuatro-quesos', price_primary: 8.00, sku: 'GAR-PAS-03', description: 'Pasta al dente en salsa cuatro quesos con proteína de tu preferencia, acompañada de pan al ajillo.', hasProt: true },
      { name: 'Pasta Pesto Cremoso', slug: 'pasta-pesto-cremoso', price_primary: 8.00, sku: 'GAR-PAS-04', description: 'Pasta al dente cremada en bechamel y pesto, coronada con tomate seco, parmesano y albahaca. Acompañada con proteína de tu preferencia.', hasProt: true },
      { name: 'Pasta Boloñesa', slug: 'pasta-bolonesa', price_primary: 8.00, sku: 'GAR-PAS-05', description: 'Pasta al dente con salsa boloñesa de la casa, servida con pan al ajillo.' },
      { name: 'Pasta Carbonara', slug: 'pasta-carbonara', price_primary: 8.00, sku: 'GAR-PAS-06', description: 'Pasta con panceta, crema al estilo americano, parmesano y pimienta negra. Servida con pan al ajillo.' },
    ];
    for (const p of pastas) {
      const prod = await insertProduct({ ...p, category_slug: 'pastas' });
      if (p.hasProt) {
        await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgProtPastaId]);
      }
    }

    // C. ENSALADAS
    const ensaladas = [
      { name: 'Ensalada César Tradicional', slug: 'ensalada-cesar-tradicional', price_primary: 4.00, sku: 'GAR-ENS-01', description: 'Lechuga fresca, crotones de pan tostado, queso parmesano, aderezo césar y tocineta.' },
      { name: 'Ensalada César con Pollo', slug: 'ensalada-cesar-pollo', price_primary: 6.00, sku: 'GAR-ENS-02', description: 'Lechuga fresca, crotones de pan tostado, queso parmesano, aderezo césar y 200Gr de pollo.' },
      { name: 'Ensalada César con Pollo Crispy', slug: 'ensalada-cesar-pollo-crispy', price_primary: 7.00, sku: 'GAR-ENS-03', description: 'Lechuga fresca, crotones de pan tostado, queso parmesano, aderezo césar y 200Gr de pollo crispy.' },
      { name: 'Ensalada César Pollo y Camarones', slug: 'ensalada-cesar-pollo-camarones', price_primary: 9.00, sku: 'GAR-ENS-04', description: 'Lechuga fresca, crotones de pan tostado, queso parmesano, aderezo césar, 200Gr de pollo con camarones.' },
    ];
    for (const ens of ensaladas) {
      await insertProduct({ ...ens, category_slug: 'ensaladas' });
    }

    // D. PLATOS AL GRILL & ESPECIALIDADES
    const platos = [
      { name: 'Filet de Merluza con Camarones', slug: 'filet-merluza-camarones', price_primary: 13.00, sku: 'GAR-PLA-01', description: 'Camarones al ajillo en salsa de camarones blancas y salsa mixta, acompañado con ensalada criolla, puré de papa y tostones.' },
      { name: 'Milanesa con Salsa de Camarones', slug: 'milanesa-salsa-camarones', price_primary: 10.00, sku: 'GAR-PLA-02', description: 'Milanesa al grill coronado con salsa de camarones, acompañado de canastas de tostones con ensalada coleslaw, queso y puré de papas.' },
      { name: 'Pabellón Criollo', slug: 'pabellon-criollo', price_primary: 10.00, sku: 'GAR-PLA-03', description: 'El Pabellón Criollo trae carne mechada acompañado con arroz blanco, caraotas negras, tajadas de plátano maduro y arepa.' },
      { name: 'Solomo al Grill', slug: 'solomo-al-grill', price_primary: 12.00, sku: 'GAR-PLA-04', description: '250 Gr. de solomo al grill, ensalada césar tradicional, acompañado de 200 Gr. papas naturales.' },
      { name: 'Milanesa Crispy Napolitana', slug: 'milanesa-crispy-napolitana', price_primary: 11.00, sku: 'GAR-PLA-05', description: '250Gr de pollo crispy, bañada en salsa napolitana, gratinada con queso mozzarella, parmesano, ensalada césar tradicional y 200Gr de papas naturales.' },
      { name: 'Milanesa al Grill', slug: 'milanesa-al-grill', price_primary: 11.00, sku: 'GAR-PLA-06', description: '250 Gr. de milanesa al grill, ensalada césar tradicional, acompañado de 200 Gr. papas naturales.' },
      { name: 'Parrilla The Garage', slug: 'parrilla-the-garage', price_primary: 16.00, sku: 'GAR-PLA-07', description: '200Gr. de milanesa al grill, 300 Gr. de solomo al grill, chorizo montserratina ahumado, queso a la plancha, yuca, ensalada coleslaw y arepa frita.' },
    ];
    for (const pl of platos) {
      const prod = await insertProduct({ ...pl, category_slug: 'platos-al-grill' });
      await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgExtrasId]);
    }

    // E. ALMUERZOS EJECUTIVOS (18 Opciones - Vinculados obligatoriamente a Contornos)
    const almuerzos = [
      { name: 'Almuerzo: Milanesa al Ajillo', slug: 'almuerzo-milanesa-al-ajillo', price_primary: 8.00, sku: 'GAR-ALM-01' },
      { name: 'Almuerzo: Milanesa BBQ', slug: 'almuerzo-milanesa-bbq', price_primary: 8.00, sku: 'GAR-ALM-02' },
      { name: 'Almuerzo: Pollo Saltado', slug: 'almuerzo-pollo-saltado', price_primary: 9.00, sku: 'GAR-ALM-03' },
      { name: 'Almuerzo: Cerdo al Grill', slug: 'almuerzo-cerdo-al-grill', price_primary: 9.00, sku: 'GAR-ALM-04' },
      { name: 'Almuerzo: Milanesa al Curry', slug: 'almuerzo-milanesa-al-curry', price_primary: 9.00, sku: 'GAR-ALM-05' },
      { name: 'Almuerzo: Cordon Bleu', slug: 'almuerzo-cordon-bleu', price_primary: 11.00, sku: 'GAR-ALM-06' },
      { name: 'Almuerzo: Milanesa en Champiñones', slug: 'almuerzo-milanesa-en-champinones', price_primary: 9.00, sku: 'GAR-ALM-07' },
      { name: 'Almuerzo: Milanesa Crispy Gratinada en 3 Quesos', slug: 'almuerzo-milanesa-crispy-gratinada-3-quesos', price_primary: 11.00, sku: 'GAR-ALM-08' },
      { name: 'Almuerzo: Milanesa Napolitana', slug: 'almuerzo-milanesa-napolitana', price_primary: 11.00, sku: 'GAR-ALM-09' },
      { name: 'Almuerzo: Milanesa 4 Quesos', slug: 'almuerzo-milanesa-4-quesos', price_primary: 9.00, sku: 'GAR-ALM-10' },
      { name: 'Almuerzo: Chuleta Ahumada', slug: 'almuerzo-chuleta-ahumada', price_primary: 10.00, sku: 'GAR-ALM-11' },
      { name: 'Almuerzo: Cerdo en Crema de Piña', slug: 'almuerzo-cerdo-en-crema-de-pina', price_primary: 10.00, sku: 'GAR-ALM-12' },
      { name: 'Almuerzo: Lomo Saltado', slug: 'almuerzo-lomo-saltado', price_primary: 12.00, sku: 'GAR-ALM-13' },
      { name: 'Almuerzo: Lomito en Champiñones', slug: 'almuerzo-lomito-en-champinones', price_primary: 12.00, sku: 'GAR-ALM-14' },
      { name: 'Almuerzo: Solomo con Camarones', slug: 'almuerzo-solomo-con-camarones', price_primary: 13.00, sku: 'GAR-ALM-15' },
      { name: 'Almuerzo: Lomo al Vino', slug: 'almuerzo-lomo-al-vino', price_primary: 14.00, sku: 'GAR-ALM-16' },
      { name: 'Almuerzo: Cordon Bleu con Camarones', slug: 'almuerzo-cordon-bleu-con-camarones', price_primary: 12.00, sku: 'GAR-ALM-17' },
      { name: 'Almuerzo: Milanesa con Camarones al Ajillo', slug: 'almuerzo-milanesa-con-camarones-al-ajillo', price_primary: 12.00, sku: 'GAR-ALM-18' },
      { name: 'Almuerzo: Cerdo Coronado con Cebolla Caramelizada', slug: 'almuerzo-cerdo-coronado-cebolla-caramelizada', price_primary: 10.00, sku: 'GAR-ALM-19' },
    ];
    for (const alm of almuerzos) {
      const prod = await insertProduct({
        ...alm,
        description: 'Servicio de 11:00 AM a 4:00 PM. Incluye 1 proteína, 3 contornos a tu elección y bebida gratis.',
        category_slug: 'almuerzos-ejecutivos'
      });
      // Vincular a grupo obligatorio de Contornos (3 contornos gratis)
      await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgContornosId]);
      // Vincular a grupo opcional de Adicionales
      await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgExtrasId]);
    }

    // F. BURGERS (19 Hamburguesas - Vinculadas a Tipo de Pan y Adicionales)
    const burgers = [
      { name: 'Baby Burger', slug: 'baby-burger', price_primary: 6.00, sku: 'GAR-BUR-01', description: 'Pan de tu preferencia, carne solomo 75 Gr. o pollo crispy, queso cheddar, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Classic Chilling', slug: 'classic-chilling', price_primary: 8.00, sku: 'GAR-BUR-02', description: 'Pan de tu preferencia, carne solomo 150Gr o pollo crispy, facilista, tocineta, salsa de la casa, vegetales. Incluye papas naturales.' },
      { name: 'Atlanta Burger', slug: 'atlanta-burger', price_primary: 8.00, sku: 'GAR-BUR-03', description: 'Pan de tu preferencia, pollo crispy 150Gr, doble facilista, tocineta, BBQ Miel, pepinillos, salsa de la casa y lechuga. Incluye papas naturales.' },
      { name: 'Chicken Burger', slug: 'chicken-burger', price_primary: 8.00, sku: 'GAR-BUR-04', description: 'Pan de tu preferencia, pollo crispy, facilista, tocineta, pepinillos ensalada coleslaw y salsa de la casa. Incluye papas naturales.' },
      { name: 'Pullpork Burger', slug: 'pullpork-burger', price_primary: 12.00, sku: 'GAR-BUR-05', description: 'Pan de tu preferencia, carne smash 160Gr, pepinillos, salsa de la casa, queso facilista, queso mozzarella, coronado con un increíble pullpork al estilo Garage. Incluye papas naturales.' },
      { name: 'Ocean Burger', slug: 'ocean-burger', price_primary: 11.00, sku: 'GAR-BUR-06', description: 'Pan de tu preferencia, carne solomo 150Gr, facilista, tocineta, camarones al ajillo o crispy, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Garage Burger', slug: 'garage-burger', price_primary: 12.00, sku: 'GAR-BUR-07', description: 'Pan de tu preferencia, carne solomo 150Gr, chorizo montserratina, facilista, tocineta, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Standard Bacon', slug: 'standard-bacon', price_primary: 12.00, sku: 'GAR-BUR-08', description: 'Pan pequeño de tu preferencia, doble carne solomo 100Gr, doble facilista, mermelada de tocineta y pepinillos. Incluye papas naturales.' },
      { name: 'American Burger', slug: 'american-burger', price_primary: 13.00, sku: 'GAR-BUR-09', description: 'Pan de tu preferencia, doble carne solomo 150Gr, doble facilista, doble tocineta, pepinillos, salsa de la casa y lechuga. Incluye papas naturales.' },
      { name: 'Súper Garage', slug: 'super-garage', price_primary: 14.00, sku: 'GAR-BUR-10', description: 'Pan de tu preferencia, carne solomo 150Gr, pollo crispy, chorizo montserratina, queso facilista, tocineta, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Bendita Burger', slug: 'bendita-burger', price_primary: 11.00, sku: 'GAR-BUR-11', description: 'Pan de tu preferencia, carne smash 160Gr, queso mozzarella, tocineta, cebolla caramelizada con Dip de champiñones al parmesano. Incluye papas naturales.' },
      { name: 'Triple Cheese', slug: 'triple-cheese', price_primary: 13.00, sku: 'GAR-BUR-12', description: 'Pan de tu preferencia, triple carne solomo 100Gr, doble facilista, queso cheddar, doble tocineta, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Smash Burger', slug: 'smash-burger', price_primary: 13.00, sku: 'GAR-BUR-13', description: 'Pan de tu preferencia, doble carne smash 160 Gr, triple facilista, tocineta, pepinillo y cebolla caramelizada. Incluye papas naturales.' },
      { name: 'Blessed Burger', slug: 'blessed-burger', price_primary: 10.00, sku: 'GAR-BUR-14', description: 'Pan de tu preferencia, carne solomo 150Gr, facilista, tocineta, dip de champiñones, cebolla caramelizada, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Diosa Burger', slug: 'diosa-burger', price_primary: 13.00, sku: 'GAR-BUR-15', description: 'Pan de tu preferencia, carne solomo 150Gr, queso mozzarella, chuleta ahumada, tocineta y salsa de la casa. Incluye papas naturales.' },
      { name: 'Classic Mixta', slug: 'classic-mixta', price_primary: 13.00, sku: 'GAR-BUR-16', description: 'Pan de tu preferencia, carne solomo 150Gr y pollo crispy, facilista, tocineta, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Smash Bacon', slug: 'smash-bacon', price_primary: 14.00, sku: 'GAR-BUR-17', description: 'Pan de tu preferencia, doble carne solomo 160 Gr, doble facilista, mermelada de tocineta y pepinillos. Incluye papas naturales.' },
      { name: 'Sweet Onion', slug: 'sweet-onion', price_primary: 10.00, sku: 'GAR-BUR-18', description: 'Pan de tu preferencia, carne solomo 150Gr, facilista, tocineta, aros de cebolla con BBQ, salsa de la casa y vegetales. Incluye papas naturales.' },
      { name: 'Smash Onion (Ganadora Burger Máster 2025)', slug: 'smash-onion-burger-master-2025', price_primary: 11.00, sku: 'GAR-BUR-19', description: 'Burger Ganadora del Burger Máster 2025 Categoría Standar. Pan de tu preferencia, carne smash 160Gr, doble facilista, cebolla crispy bañada en BBQ de parchita y pepinillos. Incluye papas naturales.' },
    ];
    for (const bg of burgers) {
      const prod = await insertProduct({ ...bg, category_slug: 'burgers' });
      // Vincular obligatoriamente al selector de Pan (Brioche o Papa sin costo)
      await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgPanId]);
      // Vincular a Adicionales y Toppings (Agranda papas, etc.)
      await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgExtrasId]);
    }

    // G. PEPITOS (5 Pepitos - Vinculados a Selector de Proteína Pollo/Lomito/Mixto)
    const pepitos = [
      { name: 'Pepito Tradicional', slug: 'pepito-tradicional', price_primary: 12.00, sku: 'GAR-PEP-01', description: 'Pan suave, 300 Gr. de proteína a tu elección (pollo, lomito o mixto), salsa de la casa, queso pecorino, tocineta y papas fritas incluidas.' },
      { name: 'Pepito Gratinado', slug: 'pepito-gratinado', price_primary: 14.00, sku: 'GAR-PEP-02', description: 'Pan suave, 300 Gr. de proteína a tu elección (pollo, lomito o mixto), salsa de la casa, tocineta, gratinado en 3 quesos, maíz y papas fritas incluidas.' },
      { name: 'Pepito Onion', slug: 'pepito-onion', price_primary: 15.00, sku: 'GAR-PEP-03', description: 'Pan suave, 300 Gr. de proteína a tu elección (pollo, lomito o mixto), salsa de la casa, tocineta, gratinado en 3 quesos, maíz, coronado con aros de cebolla y papas fritas.' },
      { name: 'Pepito Blessed', slug: 'pepito-blessed', price_primary: 15.00, sku: 'GAR-PEP-04', description: 'Pan suave, 300 Gr. de proteína a tu elección (pollo, lomito o mixto), salsa de la casa, tocineta, gratinado en 3 quesos, maíz, cebolla caramelizada, champiñones y papas fritas.' },
      { name: 'Pepito Pollo Crispy', slug: 'pepito-pollo-crispy', price_primary: 16.00, sku: 'GAR-PEP-05', description: 'Pan suave, 300 Gr. de pollo crispy, salsa de la casa, gratinado con facilista, coronado con tocineta troceada y papas fritas incluidas.' },
    ];
    for (const pep of pepitos) {
      const prod = await insertProduct({ ...pep, category_slug: 'pepitos' });
      // Si no es el de solo pollo crispy, vinculamos al selector de proteína sin costo
      if (pep.slug !== 'pepito-pollo-crispy') {
        await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgProtPepitoId]);
      }
      await client.query('INSERT INTO fs_product_groups (product_id, group_id) VALUES ($1, $2)', [prod.id, mgExtrasId]);
    }

    // H. BEBIDAS & BATIDOS (17 Productos)
    const bebidas = [
      { name: 'Batido de Fresa', slug: 'batido-fresa', price_primary: 3.00, sku: 'GAR-BEB-01', description: 'Batido natural frappé de fresas frescas.' },
      { name: 'Batido de Parchita', slug: 'batido-parchita', price_primary: 3.00, sku: 'GAR-BEB-02', description: 'Batido natural frappé de fruta de parchita.' },
      { name: 'Limonada Natural', slug: 'limonada-natural', price_primary: 3.00, sku: 'GAR-BEB-03', description: 'Limonada frappé recién exprimida.' },
      { name: 'Limonada Cerezada', slug: 'limonada-cerezada', price_primary: 4.00, sku: 'GAR-BEB-04', description: 'Limonada frappé con infusión de cerezas.' },
      { name: 'Limonada de Coco', slug: 'limonada-de-coco', price_primary: 4.00, sku: 'GAR-BEB-05', description: 'Cremosa y refrescante limonada con crema de coco.' },
      { name: 'Limonada con Hierbabuena', slug: 'limonada-con-hierbabuena', price_primary: 4.00, sku: 'GAR-BEB-06', description: 'Limonada frappé con hojas frescas de hierbabuena maceradas.' },
      { name: 'Parchita con Hierbabuena', slug: 'parchita-con-hierbabuena', price_primary: 4.00, sku: 'GAR-BEB-07', description: 'Zumo frappé de parchita combinado con hierbabuena fresca.' },
      { name: 'Agua Mineral', slug: 'agua-mineral', price_primary: 1.50, sku: 'GAR-BEB-08', description: 'Botella de agua mineral purificada 500ml.' },
      { name: 'Agua Saborizada', slug: 'agua-saborizada', price_primary: 2.00, sku: 'GAR-BEB-09', description: 'Agua purificada con esencias frutales naturales.' },
      { name: 'Soda / Agua Gasificada', slug: 'soda-gasificada', price_primary: 2.00, sku: 'GAR-BEB-10', description: 'Botella de soda con gas.' },
      { name: 'Refresco 350 ml', slug: 'refresco-350-ml', price_primary: 1.00, sku: 'GAR-BEB-11', description: 'Refresco individual 350ml.' },
      { name: 'Refresco de Lata', slug: 'refresco-de-lata', price_primary: 2.00, sku: 'GAR-BEB-12', description: 'Refresco en lata fría 355ml.' },
      { name: 'Refresco 1 Litro', slug: 'refresco-1-litro', price_primary: 2.00, sku: 'GAR-BEB-13', description: 'Refresco familiar de 1 Litro.' },
      { name: 'Refresco 1.5 Litros', slug: 'refresco-1-5-litros', price_primary: 3.00, sku: 'GAR-BEB-14', description: 'Refresco familiar de 1.5 Litros.' },
      { name: 'Nestea', slug: 'nestea', price_primary: 2.00, sku: 'GAR-BEB-15', description: 'Vaso frío de té helado Nestea limón o durazno.' },
      { name: 'Lipton Ice Tea', slug: 'lipton-ice-tea', price_primary: 3.00, sku: 'GAR-BEB-16', description: 'Té frío Lipton en botella.' },
      { name: 'Gatorade', slug: 'gatorade', price_primary: 3.00, sku: 'GAR-BEB-17', description: 'Bebida isotónica hidratante.' },
    ];
    for (const b of bebidas) {
      await insertProduct({ ...b, category_slug: 'bebidas-y-batidos' });
    }

    // I. PROMOCIONES / COMBOS (6 Combos)
    const promos = [
      { name: 'Promo Piqueo', slug: 'promo-piqueo', price_primary: 12.00, sku: 'GAR-PRO-01', description: '1/2 ración de tequeños, cotufas de pollo, aros de cebolla, papas cheddar y 1 refresco de 1 litro.' },
      { name: 'Promo Garage', slug: 'promo-garage', price_primary: 16.00, sku: 'GAR-PRO-02', description: '2 Hamburguesas, cotufas de pollo, papas fritas y 1 refresco de 1 litro.' },
      { name: 'Promo Chilling', slug: 'promo-chilling', price_primary: 17.00, sku: 'GAR-PRO-03', description: '1/2 ración de tequeños, 2 Hamburguesas, papas fritas y 1 refresco de 1 litro.' },
      { name: 'Promo Favorita', slug: 'promo-favorita', price_primary: 25.00, sku: 'GAR-PRO-04', description: '4 Hamburguesas, cotufas de pollo, papas fritas y 1 refresco de 1 litro.' },
      { name: 'Promo Classic', slug: 'promo-classic', price_primary: 9.00, sku: 'GAR-PRO-05', description: '1 Hamburguesa, aros de cebolla, papas cheddar y 1 vaso de Nestea frío.' },
      { name: 'Promo Pepito', slug: 'promo-pepito', price_primary: 9.00, sku: 'GAR-PRO-06', description: '1/2 Pepito tradicional, papas fritas y 1 vaso de Nestea frío.' },
    ];
    for (const pr of promos) {
      await insertProduct({ ...pr, category_slug: 'promociones' });
    }

    await client.query('COMMIT');
    console.log('✅ SEED COMPLETED SUCCESSFULLY FOR garagechilling53!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ SEED ERROR:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
