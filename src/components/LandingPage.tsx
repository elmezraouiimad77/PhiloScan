import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Brain, 
  CheckCircle, 
  BookOpen, 
  ChevronLeft, 
  Users, 
  Activity, 
  FileText, 
  TrendingUp, 
  Award, 
  Star, 
  ArrowLeft, 
  Edit3, 
  Save, 
  Lock, 
  Eye, 
  Image as ImageIcon, 
  Zap,
  Globe,
  Database,
  Grid,
  Laptop
} from 'lucide-react';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import WelcomeSection from './WelcomeSection';

interface LandingPageProps {
  onNavigate: (view: 'home' | 'form' | 'teacher' | 'about' | 'admin', customSessionId?: string) => void;
  onShowToast?: (msg: string) => void;
}

interface WhyCard {
  title: string;
  desc: string;
}

interface HowStage {
  number: string;
  title: string;
  desc: string;
}

interface Feature {
  title: string;
  desc: string;
}

interface Testimonial {
  name: string;
  role: string;
  content: string;
  rating: number;
}

interface LandingPageConfig {
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  heroImage: string;
  
  whyTitle: string;
  whyCards: WhyCard[];
  
  howTitle: string;
  howStages: HowStage[];
  
  studentTitle: string;
  studentDesc: string;
  studentBtnText: string;
  studentImage: string;
  
  teacherTitle: string;
  teacherDesc: string;
  teacherBtnText: string;
  teacherImage: string;
  
  goalsTitle: string;
  goals: string[];
  
  featuresTitle: string;
  features: Feature[];
  
  statsTitle: string;
  stats: {
    teachersLabel: string;
    schoolsLabel: string;
    sessionsLabel: string;
    responsesLabel: string;
    studentsLabel: string;
  };
  
  testimonialsTitle: string;
  testimonials: Testimonial[];
  
  ctaTitle: string;
  ctaSubtitle: string;
  ctaBtnPrimary: string;
  ctaBtnSecondary: string;
}

