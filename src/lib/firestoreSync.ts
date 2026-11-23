/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  ensureStudentAnonymousAuth,
  generateOwnerRef,
  handleFirestoreError,
  OperationType,
  studentAuth,
  studentDb,
} from './firebase';
import {
  DiagnosticSession,
  PedagogicalNotification,
  StudentSubmission,
  TeacherNotificationSettings,
  ViolationEventRecord,
} from '../types';

function sanitizeId(raw: string): string {
  return (raw || 'id_' + Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

/**
 * Ensures a verified Firebase user has a valid /teachers/{uid} profile adhering to strict self-registration rules.
 */
export async function ensureTeacherProfileInFirestore(profile: {
  fullName?: string;
  school?: string;
  regionalAcademy?: string;
  province?: string;
  specialty?: string;
  yearsOfExperience?: string | number;
}): Promise<{ exists: boolean; isDisabled: boolean; role: string }> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous || !user.emailVerified || !user.email) {
    return { exists: false, isDisabled: false, role: 'teacher' };
  }

  try {
    const teacherRef = doc(db, 'teachers', user.uid);
    const snap = await getDoc(teacherRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      return {
        exists: true,
        isDisabled: Boolean(data.isDisabled),
        role: String(data.role || 'teacher'),
      };
    }

    const parsedYears =
      profile.yearsOfExperience !== undefined && profile.yearsOfExperience !== ''
        ? Math.max(0, Math.min(80, Math.round(Number(profile.yearsOfExperience) || 0)))
        : undefined;

    const payload: Record<string, any> = {
      uid: user.uid,
      email: user.email.toLowerCase().trim(),
      fullName: String(profile.fullName || user.displayName || user.email.split('@')[0]).slice(0, 256),
      role: 'teacher',
      isDisabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (profile.school) payload.school = String(profile.school).slice(0, 256);
    if (profile.regionalAcademy) payload.regionalAcademy = String(profile.regionalAcademy).slice(0, 256);
    if (profile.province) payload.province = String(profile.province).slice(0, 128);
    if (profile.specialty) payload.specialty = String(profile.specialty).slice(0, 128);
    if (parsedYears !== undefined && !Number.isNaN(parsedYears)) payload.yearsExperience = parsedYears;

    await setDoc(teacherRef, payload);
    return { exists: true, isDisabled: false, role: 'teacher' };
  } catch (err: any) {
    console.warn('Firestore teacher profile registration warning:', err?.message || err);
    return { exists: false, isDisabled: false, role: 'teacher' };
  }
}

/**
 * Mirrors a diagnostic session document atomically across:
 * 1) sessions/{sessionId} (private to owner teacher & admin)
 * 2) publicSessions/{sessionId} (sanitized public metadata with ownerRef, zero PII)
 * 3) ownerLinks/{ownerRef} (mapping ownerRef -> teacherId + sessionId on creation)
 */
export async function syncSessionToFirestore(session: DiagnosticSession): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const cleanId = sanitizeId(session.sessionId);

  try {
    const sessionRef = doc(db, 'sessions', cleanId);
    const publicRef = doc(db, 'publicSessions', cleanId);
    const existingSnap = await getDoc(sessionRef);
    const existingOwnerRef = existingSnap.exists() ? (existingSnap.data() as any)?.ownerRef : undefined;
    const ownerRef =
      typeof existingOwnerRef === 'string' && /^own_[a-f0-9]{32}$/.test(existingOwnerRef)
        ? existingOwnerRef
        : typeof session.ownerRef === 'string' && /^own_[a-f0-9]{32}$/.test(session.ownerRef)
        ? session.ownerRef
        : generateOwnerRef();

    const batch = writeBatch(db);

    const privatePayload: Record<string, any> = {
      sessionId: cleanId,
      ownerRef,
      teacherId: user.uid,
      teacherEmail: (session.teacherEmail || user.email || '').toLowerCase().trim(),
      institution: (session.institution || '').slice(0, 200),
      level: (session.level || '').slice(0, 100),
      stream: (session.stream || '').slice(0, 100),
      class: String(session.classNumber || '1').slice(0, 120),
      classNumber: String(session.classNumber || '1').slice(0, 40),
      title: (session.title || '').slice(0, 200),
      province: (session.province || '').slice(0, 120),
      isActive: !session.isFrozen,
      supervisedMode: Boolean(session.supervisedMode),
      formId: (session.formId || 'official-perceptions').slice(0, 120),
      formTitle: (session.formTitle || '').slice(0, 200),
      updatedAt: serverTimestamp(),
    };
    if (session.customWeights && typeof session.customWeights === 'object') {
      privatePayload.customWeights = session.customWeights;
    }

    const publicPayload: Record<string, any> = {
      sessionId: cleanId,
      ownerRef,
      title: (session.title || '').slice(0, 200),
      institution: (session.institution || '').slice(0, 200),
      level: (session.level || '').slice(0, 100),
      stream: (session.stream || '').slice(0, 100),
      class: String(session.classNumber || '1').slice(0, 120),
      classNumber: String(session.classNumber || '1').slice(0, 40),
      province: (session.province || '').slice(0, 120),
      isActive: !session.isFrozen,
      supervisedMode: Boolean(session.supervisedMode),
      formId: (session.formId || 'official-perceptions').slice(0, 120),
      formTitle: (session.formTitle || '').slice(0, 200),
      updatedAt: serverTimestamp(),
    };

    if (!existingSnap.exists()) {
      privatePayload.createdAt = serverTimestamp();
      publicPayload.createdAt = serverTimestamp();
      batch.set(sessionRef, privatePayload);
      batch.set(publicRef, publicPayload);
      batch.set(doc(db, 'ownerLinks', ownerRef), {
        ownerRef,
        teacherId: user.uid,
        sessionId: cleanId,
        createdAt: serverTimestamp(),
      });
    } else {
      batch.set(sessionRef, privatePayload, { merge: true });
      batch.set(publicRef, publicPayload, { merge: true });
    }

    await batch.commit();
    return true;
  } catch (error: any) {
    console.warn('Firestore session mirror warning:', error?.message || error);
    return false;
  }
}

