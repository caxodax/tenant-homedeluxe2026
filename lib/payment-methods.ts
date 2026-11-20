import type { PoolClient } from 'pg';

export interface PaymentFieldDetail {
  label: string;
  value: string;
}

export interface PagoMovilConfig {
  bank_code: string;
  bank_name: string;
  phone: string;
  id_doc: string;
  beneficiary: string;
}

export interface BankTransferConfig {
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_type: 'Corriente' | 'Ahorro';
  id_doc: string;
  beneficiary: string;
}

export interface ZelleConfig {
  email: string;
  beneficiary: string;
}

export interface PaymentMethodConfig {
  requires_reference: boolean;
  requires_proof: boolean;
  available_in_storefront: boolean;
  available_in_pos: boolean;
  instructions: string;
  details: PaymentFieldDetail[];
  pago_movil?: PagoMovilConfig;
  bank_transfer?: BankTransferConfig;
  zelle?: ZelleConfig;
}

export interface TenantPaymentMethod extends PaymentMethodConfig {
  code: string;
  name: string;
  currency: string;
  is_active: boolean;
  plugin_id: string | null;
  is_system_default: boolean;
}

export const SYSTEM_PAYMENT_CODES = new Set([
  'CASH_USD',
  'CASH_LOCAL',
  'BANK_TRANSFER',
  'CARD',
  'OTHER',
]);

const DEFAULT_CONFIG_BY_CODE: Record<string, PaymentMethodConfig> = {
  CASH_USD: {
    requires_reference: false,
    requires_proof: false,
    available_in_storefront: true,
    available_in_pos: true,
    instructions: 'Pagas en efectivo (USD) al momento de retirar tu pedido en mostrador.',
    details: [],
  },
  BANK_TRANSFER: {
    requires_reference: true,
    requires_proof: true,
    available_in_storefront: true,
    available_in_pos: true,
    instructions: 'Realiza la transferencia bancaria en USD y adjunta el número de referencia y captura del comprobante.',
    details: [],
  },
  CARD: {
    requires_reference: false,
    requires_proof: false,
    available_in_storefront: true,
    available_in_pos: true,
    instructions: 'Pago con tarjeta de débito o crédito en punto de venta físico al retirar.',
    details: [],
  },
  CASH_LOCAL: {
    requires_reference: false,
    requires_proof: false,
    available_in_storefront: false,
    available_in_pos: false,
    instructions: 'Requiere plugin de localización activo para conversión en moneda local.',
    details: [],
  },
  OTHER: {
    requires_reference: false,
    requires_proof: false,
    available_in_storefront: false,
    available_in_pos: true,
    instructions: '',
    details: [],
  },
};

export function parsePagoMovilFromDetails(details: PaymentFieldDetail[]): PagoMovilConfig {
  let bank_code = '';
  let bank_name = '';
  let phone = '';
  let id_doc = '';
  let beneficiary = '';

  for (const d of details) {
    const l = (d.label || '').toLowerCase().trim();
    const v = (d.value || '').trim();
    if (!v) continue;

    if (l.includes('banco') || l.includes('bank') || /^(provincial|banesco|mercantil|venezuela|bancamiga|bnc)/i.test(l)) {
      const matchCode = v.match(/\b(01\d{2})\b/);
      if (matchCode) bank_code = matchCode[1];
      bank_name = v.replace(/^01\d{2}\s*[-–]\s*/, '').trim() || (l.length > 3 ? d.label : '');
    } else if (l.includes('tel') || l.includes('cel') || l.includes('phone') || /^(04\d{9}|584\d{9})$/.test(v.replace(/\D/g, ''))) {
      phone = v;
    } else if (l.includes('cedula') || l.includes('cédula') || l.includes('rif') || l.includes('doc') || /^[VEJG]-?\d+/i.test(v)) {
      id_doc = v;
    } else if (l.includes('titular') || l.includes('nombre') || l.includes('beneficiario') || l.includes('name')) {
      beneficiary = v;
    }
  }

  // Fallback heurístico: Si el usuario escribió el banco en la etiqueta y la cédula en el dato (como en la captura)
  if (!bank_name && !id_doc && details.length > 0) {
    for (const d of details) {
      if (/^[VEJG]-?\d+/i.test(d.value)) {
        id_doc = d.value;
        if (!bank_name && d.label && !d.label.toLowerCase().includes('etiqueta')) {
          bank_name = d.label;
        }
      }
    }
  }

  return { bank_code, bank_name, phone, id_doc, beneficiary };
}

