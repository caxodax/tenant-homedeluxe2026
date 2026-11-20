# 🏛️ MarketOS v4.0.0-PRODUCCIÓN

Plataforma SaaS Multi-Tenant de Comercio Universal (Minimarkets, Retail, Restaurantes, Servicios).

---

## 🧭 Pilares Arquitectónicos No Negociables

1. **Blast Radius = 0**: Cada comercio opera en su propio esquema PostgreSQL aislado (`tenant_<slug>`). Una falla o transacción en un comercio jamás afecta a otro.
2. **Core Agnóstico**: El núcleo del sistema no asume rubros, localidades geográficas ni monedas locales.
3. **USD como Moneda Base Canónica**: Todos los precios, cálculos de órdenes y métricas financieras maestras residen en USD ($). Los plugins de localización (ej. `local_venezuela`) se acoplan modularmente sin contaminar el Core.
4. **Cálculos Transaccionales en RPC Atómicos**: La creación de órdenes, control de stock y cierre de caja residen en procedimientos PL/pgSQL (`platform.rpc_core_*`) con bloqueos `FOR UPDATE`.
5. **Offline-First Resilience**: La terminal de Punto de Venta (POS) despacha con persistencia local en Dexie.js (IndexedDB) y reconcilia en lotes atómicos al recuperar conectividad.

---

## 🚀 Estado de Ejecución de Fases

### ✅ FASE 1: Fundación Supabase & Esquema Platform
- Base de datos PostgreSQL en Supabase (`us-east-1`).
- Esquema de gobernanza global `platform` (tenants, suscripciones, módulos, plugins).
- RPCs transaccionales del Core (`03_TRANSACTIONAL_RPCS.sql`).

### ✅ FASE 2: Plantilla de Inquilino & Tenant Piloto
- Esquema aislado `tenant_shopmarket` para **Shop Market C.A.**
- Tablas maestras: `products`, `categories`, `inventory`, `orders`, `order_items`, `payments`, `cash_registers`, `settings`.

### ✅ FASE 3: Next.js 16 App Router & Enrutamiento Multi-Tenant
- Next.js 16 con Turbopack y Tailwind CSS v4.
- Edge Proxy (`middleware.ts`) que resuelve subdominios y rutas `/t/[slug]`.
- Conexión dinámica multi-esquema con `withTenantDb(schema, userId, callback)`.

### ✅ FASE 4 & 5: POS Offline-First & Sincronización en Contingencia
- Terminal POS en mostrador (`/t/[slug]/pos`).
- Heartbeat activo de terminal cada 30 segundos.
- Cola offline en Dexie.js con numeración correlativa (`OFF-POS01-...`).
- Reconciliación atómica en lote vía `rpc_core_reconcile_offline_sales`.

### ✅ FASE 6: Panel Super Admin Global
- Dashboard de gobernanza SaaS (`/platform`).
- Métricas consolidadas de inquilinos, suscripciones y auditoría de eventos.

### ✅ FASE 6.5: Gestión Operativa de Tenants (`/platform/tenants`)
- **RPC `platform.rpc_update_tenant`**: Mutación segura de estado (`active`, `trial`, `suspended`, `inactive`), cambio de plan de suscripción y régimen de contingencia con auditoría atómica en `platform.global_audit_logs`.
- **RPC `platform.rpc_get_tenant_health`**: Telemetría integral de salud multi-inquilino (heartbeat del POS físico, consumo de cuotas, órdenes en 30 días, staff activo, productos).
- **Tabla Avanzada con TanStack Table v8**: Listado reactivo de comercios en `/platform/tenants` con búsqueda en vivo, filtros por estado operativo, paginación y acciones rápidas.
- **Detalle y Telemetría del Comercio**: Vista profunda en `/platform/tenants/[id]` con tarjetas de métricas, diagnóstico de sincronización POS e indicadores de cuotas.
- **Formulario de Edición con Zod + Hook Form**: Edición de inquilino en `/platform/tenants/[id]/edit` con validación estricta y toast feedback vía Sonner.
- **API Routes Dedicadas**: GET/PATCH `/api/platform/tenants`, GET/PATCH `/api/platform/tenants/[id]` y GET `/api/platform/tenants/[id]/health`.

### ✅ FASE 7: Panel Administrativo del Comercio (`/t/[slug]/admin`)
- Sidebar izquierdo responsivo con navegación reactiva (`usePathname`).
- Dashboard operativo con KPIs en tiempo real (Ventas Hoy, Pedidos Pendientes, Stock Bajo, Productos Activos).
- Gestión de Pedidos (`/admin/orders`) e Inventario de Productos (`/admin/inventory`).
- Configuración Operativa (`/admin/settings`): nombre comercial, WhatsApp de despacho, dirección de Pick-up y régimen de contingencia.
- Selector de tema intuitivo (Modo Claro / Modo Oscuro) con alto contraste WCAG.

