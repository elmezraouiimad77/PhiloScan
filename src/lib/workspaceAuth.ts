/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { auth } from './firebase';
import { DiagnosticSession, GoogleSheetExportRecord, StudentSubmission } from '../types';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

// Access token stored strictly in memory (never in localStorage or sessionStorage)
let cachedSheetsAccessToken: string | null = null;
let cachedUserEmail: string | null = null;

// Automatically clear in-memory Workspace token when user signs out
onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedSheetsAccessToken = null;
    cachedUserEmail = null;
  } else if (user.email) {
    cachedUserEmail = user.email.toLowerCase().trim();
  }
});

export function setWorkspaceAccessToken(token: string | null, email?: string | null) {
  cachedSheetsAccessToken = token;
  if (email) {
    cachedUserEmail = email.toLowerCase().trim();
  }
}

export function getWorkspaceAccessToken(): string | null {
  return cachedSheetsAccessToken;
}

export function hasWorkspaceAccessToken(): boolean {
  return Boolean(cachedSheetsAccessToken && cachedSheetsAccessToken.trim().length > 10);
}

export function clearWorkspaceAccessToken() {
  cachedSheetsAccessToken = null;
}

export function getCachedGoogleEmail(): string | null {
  return auth.currentUser?.email?.toLowerCase().trim() || cachedUserEmail;
}

/**
 * Formats Firebase Auth / Google OAuth popup errors into clear Arabic instructions,
 * specifically guiding the user if a newly published Cloud Run domain is not yet allowlisted.
 */
export function formatFirebaseAuthErrorAr(error: any): string {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain')) {
    return `نطاق النشر الحالي (${host}) غير مضاف بعد في قائمة النطاقات المصرح بها (Authorized Domains) في Firebase Auth. يرجى إضافته من: Firebase Console > Authentication > Settings > Authorized domains.`;
  }
  if (code === 'auth/popup-blocked' || message.includes('popup-blocked')) {
    return 'قام المتصفح بحظر نافذة تسجيل الدخول المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم إعادة المحاولة.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'تم إغلاق نافذة تسجيل الدخول عبر Google قبل إتمام العملية.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بخدمة المصادقة. يرجى التحقق من جودة الاتصال بالإنترنت ثم إعادة المحاولة.';
  }
  return message || 'حدث خطأ أثناء المصادقة عبر حساب Google.';
}

/**
 * Authenticates via Firebase GoogleAuthProvider requesting minimal Google Sheets scope
 * and caches the returned OAuth access token strictly in memory.
 */
export async function signInWithGoogleSheets(loginHint?: string): Promise<{
  user: User;
  accessToken: string;
}> {
  const provider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));

  const params: Record<string, string> = {
    prompt: 'select_account',
  };
  if (loginHint && loginHint.includes('@')) {
    params.login_hint = loginHint.trim().toLowerCase();
  }
  provider.setCustomParameters(params);

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('تعذر استرجاع رمز الوصول المؤقت لـ Google Sheets. يرجى إعادة المحاولة ومنح الإذن.');
    }

    cachedSheetsAccessToken = credential.accessToken;
    cachedUserEmail = result.user.email?.toLowerCase().trim() || null;

    return {
      user: result.user,
      accessToken: credential.accessToken,
    };
  } catch (err: any) {
    throw new Error(formatFirebaseAuthErrorAr(err));
  }
}

interface ExportSpreadsheetParams {
  spreadsheetId?: string;
  title: string;
  teacherName: string;
  teacherEmail: string;
  selectedSession?: DiagnosticSession | null;
  sessions: DiagnosticSession[];
  submissions: StudentSubmission[];
}

const TAB_SUMMARY = 'ملخص الجلسة';
const TAB_STUDENTS = 'نتائج التلاميذ';
const TAB_BREAKDOWN = 'تحليل الأسئلة والعوائق';
const TAB_CLASSES = 'مقارنة الفصول';

