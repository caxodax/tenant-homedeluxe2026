import crypto from 'crypto';

export const STAFF_SESSION_COOKIE = 'marketos_staff_session';
export const LOGOUT_FLAG_COOKIE = 'marketos_logged_out';

export interface StaffSessionPayload {
  kind: 'tenant_staff' | 'super_admin';
  staffId: string;
  email: string;
  fullName: string;
  role: string;
  tenantSlug?: string;
  schemaName?: string;
  exp: number;
}

export function getSessionSecret(): string {
  const configured = process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET;
  if (configured && configured.length >= 16) {
    return configured;
  }
  const seed =
    process.env.DATABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'marketos-local-fallback';
  return crypto.createHash('sha256').update(`marketos-session::${seed}`).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !password) return false;
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, 32);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  }
  return false;
}

export function createSignedSessionToken(
  payload: Omit<StaffSessionPayload, 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const fullPayload: StaffSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySignedSessionToken(token: string | undefined | null): StaffSessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as StaffSessionPayload;
    if (!decoded || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
