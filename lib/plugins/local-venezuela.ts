/**
 * MarketOS — Plugin Local Venezuela (`local_venezuela`)
 * Módulo de dominio bimonetario, fiscal y bancario nacional (VET).
 * Principio Ponytail: Cero dependencias externas pesadas, funciones puras y tipado estricto.
 */

// ============================================================================
// 1. BANCOS NACIONALES (SUDEBAN)
// ============================================================================

export interface VenezuelanBank {
  code: string;
  name: string;
  shortName: string;
}

export const VENEZUELAN_BANKS: VenezuelanBank[] = [
  { code: '0102', name: 'Banco de Venezuela, S.A. Banco Universal', shortName: 'Banco de Venezuela' },
  { code: '0104', name: 'Venezolano de Crédito, S.A. Banco Universal', shortName: 'Venezolano de Crédito' },
  { code: '0105', name: 'Mercantil, C.A. Banco Universal', shortName: 'Mercantil' },
  { code: '0108', name: 'Banco Provincial, S.A. Banco Universal', shortName: 'BBVA Provincial' },
  { code: '0114', name: 'Bancaribe C.A. Banco Universal', shortName: 'Bancaribe' },
  { code: '0115', name: 'Banco Exterior, C.A. Banco Universal', shortName: 'Banco Exterior' },
  { code: '0128', name: 'Banco Caroní, C.A. Banco Universal', shortName: 'Banco Caroní' },
  { code: '0134', name: 'Banesco Banco Universal, C.A.', shortName: 'Banesco' },
  { code: '0137', name: 'Banco Sofitasa Banco Universal, C.A.', shortName: 'Banco Sofitasa' },
  { code: '0138', name: 'Banco Plaza, C.A. Banco Universal', shortName: 'Banco Plaza' },
  { code: '0151', name: 'BFC Banco Fondo Común, C.A. Banco Universal', shortName: 'Banco Fondo Común' },
  { code: '0156', name: '100% Banco, Banco Universal C.A.', shortName: '100% Banco' },
  { code: '0157', name: 'DelSur, Banco Universal C.A.', shortName: 'DelSur' },
  { code: '0163', name: 'Banco del Tesoro, C.A. Banco Universal', shortName: 'Banco del Tesoro' },
  { code: '0166', name: 'Banco Agrícola de Venezuela, C.A. Banco Universal', shortName: 'Banco Agrícola' },
  { code: '0168', name: 'Bancrecer, S.A. Banco Microfinanciero', shortName: 'Bancrecer' },
  { code: '0169', name: 'Mi Banco, Banco Microfinanciero C.A.', shortName: 'Mi Banco' },
  { code: '0171', name: 'Banco Activo, C.A. Banco Universal', shortName: 'Banco Activo' },
  { code: '0172', name: 'Bancamiga Banco Universal, C.A.', shortName: 'Bancamiga' },
  { code: '0174', name: 'Banplus Banco Universal, C.A.', shortName: 'Banplus' },
  { code: '0175', name: 'Banco Bicentenario del Pueblo, Banco Universal C.A.', shortName: 'Banco Bicentenario' },
  { code: '0177', name: 'Banco de la Fuerza Armada Nacional Bolivariana (BANFANB)', shortName: 'BANFANB' },
  { code: '0191', name: 'Banco Nacional de Crédito, C.A. Banco Universal', shortName: 'Banco Nacional de Crédito (BNC)' },
];

export function getBankByCode(code: string): VenezuelanBank | undefined {
  return VENEZUELAN_BANKS.find((b) => b.code === code.trim());
}

export function getBankByName(name: string): VenezuelanBank | undefined {
  const normalized = name.toLowerCase().trim();
  return VENEZUELAN_BANKS.find(
    (b) => b.shortName.toLowerCase().includes(normalized) || b.name.toLowerCase().includes(normalized)
  );
}