export default function LandingPage({ onNavigate, onShowToast }: LandingPageProps) {
  const [config, setConfig] = useState<LandingPageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Real stats state
  const [stats, setStats] = useState({
    teachersCount: 12,
    schoolsCount: 8,
    sessionsCount: 24,
    submissionsCount: 156,
    studentsCount: 142
  });

  // Animated numbers state
  const [animatedStats, setAnimatedStats] = useState({
    teachers: 0,
    schools: 0,
    sessions: 0,
    submissions: 0,
    students: 0
  });

  // Edit Panel States
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<LandingPageConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionCode, setSessionCode] = useState('');

  const statsSectionRef = React.useRef<HTMLDivElement>(null);
  const [statsSectionInView, setStatsSectionInView] = useState(false);

  // Authentication check for editing
  useEffect(() => {
    const sessionStr = localStorage.getItem('philoscan_teacher_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session && (session.role === 'admin' || session.email === 'phillofikr@gmail.com')) {
          setIsAdmin(true);
        }
      } catch (e) {
        setIsAdmin(false);
      }
    }
  }, []);

  // Fetch configs & live statistics
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch Landing Page config
        const confRes = await fetch('/api/landing-page');
        if (confRes.ok) {
          const confData = await confRes.json();
          setConfig(confData);
          setEditForm(confData);
        }

        // Fetch Statistics from Firestore (short race timeout) with fallback to server API
        try {
          const statsDocRef = doc(db, 'stats', 'public');
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Firestore stats timeout')), 2500)
          );
          const statsDocSnap = await Promise.race([getDoc(statsDocRef), timeoutPromise]);
          if (statsDocSnap.exists()) {
            const statsData = statsDocSnap.data();
            setStats({
              teachersCount: statsData.teachersCount || 12,
              schoolsCount: statsData.schoolsCount || 8,
              sessionsCount: statsData.sessionsCount || 24,
              submissionsCount: statsData.submissionsCount || 156,
              studentsCount: statsData.studentsCount || 142
            });
          } else {
            const statsRes = await fetch('/api/public/stats');
            if (statsRes.ok) {
              const statsData = await statsRes.json();
              setStats(statsData);
            }
          }
        } catch (fErr) {
          console.warn("Unable to fetch stats from Firestore, falling back to REST endpoint:", fErr);
          const statsRes = await fetch('/api/public/stats');
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setStats(statsData);
          }
        }
      } catch (err) {
        console.error('Error fetching landing page data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Intersection Observer for Section 8 scroll triggering (عند التمرير)
  useEffect(() => {
    const element = statsSectionRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStatsSectionInView(true);
          observer.unobserve(element); // only animate once
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(element);
    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [isLoading]);

  // Animate stats counter
  useEffect(() => {
    if (isLoading || !config || !statsSectionInView) return;

    const duration = 1500; // ms
    const steps = 45;
    const stepTime = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      setAnimatedStats({
        teachers: Math.round((stats.teachersCount / steps) * step),
        schools: Math.round((stats.schoolsCount / steps) * step),
        sessions: Math.round((stats.sessionsCount / steps) * step),
        submissions: Math.round((stats.submissionsCount / steps) * step),
        students: Math.round((stats.studentsCount / steps) * step)
      });

      if (step >= steps) {
        setAnimatedStats({
          teachers: stats.teachersCount,
          schools: stats.schoolsCount,
          sessions: stats.sessionsCount,
          submissions: stats.submissionsCount,
          students: stats.studentsCount
        });
        clearInterval(timer);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [isLoading, stats, config, statsSectionInView]);

  // Handle Admin Save Configuration
  const handleSaveConfig = async () => {
    if (!editForm) return;
    setIsSaving(true);
    try {
      const sessionStr = localStorage.getItem('philoscan_teacher_session') || '{}';
      const session = JSON.parse(sessionStr);
      const token = session.token || '';
      if (!token) {
        onShowToast?.('انتهت صلاحية الجلسة الإدارية. يرجى إعادة تسجيل الدخول كمدير.');
        setIsSaving(false);
        return;
      }

      const res = await fetch('/api/landing-page', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setIsEditing(false);
        onShowToast?.('تم تحديث بيانات الصفحة الرئيسية وحفظها بنجاح!');
      } else {
        const err = await res.json();
        onShowToast?.(err.error || 'فشل حفظ التعديلات.');
      }
    } catch (err) {
      console.error('Error saving landing page config:', err);
      onShowToast?.('فشل حفظ التغييرات على الخادم.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper inputs mapping for editor
  const updateField = (path: string, val: any) => {
    if (!editForm) return;
    const updated = { ...editForm } as any;
    
    if (path.includes('.')) {
      const parts = path.split('.');
      updated[parts[0]][parts[1]] = val;
    } else {
      updated[path] = val;
    }
    setEditForm(updated);
  };

  const updateArrayField = (arrayName: string, idx: number, fieldName: string, val: any) => {
    if (!editForm) return;
    const updated = { ...editForm } as any;
    updated[arrayName][idx][fieldName] = val;
    setEditForm(updated);
  };

  if (isLoading || !config) {
    return (
      <div className="flex flex-col items-center justify-center py-20 min-h-[60vh] text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-slate-500 text-sm font-bold">جاري تحميل منصة فِيلوسكان ميديا...</p>
      </div>
    );
  }

  return (
    <div className="w-full relative space-y-10 sm:space-y-16 pb-10 sm:pb-12 overflow-x-hidden" dir="rtl">
      
      {/* Welcome Section for First-Time Users */}
      <WelcomeSection onStartForm={() => onNavigate('form')} />
      
      {/* 🛠️ Admin Control Banner */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-transparent border-y border-amber-500/20 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-right">
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] animate-pulse">لوحة تسيير</span>
            <div>
              <p className="text-xs font-black text-slate-900 dark:text-amber-400">فضاء تحكم لمدير منصة فِيلوسكان</p>
              <p className="text-[10px] text-slate-500 -mt-0.5">يمكنك تعديل أي نص، ترويسة، أو صور الصفحة الرئيسية مباشرة وحفظها فورياً.</p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsEditing(!isEditing);
              setEditForm(config);
            }}
            className="w-full sm:w-auto min-h-[44px] justify-center py-2 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95"
          >
            {isEditing ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>إيقاف التعديل ومعاينة</span>
              </>
            ) : (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                <span>تحرير محتوى الصفحة الرئيسية</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ━━━━━━ [ SECTION 1: HERO SECTION ] ━━━━━━ */}
      <section className="relative py-4 sm:py-8 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center justify-center">
        {/* Glow Effects */}
        <div className="absolute top-2 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-blue-500/10 dark:bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-2 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-cyan-400/10 dark:bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none" />

        <div className="lg:col-span-7 space-y-5 sm:space-y-6 text-right">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 py-1.5 px-3 rounded-full bg-blue-50 border border-blue-100 dark:bg-blue-950/45 dark:border-blue-900/60 shadow-inner max-w-full">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse shrink-0" />
            {isEditing ? (
              <input
                type="text"
                value={editForm?.heroBadge}
                onChange={(e) => updateField('heroBadge', e.target.value)}
                className="bg-transparent border-b border-amber-400 focus:outline-none text-xs w-full max-w-[320px] font-bold"
              />
            ) : (
              <span className="text-[11px] font-black text-blue-700 dark:text-blue-300 truncate">{config.heroBadge}</span>
            )}
          </div>

          {/* Title */}
          <div className="space-y-3 sm:space-y-4">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-950 dark:text-white tracking-tight leading-tight">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm?.heroTitle}
                  onChange={(e) => updateField('heroTitle', e.target.value)}
                  className="bg-transparent border-b border-amber-400 focus:outline-none w-full font-black"
                />
              ) : (
                config.heroTitle
              )}
            </h1>

            {/* Slogan */}
            <h2 className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 leading-snug">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm?.heroSubtitle}
                  onChange={(e) => updateField('heroSubtitle', e.target.value)}
                  className="bg-transparent border-b border-amber-400 focus:outline-none w-full"
                />
              ) : (
                config.heroSubtitle
              )}
            </h2>

            {/* Description */}
            <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-medium">
              {isEditing ? (
                <textarea
                  rows={3}
                  value={editForm?.heroDescription}
                  onChange={(e) => updateField('heroDescription', e.target.value)}
                  className="bg-transparent border border-amber-400 dark:bg-slate-900 focus:outline-none w-full p-2 text-sm rounded-lg"
                />
              ) : (
                config.heroDescription
              )}
            </p>
          </div>

          {/* Buttons Portal CTA */}
          <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
            <button
              onClick={() => onNavigate('teacher')}
              className="min-h-[46px] py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition duration-200 shadow-md hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 flex items-center justify-center"
            >
              دخول الأستاذ
            </button>
            <button
              onClick={() => onNavigate('form')}
              className="min-h-[46px] py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200/85 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-100 dark:border-slate-800 font-extrabold text-xs sm:text-sm rounded-xl transition duration-200 shadow-xs flex items-center justify-center"
            >
              دخول التلميذ
            </button>
            <button
              onClick={() => {
                const whySection = document.getElementById('why-philoscan');
                if (whySection) whySection.scrollIntoView({ behavior: 'smooth' });
              }}
              className="min-h-[44px] py-2.5 px-4 text-blue-600 dark:text-blue-400 hover:underline font-extrabold text-xs sm:text-sm transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>اكتشف المنصة ◀</span>
            </button>
          </div>
        </div>

        {/* Hero Visual Block */}
        <div className="lg:col-span-5 relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-3xl sm:rounded-[2.5rem] blur-md opacity-25 dark:opacity-40 animate-pulse" />
          <div className="relative bg-white dark:bg-slate-900 p-2 sm:p-3 rounded-3xl sm:rounded-[2.5rem] border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden aspect-video lg:aspect-square flex items-center justify-center">
            {isEditing ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4">
                <ImageIcon className="w-12 h-12 text-slate-400" />
                <label className="text-xs text-slate-500 font-bold">مسار صورة الواجهة (أو رابط خارجي):</label>
                <input
                  type="text"
                  value={editForm?.heroImage}
                  onChange={(e) => updateField('heroImage', e.target.value)}
                  className="bg-transparent text-xs border border-amber-400 focus:outline-none p-2 rounded-lg w-full text-center"
                />
              </div>
            ) : (
              <img
                src={config.heroImage}
                alt="PhiloScan Hero Illustration"
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-full object-cover rounded-2xl sm:rounded-[2.1rem] transition duration-500 hover:scale-[1.03]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&q=80&w=600";
                }}
              />
            )}
            {/* Live Data Overlay */}
            <div className="hidden sm:flex absolute bottom-4 right-4 sm:bottom-6 sm:right-6 bg-slate-950/85 backdrop-blur-md rounded-2xl p-2.5 sm:p-3 border border-slate-800 text-white items-center gap-3 shadow-md max-w-xs animate-bounce" style={{ animationDuration: '4s' }}>
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-500 text-white rounded-xl flex items-center justify-center font-bold">🧠</div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold">تحليل بيداغوجي ذكي</p>
                <p className="text-[11px] font-black text-emerald-400">بصمة فكرية فورية للأقسام</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 2: WHY PHILOSCAN ] ━━━━━━ */}
      <section id="why-philoscan" className="py-6 space-y-8 relative scroll-mt-20">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {isEditing ? (
              <input
                type="text"
                value={editForm?.whyTitle}
                onChange={(e) => updateField('whyTitle', e.target.value)}
                className="bg-transparent border-b border-amber-400 text-center focus:outline-none w-full"
              />
            ) : (
              config.whyTitle
            )}
          </h2>
          <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {config.whyCards.map((card, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -5 }}
              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 p-6 rounded-[24px] shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col text-right justify-between relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition" />
              <div className="space-y-4 relative z-10">
                <div className="w-11 h-11 bg-blue-50 dark:bg-blue-950 rounded-2xl flex items-center justify-center text-xl shadow-xs text-blue-600 dark:text-blue-400 font-bold">
                  {idx === 0 && '🔬'}
                  {idx === 1 && '📊'}
                  {idx === 2 && '📋'}
                  {idx === 3 && '🤖'}
                </div>
                
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm?.whyCards[idx].title}
                      onChange={(e) => updateArrayField('whyCards', idx, 'title', e.target.value)}
                      className="bg-transparent text-sm border-b border-amber-400 focus:outline-none w-full font-bold"
                    />
                    <textarea
                      rows={2}
                      value={editForm?.whyCards[idx].desc}
                      onChange={(e) => updateArrayField('whyCards', idx, 'desc', e.target.value)}
                      className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full rounded-lg p-1"
                    />
                  </div>
                ) : (
                  <>
                    <h3 className="font-extrabold text-slate-950 dark:text-white text-base">{card.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{card.desc}</p>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 3: HOW IT WORKS ] ━━━━━━ */}
      <section className="py-6 space-y-10 relative">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {isEditing ? (
              <input
                type="text"
                value={editForm?.howTitle}
                onChange={(e) => updateField('howTitle', e.target.value)}
                className="bg-transparent border-b border-amber-400 text-center focus:outline-none w-full"
              />
            ) : (
              config.howTitle
            )}
          </h2>
          <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative px-4">
          {/* Connecting dashed line in desktop */}
          <div className="hidden lg:block absolute top-[68px] right-24 left-24 border-t-2 border-dashed border-slate-200 dark:border-slate-800 pointer-events-none z-0" />

          {config.howStages.map((stage, idx) => (
            <div key={idx} className="flex flex-col items-center text-center space-y-4 relative z-10 transition duration-300 hover:scale-105">
              {/* Step Circle */}
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-blue-600 border-4 border-white dark:border-slate-950 text-white flex items-center justify-center font-black text-lg shadow-md font-mono">
                  {stage.number}
                </div>
                {/* Arrow indicator below stage on mobile */}
                {idx < 3 && (
                  <div className="block lg:hidden text-center text-blue-500 font-bold mt-2">
                    ↓
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2 w-full">
                  <input
                    type="text"
                    value={editForm?.howStages[idx].title}
                    onChange={(e) => updateArrayField('howStages', idx, 'title', e.target.value)}
                    className="bg-transparent text-sm border-b border-amber-400 focus:outline-none w-full text-center font-bold"
                  />
                  <textarea
                    rows={2}
                    value={editForm?.howStages[idx].desc}
                    onChange={(e) => updateArrayField('howStages', idx, 'desc', e.target.value)}
                    className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full text-center rounded-lg p-1"
                  />
                </div>
              ) : (
                <div className="space-y-1 max-w-[200px]">
                  <h3 className="font-extrabold text-slate-950 dark:text-white text-sm">{stage.title}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal font-medium">{stage.desc}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 4 & 5: STUDENT & TEACHER DUAL PORTALS ] ━━━━━━ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 py-4">
        
        {/* Portal 4: Student Portal Block */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-[32px] p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 dark:bg-blue-500/3 rounded-full blur-3xl" />
          
          <div className="space-y-6">
            <div className="aspect-video relative rounded-2xl overflow-hidden shadow-xs border border-slate-100 dark:border-slate-800">
              {isEditing ? (
                <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center p-4">
                  <ImageIcon className="w-8 h-8 text-slate-400" />
                  <input
                    type="text"
                    value={editForm?.studentImage}
                    onChange={(e) => updateField('studentImage', e.target.value)}
                    className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full text-center mt-2 p-1.5 rounded-md"
                  />
                </div>
              ) : (
                <img
                  src={config.studentImage}
                  alt="Student Portal"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-2xl transition duration-500 group-hover:scale-[1.025]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&q=80&w=400";
                  }}
                />
              )}
            </div>

            <div className="space-y-3 text-right">
              <span className="p-1 px-3 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 text-[10px] font-black tracking-wider">الالتحاق باستمارة الحصة</span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-950 dark:text-white">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.studentTitle}
                    onChange={(e) => updateField('studentTitle', e.target.value)}
                    className="bg-transparent border-b border-amber-400 focus:outline-none w-full"
                  />
                ) : (
                  config.studentTitle
                )}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                {isEditing ? (
                  <textarea
                    rows={2}
                    value={editForm?.studentDesc}
                    onChange={(e) => updateField('studentDesc', e.target.value)}
                    className="bg-transparent border border-amber-400 focus:outline-none w-full p-2 text-xs rounded-lg"
                  />
                ) : (
                  config.studentDesc
                )}
              </p>
            </div>

            {/* In-Card Dynamic Session Code Joining */}
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 rounded-2xl relative">
              <label className="block text-[11px] sm:text-xs font-black text-slate-600 dark:text-slate-400 mb-2">أدخل رمز الجلسة التشخيصية المرسل من أستاذك:</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  type="text"
                  maxLength={12}
                  placeholder="مثال: PS-DE7M00"
                  value={sessionCode}
                  onChange={(e) => setSessionCode(e.target.value.toUpperCase().trim())}
                  className="flex-1 min-h-[46px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl py-2.5 px-3 text-center font-mono font-extrabold text-base sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-inner"
                  dir="ltr"
                />
                <button
                  onClick={() => {
                    if (!sessionCode.trim()) {
                      onShowToast?.('فضلاً، يرجى كتابة رمز جلسة صالح للانضمام.');
                      return;
                    }
                    onNavigate('form', sessionCode);
                  }}
                  className="min-h-[46px] py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition cursor-pointer flex items-center justify-center gap-1 active:scale-95 shrink-0"
                >
                  دخول الجلسة
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] sm:text-xs">
            <span className="text-slate-400 font-bold">بدء تجربة عينة مفتوحة؟</span>
            <button
              onClick={() => onNavigate('form')}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 font-extrabold transition flex items-center gap-0.5 hover:underline"
            >
              📊 {isEditing ? (
                <input
                  type="text"
                  value={editForm?.studentBtnText}
                  onChange={(e) => updateField('studentBtnText', e.target.value)}
                  className="bg-transparent border-b border-amber-400 focus:outline-none text-[10px]"
                />
              ) : (
                config.studentBtnText + " المفتوحة"
              )} ◀
            </button>
          </div>
        </div>

        {/* Portal 5: Teacher Portal Block */}
        <div className="bg-slate-950 text-white rounded-[32px] p-6 sm:p-8 flex flex-col justify-between shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-6">
            <div className="aspect-video relative rounded-2xl overflow-hidden shadow-md border border-slate-800/80">
              {isEditing ? (
                <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-4">
                  <ImageIcon className="w-8 h-8 text-slate-400" />
                  <input
                    type="text"
                    value={editForm?.teacherImage}
                    onChange={(e) => updateField('teacherImage', e.target.value)}
                    className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full text-center mt-2 p-1.5 rounded-md text-white"
                  />
                </div>
              ) : (
                <img
                  src={config.teacherImage}
                  alt="Teacher Dashboard"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-2xl transition duration-500 group-hover:scale-[1.025]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=400";
                  }}
                />
              )}
            </div>

            <div className="space-y-3 text-right">
              <span className="p-1 px-3 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black tracking-wider">فضاء التوجيه والإشراف للأقسام</span>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.teacherTitle}
                    onChange={(e) => updateField('teacherTitle', e.target.value)}
                    className="bg-transparent border-b border-amber-400 focus:outline-none w-full text-white"
                  />
                ) : (
                  config.teacherTitle
                )}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-semibold">
                {isEditing ? (
                  <textarea
                    rows={2}
                    value={editForm?.teacherDesc}
                    onChange={(e) => updateField('teacherDesc', e.target.value)}
                    className="bg-transparent border border-amber-400 focus:outline-none w-full p-2 text-xs rounded-lg text-white"
                  />
                ) : (
                  config.teacherDesc
                )}
              </p>
            </div>

            {/* Quick Metrics indicators inside card */}
            <div className="grid grid-cols-3 gap-2 py-2">
              <div className="bg-slate-900/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800/50 text-center">
                <p className="text-amber-500 text-xs sm:text-sm font-black font-mono">5 مقاييس</p>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">للتفكير الفلسفي</p>
              </div>
              <div className="bg-slate-900/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800/50 text-center">
                <p className="text-blue-400 text-xs sm:text-sm font-black font-mono">Gemini AI</p>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">تحليل دلالي نوعي</p>
              </div>
              <div className="bg-slate-900/60 p-2.5 sm:p-3 rounded-2xl border border-slate-800/50 text-center">
                <p className="text-emerald-400 text-xs sm:text-sm font-black font-mono">100%</p>
                <p className="text-[9px] text-slate-400 font-bold mt-0.5">تقارير PDF فورية</p>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-6 border-t border-slate-800">
            <button
              onClick={() => onNavigate('teacher')}
              className="w-full py-3 min-h-[48px] bg-white hover:bg-slate-100 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg transition duration-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>{isEditing ? (
                <input
                  type="text"
                  value={editForm?.teacherBtnText}
                  onChange={(e) => updateField('teacherBtnText', e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent text-slate-950 border-b border-amber-400 focus:outline-none text-[12px] text-center"
                />
              ) : (
                config.teacherBtnText
              )}</span>
              <ChevronLeft className="w-4 h-4 text-slate-950" />
            </button>
          </div>
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 6: PLATFORM GOALS ] ━━━━━━ */}
      <section className="py-6 space-y-8 relative">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {isEditing ? (
              <input
                type="text"
                value={editForm?.goalsTitle}
                onChange={(e) => updateField('goalsTitle', e.target.value)}
                className="bg-transparent border-b border-amber-400 text-center focus:outline-none w-full"
              />
            ) : (
              config.goalsTitle
            )}
          </h2>
          <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto" />
        </div>

        <div className="bg-gradient-to-tr from-blue-50/50 via-white to-cyan-50/40 dark:from-slate-900/40 dark:via-slate-950 dark:to-slate-900/20 rounded-[32px] p-6 sm:p-10 border border-slate-200/50 dark:border-slate-800 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          
          {config.goals.map((goal, idx) => (
            <div key={idx} className="flex gap-4 items-start text-right transition hover:scale-[1.01]">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-black text-xs shrink-0 font-mono">
                {idx + 1}
              </div>
              <div className="space-y-1">
                {isEditing ? (
                  <textarea
                    rows={2}
                    value={editForm?.goals[idx]}
                    onChange={(e) => {
                      if (!editForm) return;
                      const updated = { ...editForm };
                      updated.goals[idx] = e.target.value;
                      setEditForm(updated);
                    }}
                    className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full p-2 rounded-lg"
                  />
                ) : (
                  <p className="text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold leading-relaxed">
                    {goal}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Core Philosophy Tag label in the back */}
          <div className="absolute -bottom-3.5 left-4 sm:left-10 bg-blue-600 text-white text-[10px] font-black rounded-lg p-1.5 px-3 transform rotate-2 shadow-md">
            رؤية استراتيجية ممتدة لعام 2026
          </div>
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 7: EXCLUSIVE FEATURES ] ━━━━━━ */}
      <section className="py-6 space-y-8 relative">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {isEditing ? (
              <input
                type="text"
                value={editForm?.featuresTitle}
                onChange={(e) => updateField('featuresTitle', e.target.value)}
                className="bg-transparent border-b border-amber-400 text-center focus:outline-none w-full"
              />
            ) : (
              config.featuresTitle
            )}
          </h2>
          <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {config.features.map((feat, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-[28px] shadow-xs hover:shadow-md hover:border-blue-500/10 transition-all duration-300 relative group text-right"
            >
              <div className="absolute top-0 left-0 w-24 h-24 bg-blue-500/3 rounded-full blur-3xl" />
              <div className="space-y-3 relative z-10">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-950 rounded-xl flex items-center justify-center shadow-xs font-bold text-lg">
                  {idx === 0 && '🧬'}
                  {idx === 1 && '💡'}
                  {idx === 2 && '⚙️'}
                  {idx === 3 && '📄'}
                  {idx === 4 && '📚'}
                  {idx === 5 && '🌟'}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editForm?.features[idx].title}
                      onChange={(e) => updateArrayField('features', idx, 'title', e.target.value)}
                      className="bg-transparent text-sm border-b border-amber-400 focus:outline-none w-full font-bold"
                    />
                    <textarea
                      rows={2}
                      value={editForm?.features[idx].desc}
                      onChange={(e) => updateArrayField('features', idx, 'desc', e.target.value)}
                      className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full rounded-lg p-1"
                    />
                  </div>
                ) : (
                  <>
                    <h4 className="font-extrabold text-slate-950 dark:text-white text-base">{feat.title}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">{feat.desc}</p>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 8: PLATFORM METRICS / COUNTERS ] ━━━━━━ */}
      <section ref={statsSectionRef} className="py-8 relative">
        <div className="absolute inset-0 bg-blue-600 rounded-[40px] opacity-10 blur-3xl pointer-events-none" />
        
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-blue-950 text-white rounded-3xl sm:rounded-[40px] p-5 sm:p-12 border border-slate-800/80 shadow-2xl relative overflow-hidden">
          
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-cyan-400/15 rounded-full blur-[100px] pointer-events-none" />

          {/* Heading */}
          <div className="text-center max-w-2xl mx-auto space-y-2 mb-8 sm:mb-12 relative z-10">
            <h3 className="text-xl sm:text-3xl font-black tracking-tight text-white mb-2">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm?.statsTitle}
                  onChange={(e) => updateField('statsTitle', e.target.value)}
                  className="bg-transparent border-b border-amber-400 text-center text-white focus:outline-none w-full font-black"
                />
              ) : (
                config.statsTitle
              )}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400 font-extrabold uppercase tracking-widest flex items-center justify-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              مؤشرات إحصائية مباشرة ومتحركة بالكامل
            </p>
          </div>

          {/* Animated Statistics Counters */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-8 relative z-10 text-center">
            
            {/* Stat 1: Teachers */}
            <div className="space-y-2">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-amber-500">
                +{animatedStats.teachers}
              </div>
              <p className="text-[10px] sm:text-xs font-black text-slate-300">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.stats.teachersLabel}
                    onChange={(e) => updateField('stats.teachersLabel', e.target.value)}
                    className="bg-transparent text-[10px] text-center border-b border-amber-400 text-white focus:outline-none w-full"
                  />
                ) : (
                  config.stats.teachersLabel
                )}
              </p>
            </div>

            {/* Stat 2: Schools */}
            <div className="space-y-2">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-blue-400">
                +{animatedStats.schools}
              </div>
              <p className="text-[10px] sm:text-xs font-black text-slate-300">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.stats.schoolsLabel}
                    onChange={(e) => updateField('stats.schoolsLabel', e.target.value)}
                    className="bg-transparent text-[10px] text-center border-b border-amber-400 text-white focus:outline-none w-full"
                  />
                ) : (
                  config.stats.schoolsLabel
                )}
              </p>
            </div>

            {/* Stat 3: Sessions */}
            <div className="space-y-2">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-emerald-400">
                +{animatedStats.sessions}
              </div>
              <p className="text-[10px] sm:text-xs font-black text-slate-300">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.stats.sessionsLabel}
                    onChange={(e) => updateField('stats.sessionsLabel', e.target.value)}
                    className="bg-transparent text-[10px] text-center border-b border-amber-400 text-white focus:outline-none w-full"
                  />
                ) : (
                  config.stats.sessionsLabel
                )}
              </p>
            </div>

            {/* Stat 4: Responses */}
            <div className="space-y-2">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-cyan-400">
                +{animatedStats.submissions}
              </div>
              <p className="text-[10px] sm:text-xs font-black text-slate-300">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.stats.responsesLabel}
                    onChange={(e) => updateField('stats.responsesLabel', e.target.value)}
                    className="bg-transparent text-[10px] text-center border-b border-amber-400 text-white focus:outline-none w-full"
                  />
                ) : (
                  config.stats.responsesLabel
                )}
              </p>
            </div>

            {/* Stat 5: Students */}
            <div className="space-y-2 col-span-2 md:col-span-1">
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-indigo-400">
                +{animatedStats.students}
              </div>
              <p className="text-[10px] sm:text-xs font-black text-slate-300">
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm?.stats.studentsLabel}
                    onChange={(e) => updateField('stats.studentsLabel', e.target.value)}
                    className="bg-transparent text-[10px] text-center border-b border-amber-400 text-white focus:outline-none w-full"
                  />
                ) : (
                  config.stats.studentsLabel
                )}
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 9: USER TESTIMONIALS ] ━━━━━━ */}
      <section className="py-6 space-y-8 relative">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {isEditing ? (
              <input
                type="text"
                value={editForm?.testimonialsTitle}
                onChange={(e) => updateField('testimonialsTitle', e.target.value)}
                className="bg-transparent border-b border-amber-400 text-center focus:outline-none w-full"
              />
            ) : (
              config.testimonialsTitle
            )}
          </h2>
          <div className="w-16 h-1 bg-blue-600 rounded-full mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {config.testimonials.map((test, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-[28px] shadow-sm hover:shadow-md hover:border-blue-500/10 transition-all duration-300 flex flex-col justify-between text-right"
            >
              <div className="space-y-4">
                {/* Visual Stars */}
                <div className="flex gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, sIdx) => (
                    <Star key={sIdx} className="w-4 h-4 fill-amber-500" />
                  ))}
                </div>

                {isEditing ? (
                  <textarea
                    rows={4}
                    value={editForm?.testimonials[idx].content}
                    onChange={(e) => updateArrayField('testimonials', idx, 'content', e.target.value)}
                    className="bg-transparent text-xs border border-amber-400 focus:outline-none w-full rounded-lg p-1"
                  />
                ) : (
                  <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm leading-relaxed font-semibold italic">
                    "{test.content}"
                  </p>
                )}
              </div>

              <div className="flex gap-3 items-center pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950/80 flex items-center justify-center font-black text-blue-600 dark:text-blue-300 text-xs font-mono">
                  {test.name[0] || 'A'}
                </div>
                <div>
                  {isEditing ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={editForm?.testimonials[idx].name}
                        onChange={(e) => updateArrayField('testimonials', idx, 'name', e.target.value)}
                        className="bg-transparent text-xs border-b border-amber-400 focus:outline-none w-full font-bold"
                      />
                      <input
                        type="text"
                        value={editForm?.testimonials[idx].role}
                        onChange={(e) => updateArrayField('testimonials', idx, 'role', e.target.value)}
                        className="bg-transparent text-[9px] border-b border-amber-400 focus:outline-none w-full"
                      />
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-black text-slate-900 dark:text-white leading-none">{test.name}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-bold">{test.role}</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━━━━ [ SECTION 10: CALL TO ACTION ] ━━━━━━ */}
      <section className="py-8 relative">
        <div className="bg-gradient-to-r from-blue-600/10 via-blue-500/5 to-transparent rounded-3xl sm:rounded-[40px] border border-blue-500/20 p-6 sm:p-12 text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="max-w-3xl mx-auto space-y-3 relative z-10">
            <h3 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-950 dark:text-white leading-tight">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm?.ctaTitle}
                  onChange={(e) => updateField('ctaTitle', e.target.value)}
                  className="bg-transparent border-b border-amber-400 text-center text-slate-900 focus:outline-none w-full font-black"
                />
              ) : (
                config.ctaTitle
              )}
            </h3>
            <p className="text-xs sm:text-base text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed font-semibold">
              {isEditing ? (
                <textarea
                  rows={2}
                  value={editForm?.ctaSubtitle}
                  onChange={(e) => updateField('ctaSubtitle', e.target.value)}
                  className="bg-transparent border border-amber-400 focus:outline-none w-full text-center p-2 rounded-lg text-slate-800"
                />
              ) : (
                config.ctaSubtitle
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4 relative z-10">
            <button
              onClick={() => onNavigate('teacher')}
              className="w-full sm:w-auto py-3 px-8 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition duration-200 shadow-md hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer active:scale-95"
            >
              {isEditing ? (
                <input
                  type="text"
                  value={editForm?.ctaBtnPrimary}
                  onChange={(e) => updateField('ctaBtnPrimary', e.target.value)}
                  className="bg-transparent text-white border-b border-amber-400 text-center focus:outline-none text-[12px]"
                />
              ) : (
                config.ctaBtnPrimary
              )}
            </button>
            <button
              onClick={() => onNavigate('form')}
              className="w-full sm:w-auto py-3 px-8 min-h-[48px] bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800 dark:hover:bg-slate-800 font-extrabold text-xs sm:text-sm rounded-xl transition duration-200 shadow-xs cursor-pointer active:scale-95"
            >
              {isEditing ? (
                <input
                  type="text"
                  value={editForm?.ctaBtnSecondary}
                  onChange={(e) => updateField('ctaBtnSecondary', e.target.value)}
                  className="bg-transparent text-slate-900 border-b border-amber-400 text-center focus:outline-none text-[12px]"
                />
              ) : (
                config.ctaBtnSecondary
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 🔒 Save and Persist Panel (Floating at bottom center when in-place edit is active) */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-3 right-3 left-3 sm:bottom-6 sm:right-6 sm:left-6 max-w-md mx-auto bg-slate-950 text-white rounded-2xl p-3.5 sm:p-4 border border-slate-800 shadow-2xl z-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center animate-spin shrink-0" style={{ animationDuration: '6s' }}>
                <Zap className="w-5 h-5 text-slate-950" />
              </div>
              <div className="text-right">
                <p className="text-xs font-black">أنت في وضع التعديل النشط</p>
                <p className="text-[10px] text-slate-400">تأكد من حفظ تعديلاتك قبل إغلاق الصفحة.</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 sm:flex-initial min-h-[44px] py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white text-xs font-bold rounded-xl transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="flex-1 sm:flex-initial min-h-[44px] py-2 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-500/40 text-slate-950 text-xs font-black rounded-xl transition flex items-center justify-center gap-1 shadow-md shadow-amber-500/10"
              >
                {isSaving ? (
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-950"></span>
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