### ✅ FASE 8: Vitrina Digital Pública (`/t/[slug]`)
- **Catálogo Online**: Carga optimizada de productos organizados por chips de categorías y buscador instantáneo.
- **Modal de Detalle de Producto**: Al tocar cualquier producto, se despliega modal interactivo con imagen ampliada, SKU, código de barras, descripción detallada, disponibilidad real y selector de cantidad.
- **Storage Cloudflare R2**: Integración nativa vía `@aws-sdk/client-s3` con el bucket `marketos-media`. Proxy de streaming en `/api/media/[...path]` con soporte WebP/JPEG/PNG, cabeceras de caché inmutable (`max-age=31536000`), carga directa desde R2 y fallback local en `public/media`.
- **Carrito de Compras Persistente**: Zustand con persistencia en localStorage y protección contra hidratación SSR (`useHasMounted`).
- **Checkout Pick-up**: Formulario de retiro en mostrador con validación Zod y despacho transaccional atómico vía `platform.rpc_core_create_order`.
- **Página de Éxito de Orden**: Confirmación inmediata con resumen de orden y botón directo de notificación vía WhatsApp hacia el comercio.
- **Banner de Contingencia Inteligente**: Notificación visual automática en caso de pérdida de heartbeat del POS o activación manual de contingencia.
- **Diseño Accesible**: Modo Claro y Modo Oscuro con contraste WCAG 2.1 AA en textos, tarjetas, banners y modales.

---

### ✅ FASE 8.5: Configuración de Marca (Settings) & CRUD de Inventario con Cloudflare R2
- **Identidad de Marca & Branding**:
  - Subida directa de Logotipo Oficial del comercio a Cloudflare R2 (`/api/media/upload`, folder `branding`).
  - Selector interactivo de Paleta de Colores de Marca: 7 presets sectoriales (Lima Retail, Esmeralda Fresh, Azul Market, Violeta Gourmet, Ámbar Deli, Rojo Express, Onyx Minimal) y selector hexadecimal nativo.
  - Sincronización visual del logotipo y color de marca en la vitrina digital pública, el panel administrativo y el punto de venta.
- **CRUD Completo de Productos en Inventario (`/t/[slug]/admin/inventory`)**:
  - Creación de nuevos productos con modal reactivo ("+ Nuevo Producto").
  - Edición completa de datos maestros: Nombre, SKU, Código de Barras (Barcode), Categoría, Precio USD, Stock Real, Alerta de Stock Mínimo y Descripción.
  - Subida y almacenamiento de fotos de productos en Cloudflare R2 con previsualización en vivo.
  - Desactivación segura (soft-delete canónico) de productos preservando integridad histórica de órdenes (Blast Radius = 0).
  - Server Actions dedicadas: `createProduct`, `updateProduct`, `deleteProduct`.
- **Experiencia Móvil de Primera Clase (Mobile-First)**:
  - Drawer / Hamburguesa en Super Admin (`PlatformShell`) para pantallas táctiles.
  - Drawer / Hamburguesa en Panel de Administración de Tienda (`AdminMobileNav`) con acceso completo a todas las secciones.
  - Selector de Categorías en formato Combobox / Select en la Vitrina Digital para dispositivos móviles (`sm:hidden`).
  - Vista de Tarjetas para Comercios en `/platform/tenants` (`sm:hidden`) y vista de tabla TanStack en escritorio (`hidden sm:block`).

---

### ✅ FASE 9: CRUDs Operativos del Core y Catálogo Avanzado
- **9.1 — Presigned URLs para Cloudflare R2 (`/api/media/presign-upload`)**:
  - Generación de presigned PUT URLs seguras utilizando `@aws-sdk/s3-request-presigner` y `@aws-sdk/client-s3`.
  - Soporte de subida directa desde el navegador (bypass del VPS) para paths: `products`, `categories`, `logos`, `banners`, `proofs`, `branding`.
  - Autenticación unificada de tenancy (`requireTenantStaffApi`): reconoce sesiones de Staff, Propietarios, Supabase Auth y tokens de Impersonación de Super Admin sin rechazos 401 en producción.
- **9.2 — Componente `ImageUploader` con Drag & Drop (`components/admin/image-uploader.tsx`)**:
  - Implementado con `react-dropzone` y feedback visual en vivo (preview de imagen, loading spinner, eliminación con un clic).
  - Carga directa vía Presigned URL con fallback inteligente al endpoint de streaming `/api/media/upload`.
  - Integración compacta y adaptada directamente en el tab `General & Multimedia` del formulario de producto (sin requerir pestaña separada).
- **9.3 — Tabla Avanzada de Inventario con TanStack Table v8 (`/t/[slug]/admin/inventory`)**:
  - Listado reactivo de productos con ordenamiento dinámico por columnas.
  - Búsqueda en tiempo real por nombre de producto y SKU.
  - Filtro por stock: `Todo el stock`, `Stock Normal`, `Stock Bajo`, `Agotados`.
  - Filtro por estado: `Todos los estados`, `Solo Activos`, `Solo Inactivos` (permite visualizar y reactivar productos desactivados lógicamente).
  - Badges de stock con alerta visual de stock bajo y agotado.
  - Menú de acciones por fila: "Editar Producto" (`/t/[slug]/admin/inventory/[id]`), "Activar/Desactivar" (`PATCH /api/admin/[slug]/products/[id]`), "Eliminar" (soft-delete).
  - Paginación dinámica y botón de acceso rápido "+ Nuevo Producto".
