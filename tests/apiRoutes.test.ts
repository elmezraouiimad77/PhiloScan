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

// Configure isolated environment BEFORE importing server.ts
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'philoscan-test-data-'));
process.env.PHILOSCAN_DISABLE_AUTO_LISTEN = '1';
process.env.PHILOSCAN_DATA_DIR = tempDataDir;
process.env.ADMIN_SECRET_KEY = 'TestAdminSecretKeyValue_Strict_123456';
process.env.ANALYSIS_HMAC_SECRET = 'TestAnalysisHmacSecret_Strict_123456789';

// Seed isolated test fixtures (never touches /data/*.json)
fs.writeFileSync(
  path.join(tempDataDir, 'teachers.json'),
  JSON.stringify(
    [
      {
        id: 'TCH-ACTIVE',
        uid: 'teacher_uid_active',
        fullName: 'أستاذ تجريبي نشط',
        email: 'active.teacher@example.ma',
        school: 'ثانوية التجربة',
        regionalAcademy: 'الرباط سلا القنيطرة',
        province: 'الرباط',
        createdAt: '2026-11-23T08:00:00.000Z',
        isDisabled: false,
      },
      {
        id: 'TCH-DISABLED',
        uid: 'teacher_uid_disabled',
        fullName: 'أستاذ معطل',
        email: 'disabled.teacher@example.ma',
        school: 'ثانوية التجربة',
        regionalAcademy: 'الرباط سلا القنيطرة',
        province: 'الرباط',
        createdAt: '2026-11-23T08:00:00.000Z',
        isDisabled: true,
      },
    ],
    null,
    2
  )
);
fs.writeFileSync(
  path.join(tempDataDir, 'sessions.json'),
  JSON.stringify(
    [
      {
        sessionId: 'SESS99',
        ownerRef: 'own_0123456789abcdef0123456789abcdef',
        teacherId: 'teacher_uid_active',
        teacherEmail: 'active.teacher@example.ma',
        institution: 'ثانوية التجربة',
        level: 'جذع مشترك',
        stream: 'آداب وعلوم إنسانية',
        classNumber: '1',
        title: 'جلسة اختبارية',
        province: 'الرباط',
        customWeights: { cognitiveFear: 1.5 },
        createdAt: '2026-11-23T08:00:00.000Z',
      },
    ],
    null,
    2
  )
);
fs.writeFileSync(path.join(tempDataDir, 'submissions.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'forms.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'reports.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'notifications.json'), JSON.stringify([], null, 2));
fs.writeFileSync(path.join(tempDataDir, 'notification_settings.json'), JSON.stringify([], null, 2));

const { app, setSecurityTestHooks, resetSecurityTestHooks } = await import('../server.ts');

let server: http.Server;
let baseUrl = '';

const TEACHER_TOKEN = 'header.payload.activeTeacher';
const DISABLED_TEACHER_TOKEN = 'header.payload.disabledTeacher';
const STUDENT_TOKEN = 'header.payload.anonStudent';
const VALID_APPCHECK = 'valid.appcheck.jwt';

test.before(async () => {
  setSecurityTestHooks({
    verifyIdToken: async (token: string) => {
      if (token === TEACHER_TOKEN) {
        return {
          uid: 'teacher_uid_active',
          email: 'active.teacher@example.ma',
          emailVerified: true,
          signInProvider: 'google.com',
          isAnonymous: false,
          authTime: Math.floor(Date.now() / 1000) - 30,
          issuedAt: Math.floor(Date.now() / 1000) - 10,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          rawClaims: {},
        };
      }
      if (token === DISABLED_TEACHER_TOKEN) {
        return {
          uid: 'teacher_uid_disabled',
          email: 'disabled.teacher@example.ma',
          emailVerified: true,
          signInProvider: 'password',
          isAnonymous: false,
          authTime: Math.floor(Date.now() / 1000) - 30,
          issuedAt: Math.floor(Date.now() / 1000) - 10,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          rawClaims: {},
        };
      }
      if (token === STUDENT_TOKEN) {
        return {
          uid: 'stu_anon_uid_001',
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
      return { valid: false, reason: 'Invalid or missing test App Check token' };
    },
    checkTeacherActive: async (uid) => {
      if (uid === 'teacher_uid_active') return { exists: true, isDisabled: false };
      if (uid === 'teacher_uid_disabled') return { exists: true, isDisabled: true };
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

test('GET /api/sessions/:id sanitizes public metadata and strips teacherEmail/teacherId/customWeights', async () => {
  const resp = await fetch(`${baseUrl}/api/sessions/SESS99`);
  assert.equal(resp.status, 200);
  const data = (await resp.json()) as { session: Record<string, any> };
  assert.equal(data.session.sessionId, 'SESS99');
  assert.equal('teacherEmail' in data.session, false);
  assert.equal('teacherId' in data.session, false);
  assert.equal('customWeights' in data.session, false);
});

test('Protected endpoints reject unauthenticated callers and disabled teachers', async () => {
  const reportsNoAuth = await fetch(`${baseUrl}/api/reports`);
  assert.equal(reportsNoAuth.status, 403);

  const formsNoAuth = await fetch(`${baseUrl}/api/forms`);
  assert.equal(formsNoAuth.status, 401);

  const chatNoAuth = await fetch(`${baseUrl}/api/ai/teacher-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ sender: 'user', text: 'مرحباً' }] }),
  });
  assert.equal(chatNoAuth.status, 401);

  const disabledAccess = await fetch(`${baseUrl}/api/forms`, {
    headers: { Authorization: `Bearer ${DISABLED_TEACHER_TOKEN}` },
  });
  assert.equal(disabledAccess.status, 403);
});

test('Option A student analyze-public + teacher verify-analysis enforce App Check, HMAC integrity, and replay defense', async () => {
  // Missing App Check -> 403
  const missingAppCheck = await fetch(`${baseUrl}/api/submissions/analyze-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STUDENT_TOKEN}`,
    },
    body: JSON.stringify({ sessionId: 'SESS99', answers: { philosophyMeaning: 'تساؤل نقدي' } }),
  });
  assert.equal(missingAppCheck.status, 403);

  // Missing Student token -> 401
  const missingStudentAuth = await fetch(`${baseUrl}/api/submissions/analyze-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': VALID_APPCHECK,
    },
    body: JSON.stringify({ sessionId: 'SESS99', answers: { philosophyMeaning: 'تساؤل نقدي' } }),
  });
  assert.equal(missingStudentAuth.status, 401);

  // Valid student request -> 200 signed Option A envelope
  const answers = { philosophyMeaning: 'الفلسفة بحث عقلاني وتفكير نقدي في الوجود والقيم' };
  const analyzeResp = await fetch(`${baseUrl}/api/submissions/analyze-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${STUDENT_TOKEN}`,
      'X-Firebase-AppCheck': VALID_APPCHECK,
    },
    body: JSON.stringify({ sessionId: 'SESS99', answers }),
  });
  assert.equal(analyzeResp.status, 200);
  const analyzeBody = (await analyzeResp.json()) as any;
  assert.equal(analyzeBody.success, true);
  assert.equal(analyzeBody.submissionId, 'SESS99_stu_anon_uid_001');
  assert.equal(analyzeBody.signatureIntegrity, 'valid');
  assert.ok(analyzeBody.signedEnvelope?.hmac);
  assert.ok(analyzeBody.contentTruthNote);

  // Tampered analysis verification -> 422
  const tamperedVerify = await fetch(
    `${baseUrl}/api/submissions/${encodeURIComponent(analyzeBody.submissionId)}/verify-analysis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEACHER_TOKEN}`,
      },
      body: JSON.stringify({
        envelope: analyzeBody.signedEnvelope,
        submissionId: analyzeBody.submissionId,
        sessionId: 'SESS99',
        studentAuthUid: 'stu_anon_uid_001',
        answers,
        analysis: { ...analyzeBody.analysis, classification: 'خوف معرفي' },
        consumeReplayNonce: false,
      }),
    }
  );
  assert.equal(tamperedVerify.status, 422);
  const tamperedJson = (await tamperedVerify.json()) as any;
  assert.equal(tamperedJson.signatureIntegrity, 'tampered');

  // Authentic verification consuming jti -> 200, second call -> 409 replay
  const validVerify = await fetch(
    `${baseUrl}/api/submissions/${encodeURIComponent(analyzeBody.submissionId)}/verify-analysis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEACHER_TOKEN}`,
      },
      body: JSON.stringify({
        envelope: analyzeBody.signedEnvelope,
        submissionId: analyzeBody.submissionId,
        sessionId: 'SESS99',
        studentAuthUid: 'stu_anon_uid_001',
        answers,
        analysis: analyzeBody.analysis,
        consumeReplayNonce: true,
      }),
    }
  );
  assert.equal(validVerify.status, 200);

  const replayVerify = await fetch(
    `${baseUrl}/api/submissions/${encodeURIComponent(analyzeBody.submissionId)}/verify-analysis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TEACHER_TOKEN}`,
      },
      body: JSON.stringify({
        envelope: analyzeBody.signedEnvelope,
        submissionId: analyzeBody.submissionId,
        sessionId: 'SESS99',
        studentAuthUid: 'stu_anon_uid_001',
        answers,
        analysis: analyzeBody.analysis,
        consumeReplayNonce: true,
      }),
    }
  );
  assert.equal(replayVerify.status, 409);
  const replayJson = (await replayVerify.json()) as any;
  assert.equal(replayJson.signatureIntegrity, 'replayed');
});

