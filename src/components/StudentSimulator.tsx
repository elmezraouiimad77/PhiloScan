/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Monitor,
  Play,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { FileAnswerPayload, FormQuestion } from '../types';
import QuestionRenderer, {
  DEFAULT_GRID_COLUMNS,
  isQuestionAnswered,
} from './QuestionRenderer';

export interface SimulatorSessionMeta {
  sessionId?: string;
  institution?: string;
  province?: string;
  level?: string;
  stream?: string;
  classNumber?: string;
  lessonTopic?: string;
}

export interface StudentSimulatorProps {
  isOpen?: boolean;
  mode?: 'modal' | 'embedded';
  title: string;
  description?: string;
  questions: FormQuestion[];
  sessionMeta?: SimulatorSessionMeta;
  initialAnswers?: Record<string, any>;
  onAnswersChange?: (nextAnswers: Record<string, any>) => void;
  showPedagogicalMetaByDefault?: boolean;
  returnLabel?: string;
  onClose: () => void;
}

function formatAnswerForReceipt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    return value.map((item, idx) => `${idx + 1}. ${String(item)}`).join(' · ');
  }
  if (typeof value === 'object') {
    if ('fileName' in (value as Record<string, any>)) {
      const f = value as FileAnswerPayload;
      return `${f.fileName} (${f.fileSizeKb} KB)`;
    }
    return Object.entries(value as Record<string, string>)
      .map(([row, col]) => `${row}: ${col}`)
      .join(' | ');
  }
  return String(value);
}