export function parseBankTransferFromDetails(details: PaymentFieldDetail[]): BankTransferConfig {
  let bank_code = '';
  let bank_name = '';
  let account_number = '';
  let account_type: 'Corriente' | 'Ahorro' = 'Corriente';
  let id_doc = '';
  let beneficiary = '';

  for (const d of details) {
    const l = (d.label || '').toLowerCase().trim();
    const v = (d.value || '').trim();
    if (!v) continue;

    if (l.includes('banco') || l.includes('bank')) {
      const matchCode = v.match(/\b(01\d{2})\b/);
      if (matchCode) bank_code = matchCode[1];
      bank_name = v.replace(/^01\d{2}\s*[-–]\s*/, '').trim();
    } else if (l.includes('cuenta') || l.includes('número') || l.includes('numero') || /^\d{20}$/.test(v.replace(/\D/g, ''))) {
      account_number = v;
      const digits = v.replace(/\D/g, '');
      if (!bank_code && digits.length >= 4) {
        bank_code = digits.slice(0, 4);
      }
    } else if (l.includes('tipo')) {
      account_type = v.toLowerCase().includes('ahorro') ? 'Ahorro' : 'Corriente';
    } else if (l.includes('cedula') || l.includes('cédula') || l.includes('rif') || l.includes('doc') || /^[VEJG]-?\d+/i.test(v)) {
      id_doc = v;
    } else if (l.includes('titular') || l.includes('nombre') || l.includes('beneficiario')) {
      beneficiary = v;
    }
  }

  return { bank_code, bank_name, account_number, account_type, id_doc, beneficiary };
}

export function parseZelleFromDetails(details: PaymentFieldDetail[]): ZelleConfig {
  let email = '';
  let beneficiary = '';

  for (const d of details) {
    const l = (d.label || '').toLowerCase().trim();
    const v = (d.value || '').trim();
    if (!v) continue;

    if (l.includes('correo') || l.includes('email') || l.includes('zelle') || v.includes('@')) {
      email = v;
    } else if (l.includes('titular') || l.includes('nombre') || l.includes('beneficiario')) {
      beneficiary = v;
    }
  }

  return { email, beneficiary };
}

export function normalizeMethodConfig(
  code: string,
  rawConfig?: Partial<PaymentMethodConfig> | null
): PaymentMethodConfig {
  const fallback = DEFAULT_CONFIG_BY_CODE[code] || {
    requires_reference: true,
    requires_proof: false,
    available_in_storefront: true,
    available_in_pos: true,
    instructions: '',
    details: [],
  };

  const currentDetails = Array.isArray(rawConfig?.details)
    ? rawConfig.details.filter(
        (d): d is PaymentFieldDetail =>
          Boolean(d && typeof d.label === 'string' && typeof d.value === 'string' && d.label.trim() && d.value.trim())
      )
    : fallback.details;

  let structuredResult: {
    details: PaymentFieldDetail[];
    pago_movil?: PagoMovilConfig;
    bank_transfer?: BankTransferConfig;
    zelle?: ZelleConfig;
  } = { details: currentDetails };

  if (code === 'PAGO_MOVIL') {
    const pm = rawConfig?.pago_movil || parsePagoMovilFromDetails(currentDetails);
    const syncDetails: PaymentFieldDetail[] = [];
    if (pm.bank_name || pm.bank_code) {
      syncDetails.push({
        label: 'Banco',
        value: pm.bank_code && !pm.bank_name.includes(pm.bank_code) ? `${pm.bank_code} - ${pm.bank_name}` : pm.bank_name,
      });
    }
    if (pm.phone) syncDetails.push({ label: 'Teléfono', value: pm.phone });
    if (pm.id_doc) syncDetails.push({ label: 'Cédula / RIF', value: pm.id_doc });
    if (pm.beneficiary) syncDetails.push({ label: 'Titular', value: pm.beneficiary });

    structuredResult = {
      details: syncDetails.length > 0 ? syncDetails : currentDetails,
      pago_movil: pm,
    };
  } else if (code === 'BANK_TRANSFER') {
    const bt = rawConfig?.bank_transfer || parseBankTransferFromDetails(currentDetails);
    const hasData = bt.account_number || bt.bank_name || bt.id_doc || Boolean(rawConfig?.bank_transfer);
    if (hasData) {
      const syncDetails: PaymentFieldDetail[] = [];
      if (bt.bank_name || bt.bank_code) {
        syncDetails.push({
          label: 'Banco',
          value: bt.bank_code && !bt.bank_name.includes(bt.bank_code) ? `${bt.bank_code} - ${bt.bank_name}` : bt.bank_name,
        });
      }
      if (bt.account_number) syncDetails.push({ label: 'Número de Cuenta', value: bt.account_number });
      if (bt.account_type) syncDetails.push({ label: 'Tipo de Cuenta', value: bt.account_type });
      if (bt.id_doc) syncDetails.push({ label: 'Cédula / RIF', value: bt.id_doc });
      if (bt.beneficiary) syncDetails.push({ label: 'Titular', value: bt.beneficiary });

      structuredResult = {
        details: syncDetails.length > 0 ? syncDetails : currentDetails,
        bank_transfer: bt,
      };
    }
  } else if (code === 'ZELLE') {
    const z = rawConfig?.zelle || parseZelleFromDetails(currentDetails);
    if (z.email || z.beneficiary || Boolean(rawConfig?.zelle)) {
      const syncDetails: PaymentFieldDetail[] = [];
      if (z.email) syncDetails.push({ label: 'Correo / Teléfono Zelle', value: z.email });
      if (z.beneficiary) syncDetails.push({ label: 'Titular', value: z.beneficiary });

      structuredResult = {
        details: syncDetails.length > 0 ? syncDetails : currentDetails,
        zelle: z,
      };
    }
  }

  return {
    requires_reference:
      typeof rawConfig?.requires_reference === 'boolean'
        ? rawConfig.requires_reference
        : fallback.requires_reference,
    requires_proof:
      typeof rawConfig?.requires_proof === 'boolean'
        ? rawConfig.requires_proof
        : fallback.requires_proof,
    available_in_storefront:
      typeof rawConfig?.available_in_storefront === 'boolean'
        ? rawConfig.available_in_storefront
        : fallback.available_in_storefront,
    available_in_pos:
      typeof rawConfig?.available_in_pos === 'boolean'
        ? rawConfig.available_in_pos
        : fallback.available_in_pos,
    instructions:
      typeof rawConfig?.instructions === 'string'
        ? rawConfig.instructions
        : fallback.instructions,
    details: structuredResult.details,
    pago_movil: structuredResult.pago_movil,
    bank_transfer: structuredResult.bank_transfer,
    zelle: structuredResult.zelle,
  };
}