- **9.4 & 9.6 — API Routes de Productos (`/api/admin/[slug]/products` y `[id]`)**:
  - Validación exhaustiva con Zod en todas las operaciones.
  - Creación con `gen_random_uuid()`, auto-slug sanitizado y sincronización automática en la tabla `inventory` del tenant.
  - Actualización atómica de columnas con `withTenantDb` garantizando **Blast Radius = 0**.
  - Eliminación lógica controlada (`is_active = false`), permitiendo la reactivación en el panel administrativo mientras se mantienen ocultos en la vitrina pública.
- **9.5 — Formulario de Producto con Tabs en `/t/[slug]/admin/inventory/[id]` y `/new`**:
  - Formularios basados en React Hook Form + Zod (`productSchema`).
  - Navegación optimizada en 3 Tabs: `General & Multimedia` (incluye datos básicos y subida compacta de foto R2), `Precios & Costos`, `Inventario & Alertas`.
  - Integración nativa con `ImageUploader` para almacenamiento en Cloudflare R2.
- **9.7 & 9.8 — Configuración Avanzada de Comercio (`/t/[slug]/admin/settings` y `/api/admin/[slug]/settings`)**:
  - Navegación con Tabs: `General`, `Marca & Logo`, `Contacto & Contingencia`, `Redes Sociales`.
  - Subida directa de Logotipo y Banner superior con Cloudflare R2.
  - **Identidad Corporativa Unificada de 3 Colores (`TenantThemeInjector` + `PosBrandProvider`)**: Aplica desde SSR los colores `primary_color`, `secondary_color` y `accent_color` (con cálculo automático de contraste YIQ), tipografía legible (`Plus Jakarta Sans` + `JetBrains Mono`) y logotipo oficial (`logo_url`) en **Vitrina Digital, Panel Admin y Terminal POS**.
  - **Reconciliación POS Atómica y Comprobantes Térmicos (`/api/pos/sync` y `/t/[slug]/pos`)**:
    - Normalización automática de `store_id` UUID y `customer_phone` en `/api/pos/sync` con rescate transparente de lotes offline pendientes y deducción inmediata en inventario + recarga en tiempo real de stock al cobrar.
    - Input numérico editable y validado (`PosQuantityInput`) en el Ticket Actual del POS.
    - Impresión de comprobantes (`@media print`) con ajuste multilínea (`break-words`) para mostrar nombres de productos largos completos sin truncar.
  - **Moneda Secundaria Gated por Plugin y Desacoplamiento de Capas**: La configuración general en `/api/admin/[slug]/settings` opera de forma 100% agnóstica sin asumir tablas externas. Solo sincroniza con `exchange_rate_history` o habilita métodos locales (`CASH_EUR`) si el plugin `local_venezuela` está verificado como activo en `platform.tenant_plugins`, garantizando que cualquier comercio nuevo o internacional guarde su branding y configuración con cero fallos 500.
  - Campos dedicados de redes sociales persistidos en `settings.value.social_media` (Instagram, Facebook, TikTok, Twitter/X, YouTube).
  - Sincronización bidireccional automática con la tabla global `platform.tenants`.
- **9.9 — API Route de Categorías (`/api/admin/[slug]/categories`)**:
  - Endpoint GET para listar categorías activas ordenadas alfabéticamente para selectores dinámicos.
- **9.10 — Verificación End-to-End**:
  - Suite de pruebas de API y flujo completada con éxito al 100% (GET, POST, PATCH, DELETE, Presign R2 y Settings).
- **Core de Pagos Administrables, Comprobantes Anti-Fraude y Auditoría de Pedidos (Agnóstico USD)**:
  - **Métodos de Pago por Comercio (`/t/[slug]/admin/settings` tab `Métodos de Pago` & `/api/admin/[slug]/payment-methods`)**: CRUD completo de cuentas y canales de cobro en USD `$` (titular, número de cuenta/correo/teléfono, identificador fiscal opcional, instrucciones, habilitación por canal Vitrina/POS y exigencia de referencia o captura).
  - **Checkout con Datos del Comercio + Comprobante Digital (`/t/[slug]/checkout` & `/t/[slug]/order-success/[orderId]`)**: Muestra los datos configurados con botón de copiar, permite ingresar número de referencia/banco origen y subir captura a R2 (`folder: 'proofs'`) calculando hash **SHA-256** validado en PostgreSQL mediante `platform.rpc_check_payment_fraud`.
  - **Detalle, Aprobación/Rechazo y Auditoría de Pedidos (`/t/[slug]/admin/orders` y `/t/[slug]/admin/orders/[id]`)**: Filtros en vivo, aprobación o rechazo de pagos con trazabilidad completa en `audit_logs`, adjuntado manual de comprobantes e historial de movimientos de inventario (`inventory_movements`).
  - **PWA Instalable Multi-Tenant para Móviles**: Íconos PNG reales (`/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`), manifiesto dinámico por comercio (`/t/[slug]/manifest.webmanifest` y `?entry=pos` para abrir directo en Caja), Service Worker network-first (`/sw.js`), soporte de orientación móvil (`orientation: 'any'`) y banner/CTA de instalación (`PwaRegister`).
