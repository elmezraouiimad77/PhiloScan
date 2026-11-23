/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';

export const FIREBASE_X509_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
export const FIREBASE_APPCHECK_JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';

export const DEFAULT_FIREBASE_PROJECT_ID = 'project-ae3ca3a5-d34f-42a5-a4a';
export const DEFAULT_FIREBASE_PROJECT_NUMBER = '161687262096';
export const DEFAULT_ALLOWED_APP_IDS = ['1:161687262096:web:c538d2fd221174a4d19915'];

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  signInProvider: string;
  isAnonymous: boolean;
  authTime: number;
  issuedAt: number;
  expiresAt: number;
  rawClaims: Record<string, any>;
}

export interface VerifiedAppCheckResult {
  valid: boolean;
  bypassedInDev?: boolean;
  appId?: string;
  reason?: string;
}

interface CertCacheState {
  certs: Record<string, string>;
  expiresAtMs: number;
  lastRefreshAttemptMs: number;
}

interface JwkCacheState {
  keys: Array<Record<string, any>>;
  expiresAtMs: number;
  lastRefreshAttemptMs: number;
}

const certCache: CertCacheState = {
  certs: {},
  expiresAtMs: 0,
  lastRefreshAttemptMs: 0,
};

const appCheckJwkCache: JwkCacheState = {
  keys: [],
  expiresAtMs: 0,
  lastRefreshAttemptMs: 0,
};

function parseCacheControlMaxAgeMs(cacheControlHeader: string | null): number {
  if (!cacheControlHeader) return 3600 * 1000;
  const match = cacheControlHeader.match(/max-age=(\d+)/i);
  if (!match) return 3600 * 1000;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return 60 * 1000;
  return Math.min(seconds * 1000, 24 * 3600 * 1000);
}

function decodeJwtParts(token: string): {
  header: Record<string, any>;
  payload: Record<string, any>;
  signingInput: string;
  signature: Buffer;
} | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const signature = Buffer.from(parts[2], 'base64url');
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      return null;
    }
    return {
      header,
      payload,
      signingInput: `${parts[0]}.${parts[1]}`,
      signature,
    };
  } catch {
    return null;
  }
}

