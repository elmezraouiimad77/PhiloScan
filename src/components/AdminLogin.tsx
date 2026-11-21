import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Mail, Lock, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import PhiloScanLogo from './PhiloScanLogo';
import { TeacherSession } from '../types';

interface AdminLoginProps {
  onLoginSuccess: (session: TeacherSession) => void;
  onBackToHome: () => void;
}

export default function AdminLogin({ onLoginSuccess, onBackToHome }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [secretCode, setSecretCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = secretCode.trim();

    if (!trimmedEmail || !trimmedCode) {
      setError('يرجى ملء جميع الحقول المطلوبة لولوج بوابة الرقابة الاستراتيجية.');
      return;
    }

    if (trimmedEmail !== 'phillofikr@gmail.com') {
      setError('ليس لديك صلاحية الوصول إلى لوحة إدارة فِيلوسكان.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          adminSecret: trimmedCode,
          role: 'admin',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        throw new Error(data.error || 'رمز التحقق الإداري المدخل غير صحيح. يرجى مراجعة الإعدادات والمحاولة مرة أخرى.');
      }

      const sessionObj: TeacherSession = {
        email: data.email || trimmedEmail,
        fullName: data.fullName || 'مدير المنصة',
        school: data.school || 'الإدارة المركزية للتعليم بوزارة التربية الوطنية',
        regionalAcademy: data.regionalAcademy || 'المديرية العامة للمنظومة المعلوماتية',
        province: data.province || 'الرباط',
        loggedInAt: data.loggedInAt || new Date().toISOString(),
        role: 'admin',
        teacherId: data.teacherId || 'TCH-ADMIN',
        token: data.token,
      };

      localStorage.setItem('philoscan_teacher_session', JSON.stringify(sessionObj));
      localStorage.setItem('philoscan_teacher_email', trimmedEmail);

      onLoginSuccess(sessionObj);
    } catch (err: any) {
      console.error('Admin login verification error:', err);
      setError(err?.message || 'تعذر التحقق من صلاحية الدخول الإداري. يرجى التأكد من صحة الرمز السري واتصال الخادم.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 text-right" dir="rtl">
      {/* Background soft focus glow elements */}
      <div className="absolute inset-0 bg-radial from-blue-600/5 via-transparent to-transparent blur-3xl rounded-full scale-110 pointer-events-none -z-10"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-slate-950 text-white rounded-[32px] border border-slate-800 p-6 md:p-8 shadow-2xl relative overflow-hidden"
      >
        {/* Absolute branding design */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col items-center text-center space-y-4 mb-8">
          <div className="relative w-20 h-20 bg-slate-900 border border-slate-800 text-white rounded-2xl flex items-center justify-center shadow-lg">
            <PhiloScanLogo size={55} className="text-blue-500" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 text-slate-950 rounded-full flex items-center justify-center font-black text-[10px] shadow-sm border border-slate-900">
              SUP
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2 justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <span>تسجيل دخول مدير المنصة</span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              بوابة الرقابة والتحليل التربوي الاستراتيجي الشامل لسلك الفلسفة
            </p>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-5 bg-red-950/40 border border-red-900/50 text-red-200 p-3.5 rounded-xl text-xs flex items-start gap-2 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-300 block">بريد المدير الإلكتروني المرخص:</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="phillofikr@gmail.com"
                className="w-full min-h-[46px] bg-slate-900/90 border border-slate-800 rounded-xl py-3 pr-10 pl-4 text-base sm:text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-right"
                dir="ltr"
                required
              />
              <Mail className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-slate-300 block">رمز التحقق السري الاستراتيجي:</label>
            <div className="relative">
              <input
                type="password"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                placeholder="• • • • • • • •"
                className="w-full min-h-[46px] bg-slate-900/90 border border-slate-800 rounded-xl py-3 pr-10 pl-4 text-base sm:text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-right"
                dir="ltr"
                required
              />
              <Lock className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-300 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-blue-500/10 cursor-pointer hover:shadow-blue-500/20 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>برمجة التحقق والتأصيل...</span>
                </>
              ) : (
                <>
                  <span>ولوج لوحة الإشراف والمراقبة</span>
                  <ArrowRight className="w-4 h-4 transform rotate-180" />
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-900 flex justify-center">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-h-[44px] px-4 inline-flex items-center justify-center text-xs text-slate-400 hover:text-white transition cursor-pointer font-bold"
          >
            الرجوع للواجهة الرئيسية للموقع
          </button>
        </div>
      </motion.div>
    </div>
  );
}