/**
 * Mirrors a submission document to Firestore when the teacher is signed into Firebase Auth.
 * Under Option A, trustedAnalysis and analysisStatus are NEVER persisted to Firestore.
 */
export async function syncSubmissionToFirestore(submission: StudentSubmission): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const cleanSubId = sanitizeId(submission.id);
  const cleanSessionId = sanitizeId(submission.sessionId || submission.session_id || 'DEFAULT');
  const path = `submissions/${cleanSubId}`;

  try {
    const docRef = doc(db, 'submissions', cleanSubId);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const updatePayload: Record<string, any> = {
        studentName: (submission.studentName || submission.student_name || 'تلميذ').slice(0, 128),
        teacherNotes: (submission.teacherNotes || '').slice(0, 2000),
        overriddenClassification: submission.overriddenClassification || null,
        deliveryReceiptId: (submission.deliveryReceiptId || '').slice(0, 64),
        deliveredAt: String(submission.deliveredAt || submission.submittedAt || new Date().toISOString()).slice(0, 40),
        cloudSyncedAt: serverTimestamp(),
      };
      await updateDoc(docRef, updatePayload);
      return true;
    }

    let resolvedOwnerRef =
      typeof submission.ownerRef === 'string' && /^own_[a-f0-9]{32}$/.test(submission.ownerRef)
        ? submission.ownerRef
        : '';
    if (!resolvedOwnerRef) {
      const sessSnap = await getDoc(doc(db, 'sessions', cleanSessionId)).catch(() => null);
      const pubSnap = !sessSnap?.exists()
        ? await getDoc(doc(db, 'publicSessions', cleanSessionId)).catch(() => null)
        : null;
      const fromDoc = (sessSnap?.data() as any)?.ownerRef || (pubSnap?.data() as any)?.ownerRef;
      resolvedOwnerRef =
        typeof fromDoc === 'string' && /^own_[a-f0-9]{32}$/.test(fromDoc)
          ? fromDoc
          : generateOwnerRef();
    }

    const studentAuthUid = sanitizeId(submission.studentAuthUid || user.uid);
    const createPayload: Record<string, any> = {
      id: cleanSubId,
      sessionId: cleanSessionId.slice(0, 64),
      ownerRef: resolvedOwnerRef,
      studentAuthUid,
      studentName: (submission.studentName || submission.student_name || 'تلميذ').slice(0, 128),
      teacherId: user.uid,
      teacherEmail: (submission.teacherEmail || submission.teacher_email || user.email || '').toLowerCase().trim(),
      answers: submission.answers || submission.responses || {},
      analysis: submission.analysis || {},
      ...(submission.signedEnvelope ? { signedEnvelope: submission.signedEnvelope } : {}),
      teacherNotes: (submission.teacherNotes || '').slice(0, 2000),
      overriddenClassification: submission.overriddenClassification || null,
      deliveryReceiptId: (submission.deliveryReceiptId || '').slice(0, 64),
      deliveredAt: String(submission.deliveredAt || submission.submittedAt || new Date().toISOString()).slice(0, 40),
      reliabilityIndex:
        typeof submission.reliabilityIndex === 'number'
          ? Math.max(0, Math.min(100, Math.round(submission.reliabilityIndex)))
          : 100,
      institution: (submission.institution || '').slice(0, 200),
      level: (submission.level || '').slice(0, 100),
      stream: (submission.stream || '').slice(0, 100),
      classNumber: String(submission.classNumber || submission.class || '').slice(0, 40),
      submittedAt: submission.submittedAt || new Date().toISOString(),
      cloudSyncedAt: serverTimestamp(),
    };

    await setDoc(docRef, createPayload);
    return true;
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    console.warn('Firestore submission sync warning:', error?.message || error);
    return false;
  }
}