- **Blindaje Final del Core Multi-Tenant (Opción A)**:
  - **Sincronización Canónica SQL (`01_PLATFORM_SCHEMA.sql` & `02_TENANT_CORE_TEMPLATE.sql`)**: Plantilla de esquema unificada (`staff_profiles.auth_user_id` y `password_hash`, `platform.tenants.storefront_enabled`, `settings` neutros en USD `$` `#18181B`) y RPCs actualizadas en PostgreSQL (`rpc_apply_core_template`, `rpc_provision_tenant`).
  - **Aprovisionamiento Automático de Comercios (`/platform/tenants/new` & `POST /api/platform/tenants`)**: Creación de nuevos esquemas aislados desde Super Admin con soporte nativo para activar o desactivar la vitrina pública (`storefront_enabled`, habilitando operación **Solo ERP / POS**).
  - **Autenticación Real, Equipo y RBAC (`/t/[slug]/login`, `/login`, `/t/[slug]/admin/staff`)**: Sesiones compatibles con Supabase Auth y cookie firmada HMAC-SHA256 (`scrypt` password hashing), gestión de personal y control de permisos por rol (`OWNER`, `MANAGER`, `CASHIER`, `INVENTORY`, `DELIVERY`) en páginas y APIs.
  - **Apertura y Cierre de Caja + Catálogo Offline POS (`/api/tenant/[slug]/pos/shift`)**: Turnos y arqueo ciego de caja mediante `platform.rpc_core_close_pos_shift`, historial en `/t/[slug]/admin/pos`, y caché local del catálogo en Dexie (`catalog_cache`) para recargas offline del POS.
  - **Reportes Financieros USD Corregidos (`/t/[slug]/admin/reports`)**: Queries alineadas al esquema real (`delivery_type`, `total_price_usd`), métricas globales, desglose por canal/método de pago, margen bruto estimado y tendencia de 14 días.
- **FASE 11 — Pedidos en Tiempo Real & Health Check (`/api/health`)**:
  - **Canal Realtime por Tenant (`lib/realtime/tenant-orders-channel.ts`)**: Broadcast WebSocket/HTTP aislado por comercio (`tenant:<slug>:orders`) sin exponer tablas privadas vía PostgREST `anon`, preservando **Blast Radius = 0** y RBAC (`requireTenantStaffApi`).
  - **Emisión desde Productores de Órdenes**: Notificación instantánea desde `createWebOrder` (vitrina/comprobantes), `PATCH /api/admin/[slug]/orders/[id]` (aprobaciones/estados) y `POST /api/pos/sync` (ventas reconciliadas del POS).
  - **Componente `NewOrderNotification` (`components/admin/new-order-notification.tsx`)**: Badge en vivo en header, sidebar escritorio y menú móvil con botón de silencio (`localStorage`), toast Sonner con botón directo `"Ver Pedido"`, alerta sonora vía Web Audio API (`AudioContext`) y actualización automática sin recarga de `/t/[slug]/admin/orders`.
  - **Publicación SQL & Monitoreo**: Registro idempotente de `%I.orders` en `supabase_realtime` dentro de `02_TENANT_CORE_TEMPLATE.sql` y endpoint **`GET /api/health`** (`SELECT 1` + latencia en ms).
- **FASE 11.5 — Saneado de Hardcodes, Portabilidad Multi-Tenant & Build Limpio**:
  - **Configuración Agnóstica Centralizada (`lib/tenant/defaults.ts`, `lib/tenant/env-validator.ts`, `instrumentation.ts`)**: Erradicación de nombres, teléfonos y colores quemados (`Shop Market`, `+58 412...`, `#84cc16`, `'VES'`) hacia `TENANT_DEFAULTS` configurables por entorno y `.env.example` saneado.
  - **Directorio Raíz & Manifiesto Configurable (`/`, `app/manifest.ts`)**: Si `NEXT_PUBLIC_DEFAULT_TENANT_SLUG` está vacío, `/` presenta el portal multi-tenant con los comercios activos y acceso al Super Admin; si está configurado, redirige automáticamente al comercio por defecto.
  - **RBAC SSR**: Layouts de guardia en `/admin/inventory`, `/admin/settings` y `/admin/orders` con botón de cierre de sesión.
  - **Desacoplamiento `/platform` (`marketos-template` puro)**: Eliminadas de `marketos-app/` las rutas `app/platform`, `app/api/platform` y `platform-guard.ts` (y extraídas las credenciales de despliegue del Control Plane fuera de `marketos-app/.env.local`), dejando únicamente el núcleo operativo por comercio listo para congelar el template.
