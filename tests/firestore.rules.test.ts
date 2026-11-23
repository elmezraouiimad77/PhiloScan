/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'project-ae3ca3a5-d34f-42a5-a4a';
const RULES_PATH = path.resolve(process.cwd(), 'DRAFT_firestore.rules');

let testEnv: RulesTestEnvironment;

function parseEmulatorHost(): { host?: string; port?: number } {
  const raw = (process.env.FIRESTORE_EMULATOR_HOST || '').trim();
  if (!raw) return {};
  const [host, portStr] = raw.split(':');
  const port = Number(portStr);
  return host && Number.isFinite(port) ? { host, port } : {};
}

test.before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run via `firebase emulators:exec --only firestore "npx tsx --test tests/firestore.rules.test.ts"`.'
    );
  }
  const { host, port } = parseEmulatorHost();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      ...(host && port ? { host, port } : {}),
    },
  });
});

test.after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

test.beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

async function seedTeacher(uid: string, email: string, isDisabled = false, role: 'teacher' | 'admin' = 'teacher') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'teachers', uid), {
      uid,
      email,
      fullName: `Teacher ${uid}`,
      role,
      isDisabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
}

async function seedSessionBundle(sessionId: string, teacherId: string, ownerRef: string, isActive = true) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sessions', sessionId), {
      sessionId,
      ownerRef,
      teacherId,
      teacherEmail: `${teacherId}@example.ma`,
      class: '1',
      isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'publicSessions', sessionId), {
      sessionId,
      ownerRef,
      class: '1',
      isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'ownerLinks', ownerRef), {
      ownerRef,
      teacherId,
      sessionId,
      createdAt: new Date().toISOString(),
    });
  });
}