/**
 * Fetches all teacher-owned submissions directly from Firestore.
 */
export async function fetchSubmissionsFromFirestore(): Promise<StudentSubmission[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = 'submissions';
  try {
    const q = query(collection(db, path), where('teacherId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        ...data,
        id: data.id || d.id,
        student_name: data.studentName,
        session_id: data.sessionId,
        teacher_email: data.teacherEmail,
        class: data.classNumber || data.class || '',
        cloudSyncedAt: new Date().toISOString(),
        syncState: 'synced',
      } as StudentSubmission;
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    console.warn('Firestore submissions fetch warning:', error?.message || error);
    return [];
  }
}

/**
 * Fetches all teacher-owned sessions directly from Firestore.
 */
export async function fetchSessionsFromFirestore(): Promise<DiagnosticSession[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const path = 'sessions';
  try {
    const q = query(collection(db, path), where('teacherId', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        ...data,
        sessionId: data.sessionId || d.id,
        isFrozen: data.isActive === false,
      } as DiagnosticSession;
    });
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
    console.warn('Firestore sessions fetch warning:', error?.message || error);
    return [];
  }
}

/**
 * Subscribes to live Firestore submission updates for the authenticated teacher.
 */
export function subscribeTeacherSubmissionsFirestore(
  onSubmissions: (items: StudentSubmission[]) => void
): () => void {
  const user = auth.currentUser;
  if (!user) return () => {};

  const path = 'submissions';
  const q = query(collection(db, path), where('teacherId', '==', user.uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data() as any;
        return {
          ...data,
          id: data.id || d.id,
          student_name: data.studentName,
          session_id: data.sessionId,
          teacher_email: data.teacherEmail,
          class: data.classNumber || data.class || '',
          syncState: 'synced',
        } as StudentSubmission;
      });
      onSubmissions(items);
    },
    (error) => {
      if (String(error?.message || '').includes('Missing or insufficient permissions')) {
        handleFirestoreError(error, OperationType.LIST, path);
      } else {
        console.warn('Firestore onSnapshot warning:', error?.message || error);
      }
    }
  );
}

/**
 * Subscribes in real time to Firestore submissions filtered by studentSessionId
 * (scoped by teacherId for standard teachers or across sessions for verified Super Admin).
 */
