/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  Brain, 
  HelpCircle, 
  TrendingUp, 
  Award, 
  Compass, 
  CheckCircle,
  Eye,
  AlertTriangle,
  Lightbulb,
  BookOpen,
  ArrowRightLeft,
  Tv
} from 'lucide-react';
import PhiloScanLogo from './PhiloScanLogo';

interface AboutPlatformProps {
  onNavigateToForm: () => void;
  onNavigateToHome: () => void;
}

export default function AboutPlatform({ onNavigateToForm, onNavigateToHome }: AboutPlatformProps) {
  const containerVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut', staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } }
  };

  const cardHover = {
    hover: { y: -5, boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.08)', transition: { duration: 0.2 } }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-5xl px-1 sm:px-6 py-4 space-y-10 sm:space-y-12 text-right"
      dir="rtl"
    >
      {/* Intro Hero Section with Logo */}
      <motion.div variants={itemVariants} className="bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white rounded-3xl sm:rounded-[32px] p-5 sm:p-8 md:p-12 relative overflow-hidden shadow-2xl border border-slate-800">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#22D3EE_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 sm:gap-8 justify-between">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold font-mono">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>مستقبل ديداكتيك الفلسفة</span>
            </div>
            
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight">
              حول منصة فِيلوسكان <span className="text-blue-400 font-mono text-xl sm:text-2xl md:text-3xl">PhiloScan</span>
            </h2>
            
            <p className="text-slate-300 text-sm md:text-base leading-relaxed font-medium">
              تعتبر فيلوسكان منصة تربوية تشخيصية رقمية تسعى إلى رصد وفحص "التمثلات المسبقة" لدى تلاميذ السلك الثانوي التأهيلي المقبلين على دراسة المادة الفلسفية. نؤمن بأن فهم بنية عقل المتعلم وهواجسه المعرفية هو الخطوة الأولى والأساسية لبناء جسر ديداكتيكي ناضج بينه وبين فضاء المفاهيم والتساؤلات الفلسفية.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 pt-4">
              <button
                onClick={onNavigateToForm}
                className="w-full sm:w-auto min-h-[46px] py-3 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/15 hover:shadow-blue-600/25 transition duration-150 active:scale-95 text-xs flex items-center justify-center"
              >
                جرب الاستمارة التشخيصية
              </button>
              <button
                onClick={onNavigateToHome}
                className="w-full sm:w-auto min-h-[46px] py-3 px-6 bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold rounded-xl transition duration-150 active:scale-95 text-xs flex items-center justify-center"
              >
                العودة للرئيسية
              </button>
            </div>
          </div>

          <div className="shrink-0 bg-[#ffffff] p-4 sm:p-6 rounded-3xl border border-white/5 shadow-xl">
            <PhiloScanLogo size={100} className="sm:hidden" />
            <PhiloScanLogo size={130} className="hidden sm:block" />
          </div>
        </div>
      </motion.div>

      {/* Grid of the Four Thinking Patterns */}
      <motion.div variants={itemVariants} className="space-y-6">
        <div className="border-r-4 border-blue-600 pr-3.5">
          <h3 className="text-xl font-extrabold text-slate-900">الأنماط الأربعة للتفكير لدى المتعلمين</h3>
          <p className="text-xs text-slate-500 mt-1 font-medium">يصنف فيلوسكان استجابات المتعلمين السلوكية والمعرفية إلى أربعة أنماط معيارية رئيسية:</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Cognitive Curiosity */}
          <motion.div 
            variants={cardHover} 
            whileHover="hover"
            className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                <Compass className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-slate-950 text-base mb-2 text-blue-600">الفضول المعرفي</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                طاقة استكشافية تدفع المتعلم للمساءلة الشجاعة، والتطلع نحو سبر عمق الإشكالات الوجودية ومحاورة المفاهيم برغبة ذاتية متقدة. يمثل هذا التلميذ "شعلة" متعطشة للاستقصاء.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 text-[11px] text-blue-500 font-bold flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
              <span>نمط إيجابي مساهم</span>
            </div>
          </motion.div>

          {/* Critical Thinking */}
          <motion.div 
            variants={cardHover} 
            whileHover="hover"
            className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <Brain className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-slate-950 text-base mb-2 text-emerald-600">التفكير النقدي</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                طريقة استدلال ترفض القبول الساذج للجاهز والبديهي. يبحث فيه المتعلم عن الحجج والدلائل والروابط المنطقية، ويميل للتفنيد البناء والمقارنة المنهجية المتبصرة.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 text-[11px] text-emerald-500 font-bold flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>أعلى غايات الإرشاد التربوي</span>
            </div>
          </motion.div>

          {/* Superficial Thinking */}
          <motion.div 
            variants={cardHover} 
            whileHover="hover"
            className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4">
                <Lightbulb className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-slate-950 text-base mb-2 text-amber-600">التفكير السطحي</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                تبني مواقف عفوية أو تلقينية دون تساؤل أو تنقيب. يميل المتعلم هنا إلى الاكتفاء بالهوامش أو اختزال التفكير في الأحكام المسبقة الشائعة أو القوالب اللغوية الرائجة في مجتمعه.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 text-[11px] text-amber-500 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>يتطلب تحفيزاً معرفياً</span>
            </div>
          </motion.div>

          {/* Cognitive Fear */}
          <motion.div 
            variants={cardHover} 
            whileHover="hover"
            className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mb-4">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-slate-950 text-base mb-2 text-red-600">الخوف المعرفي</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                حالة توجس وتمنع نفسي وفكري من التساؤل المفتوح، ناتجة عن الخشية من زعزعة اليقينيات الشخصية أو الوقوع في "المحظور" العقدي أو الاجتماعي. تتبدى في العزوف أو الرفض الصامت للدرس.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 text-[11px] text-red-500 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span>تستدعي تدخلاً تربوياً مرشداً</span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* The 5 Diagnostic Axes */}
      <motion.div variants={itemVariants} className="bg-slate-50 rounded-3xl p-5 sm:p-8 border border-slate-200 grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="space-y-4 lg:col-span-1">
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">بنية التقييم العيادي</span>
          <h3 className="text-2xl font-black text-slate-900 leading-snug">المحاور الخمسة لقياس عقلية المتعلم</h3>
          <p className="text-slate-500 text-xs leading-relaxed font-medium">
            لصياغة تقرير تشخيصي دقيق، تقيس الاستمارة خمس بوابات دلالية رئيسية تعكس تفاعل التلميذ مع الدرس الفلسفي:
          </p>
          <div className="hidden lg:block pt-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 inline-flex items-center gap-3">
              <div className="p-2 bg-slate-950 text-white rounded-xl">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black text-slate-800">تدقيق مدعوم بالذكاء الاصطناعي</p>
                <p className="text-[9px] text-slate-400">تقييم هجين كمي وكيفي في ثوانٍ مقتضبة.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3.5">
          {/* Axis 1 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-start gap-3.5 shadow-xs">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 text-white font-mono text-xs font-black flex items-center justify-center">01</span>
            <div className="space-y-0.5">
              <h5 className="font-extrabold text-slate-900 text-sm">التصور الفلسفي (ماهية الفلسفة)</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                استشراف تمثلات التلميذ الابتدائية حول مدلول الفلسفة ووظيفة السؤال وعلاقتها بالمعتقد والعلم والواقع الحيوي.
              </p>
            </div>
          </div>

          {/* Axis 2 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-start gap-3.5 shadow-xs">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 text-white font-mono text-xs font-black flex items-center justify-center">02</span>
            <div className="space-y-0.5">
              <h5 className="font-extrabold text-slate-900 text-sm">الألفة الوجدانية والراحة النفسية</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                رصد المشاعر المتولدة عن حضور حصة الدرس الفلسفي ومواجهة موضوعاته الحرة كالحرية، الوجود، الهناء، الشك والتساؤل.
              </p>
            </div>
          </div>

          {/* Axis 3 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-start gap-3.5 shadow-xs">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 text-white font-mono text-xs font-black flex items-center justify-center">03</span>
            <div className="space-y-0.5">
              <h5 className="font-extrabold text-slate-900 text-sm">المنهج الفكري وقبول الرأي الآخر</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                اختبار قدرة الفرد على قبول الاختلاف والتناقض المنهجي، وتقبل تنوع السرديات والأنساق الفكرية المختلفة دون تشنج.
              </p>
            </div>
          </div>

          {/* Axis 4 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-start gap-3.5 shadow-xs">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 text-white font-mono text-xs font-black flex items-center justify-center">04</span>
            <div className="space-y-0.5">
              <h5 className="font-extrabold text-slate-900 text-sm">القيمة المعرفية وإمكانية الشك</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                فهم مدى تقدير المتعلم لأهمية الشك المنهجي في كشف الحقائق وقوة استشعار الجدوى المعرفية والعملية للفلسفة بحياته المعيشة.
              </p>
            </div>
          </div>

          {/* Axis 5 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 flex items-start gap-3.5 shadow-xs">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 text-white font-mono text-xs font-black flex items-center justify-center">05</span>
            <div className="space-y-0.5">
              <h5 className="font-extrabold text-slate-900 text-sm">الاستعداد الحجاجي وإيراد الدليل</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                مدى الرغبة المسبقة وطريقة تركيب التلميذ للحجج وعقلنة المواقف الشخصية عند النقاش الإشكالي الموجه.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* How it works Section using horizontal step visual */}
      <motion.div variants={itemVariants} className="space-y-6">
        <div className="border-r-4 border-blue-600 pr-3.5">
          <h3 className="text-xl font-extrabold text-slate-900">كيف تعمل دورة التشخيص في فيلوسكان؟</h3>
          <p className="text-xs text-slate-500 mt-1 font-medium">سيرورة ذكية تضمن الحفاظ على القيادة للأستاذ والمصداقية للمعطيات:</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl relative shadow-xs">
            <span className="absolute top-4 left-4 text-3xl font-black text-slate-100 font-mono">01</span>
            <h5 className="font-bold text-slate-900 text-base mb-2">1. إطلاق الحصة وتعبئة الاستمارة</h5>
            <p className="text-xs text-slate-400 leading-normal">
              يقوم الأستاذ بإنشاء حصة تشخيصية وحفظ الكود المولد ومشاركته مع تلاميذه، فيدخل التلميذ الكود ويعبئ الاستمارة الاختيارية والأسئلة التعبيرية ذات الإجابة الحرة بتأنٍّ كامل.
            </p>
          </div>

          <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl relative shadow-xs">
            <span className="absolute top-4 left-4 text-3xl font-black text-slate-100 font-mono">02</span>
            <h5 className="font-bold text-slate-900 text-base mb-2">2. التحليل الدلالي والتقييم الهجين</h5>
            <p className="text-xs text-slate-400 leading-normal">
              يقوم محرك الذكاء الاصطناعي (Gemini SDK) بمراجعة القيمة الدلالية للكتابات المفتوحة وصيغ التبرير، وربطهما بالعلامات المكتسبة في الاختيار من متعدد لإبراز نمط التفكير المقترح.
            </p>
          </div>

          <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl relative shadow-xs">
            <span className="absolute top-4 left-4 text-3xl font-black text-slate-100 font-mono">03</span>
            <h5 className="font-bold text-slate-900 text-base mb-2">3. الإشراف، المراجعة وخرائط الاستنتاج</h5>
            <p className="text-xs text-slate-400 leading-normal">
              يستكشف الأستاذ عبر لوحة التحكم الرسومية التوزيع العام للفصل ونسب التفكير وتفاصيل إجابات كل متعلم على حدة، مع الصلاحية بتبديل التصنيف المقترح وصياغة تدخلات بيداغوجية ملائمة.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
