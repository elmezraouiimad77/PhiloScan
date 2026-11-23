/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Cloud,
  Database,
  HardDrive,
  RefreshCw,
  FileSpreadsheet,
  ExternalLink,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { auth, getTeacherRequestHeaders } from '../lib/firebase';
import {
  computeSyncDiff,
  getLocalSubmissions,
  getPendingOfflineSubmissions,
  getSheetExportRecords,
  getSyncSnapshotMeta,
  removePendingOfflineSubmission,
  saveLocalSessions,
  saveLocalSubmissions,
  saveSheetExportRecord,
  saveSyncSnapshotMeta,
  SyncSnapshotMeta,
} from '../lib/localStore';
import {
  fetchFormsFromFirestore,
  fetchSessionsFromFirestore,
  fetchSubmissionsFromFirestore,
  syncSessionToFirestore,
  syncSubmissionToFirestore,
} from '../lib/firestoreSync';
import {
  exportPhiloScanToGoogleSheets,
  hasWorkspaceAccessToken,
  signInWithGoogleSheets,
} from '../lib/workspaceAuth';
import {
  DiagnosticSession,
  GoogleSheetExportRecord,
  StudentSubmission,
  TeacherSession,
} from '../types';

interface DataSyncHubProps {
  teacherSession: TeacherSession | null;
  sessions: DiagnosticSession[];
  submissions: StudentSubmission[];
  selectedSessionId: string;
  onDataReconciled: (nextSubmissions: StudentSubmission[], nextSessions: DiagnosticSession[]) => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

export const DataSyncHub: React.FC<DataSyncHubProps> = ({
  teacherSession,
  sessions,
  submissions,
  selectedSessionId,
  onDataReconciled,
  onShowToast,
}) => {
  const teacherEmail = (teacherSession?.email || '').trim().toLowerCase();

  const [localSubs, setLocalSubs] = useState<StudentSubmission[]>([]);
  const [cloudSubs, setCloudSubs] = useState<StudentSubmission[]>([]);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [syncMeta, setSyncMeta] = useState<SyncSnapshotMeta | null>(null);
  const [sheetExports, setSheetExports] = useState<GoogleSheetExportRecord[]>([]);

  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(!!auth.currentUser);
  const [googleUserEmail, setGoogleUserEmail] = useState<string>(auth.currentUser?.email || '');
  const [sheetsConnected, setSheetsConnected] = useState<boolean>(hasWorkspaceAccessToken());

  const [syncingAll, setSyncingAll] = useState(false);
  const [pullingCloud, setPullingCloud] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [exportingSheets, setExportingSheets] = useState(false);

  // Google Sheets explicit target & confirmation modal states
  const [exportScopeSessionId, setExportScopeSessionId] = useState<string>(selectedSessionId || 'all');
  const [targetSpreadsheetId, setTargetSpreadsheetId] = useState<string>('new');
  const [customSheetTitle, setCustomSheetTitle] = useState<string>('');
  const [showSheetsConfirmModal, setShowSheetsConfirmModal] = useState(false);

  useEffect(() => {
    setExportScopeSessionId(selectedSessionId || 'all');
  }, [selectedSessionId]);

  const refreshLocalAndHistory = async () => {
    if (!teacherEmail) return;
    const [loc, pending, meta, exportsList] = await Promise.all([
      getLocalSubmissions(teacherEmail),
      getPendingOfflineSubmissions(),
      getSyncSnapshotMeta(teacherEmail),
      getSheetExportRecords(),
    ]);
    setLocalSubs(loc);
    setPendingQueueCount(pending.length);
    setSyncMeta(meta);
    setSheetExports(exportsList);
  };

  useEffect(() => {
    refreshLocalAndHistory();
    const unsub = auth.onAuthStateChanged((user) => {
      setIsFirebaseConnected(!!user);
      setGoogleUserEmail(user?.email || '');
      setSheetsConnected(hasWorkspaceAccessToken());
    });
    return () => unsub();
  }, [teacherEmail]);

  const diffSummary = useMemo(
    () => computeSyncDiff(localSubs, submissions, cloudSubs),
    [localSubs, submissions, cloudSubs]
  );

  const scopedExportSubmissions = useMemo(() => {
    if (exportScopeSessionId === 'all') return submissions;
    return submissions.filter(
      (s) => (s.sessionId || s.session_id || '').toUpperCase() === exportScopeSessionId.toUpperCase()
    );
  }, [submissions, exportScopeSessionId]);

  const scopedSessionObj = useMemo(() => {
    if (exportScopeSessionId === 'all') return null;
    return sessions.find((s) => s.sessionId.toUpperCase() === exportScopeSessionId.toUpperCase()) || null;
  }, [sessions, exportScopeSessionId]);

  const defaultSheetTitle = useMemo(() => {
    const datePart = new Date().toLocaleDateString('en-CA');
    return scopedSessionObj
      ? `PhiloScan - ${scopedSessionObj.title} (${scopedSessionObj.sessionId}) - ${datePart}`
      : `PhiloScan - جميع الجلسات - ${datePart}`;
  }, [scopedSessionObj]);

  // Manual Bidirectional Sync: IndexedDB <-> Express Server <-> Firestore
  const handleManualFullSync = async () => {
    if (!teacherEmail) return;
    setSyncingAll(true);
    try {
      const [currentLocalSubs, pendingQueue] = await Promise.all([
        getLocalSubmissions(teacherEmail),
        getPendingOfflineSubmissions(),
      ]);

      const reconcileHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/sync/reconcile', {
        method: 'POST',
        headers: reconcileHeaders,
        body: JSON.stringify({
          email: teacherEmail,
          role: teacherSession?.role || 'teacher',
          localSubmissions: currentLocalSubs,
          localSessions: sessions,
          offlineQueue: pendingQueue,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشلت مزامنة البيانات مع الخادم.');
      }

      const reconciledSubs: StudentSubmission[] = data.submissions || [];
      const reconciledSessions: DiagnosticSession[] = data.sessions || sessions;

      // Clear any processed offline queue items
      if (pendingQueue.length > 0 && (data.processedQueueCount || 0) > 0) {
        await Promise.all(pendingQueue.map((item) => removePendingOfflineSubmission(item.localQueueId)));
      }

      // Mirror to Firestore if signed in with Firebase Auth
      let syncedToCloud = 0;
      let latestCloudSubs = cloudSubs;
      if (auth.currentUser) {
        for (const sess of reconciledSessions) {
          await syncSessionToFirestore(sess);
        }
        for (const sub of reconciledSubs) {
          const ok = await syncSubmissionToFirestore(sub);
          if (ok) syncedToCloud++;
        }
        latestCloudSubs = await fetchSubmissionsFromFirestore();
        setCloudSubs(latestCloudSubs);
      }

      const stampedSubs: StudentSubmission[] = reconciledSubs.map((s) => ({
        ...s,
        syncState: 'synced',
        cloudSyncedAt: auth.currentUser ? new Date().toISOString() : s.cloudSyncedAt,
      }));

      await Promise.all([
        saveLocalSubmissions(stampedSubs),
        saveLocalSessions(reconciledSessions),
        saveSyncSnapshotMeta({
          key: `sync_${teacherEmail}`,
          teacherEmail,
          lastServerSyncAt: new Date().toISOString(),
          lastCloudSyncAt: auth.currentUser ? new Date().toISOString() : syncMeta?.lastCloudSyncAt,
          lastSheetsSyncAt: syncMeta?.lastSheetsSyncAt,
          localCount: stampedSubs.length,
          serverCount: reconciledSubs.length,
          cloudCount: latestCloudSubs.length,
        }),
      ]);

      onDataReconciled(stampedSubs, reconciledSessions);
      await refreshLocalAndHistory();

      onShowToast(
        auth.currentUser
          ? `تمت المزامنة الشاملة بنجاح (${reconciledSubs.length} ملف محلي/خادم، و${syncedToCloud} ملف في سحابة غوغل).`
          : `تمت المزامنة بين التخزين المحلي IndexedDB والخادم (${reconciledSubs.length} ملف). اربط حساب غوغل لتفعيل سحابة Firestore.`
      );
    } catch (err: any) {
      onShowToast(err.message || 'تعذر إتمام المزامنة اليدوية.', 'error');
    } finally {
      setSyncingAll(false);
    }
  };

  // Manual Pull from Firestore Cloud into Local & Server
  const handlePullFromCloud = async () => {
    if (!auth.currentUser) {
      onShowToast('يرجى ربط حساب غوغل أولاً لسحب النسخة السحابية من Firestore.', 'error');
      return;
    }
    setPullingCloud(true);
    try {
      const [remoteSubs, remoteSessions, remoteForms] = await Promise.all([
        fetchSubmissionsFromFirestore(),
        fetchSessionsFromFirestore(),
        fetchFormsFromFirestore(teacherEmail),
      ]);
      setCloudSubs(remoteSubs);

      if (remoteSubs.length > 0 || remoteSessions.length > 0 || remoteForms.length > 0) {
        const pullHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
          'Content-Type': 'application/json',
        });
        const res = await fetch('/api/sync/reconcile', {
          method: 'POST',
          headers: pullHeaders,
          body: JSON.stringify({
            email: teacherEmail,
            role: teacherSession?.role || 'teacher',
            localSubmissions: remoteSubs,
            localSessions: remoteSessions,
            localForms: remoteForms,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          const mergedSubs: StudentSubmission[] = data.submissions || remoteSubs;
          const mergedSessions: DiagnosticSession[] = data.sessions?.length ? data.sessions : remoteSessions;
          await saveLocalSubmissions(mergedSubs);
          await saveLocalSessions(mergedSessions);
          onDataReconciled(mergedSubs, mergedSessions);
        }
      }

      await saveSyncSnapshotMeta({
        key: `sync_${teacherEmail}`,
        teacherEmail,
        lastServerSyncAt: syncMeta?.lastServerSyncAt,
        lastCloudSyncAt: new Date().toISOString(),
        lastSheetsSyncAt: syncMeta?.lastSheetsSyncAt,
        localCount: Math.max(localSubs.length, remoteSubs.length),
        serverCount: submissions.length,
        cloudCount: remoteSubs.length,
      });

      await refreshLocalAndHistory();
      onShowToast(`تم استرداد ${remoteSubs.length} ملفاً و${remoteSessions.length} جلسة من سحابة Firestore بنجاح.`);
    } catch (err: any) {
      onShowToast(err.message || 'تعذر سحب البيانات من Firestore.', 'error');
    } finally {
      setPullingCloud(false);
    }
  };

  // Connect Google Account + Google Sheets scope
  const handleConnectGoogleSheets = async () => {
    setConnectingGoogle(true);
    try {
      const { user } = await signInWithGoogleSheets(teacherEmail);
      setIsFirebaseConnected(true);
      setGoogleUserEmail(user.email || '');
      setSheetsConnected(hasWorkspaceAccessToken());
      const remoteSubs = await fetchSubmissionsFromFirestore();
      setCloudSubs(remoteSubs);
      onShowToast(`تم ربط حساب غوغل (${user.email}) وتفعيل صلاحية Google Sheets بنجاح.`);
    } catch (err: any) {
      onShowToast(err.message || 'فشل ربط حساب غوغل أو منح إذن Google Sheets.', 'error');
    } finally {
      setConnectingGoogle(false);
    }
  };

  // Execute confirmed Google Sheets Export
  const handleConfirmedSheetsExport = async () => {
    setShowSheetsConfirmModal(false);
    setExportingSheets(true);
    try {
      const existingRecord =
        targetSpreadsheetId !== 'new'
          ? sheetExports.find((r) => r.spreadsheetId === targetSpreadsheetId)
          : undefined;

      const record = await exportPhiloScanToGoogleSheets({
        spreadsheetId: existingRecord?.spreadsheetId,
        title: existingRecord?.title || customSheetTitle.trim() || defaultSheetTitle,
        teacherName: teacherSession?.fullName || 'الأستاذ الموجه',
        teacherEmail: teacherEmail || googleUserEmail,
        selectedSession: scopedSessionObj,
        sessions,
        submissions: scopedExportSubmissions,
      });

      await saveSheetExportRecord(record);
      await saveSyncSnapshotMeta({
        key: `sync_${teacherEmail}`,
        teacherEmail,
        lastServerSyncAt: syncMeta?.lastServerSyncAt,
        lastCloudSyncAt: syncMeta?.lastCloudSyncAt,
        lastSheetsSyncAt: record.lastExportedAt,
        localCount: localSubs.length,
        serverCount: submissions.length,
        cloudCount: cloudSubs.length,
      });
      await refreshLocalAndHistory();
      onShowToast(`تم تصدير ${record.rowCount} ملف تلميذ إلى Google Sheets بنجاح!`);
    } catch (err: any) {
      setSheetsConnected(hasWorkspaceAccessToken());
      onShowToast(err.message || 'حدث خطأ أثناء التصدير إلى Google Sheets.', 'error');
    } finally {
      setExportingSheets(false);
    }
  };

  // Download Local JSON Backup
  const handleDownloadBackupJson = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      teacherEmail,
      sessions,
      submissions,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `philoscan_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('تم تنزيل نسخة احتياطية محلية شاملة بصيغة JSON.');
  };

  // Import Local JSON Backup
  const handleImportBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        const importedSubs: StudentSubmission[] = Array.isArray(parsed.submissions) ? parsed.submissions : [];
        if (importedSubs.length === 0) {
          onShowToast('الملف لا يحتوي على ملفات تلاميذ صالحة للاستيراد.', 'error');
          return;
        }
        await saveLocalSubmissions(
          importedSubs.map((s) => ({ ...s, syncState: 'local_pending' as const }))
        );
        await refreshLocalAndHistory();
        onShowToast(`تم استيراد ${importedSubs.length} ملفاً إلى IndexedDB المحلي. اضغط "مزامنة ثنائية شاملة" لرفعها للخادم.`);
      } catch {
        onShowToast('تعذر قراءة ملف النسخة الاحتياطية JSON.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in text-right" dir="rtl">
      {/* Header Banner */}
      <div className="bg-white rounded-[24px] sm:rounded-[32px] border border-slate-200 p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>مركز المزامنة المزدوجة والربط المباشر مع غوغل</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            حفظ مزدوج تلقائي بين ذاكرة المتصفح (IndexedDB) وخادم المنصة مع مزامنة يدوية فورية نحو Firestore و Google Sheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={syncingAll}
            onClick={handleManualFullSync}
            className="min-h-[44px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition"
          >
            {syncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>مزامنة ثنائية شاملة الآن</span>
          </button>

          <button
            type="button"
            disabled={pullingCloud || !isFirebaseConnected}
            onClick={handlePullFromCloud}
            className="min-h-[44px] px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition"
          >
            {pullingCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            <span>استرداد من سحابة Firestore</span>
          </button>
        </div>
      </div>

      {/* 3-Tier Storage & Sync Status Cards (Single-elevation, max 3 metrics) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">1. التخزين المحلي (IndexedDB)</span>
            <HardDrive className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {diffSummary.localCount} <span className="text-xs font-sans font-bold text-slate-500">ملف محفوظ محلياً</span>
          </div>
          <p className="text-[11px] text-slate-500">
            {pendingQueueCount > 0
              ? `طابور إرسال مؤجل: ${pendingQueueCount} استمارة بانتظار الرفع.`
              : diffSummary.localOnlyCount > 0
              ? `${diffSummary.localOnlyCount} تعديل محلي يحتاج المزامنة مع الخادم.`
              : 'متطابق وجاهز للعمل دون انقطاع.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">2. خادم المنصة (JSON / SSE)</span>
            <Database className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {submissions.length} <span className="text-xs font-sans font-bold text-slate-500">ملف عبر {sessions.length} جلسة</span>
          </div>
          <p className="text-[11px] text-slate-500">
            آخر توفيق يدوي:{' '}
            {syncMeta?.lastServerSyncAt
              ? new Date(syncMeta.lastServerSyncAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
              : 'تلقائي مع كل بث لحظي'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500">3. سحابة غوغل (Firestore)</span>
            <Cloud className={`w-5 h-5 ${isFirebaseConnected ? 'text-indigo-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {isFirebaseConnected ? (
              <>
                {cloudSubs.length || diffSummary.cloudCount}{' '}
                <span className="text-xs font-sans font-bold text-slate-500">ملف متزامن سحابياً</span>
              </>
            ) : (
              <span className="text-sm font-sans font-bold text-amber-700">غير مربوط بحساب غوغل</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate">
            {isFirebaseConnected
              ? `متصل عبر: ${googleUserEmail}`
              : 'اربط حساب غوغل أسفله لتفعيل المزامنة السحابية الآمنة.'}
          </p>
        </div>
      </div>

      {/* Google Sheets & Google Sign-In Control Panel */}
      <div className="bg-white rounded-[24px] sm:rounded-[32px] border border-slate-200 p-5 sm:p-7 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-black text-slate-900">التصدير والمزامنة المباشرة إلى Google Sheets</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                تصدير جدول متكامل من 4 تبويبات (ملخص الجلسة، نتائج التلاميذ، تحليل الأسئلة والعوائق، مقارنة الفصول) مباشرة إلى حسابك في Google Drive.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={connectingGoogle}
            onClick={handleConnectGoogleSheets}
            className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shrink-0 ${
              sheetsConnected
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {connectingGoogle ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : sheetsConnected ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span>
              {sheetsConnected
                ? `متصل بـ Google Sheets (${googleUserEmail || 'مفوّض'})`
                : 'ربط حساب غوغل وتفعيل Google Sheets'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700">نطاق البيانات المراد تصديرها:</label>
            <select
              value={exportScopeSessionId}
              onChange={(e) => setExportScopeSessionId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="all">جميع الجلسات ({submissions.length} ملف)</option>
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.title} — {s.sessionId}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700">الوجهة في Google Sheets:</label>
            <select
              value={targetSpreadsheetId}
              onChange={(e) => setTargetSpreadsheetId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500"
            >
              <option value="new">إنشاء ملف Google Sheets جديد</option>
              {sheetExports.map((exp) => (
                <option key={exp.spreadsheetId} value={exp.spreadsheetId}>
                  تحديث: {exp.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-black text-slate-700">اسم ملف Google Sheets:</label>
            <input
              type="text"
              disabled={targetSpreadsheetId !== 'new'}
              value={targetSpreadsheetId === 'new' ? customSheetTitle : sheetExports.find((r) => r.spreadsheetId === targetSpreadsheetId)?.title || ''}
              onChange={(e) => setCustomSheetTitle(e.target.value)}
              placeholder={defaultSheetTitle}
              className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              سيتم تضمين <strong className="text-slate-800 font-mono tabular-nums">{scopedExportSubmissions.length}</strong> سجل تلميذ، مع مؤشرات المصداقية والتناقضات والعوائق.
            </span>
          </div>

          <button
            type="button"
            disabled={exportingSheets || scopedExportSubmissions.length === 0 || !sheetsConnected}
            onClick={() => setShowSheetsConfirmModal(true)}
            className="min-h-[46px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition"
          >
            {exportingSheets ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            <span>{targetSpreadsheetId === 'new' ? 'تصدير إلى Google Sheets' : 'تحديث الملف في Google Sheets'}</span>
          </button>
        </div>

        {/* Previous Google Sheet Exports History */}
        {sheetExports.length > 0 && (
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <h5 className="text-xs font-black text-slate-700">ملفات Google Sheets المرتبطة مؤخراً</h5>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {sheetExports.slice(0, 5).map((rec) => (
                <div
                  key={rec.spreadsheetId}
                  className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/40"
                >
                  <div>
                    <p className="text-xs font-black text-slate-900">{rec.title}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      آخر مزامنة: {new Date(rec.lastExportedAt).toLocaleString('ar-MA')} · الصفوف المصدرة: {rec.rowCount}
                    </p>
                  </div>
                  <a
                    href={rec.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 transition shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>فتح في Google Sheets</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Offline Backup / Restore JSON */}
      <div className="bg-white rounded-[24px] border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-black text-slate-900">الأرشفة المحلية اليدوية (JSON Backup)</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            احفظ نسخة احتياطية كاملة على جهازك أو استورد ملفاً محلياً للمزامنة مع الخادم.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadBackupJson}
            className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل نسخة محلية (JSON)</span>
          </button>

          <label className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition">
            <Upload className="w-4 h-4" />
            <span>استيراد نسخة (JSON)</span>
            <input type="file" accept=".json,application/json" onChange={handleImportBackupJson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Explicit Confirmation Modal before creating/updating Google Sheets */}
      {showSheetsConfirmModal && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-[120] flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-black text-slate-900">تأكيد التصدير إلى Google Sheets</h4>
              <button
                type="button"
                onClick={() => setShowSheetsConfirmModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <p>
                <strong>العملية:</strong>{' '}
                {targetSpreadsheetId === 'new' ? 'إنشاء ملف جداول بيانات جديد في حساب غوغل' : 'تحديث واستبدال بيانات الملف المحدد'}
              </p>
              <p>
                <strong>عنوان الملف:</strong>{' '}
                {targetSpreadsheetId === 'new'
                  ? customSheetTitle.trim() || defaultSheetTitle
                  : sheetExports.find((r) => r.spreadsheetId === targetSpreadsheetId)?.title}
              </p>
              <p>
                <strong>التبويبات الأربعة:</strong> ملخص الجلسة · نتائج التلاميذ · تحليل الأسئلة والعوائق · مقارنة الفصول
              </p>
              <p className="tabular-nums">
                <strong>عدد سجلات التلاميذ التي ستُكتب:</strong> {scopedExportSubmissions.length} تلميذ(ة)
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSheetsConfirmModal(false)}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmedSheetsExport}
                className="min-h-[44px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black cursor-pointer"
              >
                موافقة وتصدير البيانات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataSyncHub;
