/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface FileChecksumEntry {
  file: string;
  exists: boolean;
  bytes: number;
  sha256: string;
  recordCount: number;
}

export interface MigrationOrphanRecord {
  collection: 'sessions' | 'submissions' | 'forms' | 'reports' | 'notifications' | 'notificationSettings';
  sourceId: string;
  reason: string;
}

export interface DryRunMigrationReport {
  mode: 'dry-run';
  targetDatabase: string;
  projectId: string;
  dataDir: string;
  generatedAt: string;
  writesExecuted: 0;
  checksums: FileChecksumEntry[];
  collections: {
    teachers: number;
    sessions: number;
    publicSessions: number;
    ownerLinks: number;
    submissions: number;
    forms: number;
    reports: number;
    configLandingPage: number;
    notificationSettings: number;
    notifications: number;
    migrationOrphans: number;
  };
  orphans: MigrationOrphanRecord[];
  invariantsChecked: string[];
  sampleTransformedPreview: {
    publicSessionKeys?: string[];
    submissionForbiddenFieldsStripped: string[];
  };
}

function sanitizeId(raw: string, fallbackPrefix = 'id'): string {
  const clean = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return clean || `${fallbackPrefix}_${crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 12)}`;
}

function deterministicOwnerRef(seed: string): string {
  const digest = crypto.createHash('sha256').update(`philoscan:owner:${seed}`).digest('hex').slice(0, 32);
  return `own_${digest}`;
}

function isValidImageUrl(url: unknown): boolean {
  if (url === undefined || url === null || url === '') return true;
  if (typeof url !== 'string') return false;
  if (url.length <= 500 && /^https:\/\/[^\s<>"']+$/.test(url)) return true;
  if (url.length <= 250_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) return true;
  return false;
}

function readJsonFileSafe(filePath: string): {
  exists: boolean;
  bytes: number;
  sha256: string;
  parsed: unknown;
} {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      bytes: 0,
      sha256: crypto.createHash('sha256').update('').digest('hex'),
      parsed: [],
    };
  }
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    return { exists: true, bytes: buf.byteLength, sha256, parsed };
  } catch {
    return { exists: true, bytes: buf.byteLength, sha256, parsed: null };
  }
}