export function subscribeSessionSubmissionsFirestore(
  studentSessionId: string,
  onSubmissions: (
    items: StudentSubmission[],
    meta: { fromCache: boolean; updatedAt: string }
  ) => void,
  onError?: (errorMessage: string) => void
): () => void {
  const user = auth.currentUser;
  if (!user) return () => {};

  const path = 'submissions';
  const normalizedSession = (studentSessionId || 'all').trim();
  const isAllSessions = !normalizedSession || normalizedSession.toLowerCase() === 'all';
  const cleanSessionId = isAllSessions
    ? ''
    : sanitizeId(normalizedSession.toUpperCase()).slice(0, 64);
  const isVerifiedAdmin =
    user.emailVerified && user.email?.toLowerCase() === 'phillofikr@gmail.com';

  const constraints = [];
  if (!isVerifiedAdmin) {
    constraints.push(where('teacherId', '==', user.uid));
  }
  if (cleanSessionId) {
    constraints.push(where('sessionId', '==', cleanSessionId));
  }

  const q =
    constraints.length > 0
      ? query(collection(db, path), ...constraints)
      : query(collection(db, path));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data() as any;
          const sid = data.sessionId || data.session_id || '';
          const submittedIso =
            typeof data.submittedAt?.toDate === 'function'
              ? data.submittedAt.toDate().toISOString()
              : String(data.submittedAt || data.deliveredAt || new Date().toISOString());
          return {
            ...data,
            id: data.id || d.id,
            studentName: data.studentName || data.student_name || 'تلميذ',
            student_name: data.studentName || data.student_name || 'تلميذ',
            sessionId: sid,
            session_id: sid,
            teacherEmail: data.teacherEmail || data.teacher_email || '',
            teacher_email: data.teacherEmail || data.teacher_email || '',
            class: data.classNumber || data.class || '',
            classNumber: data.classNumber || data.class || '',
            submittedAt: submittedIso,
            syncState: 'synced',
          } as StudentSubmission;
        })
        .sort((a, b) =>
          String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
        );

      onSubmissions(items, {
        fromCache: snapshot.metadata.fromCache,
        updatedAt: new Date().toISOString(),
      });
    },
    (error) => {
      if (String(error?.message || '').includes('Missing or insufficient permissions')) {
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (structuredErr: any) {
          onError?.(structuredErr?.message || 'تعذرت القراءة من Firestore بسبب الصلاحيات.');
        }
      } else {
        console.warn('Firestore session report subscription warning:', error?.message || error);
        onError?.(error?.message || 'تعذر الاتصال المباشر بـ Firestore.');
      }
    }
  );
}

/**
 * Resolves a single sanitized public session directly from publicSessions/{sessionId}
 * (fallback to private sessions/{sessionId} only if an authenticated owner/admin is signed in).
 */
export async function fetchSessionFromFirestore(
  sessionId: string
): Promise<DiagnosticSession | null> {
  const cleanId = sanitizeId((sessionId || '').toUpperCase().trim());
  if (!cleanId) return null;
  try {
    const publicSnap = await getDoc(doc(studentDb, 'publicSessions', cleanId));
    if (publicSnap.exists()) {
      const data = publicSnap.data() as any;
      return {
        ...data,
        sessionId: data.sessionId || cleanId,
        classNumber: data.classNumber || data.class || '1',
        isFrozen: data.isActive === false,
      } as DiagnosticSession;
    }

    if (auth.currentUser) {
      const privateSnap = await getDoc(doc(db, 'sessions', cleanId));
      if (privateSnap.exists()) {
        const data = privateSnap.data() as any;
        return {
          ...data,
          sessionId: data.sessionId || cleanId,
          classNumber: data.classNumber || data.class || '1',
          isFrozen: data.isActive === false,
        } as DiagnosticSession;
      }
    }
    return null;
  } catch (error: any) {
    console.warn('Firestore session lookup warning:', error?.message || error);
    return null;
  }
}

/**
 * Syncs student live presence in sessions/{sessionId}/presence/{studentUid} (event-first / fallback).
 */