### ✅ FASE 12.8: Régimen Tributario Core & Localización Desacoplada
- **Modo No Fiscal vs Modo Fiscal**: Selector visual en `/admin/settings` para alternar entre venta plana (sin impuestos, `tax_enabled = false`) y venta fiscal con cálculo de IVA paramétrico (`tax_rate`) y modalidad PVP Neto (`prices_include_tax`).
- **Exención Tributaria por Producto (`is_tax_exempt`)**: Soporte en catálogo para ítems exentos (canasta básica) con desglose automático de Base Gravada y Base Exenta.
- **Multimoneda Base Canónica**: Selector de fijación de precios en USD ($) o EUR (€) con ajuste dinámico de simbología en mostrador, vitrina y tickets, además del método de cobro `CASH_EUR`.
- **Desacoplamiento Estricto Core vs Plugin**: El recargo de IGTF 3% del plugin `local_venezuela` se condiciona automáticamente: solo se aplica si el comercio activa el Modo Fiscal. En Modo No Fiscal, el plugin opera sin recargos.

### ✅ FASE 12.9: Estatus Terminal POS (DELIVERED), Reimpresión Térmica y Bimoneda en Admin
- **Estatus Terminal POS (`DELIVERED`)**: Las ventas de mostrador nacen en estado `DELIVERED` y pago `VERIFIED` de forma inmediata vía `rpc_core_create_order`, liberando la cola de pedidos pendientes de despacho.
- **Reimpresión de Ticket Térmico en Admin (`/admin/orders/[id]`)**: Soporte nativo `window.print()` para comprobantes de 58mm/80mm con desglose completo, RIF, cajero y tasa de cambio.
- **Visualización Bimonetaria en Pedidos**: La tabla `/admin/orders` y el detalle `[id]` proyectan el monto en USD y el contravalor en Bolívares (`total_secondary` / BCV).
- **Dashboard Bimonetario con Switcher**: En `/admin`, las métricas de Ventas Hoy y la gráfica de tendencia incorporan soporte y alternador de moneda `[ USD | Bs. ]`.
- **Protección de Pagos**: Bloqueo del botón de rechazo para pagos ya verificados en caja física.

- **Optimización CPU / Caché (Vercel Fluid Ready)**:
  - **Next.js 16 `proxy.ts`**: Migración de `middleware.ts` a `proxy.ts` con exclusión explícita de activos estáticos, `/icons/*`, `/sw.js`, `.webmanifest` y rutas `/t/*` sin reescritura innecesaria.
  - **Singleton R2 & CDN Inmutable (`lib/r2.ts`, `/api/media/[...path]`)**: Reutilización de instancia `S3Client` entre invocaciones cálidas, soporte `304 Not Modified` (`ETag`) y cabeceras `s-maxage=31536000` / `CDN-Cache-Control` para servir imágenes desde el Edge CDN.
  - **Data Cache + ISR Multi-Tenant (`lib/tenant.ts`)**: `React.cache` + `unstable_cache` para shell, configuración y catálogo por comercio (`revalidate = 60` en vitrina, `revalidate = 120` en carrito y directorio `/`, `s-maxage=3600` en manifiesto PWA) con invalidación quirúrgica (`invalidateTenantCache`) en mutaciones de productos, órdenes, settings, POS y heartbeat.
  - **Cero Polling Ocioso**: `ContingencyBanner` inicializado desde SSR sin `setInterval` cada 60s (refresco perezoso al volver a foco tras cooldown de 5 min y respuesta CDN `s-maxage=60`).
  - **Índices SQL Adicionales (`02_TENANT_CORE_TEMPLATE.sql`)**: Índices compuestos/parciales `products_active_name`, `orders_created_desc` y `payments_order_created`.
  - **Esquema SQL y Build Limpio**: `platform.rpc_update_tenant` incorporado en `01_PLATFORM_SCHEMA.sql` con soporte `p_storefront_enabled` y corrección de schemas Zod en formularios (`npx tsc --noEmit` con 0 errores).

### ✅ FASE 10: Auditoría Génesis Inmutable, Ticket POS 80mm & Experiencia Bimonetaria Universal
- **10.1 — Auditoría Génesis Inmutable (`FIX-AUDIT-GENESIS` & Migración 008)**:
  - `platform.rpc_core_create_order` registra obligatoriamente el evento inicial `ORDER_CREATED` en `%I.audit_logs` con trazabilidad completa de actor (`POS_CASHIER` o `CUSTOMER`), canal, estatus y correlativo.
  - Backfill retroactivo que garantiza que todas las órdenes históricas sin eventos cuenten con su registro génesis inmutable.
- **10.2 — Modal de Ticket Térmico POS (80mm) con Impresión Aislada y Descarga en PDF**:
  - Modal interactivo de alta fidelidad que reconstruye el comprobante oficial de venta con tipografía monoespaciada tabular, datos fiscales (RIF, razón social, sucursal, cajero), ítems bimonetarios y huella criptográfica SHA-256 anti-fraude.
  - Impresión térmica directa y "Guardar como PDF" nítido mediante contenedor aislado `@media print` (`@page { size: 80mm auto; margin: 3mm; }`) sin artefactos web ni márgenes parásitos.
