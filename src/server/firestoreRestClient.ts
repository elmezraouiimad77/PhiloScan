/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

let cachedConfig: { projectId: string; firestoreDatabaseId: string } | null = null;

export function getFirebaseRuntimeConfig(): { projectId: string; firestoreDatabaseId: string } {
  if (cachedConfig) return cachedConfig;
  const fallback = {
    projectId: (process.env.FIREBASE_PROJECT_ID || '').trim() || 'project-ae3ca3a5-d34f-42a5-a4a',
    firestoreDatabaseId:
      (process.env.FIRESTORE_DATABASE_ID || '').trim() || 'ai-studio-d15e3b81-015e-4e2a-bd5c-ec61f18d0bde',
  };
  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      cachedConfig = {
        projectId: parsed.projectId || fallback.projectId,
        firestoreDatabaseId: parsed.firestoreDatabaseId || fallback.firestoreDatabaseId,
      };
      return cachedConfig;
    }
  } catch {
    // Use fallback cleanly
  }
  cachedConfig = fallback;
  return cachedConfig;
}

function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values;
    return Array.isArray(arr) ? arr.map(decodeFirestoreValue) : [];
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

export function decodeFirestoreDocument(docJson: any): Record<string, any> | null {
  if (!docJson || typeof docJson !== 'object' || !docJson.fields) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(docJson.fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out;
}

/**
 * Fetches a Firestore document via REST API strictly under the caller's Firebase ID Token.
 * Never uses any privileged Service Account.
 */
export async function fetchFirestoreDocWithToken(
  docPath: string,
  idToken?: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status: number; data: Record<string, any> | null }> {
  const { projectId, firestoreDatabaseId } = getFirebaseRuntimeConfig();
  const cleanPath = docPath.replace(/^\/+/, '');
  const encodedPath = cleanPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents/${encodedPath}`;

  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  try {
    const resp = await fetchImpl(url, { headers });
    if (!resp.ok) {
      return { ok: false, status: resp.status, data: null };
    }
    const json = await resp.json();
    return { ok: true, status: resp.status, data: decodeFirestoreDocument(json) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

export async function isTeacherActiveViaRest(
  uid: string,
  idToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ exists: boolean; isDisabled: boolean; role?: string }> {
  if (!uid || !idToken) {
    return { exists: false, isDisabled: true };
  }
  const res = await fetchFirestoreDocWithToken(`teachers/${uid}`, idToken, fetchImpl);
  if (!res.ok || !res.data) {
    return { exists: false, isDisabled: true };
  }
  return {
    exists: true,
    isDisabled: res.data.isDisabled === true,
    role: typeof res.data.role === 'string' ? res.data.role : 'teacher',
  };
}

export async function isAdminActiveViaRest(
  uid: string,
  email: string,
  emailVerified: boolean,
  idToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!uid || !emailVerified || !idToken) return false;
  const cleanEmail = email.toLowerCase().trim();
  const teacherState = await isTeacherActiveViaRest(uid, idToken, fetchImpl);
  if (teacherState.exists && teacherState.isDisabled) {
    // Fails closed if user's teacher record is disabled
    return false;
  }
  if (cleanEmail === 'phillofikr@gmail.com') {
    return true;
  }
  const adminDoc = await fetchFirestoreDocWithToken(`admins/${uid}`, idToken, fetchImpl);
  return Boolean(adminDoc.ok && adminDoc.data && adminDoc.data.isDisabled === false);
}
