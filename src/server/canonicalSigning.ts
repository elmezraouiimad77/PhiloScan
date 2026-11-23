/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import type { AnalysisVerificationResponse, SignedAnalysisEnvelope } from '../types';

export const ENVELOPE_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_ENVELOPE_AGE_MS = 24 * 60 * 60 * 1000;
export const CONTENT_TRUTH_DISCLAIMER =
  'يثبت التوقيع سلامة مصدر التحليل الآلي وعدم تعديله تقنياً، ولا يُعد حكماً تربوياً نهائياً؛ يظل تقدير الأستاذ وتعديلاته المرجع البيداغوجي المعتمد.';

const EPHEMERAL_DEV_HMAC_SECRET = crypto.randomBytes(32).toString('hex');
let warnedMissingSecret = false;

export function getAnalysisHmacKey(): string {
  const configured =
    (process.env.ANALYSIS_HMAC_SECRET || '').trim() ||
    (process.env.AUTH_TOKEN_SECRET || '').trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      '[PhiloScan Security] ANALYSIS_HMAC_SECRET is not configured; using process-local ephemeral HMAC key (never falls back to GEMINI_API_KEY).'
    );
  }
  return EPHEMERAL_DEV_HMAC_SECRET;
}

/**
 * Deterministic canonical JSON serialization with lexicographically sorted keys
 * and consistent primitive handling.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => (item === undefined ? 'null' : canonicalJson(item)));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function' && typeof obj[k] !== 'symbol')
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
    return `{${entries.join(',')}}`;
  }
  return 'null';
}

export function computeSha256Hex(value: unknown): string {
  const serialized = typeof value === 'string' ? value : canonicalJson(value);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

export interface CanonicalSignatureFields {
  schemaVersion: number;
  submissionId: string;
  sessionId: string;
  studentAuthUid: string;
  answersHash: string;
  analysisHash: string;
  signedAt: string;
  jti: string;
}

export function buildCanonicalSignaturePayload(fields: CanonicalSignatureFields): string {
  return canonicalJson({
    schemaVersion: Number(fields.schemaVersion),
    submissionId: String(fields.submissionId),
    sessionId: String(fields.sessionId),
    studentAuthUid: String(fields.studentAuthUid),
    answersHash: String(fields.answersHash),
    analysisHash: String(fields.analysisHash),
    signedAt: String(fields.signedAt),
    jti: String(fields.jti),
  });
}

export class JtiReplayCache {
  private readonly seen = new Map<string, number>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  private pruneExpired(nowMs: number): void {
    for (const [key, expiresAt] of this.seen.entries()) {
      if (expiresAt <= nowMs) {
        this.seen.delete(key);
      }
    }
    this.enforceMaxEntries();
  }

  private enforceMaxEntries(): void {
    if (this.seen.size > this.maxEntries) {
      const overflow = this.seen.size - this.maxEntries;
      let removed = 0;
      for (const key of this.seen.keys()) {
        this.seen.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
  }

  has(jti: string, nowMs = Date.now()): boolean {
    const exp = this.seen.get(jti);
    if (!exp) return false;
    if (exp <= nowMs) {
      this.seen.delete(jti);
      return false;
    }
    return true;
  }

  consume(jti: string, ttlMs = DEFAULT_MAX_ENVELOPE_AGE_MS, nowMs = Date.now()): boolean {
    this.pruneExpired(nowMs);
    if (this.has(jti, nowMs)) {
      return false;
    }
    this.seen.set(jti, nowMs + ttlMs);
    this.enforceMaxEntries();
    return true;
  }

  clear(): void {
    this.seen.clear();
  }
}

export const defaultJtiReplayCache = new JtiReplayCache();

export function signAnalysisEnvelope(params: {
  submissionId: string;
  sessionId: string;
  studentAuthUid: string;
  answers: unknown;
  analysis: unknown;
  analysisOrigin: 'gemini' | 'heuristic';
  signedAt?: string;
  jti?: string;
  secret?: string;
}): SignedAnalysisEnvelope {
  const secret = params.secret || getAnalysisHmacKey();
  const signedAt = params.signedAt || new Date().toISOString();
  const jti = params.jti || crypto.randomBytes(16).toString('hex');
  const answersHash = computeSha256Hex(params.answers);
  const analysisHash = computeSha256Hex(params.analysis);

  const canonicalPayload = buildCanonicalSignaturePayload({
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    submissionId: params.submissionId,
    sessionId: params.sessionId,
    studentAuthUid: params.studentAuthUid,
    answersHash,
    analysisHash,
    signedAt,
    jti,
  });

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  return {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    submissionId: params.submissionId,
    sessionId: params.sessionId,
    studentAuthUid: params.studentAuthUid,
    answersHash,
    analysisHash,
    signedAt,
    jti,
    hmac,
    analysisOrigin: params.analysisOrigin,
    contentTruthDisclaimer: CONTENT_TRUTH_DISCLAIMER,
  };
}

export function verifyAnalysisEnvelope(params: {
  envelope: SignedAnalysisEnvelope | null | undefined;
  submissionId: string;
  sessionId: string;
  studentAuthUid: string;
  answers: unknown;
  analysis: unknown;
  requireDeterministicSubmissionId?: boolean;
  consumeReplayNonce?: boolean;
  replayCache?: JtiReplayCache;
  maxAgeMs?: number;
  nowMs?: number;
  secret?: string;
}): AnalysisVerificationResponse {
  const checkedAt = new Date(params.nowMs ?? Date.now()).toISOString();
  const envelope = params.envelope;
  const origin: 'gemini' | 'heuristic' | 'unknown' =
    envelope?.analysisOrigin === 'gemini' || envelope?.analysisOrigin === 'heuristic'
      ? envelope.analysisOrigin
      : 'unknown';

  if (!envelope || typeof envelope !== 'object') {
    return {
      valid: false,
      signatureIntegrity: 'unsigned',
      analysisOrigin: origin,
      reason: 'لا يوجد غلاف توقيع رقمي مرفق بهذا التحليل.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
    };
  }

  if (
    envelope.schemaVersion !== ENVELOPE_SCHEMA_VERSION ||
    !envelope.submissionId ||
    !envelope.sessionId ||
    !envelope.studentAuthUid ||
    !envelope.answersHash ||
    !envelope.analysisHash ||
    !envelope.signedAt ||
    !envelope.jti ||
    !envelope.hmac
  ) {
    return {
      valid: false,
      signatureIntegrity: 'invalid',
      analysisOrigin: origin,
      reason: 'غلاف التوقيع غير مكتمل الحقول الإلزامية.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
    };
  }

  if (
    envelope.submissionId !== params.submissionId ||
    envelope.sessionId !== params.sessionId ||
    envelope.studentAuthUid !== params.studentAuthUid
  ) {
    return {
      valid: false,
      signatureIntegrity: 'tampered',
      analysisOrigin: origin,
      reason: 'عدم تطابق معرفات الإرسالية أو الجلسة أو هوية التلميذ.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
      submissionId: envelope.submissionId,
      sessionId: envelope.sessionId,
      studentAuthUid: envelope.studentAuthUid,
    };
  }

  if (params.requireDeterministicSubmissionId !== false) {
    const expectedDeterministicId = `${params.sessionId}_${params.studentAuthUid}`;
    if (params.submissionId !== expectedDeterministicId) {
      return {
        valid: false,
        signatureIntegrity: 'tampered',
        analysisOrigin: origin,
        reason: 'معرّف الإرسالية لا يطابق الربط الحتمي (sessionId_studentAuthUid).',
        contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
        checkedAt,
        submissionId: envelope.submissionId,
        sessionId: envelope.sessionId,
        studentAuthUid: envelope.studentAuthUid,
      };
    }
  }

  const nowMs = params.nowMs ?? Date.now();
  const maxAgeMs = params.maxAgeMs ?? DEFAULT_MAX_ENVELOPE_AGE_MS;
  const signedAtMs = Date.parse(envelope.signedAt);
  if (!Number.isFinite(signedAtMs)) {
    return {
      valid: false,
      signatureIntegrity: 'invalid',
      analysisOrigin: origin,
      reason: 'صيغة توقيت التوقيع (signedAt) غير صالحة.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
    };
  }

  if (signedAtMs > nowMs + 60_000 || nowMs - signedAtMs > maxAgeMs) {
    return {
      valid: false,
      signatureIntegrity: 'expired',
      analysisOrigin: origin,
      reason: 'انتهت صلاحية نافذة التحقق الزمنية للتوقيع.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
      submissionId: envelope.submissionId,
      sessionId: envelope.sessionId,
      studentAuthUid: envelope.studentAuthUid,
    };
  }

  const expectedAnswersHash = computeSha256Hex(params.answers);
  const expectedAnalysisHash = computeSha256Hex(params.analysis);
  const answersHashMatch = expectedAnswersHash === envelope.answersHash;
  const analysisHashMatch = expectedAnalysisHash === envelope.analysisHash;

  if (!answersHashMatch || !analysisHashMatch) {
    return {
      valid: false,
      signatureIntegrity: 'tampered',
      analysisOrigin: origin,
      reason: !answersHashMatch
        ? 'بصمة الإجابات (answersHash) لا تطابق التوقيع المرفق.'
        : 'بصمة التحليل (analysisHash) لا تطابق التوقيع المرفق.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
      submissionId: envelope.submissionId,
      sessionId: envelope.sessionId,
      studentAuthUid: envelope.studentAuthUid,
      answersHashMatch,
      analysisHashMatch,
    };
  }

  const secret = params.secret || getAnalysisHmacKey();
  const canonicalPayload = buildCanonicalSignaturePayload({
    schemaVersion: envelope.schemaVersion,
    submissionId: envelope.submissionId,
    sessionId: envelope.sessionId,
    studentAuthUid: envelope.studentAuthUid,
    answersHash: envelope.answersHash,
    analysisHash: envelope.analysisHash,
    signedAt: envelope.signedAt,
    jti: envelope.jti,
  });

  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(canonicalPayload, 'utf8')
    .digest('hex');

  const actualBuf = Buffer.from(envelope.hmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  if (
    actualBuf.length === 0 ||
    actualBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(actualBuf, expectedBuf)
  ) {
    return {
      valid: false,
      signatureIntegrity: 'invalid',
      analysisOrigin: origin,
      reason: 'التوقيع الرقمي (HMAC-SHA256) غير صحيح أو تم تعديله.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
      submissionId: envelope.submissionId,
      sessionId: envelope.sessionId,
      studentAuthUid: envelope.studentAuthUid,
      answersHashMatch: true,
      analysisHashMatch: true,
    };
  }

  const cache = params.replayCache || defaultJtiReplayCache;
  const consume = params.consumeReplayNonce !== false;
  if (consume) {
    const fresh = cache.consume(envelope.jti, maxAgeMs, nowMs);
    if (!fresh) {
      return {
        valid: false,
        signatureIntegrity: 'replayed',
        analysisOrigin: origin,
        reason: 'تم رصد محاولة إعادة تشغيل (Replay Attack) باستخدام نفس معرّف jti مسبقاً.',
        contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
        checkedAt,
        submissionId: envelope.submissionId,
        sessionId: envelope.sessionId,
        studentAuthUid: envelope.studentAuthUid,
        answersHashMatch: true,
        analysisHashMatch: true,
        replayed: true,
      };
    }
  } else if (cache.has(envelope.jti, nowMs)) {
    return {
      valid: false,
      signatureIntegrity: 'replayed',
      analysisOrigin: origin,
      reason: 'معرّف التوقيع (jti) مستهلك مسبقاً.',
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      checkedAt,
      submissionId: envelope.submissionId,
      sessionId: envelope.sessionId,
      studentAuthUid: envelope.studentAuthUid,
      answersHashMatch: true,
      analysisHashMatch: true,
      replayed: true,
    };
  }

  return {
    valid: true,
    signatureIntegrity: 'valid',
    analysisOrigin: origin,
    contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
    checkedAt,
    submissionId: envelope.submissionId,
    sessionId: envelope.sessionId,
    studentAuthUid: envelope.studentAuthUid,
    answersHashMatch: true,
    analysisHashMatch: true,
    replayed: false,
  };
}
