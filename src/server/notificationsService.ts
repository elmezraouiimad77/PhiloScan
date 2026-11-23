/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type {
  DiagnosticSession,
  NotificationCategory,
  NotificationPriority,
  NotificationProviderStatus,
  PedagogicalIndicatorType,
  PedagogicalNotification,
  StudentSubmission,
  TeacherNotificationSettings,
} from '../types';

function getDataDir(): string {
  return process.env.PHILOSCAN_DATA_DIR
    ? path.resolve(process.env.PHILOSCAN_DATA_DIR)
    : path.join(process.cwd(), 'data');
}
const getNotificationSettingsFile = () => path.join(getDataDir(), 'notification_settings.json');
const getNotificationsFile = () => path.join(getDataDir(), 'notifications.json');

let settingsWriteQueue: Promise<any> = Promise.resolve();
let notificationsWriteQueue: Promise<any> = Promise.resolve();

function ensureNotificationStorage() {
  const dir = getDataDir();
  const settingsFile = getNotificationSettingsFile();
  const notifsFile = getNotificationsFile();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(notifsFile)) {
    fs.writeFileSync(notifsFile, JSON.stringify([], null, 2), 'utf-8');
  }
}

export async function loadNotificationSettingsList(): Promise<TeacherNotificationSettings[]> {
  ensureNotificationStorage();
  try {
    const raw = await fs.promises.readFile(getNotificationSettingsFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading notification settings:', err);
    return [];
  }
}

export async function saveNotificationSettingsList(list: TeacherNotificationSettings[]): Promise<void> {
  ensureNotificationStorage();
  const next = settingsWriteQueue
    .then(async () => {
      const target = getNotificationSettingsFile();
      const tmp = target + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(list, null, 2), 'utf-8');
      await fs.promises.rename(tmp, target);
    })
    .catch((err) => {
      console.error('Recovered notification settings write error:', err);
    });
  settingsWriteQueue = next;
  await next;
}

export async function loadNotificationsList(): Promise<PedagogicalNotification[]> {
  ensureNotificationStorage();
  try {
    const raw = await fs.promises.readFile(getNotificationsFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error loading notifications:', err);
    return [];
  }
}

export async function saveNotificationsList(list: PedagogicalNotification[]): Promise<void> {
  ensureNotificationStorage();
  const next = notificationsWriteQueue
    .then(async () => {
      const target = getNotificationsFile();
      const tmp = target + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(list, null, 2), 'utf-8');
      await fs.promises.rename(tmp, target);
    })
    .catch((err) => {
      console.error('Recovered notifications write error:', err);
    });
  notificationsWriteQueue = next;
  await next;
}

