/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { JtiReplayCache } from '../src/server/canonicalSigning.ts';

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'philoscan-e2e-data-'));
process.env.PHILOSCAN_DISABLE_AUTO_LISTEN = '1';
process.env.PHILOSCAN_DATA_DIR = tempDataDir;
process.env.ADMIN_SECRET_KEY = 'TestE2EAdminSecretKey_Strict_987654';
process.env.ANALYSIS_HMAC_SECRET = 'TestE2EAnalysisHmacSecret_Strict_987654';

fs.writeFileSync(
  path.join(tempDataDir, 'teachers.json'),
  JSON.stringify(
    [
      {
        id: 'TCH-E2E',
        uid: 'teacher_e2e_uid',
        fullName: 'أستاذة الفلسفة',
        email: 'e2e.teacher@example.ma',
        school: 'ثانوية المعرفة',
        regionalAcademy: 'فاس مكناس',
        province: 'فاس',
        createdAt: '2026-11-23T08:00:00.000Z',
        isDisabled: false,
      },
    ],
    null,
    2
  )
);
fs.writeFileSync(path.join(tempDataDir, 'sessions.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'submissions.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'forms.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'reports.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'notifications.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'notification_settings.json'), JSON.stringify([], null, 2));

const { app, setSecurityTestHooks, resetSecurityTestHooks } = await import('../server.ts');

let server: http.Server;
let baseUrl = '';

const TEACHER_TOKEN = 'hdr.pay.e2eTeacher';
const STUDENT_TOKEN = 'hdr.pay.e2eStudent';
const RATE_TEST_STUDENT_TOKEN = 'hdr.pay.e2eRateStudent';
const VALID_APPCHECK = 'valid.enterprise.appcheck.jwt';

test.before(async () => {
  setSecurityTestHooks({
    verifyIdToken: async (token: string) => {
      if (token === TEACHER_TOKEN) {
        return {
          uid: 'teacher_e2e_uid',
          email: 'e2e.teacher@example.ma',
          emailVerified: true,
          signInProvider: 'google.com',
          isAnonymous: false,
          authTime: Math.floor(Date.now() / 1000) - 30,
          issuedAt: Math.floor(Date.now() / 1000) - 10,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          rawClaims: {},
        };
      }
      if (token === STUDENT_TOKEN || token === RATE_TEST_STUDENT_TOKEN) {
        return {
          uid: token === STUDENT_TOKEN ? 'stu_e2e_001' : 'stu_rate_limit_uid',
          email: '',
          emailVerified: false,
          signInProvider: 'anonymous',
          isAnonymous: true,
          authTime: Math.floor(Date.now() / 1000) - 20,
          issuedAt: Math.floor(Date.now() / 1000) - 10,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          rawClaims: {},
        };
      }
      return null;
    },
    verifyAppCheck: async (header) => {
      if (header === VALID_APPCHECK) {
        return { valid: true, appId: '1:161687262096:web:c538d2fd221174a4d19915' };
      }
      return { valid: false, reason: 'Invalid Enterprise App Check token' };
    },
    checkTeacherActive: async (uid) => {
      if (uid === 'teacher_e2e_uid') return { exists: true, isDisabled: false };
      return { exists: false, isDisabled: false };
    },
    checkAdminActive: async () => false,
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  resetSecurityTestHooks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tempDataDir, { recursive: true, force: true });
});

test('E2E Student-to-Teacher Journey: Form Publish -> Session Lookup -> Student Submit -> SignedAnalysisEnvelope -> Teacher Verification (Option A)', async () => {
  // Step 1: Teacher publishes a custom diagnostic form
  const formId = 'FRM_E2E_01';
  const createFormResp = await fetch(`${baseUrl}/api/forms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEACHER_TOKEN}`,
    },
    body: JSON.stringify({
      formId,
      title: 'استمارة تشخيصية حول الحرية والوعي',
      status: 'published',
      questions: [
        {
          id: 'q_custom_1',
          text: 'هل الإنسان حر أم مقيد في اختياراته؟ علل موقفك.',
          type: 'text',
          axis: 'criticalThinking',
        },
        {
          id: 'q_custom_2',
          text: 'ما شعورك عند طرح أسئلة فلسفية مفتوحة؟',
          type: 'choice',
          options: ['حماس وفضول', 'تردد وقلق'],
          axis: 'cognitiveCuriosity',
        },
      ],
    }),
  });
  assert.equal(createFormResp.status, 200);

  // Step 2: Teacher creates diagnostic session linked to the published form
  const createSessionResp = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEACHER_TOKEN}`,
    },
    body: JSON.stringify({
      title: 'تشخيص مسلك الآداب',
      institution: 'ثانوية المعرفة',
      level: 'الثانية باكالوريا',
      stream: 'آداب',
      classNumber: '2',
      province: 'فاس',
      formId,
      formTitle: 'استمارة تشخيصية حول الحرية والوعي',
    }),
  });
  assert.equal(createSessionResp.status, 200);
  const createSessionBody = (await createSessionResp.json()) as { session: { sessionId: string } };
  const createdSessionId = createSessionBody.session.sessionId;
  assert.match(createdSessionId, /^PS-[A-Z0-9]{6}$/);

  // Step 3: Student opens session & receives published questions WITHOUT private PII/teacherEmail/customWeights
  const publicSessResp = await fetch(`${baseUrl}/api/sessions/${createdSessionId}`);
  assert.equal(publicSessResp.status, 200);
  const publicSessBody = (await publicSessResp.json()) as { session: Record<string, any> };
  assert.equal(publicSessBody.session.sessionId, createdSessionId);
  assert.equal(Array.isArray(publicSessBody.session.questions), true);
  assert.equal(publicSessBody.session.questions.length, 2);
  assert.equal('teacherEmail' in publicSessBody.session, false);
  assert.equal('teacherId' in publicSessBody.session, false);
  assert.equal('customWeights' in publicSessBody.session, false);

  // Step 4: Student answers & submits (attempting client forgery of trustedAnalysis/analysisStatus must NOT persist)
  const studentAnswers = {
    q_custom_1: 'الإنسان يتأرجح بين الضرورة والحرية عبر الوعي النقدي والاختيار المسؤول.',
    q_custom_2: 'حماس وفضول',
  };
  const questionLabels = {
    q_custom_1: publicSessBody.session.questions[0].text,
    q_custom_2: publicSessBody.session.questions[1].text,
  };

  const submitResp = await fetch(`${baseUrl}/api/student-submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STUDENT_TOKEN}`,
      'X-Firebase-AppCheck': VALID_APPCHECK,
    },
    body: JSON.stringify({
      studentName: 'نادية الإدريسي',
      sessionId: createdSessionId,
      answers: studentAnswers,
      questionLabels,
      trustedAnalysis: { forged: true },
      analysisStatus: 'verified',
    }),
  });
  assert.equal(submitResp.status, 200);
  const submitJson = (await submitResp.json()) as any;
  assert.equal(submitJson.success, true);
  assert.equal(submitJson.submission?.id, `${createdSessionId}_stu_e2e_001`);
  assert.ok(submitJson.signedEnvelope?.hmac);
  assert.ok(submitJson.signedEnvelope?.answersHash);
  assert.ok(submitJson.signedEnvelope?.analysisHash);
  assert.ok(submitJson.contentTruthNote);
  assert.equal('trustedAnalysis' in (submitJson.submission || {}), false);
  assert.equal('analysisStatus' in (submitJson.submission || {}), false);

  // Also test /api/submissions/analyze-public issues Option A signed envelope
  const analyzePublicResp = await fetch(`${baseUrl}/api/submissions/analyze-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STUDENT_TOKEN}`,
      'X-Firebase-AppCheck': VALID_APPCHECK,
    },
    body: JSON.stringify({
      sessionId: createdSessionId,
      answers: studentAnswers,
      questionLabels,
    }),
  });
  assert.equal(analyzePublicResp.status, 200);
  const analyzePublicJson = (await analyzePublicResp.json()) as any;
  assert.equal(analyzePublicJson.signatureIntegrity, 'valid');
  assert.ok(analyzePublicJson.signedEnvelope?.jti);

  // Step 5: Teacher retrieves submissions & verifies signature over HTTPS (Option A)
  const listResp = await fetch(`${baseUrl}/api/submissions`, {
    headers: { Authorization: `Bearer ${TEACHER_TOKEN}` },
  });
  assert.equal(listResp.status, 200);
  const listJson = (await listResp.json()) as { submissions: any[] };
  const fetched = listJson.submissions.find((s) => s.id === `${createdSessionId}_stu_e2e_001`);
  assert.ok(fetched);
  assert.equal('trustedAnalysis' in fetched, false);
  assert.equal('analysisStatus' in fetched, false);

  const verifyResp = await fetch(
    `${baseUrl}/api/submissions/${encodeURIComponent(fetched.id)}/verify-analysis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEACHER_TOKEN}`,
      },
      body: JSON.stringify({
        submission: fetched,
        consumeReplayNonce: true,
      }),
    }
  );
  assert.equal(verifyResp.status, 200);
  const verifyJson = (await verifyResp.json()) as any;
  assert.equal(verifyJson.valid, true);
  assert.equal(verifyJson.signatureIntegrity, 'valid');
  assert.equal(verifyJson.answersHashMatch, true);
  assert.equal(verifyJson.analysisHashMatch, true);
  assert.ok(verifyJson.contentTruthNote);
});

test('Middleware order enforces per-UID aiRateLimiter quota on /api/submissions/analyze-public after student auth', async () => {
  // maxPerUid is 15; verify 16th call for same student UID hits 429 BEFORE maxPerIp=25
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`${baseUrl}/api/submissions/analyze-public`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RATE_TEST_STUDENT_TOKEN}`,
        'X-Firebase-AppCheck': VALID_APPCHECK,
      },
      body: JSON.stringify({
        sessionId: 'E2E101',
        answers: { philosophyMeaning: `إجابة رقم ${i}` },
      }),
    });
    assert.equal(r.status, 200);
  }
  const blocked = await fetch(`${baseUrl}/api/submissions/analyze-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RATE_TEST_STUDENT_TOKEN}`,
      'X-Firebase-AppCheck': VALID_APPCHECK,
    },
    body: JSON.stringify({
      sessionId: 'E2E101',
      answers: { philosophyMeaning: 'طلب متجاوز للحصة' },
    }),
  });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get('retry-after'));
});

test('JtiReplayCache volatile memory boundaries: TTL expiration & maxEntries eviction', () => {
  const cache = new JtiReplayCache(3);
  const t0 = 1_700_000_000_000;
  assert.equal(cache.consume('jti-1', 1000, t0), true);
  assert.equal(cache.consume('jti-1', 1000, t0 + 500), false); // blocked within TTL
  assert.equal(cache.consume('jti-1', 1000, t0 + 1001), true); // expired after TTL -> reusable!

  // Eviction when maxEntries=3 exceeded
  assert.equal(cache.consume('jti-2', 60_000, t0 + 1002), true);
  assert.equal(cache.consume('jti-3', 60_000, t0 + 1003), true);
  assert.equal(cache.consume('jti-4', 60_000, t0 + 1004), true); // triggers eviction of oldest entry
  assert.equal(cache.has('jti-1', t0 + 1004), false);
});
