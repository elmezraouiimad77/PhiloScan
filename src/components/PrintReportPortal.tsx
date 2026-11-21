/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { DiagnosticSession, StudentSubmission, TeacherSession } from '../types';

interface PrintReportPortalProps {
  mode: 'student' | 'cohort' | null;
  student: StudentSubmission | null;
  submissions: StudentSubmission[];
  sessions: DiagnosticSession[];
  selectedSessionId: string;
  teacherSession: TeacherSession | null;
}

export const PrintReportPortal: React.FC<PrintReportPortalProps> = ({
  mode,
  student,
  submissions,
  sessions,
  selectedSessionId,
  teacherSession,
}) => {
  if (!mode || typeof document === 'undefined') return null;

  const activeSession =
    selectedSessionId !== 'all'
      ? sessions.find((s) => s.sessionId === selectedSessionId) || null
      : null;

  const printDate = new Date().toLocaleString('ar-MA');

  const content = (
    <div
      className="philoscan-print-portal hidden print:block bg-white text-slate-900 p-6 text-right font-sans"
      dir="rtl"
    >
      {/* Institutional Header */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start gap-4">
        <div>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            المملكة المغربية — منصة فِيلوسكان للتشخيص الفلسفي الذكي (PhiloScan)
          </p>
          <h1 className="text-2xl font-black text-slate-900 mt-1">
            {mode === 'student'
              ? `التقرير التشخيصي الفردي: ${student?.studentName || ''}`
              : activeSession
              ? `التقرير التحليلي للفصل: ${activeSession.title}`
              : 'التقرير التحليلي العام لجميع الفصول الدراسية'}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            الأستاذ الموجه: <strong>{teacherSession?.fullName || '—'}</strong> · المؤسسة:{' '}
            <strong>{activeSession?.institution || teacherSession?.school || '—'}</strong> · الأكاديمية:{' '}
            <strong>{teacherSession?.regionalAcademy || '—'}</strong>
          </p>
        </div>
        <div className="text-left text-xs text-slate-600 shrink-0 tabular-nums">
          <p>تاريخ الإصدار: {printDate}</p>
          {mode === 'student' && student?.deliveryReceiptId && (
            <p className="font-mono font-bold text-slate-900 mt-1">
              رقم الإيصال: {student.deliveryReceiptId}
            </p>
          )}
          {mode === 'cohort' && (
            <p className="font-bold text-slate-900 mt-1">
              رمز الجلسة: {activeSession ? activeSession.sessionId : 'جميع الجلسات'}
            </p>
          )}
        </div>
      </div>

      {mode === 'student' && student && (
        <div className="space-y-6">
          {/* Student Overview Strip */}
          <div className="grid grid-cols-4 gap-3 border border-slate-300 rounded-xl p-4 bg-slate-50">
            <div>
              <span className="text-[11px] text-slate-500 block">التصنيف المعتمد</span>
              <strong className="text-sm font-black text-slate-900">
                {student.overriddenClassification || student.analysis?.classification || '—'}
              </strong>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">الفصل والمستوى</span>
              <strong className="text-sm font-bold text-slate-900">
                {student.level || '—'} · قسم {student.classNumber || student.class || '—'}
              </strong>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">مؤشر المصداقية</span>
              <strong className="text-sm font-black font-mono tabular-nums text-slate-900">
                {Math.round(student.analysis?.credibilityAssessment?.overallScore ?? student.reliabilityIndex ?? 100)}%{' '}
                ({student.analysis?.credibilityAssessment?.verdict || 'موثوقة'})
              </strong>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">تاريخ الإرسال</span>
              <strong className="text-xs font-mono tabular-nums text-slate-800">
                {new Date(student.submittedAt).toLocaleString('ar-MA')}
              </strong>
            </div>
          </div>

          {/* 4 Metrics */}
          <div className="grid grid-cols-4 gap-3 tabular-nums">
            <div className="border border-slate-200 rounded-lg p-3">
              <span className="text-xs text-slate-500 block">التفكير النقدي</span>
              <span className="text-lg font-black font-mono">
                {Math.round(student.analysis?.metrics?.criticalThinking || 0)}%
              </span>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <span className="text-xs text-slate-500 block">الفضول المعرفي</span>
              <span className="text-lg font-black font-mono">
                {Math.round(student.analysis?.metrics?.cognitiveCuriosity || 0)}%
              </span>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <span className="text-xs text-slate-500 block">الخوف المعرفي</span>
              <span className="text-lg font-black font-mono">
                {Math.round(student.analysis?.metrics?.cognitiveFear || 0)}%
              </span>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <span className="text-xs text-slate-500 block">التفكير السطحي</span>
              <span className="text-lg font-black font-mono">
                {Math.round(student.analysis?.metrics?.shallowThinking || 0)}%
              </span>
            </div>
          </div>

          {/* Pedagogical Explanation */}
          <div className="border border-slate-300 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-black text-slate-900">الخلاصة التربوية التشخيصية</h2>
            <p className="text-xs leading-relaxed text-slate-700">{student.analysis?.explanation}</p>
          </div>

          {/* Contradictions & Obstacles */}
          {((student.analysis?.contradictions && student.analysis.contradictions.length > 0) ||
            (student.analysis?.cognitiveObstacles && student.analysis.cognitiveObstacles.length > 0)) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-300 rounded-xl p-4 space-y-2">
                <h2 className="text-sm font-black text-slate-900">التناقضات الدلالية المرصودة</h2>
                {student.analysis?.contradictions && student.analysis.contradictions.length > 0 ? (
                  <ul className="space-y-2 text-xs text-slate-700">
                    {student.analysis.contradictions.map((c, idx) => (
                      <li key={idx} className="border-r-2 border-amber-500 pr-2">
                        <strong className="block">{c.pairLabel} ({c.severity})</strong>
                        <span>{c.description}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">لم تُرصد تناقضات جوهرية في إجابات التلميذ.</p>
                )}
              </div>

              <div className="border border-slate-300 rounded-xl p-4 space-y-2">
                <h2 className="text-sm font-black text-slate-900">العوائق المعرفية المصنفة</h2>
                {student.analysis?.cognitiveObstacles && student.analysis.cognitiveObstacles.length > 0 ? (
                  <ul className="space-y-2 text-xs text-slate-700">
                    {student.analysis.cognitiveObstacles.map((obs, idx) => (
                      <li key={idx} className="border-r-2 border-rose-500 pr-2">
                        <strong className="block">
                          {obs.title} [{obs.category}]
                        </strong>
                        <span>{obs.intervention}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">لا توجد عوائق معرفية مسجلة.</p>
                )}
              </div>
            </div>
          )}

          {/* Question-by-question breakdown */}
          {student.analysis?.questionBreakdown && student.analysis.questionBreakdown.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-black text-slate-900">التفكيك الدقيق لكل سؤال</h2>
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 p-2 text-right">السؤال / المحور</th>
                    <th className="border border-slate-300 p-2 text-right">جواب التلميذ</th>
                    <th className="border border-slate-300 p-2 text-center">العمق</th>
                    <th className="border border-slate-300 p-2 text-right">القراءة الديدكتيكية</th>
                  </tr>
                </thead>
                <tbody>
                  {student.analysis.questionBreakdown.map((qb, i) => (
                    <tr key={i}>
                      <td className="border border-slate-300 p-2 font-bold">{qb.questionLabel}</td>
                      <td className="border border-slate-300 p-2">{qb.answerText}</td>
                      <td className="border border-slate-300 p-2 text-center font-mono tabular-nums">
                        {Math.round(qb.depthScore)}%
                      </td>
                      <td className="border border-slate-300 p-2">{qb.semanticNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Remedial Plan */}
          {student.analysis?.remedialPlan && student.analysis.remedialPlan.length > 0 && (
            <div className="border border-slate-300 rounded-xl p-4 space-y-2">
              <h2 className="text-sm font-black text-slate-900">خطة التدخل العلاجي الفردية</h2>
              <div className="space-y-2">
                {student.analysis.remedialPlan.map((step, i) => (
                  <div key={i} className="text-xs border-b border-slate-200 last:border-b-0 pb-2 last:pb-0">
                    <strong className="block text-slate-900">{step.phase}</strong>
                    <p className="text-slate-700 mt-0.5">{step.action}</p>
                    <p className="text-slate-500 text-[11px]">الهدف البيداغوجي: {step.objective}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {student.teacherNotes && (
            <div className="border border-slate-300 rounded-xl p-4 bg-slate-50">
              <h2 className="text-sm font-black text-slate-900 mb-1">ملاحظات الأستاذ الموجه</h2>
              <p className="text-xs text-slate-700 whitespace-pre-line">{student.teacherNotes}</p>
            </div>
          )}
        </div>
      )}

      {mode === 'cohort' && (
        <div className="space-y-6">
          {(() => {
            const n = submissions.length;
            const avg = (getter: (s: StudentSubmission) => number) =>
              n > 0 ? Math.round(submissions.reduce((acc, s) => acc + getter(s), 0) / n) : 0;

            const styleCounts = {
              critical: submissions.filter((s) => (s.overriddenClassification || s.analysis?.classification) === 'تفكير نقدي').length,
              curiosity: submissions.filter((s) => (s.overriddenClassification || s.analysis?.classification) === 'فضول معرفي').length,
              fear: submissions.filter((s) => (s.overriddenClassification || s.analysis?.classification) === 'خوف معرفي').length,
              shallow: submissions.filter((s) => (s.overriddenClassification || s.analysis?.classification) === 'تفكير سطحي').length,
            };

            return (
              <>
                <div className="grid grid-cols-5 gap-3 tabular-nums">
                  <div className="border border-slate-300 rounded-xl p-3 bg-slate-50">
                    <span className="text-[11px] text-slate-500 block">عدد المشاركين</span>
                    <strong className="text-lg font-black font-mono">{n}</strong>
                  </div>
                  <div className="border border-slate-300 rounded-xl p-3">
                    <span className="text-[11px] text-slate-500 block">متوسط النقدي</span>
                    <strong className="text-lg font-black font-mono">{avg((s) => s.analysis?.metrics?.criticalThinking || 0)}%</strong>
                  </div>
                  <div className="border border-slate-300 rounded-xl p-3">
                    <span className="text-[11px] text-slate-500 block">متوسط الفضول</span>
                    <strong className="text-lg font-black font-mono">{avg((s) => s.analysis?.metrics?.cognitiveCuriosity || 0)}%</strong>
                  </div>
                  <div className="border border-slate-300 rounded-xl p-3">
                    <span className="text-[11px] text-slate-500 block">متوسط الخوف</span>
                    <strong className="text-lg font-black font-mono">{avg((s) => s.analysis?.metrics?.cognitiveFear || 0)}%</strong>
                  </div>
                  <div className="border border-slate-300 rounded-xl p-3">
                    <span className="text-[11px] text-slate-500 block">متوسط المصداقية</span>
                    <strong className="text-lg font-black font-mono">
                      {avg((s) => s.analysis?.credibilityAssessment?.overallScore ?? s.reliabilityIndex ?? 100)}%
                    </strong>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-xs tabular-nums">
                  <div className="border border-slate-200 rounded-lg p-3">تفكير نقدي: <strong>{styleCounts.critical}</strong></div>
                  <div className="border border-slate-200 rounded-lg p-3">فضول معرفي: <strong>{styleCounts.curiosity}</strong></div>
                  <div className="border border-slate-200 rounded-lg p-3">خوف معرفي: <strong>{styleCounts.fear}</strong></div>
                  <div className="border border-slate-200 rounded-lg p-3">تفكير سطحي: <strong>{styleCounts.shallow}</strong></div>
                </div>

                <div>
                  <h2 className="text-sm font-black text-slate-900 mb-2">لائحة النتائج الفردية التفصيلية</h2>
                  <table className="w-full border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 p-2 text-right">التلميذ(ة)</th>
                        <th className="border border-slate-300 p-2 text-right">النمط</th>
                        <th className="border border-slate-300 p-2 text-center">النقدي</th>
                        <th className="border border-slate-300 p-2 text-center">الفضول</th>
                        <th className="border border-slate-300 p-2 text-center">الخوف</th>
                        <th className="border border-slate-300 p-2 text-center">السطحي</th>
                        <th className="border border-slate-300 p-2 text-center">المصداقية</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {submissions.map((sub) => (
                        <tr key={sub.id}>
                          <td className="border border-slate-300 p-2 font-bold">{sub.studentName}</td>
                          <td className="border border-slate-300 p-2">
                            {sub.overriddenClassification || sub.analysis?.classification}
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono">
                            {Math.round(sub.analysis?.metrics?.criticalThinking || 0)}%
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono">
                            {Math.round(sub.analysis?.metrics?.cognitiveCuriosity || 0)}%
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono">
                            {Math.round(sub.analysis?.metrics?.cognitiveFear || 0)}%
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono">
                            {Math.round(sub.analysis?.metrics?.shallowThinking || 0)}%
                          </td>
                          <td className="border border-slate-300 p-2 text-center font-mono">
                            {Math.round(sub.analysis?.credibilityAssessment?.overallScore ?? sub.reliabilityIndex ?? 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};

export default PrintReportPortal;
