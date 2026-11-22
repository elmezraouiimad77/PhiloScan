/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  BrainCircuit,
  Check,
  CheckCheck,
  CheckCircle2,
  Compass,
  ExternalLink,
  Filter,
  GitCompare,
  Info,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
  Scale,
  Search,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlink,
  UserSearch,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  deletePedagogicalNotificationInFirestore,
  fetchNotificationSettingsFromFirestore,
  fetchPedagogicalNotificationsFromFirestore,
  markPedagogicalNotificationReadInFirestore,
  saveNotificationSettingsToFirestore,
  syncPedagogicalNotificationToFirestore,
} from '../lib/firestoreSync';
import type {
  DiagnosticSession,
  NotificationCategory,
  NotificationPriority,
  NotificationProviderStatus,
  PedagogicalIndicatorType,
  PedagogicalNotification,
  TeacherNotificationSettings,
  TeacherSession,
} from '../types';

interface TeacherNotificationsCenterProps {
  teacherSession: TeacherSession;
  sessions: DiagnosticSession[];
  selectedSessionId: string;
  onOpenReport: (sessionId: string, studentRefId?: string) => void;
  onUnreadCountChange?: (unreadCount: number) => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
  initialNotificationId?: string | null;
  liveIncomingNotification?: PedagogicalNotification | null;
}

type CenterFilterTab =
  | 'all'
  | 'unread'
  | 'read'
  | 'class_alert'
  | 'student_alert'
  | 'ai_recommendation';

type DateRangeFilter = 'all' | 'today' | '7d' | '30d';

const COUNTRY_CODES = [
  { code: '+212', label: 'المغرب (+212)' },
  { code: '+213', label: 'الجزائر (+213)' },
  { code: '+216', label: 'تونس (+216)' },
  { code: '+20', label: 'مصر (+20)' },
  { code: '+966', label: 'السعودية (+966)' },
  { code: '+971', label: 'الإمارات (+971)' },
  { code: '+33', label: 'فرنسا (+33)' },
  { code: '+34', label: 'إسبانيا (+34)' },
];