test('POST /api/reports requires auth and enforces strict imageUrl rules', async () => {
  const unauthReport = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType: 'bug', title: 'اختبار', description: 'وصف تجريبي' }),
  });
  assert.equal(unauthReport.status, 401);

  const badImg = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEACHER_TOKEN}`,
    },
    body: JSON.stringify({
      reportType: 'bug',
      title: 'اختبار',
      description: 'وصف تجريبي كافٍ',
      imageUrl: 'javascript:alert(1)',
    }),
  });
  assert.equal(badImg.status, 400);

  const goodReport = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TEACHER_TOKEN}`,
    },
    body: JSON.stringify({
      reportType: 'bug',
      title: 'اختبار سليم',
      description: 'وصف تجريبي سليم',
      imageUrl: 'https://example.ma/screenshot.png',
    }),
  });
  assert.equal(goodReport.status, 200);
});

test('SSE /api/realtime/teacher-stream rejects tokenless requests and streams with Authorization header', async () => {
  const noAuth = await fetch(`${baseUrl}/api/realtime/teacher-stream?admin_token=fake`);
  assert.equal(noAuth.status, 401);

  const controller = new AbortController();
  const sseResp = await fetch(`${baseUrl}/api/realtime/teacher-stream`, {
    headers: { Authorization: `Bearer ${TEACHER_TOKEN}` },
    signal: controller.signal,
  });
  assert.equal(sseResp.status, 200);
  assert.match(sseResp.headers.get('content-type') || '', /text\/event-stream/);
  controller.abort();
});