export function getDefaultTeacherNotificationSettings(
  teacherId: string,
  teacherEmail: string
): TeacherNotificationSettings {
  return {
    teacherId: teacherId || 'TCH-DEMO',
    teacherEmail: (teacherEmail || '').toLowerCase().trim(),
    consentAccepted: false,
    consentTimestamp: null,
    disableAllExternal: true,
    channels: {
      inApp: false,
      email: false,
      whatsapp: false,
    },
    emailConfig: {
      address: '',
      verified: false,
      lastTestAt: null,
    },
    whatsappConfig: {
      countryCode: '+212',
      phoneNumber: '',
      e164Phone: '',
      consentAccepted: false,
      consentTimestamp: null,
      verified: false,
      lastTestAt: null,
    },
    messageTypes: {
      classAlerts: true,
      studentAlerts: true,
      aiRecommendations: true,
      sessionSummaries: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function isValidEmailAddress(email: string): boolean {
  const clean = String(email || '').trim();
  if (!clean || clean.length > 200) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(clean);
}

export function normalizeAndValidatePhone(
  countryCode: string,
  phoneNumber: string
): { valid: boolean; cleanCountryCode: string; cleanPhoneNumber: string; e164Phone: string; error?: string } {
  const ccRaw = String(countryCode || '').trim().replace(/[^\d+]/g, '');
  const cleanCC = ccRaw.startsWith('+') ? ccRaw : `+${ccRaw.replace(/^0+/, '')}`;
  if (!/^\+[1-9]\d{0,3}$/.test(cleanCC)) {
    return {
      valid: false,
      cleanCountryCode: cleanCC || '+212',
      cleanPhoneNumber: '',
      e164Phone: '',
      error: 'رمز الدولة غير صالح (مثال: +212).',
    };
  }

  let digits = String(phoneNumber || '').replace(/[^\d]/g, '');
  // Strip single leading national 0 when paired with country code (e.g. 0612345678 -> 612345678)
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = digits.slice(1);
  }
  if (!/^\d{6,14}$/.test(digits)) {
    return {
      valid: false,
      cleanCountryCode: cleanCC,
      cleanPhoneNumber: digits,
      e164Phone: '',
      error: 'يرجى إدخال رقم هاتف صحيح مكون من 6 إلى 14 رقماً دون رمز الدولة.',
    };
  }

  const e164 = `${cleanCC}${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    return {
      valid: false,
      cleanCountryCode: cleanCC,
      cleanPhoneNumber: digits,
      e164Phone: '',
      error: 'صيغة الرقم الدولي (E.164) غير مكتملة.',
    };
  }

  return {
    valid: true,
    cleanCountryCode: cleanCC,
    cleanPhoneNumber: digits,
    e164Phone: e164,
  };
}

export function getNotificationProviderStatus(): NotificationProviderStatus {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const smtpPort = (process.env.SMTP_PORT || '').trim();
  const smtpUser = (process.env.SMTP_USER || '').trim();
  const smtpPass = (process.env.SMTP_PASS || '').trim();

  const resendConfigured = Boolean(resendKey && resendKey !== 'MY_RESEND_API_KEY');
  const smtpConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass);
  const emailConfigured = resendConfigured || smtpConfigured;
  const activeProvider: 'resend' | 'smtp' | 'none' = resendConfigured
    ? 'resend'
    : smtpConfigured
    ? 'smtp'
    : 'none';

  const waToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const waPhoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const waVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim();
  const whatsappConfigured = Boolean(waToken && waPhoneId);

  return {
    email: {
      configured: emailConfigured,
      activeProvider,
      resendConfigured,
      smtpConfigured,
      renderSmtpBlockedNote: smtpConfigured && !resendConfigured
        ? 'تنبيه: خطة Render Free تحجب منافذ SMTP (25/465/587)؛ يوصى بتفعيل Resend عبر HTTPS (RESEND_API_KEY).'
        : undefined,
      statusLabel: emailConfigured
        ? `مفعلة (${activeProvider === 'resend' ? 'Resend API' : 'خادم SMTP'})`
        : 'غير مفعلة — تحتاج إلى إعداد تقني على الخادم',
    },
    whatsapp: {
      configured: whatsappConfigured,
      apiVersion: waVersion,
      statusLabel: whatsappConfigured
        ? 'مفعلة (WhatsApp Business Cloud API)'
        : 'غير مفعلة — تحتاج إلى إعداد تقني على الخادم',
    },
  };
}

export async function sendPedagogicalEmail(params: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}): Promise<{ ok: boolean; status: 'sent' | 'not_configured' | 'failed'; provider: string; errorMessage?: string }> {
  const { to, subject, textBody, htmlBody } = params;
  if (!isValidEmailAddress(to)) {
    return {
      ok: false,
      status: 'failed',
      provider: 'none',
      errorMessage: 'عنوان البريد الإلكتروني المستلم غير صالح.',
    };
  }

  const providerStatus = getNotificationProviderStatus();
  if (!providerStatus.email.configured) {
    return {
      ok: false,
      status: 'not_configured',
      provider: 'none',
      errorMessage:
        'خدمة إرسال البريد الإلكتروني غير مفعلة على الخادم حالياً وتحتاج إلى إعداد تقني (RESEND_API_KEY أو إعدادات SMTP).',
    };
  }

  const fromEmail =
    (process.env.NOTIFICATION_FROM_EMAIL || '').trim() ||
    (process.env.SMTP_USER || '').trim() ||
    'PhiloScan Alerts <onboarding@resend.dev>';

  // 1. Try Resend API if configured
  if (providerStatus.email.resendConfigured) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(process.env.RESEND_API_KEY || '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      });
      if (resp.ok) {
        return { ok: true, status: 'sent', provider: 'resend' };
      }
      const errData = await resp.json().catch(() => ({}));
      const msg = errData?.message || `HTTP ${resp.status}`;
      if (!providerStatus.email.smtpConfigured) {
        return {
          ok: false,
          status: 'failed',
          provider: 'resend',
          errorMessage: `تعذر الإرسال عبر Resend: ${msg}`,
        };
      }
    } catch (err: any) {
      if (!providerStatus.email.smtpConfigured) {
        return {
          ok: false,
          status: 'failed',
          provider: 'resend',
          errorMessage: `تعذر الاتصال بخدمة Resend: ${err?.message || 'خطأ شبكة'}`,
        };
      }
    }
  }

  // 2. Try SMTP via Nodemailer if configured
  if (providerStatus.email.smtpConfigured) {
    try {
      const portNum = Number(process.env.SMTP_PORT || 587);
      const secureFlag =
        String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || portNum === 465;

      const transporter = nodemailer.createTransport({
        host: (process.env.SMTP_HOST || '').trim(),
        port: portNum,
        secure: secureFlag,
        auth: {
          user: (process.env.SMTP_USER || '').trim(),
          pass: (process.env.SMTP_PASS || '').trim(),
        },
      });

      await transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        text: textBody,
        html: htmlBody,
      });

      return { ok: true, status: 'sent', provider: 'smtp' };
    } catch (err: any) {
      return {
        ok: false,
        status: 'failed',
        provider: 'smtp',
        errorMessage: `فشل الإرسال عبر خادم SMTP: ${err?.message || 'تحقق من بيانات الاعتماد'}`,
      };
    }
  }

  return {
    ok: false,
    status: 'not_configured',
    provider: 'none',
    errorMessage: 'لم يتم تهيئة مزود بريد إلكتروني فعال.',
  };
}

export async function sendPedagogicalWhatsApp(params: {
  e164Phone: string;
  messageText: string;
}): Promise<{ ok: boolean; status: 'sent' | 'not_configured' | 'failed'; errorMessage?: string }> {
  const providerStatus = getNotificationProviderStatus();
  if (!providerStatus.whatsapp.configured) {
    return {
      ok: false,
      status: 'not_configured',
      errorMessage:
        'خدمة WhatsApp Business Cloud API غير مفعلة على الخادم حالياً وتحتاج إلى إعداد تقني (WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID).',
    };
  }

  const cleanTo = String(params.e164Phone || '').replace(/[^\d]/g, '');
  if (!cleanTo || cleanTo.length < 8) {
    return {
      ok: false,
      status: 'failed',
      errorMessage: 'رقم الهاتف الدولي غير صالح لإرسال رسالة WhatsApp.',
    };
  }

  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  const apiVersion = providerStatus.whatsapp.apiVersion || 'v21.0';

  try {
    const resp = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: params.messageText.slice(0, 4096),
        },
      }),
    });

    if (resp.ok) {
      return { ok: true, status: 'sent' };
    }

    const errJson = await resp.json().catch(() => ({}));
    const metaMsg = errJson?.error?.message || `HTTP ${resp.status}`;
    return {
      ok: false,
      status: 'failed',
      errorMessage: `تعذر الإرسال عبر WhatsApp Business Cloud API: ${metaMsg}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'failed',
      errorMessage: `تعذر الاتصال بخوادم WhatsApp Cloud API: ${err?.message || 'خطأ شبكة'}`,
    };
  }
}

