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
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  DiagnosticSession,
  PedagogicalNotification,
  StudentSubmission,
  TeacherNotificationSettings,
} from '../types';

function sanitizeId(raw: string): string {
  return (raw || 'id_' + Date.now().toString(36)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

/**
 * Mirrors a diagnostic session document to Firestore using authenticated UID
 * and serverTimestamp() to satisfy temporal integrity rules.
 */
export async function syncSessionToFirestore(session: DiagnosticSession): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;

  const cleanId = sanitizeId(session.sessionId);

  try {
    const docRef = doc(db, 'sessions', cleanId);
    const existingSnap = await getDoc(docRef);
    const basePayload: Record<string, any> = {
      sessionId: cleanId,
      teacherId: user.uid,
      teacherEmail: (session.teacherEmail || user.email || '').toLowerCase().trim(),
      institution: (session.institution || '').slice(0, 200),
      level: (session.level || '').slice(0, 100),
      stream: (session.stream || '').slice(0, 100),
      class: String(session.classNumber || '1').slice(0, 120),
      classNumber: String(session.classNumber || '1').slice(0, 120),
      title: (session.title || '').slice(0, 200),
      province: (session.province || '').slice(0, 120),
      isActive: !session.isFrozen,
      supervisedMode: Boolean(session.supervisedMode),
      formId: (session.formId || 'official-perceptions').slice(0, 120),
      formTitle: (session.formTitle || '').slice(0, 200),
      updatedAt: serverTimestamp(),
    };
    if (!existingSnap.exists()) {
      basePayload.createdAt = serverTimestamp();
    }
    await setDoc(docRef, basePayload, { merge: true });
    return true;
  } catch (error: any) {
    console.warn('Firestore session mirror warning:', error?.message || error);
    return false;
  }
}

/**
 * Mirrors a submission document to Firestore when the teacher is signed into Firebase Auth.
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
    const payload: Record<string, any> = {
      studentName: (submission.studentName || submission.student_name || 'تلميذ').slice(0, 128),
      teacherEmail: (submission.teacherEmail || submission.teacher_email || user.email || '').toLowerCase().trim(),
      answers: submission.answers || submission.responses || {},
      analysis: submission.analysis || {},
      teacherNotes: (submission.teacherNotes || '').slice(0, 2000),
      overriddenClassification: submission.overriddenClassification || null,
      deliveryReceiptId: (submission.deliveryReceiptId || '').slice(0, 64),
      deliveredAt: submission.deliveredAt || submission.submittedAt || new Date().toISOString(),
      reliabilityIndex: typeof submission.reliabilityIndex === 'number' ? submission.reliabilityIndex : 100,
      institution: (submission.institution || '').slice(0, 200),
      level: (submission.level || '').slice(0, 100),
      stream: (submission.stream || '').slice(0, 100),
      classNumber: String(submission.classNumber || submission.class || '').slice(0, 40),
      cloudSyncedAt: serverTimestamp(),
    };
    if (!existingSnap.exists()) {
      payload.id = cleanSubId;
      payload.sessionId = cleanSessionId.slice(0, 20);
      payload.teacherId = user.uid;
      payload.submittedAt = submission.submittedAt || new Date().toISOString();
    }
    await setDoc(docRef, payload, { merge: true });
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
    : sanitizeId(normalizedSession.toUpperCase()).slice(0, 20);
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
 * Resolves a single diagnostic session directly from Firestore (public read by sessionId)
 * as a resilient fallback when a Cloud Run container cold-starts.
 */
export async function fetchSessionFromFirestore(
  sessionId: string
): Promise<DiagnosticSession | null> {
  const cleanId = sanitizeId((sessionId || '').toUpperCase().trim());
  if (!cleanId) return null;
  try {
    const snap = await getDoc(doc(db, 'sessions', cleanId));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    return {
      ...data,
      sessionId: data.sessionId || cleanId,
      classNumber: data.classNumber || data.class || '1',
      isFrozen: data.isActive === false,
    } as DiagnosticSession;
  } catch (error: any) {
    console.warn('Firestore session lookup warning:', error?.message || error);
    return null;
  }
}

/**
 * Persists an unauthenticated student submission to Firestore using serverTimestamp()
 * and the Firestore session document's authoritative teacherId so security rules pass.
 */
export async function createStudentSubmissionInFirestore(
  submission: StudentSubmission
): Promise<boolean> {
  const cleanSubId = sanitizeId(submission.id);
  const cleanSessionId = sanitizeId(
    (submission.sessionId || submission.session_id || '').toUpperCase().trim()
  );
  if (!cleanSubId || !cleanSessionId) return false;

  try {
    const sessionSnap = await getDoc(doc(db, 'sessions', cleanSessionId));
    if (!sessionSnap.exists()) return false;
    const sessionData = sessionSnap.data() as any;
    if (sessionData.isActive === false || !sessionData.teacherId) return false;

    await setDoc(doc(db, 'submissions', cleanSubId), {
      id: cleanSubId,
      studentName: (submission.studentName || submission.student_name || 'تلميذ').slice(0, 128),
      sessionId: cleanSessionId.slice(0, 20),
      teacherId: String(sessionData.teacherId).slice(0, 128),
      teacherEmail: (
        submission.teacherEmail ||
        submission.teacher_email ||
        sessionData.teacherEmail ||
        ''
      )
        .toLowerCase()
        .trim(),
      answers: submission.answers || submission.responses || {},
      analysis: submission.analysis || {},
      teacherNotes: '',
      deliveryReceiptId: (submission.deliveryReceiptId || '').slice(0, 64),
      deliveredAt: submission.deliveredAt || submission.submittedAt || new Date().toISOString(),
      reliabilityIndex:
        typeof submission.reliabilityIndex === 'number'
          ? Math.max(0, Math.min(100, Math.round(submission.reliabilityIndex)))
          : 100,
      institution: (submission.institution || sessionData.institution || '').slice(0, 200),
      level: (submission.level || sessionData.level || '').slice(0, 100),
      stream: (submission.stream || sessionData.stream || '').slice(0, 100),
      classNumber: String(
        submission.classNumber || submission.class || sessionData.classNumber || ''
      ).slice(0, 40),
      submittedAt: serverTimestamp(),
    });
    return true;
  } catch (error: any) {
    console.warn('Firestore student submission backup warning:', error?.message || error);
    return false;
  }
}

/**
 * Fetches custom forms owned by the signed-in teacher from Firestore.
 */
export async function fetchFormsFromFirestore(teacherEmail?: string): Promise<any[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const email = (user.email || teacherEmail || '').trim().toLowerCase();
  if (!email) return [];

  try {
    const q = query(
      collection(db, 'forms'),
      where('teacherEmail', 'in', [email, 'phillofikr@gmail.com'])
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), formId: (d.data() as any).formId || d.id }));
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