export default function StudentSimulator({
  isOpen = true,
  mode = 'modal',
  title,
  description,
  questions,
  sessionMeta,
  initialAnswers,
  onAnswersChange,
  showPedagogicalMetaByDefault = false,
  returnLabel = 'إغلاق والعودة إلى لوحة تحرير الاستمارة',
  onClose,
}: StudentSimulatorProps) {
  const [simAnswers, setSimAnswers] = useState<Record<string, any>>(initialAnswers || {});
  const [viewportMode, setViewportMode] = useState<'desktop' | 'mobile'>('desktop');
  const [displayMode, setDisplayMode] = useState<'all' | 'step'>('all');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showPedagogicalMeta, setShowPedagogicalMeta] = useState<boolean>(
    showPedagogicalMetaByDefault
  );
  const [lastFeedback, setLastFeedback] = useState<{
    questionId: string;
    index: number;
    label: string;
  } | null>(null);
  const [missingRequiredIds, setMissingRequiredIds] = useState<string[]>([]);
  const [simulatedReceipt, setSimulatedReceipt] = useState<{
    receiptCode: string;
    timestamp: string;
    answeredCount: number;
    totalCount: number;
  } | null>(null);

  useEffect(() => {
    if (initialAnswers) {
      setSimAnswers(initialAnswers);
    }
  }, [initialAnswers]);

  useEffect(() => {
    if (isOpen) {
      setSimulatedReceipt(null);
      setMissingRequiredIds([]);
      setCurrentStep(0);
      setLastFeedback(null);
      setSimAnswers(initialAnswers || {});
    }
  }, [isOpen, title]);

  useEffect(() => {
    if (currentStep >= questions.length && questions.length > 0) {
      setCurrentStep(questions.length - 1);
    }
  }, [questions.length, currentStep]);

  useEffect(() => {
    if (!lastFeedback) return;
    const timer = setTimeout(() => setLastFeedback(null), 1600);
    return () => clearTimeout(timer);
  }, [lastFeedback]);

  const answeredCount = useMemo(
    () => questions.filter((q) => isQuestionAnswered(q, simAnswers[q.id])).length,
    [questions, simAnswers]
  );

  const requiredCount = useMemo(
    () => questions.filter((q) => q.required !== false).length,
    [questions]
  );

  const progressPct = useMemo(() => {
    if (questions.length === 0) return 0;
    return Math.round((answeredCount / questions.length) * 100);
  }, [answeredCount, questions.length]);

  const handleAnswerChange = (questionId: string, value: any) => {
    const next = { ...simAnswers, [questionId]: value };
    setSimAnswers(next);
    if (onAnswersChange) {
      onAnswersChange(next);
    }
    setMissingRequiredIds((prev) => prev.filter((id) => id !== questionId));

    const qIdx = questions.findIndex((q) => q.id === questionId);
    if (qIdx >= 0) {
      setLastFeedback({
        questionId,
        index: qIdx + 1,
        label: questions[qIdx].label,
      });
    }
  };

  const handleQuickFill = () => {
    const filled: Record<string, any> = {};
    questions.forEach((q, idx) => {
      if (q.type === 'short') {
        filled[q.id] = 'التفلسف تساؤل نقدي ومساءلة للبديهيات.';
      } else if (q.type === 'long' || q.type === 'open') {
        filled[q.id] =
          'أرى أن التفكير الفلسفي يعلّمنا بناء الحجج العقلانية والتمييز بين الرأي العفوي والمعرفة المؤسسة على البرهان.';
      } else if (q.type === 'single') {
        filled[q.id] = q.options && q.options.length > 0 ? q.options[0] : 'خيار أول';
      } else if (q.type === 'multi') {
        filled[q.id] =
          q.options && q.options.length >= 2
            ? q.options.slice(0, 2)
            : q.options && q.options.length > 0
            ? [q.options[0]]
            : [];
      } else if (q.type === 'scale') {
        filled[q.id] = idx % 2 === 0 ? 4 : 5;
      } else if (q.type === 'boolean') {
        filled[q.id] = 'نعم / صحيح';
      } else if (q.type === 'order') {
        const opts = q.options && q.options.length > 0 ? [...q.options] : ['العنصر 1', 'العنصر 2'];
        filled[q.id] = opts.length >= 2 ? [opts[1], opts[0], ...opts.slice(2)] : opts;
      } else if (q.type === 'grid') {
        const cols =
          q.gridColumns && q.gridColumns.length > 0 ? q.gridColumns : DEFAULT_GRID_COLUMNS;
        const rows = q.options && q.options.length > 0 ? q.options : ['المعيار الأول'];
        const gridMap: Record<string, string> = {};
        rows.forEach((row, rIdx) => {
          gridMap[row] = cols[Math.min(cols.length - 1, (rIdx + 2) % cols.length)];
        });
        filled[q.id] = gridMap;
      } else if (q.type === 'file') {
        filled[q.id] = {
          fileName: 'نموذج-تحليل-فلسفي-تجريبي.pdf',
          fileSizeKb: 245,
          mimeType: 'application/pdf',
        } as FileAnswerPayload;
      }
    });

    setSimAnswers(filled);
    if (onAnswersChange) {
      onAnswersChange(filled);
    }
    setMissingRequiredIds([]);
    setSimulatedReceipt(null);
    setLastFeedback({
      questionId: 'quick-fill',
      index: questions.length,
      label: 'تم ملء كافة الحقول تجريبياً لمعاينة التأثيرات.',
    });
  };

  const handleReset = () => {
    setSimAnswers({});
    if (onAnswersChange) {
      onAnswersChange({});
    }
    setCurrentStep(0);
    setMissingRequiredIds([]);
    setSimulatedReceipt(null);
    setLastFeedback(null);
  };

  const handleSimulateSubmit = () => {
    const normalizedAnswers: Record<string, any> = { ...simAnswers };
    questions.forEach((q) => {
      if (q.type === 'scale' && normalizedAnswers[q.id] === undefined) {
        normalizedAnswers[q.id] = 3;
      }
      if (
        q.type === 'order' &&
        (!Array.isArray(normalizedAnswers[q.id]) || normalizedAnswers[q.id].length === 0) &&
        q.options &&
        q.options.length > 0
      ) {
        normalizedAnswers[q.id] = [...q.options];
      }
    });
    setSimAnswers(normalizedAnswers);

    const missing = questions.filter((q) => {
      if (q.required === false) return false;
      return !isQuestionAnswered(q, normalizedAnswers[q.id]);
    });

    if (missing.length > 0) {
      setMissingRequiredIds(missing.map((m) => m.id));
      if (displayMode === 'step') {
        const firstMissingIdx = questions.findIndex((q) => q.id === missing[0].id);
        if (firstMissingIdx >= 0) setCurrentStep(firstMissingIdx);
      }
      return;
    }

    setMissingRequiredIds([]);
    setSimulatedReceipt({
      receiptCode: `SIM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      timestamp: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' }),
      answeredCount: questions.filter((q) => isQuestionAnswered(q, normalizedAnswers[q.id])).length,
      totalCount: questions.length,
    });
  };

  if (!isOpen) return null;

  const visibleQuestions =
    displayMode === 'step' && questions.length > 0
      ? [questions[Math.min(currentStep, questions.length - 1)]]
      : questions;

  const missingQuestions = questions.filter((q) => missingRequiredIds.includes(q.id));

  const simulatorBody = (
    <div className="space-y-5 text-right font-sans" dir="rtl">
      {/* Top Control Deck */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-indigo-700">
              <Eye className="w-4 h-4 shrink-0" />
              <span>محاكاة منظور التلميذ (بيئة معاينة معزولة)</span>
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              {title || 'معاينة الاستمارة التشخيصية'}
            </h3>
            <p className="text-[11px] font-semibold text-slate-500 font-mono tabular-nums">
              {questions.length} أسئلة · {requiredCount} إلزامي · منجز: {answeredCount}/{questions.length} ({progressPct}%)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Viewport Switcher */}
            <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  viewportMode === 'desktop'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>حاسوب</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  viewportMode === 'mobile'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>هاتف</span>
              </button>
            </div>

            {/* Display Mode Switcher */}
            <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setDisplayMode('all')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                  displayMode === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                صفحة كاملة
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('step')}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                  displayMode === 'step'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                خطوة بخطوة
              </button>
            </div>

            {/* Close & Return */}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{returnLabel}</span>
            </button>
          </div>
        </div>

        {/* Secondary Sandbox Tools */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/80">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPedagogicalMeta((prev) => !prev)}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                showPedagogicalMeta
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>{showPedagogicalMeta ? 'إخفاء المحاور والأوزان' : 'إظهار المحاور والأوزان'}</span>
            </button>

            <button
              type="button"
              disabled={questions.length === 0}
              onClick={handleQuickFill}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>تعبئة تجريبية</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط</span>
            </button>
          </div>

          <AnimatePresence>
            {lastFeedback && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {lastFeedback.questionId === 'quick-fill'
                    ? lastFeedback.label
                    : `تم تحديث استجابة البند رقم ${lastFeedback.index}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Interactive Student Stage */}
      <div
        className={`mx-auto transition-all duration-200 bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm ${
          viewportMode === 'mobile' ? 'max-w-[395px] ring-4 ring-slate-200/70' : 'w-full'
        }`}
      >
        {/* Top Real-time Student Progress Strip */}
        <div className="bg-slate-100 h-2 w-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Simulated Student Header */}
        <div className="p-5 sm:p-7 border-b border-slate-100 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
            <span>
              {sessionMeta?.level || 'ثانية باك'}
              {sessionMeta?.stream ? ` · ${sessionMeta.stream}` : ''}
              {sessionMeta?.institution ? ` · ${sessionMeta.institution}` : ''}
            </span>
            <span className="font-mono tabular-nums text-indigo-700 font-black">
              {progressPct}% مكتمل
            </span>
          </div>

          <h4 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
            {title || 'عنوان الاستمارة التشخيصية'}
          </h4>

          {description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{description}</p>
          )}
        </div>

        <div className="p-5 sm:p-7">
          {simulatedReceipt ? (
            /* ---- Sandboxed Simulated Delivery Receipt ---- */
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
              className="space-y-5"
            >
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <span className="text-xs font-black text-emerald-800 block">
                  إيصال محاكاة الإرسال (لم تُحفظ أي بيانات)
                </span>
                <h5 className="text-lg font-black text-slate-900">
                  هكذا ستظهر شاشة التأكيد للتلميذ
                </h5>
                <p className="text-xs text-slate-600 font-mono tabular-nums">
                  المرجع التجريبي: {simulatedReceipt.receiptCode} · التوقيت: {simulatedReceipt.timestamp} ·{' '}
                  {simulatedReceipt.answeredCount}/{simulatedReceipt.totalCount} بنود مجاب عنها
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 max-h-60 overflow-y-auto">
                <p className="text-xs font-black text-slate-700">ملخص الاستجابات المختبرة:</p>
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-1"
                  >
                    <p className="font-bold text-slate-800">
                      <span className="font-mono tabular-nums text-indigo-600 ml-1">{idx + 1}.</span>
                      {q.label}
                    </p>
                    <p className="text-slate-600 font-medium">
                      {formatAnswerForReceipt(simAnswers[q.id])}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSimulatedReceipt(null)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  العودة لمراجعة الإجابات
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{returnLabel}</span>
                </button>
              </div>
            </motion.div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-300 rounded-2xl text-xs font-bold text-slate-400">
              لا توجد أسئلة لعرضها في المحاكاة حالياً.
            </div>
          ) : (
            <div className="space-y-6">
              {displayMode === 'step' && (
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 pb-2 border-b border-slate-100">
                  <span className="font-mono tabular-nums">
                    السؤال {currentStep + 1} من {questions.length}
                  </span>
                  <div className="flex items-center gap-1">
                    {questions.map((q, idx) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentStep(idx)}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          idx === currentStep
                            ? 'w-6 bg-indigo-600'
                            : isQuestionAnswered(q, simAnswers[q.id])
                            ? 'w-2.5 bg-emerald-500'
                            : 'w-2.5 bg-slate-200'
                        }`}
                        title={`الانتقال إلى السؤال ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key={displayMode === 'step' ? `step-${currentStep}` : 'all-questions'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                >
                  <QuestionRenderer
                    questions={visibleQuestions}
                    answers={simAnswers}
                    onChange={handleAnswerChange}
                    showPedagogicalMeta={showPedagogicalMeta}
                    compactMobilePreview={viewportMode === 'mobile'}
                  />
                </motion.div>
              </AnimatePresence>

              {/* Validation Error Summary */}
              {missingQuestions.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-black">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>توجد أسئلة إلزامية لم يتم استيفاؤها بعد:</span>
                  </div>
                  <ul className="space-y-1 pr-2 font-semibold text-[11px]">
                    {missingQuestions.map((mq) => {
                      const idx = questions.findIndex((q) => q.id === mq.id);
                      return (
                        <li key={mq.id} className="flex items-center justify-between gap-2">
                          <span>
                            {idx + 1}. {mq.label}
                          </span>
                          {displayMode === 'step' && (
                            <button
                              type="button"
                              onClick={() => setCurrentStep(idx)}
                              className="text-red-700 underline font-bold cursor-pointer shrink-0"
                            >
                              الانتقال إليه
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Bottom Student Action Bar */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {displayMode === 'step' ? (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={currentStep === 0}
                      onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                      className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                      <span>السابق</span>
                    </button>
                    {currentStep < questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentStep((s) => Math.min(questions.length - 1, s + 1))
                        }
                        className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>التالي</span>
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSimulateSubmit}
                        className="flex-1 sm:flex-initial min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-4 h-4" />
                        <span>محاكاة إرسال الاستمارة</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSimulateSubmit}
                    className="min-h-[46px] px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>محاكاة إرسال الاستمارة والتحقق</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  {returnLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (mode === 'embedded') {
    return simulatorBody;
  }

  return (
    <div
      className="fixed inset-0 z-[130] bg-slate-950/75 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 overflow-y-auto"
      dir="rtl"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-4xl bg-white rounded-[28px] border border-slate-200 shadow-2xl p-4 sm:p-6 my-auto relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="sr-only"
          aria-label="إغلاق نافذة المحاكاة"
        >
          <X className="w-4 h-4" />
        </button>
        {simulatorBody}
      </motion.div>
    </div>
  );
}