async function sheetsApiFetch(url: string, accessToken: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 || response.status === 403) {
    clearWorkspaceAccessToken();
    throw new Error('انتهت صلاحية جلسة Google Sheets أو لم يتم منح الإذن. يرجى إعادة الربط بحساب غوغل.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data?.error?.message || `فشل الاتصال بواجهة Google Sheets (HTTP ${response.status}).`;
    throw new Error(errMsg);
  }
  return data;
}

function buildSpreadsheetRows(params: ExportSpreadsheetParams) {
  const { title, teacherName, teacherEmail, selectedSession, sessions, submissions } = params;
  const total = submissions.length;
  const avg = (getter: (s: StudentSubmission) => number) =>
    total > 0 ? Math.round(submissions.reduce((acc, s) => acc + getter(s), 0) / total) : 0;

  const avgCritical = avg((s) => s.analysis?.metrics?.criticalThinking || 0);
  const avgCuriosity = avg((s) => s.analysis?.metrics?.cognitiveCuriosity || 0);
  const avgFear = avg((s) => s.analysis?.metrics?.cognitiveFear || 0);
  const avgShallow = avg((s) => s.analysis?.metrics?.shallowThinking || 0);
  const avgCredibility = avg((s) => s.analysis?.credibilityAssessment?.overallScore ?? s.reliabilityIndex ?? 100);

  const summaryRows: (string | number)[][] = [
    ['منصة فِيلوسكان (PhiloScan) — التقرير التربوي المتكامل', ''],
    ['عنوان التصدير', title],
    ['الأستاذ الموجه', `${teacherName} (${teacherEmail})`],
    ['الجلسة المختارة', selectedSession ? `${selectedSession.title} (${selectedSession.sessionId})` : 'جميع الجلسات والفصول'],
    ['المؤسسة التعليمية', selectedSession?.institution || submissions[0]?.institution || '—'],
    ['تاريخ التصدير والمزامنة', new Date().toLocaleString('ar-MA')],
    ['عدد التلاميذ المصنفين', total],
    ['متوسط التفكير النقدي (%)', avgCritical],
    ['متوسط الفضول المعرفي (%)', avgCuriosity],
    ['متوسط الخوف المعرفي (%)', avgFear],
    ['متوسط التفكير السطحي (%)', avgShallow],
    ['متوسط مؤشر المصداقية (%)', avgCredibility],
  ];

  const studentsHeader = [
    'المعرف',
    'اسم التلميذ(ة)',
    'رمز الجلسة',
    'رقم الإيصال الموثق',
    'المستوى والشعبة والقسم',
    'النمط الفكري النهائي',
    'التفكير النقدي (%)',
    'الفضول المعرفي (%)',
    'الخوف المعرفي (%)',
    'التفكير السطحي (%)',
    'مؤشر المصداقية (%)',
    'حكم الموثوقية',
    'عدد التناقضات',
    'أبرز العوائق المعرفية',
    'التفسير التربوي',
    'التوصيات البيداغوجية',
    'ملاحظات الأستاذ',
    'تاريخ الإرسال',
  ];

  const studentsRows: (string | number)[][] = [
    studentsHeader,
    ...submissions.map((sub) => {
      const m = sub.analysis?.metrics || { criticalThinking: 0, cognitiveCuriosity: 0, cognitiveFear: 0, shallowThinking: 0 };
      const finalCls = sub.overriddenClassification || sub.analysis?.classification || 'غير محدد';
      const cred = sub.analysis?.credibilityAssessment;
      const obstacles = (sub.analysis?.cognitiveObstacles || []).map((o) => o.title).join(' | ') || 'لا عوائق بارزة';
      const recs = (sub.analysis?.pedagogicalRecommendationsList || []).join(' | ') || sub.analysis?.pedagogicalRecommendation || '';
      return [
        sub.id,
        sub.studentName,
        sub.sessionId || sub.session_id || '',
        sub.deliveryReceiptId || '—',
        `${sub.level || ''} - ${sub.stream || ''} (${sub.classNumber || sub.class || ''})`,
        finalCls,
        Math.round(m.criticalThinking || 0),
        Math.round(m.cognitiveCuriosity || 0),
        Math.round(m.cognitiveFear || 0),
        Math.round(m.shallowThinking || 0),
        Math.round(cred?.overallScore ?? sub.reliabilityIndex ?? 100),
        cred?.verdict || 'موثوقة نسبياً',
        sub.analysis?.contradictions?.length || 0,
        obstacles,
        sub.analysis?.explanation || '',
        recs,
        sub.teacherNotes || '',
        sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('ar-MA') : '',
      ];
    }),
  ];

  const breakdownRows: (string | number)[][] = [
    [
      'اسم التلميذ(ة)',
      'نوع البند',
      'السؤال / المحور / العائق',
      'التفصيل أو الجواب',
      'الدرجة / الحدة',
      'التفسير أو التدخل المقترح',
    ],
  ];

  submissions.forEach((sub) => {
    (sub.analysis?.questionBreakdown || []).forEach((qb) => {
      breakdownRows.push([
        sub.studentName,
        'تفكيك سؤال',
        `${qb.dimension}: ${qb.questionLabel}`,
        qb.answerText,
        `${Math.round(qb.depthScore)}%`,
        qb.semanticNote,
      ]);
    });
    (sub.analysis?.contradictions || []).forEach((c) => {
      breakdownRows.push([
        sub.studentName,
        'تناقض دلالي',
        c.pairLabel,
        `${c.questionA} ↔ ${c.questionB}`,
        c.severity,
        c.description,
      ]);
    });
    (sub.analysis?.cognitiveObstacles || []).forEach((o) => {
      breakdownRows.push([
        sub.studentName,
        'عائق معرفي',
        `${o.title} (${o.category})`,
        o.evidence,
        o.severity,
        o.intervention,
      ]);
    });
  });

  const classesRows: (string | number)[][] = [
    [
      'رمز الجلسة',
      'عنوان الجلسة / الفصل',
      'المستوى والشعبة',
      'عدد المشاركين',
      'متوسط النقدي (%)',
      'متوسط الفضول (%)',
      'متوسط الخوف (%)',
      'متوسط السطحي (%)',
      'متوسط المصداقية (%)',
      'النمط الغالب',
    ],
  ];

  sessions.forEach((sess) => {
    const classSubs = submissions.filter(
      (s) => (s.sessionId || s.session_id || '').toUpperCase() === sess.sessionId.toUpperCase()
    );
    const n = classSubs.length;
    const cAvg = (fn: (s: StudentSubmission) => number) =>
      n > 0 ? Math.round(classSubs.reduce((acc, s) => acc + fn(s), 0) / n) : 0;

    const counts: Record<string, number> = {};
    classSubs.forEach((s) => {
      const k = s.overriddenClassification || s.analysis?.classification || 'تفكير نقدي';
      counts[k] = (counts[k] || 0) + 1;
    });
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    classesRows.push([
      sess.sessionId,
      `${sess.title} (قسم ${sess.classNumber})`,
      `${sess.level} - ${sess.stream}`,
      n,
      cAvg((s) => s.analysis?.metrics?.criticalThinking || 0),
      cAvg((s) => s.analysis?.metrics?.cognitiveCuriosity || 0),
      cAvg((s) => s.analysis?.metrics?.cognitiveFear || 0),
      cAvg((s) => s.analysis?.metrics?.shallowThinking || 0),
      cAvg((s) => s.analysis?.credibilityAssessment?.overallScore ?? s.reliabilityIndex ?? 100),
      dominant,
    ]);
  });

  return { summaryRows, studentsRows, breakdownRows, classesRows };
}

