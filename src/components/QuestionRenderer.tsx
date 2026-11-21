/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  RotateCcw,
  Trash2,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { FileAnswerPayload, FormQuestion } from '../types';

export const DEFAULT_GRID_COLUMNS = ['ضعيف', 'متوسط', 'جيد', 'ممتاز'];

export function isQuestionAnswered(question: FormQuestion, value: unknown): boolean {
  if (question.type === 'scale') {
    return typeof value === 'number' && value >= 1 && value <= 5;
  }
  if (question.type === 'multi') {
    return Array.isArray(value) && value.length > 0;
  }
  if (question.type === 'order') {
    return Array.isArray(value) && value.length > 0;
  }
  if (question.type === 'grid') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const rows = question.options && question.options.length > 0 ? question.options : [];
    const map = value as Record<string, string>;
    if (rows.length === 0) return Object.keys(map).length > 0;
    return rows.every((row) => Boolean(map[row] && String(map[row]).trim()));
  }
  if (question.type === 'file') {
    return Boolean(
      value &&
        typeof value === 'object' &&
        (value as FileAnswerPayload).fileName &&
        String((value as FileAnswerPayload).fileName).trim() !== ''
    );
  }
  return typeof value === 'string' && value.trim().length > 0;
}

interface QuestionRendererProps {
  questions: FormQuestion[];
  answers: Record<string, any>;
  onChange: (questionId: string, value: any) => void;
  showPedagogicalMeta?: boolean;
  compactMobilePreview?: boolean;
  onProctorViolation?: (reason: string) => void;
}