export async function getFirebasePublicCerts(
  forceRefresh = false,
  customFetch: typeof fetch = fetch
): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && Object.keys(certCache.certs).length > 0 && now < certCache.expiresAtMs) {
    return certCache.certs;
  }
  if (forceRefresh && now - certCache.lastRefreshAttemptMs < 15_000 && Object.keys(certCache.certs).length > 0) {
    // Cooldown prevents repeated unknown-kid DoS refreshes
    return certCache.certs;
  }
  certCache.lastRefreshAttemptMs = now;
  const resp = await customFetch(FIREBASE_X509_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase X509 certificates: HTTP ${resp.status}`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const ttlMs = parseCacheControlMaxAgeMs(resp.headers?.get?.('cache-control') || null);
  certCache.certs = certs;
  certCache.expiresAtMs = now + ttlMs;
  return certs;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  options?: {
    projectId?: string;
    nowSec?: number;
    certsOverride?: Record<string, string>;
    fetchImpl?: typeof fetch;
  }
): Promise<VerifiedFirebaseUser | null> {
  const parsed = decodeJwtParts(idToken);
  if (!parsed) return null;

  const { header, payload, signingInput, signature } = parsed;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    return null;
  }

  const projectId =
    options?.projectId ||
    (process.env.FIREBASE_PROJECT_ID || '').trim() ||
    DEFAULT_FIREBASE_PROJECT_ID;
  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);

  // Strict claims validation
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || payload.sub.length > 128) {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 60) return null;
  if (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + 60) return null;

  let certs = options?.certsOverride;
  if (!certs) {
    try {
      certs = await getFirebasePublicCerts(false, options?.fetchImpl || fetch);
      if (!certs[header.kid]) {
        certs = await getFirebasePublicCerts(true, options?.fetchImpl || fetch);
      }
    } catch (err) {
      console.warn('[PhiloScan Auth] Failed to retrieve Firebase X509 certificates:', err);
      return null;
    }
  }

  const certPem = certs?.[header.kid];
  if (!certPem) return null;

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    const sigOk = verifier.verify(certPem, signature);
    if (!sigOk) return null;
  } catch {
    return null;
  }

  const signInProvider = String(payload.firebase?.sign_in_provider || '');
  const isAnonymous = signInProvider === 'anonymous';
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  const emailVerified = Boolean(payload.email_verified);

  return {
    uid: payload.sub,
    email,
    emailVerified,
    signInProvider,
    isAnonymous,
    authTime: payload.auth_time,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    rawClaims: payload,
  };
}

export async function getAppCheckJwks(
  forceRefresh = false,
  customFetch: typeof fetch = fetch
): Promise<Array<Record<string, any>>> {
  const now = Date.now();
  if (!forceRefresh && appCheckJwkCache.keys.length > 0 && now < appCheckJwkCache.expiresAtMs) {
    return appCheckJwkCache.keys;
  }
  if (forceRefresh && now - appCheckJwkCache.lastRefreshAttemptMs < 15_000 && appCheckJwkCache.keys.length > 0) {
    return appCheckJwkCache.keys;
  }
  appCheckJwkCache.lastRefreshAttemptMs = now;
  const resp = await customFetch(FIREBASE_APPCHECK_JWKS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Firebase App Check JWKS: HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as { keys?: Array<Record<string, any>> };
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  const ttlMs = parseCacheControlMaxAgeMs(resp.headers?.get?.('cache-control') || null);
  appCheckJwkCache.keys = keys;
  appCheckJwkCache.expiresAtMs = now + ttlMs;
  return keys;
}

export function getAllowedAppIds(): string[] {
  const raw = (process.env.ALLOWED_APP_IDS || '').trim();
  if (!raw) return DEFAULT_ALLOWED_APP_IDS;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_APP_IDS;
}

export async function verifyAppCheckToken(
  tokenHeader: string | undefined | null,
  options?: {
    projectNumber?: string;
    allowedAppIds?: string[];
    nowSec?: number;
    nodeEnv?: string;
    allowMissingInDev?: boolean;
    jwksOverride?: Array<Record<string, any>>;
    fetchImpl?: typeof fetch;
  }
): Promise<VerifiedAppCheckResult> {
  const token = typeof tokenHeader === 'string' ? tokenHeader.trim() : '';
  const nodeEnv = options?.nodeEnv ?? (process.env.NODE_ENV || 'development');
  const isProd = nodeEnv === 'production';
  const allowMissing =
    options?.allowMissingInDev ?? process.env.ALLOW_MISSING_APP_CHECK_IN_DEV === 'true';

  // Critical: Only bypass when header is completely absent in non-production WITH explicit flag.
  // Malformed or invalid tokens MUST ALWAYS be rejected even in development!
  if (!token) {
    if (!isProd && allowMissing) {
      return { valid: true, bypassedInDev: true };
    }
    return {
      valid: false,
      reason: 'مفقود: رمز التحقق من التطبيق (X-Firebase-AppCheck).',
    };
  }

  const parsed = decodeJwtParts(token);
  if (!parsed) {
    return { valid: false, reason: 'تنسيق رمز App Check غير صالح.' };
  }

  const { header, payload, signingInput, signature } = parsed;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    return { valid: false, reason: 'ترويسة App Check JWT غير مدعومة.' };
  }

  const projectNumber =
    options?.projectNumber ||
    (process.env.FIREBASE_PROJECT_NUMBER || '').trim() ||
    DEFAULT_FIREBASE_PROJECT_NUMBER;
  const allowedAppIds = options?.allowedAppIds || getAllowedAppIds();
  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);

  if (payload.iss !== `https://firebaseappcheck.googleapis.com/${projectNumber}`) {
    return { valid: false, reason: 'مصدر رمز App Check (iss) غير مطابق للمشروع.' };
  }

  const audList: string[] = Array.isArray(payload.aud)
    ? payload.aud
    : typeof payload.aud === 'string'
    ? [payload.aud]
    : [];
  const expectedAud = `projects/${projectNumber}`;
  if (!audList.includes(expectedAud)) {
    return { valid: false, reason: 'المستهدف (aud) في رمز App Check غير صالح.' };
  }

  if (typeof payload.sub !== 'string' || !allowedAppIds.includes(payload.sub)) {
    return { valid: false, reason: 'معرّف التطبيق (App ID) غير مدرج في القائمة المسموحة.' };
  }

  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { valid: false, reason: 'انتهت صلاحية رمز App Check.' };
  }

  let keys = options?.jwksOverride;
  if (!keys) {
    try {
      keys = await getAppCheckJwks(false, options?.fetchImpl || fetch);
      if (!keys.some((k) => k.kid === header.kid)) {
        keys = await getAppCheckJwks(true, options?.fetchImpl || fetch);
      }
    } catch {
      return { valid: false, reason: 'تعذر جلب مفاتيح App Check العمومية.' };
    }
  }

  const matchedJwk = keys.find((k) => k.kid === header.kid);
  if (!matchedJwk) {
    return { valid: false, reason: 'مفتاح توقيع App Check غير معروف.' };
  }

  try {
    const publicKey = crypto.createPublicKey({ key: matchedJwk as any, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    const ok = verifier.verify(publicKey, signature);
    if (!ok) {
      return { valid: false, reason: 'فشل التحقق التشفيري من توقيع App Check.' };
    }
  } catch {
    return { valid: false, reason: 'تعذر التحقق من مفتاح App Check.' };
  }

  return {
    valid: true,
    appId: payload.sub,
  };
}

export function resetVerifierCachesForTests(): void {
  certCache.certs = {};
  certCache.expiresAtMs = 0;
  certCache.lastRefreshAttemptMs = 0;
  appCheckJwkCache.keys = [];
  appCheckJwkCache.expiresAtMs = 0;
  appCheckJwkCache.lastRefreshAttemptMs = 0;
}