function buildSafeReportPath(sessionId: string, notificationId?: string): string {
  const sid = encodeURIComponent(sessionId);
  const nid = notificationId ? `&notificationId=${encodeURIComponent(notificationId)}` : '';
  return `/#/teacher?tab=analytics&sessionId=${sid}${nid}`;
}

function buildSafeExternalUrl(reportPath: string): string {
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (!appUrl || appUrl === 'MY_APP_URL') {
    return reportPath;
  }
  return `${appUrl}${reportPath.startsWith('/') ? '' : '/'}${reportPath}`;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatExternalEmailBody(notif: PedagogicalNotification): { subject: string; textBody: string; htmlBody: string } {
  const safeUrl = buildSafeExternalUrl(notif.reportPath);
  const subject = `[PhiloScan] ${notif.title} (${notif.priority})`;
  const textBody = [
    notif.title,
    `نوع المؤشر: ${notif.indicatorLabel}`,
    `القسم والمستوى: ${notif.classNameLabel} — ${notif.gradeLevel}`,
    `درجة الأولوية: ${notif.priority}`,
    `ملخص النتائج: ${notif.summary}`,
    `التوصية التربوية الأولية: ${notif.recommendation}`,
    `رابط التقرير الآمن داخل فضاء الأستاذ: ${safeUrl}`,
    '',
    'ملاحظة خصوصية: حفاظاً على سرية المتعلمين، لا تتضمن هذه الرسالة أسماء أو إجابات فردية.',
  ].join('\n');

  const htmlBody = `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:#f8fafc; padding:24px; color:#0f172a;">
      <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:24px;">
        <div style="border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:16px;">
          <strong style="color:#0284c7; font-size:13px;">فِيلوسكان | PhiloScan — الإشعارات التربوية الذكية</strong>
          <h2 style="margin:8px 0 0; font-size:18px; color:#0f172a;">${escapeHtml(notif.title)}</h2>
        </div>
        <p style="margin:6px 0; font-size:13px;"><strong>المؤشر المرصود:</strong> ${escapeHtml(notif.indicatorLabel)}</p>
        <p style="margin:6px 0; font-size:13px;"><strong>القسم والمستوى:</strong> ${escapeHtml(notif.classNameLabel)} · ${escapeHtml(notif.gradeLevel)}</p>
        <p style="margin:6px 0; font-size:13px;"><strong>الأولوية:</strong> ${escapeHtml(notif.priority)}</p>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin:16px 0;">
          <p style="margin:0 0 8px; font-size:13px;"><strong>ملخص المؤشرات:</strong> ${escapeHtml(notif.summary)}</p>
          <p style="margin:0; font-size:13px;"><strong>توصية تربوية أولية:</strong> ${escapeHtml(notif.recommendation)}</p>
        </div>
        <p style="margin:18px 0;">
          <a href="${escapeHtml(safeUrl)}" style="display:inline-block; background:#0284c7; color:#ffffff; text-decoration:none; padding:10px 18px; border-radius:10px; font-weight:bold; font-size:13px;">
            الانتقال الآمن إلى التقرير داخل فضاء الأستاذ
          </a>
        </p>
        <p style="margin:12px 0 0; font-size:11px; color:#64748b;">
          حفاظاً على خصوصية التلاميذ، تقتصر الإشعارات الخارجية على المؤشرات البيداغوجية العامة دون تضمين أسماء أو درجات شخصية.
        </p>
      </div>
    </div>
  `;

  return { subject, textBody, htmlBody };
}

function formatExternalWhatsAppBody(notif: PedagogicalNotification): string {
  const safeUrl = buildSafeExternalUrl(notif.reportPath);
  return [
    `*PhiloScan | تنبيه تربوي (${notif.priority})*`,
    notif.title,
    `• المؤشر: ${notif.indicatorLabel}`,
    `• القسم: ${notif.classNameLabel} (${notif.gradeLevel})`,
    `• الملخص: ${notif.summary}`,
    `• التوصية الأولية: ${notif.recommendation}`,
    `• رابط التقرير: ${safeUrl}`,
  ].join('\n');
}

function shouldSendMessageType(
  settings: TeacherNotificationSettings,
  category: NotificationCategory
): boolean {
  if (category === 'class_alert') return settings.messageTypes.classAlerts;
  if (category === 'student_alert') return settings.messageTypes.studentAlerts;
  if (category === 'ai_recommendation') return settings.messageTypes.aiRecommendations;
  return true;
}

interface CandidateAlert {
  indicatorType: PedagogicalIndicatorType;
  indicatorLabel: string;
  category: NotificationCategory;
  title: string;
  summary: string;
  priority: NotificationPriority;
  recommendation: string;
  studentRefId?: string;
}

const COHORT_ALERT_MIN_SUBMISSIONS = 5;

export async function evaluateAndDispatchSessionNotifications(params: {
  session: DiagnosticSession;
  sessionSubmissions: StudentSubmission[];
  latestSubmission?: StudentSubmission;
  onBroadcast?: (teacherEmail: string, notif: PedagogicalNotification) => void;
}): Promise<PedagogicalNotification[]> {
  const { session, sessionSubmissions, latestSubmission, onBroadcast } = params;
  const teacherEmail = (session.teacherEmail || '').toLowerCase().trim();
  const teacherId = session.teacherId || 'TCH-DEMO';
  if (!teacherEmail) return [];

  const settingsList = await loadNotificationSettingsList();
  const settings = settingsList.find(
    (s) =>
      s.teacherEmail.toLowerCase().trim() === teacherEmail ||
      (teacherId && s.teacherId === teacherId)
  );

  // Opt-in strictly enforced: do not activate alerts unless teacher explicitly consented
  if (!settings || !settings.consentAccepted) {
    return [];
  }

  const hasActiveExternalEmail = !settings.disableAllExternal && settings.channels?.email;
  const hasActiveExternalWhatsapp = !settings.disableAllExternal && settings.channels?.whatsapp;
  if (!settings.channels?.inApp && !hasActiveExternalEmail && !hasActiveExternalWhatsapp) {
    return [];
  }

  const classLabel = `${session.title || 'جلسة تشخيصية'} — قسم ${session.classNumber || '1'}`;
  const gradeLabel = [session.level, session.stream].filter(Boolean).join(' · ') || 'ثانوي تأهيلي';
  const count = sessionSubmissions.length;

  const candidates: CandidateAlert[] = [];

  // 1. Cohort-level evaluation strictly gated to >= 5 submissions
  if (count >= COHORT_ALERT_MIN_SUBMISSIONS) {
    const metricsList = sessionSubmissions.map((s) => s.analysis?.metrics || {
      cognitiveFear: 25,
      cognitiveCuriosity: 50,
      shallowThinking: 40,
      criticalThinking: 50,
      learningReadiness: 55,
    });

    const avgCritical = Math.round(
      metricsList.reduce((acc, m) => acc + (Number(m.criticalThinking) || 0), 0) / count
    );
    const avgFear = Math.round(
      metricsList.reduce((acc, m) => acc + (Number(m.cognitiveFear) || 0), 0) / count
    );
    const avgCuriosity = Math.round(
      metricsList.reduce((acc, m) => acc + (Number(m.cognitiveCuriosity) || 0), 0) / count
    );
    const avgShallow = Math.round(
      metricsList.reduce((acc, m) => acc + (Number(m.shallowThinking) || 0), 0) / count
    );
    const avgReadiness = Math.round(
      metricsList.reduce(
        (acc, m) =>
          acc +
          (typeof m.learningReadiness === 'number'
            ? m.learningReadiness
            : Math.round(((Number(m.cognitiveCuriosity) || 50) + (100 - (Number(m.cognitiveFear) || 25))) / 2)),
        0
      ) / count
    );

    const lowCriticalRatio =
      metricsList.filter((m) => (Number(m.criticalThinking) || 0) < 45).length / count;
    const highFearRatio =
      metricsList.filter((m) => (Number(m.cognitiveFear) || 0) >= 60).length / count;

    // Standard deviation & spread for criticalThinking
    const variance =
      metricsList.reduce((acc, m) => acc + Math.pow((Number(m.criticalThinking) || 0) - avgCritical, 2), 0) /
      count;
    const stdDevCritical = Math.sqrt(variance);
    const criticalValues = metricsList.map((m) => Number(m.criticalThinking) || 0);
    const criticalSpread = Math.max(...criticalValues) - Math.min(...criticalValues);

    // Argumentation / expression hesitation signals
    const weakArgCount = sessionSubmissions.filter((s) => {
      const a: any = s.answers || {};
      const debate = String(a.debateReaction || '');
      const freedom = String(a.reactionToFreedomQuestion || '');
      const isHesitantDebate =
        debate === 'أستمع فقط' || debate === 'أتوتر' || debate === 'أرفض المشاركة';
      const isReadyMadeReaction =
        freedom === 'أبحث عن جواب جاهز' || freedom === 'أعتبره صعباً';
      const shallowDominant = (s.analysis?.metrics?.shallowThinking || 0) >= 65;
      return isHesitantDebate || isReadyMadeReaction || shallowDominant;
    }).length;
    const weakArgRatio = weakArgCount / count;

    const triggeredCohortCount = [
      avgCritical < 45 || lowCriticalRatio >= 0.5,
      weakArgRatio >= 0.5 || avgShallow >= 62,
      avgFear >= 55 || highFearRatio >= 0.4,
      avgCuriosity < 48 || avgReadiness < 50,
      stdDevCritical >= 24 || criticalSpread >= 55,
    ].filter(Boolean).length;

    const resolveCohortPriority = (isSevereSingle: boolean): NotificationPriority => {
      if (triggeredCohortCount >= 2 && (avgFear >= 60 || avgCritical < 40)) {
        return 'مرتفع';
      }
      if (triggeredCohortCount >= 2 || isSevereSingle) {
        return 'مهم';
      }
      return 'عادي';
    };

    if (avgCritical < 45 || lowCriticalRatio >= 0.5) {
      candidates.push({
        indicatorType: 'critical_thinking_difficulty',
        indicatorLabel: 'صعوبات جماعية في التفكير النقدي',
        category: 'class_alert',
        title: `تنبيه تربوي: رُصدت مؤشرات لاحتمال صعوبات في التفكير النقدي لدى ${classLabel}`,
        summary: `بناءً على ${count} استجابات مسجلة، يبلغ متوسط مؤشر التفكير النقدي ${avgCritical}% مع بروز حاجة لدعم تفكيك المسلمات والتمييز الإشكالي.`,
        priority: resolveCohortPriority(avgCritical < 38),
        recommendation:
          'يُنصح بالانطلاق من وضعيات مشكلة مألوفة لتدريب المتعلمين على التساؤل المنهجي وتفكيك الآراء الجاهزة قبل بناء المفاهيم.',
      });
    }

    if (weakArgRatio >= 0.5 || avgShallow >= 62) {
      candidates.push({
        indicatorType: 'argumentation_weakness',
        indicatorLabel: 'ضعف مهارات الحجاج والبرهنة',
        category: 'class_alert',
        title: `تنبيه تربوي: رُصدت مؤشرات على صعوبات محتملة في مهارات الحجاج والبرهنة لدى ${classLabel}`,
        summary: `تشير معطيات ${count} مشاركات إلى غلبة الميل نحو الإجابات الجاهزة أو التردد في إسناد الرأي بحجج منظمة (متوسط التفكير السطحي ${avgShallow}%).`,
        priority: resolveCohortPriority(weakArgRatio >= 0.65),
        recommendation:
          'اعتماد ورشات مصغرة لتدريب التلاميذ على بناء الحجة بالمثال المضاد والتمييز بين الرأي الشخصي والبرهان الفلسفي.',
      });
    }

    if (avgFear >= 55 || highFearRatio >= 0.4) {
      candidates.push({
        indicatorType: 'cognitive_fear_elevation',
        indicatorLabel: 'ارتفاع مؤشرات الخوف من التعبير أو المشاركة',
        category: 'class_alert',
        title: `تنبيه تربوي: ارتفاع محتمل في مؤشرات القلق المعرفي والتردد التعبيري لدى ${classLabel}`,
        summary: `سُجل متوسط خوف معرفي قدره ${avgFear}% عبر ${count} استجابات، مما قد يحدّ من المبادرة التلقائية أثناء الحوار الصفي.`,
        priority: resolveCohortPriority(avgFear >= 62),
        recommendation:
          'يفضّل تخصيص تمهيد وجداني يطمئن المتعلمين تجاه الحق في الخطأ وتجريب أنشطة تفكير ثنائية قبل النقاش الجماعي.',
      });
    }

    if (avgCuriosity < 48 || avgReadiness < 50) {
      candidates.push({
        indicatorType: 'low_curiosity_readiness',
        indicatorLabel: 'ضعف الفضول المعرفي والاستعداد للتعلم',
        category: 'ai_recommendation',
        title: `ملاحظة بيداغوجية: مؤشرات على انخفاض الفضول المعرفي والاستعداد للتعلم لدى ${classLabel}`,
        summary: `متوسط الفضول المعرفي المسجل هو ${avgCuriosity}% ومؤشر الاستعداد للتعلم ${avgReadiness}% عبر ${count} مشاركات.`,
        priority: triggeredCohortCount >= 2 ? 'مهم' : 'عادي',
        recommendation:
          'استثمار أمثلة من الحياة اليومية والقضايا الراهنة لإثارة الدهشة الفلسفية وربط محاور الدرس باهتمامات التلاميذ.',
      });
    }

    if (stdDevCritical >= 24 || criticalSpread >= 55) {
      candidates.push({
        indicatorType: 'class_level_disparity',
        indicatorLabel: 'تباين واضح في مستويات التلاميذ',
        category: 'ai_recommendation',
        title: `تنبيه تنظيمي: رُصد تباين ملحوظ في أنماط التفكير داخل ${classLabel}`,
        summary: `تُظهر التحليلات تباعداً بين الفئات (مدى التشتت ${Math.round(criticalSpread)} نقطة عبر ${count} استجابات)، ما يستدعي تكييف الأنشطة الصفية.`,
        priority: stdDevCritical >= 28 && triggeredCohortCount >= 2 ? 'مرتفع' : 'مهم',
        recommendation:
          'توظيف البيداغوجيا الفارقية عبر مجموعات متكاملة الأدوار، مع مهام إثرائية للمتقدمين ودعم موجه للمتعثرين.',
      });
    }
  }

  // 2. Individual student attention indicator (strictly non-identifying externally)
  if (latestSubmission) {
    const m = latestSubmission.analysis?.metrics || {
      cognitiveFear: 0,
      cognitiveCuriosity: 50,
      shallowThinking: 0,
      criticalThinking: 50,
    };
    const contradictionsCount = Array.isArray(latestSubmission.analysis?.contradictions)
      ? latestSubmission.analysis!.contradictions!.length
      : 0;
    const relIndex =
      typeof latestSubmission.reliabilityIndex === 'number' ? latestSubmission.reliabilityIndex : 100;

    const strongFearLowCritical = (m.cognitiveFear || 0) >= 75 && (m.criticalThinking || 0) <= 25;
    const credibilityAttention = relIndex <= 50 || contradictionsCount >= 2;

    if (strongFearLowCritical || credibilityAttention) {
      const priority: NotificationPriority =
        strongFearLowCritical && credibilityAttention ? 'مهم' : 'عادي';
      candidates.push({
        indicatorType: 'individual_follow_up',
        indicatorLabel: 'مؤشرات تستدعي مواكبة فردية',
        category: 'student_alert',
        studentRefId: latestSubmission.id,
        title: `إشارة مواكبة فردية: توجد مؤشرات تستدعي انتباه الأستاذ في ${classLabel}`,
        summary:
          'رُصدت في إحدى المشاركات الأخيرة مؤشرات أولية على حاجز وجداني مرتفع أو تباين إشكالي يستحسن الاطلاع عليه داخل التقرير المفصل بالمنصة.',
        priority,
        recommendation:
          'مراجعة بطاقة التلميذ داخل التقرير التحليلي في فضاء الأستاذ، واعتماد حوار فردي داعم دون أحكام تقويمية مسبقة.',
      });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const existingNotifs = await loadNotificationsList();
  const now = Date.now();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  const createdNotifs: PedagogicalNotification[] = [];

  for (const cand of candidates) {
    // Respect teacher's selected message type preferences
    if (!shouldSendMessageType(settings, cand.category)) {
      continue;
    }

    // Deduplicate recent identical notifications for this session/indicator (or same studentRefId)
    const isDuplicate = existingNotifs.some((n) => {
      if (n.sessionId.toUpperCase() !== session.sessionId.toUpperCase()) return false;
      if (n.indicatorType !== cand.indicatorType) return false;
      if (cand.studentRefId && n.studentRefId === cand.studentRefId) return true;
      if (!cand.studentRefId) {
        const ageMs = now - new Date(n.createdAt).getTime();
        const prevCount = n.submissionCountAtTrigger || 0;
        const countDelta = count - prevCount;
        // Avoid repeating same cohort alert unless >= 5 new submissions arrived OR 12h passed
        if (ageMs < twelveHoursMs && countDelta < 5 && n.priority === cand.priority) {
          return true;
        }
      }
      return false;
    });

    if (isDuplicate) continue;

    const notifId = `ntf_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const reportPath = buildSafeReportPath(session.sessionId, notifId);

    const newNotif: PedagogicalNotification = {
      id: notifId,
      teacherId: settings.teacherId || teacherId,
      teacherEmail,
      title: cand.title,
      indicatorType: cand.indicatorType,
      indicatorLabel: cand.indicatorLabel,
      category: cand.category,
      sessionId: session.sessionId,
      sessionTitle: session.title || 'جلسة تشخيصية',
      classNameLabel: classLabel,
      gradeLevel: gradeLabel,
      summary: cand.summary,
      priority: cand.priority,
      recommendation: cand.recommendation,
      reportPath,
      ...(cand.studentRefId ? { studentRefId: cand.studentRefId } : {}),
      submissionCountAtTrigger: count,
      isRead: false,
      readAt: null,
      deliveryLog: {
        inApp: Boolean(settings.channels.inApp),
        emailStatus: 'skipped',
        whatsappStatus: 'skipped',
      },
      createdAt: new Date().toISOString(),
    };

    // Dispatch external notifications ONLY if consented, external not disabled, and channel configured
    if (!settings.disableAllExternal) {
      if (settings.channels.email && isValidEmailAddress(settings.emailConfig?.address)) {
        const emailPayload = formatExternalEmailBody(newNotif);
        const resEmail = await sendPedagogicalEmail({
          to: settings.emailConfig.address,
          ...emailPayload,
        });
        newNotif.deliveryLog!.emailStatus = resEmail.status;
      }

      if (
        settings.channels.whatsapp &&
        settings.whatsappConfig?.consentAccepted &&
        settings.whatsappConfig?.e164Phone
      ) {
        const waBody = formatExternalWhatsAppBody(newNotif);
        const resWa = await sendPedagogicalWhatsApp({
          e164Phone: settings.whatsappConfig.e164Phone,
          messageText: waBody,
        });
        newNotif.deliveryLog!.whatsappStatus = resWa.status;
      }
    }

    existingNotifs.unshift(newNotif);
    createdNotifs.push(newNotif);

    if (onBroadcast) {
      onBroadcast(teacherEmail, newNotif);
    }
  }

  if (createdNotifs.length > 0) {
    // Retain up to 500 recent notifications to bound storage cleanly
    await saveNotificationsList(existingNotifs.slice(0, 500));
  }

  return createdNotifs;
}
