/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalSignaturePayload,
  canonicalJson,
  computeSha256Hex,
  JtiReplayCache,
  signAnalysisEnvelope,
  verifyAnalysisEnvelope,
} from '../src/server/canonicalSigning.ts';

const TEST_SECRET = 'UnitTestHmacSecretKey_AtLeast32CharsLong!';

test('canonicalJson produces identical output regardless of key order and strips undefined object props', () => {
  const a = { z: 1, a: { d: true, b: -0, c: undefined }, list: [3, undefined, { y: 'y', x: 'x' }] };
  const b = { a: { b: 0, d: true }, list: [3, null, { x: 'x', y: 'y' }], z: 1 };

  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(computeSha256Hex(a), computeSha256Hex(b));
});

test('buildCanonicalSignaturePayload keeps deterministic field order and exact types', () => {
  const payload = buildCanonicalSignaturePayload({
    schemaVersion: 1,
    submissionId: 'S1_stu1',
    sessionId: 'S1',
    studentAuthUid: 'stu1',
    answersHash: 'a'.repeat(64),
    analysisHash: 'b'.repeat(64),
    signedAt: '2026-11-23T10:00:00.000Z',
    jti: 'nonce123',
  });
  const parsed = JSON.parse(payload);
  assert.deepEqual(Object.keys(parsed), [
    'analysisHash',
    'answersHash',
    'jti',
    'schemaVersion',
    'sessionId',
    'signedAt',
    'studentAuthUid',
    'submissionId',
  ]);
});

test('signAnalysisEnvelope + verifyAnalysisEnvelope validates authentic envelope and rejects tampering/replay', () => {
  const replayCache = new JtiReplayCache();
  const answers = { philosophyMeaning: 'تفكير نقدي في الوجود', expectation: 'متحمس' };
  const analysis = {
    classification: 'تفكير نقدي',
    metrics: { cognitiveFear: 10, cognitiveCuriosity: 85, shallowThinking: 15, criticalThinking: 88 },
  };
  const nowMs = Date.parse('2026-11-23T12:00:00.000Z');
  const envelope = signAnalysisEnvelope({
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis,
    analysisOrigin: 'gemini',
    signedAt: '2026-11-23T11:55:00.000Z',
    jti: 'jti-unique-001',
    secret: TEST_SECRET,
  });

  // 1. Valid verification (non-consuming check first)
  const peekOk = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers: { expectation: 'متحمس', philosophyMeaning: 'تفكير نقدي في الوجود' }, // re-ordered keys still valid!
    analysis,
    consumeReplayNonce: false,
    replayCache,
    nowMs,
    secret: TEST_SECRET,
  });
  assert.equal(peekOk.valid, true);
  assert.equal(peekOk.signatureIntegrity, 'valid');
  assert.equal(peekOk.answersHashMatch, true);
  assert.equal(peekOk.analysisHashMatch, true);

  // 2. Tampered answers
  const tamperedAnswers = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers: { ...answers, philosophyMeaning: 'تم التعديل' },
    analysis,
    consumeReplayNonce: false,
    replayCache,
    nowMs,
    secret: TEST_SECRET,
  });
  assert.equal(tamperedAnswers.valid, false);
  assert.equal(tamperedAnswers.signatureIntegrity, 'tampered');
  assert.equal(tamperedAnswers.answersHashMatch, false);

  // 3. Tampered analysis
  const tamperedAnalysis = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis: { ...analysis, classification: 'خوف معرفي' },
    consumeReplayNonce: false,
    replayCache,
    nowMs,
    secret: TEST_SECRET,
  });
  assert.equal(tamperedAnalysis.valid, false);
  assert.equal(tamperedAnalysis.signatureIntegrity, 'tampered');
  assert.equal(tamperedAnalysis.analysisHashMatch, false);

  // 4. Non-deterministic submissionId check
  const wrongId = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'OTHER_ID',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis,
    consumeReplayNonce: false,
    replayCache,
    nowMs,
    secret: TEST_SECRET,
  });
  assert.equal(wrongId.valid, false);
  assert.equal(wrongId.signatureIntegrity, 'tampered');

  // 5. Wrong HMAC secret
  const wrongKey = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis,
    consumeReplayNonce: false,
    replayCache,
    nowMs,
    secret: 'DifferentSecretKeyThatShouldFailVerification!',
  });
  assert.equal(wrongKey.valid, false);
  assert.equal(wrongKey.signatureIntegrity, 'invalid');

  // 6. Expired timestamp
  const expired = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis,
    consumeReplayNonce: false,
    replayCache,
    nowMs: nowMs + 48 * 3600 * 1000,
    secret: TEST_SECRET,
  });
  assert.equal(expired.valid, false);
  assert.equal(expired.signatureIntegrity, 'expired');

  // 7. Replay protection (consumeReplayNonce: true)
  const firstConsume = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis,
    consumeReplayNonce: true,
    replayCache,
    nowMs,
    secret: TEST_SECRET,
  });
  assert.equal(firstConsume.valid, true);

  const secondReplay = verifyAnalysisEnvelope({
    envelope,
    submissionId: 'SESS1_stuABC',
    sessionId: 'SESS1',
    studentAuthUid: 'stuABC',
    answers,
    analysis,
    consumeReplayNonce: true,
    replayCache,
    nowMs,
    secret: TEST_SECRET,
  });
  assert.equal(secondReplay.valid, false);
  assert.equal(secondReplay.signatureIntegrity, 'replayed');
  assert.equal(secondReplay.replayed, true);
});
