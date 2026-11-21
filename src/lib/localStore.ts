/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagnosticSession, FormQuestion, GoogleSheetExportRecord, StudentSubmission } from '../types';

const DB_NAME = 'philoscan_local_db_v1';
const DB_VERSION = 2;

const STORE_SUBMISSIONS = 'submissions';
const STORE_SESSIONS = 'sessions';
const STORE_PENDING_QUEUE = 'pendingSubmissions';
const STORE_SHEET_EXPORTS = 'sheetExports';
const STORE_META = 'meta';
const STORE_FORM_DRAFTS = 'formDrafts';

export interface FormBuilderDraft {
  draftKey: string;
  teacherEmail: string;
  editFormId: string | null;
  formTitle: string;
  formDesc: string;
  formStatus: 'saved' | 'published' | 'ready';
  questions: FormQuestion[];
  metaLevel: string;
  metaStream: string;
  metaClassNumber: string;
  metaLessonTopic: string;
  metaPedagogicalGoal: string;
  savedAt: string;
}

export interface PendingOfflineSubmission {
  localQueueId: string;
  sessionId: string;
  studentName: string;
  payload: any;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export interface SyncSnapshotMeta {
  key: string;
  teacherEmail: string;
  lastServerSyncAt?: string;
  lastCloudSyncAt?: string;
  lastSheetsSyncAt?: string;
  localCount: number;
  serverCount: number;
  cloudCount: number;
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SUBMISSIONS)) {
        db.createObjectStore(STORE_SUBMISSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'sessionId' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_QUEUE)) {
        db.createObjectStore(STORE_PENDING_QUEUE, { keyPath: 'localQueueId' });
      }
      if (!db.objectStoreNames.contains(STORE_SHEET_EXPORTS)) {
        db.createObjectStore(STORE_SHEET_EXPORTS, { keyPath: 'spreadsheetId' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_FORM_DRAFTS)) {
        db.createObjectStore(STORE_FORM_DRAFTS, { keyPath: 'draftKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    let resultVal: T;
    let settled = false;

    tx.oncomplete = () => {
      db.close();
      if (settled) resolve(resultVal);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB transaction failed'));
    };

    Promise.resolve(fn(store))
      .then((maybeReq: any) => {
        if (maybeReq && typeof maybeReq === 'object' && 'onsuccess' in maybeReq && 'onerror' in maybeReq) {
          maybeReq.onsuccess = () => {
            resultVal = maybeReq.result;
            settled = true;
          };
          maybeReq.onerror = () => reject(maybeReq.error);
        } else {
          resultVal = maybeReq;
          settled = true;
        }
      })
      .catch(reject);
  });
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  if (!isIndexedDbAvailable()) return [];
  try {
    return await withStore<T[]>(storeName, 'readonly', (store) => store.getAll());
  } catch {
    return [];
  }
}

async function putManyInStore<T>(storeName: string, items: T[]): Promise<void> {
  if (!isIndexedDbAvailable() || items.length === 0) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach((item) => store.put(item));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function saveLocalSubmissions(submissions: StudentSubmission[]): Promise<void> {
  try {
    await putManyInStore(
      STORE_SUBMISSIONS,
      submissions.map((s) => ({
        ...s,
        localUpdatedAt: s.localUpdatedAt || new Date().toISOString(),
      }))
    );
  } catch (err) {
    console.warn('Local IndexedDB submissions write skipped:', err);
  }
}

export async function saveLocalSubmission(submission: StudentSubmission): Promise<void> {
  await saveLocalSubmissions([submission]);
}

export async function deleteLocalSubmission(submissionId: string): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  try {
    await withStore(STORE_SUBMISSIONS, 'readwrite', (store) => store.delete(submissionId));
  } catch {
    // non-fatal
  }
}

export async function getLocalSubmissions(teacherEmail?: string): Promise<StudentSubmission[]> {
  const all = await getAllFromStore<StudentSubmission>(STORE_SUBMISSIONS);
  if (!teacherEmail) return all;
  const lower = teacherEmail.trim().toLowerCase();
  return all.filter((s) => {
    const em = (s.teacherEmail || s.teacher_email || '').trim().toLowerCase();
    return em === lower;
  });
}

export async function saveLocalSessions(sessions: DiagnosticSession[]): Promise<void> {
  try {
    await putManyInStore(STORE_SESSIONS, sessions);
  } catch (err) {
    console.warn('Local IndexedDB sessions write skipped:', err);
  }
}

export async function getLocalSessions(teacherEmail?: string): Promise<DiagnosticSession[]> {
  const all = await getAllFromStore<DiagnosticSession>(STORE_SESSIONS);
  if (!teacherEmail) return all;
  const lower = teacherEmail.trim().toLowerCase();
  return all.filter((s) => (s.teacherEmail || '').trim().toLowerCase() === lower);
}

// Offline student submission queue (survives browser reloads & connectivity drops)
export async function enqueueOfflineSubmission(item: PendingOfflineSubmission): Promise<void> {
  try {
    await putManyInStore(STORE_PENDING_QUEUE, [item]);
  } catch {
    try {
      const existing = JSON.parse(localStorage.getItem('philoscan_offline_queue') || '[]');
      existing.push(item);
      localStorage.setItem('philoscan_offline_queue', JSON.stringify(existing));
    } catch {
      // ignore storage quota errors
    }
  }
}

export async function getPendingOfflineSubmissions(): Promise<PendingOfflineSubmission[]> {
  const idbItems = await getAllFromStore<PendingOfflineSubmission>(STORE_PENDING_QUEUE);
  try {
    const lsItems: PendingOfflineSubmission[] = JSON.parse(
      localStorage.getItem('philoscan_offline_queue') || '[]'
    );
    const map = new Map<string, PendingOfflineSubmission>();
    [...idbItems, ...lsItems].forEach((it) => map.set(it.localQueueId, it));
    return Array.from(map.values());
  } catch {
    return idbItems;
  }
}

export async function removePendingOfflineSubmission(localQueueId: string): Promise<void> {
  if (isIndexedDbAvailable()) {
    try {
      await withStore(STORE_PENDING_QUEUE, 'readwrite', (store) => store.delete(localQueueId));
    } catch {
      // ignore
    }
  }
  try {
    const existing: PendingOfflineSubmission[] = JSON.parse(
      localStorage.getItem('philoscan_offline_queue') || '[]'
    );
    localStorage.setItem(
      'philoscan_offline_queue',
      JSON.stringify(existing.filter((x) => x.localQueueId !== localQueueId))
    );
  } catch {
    // ignore
  }
}

// Google Sheets export history
export async function saveSheetExportRecord(record: GoogleSheetExportRecord): Promise<void> {
  try {
    await putManyInStore(STORE_SHEET_EXPORTS, [record]);
  } catch {
    // non-fatal
  }
}

export async function getSheetExportRecords(): Promise<GoogleSheetExportRecord[]> {
  const records = await getAllFromStore<GoogleSheetExportRecord>(STORE_SHEET_EXPORTS);
  return records.sort(
    (a, b) => new Date(b.lastExportedAt).getTime() - new Date(a.lastExportedAt).getTime()
  );
}

// Sync snapshot metadata per teacher
export async function saveSyncSnapshotMeta(meta: SyncSnapshotMeta): Promise<void> {
  try {
    await putManyInStore(STORE_META, [meta]);
  } catch {
    // non-fatal
  }
}

export async function getSyncSnapshotMeta(teacherEmail: string): Promise<SyncSnapshotMeta | null> {
  if (!isIndexedDbAvailable()) return null;
  try {
    const key = `sync_${teacherEmail.trim().toLowerCase()}`;
    return (await withStore<SyncSnapshotMeta | undefined>(STORE_META, 'readonly', (store) => store.get(key))) || null;
  } catch {
    return null;
  }
}

export function computeSyncDiff(
  localSubs: StudentSubmission[],
  serverSubs: StudentSubmission[],
  cloudSubs: StudentSubmission[]
) {
  const localIds = new Set(localSubs.map((s) => s.id));
  const serverIds = new Set(serverSubs.map((s) => s.id));
  const cloudIds = new Set(cloudSubs.map((s) => s.id));

  const localOnlyCount = localSubs.filter((s) => !serverIds.has(s.id)).length;
  const serverNotInCloudCount = serverSubs.filter((s) => !cloudIds.has(s.id)).length;
  const cloudNotInLocalCount = cloudSubs.filter((s) => !localIds.has(s.id) && !serverIds.has(s.id)).length;
  const pendingEditCount = localSubs.filter((s) => s.syncState === 'local_pending' || s.syncState === 'cloud_pending').length;

  return {
    localCount: localSubs.length,
    serverCount: serverSubs.length,
    cloudCount: cloudSubs.length,
    localOnlyCount,
    serverNotInCloudCount,
    cloudNotInLocalCount,
    pendingEditCount,
    needsSync: localOnlyCount > 0 || serverNotInCloudCount > 0 || cloudNotInLocalCount > 0 || pendingEditCount > 0,
  };
}

function getDraftStorageKey(teacherEmail: string): string {
  return `philoscan_form_draft_${(teacherEmail || 'default').trim().toLowerCase()}`;
}

export async function saveFormDraftLocal(draft: Omit<FormBuilderDraft, 'draftKey'>): Promise<void> {
  const draftKey = getDraftStorageKey(draft.teacherEmail);
  const fullDraft: FormBuilderDraft = { ...draft, draftKey };

  try {
    localStorage.setItem(draftKey, JSON.stringify(fullDraft));
  } catch {
    // ignore localStorage quota errors
  }

  if (!isIndexedDbAvailable()) return;
  try {
    await putManyInStore(STORE_FORM_DRAFTS, [fullDraft]);
  } catch {
    // non-fatal
  }
}

export async function getFormDraftLocal(teacherEmail: string): Promise<FormBuilderDraft | null> {
  const draftKey = getDraftStorageKey(teacherEmail);
  if (isIndexedDbAvailable()) {
    try {
      const idbDraft = await withStore<FormBuilderDraft | undefined>(
        STORE_FORM_DRAFTS,
        'readonly',
        (store) => store.get(draftKey)
      );
      if (idbDraft) return idbDraft;
    } catch {
      // fall through to localStorage
    }
  }
  try {
    const raw = localStorage.getItem(draftKey);
    return raw ? (JSON.parse(raw) as FormBuilderDraft) : null;
  } catch {
    return null;
  }
}

export async function clearFormDraftLocal(teacherEmail: string): Promise<void> {
  const draftKey = getDraftStorageKey(teacherEmail);
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // ignore
  }
  if (!isIndexedDbAvailable()) return;
  try {
    await withStore(STORE_FORM_DRAFTS, 'readwrite', (store) => store.delete(draftKey));
  } catch {
    // ignore
  }
}