// ============================================================================
// 2. VALIDACIONES DE IDENTIDAD Y TELÉFONOS MÓVILES
// ============================================================================

/**
 * Valida prefijos móviles venezolanos (0412, 0414, 0424, 0416, 0426)
 * Acepta tanto 04XX (11 dígitos) como +584XX / 584XX (12 dígitos).
 */
export function isValidVenezuelanMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    const prefix = digits.substring(0, 4);
    return ['0412', '0414', '0424', '0416', '0426'].includes(prefix);
  }
  if (digits.length === 12 && digits.startsWith('58')) {
    const prefix = '0' + digits.substring(2, 5);
    return ['0412', '0414', '0424', '0416', '0426'].includes(prefix);
  }
  return false;
}

/**
 * Valida documentos de identidad venezolanos (Cédula o RIF: V, E, J, G seguido de 6 a 9 dígitos).
 */
export function isValidCedulaOrRif(doc: string): boolean {
  const trimmed = doc.trim().toUpperCase().replace(/[-.]/g, '');
  if (!trimmed) return false;
  return /^([VEJG])(\d{6,9})$/.test(trimmed);
}

/**
 * Valida la entrada completa de datos de un comprobante de Pago Móvil.
 */
export function validatePagoMovilInput(input: {
  phone: string;
  idDoc: string;
  reference: string;
}): { valid: boolean; error?: string } {
  if (!isValidVenezuelanMobile(input.phone)) {
    return {
      valid: false,
      error: 'Teléfono móvil inválido. Debe comenzar con 0412, 0414, 0424, 0416 o 0426.',
    };
  }

  if (!isValidCedulaOrRif(input.idDoc)) {
    return {
      valid: false,
      error: 'Documento inválido. Debe comenzar con V, E, J o G seguido de 6 a 9 números.',
    };
  }

  const cleanRef = input.reference.replace(/\D/g, '');
  if (cleanRef.length < 4) {
    return {
      valid: false,
      error: 'La referencia debe contener al menos los últimos 4 dígitos del comprobante.',
    };
  }

  return { valid: true };
}

// ============================================================================
// 3. CONVERSIÓN, FORMATEO MONETARIO E IGTF (3%)
// ============================================================================

/**
 * Convierte monto en USD a Bolívares (VES) redondeado a 2 decimales.
 */
export function convertUsdToVes(priceUsd: number, exchangeRate: number): number {
  if (priceUsd <= 0 || exchangeRate <= 0) return 0;
  return Number((priceUsd * exchangeRate).toFixed(2));
}

/**
 * Formato oficial venezolano (ej. "Bs. 1.250,50").
 */
