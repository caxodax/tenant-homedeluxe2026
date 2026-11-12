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
  - Soporte de subida directa desde el navegador (bypass del VPS) para paths: `products`, `categories`, `logos`, `banners`, `proofs`.
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
  - **Moneda Secundaria Gated por Plugin**: La configuración consulta `platform.tenant_plugins` y restringe monedas secundarias (como `VES`) a comercios con plugins de localización activos, preservando el **Core Agnóstico en USD ($)**.
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
- **Optimización CPU / Caché (Vercel Fluid Ready)**:
  - **Next.js 16 `proxy.ts`**: Migración de `middleware.ts` a `proxy.ts` con exclusión explícita de activos estáticos, `/icons/*`, `/sw.js`, `.webmanifest` y rutas `/t/*` sin reescritura innecesaria.
  - **Singleton R2 & CDN Inmutable (`lib/r2.ts`, `/api/media/[...path]`)**: Reutilización de instancia `S3Client` entre invocaciones cálidas, soporte `304 Not Modified` (`ETag`) y cabeceras `s-maxage=31536000` / `CDN-Cache-Control` para servir imágenes desde el Edge CDN.
  - **Data Cache + ISR Multi-Tenant (`lib/tenant.ts`)**: `React.cache` + `unstable_cache` para shell, configuración y catálogo por comercio (`revalidate = 60` en vitrina, `revalidate = 120` en carrito y directorio `/`, `s-maxage=3600` en manifiesto PWA) con invalidación quirúrgica (`invalidateTenantCache`) en mutaciones de productos, órdenes, settings, POS y heartbeat.
  - **Cero Polling Ocioso**: `ContingencyBanner` inicializado desde SSR sin `setInterval` cada 60s (refresco perezoso al volver a foco tras cooldown de 5 min y respuesta CDN `s-maxage=60`).
  - **Índices SQL Adicionales (`02_TENANT_CORE_TEMPLATE.sql`)**: Índices compuestos/parciales `products_active_name`, `orders_created_desc` y `payments_order_created`.
  - **Esquema SQL y Build Limpio**: `platform.rpc_update_tenant` incorporado en `01_PLATFORM_SCHEMA.sql` con soporte `p_storefront_enabled` y corrección de schemas Zod en formularios (`npx tsc --noEmit` con 0 errores).

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
