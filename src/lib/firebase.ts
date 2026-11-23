/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, User } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, AppCheck } from 'firebase/app-check';
import firebaseConfig from '../../firebase-applet-config.json';

const databaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

export const app: FirebaseApp = getApps().some((a) => a.name === '[DEFAULT]')
  ? getApp('[DEFAULT]')
  : initializeApp(firebaseConfig);

export const db = initializeFirestore(
  app,
  { experimentalForceLongPolling: true },
  databaseId
); /* CRITICAL: The app will break without this line */
export const firestore = db;
export const auth = getAuth(app);

// Secondary isolated Firebase instance for anonymous student sessions so teacher auth is never clobbered
export const studentApp: FirebaseApp = getApps().some((a) => a.name === 'philoscan-student')
  ? getApp('philoscan-student')
  : initializeApp(firebaseConfig, 'philoscan-student');

export const studentDb = initializeFirestore(
  studentApp,
  { experimentalForceLongPolling: true },
  databaseId
);
export const studentAuth = getAuth(studentApp);

let appCheckInstance: AppCheck | null = null;
let studentAppCheckInstance: AppCheck | null = null;

function initAppCheckSafe() {
  if (typeof window === 'undefined') return;
  const siteKey = String((import.meta as any).env?.VITE_FIREBASE_APP_CHECK_SITE_KEY || '').trim();
  if (!siteKey) return;
  try {
    if (!appCheckInstance) {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
    if (!studentAppCheckInstance) {
      studentAppCheckInstance = initializeAppCheck(studentApp, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  } catch (err) {
    console.warn('App Check initialization skipped:', err);
  }
}
initAppCheckSafe();

export async function getAppCheckTokenHeader(useStudentApp = false): Promise<Record<string, string>> {
  const target = useStudentApp ? studentAppCheckInstance || appCheckInstance : appCheckInstance;
  if (!target) return {};
  try {
    const res = await getToken(target, false);
    if (res?.token) {
      return { 'X-Firebase-AppCheck': res.token };
    }
  } catch {
    // Graceful fallback when App Check site key is not active in local dev
  }
  return {};
}

export async function ensureStudentAnonymousAuth(): Promise<User | null> {
  try {
    if (studentAuth.currentUser) {
      return studentAuth.currentUser;
    }
    const cred = await signInAnonymously(studentAuth);
    return cred.user;
  } catch (err) {
    console.warn('Student anonymous Firebase Auth skipped/unavailable:', err);
    return null;
  }
}

export async function getStudentRequestHeaders(
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  const [user, appCheckHeaders] = await Promise.all([
    ensureStudentAnonymousAuth(),
    getAppCheckTokenHeader(true),
  ]);
  Object.assign(headers, appCheckHeaders);
  if (user) {
    try {
      const idToken = await user.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
        headers['x-firebase-id-token'] = idToken;
      }
    } catch {
      // ignore token error
    }
  }
  return headers;
}

export async function getTeacherRequestHeaders(
  explicitToken?: string,
  extra: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  let storedToken = explicitToken || '';
  if (!storedToken && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('philoscan_teacher_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.token) storedToken = String(parsed.token);
      }
    } catch {
      // ignore invalid session cache
    }
  }

  let firebaseToken = '';
  if (auth.currentUser) {
    try {
      firebaseToken = await auth.currentUser.getIdToken();
    } catch {
      // ignore silent refresh error
    }
  }

  const primaryBearer = firebaseToken || storedToken;
  if (primaryBearer) {
    headers['Authorization'] = `Bearer ${primaryBearer}`;
  }
  if (firebaseToken) {
    headers['x-firebase-id-token'] = firebaseToken;
  } else if (storedToken && storedToken.split('.').length === 3) {
    headers['x-firebase-id-token'] = storedToken;
  }

  const appCheckHeaders = await getAppCheckTokenHeader(false);
  Object.assign(headers, appCheckHeaders);
  return headers;
}

export function generateOwnerRef(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return (
    'own_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Operational Connection Validation check at startup against public stats document
async function testConnection() {
  if (typeof window === 'undefined') return;
  if (window.navigator && !window.navigator.onLine) return;
  try {
    await getDocFromServer(doc(db, 'stats', 'public'));
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline') || msg.includes('Failed to get document')) {
      console.warn('PhiloScan telemetry: Firestore direct channel unavailable, resilient server fallback is active.');
    }
  }
}
testConnection();