export function formatBs(amount: number): string {
  const safe = isNaN(amount) ? 0 : amount;
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)}`;
}

export interface IgtfCalculationResult {
  baseAmountUsd: number;
  igtfPercentage: number;
  igtfAmountUsd: number;
  totalWithIgtfUsd: number;
  igtfAmountVes?: number;
  totalWithIgtfVes?: number;
}

/**
 * Calcula el Impuesto a las Grandes Transacciones Financieras (IGTF 3%)
 * Aplicable exclusivamente a pagos en divisas efectivo (CASH_USD) o similares.
 */
export function calculateIgtf(
  amountUsd: number,
  exchangeRate?: number,
  igtfPercentage: number = 3
): IgtfCalculationResult {
  if (amountUsd <= 0) {
    return {
      baseAmountUsd: 0,
      igtfPercentage,
      igtfAmountUsd: 0,
      totalWithIgtfUsd: 0,
      ...(exchangeRate ? { igtfAmountVes: 0, totalWithIgtfVes: 0 } : {}),
    };
  }

  const rateMultiplier = igtfPercentage / 100;
  const igtfAmountUsd = Number((amountUsd * rateMultiplier).toFixed(2));
  const totalWithIgtfUsd = Number((amountUsd + igtfAmountUsd).toFixed(2));

  let igtfAmountVes: number | undefined;
  let totalWithIgtfVes: number | undefined;

  if (exchangeRate && exchangeRate > 0) {
    igtfAmountVes = Number((igtfAmountUsd * exchangeRate).toFixed(2));
    totalWithIgtfVes = Number((totalWithIgtfUsd * exchangeRate).toFixed(2));
  }

  return {
    baseAmountUsd: amountUsd,
    igtfPercentage,
    igtfAmountUsd,
    totalWithIgtfUsd,
    igtfAmountVes,
    totalWithIgtfVes,
  };
}

// ============================================================================
// 4. CLIENTE RESILIENTE DE TASA OFICIAL BCV (SEGUNDO PLANO)
// ============================================================================

export interface BcvRateInfo {
  usdRate: number;
  eurRate?: number;
  usdtRate?: number;
  source: string;
  timestamp: string;
}

let memoryBcvCache: {
  data: BcvRateInfo;
  expiresAt: number;
} | null = null;

export const ALCAMBIO_GRAPHQL_URL = 'https://api.alcambio.app/graphql';
export const BCV_API_URL = 'https://bcv.today/api/v1/rate.json';

/**
 * Consulta la tasa oficial BCV de forma desatendida con fallback en cascada.
 * Memoria caché de 1 hora TTL para evitar saturación de red.
 */
export async function fetchOfficialBcvRate(): Promise<BcvRateInfo> {
  if (memoryBcvCache && Date.now() < memoryBcvCache.expiresAt) {
    return memoryBcvCache.data;
  }

  // 1. Primario: AlCambio GraphQL
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const query = `
      query getRates {
        getCountryConversions(payload: { countryCode: "VE" }) {
          dateBcv
          conversionRates {
            type
            official
            baseValue
            rateCurrency {
              code
            }
          }
        }
        getBinanceP2PAverages {
          sellAverage
          buyAverage
        }
      }
    `;

    const res = await fetch(ALCAMBIO_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MarketOS-LocalVenezuela/1.0',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const json = await res.json();
      const rates = json.data?.getCountryConversions?.conversionRates || [];
      const binance = json.data?.getBinanceP2PAverages;

      const officialUsd =
        rates.find(
          (r: any) =>
            r.official === true &&
            r.rateCurrency?.code === 'USD' &&
            (r.type === 'SECONDARY' || r.type === 'OTHER')
        ) ||
        rates.find((r: any) => r.official === true && r.rateCurrency?.code === 'USD');

      const officialEur =
        rates.find(
          (r: any) =>
            r.official === true &&
            r.rateCurrency?.code === 'EUR' &&
            (r.type === 'SECONDARY' || r.type === 'OTHER')
        ) ||
        rates.find((r: any) => r.rateCurrency?.code === 'EUR');

      let usdtRate: number | undefined;
      if (binance?.buyAverage && binance?.sellAverage) {
        const buy = Number(binance.buyAverage);
        const sell = Number(binance.sellAverage);
        if (!isNaN(buy) && !isNaN(sell) && buy > 0 && sell > 0) {
          usdtRate = Number(((buy + sell) / 2).toFixed(4));
        }
      }

      const usdRate = officialUsd ? Number(officialUsd.baseValue) : 0;
      const eurRate = officialEur ? Number(Number(officialEur.baseValue).toFixed(4)) : undefined;

      if (usdRate > 0) {
        const result: BcvRateInfo = {
          usdRate: Number(usdRate.toFixed(4)),
          eurRate,
          usdtRate,
          source: 'AlCambio (BCV Oficial)',
          timestamp: new Date().toISOString(),
        };

        memoryBcvCache = {
          data: result,
          expiresAt: Date.now() + 3600 * 1000,
        };
        return result;
      }
    }
  } catch (err) {
    console.warn('[local_venezuela] AlCambio fetch failed, trying backup:', err instanceof Error ? err.message : err);
  }

  // 2. Respaldo: bcv.today
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(BCV_API_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      const data = await res.json();
      const usdRate = typeof data.USD === 'number' ? data.USD : data.usd?.rate ?? 0;
      if (usdRate > 0) {
        const result: BcvRateInfo = {
          usdRate: Number(usdRate.toFixed(4)),
          source: 'bcv.today',
          timestamp: data.updated_at || new Date().toISOString(),
        };
        memoryBcvCache = {
          data: result,
          expiresAt: Date.now() + 3600 * 1000,
        };
        return result;
      }
    }
  } catch (err) {
    console.warn('[local_venezuela] Backup bcv.today failed:', err instanceof Error ? err.message : err);
  }

  // 3. Fallback de contingencia offline
  return {
    usdRate: 904.4485,
    source: 'BCV_FALLBACK_OFFLINE',
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// 5. EXPORTACIÓN DE LIBRO DE VENTAS SENIAT (CSV)
// Art. 56 Ley del IVA & Providencia Administrativa SNAT/2011/00071
// ============================================================================

export interface OrderForSalesBook {
  id: string;
  order_number: string;
  created_at: string | Date;
  status: string;
  customer_name?: string | null;
  customer_id_number?: string | null;
  total_usd: number;
  total_ves?: number | null;
  exchange_rate_applied?: number | null;
  subtotal_exempt_usd?: number | null;
  subtotal_taxable_usd?: number | null;
  iva_amount_usd?: number | null;
  igtf_amount_usd?: number | null;
  fiscal_invoice_number?: string | null;
  fiscal_control_number?: string | null;
}

export interface SeniatSalesBookEntry {
  operationNumber: number;
  date: string;
  customerRif: string;
  customerName: string;
  documentType: 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  invoiceNumber: string;
  controlNumber: string;
  affectedInvoiceNumber: string;
  totalVes: number;
  exemptVes: number;
  taxableBaseVes: number;
  ivaVes: number;
  igtfBaseVes: number;
  igtfVes: number;
  totalUsd: number;
  exchangeRate: number;
}

export function buildSeniatSalesBookEntries(orders: OrderForSalesBook[]): SeniatSalesBookEntry[] {
  const validOrders = orders
    .filter((o) =>
      ['PAYMENT_APPROVED', 'PREPARING', 'READY', 'DELIVERING', 'COMPLETED', 'delivered', 'confirmed'].includes(
        o.status
      )
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return validOrders.map((order, idx) => {
    const rate = Number(order.exchange_rate_applied || 0) > 0 ? Number(order.exchange_rate_applied) : 1;
    const isExemptUsd = Number(order.subtotal_exempt_usd || 0);
    const isTaxableUsd =
      Number(order.subtotal_taxable_usd || 0) || Number((order.total_usd / 1.16).toFixed(2));
    const ivaUsd =
      Number(order.iva_amount_usd || 0) || Number((order.total_usd - isTaxableUsd).toFixed(2));
    const igtfUsd = Number(order.igtf_amount_usd || 0);

    const exemptVes = Number((isExemptUsd * rate).toFixed(2));
    const taxableBaseVes = Number((isTaxableUsd * rate).toFixed(2));
    const ivaVes = Number((ivaUsd * rate).toFixed(2));
    const igtfVes = Number((igtfUsd * rate).toFixed(2));
    const igtfBaseVes = igtfUsd > 0 ? Number((order.total_usd * rate).toFixed(2)) : 0;
    const totalVes =
      Number(order.total_ves || 0) > 0
        ? Number(order.total_ves)
        : Number((order.total_usd * rate).toFixed(2));

    const invoiceNum = order.fiscal_invoice_number || `ORD-${order.order_number.replace(/^ORD-/, '')}`;
    const controlNum = order.fiscal_control_number || `00-${order.order_number.replace(/^ORD-/, '000')}`;

    const d = new Date(order.created_at);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    return {
      operationNumber: idx + 1,
      date: formattedDate,
      customerRif: order.customer_id_number || 'V-999999999',
      customerName: order.customer_name || 'CONSUMIDOR FINAL',
      documentType: 'FACTURA',
      invoiceNumber: invoiceNum,
      controlNumber: controlNum,
      affectedInvoiceNumber: '',
      totalVes,
      exemptVes,
      taxableBaseVes,
      ivaVes,
      igtfBaseVes,
      igtfVes,
      totalUsd: Number(order.total_usd),
      exchangeRate: rate,
    };
  });
}

export function generateSeniatSalesBookCsv(options: {
  orders: OrderForSalesBook[];
  businessName: string;
  rif: string;
  periodLabel?: string;
}): string {
  const { orders, businessName, rif, periodLabel = 'MES EN CURSO' } = options;
  const entries = buildSeniatSalesBookEntries(orders);

  const lines: string[] = [];

  // Cabecera fiscal obligatoria
  lines.push('"LIBRO DE VENTAS E INGRESOS (Art. 56 Ley del IVA / Providencia SNAT/2011/00071)"');
  lines.push(`"CONTRIBUYENTE:","${businessName}"`);
  lines.push(`"RIF:","${rif}"`);
  lines.push(`"PERIODO:","${periodLabel}"`);
  lines.push(`"GENERADO:","${new Date().toLocaleString('es-VE')} (America/Caracas)"`);
  lines.push('');

  // Columnas legales
  const headers = [
    'N° Operación',
    'Fecha de Emisión',
    'RIF / C.I. Adquirente',
    'Nombre o Razón Social',
    'Tipo Doc.',
    'N° Factura',
    'N° Control / Serial MF',
    'Factura Afectada',
    'Total Ventas con IVA (Bs.)',
    'Ventas Exentas (Bs.)',
    'Base Imponible 16% (Bs.)',
    'Débito Fiscal IVA 16% (Bs.)',
    'Base Sujeta IGTF 3% (Bs.)',
    'IGTF Percibido 3% (Bs.)',
    'Total Ventas ($ USD)',
    'Tasa Oficial BCV',
  ];
  lines.push(headers.map((h) => `"${h}"`).join(','));

  let sumTotalVes = 0;
  let sumExemptVes = 0;
  let sumTaxableVes = 0;
  let sumIvaVes = 0;
  let sumIgtfVes = 0;
  let sumTotalUsd = 0;

  for (const row of entries) {
    sumTotalVes += row.totalVes;
    sumExemptVes += row.exemptVes;
    sumTaxableVes += row.taxableBaseVes;
    sumIvaVes += row.ivaVes;
    sumIgtfVes += row.igtfVes;
    sumTotalUsd += row.totalUsd;

    const line = [
      row.operationNumber,
      `"${row.date}"`,
      `"${row.customerRif}"`,
      `"${row.customerName.replace(/"/g, '""')}"`,
      `"${row.documentType}"`,
      `"${row.invoiceNumber}"`,
      `"${row.controlNumber}"`,
      `"${row.affectedInvoiceNumber}"`,
      row.totalVes.toFixed(2),
      row.exemptVes.toFixed(2),
      row.taxableBaseVes.toFixed(2),
      row.ivaVes.toFixed(2),
      row.igtfBaseVes.toFixed(2),
      row.igtfVes.toFixed(2),
      row.totalUsd.toFixed(2),
      row.exchangeRate.toFixed(4),
    ];
    lines.push(line.join(','));
  }

  // Fila de resumen de totales
  lines.push('');
  const totalRow = [
    '"TOTALES"',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    sumTotalVes.toFixed(2),
    sumExemptVes.toFixed(2),
    sumTaxableVes.toFixed(2),
    sumIvaVes.toFixed(2),
    '""',
    sumIgtfVes.toFixed(2),
    sumTotalUsd.toFixed(2),
    '""',
  ];
  lines.push(totalRow.join(','));

  return lines.join('\r\n');
}
