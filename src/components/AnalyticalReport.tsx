/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  FileText,
  Printer,
  RefreshCw,
  Search,
  Users,
  Brain,
  ShieldCheck,
  Compass,
  Eye,
  AlertCircle,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeSessionSubmissionsFirestore } from '../lib/firestoreSync';
import { DiagnosticSession, StudentSubmission, ThinkingStyle } from '../types';

interface AnalyticalReportProps {
  sessionId?: string;
  studentSessionId?: string;
  sessions: DiagnosticSession[];
  fallbackSubmissions: StudentSubmission[];
  useSimulationData?: boolean;
  onSessionChange?: (sessionId: string) => void;
  onSelectStudent?: (student: StudentSubmission) => void;
  onPrintReport?: () => void;
  onNavigateToSessions?: () => void;
}

type StyleFilter = 'all' | ThinkingStyle;
type ChartMode = 'bar' | 'pie';
type SortField = 'recent' | 'name' | 'critical' | 'curiosity' | 'shallow' | 'fear' | 'reliability';
type SortDirection = 'asc' | 'desc';

const THINKING_STYLE_META: Record<
  ThinkingStyle,
  { color: string; badgeClass: string; shortLabel: string; interventionHint: string }
> = {
  'تفكير نقدي': {
    color: '#059669',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    shortLabel: 'نقدي',
    interventionHint: 'تكليف الفئة بدراسة نصوص فلسفية حجاجية وتنشيط المناظرات الصفية.',
  },
  'فضول معرفي': {
    color: '#4F46E5',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    shortLabel: 'فضول',
    interventionHint: 'استثمار دافعية التساؤل عبر وضعيات-مشكلة مفتوحة وربطها بالواقع المعيش.',
  },
  'تفكير سطحي': {
    color: '#D97706',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    shortLabel: 'سطحي',
    interventionHint: 'تفكيك الجاهز من الأفكار عبر تمارين الأَمثلة والحجاج الاستدلالي المتدرج.',
  },
  'خوف معرفي': {
    color: '#DC2626',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    shortLabel: 'خوف',
    interventionHint: 'تبسيط المداخل المفاهيمية وإزالة التوتر تجاه الخطأ والتقويم الكتابي.',
  },
};

function matchesSession(sub: StudentSubmission, studentSessionId: string): boolean {
  const normalized = (studentSessionId || 'all').trim().toUpperCase();
  if (!normalized || normalized === 'ALL') return true;
  const subSid = String(sub.sessionId || sub.session_id || '').trim().toUpperCase();
  return subSid === normalized;
}