- **10.3 — Desglose Bimonetario por Renglón en Detalle de Orden (`/admin/orders/[id]`)**:
  - Cada ítem del pedido muestra su precio unitario y subtotal tanto en USD como en Bolívares (`$1.85 USD · Bs. 1.673,23`), manteniendo consistencia contable exacta con la tasa aplicada.
- **10.4 — Recibo de Cliente en Vitrina (`/order-success/[orderId]`) con Modal Anti-Scroll**:
  - Muestra el monto total en ambas divisas con la tasa BCV informada.
  - Botón interactivo "Ver Detalle del Pedido" que abre un modal con la lista de productos y subtotales bimonetarios, erradicando el scroll infinito en dispositivos móviles.
- **10.5 — Homogeneidad Bimonetaria en Pedidos Recientes (`/admin`)**:
  - Proyección fallback de contravalor en Bolívares usando la tasa activa del comercio para órdenes históricas previas a la fijación de tasa.
- **10.6 — Reportes Financieros Bimonetarios & Normalización Multidivisa (`/admin/reports`)**:
  - Corrección de la agregación de ingresos por método de pago: pagos en `VES` son normalizados a `USD` mediante su `exchange_rate` registrado, eliminando distorsiones en métodos locales (Pago Móvil / Transferencia).
  - Selector segmentado bimonetario `[ 💵 USD ($) | 🇻🇪 Bs. (BCV) ]` que permite al comerciante visualizar todos los KPIs, gráficas y desgloses en cualquiera de las dos monedas con un solo clic.

### ✅ FASE 4: Plugin de Localización Venezuela (`local_venezuela`) & Automatización en Base de Datos
- **Automatización Nativa en BD (`pg_cron`)**: Sincronización diaria a las 7:00 AM VET (11:00 UTC) ejecutada directamente por PostgreSQL (`SELECT public.trigger_bcv_rate_sync();`) vía `pg_net`.
- **Cero Consumo de CPU en Vercel**: Se erradicó el uso de Vercel Cron. El frontend opera de forma ligera y desacoplada, leyendo la tasa inyectada directamente de la base de datos sin latencias ni bloqueos por caídas de APIs externas.
- **Moneda Primaria Agnóstica (USD/EUR)**: Soporte completo para fijar el catálogo en Dólares ($) o Euros (€), con migración SQL `012` (`price_primary`, `total_primary`).
- **Panel Administrativo de Tasas (`/admin/rates`)**: 4 Hero Cards (Dólar BCV, Euro BCV, Promedio Ponderado, USDT P2P), historial inmutable de tasas, búsqueda por fecha/fuente y contingencia manual.
- **Régimen de Tasa en Configuración (`/admin/settings` - Tab Moneda & BCV)**: Selección entre 4 regímenes (BCV Directo, Promedio Ponderado, Tasa Cruzada EUR, Especial Personalizada) con simulador interactivo de precios en tiempo real.

### ✅ FASE 4.2: Vitrina Digital V4 (Paginación Híbrida & Experiencia Móvil Impeccable)
- **Paginación Híbrida y Óptima por BD**: Endpoint `/api/tenant/[slug]/storefront/products` con queries `LIMIT $1 OFFSET $2` sobre índices compuestos (`migrations/014_storefront_pagination_and_indexes.sql`), complementado con paginación reactiva de 12, 24 y 48 productos por página.
- **Barra Sticky Superior**: Buscador de productos y selector de categorías fijados (`sticky top-[70px]`) al hacer scroll con fondo translúcido `backdrop-blur-md`.
- **Selector Modal de Categorías (Bottom-Sheet)**: Hoja interactiva con radio buttons, opción "Solo Mis Favoritos", conteo en vivo de productos y botones de acción rápida.
- **Sistema de Favoritos**: Persistencia en `localStorage` con botón de corazón en tarjeta de producto (con feedback háptico) y badge numérico en el header.
- **Tarjeta de Producto Limpia**: Imagen despejada sin etiquetas parásitas, categoría reubicada junto al SKU y precio, tratamiento atenuado `Agotado` con botón deshabilitado cuando el stock llega a cero, y eliminación del texto innecesario "Disponible".
- **Barra Flotante Inferior Móvil**: Barra fija al final de la pantalla que exhibe el conteo de ítems, el subtotal bimonetario (`USD` / `Bs.`) y acceso directo `Ver Carrito →`.
- **Alineación Geométrica de Cesta**: Separación y anillo de contraste (`ring-2 ring-white`) para el badge numérico del carrito en el Header, erradicando cualquier solapamiento con el icono.

