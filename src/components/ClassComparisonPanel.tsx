/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Layers, Printer, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DiagnosticSession, StudentSubmission } from '../types';

interface ClassComparisonPanelProps {
  sessions: DiagnosticSession[];
  submissions: StudentSubmission[];
  onSelectSession?: (sessionId: string) => void;
  onPrintCohortReport: () => void;
}

export const ClassComparisonPanel: React.FC<ClassComparisonPanelProps> = ({
  sessions,
  submissions,
  onSelectSession,
  onPrintCohortReport,
}) => {
  const comparisonRows = useMemo(() => {
    const groups = new Map<
      string,
      {
        sessionId: string;
        title: string;
        label: string;
        levelStream: string;
        subs: StudentSubmission[];
      }
    >();

    sessions.forEach((sess) => {
      const sid = sess.sessionId.toUpperCase();
      groups.set(sid, {
        sessionId: sess.sessionId,
        title: sess.title,
        label: `${sess.title.slice(0, 18)} (${sess.classNumber})`,
        levelStream: `${sess.level} · ${sess.stream}`,
        subs: [],
      });
    });

    submissions.forEach((sub) => {
      const sid = (sub.sessionId || sub.session_id || 'DEFAULT').toUpperCase();
      if (!groups.has(sid)) {
        groups.set(sid, {
          sessionId: sid,
          title: sub.sessionTitle || `جلسة ${sid}`,
          label: `${sid} (قسم ${sub.classNumber || sub.class || '—'})`,
          levelStream: `${sub.level || '—'} · ${sub.stream || '—'}`,
          subs: [],
        });
      }
      groups.get(sid)!.subs.push(sub);
    });

    return Array.from(groups.values()).map((g) => {
      const n = g.subs.length;
      const avg = (fn: (s: StudentSubmission) => number) =>
        n > 0 ? Math.round(g.subs.reduce((acc, s) => acc + fn(s), 0) / n) : 0;

      const contradictionsCount = g.subs.reduce(
        (acc, s) => acc + (s.analysis?.contradictions?.length || 0),
        0
      );

      const obstacleCounts: Record<string, number> = {};
      g.subs.forEach((s) => {
        (s.analysis?.cognitiveObstacles || []).forEach((obs) => {
          obstacleCounts[obs.title] = (obstacleCounts[obs.title] || 0) + 1;
        });
      });
      const topObstacle =
        Object.entries(obstacleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'لا عوائق سائدة';

      return {
        sessionId: g.sessionId,
        title: g.title,
        label: g.label,
        levelStream: g.levelStream,
        count: n,
        critical: avg((s) => s.analysis?.metrics?.criticalThinking || 0),
        curiosity: avg((s) => s.analysis?.metrics?.cognitiveCuriosity || 0),
        fear: avg((s) => s.analysis?.metrics?.cognitiveFear || 0),
        shallow: avg((s) => s.analysis?.metrics?.shallowThinking || 0),
        credibility: avg((s) => s.analysis?.credibilityAssessment?.overallScore ?? s.reliabilityIndex ?? 100),
        contradictionsCount,
        topObstacle,
      };
    });
  }, [sessions, submissions]);

  const globalTopObstacles = useMemo(() => {
    const counts = new Map<string, { title: string; category: string; count: number; intervention: string }>();
    submissions.forEach((sub) => {
      (sub.analysis?.cognitiveObstacles || []).forEach((obs) => {
        const existing = counts.get(obs.title);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(obs.title, {
            title: obs.title,
            category: obs.category,
            count: 1,
            intervention: obs.intervention,
          });
        }
      });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [submissions]);

  return (
    <div className="bg-white rounded-[24px] sm:rounded-[32px] border border-slate-200 p-4 sm:p-6 space-y-6 text-right" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h4 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>المقارنة الدقيقة بين الفصول ومصفوفة العوائق المعرفية</span>
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            مقارنة مستعرضة لمستويات التفكير، مؤشرات المصداقية، وأبرز العوائق الديدكتيكية عبر جميع جلساتك.
          </p>
        </div>

        <button
          type="button"
          onClick={onPrintCohortReport}
          className="min-h-[44px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer transition shrink-0"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة التقرير التحليلي للفصل</span>
        </button>
      </div>

      {comparisonRows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          لا توجد جلسات أو إجابات كافية لعقد مقارنة بين الفصول بعد.
        </div>
      ) : (
        <>
          {/* Bar Chart Comparison */}
          <div className="h-[260px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonRows} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    direction: 'rtl',
                    textAlign: 'right',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="critical" name="التفكير النقدي (%)" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="curiosity" name="الفضول المعرفي (%)" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="fear" name="الخوف المعرفي (%)" fill="#ef4444" radius={[6, 6, 0, 0]} />
                <Bar dataKey="credibility" name="المصداقية (%)" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Desktop Comparison Table */}
          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="p-3 font-black">الجلسة / الفصل</th>
                  <th className="p-3 font-black text-center">المشاركون</th>
                  <th className="p-3 font-black text-center">النقدي</th>
                  <th className="p-3 font-black text-center">الفضول</th>
                  <th className="p-3 font-black text-center">الخوف</th>
                  <th className="p-3 font-black text-center">المصداقية</th>
                  <th className="p-3 font-black text-center">تناقضات</th>
                  <th className="p-3 font-black">العائق الأبرز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {comparisonRows.map((row) => (
                  <tr
                    key={row.sessionId}
                    onClick={() => onSelectSession?.(row.sessionId)}
                    className="hover:bg-slate-50 transition cursor-pointer"
                  >
                    <td className="p-3">
                      <span className="font-black text-slate-900 block">{row.title}</span>
                      <span className="text-[11px] text-slate-500">
                        {row.sessionId} · {row.levelStream}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{row.count}</td>
                    <td className="p-3 text-center font-mono font-bold text-emerald-700">{row.critical}%</td>
                    <td className="p-3 text-center font-mono font-bold text-blue-700">{row.curiosity}%</td>
                    <td className="p-3 text-center font-mono font-bold text-rose-700">{row.fear}%</td>
                    <td className="p-3 text-center font-mono font-bold text-indigo-700">{row.credibility}%</td>
                    <td className="p-3 text-center font-mono font-bold text-amber-700">{row.contradictionsCount}</td>
                    <td className="p-3 text-slate-600 max-w-[220px] truncate">{row.topObstacle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden tabular-nums">
            {comparisonRows.map((row) => (
              <button
                key={row.sessionId}
                type="button"
                onClick={() => onSelectSession?.(row.sessionId)}
                className="text-right p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-2.5 cursor-pointer"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h5 className="font-black text-sm text-slate-900">{row.title}</h5>
                    <p className="text-[11px] text-slate-500">{row.levelStream}</p>
                  </div>
                  <span className="text-xs font-mono font-black text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    {row.count} تلميذ
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block">نقدي</span>
                    <strong className="text-emerald-700 font-mono">{row.critical}%</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block">فضول</span>
                    <strong className="text-blue-700 font-mono">{row.curiosity}%</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block">خوف</span>
                    <strong className="text-rose-700 font-mono">{row.fear}%</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100">
                    <span className="text-slate-400 block">مصداقية</span>
                    <strong className="text-indigo-700 font-mono">{row.credibility}%</strong>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600">
                  <strong>العائق السائد:</strong> {row.topObstacle}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Top Cognitive Obstacles across classes */}
      {globalTopObstacles.length > 0 && (
        <div className="pt-2 space-y-3">
          <h5 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>خريطة العوائق المعرفية الأعلى تكراراً والتدخل الديدكتيكي الموصى به</span>
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {globalTopObstacles.map((obs) => (
              <div
                key={obs.title}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-900">{obs.title}</span>
                  <span className="text-[11px] font-mono font-black text-amber-700 tabular-nums shrink-0">
                    {obs.count} حالة
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{obs.intervention}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassComparisonPanel;