test('1. /admins locks all client writes and isAdmin fails closed if teachers/{uid} is disabled or email unverified', async () => {
  const adminUnverified = testEnv.authenticatedContext('adm_unv', {
    email: 'phillofikr@gmail.com',
    email_verified: false,
    firebase: { sign_in_provider: 'google.com' },
  });
  await assertFails(
    setDoc(doc(adminUnverified.firestore(), 'config', 'landingPage'), { heroTitle: 'Unverified' })
  );

  const adminVerified = testEnv.authenticatedContext('adm_1', {
    email: 'phillofikr@gmail.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

  // Client writes to /admins/* must always fail
  await assertFails(
    setDoc(doc(adminVerified.firestore(), 'admins', 'adm_1'), {
      uid: 'adm_1',
      email: 'phillofikr@gmail.com',
      isDisabled: false,
    })
  );

  // Admin allowed to write config/landingPage when active
  await assertSucceeds(
    setDoc(doc(adminVerified.firestore(), 'config', 'landingPage'), { heroTitle: 'PhiloScan Active' })
  );
  // Guest allowed to get config/landingPage, denied write
  const guest = testEnv.unauthenticatedContext();
  await assertSucceeds(getDoc(doc(guest.firestore(), 'config', 'landingPage')));
  await assertFails(setDoc(doc(guest.firestore(), 'config', 'landingPage'), { heroTitle: 'Hacked' }));

  // Disabled teacher profile fails closed even for bootstrap admin email
  await seedTeacher('adm_1', 'phillofikr@gmail.com', true, 'admin');
  await assertFails(
    setDoc(doc(adminVerified.firestore(), 'config', 'landingPage'), { heroTitle: 'Disabled Admin' })
  );
});

test('2. /teachers enforces strict self-registration, safe self-update only, and rejects disabled/escalation', async () => {
  const teacherCtx = testEnv.authenticatedContext('tch_1', {
    email: 'prof@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  });
  const db = teacherCtx.firestore();

  // Deny admin role escalation on self-registration
  await assertFails(
    setDoc(doc(db, 'teachers', 'tch_1'), {
      uid: 'tch_1',
      email: 'prof@example.ma',
      fullName: 'الأستاذ أحمد',
      role: 'admin',
      isDisabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Deny creating profile for another UID
  await assertFails(
    setDoc(doc(db, 'teachers', 'tch_other'), {
      uid: 'tch_other',
      email: 'prof@example.ma',
      fullName: 'الأستاذ أحمد',
      role: 'teacher',
      isDisabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Allow valid self-registration
  await assertSucceeds(
    setDoc(doc(db, 'teachers', 'tch_1'), {
      uid: 'tch_1',
      email: 'prof@example.ma',
      fullName: 'الأستاذ أحمد',
      role: 'teacher',
      isDisabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Allow reading own profile, deny reading another teacher's profile
  await seedTeacher('tch_2', 'other@example.ma', false);
  await assertSucceeds(getDoc(doc(db, 'teachers', 'tch_1')));
  await assertFails(getDoc(doc(db, 'teachers', 'tch_2')));

  // Allow safe field update, deny self-changing role or isDisabled
  await assertSucceeds(
    updateDoc(doc(db, 'teachers', 'tch_1'), {
      school: 'ثانوية ابن رشد',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(db, 'teachers', 'tch_1'), {
      role: 'admin',
      updatedAt: serverTimestamp(),
    })
  );
});

test('3. Atomic session + publicSessions + ownerLinks protects PII from guests/students/other teachers', async () => {
  await seedTeacher('tch_1', 'prof1@example.ma', false);
  await seedTeacher('tch_2', 'prof2@example.ma', false);

  const tch1Ctx = testEnv.authenticatedContext('tch_1', {
    email: 'prof1@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  const tch2Ctx = testEnv.authenticatedContext('tch_2', {
    email: 'prof2@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

  const ownerRef = 'own_0123456789abcdef0123456789abcdef';
  const db1 = tch1Ctx.firestore();
  const batch = writeBatch(db1);
  batch.set(doc(db1, 'sessions', 'SESS1'), {
    sessionId: 'SESS1',
    ownerRef,
    teacherId: 'tch_1',
    teacherEmail: 'prof1@example.ma',
    class: '1',
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db1, 'publicSessions', 'SESS1'), {
    sessionId: 'SESS1',
    ownerRef,
    class: '1',
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db1, 'ownerLinks', ownerRef), {
    ownerRef,
    teacherId: 'tch_1',
    sessionId: 'SESS1',
    createdAt: serverTimestamp(),
  });
  await assertSucceeds(batch.commit());

  // Deny writing publicSessions with PII field teacherEmail
  await assertFails(
    setDoc(doc(db1, 'publicSessions', 'SESS1'), {
      sessionId: 'SESS1',
      ownerRef,
      teacherEmail: 'leak@example.ma',
      class: '1',
      isActive: true,
      updatedAt: serverTimestamp(),
    })
  );

  const guest = testEnv.unauthenticatedContext();
  const anon = testEnv.authenticatedContext('stu_1', { firebase: { sign_in_provider: 'anonymous' } });

  // Allowed: single-doc get on publicSessions
  await assertSucceeds(getDoc(doc(guest.firestore(), 'publicSessions', 'SESS1')));
  await assertSucceeds(getDoc(doc(anon.firestore(), 'publicSessions', 'SESS1')));

  // Denied: list publicSessions, read private sessions, read ownerLinks, or cross-teacher read
  await assertFails(getDocs(collection(guest.firestore(), 'publicSessions')));
  await assertFails(getDoc(doc(guest.firestore(), 'sessions', 'SESS1')));
  await assertFails(getDoc(doc(anon.firestore(), 'sessions', 'SESS1')));
  await assertFails(getDoc(doc(tch2Ctx.firestore(), 'sessions', 'SESS1')));
  await assertFails(getDoc(doc(guest.firestore(), 'ownerLinks', ownerRef)));
});

test('4. /presence and /violationEvents enforce bounded seq 1..50, immutability, and active session gate', async () => {
  await seedTeacher('tch_1', 'prof1@example.ma', false);
  const ownerRef = 'own_0123456789abcdef0123456789abcdef';
  await seedSessionBundle('SESS1', 'tch_1', ownerRef, true);

  const stu1 = testEnv.authenticatedContext('stu_1', { firebase: { sign_in_provider: 'anonymous' } });
  const stu2 = testEnv.authenticatedContext('stu_2', { firebase: { sign_in_provider: 'anonymous' } });
  const tch1 = testEnv.authenticatedContext('tch_1', {
    email: 'prof1@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

  // Allowed presence create/update for own UID
  await assertSucceeds(
    setDoc(doc(stu1.firestore(), 'sessions', 'SESS1', 'presence', 'stu_1'), {
      sessionId: 'SESS1',
      studentAuthUid: 'stu_1',
      studentLabel: 'تلميذ 1',
      status: 'active',
      violationCount: 1,
      lastHeartbeatAt: serverTimestamp(),
    })
  );
  // Denied spoofing another student's presence
  await assertFails(
    setDoc(doc(stu2.firestore(), 'sessions', 'SESS1', 'presence', 'stu_1'), {
      sessionId: 'SESS1',
      studentAuthUid: 'stu_2',
      status: 'active',
      lastHeartbeatAt: serverTimestamp(),
    })
  );

  // Allowed immutable violation event seq=1
  await assertSucceeds(
    setDoc(doc(stu1.firestore(), 'sessions', 'SESS1', 'violationEvents', 'stu_1_1'), {
      seq: 1,
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      type: 'tab_switch',
      advisoryOnly: true,
      occurredAt: serverTimestamp(),
    })
  );
  // Denied out-of-bounds seq=51 and updates on violationEvents
  await assertFails(
    setDoc(doc(stu1.firestore(), 'sessions', 'SESS1', 'violationEvents', 'stu_1_51'), {
      seq: 51,
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      type: 'tab_switch',
      advisoryOnly: true,
      occurredAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(stu1.firestore(), 'sessions', 'SESS1', 'violationEvents', 'stu_1_1'), {
      details: 'edited',
    })
  );

  // Owner teacher allowed to list violationEvents
  await assertSucceeds(getDocs(collection(tch1.firestore(), 'sessions', 'SESS1', 'violationEvents')));
});

test('5. /submissions enforces Option A ban on trustedAnalysis/analysisStatus, deterministic ID, and RBAC', async () => {
  await seedTeacher('tch_1', 'prof1@example.ma', false);
  await seedTeacher('tch_2', 'prof2@example.ma', false);
  const ownerRef = 'own_0123456789abcdef0123456789abcdef';
  await seedSessionBundle('SESS1', 'tch_1', ownerRef, true);

  const stu1 = testEnv.authenticatedContext('stu_1', { firebase: { sign_in_provider: 'anonymous' } });
  const stu2 = testEnv.authenticatedContext('stu_2', { firebase: { sign_in_provider: 'anonymous' } });
  const tch1 = testEnv.authenticatedContext('tch_1', {
    email: 'prof1@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  const tch2 = testEnv.authenticatedContext('tch_2', {
    email: 'prof2@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });

  // Denied: browser student writing trustedAnalysis or analysisStatus (Option A invariant)
  await assertFails(
    setDoc(doc(stu1.firestore(), 'submissions', 'SESS1_stu_1'), {
      studentName: 'سلمى',
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      ownerRef,
      answers: { q1: 'نعم' },
      analysis: { classification: 'تفكير نقدي' },
      trustedAnalysis: { classification: 'forged' },
      submittedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(stu1.firestore(), 'submissions', 'SESS1_stu_1'), {
      studentName: 'سلمى',
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      ownerRef,
      answers: { q1: 'نعم' },
      analysis: { classification: 'تفكير نقدي' },
      analysisStatus: 'verified',
      submittedAt: serverTimestamp(),
    })
  );

  // Denied: non-deterministic ID or student spoofing teacherId
  await assertFails(
    setDoc(doc(stu1.firestore(), 'submissions', 'RANDOM_ID'), {
      studentName: 'سلمى',
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      ownerRef,
      answers: { q1: 'نعم' },
      analysis: { classification: 'تفكير نقدي' },
      submittedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(stu1.firestore(), 'submissions', 'SESS1_stu_1'), {
      studentName: 'سلمى',
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      ownerRef,
      teacherId: 'tch_1',
      answers: { q1: 'نعم' },
      analysis: { classification: 'تفكير نقدي' },
      submittedAt: serverTimestamp(),
    })
  );

  // Allowed: valid Option A deterministic student submission
  await assertSucceeds(
    setDoc(doc(stu1.firestore(), 'submissions', 'SESS1_stu_1'), {
      studentName: 'سلمى',
      studentAuthUid: 'stu_1',
      sessionId: 'SESS1',
      ownerRef,
      answers: { q1: 'التفلسف مساءلة نقدية للبداهات' },
      analysis: { classification: 'تفكير نقدي' },
      submittedAt: serverTimestamp(),
    })
  );

  // Denied: teacher trying to inject trustedAnalysis during update or cross-teacher read
  await assertFails(
    updateDoc(doc(tch1.firestore(), 'submissions', 'SESS1_stu_1'), {
      trustedAnalysis: { classification: 'forged' },
      cloudSyncedAt: serverTimestamp(),
    })
  );
  await assertFails(getDoc(doc(stu2.firestore(), 'submissions', 'SESS1_stu_1')));
  await assertFails(getDoc(doc(tch2.firestore(), 'submissions', 'SESS1_stu_1')));

  // Allowed: student reads own submission; owner teacher reads & updates pedagogical notes
  await assertSucceeds(getDoc(doc(stu1.firestore(), 'submissions', 'SESS1_stu_1')));
  await assertSucceeds(getDoc(doc(tch1.firestore(), 'submissions', 'SESS1_stu_1')));
  await assertSucceeds(
    updateDoc(doc(tch1.firestore(), 'submissions', 'SESS1_stu_1'), {
      teacherNotes: 'ملاحظة بيداغوجية موثقة',
      overriddenClassification: 'فضول معرفي',
      cloudSyncedAt: serverTimestamp(),
    })
  );
});

test('6. /forms, /reports, and /users/{uid}/notifications enforce ownership, template reads, and strict imageUrl', async () => {
  await seedTeacher('tch_1', 'prof1@example.ma', false);
  await seedTeacher('tch_2', 'prof2@example.ma', false);

  const tch1 = testEnv.authenticatedContext('tch_1', {
    email: 'prof1@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  const tch2 = testEnv.authenticatedContext('tch_2', {
    email: 'prof2@example.ma',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  });
  const guest = testEnv.unauthenticatedContext();

  // Forms: owner teacher creates private form; guest cannot read private form; teacher cannot create template
  await assertSucceeds(
    setDoc(doc(tch1.firestore(), 'forms', 'FRM_1'), {
      formId: 'FRM_1',
      title: 'استمارة الحرية',
      teacherId: 'tch_1',
      status: 'published',
      isTemplate: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(getDoc(doc(guest.firestore(), 'forms', 'FRM_1')));
  await assertFails(
    setDoc(doc(tch1.firestore(), 'forms', 'FRM_TPL'), {
      formId: 'FRM_TPL',
      title: 'نموذج رسمي مزيف',
      teacherId: 'tch_1',
      status: 'published',
      isTemplate: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Reports: unauthenticated denied; valid teacher report with https:// allowed; javascript: imageUrl denied
  await assertFails(
    setDoc(doc(guest.firestore(), 'reports', 'REP_0'), {
      id: 'REP_0',
      reporterUid: 'guest',
      description: 'بلاغ غير مصرح',
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(tch1.firestore(), 'reports', 'REP_BAD'), {
      id: 'REP_BAD',
      reporterUid: 'tch_1',
      description: 'بلاغ بصورة خبيثة',
      imageUrl: 'javascript:alert(1)',
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(tch1.firestore(), 'reports', 'REP_1'), {
      id: 'REP_1',
      reporterUid: 'tch_1',
      description: 'ملاحظة تقنية حول العرض',
      imageUrl: 'https://example.ma/screen.png',
      status: 'pending',
      createdAt: serverTimestamp(),
    })
  );
  await assertFails(
    getDocs(query(collection(tch2.firestore(), 'reports'), where('reporterUid', '==', 'tch_2')))
      .then(() => getDoc(doc(tch2.firestore(), 'reports', 'REP_1')))
  );
  await assertFails(deleteDoc(doc(tch1.firestore(), 'reports', 'REP_1')));

  // Notifications: scoped strictly to owner teacher
  await assertSucceeds(
    setDoc(doc(tch1.firestore(), 'users', 'tch_1', 'notifications', 'N1'), {
      id: 'N1',
      teacherId: 'tch_1',
      teacherEmail: 'prof1@example.ma',
      title: 'تنبيه بيداغوجي',
      indicatorType: 'critical_thinking_difficulty',
      indicatorLabel: 'صعوبة التفكير النقدي',
      category: 'class_alert',
      sessionId: 'SESS1',
      sessionTitle: 'جلسة 1',
      classNameLabel: 'القسم 1',
      gradeLevel: 'جذع مشترك',
      summary: 'ملخص',
      priority: 'مهم',
      recommendation: 'توصية',
      reportPath: '/report',
      isRead: false,
      createdAt: new Date().toISOString(),
    })
  );
  await assertFails(getDoc(doc(tch2.firestore(), 'users', 'tch_1', 'notifications', 'N1')));
});
