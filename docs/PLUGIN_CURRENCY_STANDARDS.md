# Estándar Arquitectónico Multimoneda para Plugins de Negocio (MarketOS)

## 1. Principio Fundamental
En toda base de datos multi-inquilino de MarketOS, **queda terminantemente prohibido quemar (hardcodear) nombres de monedas físicas (`_usd`, `_ves`, `_eur`, `_cop`) en columnas de tablas transaccionales o esquemas DDL de plugins.**

Cualquier comercio puede operar con cualquier moneda base como moneda primaria (`USD`, `EUR`, `COP`, etc.) y cualquier moneda local secundaria (`VES`, `PEN`, etc.).

---

## 2. Nomenclatura Canónica Obligatoria

| Propósito | Sufijo Canónico | Tipo SQL | Descripción |
| :--- | :--- | :--- | :--- |
| **Monto Base** | `*_primary` | `NUMERIC(10,2)` / `(12,2)` | Monto expresado en la moneda principal configurada por el comercio (`tenant.settings.primary_currency`). |
| **Monto Local / Secundario** | `*_secondary` | `NUMERIC(14,2)` / `(16,2)` | Monto liquidado o estimado en la moneda secundaria local (`tenant.settings.secondary_currency`). |
| **Monto Original Transado** | `*_original` | `NUMERIC(14,2)` | Monto en la divisa real recibida por el cajero/banco cuando el cliente paga en una moneda distinta. |
| **Divisa de Transacción** | `currency` | `TEXT` | Código ISO de la divisa utilizada en el comprobante (ej. `USD`, `VES`, `EUR`). |
| **Tasa Snapshot** | `exchange_rate_applied` | `NUMERIC(12,4)` | Tasa de cambio oficial o acordada en el instante exacto de la operación. |

---

## 3. Estado en Plugins Implementados

### 3.1 Fase 15 (`sales_team` / Fuerza de Ventas & Cotizaciones)
- **`sales_quotes`**: `items_subtotal_primary`, `additional_services_primary`, `subtotal_primary`, `discount_primary`, `tax_primary`, `total_primary`, `total_secondary`, `exchange_rate_applied`.
- **`sales_quote_items`**: `unit_price_primary`, `total_price_primary`.
- **`sales_commissions`**: `sale_total_primary`, `commission_amount_primary`.
- **`sales_rep_profiles`**: `monthly_target_primary`.

### 3.2 Fase 16 (`credit_cxc` / Cuentas por Cobrar & Cartera)
- **`cxc_customer_profiles`**: `credit_limit_primary` (con alias `credit_limit_usd` sincronizado vía trigger).
- **`cxc_accounts`**: `original_amount_primary`, `down_payment_primary`, `financed_amount_primary`, `balance_primary`, `total_paid_primary` (con alias `*_usd` sincronizados automáticamente vía `platform.fn_sync_cxc_accounts_multicurrency()`).
- **`cxc_financing_tranches`**: `expected_amount_primary`, `settled_amount_primary`, `fee_amount_primary`.
- **`cxc_payments`**: `amount_primary`, `amount_original`, `currency`, `balance_before_primary`, `balance_after_primary`.

### 3.3 Fase 17 (`payables_cxp` / Cuentas por Pagar a Proveedores)
- **`cxp_bills`**: `total_primary`, `balance_primary`.
- **`cxp_goods_receipt_items`**: `unit_cost_primary`, `total_cost_primary`.
- **`cxp_advances`**: `amount_primary`, `balance_primary`.
- **`cxp_payments`**: `amount_primary`.
- **`cxp_compensations`**: `amount_primary`.

---

## 4. Triggers de Retrocompatibilidad (Blast Radius = 0)
Para proteger integraciones previas o reportes antiguos que consultaban `*_usd`, la migración `025_credit_cxc_multicurrency_standard.sql` incorporó triggers bidireccionales en el esquema `platform`. 

Si un cliente o consulta envía datos a `*_primary`, el trigger rellena automáticamente `*_usd`. Si una consulta externa lee `*_usd`, recibe el valor exacto de `*_primary`.