export async function syncStudentPresenceToFirestore(
  sessionId: string,
  presence: {
    studentLabel?: string;
    status: 'active' | 'submitted' | 'away' | 'flagged';
    violationCount?: number;
    currentQuestionIndex?: number;
  }
): Promise<boolean> {
  const cleanSessionId = sanitizeId((sessionId || '').toUpperCase().trim());
  if (!cleanSessionId) return false;
  try {
    const user = studentAuth.currentUser || (await ensureStudentAnonymousAuth());
    if (!user) return false;

    const payload: Record<string, any> = {
      sessionId: cleanSessionId,
      studentAuthUid: user.uid,
      status: presence.status,
      lastHeartbeatAt: serverTimestamp(),
    };
    if (presence.studentLabel) {
      payload.studentLabel = String(presence.studentLabel).slice(0, 128);
    }
    if (typeof presence.violationCount === 'number') {
      payload.violationCount = Math.max(0, Math.min(50, Math.round(presence.violationCount)));
    }
    if (typeof presence.currentQuestionIndex === 'number') {
      payload.currentQuestionIndex = Math.max(0, Math.min(100, Math.round(presence.currentQuestionIndex)));
    }
    await setDoc(doc(studentDb, 'sessions', cleanSessionId, 'presence', user.uid), payload, { merge: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Records an immutable advisory violation event in sessions/{sessionId}/violationEvents/{uid}_{seq} (seq 1..50).
 */
export async function recordStudentViolationEventInFirestore(
  sessionId: string,
  seq: number,
  event: Pick<ViolationEventRecord, 'type' | 'details'>
): Promise<boolean> {
  const cleanSessionId = sanitizeId((sessionId || '').toUpperCase().trim());
  const boundedSeq = Math.max(1, Math.min(50, Math.round(seq)));
  if (!cleanSessionId || seq < 1 || seq > 50) return false;
  try {
    const user = studentAuth.currentUser || (await ensureStudentAnonymousAuth());
    if (!user) return false;
    const eventId = `${user.uid}_${boundedSeq}`;
    await setDoc(doc(studentDb, 'sessions', cleanSessionId, 'violationEvents', eventId), {
      seq: boundedSeq,
      studentAuthUid: user.uid,
      sessionId: cleanSessionId,
      type: event.type,
      ...(event.details ? { details: String(event.details).slice(0, 400) } : {}),
      advisoryOnly: true,
      occurredAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Persists an anonymous-authenticated student submission to Firestore using deterministic ID:
 * submissions/{sessionId}_{studentAuthUid} and ownerRef from publicSessions/{sessionId}.
 * Under Option A, zero PII (teacherId/teacherEmail) and zero server-trust fields (trustedAnalysis/analysisStatus) are written.
 */
export async function createStudentSubmissionInFirestore(
  submission: StudentSubmission
): Promise<boolean> {
  const cleanSessionId = sanitizeId(
    (submission.sessionId || submission.session_id || '').toUpperCase().trim()
  );
  if (!cleanSessionId) return false;

  try {
    const user = studentAuth.currentUser || (await ensureStudentAnonymousAuth());
    if (!user) return false;

    const pubSnap = await getDoc(doc(studentDb, 'publicSessions', cleanSessionId));
    if (!pubSnap.exists()) return false;
    const pubData = pubSnap.data() as any;
    if (pubData.isActive === false || !pubData.ownerRef) return false;

    const deterministicId = `${cleanSessionId}_${user.uid}`;
    const cleanPayload: Record<string, any> = {
      id: deterministicId,
      studentAuthUid: user.uid,
      studentName: (submission.studentName || submission.student_name || 'تلميذ').slice(0, 128),
      sessionId: cleanSessionId.slice(0, 64),
      ownerRef: String(pubData.ownerRef),
      answers: submission.answers || submission.responses || {},
      analysis: submission.analysis || {},
      ...(submission.signedEnvelope ? { signedEnvelope: submission.signedEnvelope } : {}),
      teacherNotes: '',
      deliveryReceiptId: (submission.deliveryReceiptId || '').slice(0, 64),
      deliveredAt: String(submission.deliveredAt || submission.submittedAt || new Date().toISOString()).slice(0, 40),
      reliabilityIndex:
        typeof submission.reliabilityIndex === 'number'
          ? Math.max(0, Math.min(100, Math.round(submission.reliabilityIndex)))
          : 100,
      institution: (submission.institution || pubData.institution || '').slice(0, 200),
      level: (submission.level || pubData.level || '').slice(0, 100),
      stream: (submission.stream || pubData.stream || '').slice(0, 100),
      classNumber: String(
        submission.classNumber || submission.class || pubData.classNumber || ''
      ).slice(0, 40),
      submittedAt: serverTimestamp(),
    };

    await setDoc(doc(studentDb, 'submissions', deterministicId), cleanPayload);
    return true;
  } catch (error: any) {
    console.warn('Firestore student submission backup warning:', error?.message || error);
    return false;
  }
}

/**
 * Fetches official template forms + custom forms owned by the signed-in teacher
 * using two explicit security-rule-compliant queries instead of 'in' operator.
 */
export async function fetchFormsFromFirestore(_teacherEmail?: string): Promise<any[]> {
  const user = auth.currentUser;
  if (!user) return [];

  try {
    const [templatesSnap, ownedSnap] = await Promise.all([
      getDocs(query(collection(db, 'forms'), where('isTemplate', '==', true))).catch(() => null),
      getDocs(query(collection(db, 'forms'), where('teacherId', '==', user.uid))).catch(() => null),
    ]);

    const merged = new Map<string, any>();
    templatesSnap?.docs.forEach((d) => {
      const data = d.data() as any;
      const fid = data.formId || d.id;
      merged.set(fid, { ...data, formId: fid });
    });
    ownedSnap?.docs.forEach((d) => {
      const data = d.data() as any;
      const fid = data.formId || d.id;
      merged.set(fid, { ...data, formId: fid });
    });

    return Array.from(merged.values());
  } catch (error: any) {
    console.warn('Firestore forms fetch warning:', error?.message || error);
    return [];
  }
}

/**
 * Saves or updates the signed-in teacher's opt-in notification settings under users/{uid}/notificationSettings/default
 */
export async function saveNotificationSettingsToFirestore(
  settings: TeacherNotificationSettings
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const docPath = `users/${user.uid}/notificationSettings/default`;
  try {
    const payload: TeacherNotificationSettings = {
      teacherId: user.uid,
      teacherEmail: String(user.email || settings.teacherEmail || '').toLowerCase().trim().slice(0, 200),
      consentAccepted: Boolean(settings.consentAccepted),
      consentTimestamp: settings.consentTimestamp ? String(settings.consentTimestamp).slice(0, 40) : null,
      disableAllExternal: Boolean(settings.disableAllExternal),
      channels: {
        inApp: Boolean(settings.channels?.inApp),
        email: Boolean(settings.channels?.email),
        whatsapp: Boolean(settings.channels?.whatsapp),
      },
      emailConfig: {
        address: String(settings.emailConfig?.address || '').trim().slice(0, 200),
        verified: Boolean(settings.emailConfig?.verified),
        ...(settings.emailConfig?.lastTestAt ? { lastTestAt: String(settings.emailConfig.lastTestAt).slice(0, 40) } : {}),
      },
      whatsappConfig: {
        countryCode: String(settings.whatsappConfig?.countryCode || '+212').slice(0, 10),
        phoneNumber: String(settings.whatsappConfig?.phoneNumber || '').slice(0, 24),
        e164Phone: String(settings.whatsappConfig?.e164Phone || '').slice(0, 32),
        consentAccepted: Boolean(settings.whatsappConfig?.consentAccepted),
        ...(settings.whatsappConfig?.consentTimestamp
          ? { consentTimestamp: String(settings.whatsappConfig.consentTimestamp).slice(0, 40) }
          : {}),
        verified: Boolean(settings.whatsappConfig?.verified),
        ...(settings.whatsappConfig?.lastTestAt
          ? { lastTestAt: String(settings.whatsappConfig.lastTestAt).slice(0, 40) }
          : {}),
      },
      messageTypes: {
        classAlerts: Boolean(settings.messageTypes?.classAlerts),
        studentAlerts: Boolean(settings.messageTypes?.studentAlerts),
        aiRecommendations: Boolean(settings.messageTypes?.aiRecommendations),
        sessionSummaries: Boolean(settings.messageTypes?.sessionSummaries),
      },
      updatedAt: (settings.updatedAt || new Date().toISOString()).slice(0, 40),
    };

    await setDoc(doc(db, 'users', user.uid, 'notificationSettings', 'default'), payload);
    return true;
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
    console.warn('Firestore notification settings save warning:', error?.message || error);
    return false;
  }
}

/**
 * Fetches the signed-in teacher's notification settings from Firestore.
 */
export async function fetchNotificationSettingsFromFirestore(): Promise<TeacherNotificationSettings | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const docPath = `users/${user.uid}/notificationSettings/default`;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid, 'notificationSettings', 'default'));
    if (!snap.exists()) return null;
    return snap.data() as TeacherNotificationSettings;
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }
    console.warn('Firestore notification settings fetch warning:', error?.message || error);
    return null;
  }
}

/**
 * Mirrors a pedagogical notification into users/{uid}/notifications/{notificationId}
 */
export async function syncPedagogicalNotificationToFirestore(
  notification: PedagogicalNotification
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const cleanId = sanitizeId(notification.id);
  const docPath = `users/${user.uid}/notifications/${cleanId}`;
  try {
    const payload: Record<string, any> = {
      id: cleanId,
      teacherId: user.uid,
      teacherEmail: String(user.email || notification.teacherEmail || '').toLowerCase().trim().slice(0, 200),
      title: String(notification.title || '').slice(0, 240),
      indicatorType: notification.indicatorType,
      indicatorLabel: String(notification.indicatorLabel || '').slice(0, 160),
      category: notification.category,
      sessionId: sanitizeId(notification.sessionId || 'SESSION'),
      sessionTitle: String(notification.sessionTitle || '').slice(0, 200),
      classNameLabel: String(notification.classNameLabel || '').slice(0, 120),
      gradeLevel: String(notification.gradeLevel || '').slice(0, 120),
      summary: String(notification.summary || '').slice(0, 800),
      priority: notification.priority,
      recommendation: String(notification.recommendation || '').slice(0, 600),
      reportPath: String(notification.reportPath || '').slice(0, 260),
      isRead: Boolean(notification.isRead),
      createdAt: String(notification.createdAt || new Date().toISOString()).slice(0, 40),
    };
    if (notification.studentRefId) {
      payload.studentRefId = String(notification.studentRefId).slice(0, 128);
    }
    if (typeof notification.submissionCountAtTrigger === 'number') {
      payload.submissionCountAtTrigger = Math.max(0, Math.round(notification.submissionCountAtTrigger));
    }
    if (notification.readAt) {
      payload.readAt = String(notification.readAt).slice(0, 40);
    }
    await setDoc(doc(db, 'users', user.uid, 'notifications', cleanId), payload, { merge: true });
    return true;
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.WRITE, docPath);
    }
    console.warn('Firestore notification sync warning:', error?.message || error);
    return false;
  }
}

export async function fetchPedagogicalNotificationsFromFirestore(): Promise<PedagogicalNotification[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const colPath = `users/${user.uid}/notifications`;
  try {
    const q = query(collection(db, colPath), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as PedagogicalNotification), id: d.id }));
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
    console.warn('Firestore notifications list warning:', error?.message || error);
    return [];
  }
}

export async function markPedagogicalNotificationReadInFirestore(
  notificationId: string
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const cleanId = sanitizeId(notificationId);
  const docPath = `users/${user.uid}/notifications/${cleanId}`;
  try {
    await updateDoc(doc(db, 'users', user.uid, 'notifications', cleanId), {
      isRead: true,
      readAt: new Date().toISOString(),
    });
    return true;
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
    return false;
  }
}

export async function deletePedagogicalNotificationInFirestore(
  notificationId: string
): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const cleanId = sanitizeId(notificationId);
  const docPath = `users/${user.uid}/notifications/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'notifications', cleanId));
    return true;
  } catch (error: any) {
    if (String(error?.message || '').includes('Missing or insufficient permissions')) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
    return false;
  }
}


