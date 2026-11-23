/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  assertAllowedGeminiModel,
  FALLBACK_FREE_GEMINI_MODEL,
  PRIMARY_FREE_GEMINI_MODEL,
  redactStudentAnswersForAI,
  redactStudentPiiFromText,
} from '../src/server/piiGuard.ts';
import { createRateLimiter } from '../src/server/rateLimiter.ts';
import {
  DEFAULT_ALLOWED_APP_IDS,
  DEFAULT_FIREBASE_PROJECT_ID,
  DEFAULT_FIREBASE_PROJECT_NUMBER,
  verifyAppCheckToken,
  verifyFirebaseIdToken,
} from '../src/server/firebaseTokenVerifier.ts';

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function signJwtRs256(
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKey: crypto.KeyObject
): string {
  const h = base64Url(JSON.stringify(header));
  const p = base64Url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

test('assertAllowedGeminiModel permits ONLY free models and blocks paid models', () => {
  assert.equal(assertAllowedGeminiModel(PRIMARY_FREE_GEMINI_MODEL), 'gemini-4-hydrogen');
  assert.equal(assertAllowedGeminiModel(FALLBACK_FREE_GEMINI_MODEL), 'gemini-3.1-flash-lite');

  for (const forbidden of ['gemini-2.5-pro', 'gemini-3.1-pro', 'gemini-1.5-pro', 'gpt-4o']) {
    assert.throws(() => assertAllowedGeminiModel(forbidden), /Forbidden Gemini model/);
  }
});

test('PII redaction removes student names, emails, phones, schools, and preserves essay concepts', () => {
  const text = 'الاسم الكامل: كريم العلمي، المؤسسة: ثانوية ابن رشد، بريدي karim@example.ma وهاتفي 0612345678 وأرى الفلسفة تساؤلاً حراً.';
  const clean = redactStudentPiiFromText(text, {
    studentName: 'كريم العلمي',
    institution: 'ثانوية ابن رشد',
  });
  assert.equal(clean.includes('karim@example.ma'), false);
  assert.equal(clean.includes('0612345678'), false);
  assert.equal(clean.includes('كريم العلمي'), false);
  assert.equal(clean.includes('ثانوية ابن رشد'), false);
  assert.equal(clean.includes('تساؤلاً حراً'), true);

  const answers = redactStudentAnswersForAI(
    {
      studentName: 'كريم العلمي',
      email: 'karim@example.ma',
      phone: '0612345678',
      philosophyMeaning: 'الفلسفة بحث عن الحكمة بعيداً عن اسمي كريم العلمي',
    },
    { studentName: 'كريم العلمي' }
  );
  assert.equal('studentName' in answers, false);
  assert.equal('email' in answers, false);
  assert.equal('phone' in answers, false);
  assert.equal(String(answers.philosophyMeaning).includes('كريم العلمي'), false);
  assert.equal(String(answers.philosophyMeaning).includes('بحث عن الحكمة'), true);
});

test('createRateLimiter enforces IP and UID quotas cleanly', () => {
  const limiter = createRateLimiter({
    keyPrefix: 'unit',
    windowMs: 60_000,
    maxPerIp: 4,
    maxPerUid: 2,
  });

  const invoke = (ip: string, uid?: string) => {
    let statusCode = 200;
    let body: any = null;
    let nextCalled = false;
    const headers: Record<string, string> = {};
    const req: any = {
      ip,
      socket: { remoteAddress: ip },
      authActor: uid ? { uid } : undefined,
    };
    const res: any = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (payload: any) => {
        body = payload;
        return res;
      },
    };
    limiter(req, res, () => {
      nextCalled = true;
    });
    return { statusCode, body, nextCalled, headers };
  };

  assert.equal(invoke('10.0.0.1', 'u1').nextCalled, true);
  assert.equal(invoke('10.0.0.1', 'u1').nextCalled, true);
  // 3rd request for same uid passes IP check (3/4) then hits maxPerUid=2
  const uidLimited = invoke('10.0.0.1', 'u1');
  assert.equal(uidLimited.nextCalled, false);
  assert.equal(uidLimited.statusCode, 429);
  assert.ok(uidLimited.headers['Retry-After']);

  // Different uid on same IP succeeds as 4th IP slot (4/4), then 5th hits maxPerIp=4
  assert.equal(invoke('10.0.0.1', 'u2').nextCalled, true);
  const ipLimited = invoke('10.0.0.1', 'u3');
  assert.equal(ipLimited.nextCalled, false);
  assert.equal(ipLimited.statusCode, 429);
});