export default function AnalyticalReport({
  sessionId,
  studentSessionId,
  sessions,
  fallbackSubmissions,
  useSimulationData = false,
  onSessionChange,
  onSelectStudent,
  onPrintReport,
  onNavigateToSessions,
}: AnalyticalReportProps) {
  const activeSessionId = (sessionId ?? studentSessionId ?? 'all').trim() || 'all';

  const [cloudSubmissions, setCloudSubmissions] = useState<StudentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'firestore' | 'local' | 'simulation'>('local');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');
  const [chartMode, setChartMode] = useState<ChartMode>('bar');
  const [sortField, setSortField] = useState<SortField>('recent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const activeSession = useMemo(() => {
    const target = activeSessionId.toUpperCase();
    if (!target || target === 'ALL') return null;
    return sessions.find((s) => s.sessionId.toUpperCase() === target) || null;
  }, [sessions, activeSessionId]);

  const scopedFallback = useMemo(
    () => fallbackSubmissions.filter((sub) => matchesSession(sub, activeSessionId)),
    [fallbackSubmissions, activeSessionId]
  );

  useEffect(() => {
    if (useSimulationData) {
      setCloudSubmissions([]);
      setIsLoading(false);
      setFirestoreError(null);
      setDataSource('simulation');
      setLastUpdatedAt(new Date().toISOString());
      return;
    }

    if (!auth.currentUser) {
      setCloudSubmissions([]);
      setIsLoading(false);
      setFirestoreError(null);
      setDataSource('local');
      return;
    }

    setIsLoading(true);
    setFirestoreError(null);

    const unsubscribe = subscribeSessionSubmissionsFirestore(
      activeSessionId,
      (items, meta) => {
        setCloudSubmissions(items);
        setIsLoading(false);
        setFirestoreError(null);
        setDataSource(items.length > 0 ? 'firestore' : scopedFallback.length > 0 ? 'local' : 'firestore');
        setLastUpdatedAt(meta.updatedAt);
      },
      (errMessage) => {
        setIsLoading(false);
        setFirestoreError(errMessage);
        setDataSource('local');
      }
    );

    return () => unsubscribe();
  }, [activeSessionId, useSimulationData, refreshNonce, scopedFallback.length]);

  const mergedSubmissions = useMemo(() => {
    if (useSimulationData) return scopedFallback;

    const map = new Map<string, StudentSubmission>();
    scopedFallback.forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    cloudSubmissions.forEach((item) => {
      if (item?.id && matchesSession(item, activeSessionId)) {
        map.set(item.id, { ...(map.get(item.id) || {}), ...item });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
    );
  }, [useSimulationData, scopedFallback, cloudSubmissions, activeSessionId]);

  const analytics = useMemo(() => {
    const total = mergedSubmissions.length;
    const stylesOrder: ThinkingStyle[] = [
      'تفكير نقدي',
      'فضول معرفي',
      'تفكير سطحي',
      'خوف معرفي',
    ];

    const styleCounts: Record<ThinkingStyle, number> = {
      'تفكير نقدي': 0,
      'فضول معرفي': 0,
      'تفكير سطحي': 0,
      'خوف معرفي': 0,
    };

    let fearSum = 0;
    let curiositySum = 0;
    let shallowSum = 0;
    let criticalSum = 0;
    let reliabilitySum = 0;

    mergedSubmissions.forEach((sub) => {
      const style = (sub.overriddenClassification ||
        sub.analysis?.classification ||
        'تفكير سطحي') as ThinkingStyle;
      if (style in styleCounts) {
        styleCounts[style] += 1;
      }
      const m = sub.analysis?.metrics;
      fearSum += Number(m?.cognitiveFear || 0);
      curiositySum += Number(m?.cognitiveCuriosity || 0);
      shallowSum += Number(m?.shallowThinking || 0);
      criticalSum += Number(m?.criticalThinking || 0);
      reliabilitySum +=
        typeof sub.reliabilityIndex === 'number'
          ? sub.reliabilityIndex
          : sub.analysis?.credibilityAssessment?.overallScore ?? 100;
    });

    const distribution = stylesOrder.map((style) => {
      const count = styleCounts[style];
      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
      return {
        style,
        name: style,
        shortName: THINKING_STYLE_META[style].shortLabel,
        count,
        percentage,
        color: THINKING_STYLE_META[style].color,
      };
    });

    const dominant = distribution.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      distribution[0]
    );

    const dimensions = [
      {
        key: 'critical',
        dimension: 'التفكير النقدي',
        average: total > 0 ? Math.round(criticalSum / total) : 0,
        color: '#059669',
      },
      {
        key: 'curiosity',
        dimension: 'الفضول المعرفي',
        average: total > 0 ? Math.round(curiositySum / total) : 0,
        color: '#4F46E5',
      },
      {
        key: 'shallow',
        dimension: 'التفكير السطحي',
        average: total > 0 ? Math.round(shallowSum / total) : 0,
        color: '#D97706',
      },
      {
        key: 'fear',
        dimension: 'الخوف المعرفي',
        average: total > 0 ? Math.round(fearSum / total) : 0,
        color: '#DC2626',
      },
    ];

    return {
      total,
      avgCritical: total > 0 ? Math.round(criticalSum / total) : 0,
      avgCuriosity: total > 0 ? Math.round(curiositySum / total) : 0,
      avgReliability: total > 0 ? Math.round(reliabilitySum / total) : 0,
      dominantStyle: dominant,
      distribution,
      dimensions,
    };
  }, [mergedSubmissions]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = mergedSubmissions.filter((sub) => {
      const effectiveStyle = (sub.overriddenClassification ||
        sub.analysis?.classification ||
        'تفكير سطحي') as ThinkingStyle;
      if (styleFilter !== 'all' && effectiveStyle !== styleFilter) {
        return false;
      }
      if (!q) return true;
      const name = String(sub.studentName || sub.student_name || '').toLowerCase();
      const rec = String(sub.analysis?.pedagogicalRecommendation || '').toLowerCase();
      const cls = String(sub.classNumber || sub.class || '').toLowerCase();
      return name.includes(q) || rec.includes(q) || cls.includes(q);
    });

    const factor = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortField === 'name') {
        const na = String(a.studentName || a.student_name || '');
        const nb = String(b.studentName || b.student_name || '');
        return na.localeCompare(nb, 'ar') * factor;
      }
      if (sortField === 'critical') {
        return (
          (Number(a.analysis?.metrics?.criticalThinking || 0) -
            Number(b.analysis?.metrics?.criticalThinking || 0)) *
          factor
        );
      }
      if (sortField === 'curiosity') {
        return (
          (Number(a.analysis?.metrics?.cognitiveCuriosity || 0) -
            Number(b.analysis?.metrics?.cognitiveCuriosity || 0)) *
          factor
        );
      }
      if (sortField === 'shallow') {
        return (
          (Number(a.analysis?.metrics?.shallowThinking || 0) -
            Number(b.analysis?.metrics?.shallowThinking || 0)) *
          factor
        );
      }
      if (sortField === 'fear') {
        return (
          (Number(a.analysis?.metrics?.cognitiveFear || 0) -
            Number(b.analysis?.metrics?.cognitiveFear || 0)) *
          factor
        );
      }
      if (sortField === 'reliability') {
        const ra =
          typeof a.reliabilityIndex === 'number'
            ? a.reliabilityIndex
            : a.analysis?.credibilityAssessment?.overallScore ?? 100;
        const rb =
          typeof b.reliabilityIndex === 'number'
            ? b.reliabilityIndex
            : b.analysis?.credibilityAssessment?.overallScore ?? 100;
        return (ra - rb) * factor;
      }
      return String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')) * factor;
    });
  }, [mergedSubmissions, searchQuery, styleFilter, sortField, sortDirection]);

  const sourceLabel =
    dataSource === 'simulation'
      ? 'بيانات المحاكاة التجريبية'
      : dataSource === 'firestore'
      ? 'مزامنة Firestore المباشرة'
      : 'الذاكرة المحلية والخادم';

  const formattedUpdateTime = useMemo(() => {
    if (!lastUpdatedAt) return null;
    try {
      return new Date(lastUpdatedAt).toLocaleTimeString('ar-MA', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return null;
    }
  }, [lastUpdatedAt]);

  return (
    <section
      id="analytical-report-section"
      dir="rtl"
      className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6 font-sans"
    >
      {/* Header & Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-slate-700 shrink-0" />
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              التقرير التحليلي المهيكل لنتائج الجلسة
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-semibold">
            <span className="font-mono tabular-nums text-slate-700">
              {activeSessionId === 'all' ? 'جميع الجلسات' : `الجلسة: ${activeSessionId}`}
            </span>
            {activeSession && (
              <>
                <span aria-hidden="true">·</span>
                <span>{activeSession.title}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeSession.level} / {activeSession.stream}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{sourceLabel}</span>
            {formattedUpdateTime && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">آخر تحديث {formattedUpdateTime}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onSessionChange && (
            <select
              aria-label="اختيار الجلسة للتقرير التحليلي"
              value={activeSessionId}
              onChange={(e) => onSessionChange(e.target.value)}
              disabled={useSimulationData}
              className="min-h-[40px] bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="all">كل الجلسات</option>
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionId} — {s.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setRefreshNonce((n) => n + 1)}
            disabled={isLoading || useSimulationData}
            className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            disabled={analytics.total === 0}
            onClick={() => (onPrintReport ? onPrintReport() : window.print())}
            className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>تصدير / طباعة PDF</span>
          </button>
        </div>
      </div>

      {/* Non-blocking Firestore Warning Banner */}
      {firestoreError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">تعذر البث المباشر من Firestore — يتم عرض النتائج المحفوظة محلياً</p>
              <p className="text-[11px] text-amber-800 font-mono truncate max-w-2xl">
                {firestoreError.startsWith('{')
                  ? 'تحقق من تسجيل الدخول بحساب Google المالك لهذه الجلسة.'
                  : firestoreError}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRefreshNonce((n) => n + 1)}
            className="min-h-[36px] px-3 py-1.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Loading Skeleton State */}
      {isLoading && analytics.total === 0 ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-24 bg-slate-100 border border-slate-200 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 bg-slate-100 border border-slate-200 rounded-xl" />
            <div className="h-72 bg-slate-100 border border-slate-200 rounded-xl" />
          </div>
          <div className="h-48 bg-slate-100 border border-slate-200 rounded-xl" />
        </div>
      ) : analytics.total === 0 ? (
        /* Empty State */
        <div className="border border-dashed border-slate-300 rounded-xl py-12 px-4 text-center space-y-3 bg-slate-50/50">
          <div className="w-12 h-12 mx-auto rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-black text-slate-800">
            لا توجد نتائج مسجلة لهذه الجلسة بعد
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            عندما يرسل التلاميذ استماراتهم ضمن الجلسة المختارة، ستظهر النتائج والتحليلات التربوية هنا تلقائياً.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {activeSessionId !== 'all' && onSessionChange && (
              <button
                type="button"
                onClick={() => onSessionChange('all')}
                className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                عرض جميع الجلسات
              </button>
            )}
            {onNavigateToSessions && (
              <button
                type="button"
                onClick={onNavigateToSessions}
                className="min-h-[40px] px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                إدارة الجلسات وروابط الدخول
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 1. 4-Column Summary KPIs Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>إجمالي المشاركات</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {analytics.total}
              </p>
              <p className="text-[11px] text-slate-500">
                تلميذ(ة) في نطاق التقرير
              </p>
            </div>

            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>معدل التفكير النقدي</span>
                <Brain className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {analytics.avgCritical}%
              </p>
              <p className="text-[11px] text-emerald-700 font-semibold">
                {analytics.avgCritical >= 70
                  ? 'مستوى حجاجي متقدم'
                  : analytics.avgCritical >= 50
                  ? 'استعداد متوسط للتحليل'
                  : 'يحتاج إلى دعم منهجي'}
              </p>
            </div>

            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>النمط المعرفي الغالب</span>
                <Compass className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-lg font-black text-slate-900 truncate">
                {analytics.dominantStyle.name}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                {analytics.dominantStyle.count} تلاميذ ({analytics.dominantStyle.percentage}%)
              </p>
            </div>

            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                <span>متوسط الموثوقية</span>
                <ShieldCheck className="w-4 h-4 text-slate-500" />
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {analytics.avgReliability}%
              </p>
              <p className="text-[11px] text-slate-500">
                مؤشر نزاهة وجودة الاستجابات
              </p>
            </div>
          </div>

          {/* 2. Charts Section: Thinking Styles Distribution + Cognitive Dimensions Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Thinking Styles Distribution */}
            <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-900">
                    توزيع أنماط التفكير الأربعة
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تصنيف التلاميذ وفق التشخيص المعرفي
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setChartMode('bar')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                      chartMode === 'bar'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>أعمدة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('pie')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                      chartMode === 'pie'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PieChartIcon className="w-3.5 h-3.5" />
                    <span>دائري</span>
                  </button>
                </div>
              </div>

              <div className="h-60 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  {chartMode === 'bar' ? (
                    <BarChart
                      data={analytics.distribution}
                      margin={{ top: 10, right: 16, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="shortName" tick={{ fontSize: 12, fill: '#475569' }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip
                        formatter={(value: any, _name: any, props: any) => [
                          `${value} تلاميذ (${props?.payload?.percentage || 0}%)`,
                          props?.payload?.name || 'العدد',
                        ]}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={52}>
                        {analytics.distribution.map((entry) => (
                          <Cell key={entry.style} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={analytics.distribution.filter((d) => d.count > 0)}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={82}
                        paddingAngle={3}
                      >
                        {analytics.distribution
                          .filter((d) => d.count > 0)
                          .map((entry) => (
                            <Cell key={entry.style} fill={entry.color} />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any, props: any) => [
                          `${value} (${props?.payload?.percentage || 0}%)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                {analytics.distribution.map((item) => (
                  <div key={item.style} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate">{item.style}</span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-900 font-black">
                      {item.count} <span className="text-slate-400 font-normal">({item.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 4 Cognitive Dimensions Comparison */}
            <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  مقارنة متوسطات الأبعاد المعرفية
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  متوسط درجات الفوج من 100 عبر المؤشرات الأربعة
                </p>
              </div>

              <div className="h-56 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="72%"
                    data={analytics.dimensions}
                  >
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                    />
                    <Radar
                      name="متوسط الجلسة"
                      dataKey="average"
                      stroke="#4F46E5"
                      fill="#4F46E5"
                      fillOpacity={0.22}
                    />
                    <Tooltip formatter={(val: any) => [`${val}%`, 'المتوسط']} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {analytics.dimensions.map((dim) => (
                  <div key={dim.key} className="flex items-center gap-3 text-xs">
                    <span className="w-28 text-slate-700 font-bold shrink-0">
                      {dim.dimension}
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${dim.average}%`,
                          backgroundColor: dim.color,
                        }}
                      />
                    </div>
                    <span className="w-11 text-left font-mono tabular-nums font-black text-slate-900 shrink-0">
                      {dim.average}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Detailed Student Results Table with Search, Filter & Pedagogical Recommendations */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  جدول نتائج التلاميذ والتوصيات التربوية
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                  عرض {filteredRows.length} من أصل {analytics.total} مشاركة
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث باسم التلميذ أو التوصية..."
                    className="w-full sm:w-56 min-h-[38px] bg-white border border-slate-200 rounded-lg pr-8 pl-3 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['all', 'تفكير نقدي', 'فضول معرفي', 'تفكير سطحي', 'خوف معرفي'] as StyleFilter[]).map(
                    (opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setStyleFilter(opt)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          styleFilter === opt
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt === 'all' ? 'الكل' : opt}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                لا توجد نتائج مطابقة لمعايير البحث أو الفلترة الحالية.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-black text-slate-500">
                      <th className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleSort('name')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>التلميذ(ة)</span>
                          {sortField === 'name' && (
                            <span className="font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">النمط التشخيصي</th>
                      <th className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSort('critical')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>نقدي</span>
                          {sortField === 'critical' && (
                            <span className="font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSort('curiosity')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>فضول</span>
                          {sortField === 'curiosity' && (
                            <span className="font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSort('shallow')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>سطحي</span>
                          {sortField === 'shallow' && (
                            <span className="font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSort('fear')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>خوف</span>
                          {sortField === 'fear' && (
                            <span className="font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSort('reliability')}
                          className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                        >
                          <span>الموثوقية</span>
                          {sortField === 'reliability' && (
                            <span className="font-mono">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">التوصية التربوية</th>
                      <th className="py-3 px-4 text-left">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredRows.map((sub) => {
                      const style = (sub.overriddenClassification ||
                        sub.analysis?.classification ||
                        'تفكير سطحي') as ThinkingStyle;
                      const styleMeta =
                        THINKING_STYLE_META[style] || THINKING_STYLE_META['تفكير سطحي'];
                      const m = sub.analysis?.metrics;
                      const rel =
                        typeof sub.reliabilityIndex === 'number'
                          ? sub.reliabilityIndex
                          : sub.analysis?.credibilityAssessment?.overallScore ?? 100;
                      const rec =
                        sub.analysis?.pedagogicalRecommendation ||
                        'متابعة تشخيصية فردية حسب استجابات المحاور.';

                      return (
                        <tr
                          key={sub.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">
                              {sub.studentName || sub.student_name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                              {sub.sessionId || sub.session_id || '—'}
                              {sub.classNumber || sub.class
                                ? ` · فوج ${sub.classNumber || sub.class}`
                                : ''}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 border rounded-md text-[11px] font-bold ${styleMeta.badgeClass}`}
                            >
                              {style}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-emerald-700">
                            {Math.round(m?.criticalThinking || 0)}%
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-indigo-700">
                            {Math.round(m?.cognitiveCuriosity || 0)}%
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-amber-700">
                            {Math.round(m?.shallowThinking || 0)}%
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-rose-700">
                            {Math.round(m?.cognitiveFear || 0)}%
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-slate-700">
                            {Math.round(rel)}%
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <p className="text-slate-600 line-clamp-2 leading-relaxed">
                              {rec}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-left whitespace-nowrap">
                            {onSelectStudent && (
                              <button
                                type="button"
                                onClick={() => onSelectStudent(sub)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                <span>معاينة</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Cohort Pedagogical Action Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-black text-slate-900">
                الخلاصة التربوية الموجهة للفوج ({analytics.dominantStyle.name})
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {THINKING_STYLE_META[analytics.dominantStyle.style]?.interventionHint}
              </p>
            </div>
            {onPrintReport && (
              <button
                type="button"
                onClick={onPrintReport}
                className="min-h-[38px] px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                توثيق التقرير PDF
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