### ✅ FASE 4.3: Terminal POS Móvil Táctil & Filtrado Rápido de Categorías
- **Catálogo POS a 2 Columnas Móvil (`grid-cols-2`)**: Cuadrícula táctil simétrica adaptada al estándar de la Vitrina Digital, con tarjetas compactas cuadradas, fotos 1:1 y estados activos hápticos (`active:scale-[0.98]`).
- **Precios Bimonetarios en Vivo**: Moneda primaria en tipografía mono destacada y moneda secundaria calculada en tiempo real según la tasa oficial activa del día (BCV).
- **Régimen Fiscal Condicional**: Desglose automático de IVA unitario (`+IVA` o `IVA Inc.`) en USD y Bs. solo cuando el tenant tiene activado `tax_enabled: true`. En modo no fiscal, la interfaz se mantiene 100% limpia sin etiquetas parásitas.
- **Botón Rápido [+] de Mostrador**: Añade 1 unidad al ticket instantáneamente con confirmación háptica/toast sin abrir modales, agilizando el despacho rápido.
- **Modal / Bottom Sheet de Detalle de Producto**: Desliza al tocar cualquier parte de la tarjeta para inspeccionar stock real disponible, desglose fiscal completo y selector táctil ergonómico de cantidad (`[-] [Cantidad] [+]`).
- **Barra Flotante de Ticket en Móvil**: Barra inferior fija cuando hay productos en el ticket con badge de cesta, conteo, total bimonetario consolidado y botón de apertura `Ver Ticket →`.
- **Bottom Sheet de Ticket y Cobro**: Panel deslizable desde la parte inferior para modificar cantidades o eliminar ítems, resumen fiscal y acceso directo al flujo de cobro con métodos de pago registrados.
- **Combobox de Categorías en POS**: Selector desplegable con conteo en vivo de productos por categoría y filtrado instantáneo combinado con búsqueda por nombre, SKU y código de barras.
- **Corrección de Zona Horaria en Histórico de Tasas (`/admin/rates`)**: Implementación del parseador seguro `formatRateDate` que fija mediodía local para evitar el desplazamiento de 1 día provocado por la medianoche UTC en husos horarios negativos (Venezuela UTC-4).
- **Corrección de Consulta de Sedes en POS (`route.ts`)**: Eliminación del filtro `deleted_at` inexistente sobre la tabla `stores`, garantizando respuesta `200 OK` en el catálogo de caja.

### 🚚 FASE 14: Plugin Canónico `delivery_fleet` (Logística & Despacho)
- **Base de Datos Canónica & Blast Radius = 0 (`05_PLUGIN_SCHEMAS.sql`, `015_delivery_fleet_plugin_canonical.sql`)**: 4 tablas segregadas en el esquema del inquilino (`df_zones`, `df_drivers`, `df_dispatch_routes`, `df_audit_logs`) con triggers automáticos de auditoría y timestamp.
- **Moneda Primaria Agnóstica (Agnostic Currency Standard)**: Tarifas de zonas y snapshots de despacho en `rate_primary` y `zone_rate_snapshot_primary`, con columnas generadas almacenadas (`STORED`) `rate_usd` y `zone_rate_snapshot_usd` para 100% de compatibilidad hacia atrás.
- **Resolución Geográfica Haversine Nativa en BD (`rpc_df_resolve_zone`)**: Motor de cálculo matemático en microsegundos (< 2ms) en PostgreSQL que determina la zona activa más cercana y su tarifa sin costos de APIs externas.
- **Transaccionalidad y Ciclo de Vida de Despacho (`rpc_df_create_dispatch`, `rpc_df_assign_driver`, `rpc_df_update_status`)**: Estados de entrega `PENDING → ASSIGNED → EN_ROUTE → ARRIVED → COMPLETED / FAILED`. Al completar la entrega (`COMPLETED`), la orden Core pasa de forma atómica e idempotente a `orders.status = 'DELIVERED'`.
- **Inteligencia Logística (`rpc_df_intel_report`)**: Reporte consolidado con ingresos por flete en moneda primaria (`delivery_revenue_primary`), tiempo promedio de entrega, ranking de zonas y rendimiento por motorizado.
- **Centro de Control Logístico Dedicado (`/admin/delivery`)**: Pestañas unificadas de Tablero Kanban en vivo con sincronización Realtime, Gestor de Zonas con mapa interactivo Leaflet + OpenStreetMap y Directorio de Choferes.
- **Comanda WhatsApp con Vuelto en Efectivo & Enlace GPS**: Plantilla formateada que incluye desglose de productos, cálculo de vuelto (`paga con X, vuelto Y`), pin con geolocalización a Google Maps y visualización bimonetaria.
- **Integración POS Mostrador**: Selector combobox de zonas de delivery activas con sus tarifas precargadas en moneda primaria y autocalculado de `shipping_primary`.

---

### 🍔 FASE 13: Plugin Canónico `food_service` (Gastronomía, Salón, KDS y Variantes)
- **Base de Datos Canónica & Tablas Gastronómicas (`05_PLUGIN_SCHEMAS.sql` vía `platform.fs_ddl_food_service`)**:
  - Salón y Mesas: `fs_zones`, `fs_tables`, `fs_table_tickets`, `fs_bill_splits`, `fs_table_qr_tokens`.
  - Comandas de Cocina & KDS: `fs_kitchen_tickets`, `fs_kitchen_ticket_items`, `fs_daily_86` (agotados diarios).
  - Recetas & Escandallo (BOM): `fs_recipes`, `fs_recipe_items`, `fs_raw_materials`, `fs_consumption_log`.
  - Modificadores y Agrupaciones: `fs_modifier_groups`, `fs_group_modifiers`, `fs_product_groups`.
