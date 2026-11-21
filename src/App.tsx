/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  Brain, 
  ChevronLeft, 
  Users, 
  BookOpen, 
  Award, 
  Compass, 
  Atom,
  HelpCircle,
  FileSpreadsheet,
  Menu,
  X,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  FileText,
  Globe,
  MessageSquare,
  Send,
  CheckCircle,
  MapPin,
  Copy,
  AlertCircle
} from 'lucide-react';
import StudentForm from './components/StudentForm';
import TeacherDashboard from './components/TeacherDashboard';
import PhiloScanLogo from './components/PhiloScanLogo';
import AboutPlatform from './components/AboutPlatform';
import AdminLogin from './components/AdminLogin';
import LandingPage from './components/LandingPage';

type ViewState = 'home' | 'form' | 'teacher' | 'about' | 'admin';

export default function App() {
  const [view, setView] = useState<ViewState>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/session/')) {
      return 'form';
    }
    const hash = window.location.hash;
    if (hash === '#/about') return 'about';
    if (hash === '#/teacher') return 'teacher';
    if (hash === '#/form') return 'form';
    if (hash.startsWith('#/session/')) return 'form';
    return 'home';
  });
  
  const [studentSessionId, setStudentSessionId] = useState<string>(() => {
    const path = window.location.pathname;
    if (path.startsWith('/session/')) {
      return path.split('/session/')[1]?.toUpperCase() || '';
    }
    const hash = window.location.hash;
    if (hash.startsWith('#/session/')) {
      return hash.split('#/session/')[1]?.toUpperCase() || '';
    }
    return '';
  });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [homeSessionCode, setHomeSessionCode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const sessionStr = localStorage.getItem('philoscan_teacher_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        return !!(session && (session.role === 'admin' || session.email === 'phillofikr@gmail.com'));
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  // Footer Modal States
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactSuccess, setContactSuccess] = useState(false);

  // User Suggestion and Bug Report States
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ name: '', email: '', reportType: 'tech_error', title: '', description: '' });
  const [reportImageBase64, setReportImageBase64] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [appToast, setAppToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showAppToast = (message: string, type: 'success' | 'error' = 'success') => {
    setAppToast({ message, type });
    setTimeout(() => {
      setAppToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate real database or API logging
    console.log('PhiloScan Contact Submission:', contactForm);
    setContactSuccess(true);
    setTimeout(() => {
      setContactSuccess(false);
      setContactForm({ name: '', email: '', subject: '', message: '' });
      setIsContactOpen(false);
    }, 2800);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportForm.email || !reportForm.title || !reportForm.description) {
      setReportError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    setIsSubmittingReport(true);
    setReportError(null);

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderName: reportForm.name,
          email: reportForm.email,
          reportType: reportForm.reportType,
          title: reportForm.title,
          description: reportForm.description,
          imageUrl: reportImageBase64
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'حدث خطأ أثناء الاتصال بالخادم.');
      }

      setReportSuccess(true);
      setTimeout(() => {
        setReportSuccess(false);
        setReportForm({ name: '', email: '', reportType: 'tech_error', title: '', description: '' });
        setReportImageBase64('');
        setIsReportOpen(false);
      }, 2500);
    } catch (err: any) {
      setReportError(err.message || 'فشل الاتصال بالخادم، يرجى المحاولة لاحقاً.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleReportImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showAppToast('حجم الملف كبير جداً! يرجى اختيار لقطة شاشة بحجم يقل عن 2 ميغابايت.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setReportImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Sync state with url hash and path changes for robust routing
  React.useEffect(() => {
    const handleNavigationSync = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;

      if (path.startsWith('/session/')) {
        const sid = path.split('/session/')[1]?.toUpperCase() || '';
        setStudentSessionId(sid);
        setView('form');
      } else if (hash.startsWith('#/session/')) {
        const sid = hash.split('#/session/')[1]?.toUpperCase() || '';
        setStudentSessionId(sid);
        setView('form');
      } else if (hash === '#/about') {
        setView('about');
      } else if (hash === '#/teacher') {
        setView('teacher');
      } else if (hash === '#/form') {
        setView('form');
      } else if (hash === '#/admin') {
        setView('admin');
      } else {
        setView('home');
      }
    };

    window.addEventListener('hashchange', handleNavigationSync);
    window.addEventListener('popstate', handleNavigationSync);
    
    // Set initial hash if none is present to establish state
    if (!window.location.hash && !window.location.pathname.startsWith('/session/')) {
      window.location.hash = '#/home';
    }

    return () => {
      window.removeEventListener('hashchange', handleNavigationSync);
      window.removeEventListener('popstate', handleNavigationSync);
    };
  }, []);

  const navigateTo = (newView: ViewState, customSessionId?: string) => {
    setView(newView);
    setIsMenuOpen(false);
    if (newView === 'home') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
      setStudentSessionId('');
      window.location.hash = '#/home';
    } else if (newView === 'about') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
      window.location.hash = '#/about';
    } else if (newView === 'teacher') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
      window.location.hash = '#/teacher';
    } else if (newView === 'admin') {
      if (window.location.pathname !== '/') {
        window.history.pushState(null, '', '/');
      }
      window.location.hash = '#/admin';
    } else if (newView === 'form') {
      const targetSession = customSessionId || studentSessionId;
      setStudentSessionId(targetSession);
      if (targetSession) {
        if (window.location.pathname !== `/session/${targetSession}`) {
          window.history.pushState(null, '', `/session/${targetSession}`);
        }
        window.location.hash = `#/session/${targetSession}`;
      } else {
        if (window.location.pathname !== '/') {
          window.history.pushState(null, '', '/');
        }
        window.location.hash = '#/form';
      }
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut', staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35 } }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between py-3 sm:py-6 overflow-x-clip">
      {/* Dynamic Header */}
      <header className="max-w-6xl w-full mx-auto px-3 sm:px-6 mb-2 flex justify-between items-center gap-2 relative z-50">
        <div 
          onClick={() => navigateTo('home')} 
          className="flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none group transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98] min-w-0"
        >
          <div className="w-12 h-12 sm:w-[70px] sm:h-[70px] shrink-0 bg-white border border-slate-200/80 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md group-hover:border-blue-300 transition duration-300">
            <PhiloScanLogo size={34} className="sm:hidden" pathStyle={{ fontSize: '18px', lineHeight: '26px' }} />
            <PhiloScanLogo size={45} className="hidden sm:block" pathStyle={{ fontSize: '20px', lineHeight: '30px' }} />
          </div>
          <div className="text-right select-none min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tighter drop-shadow-xs flex items-center gap-1.5 justify-end flex-wrap">
              <span>فِيلوسكان</span>
              <span className="text-[9px] sm:text-[10px] font-black text-blue-600 font-mono tracking-widest uppercase bg-blue-50/80 px-1.5 py-0.5 rounded-md border border-blue-100/40">PhiloScan</span>
            </h1>
            <motion.p 
              className="mt-0.5 sm:mt-1 flex items-center justify-end gap-1 sm:gap-1.5"
              animate={{ opacity: [0.85, 1, 0.85] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <span 
                className="text-xs sm:text-base leading-tight sm:leading-5 truncate"
                style={{ 
                  background: 'linear-gradient(135deg, #0c2b5c 0%, #1d4ed8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontFamily: '"ArabSwell-1", "Arabswell-1", "arabswell-1", "ArabSwell", "Arabswell", "arabswell_1", system-ui', 
                  textAlign: 'right',
                  fontWeight: 600
                }}
              >
                من تشخيص التمثلات إلى بناء التعلمات
              </span>
              <Sparkles className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-blue-600 shrink-0" />
            </motion.p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-3">
          <button 
            onClick={() => navigateTo('home')} 
            className={`py-2 px-3 text-xs font-bold rounded-xl transition ${view === 'home' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
          >
            الرئيسية
          </button>

          <button 
            onClick={() => navigateTo('about')} 
            className={`py-2 px-3 text-xs font-bold rounded-xl transition ${view === 'about' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
          >
            حول المنصة
          </button>
          
          <button 
            onClick={() => navigateTo('form')} 
            className={`py-2 px-3 text-xs font-bold rounded-xl transition ${view === 'form' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
          >
            الاستمارة (التلميذ)
          </button>

          <button
            onClick={() => navigateTo('teacher')}
            className={`py-2 px-4 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 font-bold rounded-xl transition text-xs inline-flex items-center gap-1.5 shadow-xs ${view === 'teacher' ? 'ring-2 ring-blue-500/10 border-blue-500 text-slate-950 font-black' : 'text-slate-700'}`}
          >
            <Users className="w-4 h-4 text-blue-600" />
            <span>فضاء الأستاذ الموجه</span>
          </button>

          <button
            onClick={() => navigateTo('admin')}
            className={`py-2 px-4 border border-indigo-200 hover:border-indigo-300 bg-indigo-50/10 hover:bg-indigo-50/40 font-bold rounded-xl transition text-xs inline-flex items-center gap-1.5 shadow-xs ${view === 'admin' ? 'ring-2 ring-indigo-500/10 border-indigo-500 text-slate-950 font-black' : 'text-indigo-700'}`}
          >
            <Shield className="w-4 h-4 text-indigo-600" />
            <span>لوحة مدير المنصة</span>
          </button>
        </nav>

        {/* Mobile Hamburger Toggle */}
        <div className="md:hidden shrink-0">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-slate-700 hover:bg-slate-100/80 active:bg-slate-200/80 rounded-xl transition active:scale-95 focus:outline-none border border-slate-200/60 bg-white/80 shadow-xs"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Nav Dropdown */}
      <motion.div
        initial={false}
        animate={isMenuOpen ? "open" : "closed"}
        variants={{
          open: { opacity: 1, height: 'auto', display: 'block', marginBottom: '1rem' },
          closed: { opacity: 0, height: 0, marginBottom: '0rem', transitionEnd: { display: 'none' } }
        }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="md:hidden max-w-6xl w-full mx-auto px-3 sm:px-6 overflow-hidden relative z-40"
      >
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2 text-right">
          <button
            onClick={() => navigateTo('home')}
            className={`w-full min-h-[46px] text-right py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 flex items-center leading-normal ${view === 'home' ? 'bg-slate-100 text-slate-900 font-extrabold shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            🏠 الرئيسية
          </button>

          <button
            onClick={() => navigateTo('about')}
            className={`w-full min-h-[46px] text-right py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 flex items-center leading-normal ${view === 'about' ? 'bg-slate-100 text-slate-900 font-extrabold shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            ℹ️ حول المنصة
          </button>
          
          <button
            onClick={() => navigateTo('form')}
            className={`w-full min-h-[46px] text-right py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 flex items-center leading-normal ${view === 'form' ? 'bg-slate-100 text-slate-900 font-extrabold shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            📝 الاستمارة (التلميذ)
          </button>
          
          <div className="border-t border-slate-100 my-1"></div>
          
          <button
            onClick={() => navigateTo('teacher')}
            className={`w-full min-h-[48px] py-3 px-4 rounded-xl text-sm font-extrabold transition-all duration-200 flex items-center justify-center gap-2 border leading-normal shadow-sm ${view === 'teacher' ? 'bg-slate-900 border-slate-950 text-white' : 'bg-blue-50/70 hover:bg-blue-50 border-blue-100 text-blue-700'}`}
          >
            <Users className="w-4 h-4" />
            <span>فضاء الأستاذ الموجه</span>
          </button>

          <button
            onClick={() => navigateTo('admin')}
            className={`w-full min-h-[48px] py-3 px-4 rounded-xl text-sm font-extrabold transition-all duration-200 flex items-center justify-center gap-2 border leading-normal shadow-sm ${view === 'admin' ? 'bg-indigo-900 border-indigo-950 text-white' : 'bg-indigo-50/70 hover:bg-indigo-50 border-indigo-100 text-indigo-700'}`}
          >
            <Shield className="w-4 h-4" />
            <span>لوحة مدير المنصة</span>
          </button>
        </div>
      </motion.div>

      {/* Main Content Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-center min-w-0">
        {view === 'home' && (
          <LandingPage onNavigate={navigateTo} onShowToast={(msg) => showAppToast(msg)} />
        )}

        {view === 'about' && (
          <AboutPlatform onNavigateToForm={() => navigateTo('form')} onNavigateToHome={() => navigateTo('home')} />
        )}

        {view === 'form' && (
          <StudentForm currentSessionId={studentSessionId} onBackToHome={() => navigateTo('home')} />
        )}

        {view === 'teacher' && (
          <TeacherDashboard onBackToHome={() => navigateTo('home')} />
        )}

        {view === 'admin' && (
          <AdminLogin 
            onLoginSuccess={(session) => {
              setIsAuthenticated(true);
              navigateTo('teacher');
            }}
            onBackToHome={() => navigateTo('home')} 
          />
        )}
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#0a0f1d] text-slate-300 border-t border-slate-900 mt-16 shadow-xl relative overflow-hidden" dir="rtl">
        {/* Subtle decorative grid effect inside footer */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-10 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 relative z-10">
          {/* 1. Header Portion with Center Brand Card */}
          <div className="flex flex-col items-center text-center space-y-4 mb-10 pb-8 border-b border-slate-900">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur-xs opacity-70 group-hover:opacity-100 transition duration-300"></div>
              <div className="relative w-14 h-14 bg-[#f6f6fa] text-white rounded-2xl flex items-center justify-center border border-slate-800" style={{ backgroundColor: '#f6f6fa' }}>
                <PhiloScanLogo size={38} theme="vibrant" svgStyle={{ backgroundColor: '#fffcfc', lineHeight: '39px', fontSize: '20px' }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-white tracking-tight">فِيلوسكان <span className="text-xs font-bold text-blue-500 font-mono">PhiloScan</span></h3>
              <p className="text-sm font-extrabold text-slate-200 leading-normal max-w-md mx-auto">
                من تشخيص التمثلات إلى بناء التعلمات
              </p>
              <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
                نظام تشخيصي تفاعلي مدعوم بالذكاء الاصطناعي لرسم تصورات تلاميذ الفلسفة بالتعليم الثانوي التأهيلي وتطوير كفاياتهم الحجاجية.
              </p>
            </div>
          </div>

          {/* 2. Three column responsive grid mapping */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-right mb-10">
            
            {/* Nav Column */}
            <div className="space-y-4">
              <h4 className="text-white font-extrabold text-sm relative pb-2 inline-block">
                بوابات وتصفح
                <span className="absolute bottom-0 right-0 w-8 h-0.5 bg-blue-500" />
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li>
                  <button 
                    onClick={() => { navigateTo('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="hover:text-blue-400 transition cursor-pointer flex items-center gap-1.5"
                  >
                    🏠 الرئيسية
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigateTo('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="hover:text-blue-400 transition cursor-pointer flex items-center gap-1.5"
                  >
                    ℹ️ حول المنصة ومنهجية التشخيص
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigateTo('form'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="hover:text-blue-400 transition cursor-pointer flex items-center gap-1.5"
                  >
                    📝 الاستمارة (بوابة التلميذ)
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => { navigateTo('teacher'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="hover:text-amber-400 transition cursor-pointer flex items-center gap-1.5 text-amber-500 font-bold"
                  >
                    🔑 فضاء الأستاذ الموجه
                  </button>
                </li>
              </ul>
            </div>

            {/* Support & Reporting Column */}
            <div className="space-y-4">
              <h4 className="text-white font-extrabold text-sm relative pb-2 inline-block">
                الدعم ونظام الإبلاغ
                <span className="absolute bottom-0 right-0 w-8 h-0.5 bg-blue-500" />
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-400">
                <li>
                  <button 
                    onClick={() => setIsPrivacyOpen(true)}
                    className="hover:text-blue-400 transition cursor-pointer flex items-center gap-2"
                  >
                    <Shield className="w-3.5 h-3.5 text-slate-500" />
                    <span>سياسة الخصوصية وسرية البيانات</span>
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => setIsTermsOpen(true)}
                    className="hover:text-blue-400 transition cursor-pointer flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    <span>شروط الاستخدام والملكية الفكرية</span>
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => {
                      setReportError(null);
                      setReportSuccess(false);
                      setIsReportOpen(true);
                    }}
                    className="hover:text-amber-400 text-amber-400 font-extrabold transition cursor-pointer flex items-center gap-2 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl block w-full text-right"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                    <span className="truncate flex-1 text-right">الإبلاغ عن مشكلة أو اقتراح تحسين</span>
                  </button>
                </li>
              </ul>
            </div>

            {/* External Links & Email Card Column */}
            <div className="space-y-4">
              <h4 className="text-white font-extrabold text-sm relative pb-2 inline-block">
                الاتصال والمدونة العلمية
                <span className="absolute bottom-0 right-0 w-8 h-0.5 bg-blue-500" />
              </h4>
              
              <div className="space-y-3">
                {/* 1. Official PhiloTHOUGHT blog link */}
                <a 
                  href="https://www.philo-thought.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-slate-900 hover:bg-slate-800 border border-slate-800 p-3 rounded-xl flex items-center justify-between transition cursor-pointer group animate-slow-glow"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black text-slate-200">مدونة فيلوفكر الفلسفية</p>
                      <p className="text-[9px] text-slate-500 font-mono">philo-thought.com</p>
                    </div>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-slate-500 group-hover:translate-x-[-2px] transition" />
                </a>

                {/* 2. Copyable Email Block */}
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 mb-1.5">تواصل معنا المباشر:</p>
                  <div className="flex items-center gap-2">
                    <a 
                      href="mailto:phillofikr@gmail.com" 
                      className="flex-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs font-mono text-left block text-blue-400 truncate font-semibold"
                      title="مراسلتنا عبر البريد الإلكتروني"
                    >
                      phillofikr@gmail.com
                    </a>
                    <button 
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('phillofikr@gmail.com');
                        showAppToast('تم نسخ البريد الإلكتروني بنجاح!');
                      }}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition text-slate-400 cursor-pointer shadow-xs shrink-0"
                      title="نسخ عنوان البريد الإلكتروني"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* 3. Bottom Credits panel with standard oriental numerals */}
          <div className="border-t border-slate-900 mt-10 pt-6 px-4 py-4 rounded-2xl flex flex-col md:flex-row justify-between items-center text-xs text-slate-400 gap-4 bg-[#323f37]">
            <p className="order-2 md:order-1 text-center md:text-right text-[#e6eaf0] border-[#e6ecf5]">
              © 2026 PhiloScan. جميع الحقوق محفوظة للاستعمال العلمي والتربوي.
            </p>
            <div className="order-1 md:order-2 flex flex-wrap justify-center items-center gap-x-4 gap-y-2 text-center md:text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-[#fbe000] font-medium">تصميم وتطوير:</span>
                <span className="font-extrabold text-slate-200">م. ذ. عماد المزراوي</span>
              </div>
              <span className="hidden md:inline text-slate-800">|</span>
              <div className="flex items-center gap-1">
                <span className="text-[#f5cc16]">الإصدار:</span>
                <span className="font-mono bg-blue-500/10 text-blue-400 px-2.5 py-0.5 rounded-md font-extrabold">V1.0</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* FOOTER MODALS COMPLIANCE AT END OF RUNTIME */}
      {/* Privacy Policy Modal */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs transition-opacity duration-300" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden shadow-2xl"
          >
            <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2 text-slate-800">
                <Shield className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="font-black text-sm sm:text-base">سياسة الخصوصية وسرية أبحاث التلاميذ</h3>
              </div>
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 sm:p-8 space-y-4 overflow-y-auto text-slate-600 text-sm leading-relaxed text-right flex-1">
              <p className="font-bold text-slate-800">تلتزم منصة فيلوسكان (PhiloScan) بحماية وسرية كافة بيانات التلاميذ والأساتذة على حد سواء:</p>
              
              <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-2">
                <h4 className="font-extrabold text-blue-900 text-xs text-right">🔒 تشفير وحفظ هوية التلاميذ (Anonymization)</h4>
                <p className="text-xs text-slate-700">
                  لا نطلب من التلميذ أي معلومات تعريفية شخصية حساسة خارج إطار اسمه لتمكين الأستاذ من معرفة صاحبه. تُحفظ الإجابات بهدف التحليل التربوي المعرفي المحض.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">🏫 حظر الاستخدام التجاري أو الخارجي</h4>
                <p className="text-xs text-slate-500">
                  كافة التقارير المصممة والتشخيصات المُنجحة من قبل الذكاء الاصطناعي موجهة حصرياً للأستاذ الموجه المشرف على الفصل الدراسي لمساعدته في بناء أساليب تدريس مخصصة ونقدية، ويُمنع استخدامها تجارياً بالكامل.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">💾 التخزين السحابي المحمي</h4>
                <p className="text-xs text-slate-500">
                  تُقاد قاعدة بيانات المنصة بهيكلية أمان متطورة تابعة لنظام (Firebase) الموثق بأذونات وصول دقيقة تمنع قراءة بيانات فصول أستاذ معين من قبل أي مدرس أو زائر خارجي آخر.
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button 
                onClick={() => setIsPrivacyOpen(false)}
                className="w-full sm:w-auto py-2.5 px-5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                فهمت وأوافق
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Terms of Use Modal */}
      {isTermsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden shadow-2xl"
          >
            <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2 text-slate-800">
                <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="font-black text-sm sm:text-base">شروط استخدام المنصة وأحكام الفضاء التربوي</h3>
              </div>
              <button 
                onClick={() => setIsTermsOpen(false)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 sm:p-8 space-y-4 overflow-y-auto text-slate-600 text-sm leading-relaxed text-right flex-1">
              <p className="font-bold text-slate-800">باستعمالك لمنصة فيلوسكان، فإنك توافق على البنود والشروط التربوية والتقنية التالية:</p>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">🎓 الغرض الأكاديمي والتربوي</h4>
                <p className="text-xs text-slate-500">
                  تم تطوير هذه المنصة غرضاً لتسهيل عمل أساتذة الفلسفة بمؤسسات التعليم الثانوي التأهيلي المغربي لتشخيص التمثلات الفكرية والنزعة النقدية للطلبة قبل انطلاق المجزوءات الفلسفية.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs text-amber-600">⚠️ مسؤولية الأساتذة المشرفين</h4>
                <p className="text-xs text-slate-500">
                  يكون كل أستاذ مسؤولاً مسؤولية تامة عن إدارة الجلسة التشخيصية الخاصة به، ومشاركة رمز الجلسة التعريفي حصراً مع تلامذته بالقسم الدراسي الموجه.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">🔗 الملكية الفكرية والبحث المنهجي</h4>
                <p className="text-xs text-slate-500">
                  تعود الملكية الفكرية والهندسة المنهجية للمنصة ومقاييسها المعرفية الخمسة للمطور والموجه التربوي ذ. عماد المزراوي، وأي اقتباس علمي يجب أن يشير للمصدر بشكل لائق.
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button 
                onClick={() => setIsTermsOpen(false)}
                className="w-full sm:w-auto py-2.5 px-5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                موافق
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Contact Us Modal */}
      {isContactOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] max-w-lg w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden shadow-2xl"
          >
            <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2 text-slate-800">
                <MessageSquare className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="font-black text-sm sm:text-base">تواصل مع الإدارة والدعم الفني لفيلوسكان</h3>
              </div>
              <button 
                onClick={() => setIsContactOpen(false)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 sm:p-8 text-right overflow-y-auto flex-1">
              {contactSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-8 flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-100">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-base">تم إرسال رسالتك بنجاح!</h4>
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                    نشكرك على تواصلك معنا، تم تسجيل رسالتك في سيرة التواصل وسيقوم المشرف ذ. عماد المزراوي بمراجعتها قريباً جداً.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    يسعدنا استقبال آرائكم وملاحظاتكم العلمية أو التبليغ عن أي تحد تقني لتحديث المنصة وتطويرها للأفضل.
                  </p>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">الاسم الكامل:</label>
                    <input 
                      type="text"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="ذ. أحمد بن جلون"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">البريد الإلكتروني المهني:</label>
                    <input 
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="email@academy.gov.ma"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition text-left font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">الموضوع:</label>
                    <input 
                      type="text"
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      placeholder="استفسار حركية التمثلات الفلسفية..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">مضمون الرسالة الموجهة:</label>
                    <textarea 
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      placeholder="اكتب رسالتك أو اقتراحك هنا..."
                      rows={4}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition leading-relaxed"
                      required
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-3 min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer mt-4"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال الرسالة الإلكترونية</span>
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Suggestion / Bug Report Modal */}
      {isReportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto" dir="rtl">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] max-w-xl w-full border border-slate-200 overflow-hidden shadow-2xl my-4 sm:my-8"
          >
            {/* Header */}
            <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2 text-slate-800">
                <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />
                <h3 className="font-black text-sm sm:text-base">مركز الدعم وبلاغات جودة المنصة</h3>
              </div>
              <button 
                onClick={() => setIsReportOpen(false)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Content Body */}
            <div className="p-5 sm:p-8 text-right max-h-[80vh] overflow-y-auto">
              {reportSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-10 flex flex-col items-center text-center space-y-4"
                >
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-100/50">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-lg">تم تسجيل بلاغكم بنجاح!</h4>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    تمت فلترة وتوثيق البلاغ ضمن نظام تتبع جودة برمجيات فيلوسكان (PhiloScan Quality Engine). سيقوم المطور التربوي بمراجعته عاجلاً لتحسين الأداء الفني. نشكرك على هذا الإسهام!
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleReportSubmit} className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    من خلال هذه الخدمة يمكنك إرسال تقرير فوري ملقن بلقطة شاشة لأي خلل، أو اقتراح إثرائي لتطوير المنصة.
                  </p>

                  {reportError && (
                    <div className="p-3.5 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100/80 text-xs font-bold leading-normal text-right">
                      ⚠️ {reportError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">الاسم (اختياري):</label>
                      <input 
                        type="text"
                        value={reportForm.name}
                        onChange={(e) => setReportForm({ ...reportForm, name: e.target.value })}
                        placeholder="ذ. عماد المزراوي"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">البريد الإلكتروني للرد المباشر:</label>
                      <input 
                        type="email"
                        value={reportForm.email}
                        onChange={(e) => setReportForm({ ...reportForm, email: e.target.value })}
                        placeholder="teacher@domain.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition text-left font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">تصنيف البلاغ / المحور:</label>
                    <select
                      value={reportForm.reportType}
                      onChange={(e) => setReportForm({ ...reportForm, reportType: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition cursor-pointer"
                    >
                      <option value="tech_error">🔴 خطأ برمجى / تقنى بالمنصة</option>
                      <option value="form_error">📝 مشكلة متعلقة ببنود وصياغة الاستمارة</option>
                      <option value="analytics_error">📊 خطأ تحليلات / إحصائيات الجلسة وعمل الذكاء الاصطناعي</option>
                      <option value="dev_suggestion">💡 اقتراح تحسين واجهات وتجربة الاستخدام</option>
                      <option value="new_feature">✨ طلب ميزة وأداة تربوية جديدة مضافة</option>
                      <option value="general_comment">💬 ملاحظة عامة أو تقييم للمشروع</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">عنوان البلاغ (موجز):</label>
                    <input 
                      type="text"
                      value={reportForm.title}
                      onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                      placeholder="مثال: تعذر تحميل نتائج الجرافيكس على متصفح سفاري"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 min-h-[44px] text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">الوصف المفصل والملاحظات:</label>
                    <textarea 
                      value={reportForm.description}
                      onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                      placeholder="يرجى كتابة كافة الخطوات والمحاور المطلوبة لنتمكن من معالجة البلاغ بدقة..."
                      rows={4}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-slate-800 text-base sm:text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition leading-relaxed"
                      required
                    />
                  </div>

                  {/* Screenshot Drag & Drop Input / File Picker */}
                  <div>
                    <label className="block text-slate-700 font-bold mb-1.5 text-xs">لقطة شاشة توضيحية (اختياري، بحد أقصى 2 ميغابايت):</label>
                    
                    {!reportImageBase64 ? (
                      <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50 hover:bg-slate-100/50 rounded-2xl p-5 text-center transition relative cursor-pointer group">
                        <input 
                          type="file"
                          accept="image/*"
                          onChange={handleReportImageChange}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                        />
                        <div className="flex flex-col items-center space-y-1.5">
                          <div className="w-10 h-10 bg-slate-100 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 rounded-2xl flex items-center justify-center transition">
                            📷
                          </div>
                          <p className="text-xs text-slate-600 font-bold">اسحب صورة أو لقطة شاشة هنا، أو اضغط للتصفح</p>
                          <p className="text-[10px] text-slate-400">تدعم ملفات الصور JPEG, PNG وغيرها حتى 2MB</p>
                        </div>
                      </div>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video group">
                        <img 
                          src={reportImageBase64} 
                          alt="Screenshot Preview" 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-100 sm:opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <button 
                            type="button"
                            onClick={() => setReportImageBase64('')}
                            className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2 px-4 min-h-[40px] text-xs font-bold shadow-md transition cursor-pointer"
                          >
                            حذف الصورة المرفقة
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button 
                    type="submit"
                    disabled={isSubmittingReport}
                    className={`w-full py-3 min-h-[48px] text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer mt-5 ${isSubmittingReport ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'}`}
                  >
                    {isSubmittingReport ? (
                      <span>جاري إرسال البلاغ...</span>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>تقديم البلاغ لإدارة المنصة</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {appToast && (
        <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 z-[110] sm:max-w-sm" dir="rtl">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs font-extrabold flex items-center gap-2.5 ${
              appToast.type === 'error'
                ? 'bg-red-950 text-red-100 border-red-800'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {appToast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{appToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