test('verifyFirebaseIdToken validates RS256 signature & strict claims', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const pubPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  assert.ok(spkiDer.byteLength > 0);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  void pubPem;

  const nowSec = Math.floor(Date.now() / 1000);
  const certsOverride = { 'kid-test-1': publicKeyPem };

  const validToken = signJwtRs256(
    { alg: 'RS256', kid: 'kid-test-1', typ: 'JWT' },
    {
      aud: DEFAULT_FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${DEFAULT_FIREBASE_PROJECT_ID}`,
      sub: 'teacher_uid_123',
      email: 'teacher@example.ma',
      email_verified: true,
      auth_time: nowSec - 30,
      iat: nowSec - 10,
      exp: nowSec + 3600,
      firebase: { sign_in_provider: 'google.com' },
    },
    privateKey
  );

  const verified = await verifyFirebaseIdToken(validToken, { certsOverride, nowSec });
  assert.ok(verified);
  assert.equal(verified.uid, 'teacher_uid_123');
  assert.equal(verified.email, 'teacher@example.ma');
  assert.equal(verified.emailVerified, true);
  assert.equal(verified.isAnonymous, false);

  // Wrong aud rejected
  const wrongAudToken = signJwtRs256(
    { alg: 'RS256', kid: 'kid-test-1' },
    {
      aud: 'other-project',
      iss: `https://securetoken.google.com/${DEFAULT_FIREBASE_PROJECT_ID}`,
      sub: 'teacher_uid_123',
      auth_time: nowSec - 30,
      iat: nowSec - 10,
      exp: nowSec + 3600,
    },
    privateKey
  );
  assert.equal(await verifyFirebaseIdToken(wrongAudToken, { certsOverride, nowSec }), null);

  // Expired token rejected
  const expiredToken = signJwtRs256(
    { alg: 'RS256', kid: 'kid-test-1' },
    {
      aud: DEFAULT_FIREBASE_PROJECT_ID,
      iss: `https://securetoken.google.com/${DEFAULT_FIREBASE_PROJECT_ID}`,
      sub: 'teacher_uid_123',
      auth_time: nowSec - 4000,
      iat: nowSec - 3900,
      exp: nowSec - 10,
    },
    privateKey
  );
  assert.equal(await verifyFirebaseIdToken(expiredToken, { certsOverride, nowSec }), null);
});

test('verifyAppCheckToken enforces dev-only missing bypass and rejects malformed tokens everywhere', async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, any>;
  jwk.kid = 'appcheck-kid-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const nowSec = Math.floor(Date.now() / 1000);

  // Missing in dev WITH explicit flag -> bypassed
  const devBypass = await verifyAppCheckToken(undefined, {
    nodeEnv: 'development',
    allowMissingInDev: true,
  });
  assert.equal(devBypass.valid, true);
  assert.equal(devBypass.bypassedInDev, true);

  // Missing in production EVEN IF allowMissingInDev=true -> REJECTED
  const prodMissing = await verifyAppCheckToken(undefined, {
    nodeEnv: 'production',
    allowMissingInDev: true,
  });
  assert.equal(prodMissing.valid, false);

  // Malformed token in dev WITH allowMissingInDev=true -> REJECTED (never bypassed!)
  const malformedInDev = await verifyAppCheckToken('not.a.valid.jwt', {
    nodeEnv: 'development',
    allowMissingInDev: true,
  });
  assert.equal(malformedInDev.valid, false);

  // Valid App Check JWKS signature
  const validAppCheck = signJwtRs256(
    { alg: 'RS256', kid: 'appcheck-kid-1', typ: 'JWT' },
    {
      iss: `https://firebaseappcheck.googleapis.com/${DEFAULT_FIREBASE_PROJECT_NUMBER}`,
      aud: [`projects/${DEFAULT_FIREBASE_PROJECT_NUMBER}`],
      sub: DEFAULT_ALLOWED_APP_IDS[0],
      iat: nowSec - 5,
      exp: nowSec + 1800,
    },
    privateKey
  );
  const okRes = await verifyAppCheckToken(validAppCheck, {
    nodeEnv: 'production',
    jwksOverride: [jwk],
    nowSec,
  });
  assert.equal(okRes.valid, true);
  assert.equal(okRes.appId, DEFAULT_ALLOWED_APP_IDS[0]);
});