- **Extensiones Core Seguras (`018_food_service_core_extension.sql`)**:
  - Nuevo tipo de entrega en órdenes: `delivery_type = 'DINE_IN'` (Consumo en Salón).
  - Nuevos roles de personal: `'WAITER'` (Mesero) y `'KITCHEN'` (Cocinero/KDS) en `staff_profiles`.
  - Categorías aisladas: bandera `is_hidden = true` en `categories` para insumos de cocina o modificadores que no deben listarse directamente en vitrina abierta.
- **Motor de Personalización de Platillos (`FoodProductCustomizerModal`)**:
  - **Matriz Multidimensional 2D (Porción x Proteína)**: Resolución dinámica cruzada para Burritos, Bowls y platos fuertes con precios netos directos ($5.99 a $9.99), selección por defecto de porción Grande y visualización de acompañantes incluidos.
  - **Variantes 1D de Selección Directa**: Radio Cards intuitivos para productos con elecciones simples de cobertura o sabor (ej. Nachos con Queso Fundido $3.99 / Chilli $5.99; Churros con Azúcar $4.50 / Canela $4.99 / Dulce de Leche $6.99).
  - **Grupos de Upselling y Modificadores**: Soporte nativo para combos adicionales (`¡Hazlo Combo! +$3.00`), salsas extras, bebidas sugeridas y notas de preparación para cocina (`prep_notes`).

---

### 💼 FASE 15: Plugin Canónico `sales_team` (Equipo de Ventas, Cotizaciones y Comisiones)
- **Esquema Aislado de Ventas (`05_PLUGIN_SCHEMAS.sql` vía `platform.st_ddl_sales_team`)**:
  - Tablas: `sales_reps`, `quotes`, `quote_items`, `quote_status_history`, `sales_commission_ledger`.
- **Matriz de Permisos Modular y Gestión de Staff (`/admin/staff`)**:
  - Asignación dinámica del rol `SALES_REP` sensible a la activación del plugin en el inquilino.
  - Matriz visual de permisos por rol en `staff-manager.tsx` con paginación, modales de creación y edición.
- **Ciclo Completo de Cotizaciones (`/admin/sales/quotes`)**:
  - Estados: `DRAFT → ISSUED → CONVERTED / REJECTED / EXPIRED`.
  - Bloqueo de precio mínimo con ajuste únicamente por descuento controlado.
  - Conversión directa de cotizaciones a órdenes en Terminal POS con trazabilidad completa.

---

---

### ✅ FASE 12: Optimización UI/UX Móvil, Redes Sociales en Core, Modularidad de Plugins y Blindaje de Turnos POS
- **Redes Sociales en Core & Footer Dinámico**:
  - Configuración nativa en pestaña `/admin/settings?tab=social` con persistencia en `settings.value.social_media` (Instagram, Facebook, TikTok, X/Twitter, YouTube, WhatsApp).
  - Exposición en `TenantShellSettings` y renderizado de barra interactiva de iconos sociales en el footer de la vitrina digital en reemplazo de textos técnicos.
- **Modularidad Plena de Plugins (Localización Venezuela)**:
  - Eliminación de etiquetas rígidas de "Core Región"; incorporación de toggle switch interactivo y endpoint `PATCH /api/admin/[slug]/plugins/local-venezuela` respaldado por `platform.rpc_toggle_tenant_plugin`.
  - Capacidad para cualquier comercio de activar/desactivar la extensión a voluntad con Blast Radius = 0.
- **Blindaje e Integridad de Turnos POS**:
  - Exigencia de caja abierta: si no existe un turno abierto (`activeShift.status === 'OPEN'`), la acción de cobro en mostrador queda protegida bajo el botón `🔒 Abrir Caja para Cobrar` requiriendo registrar el fondo inicial antes de facturar.
  - Auditoría de ventas fuera de turno en `/admin/pos` para visibilidad contable instantánea de cualquier transacción no asociada a turnos.
- **Ergonomía Móvil Impeccable en Checkout POS**:
  - Rediseño del modal de cobro bajo patrón Sheet/Dialog con Header fijo, Cuerpo con scroll táctil (`max-h-[92dvh]`, `overflow-y-auto`) y Footer fijo con botones de acción siempre visibles.
  - Limpieza visual: retiro de badges redundantes (`Vitrina Digital`, `Plan INTERNAL_DEMO`, `Retiro inmediato`, indicador flotante de conectividad).


---

## 🛠️ Variables de Entorno (`.env.local`)

```env
# Supabase Public API
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# PostgreSQL Direct / Pooler Connection
DATABASE_URL=postgresql://<user>:<password>@<pooler-host>:6543/postgres

# Cloudflare R2 Media Storage
CLOUDFLARE_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_BUCKET_NAME=marketos-media
R2_PUBLIC_DOMAIN=https://assets.<your-domain>
```

---

## 💻 Comandos de Desarrollo

```bash
# Iniciar servidor de desarrollo (Turbopack)
npm run dev

# Compilar build de producción
npm run build

# Iniciar servidor compilado
npm run start
```