function createEmptySettings(teacherSession: TeacherSession): TeacherNotificationSettings {
  return {
    teacherId: teacherSession.teacherId || 'TCH-DEMO',
    teacherEmail: (teacherSession.email || '').toLowerCase().trim(),
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

function getIndicatorIcon(indicatorType: PedagogicalIndicatorType) {
  switch (indicatorType) {
    case 'critical_thinking_difficulty':
      return BrainCircuit;
    case 'argumentation_weakness':
      return Scale;
    case 'cognitive_fear_elevation':
      return ShieldAlert;
    case 'low_curiosity_readiness':
      return Compass;
    case 'class_level_disparity':
      return GitCompare;
    case 'individual_follow_up':
    default:
      return UserSearch;
  }
}

function getCategoryLabel(cat: NotificationCategory): string {
  switch (cat) {
    case 'class_alert':
      return 'تنبيه قسم';
    case 'student_alert':
      return 'متابعة فردية';
    case 'ai_recommendation':
    default:
      return 'توصية ذكية';
  }
}

function getPriorityStyle(priority: NotificationPriority) {
  if (priority === 'مرتفع') {
    return {
      textClass: 'text-rose-700',
      borderClass: 'border-rose-200 bg-rose-50',
      Icon: AlertTriangle,
    };
  }
  if (priority === 'مهم') {
    return {
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200 bg-amber-50',
      Icon: AlertCircle,
    };
  }
  return {
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200 bg-sky-50',
    Icon: Info,
  };
}

function validateClientEmail(email: string): boolean {
  const clean = email.trim();
  if (!clean || clean.length > 200) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(clean);
}

function computeClientE164Preview(countryCode: string, phoneNumber: string): { valid: boolean; e164: string } {
  const ccRaw = (countryCode || '').trim().replace(/[^\d+]/g, '');
  const cleanCC = ccRaw.startsWith('+') ? ccRaw : `+${ccRaw.replace(/^0+/, '')}`;
  let digits = (phoneNumber || '').replace(/[^\d]/g, '');
  if (digits.startsWith('0') && digits.length >= 9) {
    digits = digits.slice(1);
  }
  const e164 = `${cleanCC}${digits}`;
  const valid = /^\+[1-9]\d{0,3}$/.test(cleanCC) && /^\d{6,14}$/.test(digits) && /^\+[1-9]\d{7,14}$/.test(e164);
  return { valid, e164: digits ? e164 : '' };
}

function formatDateTimeAr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ar-MA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function translateDeliveryStatus(status?: string): string {
  switch (status) {
    case 'sent':
      return 'تم الإرسال';
    case 'not_configured':
      return 'غير مفعل على الخادم';
    case 'failed':
      return 'تعذر الإرسال';
    case 'skipped':
    default:
      return 'غير محدد';
  }
}

export default function TeacherNotificationsCenter({
  teacherSession,
  sessions,
  selectedSessionId,
  onOpenReport,
  onUnreadCountChange,
  onShowToast,
  initialNotificationId,
  liveIncomingNotification,
}: TeacherNotificationsCenterProps) {
  const [subTab, setSubTab] = useState<'center' | 'settings'>('center');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [testingEmail, setTestingEmail] = useState<boolean>(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState<boolean>(false);
  const [evaluatingSession, setEvaluatingSession] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<PedagogicalNotification[]>([]);
  const [settings, setSettings] = useState<TeacherNotificationSettings>(() =>
    createEmptySettings(teacherSession)
  );
  const [providerStatus, setProviderStatus] = useState<NotificationProviderStatus | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState<CenterFilterTab>('all');
  const [indicatorFilter, setIndicatorFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [evalSessionId, setEvalSessionId] = useState<string>(() => {
    if (selectedSessionId && selectedSessionId !== 'all') return selectedSessionId;
    return sessions[0]?.sessionId || '';
  });

  // Channel test diagnostics feedback (honest server response display)
  const [emailTestFeedback, setEmailTestFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [whatsappTestFeedback, setWhatsappTestFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (selectedSessionId && selectedSessionId !== 'all') {
      setEvalSessionId(selectedSessionId);
    } else if (!evalSessionId && sessions.length > 0) {
      setEvalSessionId(sessions[0].sessionId);
    }
  }, [selectedSessionId, sessions, evalSessionId]);

  const buildAuthHeaders = useCallback(async (includeJson = false): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    if (teacherSession?.token) {
      headers['Authorization'] = `Bearer ${teacherSession.token}`;
    }
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        if (idToken) headers['x-firebase-id-token'] = idToken;
      } catch {
        // Ignore silent token refresh failure
      }
    }
    return headers;
  }, [teacherSession?.token]);

  const fetchAllNotificationData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers = await buildAuthHeaders(false);
      const [statusRes, settingsRes, listRes] = await Promise.all([
        fetch('/api/notifications/provider-status', { headers }),
        fetch('/api/notifications/settings', { headers }),
        fetch('/api/notifications', { headers }),
      ]);

      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        setProviderStatus(statusJson);
      }

      if (settingsRes.ok) {
        const settingsJson = await settingsRes.json();
        if (settingsJson?.settings) {
          setSettings(settingsJson.settings);
        }
      } else if (auth.currentUser) {
        const fsSettings = await fetchNotificationSettingsFromFirestore();
        if (fsSettings) setSettings(fsSettings);
      }

      if (listRes.ok) {
        const listJson = await listRes.json();
        const items: PedagogicalNotification[] = Array.isArray(listJson?.notifications)
          ? listJson.notifications
          : [];
        setNotifications(items);
        onUnreadCountChange?.(items.filter((n) => !n.isRead).length);
      } else if (auth.currentUser) {
        const fsNotifs = await fetchPedagogicalNotificationsFromFirestore();
        setNotifications(fsNotifs);
        onUnreadCountChange?.(fsNotifs.filter((n) => !n.isRead).length);
      } else {
        setErrorMsg('تعذر تحميل الإشعارات من الخادم. يرجى إعادة تسجيل الدخول لتحديث الجلسة.');
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم لجلب إعدادات وإشعارات النظام.');
    } finally {
      setLoading(false);
    }
  }, [buildAuthHeaders, onUnreadCountChange]);

  useEffect(() => {
    fetchAllNotificationData();
  }, [fetchAllNotificationData]);

  // Append real-time incoming SSE notification cleanly
  useEffect(() => {
    if (!liveIncomingNotification) return;
    setNotifications((prev) => {
      if (prev.some((n) => n.id === liveIncomingNotification.id)) return prev;
      const next = [liveIncomingNotification, ...prev];
      onUnreadCountChange?.(next.filter((n) => !n.isRead).length);
      return next;
    });
    if (auth.currentUser) {
      syncPedagogicalNotificationToFirestore(liveIncomingNotification).catch(() => {});
    }
  }, [liveIncomingNotification, onUnreadCountChange]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return notifications.filter((n) => {
      if (activeFilter === 'unread' && n.isRead) return false;
      if (activeFilter === 'read' && !n.isRead) return false;
      if (activeFilter === 'class_alert' && n.category !== 'class_alert') return false;
      if (activeFilter === 'student_alert' && n.category !== 'student_alert') return false;
      if (activeFilter === 'ai_recommendation' && n.category !== 'ai_recommendation') return false;

      if (indicatorFilter !== 'all' && n.indicatorType !== indicatorFilter) return false;

      if (dateRangeFilter !== 'all') {
        const ts = new Date(n.createdAt).getTime();
        if (dateRangeFilter === 'today' && ts < todayStart.getTime()) return false;
        if (dateRangeFilter === '7d' && now - ts > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateRangeFilter === '30d' && now - ts > 30 * 24 * 60 * 60 * 1000) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${n.title} ${n.indicatorLabel} ${n.classNameLabel} ${n.summary} ${n.recommendation} ${n.sessionId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [notifications, activeFilter, indicatorFilter, dateRangeFilter, searchQuery]);

  const handleMarkRead = async (notifId: string) => {
    try {
      const headers = await buildAuthHeaders(false);
      const res = await fetch(`/api/notifications/${encodeURIComponent(notifId)}/read`, {
        method: 'PATCH',
        headers,
      });
      if (res.ok) {
        const nowIso = new Date().toISOString();
        setNotifications((prev) => {
          const next = prev.map((n) => (n.id === notifId ? { ...n, isRead: true, readAt: nowIso } : n));
          onUnreadCountChange?.(next.filter((n) => !n.isRead).length);
          return next;
        });
        if (auth.currentUser) {
          markPedagogicalNotificationReadInFirestore(notifId).catch(() => {});
        }
      }
    } catch {
      onShowToast('تعذر تحديث حالة قراءة الإشعار.', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    try {
      const headers = await buildAuthHeaders(false);
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
        headers,
      });
      if (res.ok) {
        const nowIso = new Date().toISOString();
        setNotifications((prev) =>
          prev.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: nowIso }))
        );
        onUnreadCountChange?.(0);
        onShowToast('تم تحديد جميع التنبيهات كمقروءة.');
      }
    } catch {
      onShowToast('تعذر تحديث حالة التنبيهات.', 'error');
    }
  };

  const handleDeleteNotification = async (notifId: string) => {
    try {
      const headers = await buildAuthHeaders(false);
      const res = await fetch(`/api/notifications/${encodeURIComponent(notifId)}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setNotifications((prev) => {
          const next = prev.filter((n) => n.id !== notifId);
          onUnreadCountChange?.(next.filter((n) => !n.isRead).length);
          return next;
        });
        if (auth.currentUser) {
          deletePedagogicalNotificationInFirestore(notifId).catch(() => {});
        }
        onShowToast('تم حذف التنبيه من المركز.');
      }
    } catch {
      onShowToast('تعذر حذف التنبيه.', 'error');
    }
  };

  const handleEvaluateSelectedSession = async () => {
    const targetId = evalSessionId.trim();
    if (!targetId) {
      onShowToast('يرجى اختيار جلسة تشخيصية لإجراء الفحص البيداغوجي.', 'error');
      return;
    }
    setEvaluatingSession(true);
    try {
      const headers = await buildAuthHeaders(true);
      const res = await fetch('/api/notifications/evaluate-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        onShowToast(data?.error || 'تعذر تقييم المؤشرات التربوية للجلسة.', 'error');
        return;
      }

      if (data.createdCount > 0 && Array.isArray(data.notifications)) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const merged = [
            ...data.notifications.filter((n: PedagogicalNotification) => !existingIds.has(n.id)),
            ...prev,
          ];
          onUnreadCountChange?.(merged.filter((n) => !n.isRead).length);
          return merged;
        });
        if (auth.currentUser) {
          for (const item of data.notifications) {
            syncPedagogicalNotificationToFirestore(item).catch(() => {});
          }
        }
        onShowToast(`تم رصد ${data.createdCount} تنبيه(ات) تربوية جديدة بناءً على ${data.evaluatedCount} مشاركة.`);
      } else if (!settings.consentAccepted) {
        onShowToast('النظام اختياري ولم يتم تفعيله بعد. فعّل الإشعارات من تبويب الإعدادات أولاً.', 'error');
      } else if ((data.evaluatedCount || 0) < 5) {
        onShowToast(
          `تضم الجلسة ${data.evaluatedCount || 0} مشاركات حالياً. تبدأ التنبيهات الجماعية تلقائياً بعد اكتمال 5 مشاركات على الأقل لتفادي المؤشرات المبكرة غير الدقيقة.`
        );
      } else {
        onShowToast('لا توجد مؤشرات تستدعي تنبيهاً جديداً في هذه الجلسة حالياً.');
      }
    } catch {
      onShowToast('فشل الاتصال بالخادم أثناء تحليل مؤشرات الجلسة.', 'error');
    } finally {
      setEvaluatingSession(false);
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (settings.consentAccepted && settings.channels.email && !settings.disableAllExternal) {
      if (!validateClientEmail(settings.emailConfig.address)) {
        setErrorMsg('يرجى إدخال عنوان بريد إلكتروني صحيح قبل تفعيل إشعارات البريد.');
        return;
      }
    }

    if (settings.consentAccepted && settings.channels.whatsapp && !settings.disableAllExternal) {
      const preview = computeClientE164Preview(
        settings.whatsappConfig.countryCode,
        settings.whatsappConfig.phoneNumber
      );
      if (!preview.valid) {
        setErrorMsg('يرجى إدخال رقم هاتف صحيح مع رمز الدولة (مثال: 612345678 +212).');
        return;
      }
      if (!settings.whatsappConfig.consentAccepted) {
        setErrorMsg('يتطلب ربط WhatsApp تأكيد الموافقة الصريحة على استقبال الرسائل.');
        return;
      }
    }

    setSavingSettings(true);
    try {
      const headers = await buildAuthHeaders(true);
      const res = await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || 'تعذر حفظ إعدادات الإشعارات.';
        setErrorMsg(msg);
        onShowToast(msg, 'error');
        return;
      }

      if (data.settings) {
        setSettings(data.settings);
        if (auth.currentUser) {
          saveNotificationSettingsToFirestore(data.settings).catch(() => {});
        }
      }
      if (data.providerStatus) {
        setProviderStatus(data.providerStatus);
      }
      onShowToast('تم حفظ إعدادات الإشعارات التربوية بنجاح.');
    } catch {
      onShowToast('تعذر الاتصال بالخادم لحفظ الإعدادات.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTestEmail = async () => {
    setEmailTestFeedback(null);
    const addr = settings.emailConfig.address.trim();
    if (!validateClientEmail(addr)) {
      setEmailTestFeedback({ ok: false, text: 'يرجى إدخال بريد إلكتروني صحيح أولاً.' });
      return;
    }

    setTestingEmail(true);
    try {
      const headers = await buildAuthHeaders(true);
      const res = await fetch('/api/notifications/test-email', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: addr }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailTestFeedback({ ok: true, text: data.message });
        setSettings((prev) => ({
          ...prev,
          emailConfig: {
            ...prev.emailConfig,
            address: addr,
            verified: true,
            lastTestAt: new Date().toISOString(),
          },
        }));
        onShowToast('تم إرسال رسالة الاختبار إلى بريدك الإلكتروني.');
      } else {
        setEmailTestFeedback({
          ok: false,
          text: data?.message || data?.error || 'خدمة البريد غير مفعلة على الخادم حالياً.',
        });
      }
      if (data?.providerStatus) setProviderStatus(data.providerStatus);
    } catch {
      setEmailTestFeedback({ ok: false, text: 'تعذر الاتصال بالخادم لاختبار البريد الإلكتروني.' });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSendTestWhatsapp = async () => {
    setWhatsappTestFeedback(null);
    if (!settings.whatsappConfig.consentAccepted) {
      setWhatsappTestFeedback({
        ok: false,
        text: 'يرجى تأكيد الموافقة الصريحة على استقبال رسائل WhatsApp أولاً.',
      });
      return;
    }
    const preview = computeClientE164Preview(
      settings.whatsappConfig.countryCode,
      settings.whatsappConfig.phoneNumber
    );
    if (!preview.valid) {
      setWhatsappTestFeedback({
        ok: false,
        text: 'صيغة رقم الهاتف غير مكتملة. تحقق من رمز الدولة والأرقام.',
      });
      return;
    }

    setTestingWhatsapp(true);
    try {
      const headers = await buildAuthHeaders(true);
      const res = await fetch('/api/notifications/test-whatsapp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          countryCode: settings.whatsappConfig.countryCode,
          phoneNumber: settings.whatsappConfig.phoneNumber,
          consentAccepted: settings.whatsappConfig.consentAccepted,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWhatsappTestFeedback({ ok: true, text: data.message });
        setSettings((prev) => ({
          ...prev,
          whatsappConfig: {
            ...prev.whatsappConfig,
            e164Phone: data.e164Phone || preview.e164,
            verified: true,
            lastTestAt: new Date().toISOString(),
          },
        }));
        onShowToast('تم إرسال رسالة الاختبار عبر WhatsApp بنجاح.');
      } else {
        setWhatsappTestFeedback({
          ok: false,
          text: data?.message || data?.error || 'خدمة WhatsApp Business Cloud API غير مفعلة على الخادم.',
        });
      }
      if (data?.providerStatus) setProviderStatus(data.providerStatus);
    } catch {
      setWhatsappTestFeedback({ ok: false, text: 'تعذر الاتصال بالخادم لاختبار WhatsApp.' });
    } finally {
      setTestingWhatsapp(false);
    }
  };

  const handleDisconnectChannel = async (channel: 'email' | 'whatsapp' | 'external') => {
    try {
      const headers = await buildAuthHeaders(true);
      const res = await fetch('/api/notifications/disconnect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (res.ok && data.settings) {
        setSettings(data.settings);
        if (channel === 'email') setEmailTestFeedback(null);
        if (channel === 'whatsapp') setWhatsappTestFeedback(null);
        if (auth.currentUser) {
          saveNotificationSettingsToFirestore(data.settings).catch(() => {});
        }
        onShowToast(
          channel === 'email'
            ? 'تم فصل البريد الإلكتروني عن الإشعارات.'
            : channel === 'whatsapp'
            ? 'تم فصل رقم WhatsApp بنجاح.'
            : 'تم تعطيل جميع الإشعارات الخارجية.'
        );
      }
    } catch {
      onShowToast('تعذر تنفيذ عملية الفصل.', 'error');
    }
  };

  const waPreview = useMemo(
    () =>
      computeClientE164Preview(
        settings.whatsappConfig.countryCode,
        settings.whatsappConfig.phoneNumber
      ),
    [settings.whatsappConfig.countryCode, settings.whatsappConfig.phoneNumber]
  );

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 text-slate-900">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                الإشعارات والتنبيهات التربوية
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                نظام اختياري للرصد البيداغوجي الذكي بعد اكتمال 5 مشاركات على الأقل · لا تتضمن الرسائل الخارجية أسماء التلاميذ
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Sub-Navigation Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('center')}
            className={`flex-1 lg:flex-initial min-h-[40px] px-4 py-2 text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              subTab === 'center'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bell className="w-4 h-4 text-sky-600 shrink-0" />
            <span>مركز التنبيهات</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500">
              ({unreadCount})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className={`flex-1 lg:flex-initial min-h-[40px] px-4 py-2 text-xs font-bold rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
              subTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings className="w-4 h-4 text-slate-700 shrink-0" />
            <span>إعدادات الإشعارات والربط</span>
          </button>
        </div>
      </div>

      {/* Global Error Feedback */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between gap-3 text-xs font-bold text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 hover:text-rose-900 underline text-xs shrink-0 cursor-pointer"
          >
            إخفاء
          </button>
        </div>
      )}

      {/* Opt-In Notice Banner when system not activated yet */}
      {!loading && !settings.consentAccepted && (
        <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
              <BellOff className="w-4.5 h-4.5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-white">
                نظام الإشعارات التربوية غير مفعّل افتراضياً
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                احتراماً لخصوصيتك واختياراتك، لا يرسل النظام أي تنبيهات داخلية أو خارجية قبل موافقتك الصريحة وتحديد القنوات المفضلة.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSubTab('settings')}
            className="min-h-[42px] px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-center gap-2"
          >
            <Settings className="w-4 h-4" />
            <span>إعداد وتفعيل الإشعارات</span>
          </button>
        </div>
      )}

      {/* TAB 1: NOTIFICATIONS CENTER */}
      {subTab === 'center' && (
        <div className="space-y-5">
          {/* Controls & Evaluation Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            {/* Top action controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={evalSessionId}
                  onChange={(e) => setEvalSessionId(e.target.value)}
                  className="min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
                >
                  <option value="">اختر جلسة لفحص مؤشراتها...</option>
                  {sessions.map((sess) => (
                    <option key={sess.sessionId} value={sess.sessionId}>
                      {sess.title} — قسم {sess.classNumber} ({sess.sessionId})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleEvaluateSelectedSession}
                  disabled={evaluatingSession || !evalSessionId}
                  className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition-colors duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {evaluatingSession ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BrainCircuit className="w-4 h-4 text-sky-400" />
                  )}
                  <span>فحص مؤشرات الجلسة الآن</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                  className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  <span>تحديد الكل كمقروء</span>
                </button>
                <button
                  type="button"
                  onClick={fetchAllNotificationData}
                  className="min-h-[40px] min-w-[40px] p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors duration-150 flex items-center justify-center cursor-pointer"
                  title="تحديث التنبيهات"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Category & Status Segmented Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'unread', label: 'الجديدة' },
                  { id: 'read', label: 'المقروءة' },
                  { id: 'class_alert', label: 'تنبيهات الأقسام' },
                  { id: 'student_alert', label: 'متابعة المتعلمين' },
                  { id: 'ai_recommendation', label: 'توصيات الذكاء الاصطناعي' },
                ] as Array<{ id: CenterFilterTab; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-lg transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Indicator & Date & Search Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالعنوان، القسم، أو رمز الجلسة..."
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={indicatorFilter}
                  onChange={(e) => setIndicatorFilter(e.target.value)}
                  className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
                >
                  <option value="all">جميع أنواع المؤشرات التربوية</option>
                  <option value="critical_thinking_difficulty">صعوبات جماعية في التفكير النقدي</option>
                  <option value="argumentation_weakness">ضعف مهارات الحجاج والبرهنة</option>
                  <option value="cognitive_fear_elevation">ارتفاع الخوف من التعبير أو المشاركة</option>
                  <option value="low_curiosity_readiness">ضعف الفضول المعرفي والاستعداد</option>
                  <option value="class_level_disparity">تباين واضح في مستويات التلاميذ</option>
                  <option value="individual_follow_up">مؤشرات مواكبة فردية</option>
                </select>
              </div>

              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value as DateRangeFilter)}
                className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500"
              >
                <option value="all">كل الفترات الزمنية</option>
                <option value="today">اليوم فقط</option>
                <option value="7d">آخر 7 أيام</option>
                <option value="30d">آخر 30 يوماً</option>
              </select>
            </div>
          </div>

          {/* Notifications List States: Loading / Empty / Populated */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse space-y-3"
                >
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800">
                لا توجد تنبيهات مطابقة للمعايير المحددة حالياً
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                تصدر التنبيهات الجماعية تلقائياً بعد بلوغ 5 مشاركات على الأقل في الجلسة وتفعيل موافقتك في إعدادات الإشعارات، كما يمكنك فحص أي جلسة يدوياً من الشريط أعلاه.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                {!settings.consentAccepted && (
                  <button
                    type="button"
                    onClick={() => setSubTab('settings')}
                    className="min-h-[40px] px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    الانتقال إلى إعدادات الربط والتفعيل
                  </button>
                )}
                {(activeFilter !== 'all' || indicatorFilter !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFilter('all');
                      setIndicatorFilter('all');
                      setDateRangeFilter('all');
                      setSearchQuery('');
                    }}
                    className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    إعادة ضبط الفلاتر
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notif) => {
                const IndicatorIcon = getIndicatorIcon(notif.indicatorType);
                const priorityStyle = getPriorityStyle(notif.priority);
                const PriorityIcon = priorityStyle.Icon;
                const isHighlighted = initialNotificationId === notif.id;

                return (
                  <article
                    key={notif.id}
                    className={`bg-white border rounded-2xl p-5 transition-colors duration-150 ${
                      isHighlighted
                        ? 'border-sky-500 ring-2 ring-sky-500/15'
                        : !notif.isRead
                        ? 'border-sky-200'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      {/* Main Content */}
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                            !notif.isRead
                              ? 'bg-sky-50 border-sky-200 text-sky-700'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <IndicatorIcon className="w-5 h-5" />
                        </div>

                        <div className="space-y-2 min-w-0 flex-1">
                          {/* Clean unboxed metadata row */}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                            <span className="font-bold text-slate-700">{getCategoryLabel(notif.category)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{notif.indicatorLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{notif.classNameLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{notif.sessionId}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatDateTimeAr(notif.createdAt)}</span>
                            {!notif.isRead && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-sky-700 font-extrabold">جديد</span>
                              </>
                            )}
                          </div>

                          {/* Title + Priority text-with-icon badge */}
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-sm sm:text-base font-black text-slate-900 leading-snug">
                              {notif.title}
                            </h3>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${priorityStyle.borderClass} ${priorityStyle.textClass}`}
                            >
                              <PriorityIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>أولوية: {notif.priority}</span>
                            </span>
                          </div>

                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                            {notif.summary}
                          </p>

                          {/* Pedagogical recommendation separated cleanly by hairline */}
                          <div className="pt-2.5 mt-2 border-t border-slate-100 space-y-1">
                            <p className="text-xs font-extrabold text-slate-800">
                              التوصية التربوية الأولية:
                            </p>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {notif.recommendation}
                            </p>
                          </div>

                          {/* Channel dispatch audit line */}
                          {notif.deliveryLog && (
                            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
                              <span>
                                البريد: <strong className="text-slate-700">{translateDeliveryStatus(notif.deliveryLog.emailStatus)}</strong>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                WhatsApp: <strong className="text-slate-700">{translateDeliveryStatus(notif.deliveryLog.whatsappStatus)}</strong>
                              </span>
                              {typeof notif.submissionCountAtTrigger === 'number' && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums">
                                    عدد الإجابات عند الرصد: {notif.submissionCountAtTrigger}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap lg:flex-col items-center lg:items-stretch gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (!notif.isRead) handleMarkRead(notif.id);
                            onOpenReport(notif.sessionId, notif.studentRefId);
                          }}
                          className="min-h-[40px] px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>فتح التقرير المرتبط</span>
                        </button>

                        {!notif.isRead && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(notif.id)}
                            className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>تحديد كمقروء</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteNotification(notif.id)}
                          className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-bold rounded-xl transition-colors duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SETTINGS & CHANNEL LINKING */}
      {subTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* 1. Opt-In Consent & Master Channel Preferences */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  1. الموافقة والاختيار العام لقنوات الإشعارات
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  لا يتم تشغيل التنبيهات التربوية تلقائياً؛ يمكنك تفعيل قناة واحدة أو أكثر أو تعطيل القنوات الخارجية بالكامل في أي وقت.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold">
                {settings.consentAccepted ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>مفعل بموافقة الأستاذ</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg">
                    <BellOff className="w-4 h-4 shrink-0" />
                    <span>معطل افتراضياً</span>
                  </span>
                )}
              </div>
            </div>

            {/* Explicit Opt-In Checkbox */}
            <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.consentAccepted}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSettings((prev) => ({
                    ...prev,
                    consentAccepted: checked,
                    consentTimestamp: checked ? prev.consentTimestamp || new Date().toISOString() : null,
                    channels: checked
                      ? { ...prev.channels, inApp: prev.channels.inApp || (!prev.channels.email && !prev.channels.whatsapp) }
                      : { inApp: false, email: false, whatsapp: false },
                  }));
                }}
                className="mt-1 w-4 h-4 accent-sky-600 rounded cursor-pointer shrink-0"
              />
              <div className="space-y-1 text-xs">
                <span className="font-black text-slate-900 block">
                  أوافق صراحةً على تفعيل نظام الإشعارات التربوية الذكية داخل حسابي
                </span>
                <span className="text-slate-600 block leading-relaxed">
                  تظل التنبيهات داخل المنصة والخارجية متوقفة ما لم تقم بتحديد هذا الخيار وحفظ الإعدادات.
                  {settings.consentTimestamp && (
                    <span className="text-slate-500 block mt-1 tabular-nums">
                      تاريخ آخر موافقة مسجلة: {formatDateTimeAr(settings.consentTimestamp)}
                    </span>
                  )}
                </span>
              </div>
            </label>

            {/* 4 Channel Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* In-App */}
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-slate-900">الإشعارات داخل المنصة</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      استقبال التنبيهات مباشرة في مركز التنبيهات وشريط فضاء الأستاذ.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.consentAccepted}
                  checked={settings.channels.inApp}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      channels: { ...prev.channels, inApp: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-sky-600 mt-1 cursor-pointer"
                />
              </label>

              {/* Disable All External */}
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <BellOff className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-slate-900">تعطيل الإشعارات الخارجية بالكامل</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      يوقف الإرسال عبر البريد الإلكتروني وWhatsApp مع إمكانية إبقاء التنبيهات الداخلية.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.disableAllExternal}
                  onChange={(e) => {
                    const disableExt = e.target.checked;
                    setSettings((prev) => ({
                      ...prev,
                      disableAllExternal: disableExt,
                      channels: disableExt
                        ? { ...prev.channels, email: false, whatsapp: false }
                        : prev.channels,
                    }));
                  }}
                  className="w-4 h-4 accent-slate-800 mt-1 cursor-pointer"
                />
              </label>

              {/* Email Channel Switch */}
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-slate-900">تفعيل الإشعارات عبر البريد الإلكتروني</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      إرسال ملخصات تربوية غير تعريفية عبر خادم SMTP أو Resend.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.consentAccepted || settings.disableAllExternal}
                  checked={settings.channels.email && !settings.disableAllExternal}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      disableAllExternal: e.target.checked ? false : prev.disableAllExternal,
                      channels: { ...prev.channels, email: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-sky-600 mt-1 cursor-pointer"
                />
              </label>

              {/* WhatsApp Channel Switch */}
              <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-slate-900">تفعيل الإشعارات عبر WhatsApp</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      إرسال تنبيهات تربوية موجزة عبر WhatsApp Business Cloud API عند تهيئة الخادم.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!settings.consentAccepted || settings.disableAllExternal}
                  checked={settings.channels.whatsapp && !settings.disableAllExternal}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      disableAllExternal: e.target.checked ? false : prev.disableAllExternal,
                      channels: { ...prev.channels, whatsapp: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-emerald-600 mt-1 cursor-pointer"
                />
              </label>
            </div>
          </section>

          {/* 2. Email Linking & Verification */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Mail className="w-5 h-5 text-sky-600 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-slate-900">2. ربط البريد الإلكتروني</h3>
                  <p className="text-xs text-slate-500">
                    إدخال البريد المخصص لاستقبال الإشعارات والتحقق منه برسالة اختبار حقيقية من الخادم.
                  </p>
                </div>
              </div>

              {/* Honest Provider Status */}
              <div className="text-xs font-bold">
                {providerStatus?.email.configured ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{providerStatus.email.statusLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {providerStatus?.email.statusLabel || 'غير مفعلة — تحتاج إلى إعداد تقني على الخادم'}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {!providerStatus?.email.configured && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                تنبيه تقني صادق: لم تُضبط متغيرات خادم البريد الإلكتروني (<span className="font-mono">RESEND_API_KEY</span> أو <span className="font-mono">SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS</span>) على الخادم بعد. يمكنك حفظ عنوان بريدك الآن، ولن يتم الإرسال الفعلي حتى يتم إعداد الخادم.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-6 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  البريد الإلكتروني المخصص للإشعارات
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={settings.emailConfig.address}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEmailTestFeedback(null);
                    setSettings((prev) => ({
                      ...prev,
                      emailConfig: {
                        ...prev.emailConfig,
                        address: val,
                        verified: false,
                      },
                    }));
                  }}
                  placeholder="alerts.teacher@school.edu.ma"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono text-left text-slate-900 focus:bg-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="md:col-span-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={testingEmail || !validateClientEmail(settings.emailConfig.address)}
                  className="min-h-[44px] px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {testingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>إرسال رسالة اختبار</span>
                </button>

                {settings.emailConfig.address && (
                  <button
                    type="button"
                    onClick={() => handleDisconnectChannel('email')}
                    className="min-h-[44px] px-4 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Unlink className="w-4 h-4" />
                    <span>فصل البريد</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>
                حالة التحقق:{' '}
                <strong className={settings.emailConfig.verified ? 'text-emerald-700' : 'text-slate-700'}>
                  {settings.emailConfig.verified ? 'تم التحقق برسالة اختبار' : 'غير مختبر بعد'}
                </strong>
              </span>
              {settings.emailConfig.lastTestAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">آخر اختبار: {formatDateTimeAr(settings.emailConfig.lastTestAt)}</span>
                </>
              )}
            </div>

            {emailTestFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  emailTestFeedback.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {emailTestFeedback.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>{emailTestFeedback.text}</span>
              </div>
            )}
          </section>

          {/* 3. WhatsApp Linking & Explicit Consent */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h3 className="text-base font-black text-slate-900">3. ربط رقم WhatsApp</h3>
                  <p className="text-xs text-slate-500">
                    ربط رقم الأستاذ عبر WhatsApp Business Cloud API وفق صيغة E.164 وبموافقة صريحة.
                  </p>
                </div>
              </div>

              {/* Honest Provider Status */}
              <div className="text-xs font-bold">
                {providerStatus?.whatsapp.configured ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{providerStatus.whatsapp.statusLabel}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {providerStatus?.whatsapp.statusLabel || 'غير مفعلة — تحتاج إلى إعداد تقني على الخادم'}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {!providerStatus?.whatsapp.configured && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                حالة التكامل التقني: مفاتيح التكامل الرسمي (<span className="font-mono">WHATSAPP_ACCESS_TOKEN</span> و <span className="font-mono">WHATSAPP_PHONE_NUMBER_ID</span>) غير مضبوطة في الخادم حالياً. إدخال رقم الهاتف وحفظه لا ينشئ اتصالاً وهمياً، وستظل الحالة «غير مفعلة / تحتاج إلى إعداد تقني» إلى حين توفر الإعدادات على الخادم.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">رمز الدولة</label>
                <select
                  value={
                    COUNTRY_CODES.some((c) => c.code === settings.whatsappConfig.countryCode)
                      ? settings.whatsappConfig.countryCode
                      : 'custom'
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== 'custom') {
                      setWhatsappTestFeedback(null);
                      setSettings((prev) => ({
                        ...prev,
                        whatsappConfig: {
                          ...prev.whatsappConfig,
                          countryCode: val,
                          verified: false,
                        },
                      }));
                    }
                  }}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-emerald-500"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                  <option value="custom">رمز دولة آخر</option>
                </select>
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">الرمز الدولي</label>
                <input
                  type="text"
                  dir="ltr"
                  value={settings.whatsappConfig.countryCode}
                  onChange={(e) => {
                    setWhatsappTestFeedback(null);
                    setSettings((prev) => ({
                      ...prev,
                      whatsappConfig: {
                        ...prev.whatsappConfig,
                        countryCode: e.target.value,
                        verified: false,
                      },
                    }));
                  }}
                  placeholder="+212"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-center text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">رقم الهاتف (دون رمز الدولة)</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={settings.whatsappConfig.phoneNumber}
                  onChange={(e) => {
                    setWhatsappTestFeedback(null);
                    setSettings((prev) => ({
                      ...prev,
                      whatsappConfig: {
                        ...prev.whatsappConfig,
                        phoneNumber: e.target.value,
                        verified: false,
                      },
                    }));
                  }}
                  placeholder="612345678"
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono tabular-nums text-left text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendTestWhatsapp}
                  disabled={testingWhatsapp || !waPreview.valid}
                  className="flex-1 min-h-[44px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {testingWhatsapp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>رسالة اختبار</span>
                </button>

                {settings.whatsappConfig.phoneNumber && (
                  <button
                    type="button"
                    onClick={() => handleDisconnectChannel('whatsapp')}
                    className="min-h-[44px] px-3 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                    title="فصل رقم WhatsApp"
                  >
                    <Unlink className="w-4 h-4" />
                    <span>فصل</span>
                  </button>
                )}
              </div>
            </div>

            {/* E.164 Preview & Explicit WhatsApp Consent */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>الصيغة الدولية المعتمدة:</span>
              <span className="font-mono tabular-nums font-bold text-slate-800" dir="ltr">
                {waPreview.e164 || '—'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                التحقق:{' '}
                <strong className={settings.whatsappConfig.verified ? 'text-emerald-700' : 'text-slate-700'}>
                  {settings.whatsappConfig.verified ? 'تم التحقق برسالة اختبار' : 'غير مختبر بعد'}
                </strong>
              </span>
            </div>

            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.whatsappConfig.consentAccepted}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSettings((prev) => ({
                    ...prev,
                    whatsappConfig: {
                      ...prev.whatsappConfig,
                      consentAccepted: checked,
                      consentTimestamp: checked
                        ? prev.whatsappConfig.consentTimestamp || new Date().toISOString()
                        : null,
                    },
                  }));
                }}
                className="mt-1 w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
              />
              <span className="text-xs font-bold text-slate-700 leading-relaxed">
                أؤكد موافقتي الصريحة على استقبال التنبيهات التربوية غير التعريفية على رقم WhatsApp المذكور، مع إمكانية فصله في أي وقت.
              </span>
            </label>

            {whatsappTestFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  whatsappTestFeedback.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {whatsappTestFeedback.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>{whatsappTestFeedback.text}</span>
              </div>
            )}
          </section>

          {/* 4. Message Types Control */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">
                4. التحكم في أنواع الإشعارات والرسائل المستقبلة
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                اختر الفئات البيداغوجية التي تود تلقي تنبيهات بشأنها.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  key: 'classAlerts' as const,
                  title: 'تنبيهات الأقسام والمؤشرات الجماعية',
                  desc: 'صعوبات التفكير النقدي، ضعف الحجاج، وارتفاع القلق التعبيري بعد 5 مشاركات.',
                },
                {
                  key: 'studentAlerts' as const,
                  title: 'مؤشرات المواكبة الفردية للمتعلمين',
                  desc: 'تنبيه غير تعريفي عند رصد حاجز وجداني مرتفع أو تباين إشكالي لدى أحد التلاميذ.',
                },
                {
                  key: 'aiRecommendations' as const,
                  title: 'التوصيات والملاحظات التربوية الذكية',
                  desc: 'مؤشرات تباين مستويات القسم وانخفاض الفضول المعرفي مع مقترحات تدخل صفي.',
                },
                {
                  key: 'sessionSummaries' as const,
                  title: 'ملخصات الجلسات التشخيصية',
                  desc: 'إشعار موجز عند اكتمال الجلسة أو توفر معطيات كافية لقراءة التقرير.',
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-start justify-between gap-3 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-900">{item.title}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.messageTypes[item.key]}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        messageTypes: {
                          ...prev.messageTypes,
                          [item.key]: e.target.checked,
                        },
                      }))
                    }
                    className="w-4 h-4 accent-sky-600 mt-1 cursor-pointer shrink-0"
                  />
                </label>
              ))}
            </div>
          </section>

          {/* Save Actions Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <button
              type="button"
              onClick={() => handleDisconnectChannel('external')}
              className="min-h-[42px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              تعطيل جميع القنوات الخارجية وفصلها
            </button>

            <button
              type="submit"
              disabled={savingSettings}
              className="min-h-[44px] px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              {savingSettings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4 text-sky-400" />
              )}
              <span>حفظ إعدادات الإشعارات</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