/**
 * Obtiene métodos de pago del tenant combinando `payment_methods` + `settings.value.payment_configs`.
 * Filtra métodos exclusivos de plugins si dichos plugins no están activos.
 */
export async function fetchTenantPaymentMethods(
  client: PoolClient,
  options?: {
    activePlugins?: string[];
    onlyActive?: boolean;
    channel?: 'storefront' | 'pos';
  }
): Promise<TenantPaymentMethod[]> {
  const activePluginSet = new Set(options?.activePlugins || []);

  const pmRes = await client.query(`
    SELECT code, name, currency, is_active, plugin_id, created_at
    FROM payment_methods
    ORDER BY
      CASE code
        WHEN 'CASH_USD' THEN 1
        WHEN 'BANK_TRANSFER' THEN 2
        WHEN 'CARD' THEN 3
        WHEN 'CASH_LOCAL' THEN 4
        WHEN 'OTHER' THEN 5
        ELSE 10
      END,
      name ASC
  `);
  const settingsRes = await client.query(`SELECT value FROM settings WHERE key = 'general' LIMIT 1`);

  const savedConfigs: Record<string, Partial<PaymentMethodConfig>> =
    settingsRes.rows[0]?.value?.payment_configs || {};

  const methods: TenantPaymentMethod[] = [];

  for (const row of pmRes.rows) {
    // Ocultar métodos exclusivos de plugins no activos
    if (row.plugin_id && !activePluginSet.has(row.plugin_id)) {
      continue;
    }

    // Core Agnóstico: CASH_LOCAL es moneda LOCAL; ocultarlo hasta que haya un plugin de localización activo
    if (row.code === 'CASH_LOCAL' && activePluginSet.size === 0) {
      continue;
    }

    if (options?.onlyActive && !row.is_active) {
      continue;
    }

    const cfg = normalizeMethodConfig(row.code, savedConfigs[row.code]);

    if (options?.channel === 'storefront' && !cfg.available_in_storefront) {
      continue;
    }
    if (options?.channel === 'pos' && !cfg.available_in_pos) {
      continue;
    }

    methods.push({
      code: row.code,
      name: row.name,
      currency: row.currency,
      is_active: row.is_active,
      plugin_id: row.plugin_id || null,
      is_system_default: SYSTEM_PAYMENT_CODES.has(row.code),
      ...cfg,
    });
  }

  return methods;
}

/**
 * Helper seguro para registrar eventos en `audit_logs` del tenant sin romper FK cuando
 * el staff es fallback de desarrollo (`demo-owner` / `super_admin`).
 */
export async function writeTenantAuditLog(
  client: PoolClient,
  params: {
    actorId?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
    action: string;
    entity: string;
    entityId: string;
    oldData?: unknown;
    newData?: unknown;
    ipAddress?: string | null;
  }
) {
  const isUuid = params.actorId
    ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.actorId)
    : false;

  let validActorId: string | null = null;
  if (isUuid && params.actorId) {
    const check = await client.query(
      `SELECT id FROM staff_profiles WHERE id = $1 LIMIT 1`,
      [params.actorId]
    );
    if ((check.rowCount || 0) > 0) {
      validActorId = params.actorId;
    }
  }

  await client.query(
    `INSERT INTO audit_logs (
      actor_id, actor_name, actor_role, action, entity, entity_id, old_data, new_data, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
    [
      validActorId,
      params.actorName || 'Sistema',
      params.actorRole || 'SYSTEM',
      params.action,
      params.entity,
      params.entityId,
      params.oldData !== undefined ? JSON.stringify(params.oldData) : null,
      params.newData !== undefined ? JSON.stringify(params.newData) : null,
      params.ipAddress || null,
    ]
  );
}
