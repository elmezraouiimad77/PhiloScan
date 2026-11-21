/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { DiagnosticSession, StudentSubmission } from '../types';

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