/**
 * Creates a new Google Spreadsheet or safely updates an existing one after
 * dynamically discovering sheet metadata (never assumes "Sheet1" blindly).
 */
export async function exportPhiloScanToGoogleSheets(
  params: ExportSpreadsheetParams
): Promise<GoogleSheetExportRecord> {
  const accessToken = getWorkspaceAccessToken();
  if (!accessToken) {
    throw new Error('يرجى ربط حساب Google Sheets أولاً لمنح صلاحية التصدير.');
  }

  let spreadsheetId = params.spreadsheetId?.trim() || '';
  let spreadsheetUrl = '';
  const desiredTabs = [TAB_SUMMARY, TAB_STUDENTS, TAB_BREAKDOWN, TAB_CLASSES];
  const sheetIdsByName: Record<string, number> = {};

  if (!spreadsheetId) {
    const created = await sheetsApiFetch('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: params.title,
          locale: 'ar_MA',
        },
        sheets: desiredTabs.map((tabName, idx) => ({
          properties: {
            title: tabName,
            index: idx,
            rightToLeft: true,
            gridProperties: { frozenRowCount: idx === 0 ? 0 : 1 },
          },
        })),
      }),
    });

    spreadsheetId = created.spreadsheetId;
    spreadsheetUrl = created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    (created.sheets || []).forEach((s: any) => {
      if (s?.properties?.title !== undefined && s?.properties?.sheetId !== undefined) {
        sheetIdsByName[s.properties.title] = s.properties.sheetId;
      }
    });
  } else {
    // Always fetch spreadsheet metadata first to discover real tab titles
    const meta = await sheetsApiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetUrl,sheets.properties`,
      accessToken
    );
    spreadsheetUrl = meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    const existingTabs = new Set<string>();
    (meta.sheets || []).forEach((s: any) => {
      if (s?.properties?.title) {
        existingTabs.add(s.properties.title);
        sheetIdsByName[s.properties.title] = s.properties.sheetId;
      }
    });

    const missingTabs = desiredTabs.filter((t) => !existingTabs.has(t));
    if (missingTabs.length > 0) {
      const addRes = await sheetsApiFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: missingTabs.map((t) => ({
              addSheet: {
                properties: {
                  title: t,
                  rightToLeft: true,
                  gridProperties: { frozenRowCount: t === TAB_SUMMARY ? 0 : 1 },
                },
              },
            })),
          }),
        }
      );
      (addRes.replies || []).forEach((r: any) => {
        const props = r?.addSheet?.properties;
        if (props?.title && props?.sheetId !== undefined) {
          sheetIdsByName[props.title] = props.sheetId;
        }
      });
    }

    // Clear existing ranges before overwriting cleanly
    await sheetsApiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          ranges: desiredTabs.map((t) => `'${t}'!A:Z`),
        }),
      }
    );
  }

  const { summaryRows, studentsRows, breakdownRows, classesRows } = buildSpreadsheetRows(params);

  await sheetsApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${TAB_SUMMARY}'!A1`, values: summaryRows },
          { range: `'${TAB_STUDENTS}'!A1`, values: studentsRows },
          { range: `'${TAB_BREAKDOWN}'!A1`, values: breakdownRows },
          { range: `'${TAB_CLASSES}'!A1`, values: classesRows },
        ],
      }),
    }
  );

  // Format header rows cleanly
  const formatRequests: any[] = [];
  desiredTabs.forEach((tabName) => {
    const sid = sheetIdsByName[tabName];
    if (sid !== undefined) {
      formatRequests.push({
        repeatCell: {
          range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
                fontSize: 10,
              },
              horizontalAlignment: 'RIGHT',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
        },
      });
      formatRequests.push({
        autoResizeDimensions: {
          dimensions: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: 18 },
        },
      });
    }
  });

  if (formatRequests.length > 0) {
    await sheetsApiFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ requests: formatRequests }),
      }
    ).catch((err) => {
      console.warn('Non-critical Sheets formatting warning:', err);
    });
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title: params.title,
    sessionId: params.selectedSession?.sessionId || 'all',
    lastExportedAt: new Date().toISOString(),
    rowCount: params.submissions.length,
  };
}