export function runDryRunMigration(dataDir = path.resolve(process.cwd(), 'data')): DryRunMigrationReport {
  const files = {
    teachers: 'teachers.json',
    sessions: 'sessions.json',
    submissions: 'submissions.json',
    forms: 'forms.json',
    reports: 'reports.json',
    landingPage: 'landing_page.json',
    notificationSettings: 'notification_settings.json',
    notifications: 'notifications.json',
  } as const;

  const checksums: FileChecksumEntry[] = [];
  const loaded: Record<string, any> = {};

  for (const [key, filename] of Object.entries(files)) {
    const res = readJsonFileSafe(path.join(dataDir, filename));
    const count = Array.isArray(res.parsed)
      ? res.parsed.length
      : res.parsed && typeof res.parsed === 'object'
      ? 1
      : 0;
    checksums.push({
      file: filename,
      exists: res.exists,
      bytes: res.bytes,
      sha256: res.sha256,
      recordCount: count,
    });
    loaded[key] = res.parsed;
  }

  const orphans: MigrationOrphanRecord[] = [];
  const rawTeachers: any[] = Array.isArray(loaded.teachers) ? loaded.teachers : [];
  const rawSessions: any[] = Array.isArray(loaded.sessions) ? loaded.sessions : [];
  const rawSubmissions: any[] = Array.isArray(loaded.submissions) ? loaded.submissions : [];
  const rawForms: any[] = Array.isArray(loaded.forms) ? loaded.forms : [];
  const rawReports: any[] = Array.isArray(loaded.reports) ? loaded.reports : [];
  const rawSettings: any[] = Array.isArray(loaded.notificationSettings) ? loaded.notificationSettings : [];
  const rawNotifications: any[] = Array.isArray(loaded.notifications) ? loaded.notifications : [];

  const teacherByEmail = new Map<string, string>();
  const teacherIds = new Set<string>();
  const transformedTeachers: Record<string, any>[] = [];

  for (const t of rawTeachers) {
    const uid = sanitizeId(t.uid || t.id || t.email, 'tch');
    const email = String(t.email || '').toLowerCase().trim();
    if (!email) continue;
    teacherIds.add(uid);
    teacherByEmail.set(email, uid);
    transformedTeachers.push({
      uid,
      email,
      fullName: String(t.fullName || email.split('@')[0]).slice(0, 256),
      school: t.school ? String(t.school).slice(0, 256) : undefined,
      regionalAcademy: t.regionalAcademy ? String(t.regionalAcademy).slice(0, 256) : undefined,
      province: t.province ? String(t.province).slice(0, 128) : undefined,
      specialty: t.specialty ? String(t.specialty).slice(0, 128) : undefined,
      role: t.role === 'admin' ? 'admin' : 'teacher',
      isDisabled: Boolean(t.isDisabled),
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
    });
  }

  const sessionMap = new Map<string, { teacherId: string; ownerRef: string }>();
  const transformedSessions: Record<string, any>[] = [];
  const transformedPublicSessions: Record<string, any>[] = [];
  const transformedOwnerLinks: Record<string, any>[] = [];

  for (const s of rawSessions) {
    const sessionId = sanitizeId(String(s.sessionId || '').toUpperCase(), 'sess');
    const email = String(s.teacherEmail || '').toLowerCase().trim();
    const resolvedTeacherId = sanitizeId(s.teacherId || teacherByEmail.get(email) || '', 'tch');
    const ownerRef =
      typeof s.ownerRef === 'string' && /^own_[a-f0-9]{32}$/.test(s.ownerRef)
        ? s.ownerRef
        : deterministicOwnerRef(`${sessionId}:${resolvedTeacherId}`);

    if (!s.teacherId && !teacherByEmail.has(email)) {
      orphans.push({
        collection: 'sessions',
        sourceId: sessionId,
        reason: 'missing_resolved_teacher_uid',
      });
    }

    sessionMap.set(sessionId, { teacherId: resolvedTeacherId, ownerRef });

    transformedSessions.push({
      sessionId,
      ownerRef,
      teacherId: resolvedTeacherId,
      teacherEmail: email,
      institution: String(s.institution || '').slice(0, 200),
      level: String(s.level || '').slice(0, 100),
      stream: String(s.stream || '').slice(0, 100),
      class: String(s.classNumber || s.class || '1').slice(0, 128),
      classNumber: String(s.classNumber || '1').slice(0, 40),
      title: String(s.title || '').slice(0, 200),
      province: String(s.province || '').slice(0, 120),
      isActive: !s.isFrozen,
      supervisedMode: Boolean(s.supervisedMode),
      formId: String(s.formId || 'official-perceptions').slice(0, 120),
      formTitle: String(s.formTitle || '').slice(0, 200),
    });

    // Strictly sanitized publicSessions (no teacherId, teacherEmail, customWeights, questions)
    transformedPublicSessions.push({
      sessionId,
      ownerRef,
      title: String(s.title || '').slice(0, 200),
      institution: String(s.institution || '').slice(0, 200),
      level: String(s.level || '').slice(0, 100),
      stream: String(s.stream || '').slice(0, 100),
      class: String(s.classNumber || s.class || '1').slice(0, 128),
      classNumber: String(s.classNumber || '1').slice(0, 40),
      province: String(s.province || '').slice(0, 120),
      isActive: !s.isFrozen,
      supervisedMode: Boolean(s.supervisedMode),
      formId: String(s.formId || 'official-perceptions').slice(0, 120),
      formTitle: String(s.formTitle || '').slice(0, 200),
    });

    transformedOwnerLinks.push({
      ownerRef,
      teacherId: resolvedTeacherId,
      sessionId,
    });
  }

  const transformedSubmissions: Record<string, any>[] = [];
  for (const sub of rawSubmissions) {
    const rawSessId = String(sub.sessionId || sub.session_id || '').toUpperCase().trim();
    const cleanSessId = rawSessId ? sanitizeId(rawSessId, 'sess') : '';
    const sessionMeta = cleanSessId ? sessionMap.get(cleanSessId) : undefined;
    const rawStudentUid = sub.studentAuthUid || `legacy_${crypto.createHash('sha256').update(String(sub.id || sub.studentName || '')).digest('hex').slice(0, 16)}`;
    const studentAuthUid = sanitizeId(rawStudentUid, 'stu');
    const deterministicSubId = cleanSessId ? `${cleanSessId}_${studentAuthUid}` : sanitizeId(sub.id || '', 'sub');

    if (!cleanSessId || !sessionMeta) {
      orphans.push({
        collection: 'submissions',
        sourceId: String(sub.id || deterministicSubId),
        reason: !cleanSessId ? 'missing_session_id' : `unmatched_session_${cleanSessId}`,
      });
      continue;
    }

    // Option A: Strip trustedAnalysis and analysisStatus unconditionally
    const { trustedAnalysis: _t, analysisStatus: _s, ...cleanRecord } = sub;
    transformedSubmissions.push({
      id: deterministicSubId,
      legacyId: sub.id,
      sessionId: cleanSessId,
      ownerRef: sessionMeta.ownerRef,
      studentAuthUid,
      studentName: String(cleanRecord.studentName || cleanRecord.student_name || 'تلميذ').slice(0, 128),
      teacherId: sessionMeta.teacherId,
      answers: cleanRecord.answers || cleanRecord.responses || {},
      analysis: cleanRecord.analysis || {},
    });
  }

  const transformedForms: Record<string, any>[] = [];
  for (const f of rawForms) {
    const formId = sanitizeId(f.formId || f.id, 'form');
    const teacherId = sanitizeId(f.teacherId || teacherByEmail.get(String(f.teacherEmail || '').toLowerCase().trim()) || '', 'tch');
    if (!f.teacherId && !teacherByEmail.has(String(f.teacherEmail || '').toLowerCase().trim())) {
      orphans.push({ collection: 'forms', sourceId: formId, reason: 'missing_teacher_uid' });
      continue;
    }
    transformedForms.push({
      formId,
      title: String(f.title || '').slice(0, 200),
      teacherId,
      status: f.status || 'saved',
      isTemplate: Boolean(f.isTemplate),
    });
  }

  const transformedReports: Record<string, any>[] = [];
  for (const r of rawReports) {
    const reportId = sanitizeId(r.id, 'rep');
    if (!isValidImageUrl(r.imageUrl)) {
      orphans.push({ collection: 'reports', sourceId: reportId, reason: 'invalid_image_url_format_or_size' });
      continue;
    }
    const reporterUid = sanitizeId(r.reporterUid || teacherByEmail.get(String(r.reporterEmail || '').toLowerCase().trim()) || '', 'tch');
    transformedReports.push({
      id: reportId,
      reporterUid,
      status: 'pending',
      description: String(r.description || '').slice(0, 3000),
    });
  }

  const configLandingPageCount =
    loaded.landingPage && typeof loaded.landingPage === 'object' && !Array.isArray(loaded.landingPage) ? 1 : 0;

  return {
    mode: 'dry-run',
    projectId: 'project-ae3ca3a5-d34f-42a5-a4a',
    targetDatabase: 'ai-studio-d15e3b81-015e-4e2a-bd5c-ec61f18d0bde',
    dataDir,
    generatedAt: new Date().toISOString(),
    writesExecuted: 0,
    checksums,
    collections: {
      teachers: transformedTeachers.length,
      sessions: transformedSessions.length,
      publicSessions: transformedPublicSessions.length,
      ownerLinks: transformedOwnerLinks.length,
      submissions: transformedSubmissions.length,
      forms: transformedForms.length,
      reports: transformedReports.length,
      configLandingPage: configLandingPageCount,
      notificationSettings: rawSettings.length,
      notifications: rawNotifications.length,
      migrationOrphans: orphans.length,
    },
    orphans,
    invariantsChecked: [
      'zero_writes_executed_in_dry_run',
      'publicSessions_stripped_of_teacherId_teacherEmail_customWeights_questions',
      'submissions_stripped_of_trustedAnalysis_and_analysisStatus_Option_A',
      'deterministic_submissionId_sessionId_studentAuthUid',
      'reports_imageUrl_strict_https_or_base64_limit',
    ],
    sampleTransformedPreview: {
      publicSessionKeys: transformedPublicSessions[0] ? Object.keys(transformedPublicSessions[0]) : [],
      submissionForbiddenFieldsStripped: ['trustedAnalysis', 'analysisStatus'],
    },
  };
}

const isMainCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('migrate-json-to-firestore.ts');

if (isMainCli) {
  const args = process.argv.slice(2);
  const wantsLive = args.includes('--live') || args.includes('--write');
  if (wantsLive || process.env.PHILOSCAN_ALLOW_LIVE_MIGRATION === 'true') {
    console.error(
      '[PhiloScan Migration Guard] Phase 1 restricts scripts/migrate-json-to-firestore.ts to strict read-only --dry-run mode. Live Firestore writes are blocked.'
    );
    process.exit(2);
  }

  const customDataDirIdx = args.indexOf('--data-dir');
  const dataDir =
    customDataDirIdx !== -1 && args[customDataDirIdx + 1]
      ? path.resolve(args[customDataDirIdx + 1])
      : path.resolve(process.cwd(), 'data');

  const report = runDryRunMigration(dataDir);
  console.log(JSON.stringify(report, null, 2));
}
