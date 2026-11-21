/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Brain, 
  BookOpen, 
  HelpCircle, 
  ArrowLeft, 
  CheckCircle, 
  Award, 
  ShieldAlert, 
  Cpu, 
  Lightbulb,
  X
} from 'lucide-react';

interface WelcomeSectionProps {
  onStartForm: () => void;
  onDismiss?: () => void;
}

interface ConceptionDimension {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  concept: string;
  importance: string;
  quote: string;
  author: string;
  color: string;
  bgLight: string;
  borderAccent: string;
}

export default function WelcomeSection({ onStartForm, onDismiss }: WelcomeSectionProps) {
  const [activeTab, setActiveTab] = useState<string>('epistemology');
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('philoscan_welcome_dismissed') === 'true';
    }
    return false;
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('philoscan_welcome_dismissed', 'true');
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  const dimensions: ConceptionDimension[] = [
    {
      id: 'epistemology',
      title: 'القطيعة الإبستيمولوجية',
      subtitle: 'تفكيك الأحكام المسبقة',
      icon: <Brain className="w-5 h-5 text-emerald-600" />,
      concept: 'التصورات السابقة للتلاميذ ليست مجرد غياب للمعرفة، بل هي حواجز وأفكار جاهزة محملة بالميول والآراء الدوغمائية.',
      importance: 'يساعد رصدها الأستاذ على إحداث خلخلة معرفية (خلخلة التصورات) لتقويض الأنماط السطحية وتمهيد الطريق للتفكير الفلسفي الهيكلي والرصين.',
      quote: "رأي التلاميذ هو العقبة الأولى التي يجب دحرها. في العلم وفي الفلسفة، نملك أولاً تصورات يجب تدميرها.",
      author: 'غاستون باشلار',
      color: 'emerald',
      bgLight: 'bg-emerald-50/70 dark:bg-emerald-950/20',
      borderAccent: 'border-emerald-200 dark:border-emerald-900/60'
    },
    {
      id: 'socratic-dialogue',
      title: 'الهندسة الحوارية للسؤال',
      subtitle: 'بناء الدرس تفاعلياً',
      icon: <HelpCircle className="w-5 h-5 text-blue-600" />,
      concept: 'الانطلاق من واقع ذهن التلميذ يتيح حواراً توليداً حقيقياً يربط صياغات الأسئلة الكبرى باهتمامات التلميذ المباشرة واليومية.',
      importance: 'يمكّن التشخيص من تحويل الحصة الفلسفية من إلقاء وتلقين أحادي إلى بناء مشترك مستند إلى مشكلات حقيقية ونابعة من الصميم المعرفي للتلميذ.',
      quote: "التربية ليست ملء وعاء، وإنما هي إيقاد شعلة ملؤها التوليد العقلي والتفكُّر المباشر.",
      author: 'سقراط',
      color: 'blue',
      bgLight: 'bg-blue-50/70 dark:bg-blue-950/20',
      borderAccent: 'border-blue-200 dark:border-blue-900/60'
    },
    {
      id: 'anxiety-management',
      title: 'الفضول والقلق المعرفي',
      subtitle: 'البعد الوجداني للفلسفة',
      icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
      concept: 'يصاحب الفلسفة عادةً في أذهان المبتدئين قلق وجودي أو خوف معرفي ناجم عن الشك المنهجي والصعوبة المفترضة للغة الفلسفية.',
      importance: 'يسمح الرصد الوجداني بحماية التوازن التعليمي للتلاميذ، وتحويل الخوف المعرفي إلى فضول إيجابي يحفز التفكير بدل المقاومة النفسية.',
      quote: "الدهشة هي أصل الفلسفة ومولدها الأول، وبدون إدارتها يتحول التعلم الفلسفي إلى رعب أو امتناع فكري.",
      author: 'أرسطو / أفلاطون',
      color: 'amber',
      bgLight: 'bg-amber-50/70 dark:bg-amber-950/10',
      borderAccent: 'border-amber-200 dark:border-amber-900/30'
    },
    {
      id: 'argumentation-readiness',
      title: 'الأثر الحجاجي والأدائي',
      subtitle: 'مهارات الحجاج والتبرير',
      icon: <Award className="w-5 h-5 text-purple-600" />,
      concept: 'التحقق من قدرة التلميذ على الدفاع عن رأيه وتقديم حجة متماسكة وتعميم الفكرة والتعامل الإيجابي مع اختلاف الآراء.',
      importance: 'توجيه التدخلات الصفية لتقوية التبرير النقدي وبناء مهارات الصياغة الإنشائية استناداً إلى أدوات الحجاج التي يحتاز عليها التلميذ سلفاً.',
      quote: "ليست الفلسفة مذهباً يُحفظ بل هي تفكير ونقد وفاعلية يتدرب عليها العقل ليزن البراهين.",
      author: 'إيمانويل كانط',
      color: 'purple',
      bgLight: 'bg-purple-50/70 dark:bg-purple-950/20',
      borderAccent: 'border-purple-200 dark:border-purple-900/60'
    }
  ];

  const currentDimension = dimensions.find(d => d.id === activeTab) || dimensions[0];

  if (isDismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full bg-[#f8fafc] dark:bg-[#070d19] border-2 border-dashed border-blue-200/90 dark:border-blue-950 rounded-3xl sm:rounded-[2.5rem] p-4 sm:p-8 md:p-10 shadow-xl relative overflow-hidden"
        id="welcome-section-root"
      >
        {/* Subtle geometric grid background pattern */}
        <div className="absolute inset-0 opacity-1 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#0277b6 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.04 }}></div>
        
        {/* Absolute header / dismiss button */}
        <div className="absolute top-3 sm:top-6 left-3 sm:left-6 z-20">
          <button
            onClick={handleDismiss}
            className="min-h-[44px] min-w-[44px] p-2 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-full text-slate-500 hover:text-slate-800 transition active:scale-95 shadow-sm inline-flex items-center justify-center cursor-pointer"
            title="تخطي العرض التعريفي والذهاب للرئيسية مباشرة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="relative z-10 text-right grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Right Information Side */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 py-1.5 px-3.5 rounded-full bg-blue-100/60 border border-blue-200/50 dark:bg-blue-950 dark:border-blue-900">
              <Sparkles className="w-4 h-4 text-blue-600 animate-spin" style={{ animationDuration: '6s' }} />
              <span className="text-[11px] font-black text-blue-800 dark:text-blue-300">أول دخول لمنصة فِيلوسكان ميديا؟</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight">
                فِيلوسكان - البوصلة التربوية لتمثلات التلاميذ
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                إن تشخيص التصورات القبلية والتمثلات العفوية للتلاميذ حول الدرس الفلسفي يمثل المدخل الرئيسي لبناء وعي نقدي رصين. تهدف هذه الاستمارة التشخيصية إلى كشف العوائق الإبستيمولوجية وتحليل أساليب التفكير والدهشة لدى المتعلمين، مما يساهم بشكل مباشر في توجيه الممارسات الصفية للفلسفة، وبناء وتطوير كفاياتهم الحجاجية والتحليلية والمنهجية في الكتابة الفلسفية والتعبير النقدي الحر.
              </p>
            </div>

            {/* Dimensional Tabs Selector */}
            <div className="space-y-2">
              <span className="block text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">تصفح المحاور التشخيصية الأربعة:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {dimensions.map((dim) => {
                  const isActive = dim.id === activeTab;
                  return (
                    <button
                      key={dim.id}
                      onClick={() => setActiveTab(dim.id)}
                      className={`min-h-[46px] py-3 px-4 rounded-2xl border text-right transition-all duration-200 flex items-center justify-between gap-1.5 cursor-pointer text-xs font-bold leading-snug sm:whitespace-nowrap ${
                        isActive 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10 scale-[1.02]' 
                          : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{dim.title}</span>
                      <div className={`p-1 rounded-lg ${isActive ? 'bg-white/10 text-white' : 'bg-slate-50 dark:bg-slate-950 text-slate-600'}`}>
                        {dim.icon}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Left Feature Explorer / Quote Box */}
          <div className="lg:col-span-6">
            <motion.div
              layoutId="interactive-welcome-panel"
              className={`p-4 sm:p-6 rounded-3xl sm:rounded-[2.2rem] border-2 border-dashed ${currentDimension.bgLight} ${currentDimension.borderAccent} relative h-full flex flex-col justify-between`}
            >
              {/* Highlight Glow or Icon container */}
              <div className="absolute top-4 left-4 opacity-5 pointer-events-none">
                {currentDimension.icon}
              </div>

              <div className="space-y-5">
                {/* Concept Definition */}
                <div className="space-y-1.5 text-right">
                  <span className="text-[10px] font-black uppercase text-blue-700 dark:text-blue-400 tracking-wider">مفهوم البعد</span>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{currentDimension.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-semibold">
                    {currentDimension.concept}
                  </p>
                </div>

                {/* Importance Highlight */}
                <div className="p-4 bg-white/70 dark:bg-slate-900/60 rounded-2xl border border-white/80 dark:border-slate-800/80 text-right space-y-1">
                  <div className="flex items-center gap-1.5 justify-end text-blue-600 dark:text-blue-400">
                    <span className="text-xs font-black">دور المنصة والتشخيص</span>
                    <Lightbulb className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                    {currentDimension.importance}
                  </p>
                </div>

                {/* Philosophy Quote Box */}
                <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-right relative overflow-hidden border border-slate-800">
                  <div className="absolute -bottom-10 -left-10 text-[100px] text-slate-800 font-serif leading-none select-none opacity-20 pointer-events-none">
                     ”
                  </div>
                  <p className="text-[11px] sm:text-xs font-serif italic text-slate-300 leading-relaxed relative z-10">
                    "{currentDimension.quote}"
                  </p>
                  <p className="text-[10px] font-black text-blue-400 text-left mt-1.5 font-sans leading-none">
                    — {currentDimension.author}
                  </p>
                </div>
              </div>

              {/* Main CTAs Grid */}
              <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="text-right w-full sm:w-auto">
                  <p className="text-[10px] text-slate-400 font-bold leading-normal">هل تود إطلاق الاستمارة التشخيصية الذكية الآن؟</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-sans font-black flex items-center gap-1 justify-end">
                    <span>5 محاور تدعم توليد بصمة الذكاء الاصطناعي</span>
                    <Cpu className="w-3.5 h-3.5 text-blue-500" />
                  </p>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 sm:flex-none py-2.5 px-4 min-h-[44px] bg-white hover:bg-slate-100 text-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-800 font-bold text-xs rounded-xl transition cursor-pointer active:scale-95 text-center whitespace-nowrap"
                  >
                    تخطي للرئيسية
                  </button>
                  <button
                    onClick={() => {
                      // Trigger Start Form click
                      onStartForm();
                      // Also dismiss so they don't see it again or mark it seen
                      localStorage.setItem('philoscan_welcome_dismissed', 'true');
                    }}
                    className="flex-1 sm:flex-none py-2.5 px-5 min-h-[44px] bg-[#0277b6] hover:bg-[#02669e] text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap"
                  >
                    <span>ابدأ التشخيص الآن 🚀</span>
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

        </div>

      </motion.div>
    </AnimatePresence>
  );
}
