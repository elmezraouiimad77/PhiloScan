/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  FileText, 
  BookOpen, 
  Sparkles, 
  Activity, 
  CheckCircle,
  HelpCircle,
  Play
} from 'lucide-react';

interface UserTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserTutorial({ isOpen, onClose }: UserTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'مرحباً بك في منصة PhiloScan',
      description: 'دليلك السريع للبدء في تشخيص وفحص المكتسبات الفلسفية لطلابك بطريقة تفاعلية ومؤتمتة بالكامل.',
      badge: 'مقدمة المنصة',
      icon: (
        <div className="w-16 h-16 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-center text-[#0284C7] mb-4" id="tutorial-icon-welcome">
          <Sparkles className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-4 text-slate-600" id="tutorial-content-step-0">
          <p className="text-sm sm:text-base leading-relaxed">
            تم تصميم هذه المنصة لمساعدة أساتذة المادة في تقييم المستويات المعرفية والوجدانية والحجاجية للطلاب في مستهل الموسم الدراسي، مع رصد ذكي لموثوقية التعبير ومكافحة الانتحال (النسخ واللصق).
          </p>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 border-2 border-blue-600 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold font-mono">i</span>
            <p className="text-xs text-slate-500 leading-relaxed">
              يستغرق هذا الدليل أقل من دقيقتين وسيهيئك لإطلاق أول جلسة تشخيصية وبدء رصد النتائج فورياً.
            </p>
          </div>
        </div>
      )
    },
    {
      title: 'الخطوة 1: اختيار النموذج من بنك الاستمارات',
      description: 'استخدم النماذج المعتمدة الجاهزة أو قم بتعديلها لتناسب خطتك التعليمية.',
      badge: 'بنك الاستمارات',
      icon: (
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mb-4 shadow-inner" id="tutorial-icon-bank">
          <BookOpen className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-3.5 text-slate-600" id="tutorial-content-step-1">
          <p className="text-sm leading-relaxed">
            من خلال تبويب <strong className="text-slate-800">"بنك الاستمارات"</strong>، يمكنك:
          </p>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>تصفح استمارة <strong className="text-amber-700">PhiloScan المعتمدة</strong> (تحتوي على أسئلة ذكية تغطي محاور التقييم الخمسة).</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span><strong className="text-amber-700">تخصيص أوزان المحاور</strong> لتغيير تأثير الأسئلة الوجدانية مقابل الحجاجية على النتيجة الإجمالية.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>استعمال <strong className="text-amber-700">منشئ الاستمارات المرئي</strong> لتصميم أسئلة خاصة بفصولك الدراسية.</span>
            </li>
          </ul>
        </div>
      )
    },
    {
      title: 'الخطوة 2: إنشاء الجلسة ومشاركة الرابط',
      description: 'قم بإنشاء جلسة تقييم تفاعلية مخصصة لكل قسم دراسي لتتبع نتائجهم بشكل منفصل.',
      badge: 'إنشاء الجلسات',
      icon: (
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 shadow-inner" id="tutorial-icon-session">
          <Plus className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-3 text-slate-600" id="tutorial-content-step-2">
          <p className="text-sm leading-relaxed">
            البدء في تلقي إجابات طلابك بسيط للغاية:
          </p>
          <ol className="space-y-2 text-xs sm:text-sm list-decimal list-inside pr-1">
            <li className="leading-relaxed">انقر على زر <strong className="text-emerald-700">"إنشاء جلسة تشخيصية"</strong> في الصفحة الرئيسية.</li>
            <li className="leading-relaxed font-sans">حدد القسم، المؤسسة، واختر الاستمارة التي أعددتها مسبقاً.</li>
            <li className="leading-relaxed">سيقوم النظام فوراً بتوليد <strong className="text-emerald-700">رابط مباشر فريد ورمز استجابة سريعة (QR Code)</strong>.</li>
            <li className="leading-relaxed">انسخ الرابط وشاركه عبر مجموعات الفصل (واتساب، أو اعرض الرمز على شاشة الفصل).</li>
          </ol>
        </div>
      )
    },
    {
      title: 'الخطوة 3: التتبع والتحليل الذكي المدعوم بالذكاء الاصطناعي',
      description: 'راقب الموثوقية بذكاء، واقرأ تقارير المهارات الفلسفية لطلابك لحظياً.',
      badge: 'المراقبة والتحليل',
      icon: (
        <div className="w-16 h-16 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-center text-purple-600 mb-4" id="tutorial-icon-analytics">
          <Activity className="w-8 h-8" />
        </div>
      ),
      content: (
        <div className="space-y-3 text-slate-600" id="tutorial-content-step-3">
          <p className="text-sm leading-relaxed">
            عندما يبدأ طلابك بالإجابة، ستوفر لك المنصة تحليلات فريدة:
          </p>
          <ul className="space-y-2 text-xs sm:text-sm">
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 mt-1.5 flex-shrink-0"></span>
              <span><strong className="text-purple-700">تتبع حي ومكافحة الانتحال:</strong> احصل على إنذارات فورية إذا حاول الطلاب مغادرة الشاشة أو محاولة نسخ ولصق الأجوبة الجاهزة.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"></span>
              <span><strong className="text-purple-700">تصنيف الأنماط الفكرية:</strong> تحليل إجابات الطلاب وتقسيمهم إلى أنماط تفكير معينة (نقدي، تساؤلي، حواري، وصفي).</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"></span>
              <span><strong className="text-purple-700">مساعد الذكاء الاصطناعي (Gemini):</strong> اضغط على تفاصيل أي طالب للحصول على تحليل تفصيلي لمهاراته الفلسفية بنقرة واحدة!</span>
            </li>
          </ul>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4"
        dir="rtl"
        id="tutorial-backdrop"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full max-h-[92vh] border border-slate-100 flex flex-col pointer-events-auto"
          id="tutorial-modal-container"
        >
          {/* Header Banner Accent */}
          <div className="relative h-2.5 bg-gradient-to-l from-blue-600 via-indigo-500 to-purple-600 shrink-0" id="tutorial-accent-bar" />

          {/* Close button top right */}
          <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-100 shrink-0" id="tutorial-header">
            <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full" id="tutorial-badge">
              {steps[currentStep].badge}
            </span>
            <button
              onClick={onClose}
              id="tutorial-close-button"
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition active:scale-90"
              title="إغلاق التوجيه السريع"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Slide Panel */}
          <div className="p-4 sm:p-8 flex-1 flex flex-col items-center text-center overflow-y-auto" id="tutorial-body">
            {steps[currentStep].icon}
            
            <h2 className="text-lg sm:text-2xl font-black text-slate-800 mb-2 tracking-tight" id="tutorial-title">
              {steps[currentStep].title}
            </h2>
            
            <p className="text-xs sm:text-sm text-slate-500 font-sans mb-5 sm:mb-6 max-w-sm" id="tutorial-description">
              {steps[currentStep].description}
            </p>

            {/* Inner Step Layout */}
            <div className="w-full text-right bg-slate-50/50 p-4 sm:p-5 rounded-2xl border border-slate-100/60" id="tutorial-step-nested-card">
              {steps[currentStep].content}
            </div>
          </div>

          {/* Footer Controls with dot indicators and next/back buttons */}
          <div className="bg-slate-50/80 p-4 sm:p-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0" id="tutorial-footer">
            {/* Step Indicators */}
            <div className="flex gap-1.5" id="tutorial-indicators">
              {steps.map((_, i) => (
                <button
                  key={i}
                  id={`tutorial-indicator-dot-${i}`}
                  onClick={() => setCurrentStep(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    i === currentStep ? 'w-6 bg-blue-600' : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                  }`}
                  aria-label={`الانتقال إلى خطوة ${i + 1}`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-2" id="tutorial-nav-buttons">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  id="tutorial-prev-button"
                  className="py-2.5 px-3.5 min-h-[44px] bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-bold text-xs sm:text-sm transition duration-150 flex items-center gap-1 active:scale-95"
                >
                  <ChevronRight className="w-4.5 h-4.5" />
                  <span>السابق</span>
                </button>
              )}

              <button
                onClick={handleNext}
                id="tutorial-next-button"
                className={`py-2.5 px-5 sm:px-6 min-h-[44px] rounded-xl font-bold text-xs sm:text-sm transition duration-150 flex items-center gap-1.5 active:scale-95 ${
                  currentStep === steps.length - 1 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/10' 
                    : 'bg-slate-800 hover:bg-slate-900 text-white'
                }`}
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <span>البدء بالعمل</span>
                    <Play className="w-4 h-4 fill-white text-white" />
                  </>
                ) : (
                  <>
                    <span>التالي</span>
                    <ChevronLeft className="w-4.5 h-4.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