export default function QuestionRenderer({
  questions,
  answers,
  onChange,
  showPedagogicalMeta = false,
  compactMobilePreview = false,
  onProctorViolation,
}: QuestionRendererProps) {
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  const handleFilePick = (q: FormQuestion, file: File | undefined) => {
    if (!file) return;
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFileErrors((prev) => ({
        ...prev,
        [q.id]: 'حجم الملف يتجاوز الحد الأقصى المسموح به (2 ميغابايت). يرجى اختيار ملف أصغر.',
      }));
      return;
    }

    setFileErrors((prev) => {
      const next = { ...prev };
      delete next[q.id];
      return next;
    });

    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const reader = new FileReader();
    reader.onload = () => {
      const payload: FileAnswerPayload = {
        fileName: file.name,
        fileSizeKb: sizeKb,
        mimeType: file.type || 'application/octet-stream',
        dataUrl: typeof reader.result === 'string' && file.size <= 1500 * 1024 ? reader.result : undefined,
      };
      onChange(q.id, payload);
    };
    reader.onerror = () => {
      const payload: FileAnswerPayload = {
        fileName: file.name,
        fileSizeKb: sizeKb,
        mimeType: file.type || 'application/octet-stream',
      };
      onChange(q.id, payload);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {questions.map((q, idx) => {
        const value = answers[q.id];
        const isReq = q.required !== false;
        const gridCols =
          q.gridColumns && q.gridColumns.length > 0 ? q.gridColumns : DEFAULT_GRID_COLUMNS;
        const orderItems: string[] = Array.isArray(value) && value.length > 0
          ? value
          : q.options && q.options.length > 0
          ? [...q.options]
          : [];

        return (
          <div
            key={q.id}
            className="space-y-3 border-b border-slate-100 pb-6 last:border-0 last:pb-0"
          >
            {/* Question Header */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-slate-800 font-extrabold text-sm sm:text-base leading-relaxed">
                  <span className="font-mono tabular-nums text-indigo-600 ml-1.5">{idx + 1}.</span>
                  {q.label}
                  {isReq && <span className="text-red-500 mr-1" title="سؤال إلزامي">*</span>}
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                <span>{isReq ? 'إلزامي' : 'اختياري'}</span>
                {showPedagogicalMeta && q.dimension && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-indigo-600 font-bold">{q.dimension}</span>
                  </>
                )}
                {showPedagogicalMeta && typeof q.weight === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">الوزن: {q.weight}/5</span>
                  </>
                )}
              </div>

              {q.hint && (
                <p className="text-xs text-slate-500 font-medium leading-relaxed pt-0.5">
                  {q.hint}
                </p>
              )}
            </div>

            {/* 1. Short Text */}
            {q.type === 'short' && (
              <input
                type="text"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                onPaste={
                  onProctorViolation
                    ? (e) => {
                        e.preventDefault();
                        onProctorViolation('محاولة لصق النصوص');
                      }
                    : undefined
                }
                placeholder="اكتب إجابتك القصيرة هنا..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
              />
            )}

            {/* 2. Long / Open Text */}
            {(q.type === 'long' || q.type === 'open') && (
              <div className="space-y-1.5">
                <textarea
                  rows={3}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => onChange(q.id, e.target.value)}
                  onPaste={
                    onProctorViolation
                      ? (e) => {
                          e.preventDefault();
                          onProctorViolation('محاولة لصق النصوص');
                        }
                      : undefined
                  }
                  onDrop={
                    onProctorViolation
                      ? (e) => {
                          e.preventDefault();
                          onProctorViolation('محاولة لصق النصوص');
                        }
                      : undefined
                  }
                  placeholder="عبّر بحرية مع تقديم أمثلة أو حجج منطقية..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                />
                <div className="flex justify-end text-[10px] font-mono tabular-nums text-slate-400">
                  {typeof value === 'string' && value.trim()
                    ? `${value.trim().split(/\s+/).length} كلمة`
                    : '0 كلمة'}
                </div>
              </div>
            )}

            {/* 3. Scale 1-5 */}
            {q.type === 'scale' && (
              <div className="space-y-3 py-1">
                <div className="flex justify-between text-xs text-slate-400 font-bold">
                  <span>1 (غير موافق تماماً)</span>
                  <span className="text-indigo-600 font-bold font-mono tabular-nums text-sm">
                    {typeof value === 'number' ? value : 3} / 5
                  </span>
                  <span>5 (موافق تماماً)</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((num) => {
                    const currentScale = typeof value === 'number' ? value : 3;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => onChange(q.id, num)}
                        className={`min-h-[44px] rounded-xl border font-mono tabular-nums font-black text-sm transition cursor-pointer ${
                          currentScale === num
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={typeof value === 'number' ? value : 3}
                  onChange={(e) => onChange(q.id, parseInt(e.target.value, 10))}
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            )}

            {/* 4. Boolean */}
            {q.type === 'boolean' && (
              <div className="grid grid-cols-2 gap-3">
                {['نعم / صحيح', 'لا / خطأ'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(q.id, opt)}
                    className={`min-h-[48px] p-3.5 rounded-xl border text-center transition duration-150 text-xs sm:text-sm font-bold cursor-pointer ${
                      value === opt
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* 5. Single Select */}
            {q.type === 'single' && q.options && (
              <div
                className={`grid grid-cols-1 ${
                  compactMobilePreview ? '' : 'sm:grid-cols-2'
                } gap-2.5`}
              >
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(q.id, opt)}
                    className={`min-h-[48px] p-3.5 rounded-xl border text-right transition duration-150 flex items-center justify-between gap-2 text-xs sm:text-sm font-bold cursor-pointer ${
                      value === opt
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="leading-relaxed">{opt}</span>
                    {value === opt && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* 6. Multi Select */}
            {q.type === 'multi' && q.options && (
              <div
                className={`grid grid-cols-1 ${
                  compactMobilePreview ? '' : 'sm:grid-cols-2'
                } gap-2.5`}
              >
                {q.options.map((opt) => {
                  const listSnapshot: string[] = Array.isArray(value) ? value : [];
                  const isSel = listSnapshot.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        const newList = isSel
                          ? listSnapshot.filter((x) => x !== opt)
                          : [...listSnapshot, opt];
                        onChange(q.id, newList);
                      }}
                      className={`min-h-[48px] p-3.5 rounded-xl border text-right transition duration-150 flex items-center justify-between gap-2 text-xs sm:text-sm font-bold cursor-pointer ${
                        isSel
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="leading-relaxed">{opt}</span>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => {}}
                        className="w-5 h-5 accent-indigo-600 rounded cursor-pointer shrink-0"
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 7. Order / Ranking Elements */}
            {q.type === 'order' && orderItems.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>رتّب العناصر من الأهم (1) إلى الأقل أهمية باستعمال الأسهم:</span>
                  {q.options && (
                    <button
                      type="button"
                      onClick={() => onChange(q.id, [...q.options!])}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>إعادة الترتيب</span>
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {orderItems.map((item, itemIdx) => (
                    <div
                      key={`${item}-${itemIdx}`}
                      className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-mono tabular-nums text-xs font-black flex items-center justify-center shrink-0">
                          {itemIdx + 1}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                          {item}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={itemIdx === 0}
                          onClick={() => {
                            const next = [...orderItems];
                            const tmp = next[itemIdx - 1];
                            next[itemIdx - 1] = next[itemIdx];
                            next[itemIdx] = tmp;
                            onChange(q.id, next);
                          }}
                          className="min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 cursor-pointer"
                          title="رفع لأعلى"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={itemIdx === orderItems.length - 1}
                          onClick={() => {
                            const next = [...orderItems];
                            const tmp = next[itemIdx + 1];
                            next[itemIdx + 1] = next[itemIdx];
                            next[itemIdx] = tmp;
                            onChange(q.id, next);
                          }}
                          className="min-w-[40px] min-h-[40px] rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 cursor-pointer"
                          title="خفض لأسفل"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 8. Evaluation Grid Matrix */}
            {q.type === 'grid' && q.options && q.options.length > 0 && (
              <div className="space-y-3">
                {/* Desktop table view */}
                {!compactMobilePreview && (
                  <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-2xl">
                    <table className="w-full text-right text-xs border-collapse" dir="rtl">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black">
                          <th className="p-3 text-right">المعيار / البند</th>
                          {gridCols.map((col) => (
                            <th key={col} className="p-3 text-center whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {q.options.map((row) => {
                          const gridState: Record<string, string> =
                            value && typeof value === 'object' && !Array.isArray(value)
                              ? value
                              : {};
                          const chosen = gridState[row] || '';
                          return (
                            <tr
                              key={row}
                              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                            >
                              <td className="p-3 font-bold text-slate-800">{row}</td>
                              {gridCols.map((col) => {
                                const active = chosen === col;
                                return (
                                  <td key={col} className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onChange(q.id, {
                                          ...gridState,
                                          [row]: col,
                                        })
                                      }
                                      className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                                        active
                                          ? 'bg-indigo-600 border-indigo-600 text-white'
                                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      {col}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Mobile stacked view (always shown in compactMobilePreview or < md) */}
                <div className={`${compactMobilePreview ? 'block' : 'md:hidden'} space-y-2.5`}>
                  {q.options.map((row) => {
                    const gridState: Record<string, string> =
                      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
                    const chosen = gridState[row] || '';
                    return (
                      <div
                        key={row}
                        className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2"
                      >
                        <p className="text-xs font-extrabold text-slate-800">{row}</p>
                        <div className="grid grid-cols-2 gap-2">
                          {gridCols.map((col) => {
                            const active = chosen === col;
                            return (
                              <button
                                key={col}
                                type="button"
                                onClick={() =>
                                  onChange(q.id, {
                                    ...gridState,
                                    [row]: col,
                                  })
                                }
                                className={`min-h-[44px] px-2.5 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
                                  active
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {col}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 9. File Upload */}
            {q.type === 'file' && (
              <div className="space-y-2.5">
                {value && typeof value === 'object' && (value as FileAnswerPayload).fileName ? (
                  <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-emerald-950 truncate">
                          {(value as FileAnswerPayload).fileName}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-emerald-700">
                          {(value as FileAnswerPayload).fileSizeKb} KB · تم الإرفاق بنجاح
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onChange(q.id, null)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>إزالة</span>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/30 rounded-2xl cursor-pointer transition text-center">
                    <Upload className="w-6 h-6 text-indigo-600" />
                    <span className="text-xs font-extrabold text-slate-700">
                      اضغط لرفع ملف أو وثيقة (PDF، صورة، مستند نصي)
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold font-mono tabular-nums">
                      الحد الأقصى: 2 MB
                    </span>
                    <input
                      type="file"
                      accept={q.acceptedFileTypes || '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp'}
                      onChange={(e) => handleFilePick(q, e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                )}

                {fileErrors[q.id] && (
                  <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{fileErrors[q.id]}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
