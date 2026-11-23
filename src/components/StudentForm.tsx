/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  BookOpen, 
  Heart, 
  Brain, 
  Award, 
  MessageSquare, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  RotateCcw,
  Volume2,
  Info,
  AlertCircle,
  Home,
  ShieldAlert,
  Lock,
  Copy,
  Check,
  WifiOff,
  RefreshCw,
  Eye
} from 'lucide-react';
import {
  StudentAnswers,
  StudentSubmission,
  DiagnosticSession,
  ViolationRecord,
  FormQuestion,
  ViolationEventRecord,
} from '../types';
import QuestionRenderer, { isQuestionAnswered } from './QuestionRenderer';
import StudentSimulator from './StudentSimulator';
import {
  ensureStudentAnonymousAuth,
  getAppCheckTokenHeader,
  getStudentRequestHeaders,
} from '../lib/firebase';
import {
  createStudentSubmissionInFirestore,
  fetchSessionFromFirestore,
  recordStudentViolationEventInFirestore,
  syncStudentPresenceToFirestore,
} from '../lib/firestoreSync';
import {
  enqueueOfflineSubmission,
  getPendingOfflineSubmissions,
  removePendingOfflineSubmission,
  PendingOfflineSubmission,
} from '../lib/localStore';

interface StudentFormProps {
  currentSessionId?: string;
  onBackToHome: () => void;
}

const AXIS_TITLES = [
  'البيانات الأساسية',
  'التصور الأولي للفلسفة',
  'البعد الوجداني',
  'نمط التفكير',
  'القيمة المعرفية',
  'الاستعداد الحجاجي',
  'أسئلة إضافية مخصصة'
];

export default function StudentForm({ currentSessionId, onBackToHome }: StudentFormProps) {
  const [step, setStep] = useState(0);
  const [studentName, setStudentName] = useState('');
  const [customAnswers, setCustomAnswers] = useState<Record<string, any>>({});
  
  // Session States
  const [sessionIdInput, setSessionIdInput] = useState(currentSessionId || '');
  const [activeSession, setActiveSession] = useState<DiagnosticSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(!!currentSessionId);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [urlSessionInvalid, setUrlSessionInvalid] = useState(false);

  const [answers, setAnswers] = useState<StudentAnswers>({
    philosophyMeaning: '',
    sourceOfIdea: '',
    feelingWhenHearing: '',
    feelingJustification: '',
    reactionToFreedomQuestion: '',
    selectedPhilosophicalQuestions: [],
    valueRating: 3,
    philosophyPrimaryGoal: '',
    debateReaction: '',
    expectSuccess: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StudentSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [pendingOfflineQueue, setPendingOfflineQueue] = useState<PendingOfflineSubmission[]>([]);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const [offlineSavedBanner, setOfflineSavedBanner] = useState(false);

  // Auto-save & progress restoration states
  const [isRestoredProgress, setIsRestoredProgress] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  const flushOfflineQueue = async () => {
    const items = await getPendingOfflineSubmissions();
    setPendingOfflineQueue(items);
    if (items.length === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

    setRetryingQueue(true);
    try {
      const reqHeaders = await getStudentRequestHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
      for (const item of items) {
        try {
          let res = await fetch('/api/student-submit', {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify({
              ...item.payload,
              clientSubmissionId: item.localQueueId,
              offlineRequeued: true,
            }),
          });
          if (res.status === 404 && item.payload?.sessionId) {
            res = await fetch('/api/submissions/analyze-public', {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify({
                ...item.payload,
                clientSubmissionId: item.localQueueId,
              }),
            });
          }
          if (res.ok) {
            const data = await res.json();
            await removePendingOfflineSubmission(item.localQueueId);
            if (data?.submission) {
              createStudentSubmissionInFirestore(data.submission).catch(() => {});
            }
            if (!result && data?.submission) {
              setResult(data.submission);
              setOfflineSavedBanner(false);
              setShowSuccessAlert(true);
            }
          }
        } catch {
          // keep queued for next retry
        }
      }
      const remaining = await getPendingOfflineSubmissions();
      setPendingOfflineQueue(remaining);
    } finally {
      setRetryingQueue(false);
    }
  };

  useEffect(() => {
    getPendingOfflineSubmissions().then(setPendingOfflineQueue);
    const onOnline = () => {
      flushOfflineQueue();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // --- START PROCTORING AND TRACKING STATES & LISTENERS ---
  const [violations, setViolations] = useState<ViolationRecord[]>([]);
  const [reliabilityIndex, setReliabilityIndex] = useState(100);
  const reliabilityRef = React.useRef(100);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [isMultiTabDetected, setIsMultiTabDetected] = useState(false);
  const [tabId] = useState(() => Math.random().toString(36).substring(2, 10));

  useEffect(() => {
    reliabilityRef.current = reliabilityIndex;
  }, [reliabilityIndex]);

  const computeTrustScore = (viols: ViolationRecord[]): number => {
    let score = 100;
    const weights = activeSession?.customWeights || {};
    
    viols.forEach(v => {
      const count = v.count || 1;
      const type = v.type;
      let penalty = 15; // default fallback

      if (type.includes('مغادرة') || type.includes('تبويب') || type.includes('تغيير التبويب')) {
        penalty = weights.tabLeave !== undefined ? weights.tabLeave : 15;
      } else if (type.includes('ملء الشاشة')) {
        penalty = weights.fullscreen !== undefined ? weights.fullscreen : 10;
      } else if (type.includes('نسخ') || type.includes('لصق')) {
        penalty = weights.copyPaste !== undefined ? weights.copyPaste : 15;
      } else if (type.includes('المطور')) {
        penalty = weights.devTools !== undefined ? weights.devTools : 25;
      } else if (type.includes('توقف') || type.includes('خمول')) {
        penalty = weights.inactivity !== undefined ? weights.inactivity : 10;
      } else if (type.includes('تحميل')) {
        penalty = weights.tabLeave !== undefined ? weights.tabLeave : 15;
      } else if (type.includes('تصغير')) {
        penalty = weights.browserResize !== undefined ? weights.browserResize : 10;
      } else if (type.includes('الفأرة') || type.includes('حدود')) {
        penalty = weights.mouseLeave !== undefined ? weights.mouseLeave : 8;
      } else if (type.includes('اختصارات') || type.includes('المحظورة')) {
        penalty = weights.prohibitedKeys !== undefined ? weights.prohibitedKeys : 12;
      } else if (type.includes('تعدد علامات')) {
        penalty = weights.multiTab !== undefined ? weights.multiTab : 35;
      }

      score -= (penalty * count);
    });
    return Math.max(0, score);
  };

  const violationSeqRef = React.useRef(0);

  const mapViolationEventType = (rawType: string): ViolationEventRecord['type'] => {
    if (rawType.includes('تبويب') || rawType.includes('علامات')) return 'tab_switch';
    if (rawType.includes('مغادرة') || rawType.includes('حدود') || rawType.includes('تصغير')) return 'window_blur';
    if (rawType.includes('ملء الشاشة')) return 'fullscreen_exit';
    if (rawType.includes('نسخ') || rawType.includes('لصق') || rawType.includes('اختصارات')) return 'copy_paste';
    if (rawType.includes('توقف') || rawType.includes('خمول')) return 'idle_timeout';
    if (rawType.includes('المطور') || rawType.includes('Inspect')) return 'devtools_suspect';
    if (rawType.includes('تحميل')) return 'focus_lost';
    return 'other';
  };

  const syncMonitoringStatus = async (status: string, currentViolations = violations, currentReliability = reliabilityRef.current) => {
    if (!activeSession || !activeSession.supervisedMode || !studentName.trim()) return;
    const totalViolCount = currentViolations.reduce((sum, v) => sum + (v.count || 1), 0);
    const presenceStatus: 'active' | 'submitted' | 'away' | 'flagged' =
      status.includes('أنهى')
        ? 'submitted'
        : status.includes('غادر') || status.includes('متوقف')
        ? 'away'
        : currentReliability < 60
        ? 'flagged'
        : 'active';

    syncStudentPresenceToFirestore(activeSession.sessionId, {
      studentLabel: studentName.trim(),
      status: presenceStatus,
      violationCount: totalViolCount,
      currentQuestionIndex: step,
    }).catch(() => {});

    try {
      const headers = await getStudentRequestHeaders({ 'Content-Type': 'application/json' });
      await fetch(`/api/sessions/${activeSession.sessionId}/monitoring/heartbeat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          studentName: studentName.trim(),
          status,
          violations: currentViolations,
          reliabilityIndex: currentReliability
        })
      });
    } catch (err) {
      console.warn('Silent issue sending monitoring heartbeat:', err);
    }
  };

  // Restore session-saved violations upon reload (if active)
  useEffect(() => {
    if (activeSession && activeSession.supervisedMode) {
      const savedViolations = sessionStorage.getItem(`violations_${activeSession.sessionId}`);
      const savedReliability = sessionStorage.getItem(`reliability_${activeSession.sessionId}`);
      const savedName = sessionStorage.getItem(`studentName_${activeSession.sessionId}`);
      
      let parsedViolations: ViolationRecord[] = [];
      if (savedViolations) {
        try {
          parsedViolations = JSON.parse(savedViolations);
          setViolations(parsedViolations);
        } catch (e) {
          console.warn('Error parsing saved violations:', e);
        }
      }
      if (savedReliability) {
        setReliabilityIndex(parseInt(savedReliability, 10));
      }
      if (savedName) {
        setStudentName(savedName);
      }
      
      // Check reload
      const hasReloaded = sessionStorage.getItem(`reloaded_${activeSession.sessionId}`);
      if (hasReloaded === null && savedName) {
        // Increment reload counter
        sessionStorage.setItem(`reloaded_${activeSession.sessionId}`, 'true');
        const updatedViolations = [...parsedViolations];
        const reloadIndex = updatedViolations.findIndex(v => v.type === 'إعادة تحميل الصفحة');
        if (reloadIndex > -1) {
          updatedViolations[reloadIndex].count += 1;
          updatedViolations[reloadIndex].time = new Date().toISOString();
        } else {
          updatedViolations.push({
            type: 'إعادة تحميل الصفحة',
            time: new Date().toISOString(),
            count: 1
          });
        }
        setViolations(updatedViolations);
        const newScore = computeTrustScore(updatedViolations);
        setReliabilityIndex(newScore);
        sessionStorage.setItem(`violations_${activeSession.sessionId}`, JSON.stringify(updatedViolations));
        sessionStorage.setItem(`reliability_${activeSession.sessionId}`, newScore.toString());
        
        // Push notification immediately
        syncMonitoringStatus('يجيب حالياً', updatedViolations, newScore);
      } else if (!savedName) {
        sessionStorage.setItem(`reloaded_${activeSession.sessionId}`, 'false');
      }
    }
  }, [activeSession]);

  // Event-first presence sync (step changes + low-frequency 45s fallback heartbeat to conserve Firestore quota)
  useEffect(() => {
    if (!monitoringActive || !activeSession || !activeSession.supervisedMode) return;
    syncMonitoringStatus('يجيب حالياً');

    const HEARTBEAT_FALLBACK_MS = 45000;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncMonitoringStatus('يجيب حالياً');
      }
    }, HEARTBEAT_FALLBACK_MS);

    return () => clearInterval(interval);
  }, [monitoringActive, activeSession, studentName, step]);

  const supportsFullscreen = typeof document !== 'undefined' && !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as any).webkitRequestFullscreen ||
    (document.documentElement as any).msRequestFullscreen ||
    (document.documentElement as any).mozRequestFullScreen
  );

  const isMobileDevice = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0)
  );

  const isFullscreenEnforced = supportsFullscreen && !isMobileDevice;

  const addViolation = React.useCallback((type: string, penaltyDuration?: number) => {
    if (!monitoringActive || !activeSession || !activeSession.supervisedMode || !studentName) return;

    setViolations(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(v => v.type === type);
      if (idx > -1) {
        updated[idx].count += 1;
        updated[idx].time = new Date().toISOString();
        if (penaltyDuration !== undefined) {
          updated[idx].duration = (updated[idx].duration || 0) + penaltyDuration;
        }
      } else {
        updated.push({
          type,
          time: new Date().toISOString(),
          count: 1,
          duration: penaltyDuration !== undefined ? penaltyDuration : 0
        });
      }

      const newScore = computeTrustScore(updated);
      reliabilityRef.current = newScore;
      setReliabilityIndex(newScore);

      sessionStorage.setItem(`violations_${activeSession.sessionId}`, JSON.stringify(updated));
      sessionStorage.setItem(`reliability_${activeSession.sessionId}`, newScore.toString());

      // Dispatch status heartbeat + bounded immutable advisory violation event in Firestore (1..50)
      syncMonitoringStatus('يجيب حالياً', updated, newScore);
      if (violationSeqRef.current < 50) {
        violationSeqRef.current += 1;
        recordStudentViolationEventInFirestore(activeSession.sessionId, violationSeqRef.current, {
          type: mapViolationEventType(type),
          details: type,
        }).catch(() => {});
      }

      // Flash Alert warning
      const arabicRules: Record<string, string> = {
        'مغادرة الصفحة أو تغيير التبويب': 'تسجيل مغادرة الصفحة أو الانتقال بين التبويبات',
        'الخروج من وضع ملء الشاشة': 'الخروج من وضع ملء الشاشة الكاملة للمتصفح',
        'محاولة نسخ النصوص': 'محاولة نسخ النصوص والأسئلة لغرض الاستعانة الخارجية',
        'محاولة لصق النصوص': 'محاولة لصق نصوص خارجية مقتبسة',
        'محاولة فتح أدوات المطور (F12)': 'محاولة استغلال أدوات المطور والبرمجة بالمتصفح',
        'محاولة اختراق أدوات المطور (shortcuts)': 'محاولة استخدام اختصارات لوحة المفاتيح لفتح كود البرمجة',
        'محاولة نقر الفأرة الأيمن (Inspect Element)': 'محاولة النقر الأيمن بالفأرة لاستعراض محتويات الكود',
        'تصغير نافذة المتصفح بشكل مفرط': 'وضع تصغير المتصفح لمستوى غير طبيعي',
        'فترات توقف طويلة بشكل غير طبيعي': 'فترة خمول وتوقف عن العمل والتجاوب دامت طويلاً',
        'خروج مؤشر الفأرة من حدود نافذة الاختبار': 'خروج مؤشر الفأرة من حدود نافذة الاختبار (اشتباه الاستعانة بنوافذ خارجية)',
        'محاولة استخدام اختصارات لوحة المفاتيح المحظورة': 'محاولة استخدام اختصارات محظورة (نسخ، لصق، بحث، طباعة، حفظ، تحديد كلي)'
      };
      const prettyType = arabicRules[type] || type;
      setAlertMessage(`🚨 تنبيه أمان: لقد تم رصد وتسجيل مخالفة بخصوص [${prettyType}]. يرجى الحفاظ على التركيز وتقديم تعبيرك الفلسفي الشخصي الأصيل.`);
      setIsAlertVisible(true);

      return updated;
    });
  }, [monitoringActive, activeSession, studentName]);

  // Main Event Listeners Hook
  useEffect(() => {
    if (!monitoringActive || !activeSession || !activeSession.supervisedMode || !studentName) return;

    let blurStart = Date.now();
    let isCurrentlyBlurObj = false;

    // 1. Tab Focus & Blur
    const handleBlur = () => {
      if (!isCurrentlyBlurObj) {
        isCurrentlyBlurObj = true;
        blurStart = Date.now();
        addViolation('مغادرة الصفحة أو تغيير التبويب');
        syncMonitoringStatus('غادر الصفحة');
      }
    };

    const handleFocus = () => {
      if (isCurrentlyBlurObj) {
        isCurrentlyBlurObj = false;
        const dur = Math.round((Date.now() - blurStart) / 1000);
        setViolations(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(v => v.type === 'مغادرة الصفحة أو تغيير التبويب');
          if (idx > -1) {
            updated[idx].duration = (updated[idx].duration || 0) + dur;
          }
          sessionStorage.setItem(`violations_${activeSession.sessionId}`, JSON.stringify(updated));
          syncMonitoringStatus('يجيب حالياً', updated, reliabilityRef.current);
          return updated;
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleBlur();
      } else {
        handleFocus();
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 1.1 Mouse pointer Leaving Window boundaries
    const handleMouseLeave = () => {
      if (!isMobileDevice) {
        addViolation('خروج مؤشر الفأرة من حدود نافذة الاختبار');
      }
    };
    document.addEventListener('mouseleave', handleMouseLeave);

    // 2. Fullscreen Exit
    const handleFullscreenChange = () => {
      if (!isFullscreenEnforced) return;
      const isFull = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isFull) {
        addViolation('الخروج من وضع ملء الشاشة');
        setIsFullscreenActive(false);
      } else {
        setIsFullscreenActive(true);
      }
    };
    if (isFullscreenEnforced) {
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('mozfullscreenchange', handleFullscreenChange);
      document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    }

    // 3. Copy & Paste Protection
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      addViolation('محاولة نسخ النصوص');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      addViolation('محاولة لصق النصوص');
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    // 4. Keyboard DevTools blocker & Prohibited shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.keyCode === 123 || e.key === 'F12') {
        e.preventDefault();
        addViolation('محاولة فتح أدوات المطور (F12)');
      }
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) {
        e.preventDefault();
        addViolation('محاولة اختراق أدوات المطور (shortcuts)');
      }
      if (e.metaKey && e.altKey && e.key.toUpperCase() === 'I') {
        e.preventDefault();
        addViolation('محاولة اختراق أدوات المطور (shortcuts)');
      }

      // Prohibited Keyboard operations (Copy, paste, cut, select all, print, save, search)
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl && ['C', 'V', 'X', 'A', 'P', 'S', 'F'].includes(e.key.toUpperCase())) {
        e.preventDefault();
        addViolation('محاولة استخدام اختصارات لوحة المفاتيح المحظورة');
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 5. Right Click Menu block
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      addViolation('محاولة نقر الفأرة الأيمن (Inspect Element)');
    };
    document.addEventListener('contextmenu', handleContextMenu);

    // 6. Resize window check
    let rsizeTimeout: any = null;
    const handleResize = () => {
      if (isMobileDevice) return; // Completely ignore resize on mobile
      if (rsizeTimeout) clearTimeout(rsizeTimeout);
      rsizeTimeout = setTimeout(() => {
        if (window.outerWidth < 768 || window.outerHeight < 560) {
          addViolation('تصغير نافذة المتصفح بشكل مفرط');
        }
      }, 600);
    };
    window.addEventListener('resize', handleResize);

    // 7. Inactivity Detection (45 seconds)
    let lastInteract = Date.now();
    let isInactiveActive = false;

    const resetInteract = () => {
      lastInteract = Date.now();
      if (isInactiveActive) {
        isInactiveActive = false;
        syncMonitoringStatus('يجيب حالياً');
      }
    };

    document.addEventListener('mousemove', resetInteract);
    document.addEventListener('keydown', resetInteract);
    document.addEventListener('click', resetInteract);
    document.addEventListener('scroll', resetInteract);

    const checkInactivity = setInterval(() => {
      const offlineSince = Date.now() - lastInteract;
      if (offlineSince > 45050 && !isInactiveActive) {
        isInactiveActive = true;
        addViolation('فترات توقف طويلة بشكل غير طبيعي');
        syncMonitoringStatus('متوقف مؤقتاً');
      }
    }, 2500);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (isFullscreenEnforced) {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      }
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', resetInteract);
      document.removeEventListener('keydown', resetInteract);
      document.removeEventListener('click', resetInteract);
      document.removeEventListener('scroll', resetInteract);
      clearInterval(checkInactivity);
      if (rsizeTimeout) clearTimeout(rsizeTimeout);
    };
  }, [monitoringActive, activeSession, studentName, reliabilityIndex, addViolation]);
  // --- END PROCTORING AND TRACKING STATES & LISTENERS ---

  // Restore student progress (name, answers, customAnswers, step) upon session change/refresh
  useEffect(() => {
    if (activeSession) {
      const sessionId = activeSession.sessionId;
      const savedName = localStorage.getItem(`philoscan_name_${sessionId}`);
      const savedAnswersStr = localStorage.getItem(`philoscan_answers_${sessionId}`);
      const savedCustomAnswersStr = localStorage.getItem(`philoscan_custom_answers_${sessionId}`);
      const savedStepStr = localStorage.getItem(`philoscan_step_${sessionId}`);

      if (savedName) {
        setStudentName(savedName);
      }
      if (savedAnswersStr) {
        try {
          const parsed = JSON.parse(savedAnswersStr);
          setAnswers(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.warn('Error parsing saved answers:', e);
        }
      }
      if (savedCustomAnswersStr) {
        try {
          const parsed = JSON.parse(savedCustomAnswersStr);
          setCustomAnswers(parsed);
        } catch (e) {
          console.warn('Error parsing saved custom answers:', e);
        }
      }
      if (savedStepStr) {
        const parsedStep = parseInt(savedStepStr, 10);
        if (!isNaN(parsedStep) && parsedStep >= 0 && parsedStep <= 6) {
          setStep(parsedStep);
        }
      }
      setIsRestoredProgress(true);
      if (savedAnswersStr || savedName || savedCustomAnswersStr) {
        setAutoSaveStatus('saved');
      }
    } else {
      setIsRestoredProgress(false);
      setAutoSaveStatus(null);
    }
  }, [activeSession]);

  // Auto-save progress on changes
  useEffect(() => {
    if (!activeSession || !isRestoredProgress) return;

    // Check if name and answers are completely empty to avoid saving blank slates on reset / initialization
    const isAnswersEmpty = Object.values(answers).every(v => v === '' || (Array.isArray(v) && v.length === 0) || v === 3);
    const isCustomAnswersEmpty = Object.keys(customAnswers).length === 0;
    if (!studentName.trim() && isAnswersEmpty && isCustomAnswersEmpty && step === 0) {
      setAutoSaveStatus(null);
      return;
    }

    setAutoSaveStatus('saving');
    const sessionId = activeSession.sessionId;

    const delayTimer = setTimeout(() => {
      localStorage.setItem(`philoscan_name_${sessionId}`, studentName.trim());
      localStorage.setItem(`philoscan_answers_${sessionId}`, JSON.stringify(answers));
      localStorage.setItem(`philoscan_custom_answers_${sessionId}`, JSON.stringify(customAnswers));
      localStorage.setItem(`philoscan_step_${sessionId}`, step.toString());
      setAutoSaveStatus('saved');
    }, 600); // 600ms debounce to avoid excessive local storage writes

    return () => clearTimeout(delayTimer);
  }, [activeSession, isRestoredProgress, studentName, answers, customAnswers, step]);

  // DUPLICATE MULTI-TAB PREVENTION FOR SUPERVISED MODE
  useEffect(() => {
    if (!activeSession || !studentName.trim() || !activeSession.supervisedMode) return;
    const sessionId = activeSession.sessionId;
    const cleanName = studentName.trim();
    
    try {
      const channel = new BroadcastChannel(`philoscan_tab_lock_${sessionId}_${cleanName}`);
      
      // Ping others to see if this student already was active in another tab
      channel.postMessage({ type: 'PING_STUDENT', tabId, sender: cleanName });
      
      channel.onmessage = (event) => {
        if (event.data && event.data.tabId !== tabId) {
          if (event.data.type === 'PING_STUDENT') {
            // Reply back to let them know we are alive and they are duplicates
            channel.postMessage({ type: 'PONG_STUDENT', tabId, sender: cleanName });
          } else if (event.data.type === 'PONG_STUDENT') {
            // Found sibling active tab under the exact same name for this class!
            setIsMultiTabDetected(true);
            setViolations(prev => {
              const updated = [...prev];
              const type = 'الاشتباه في تشغيل علامات تبويب متعددة لنفس الجلسة';
              const idx = updated.findIndex(v => v.type === type);
              if (idx > -1) {
                updated[idx].count += 1;
              } else {
                updated.push({
                  type,
                  time: new Date().toISOString(),
                  count: 1
                });
              }
              const newScore = computeTrustScore(updated);
              setReliabilityIndex(newScore);
              sessionStorage.setItem(`violations_${sessionId}`, JSON.stringify(updated));
              sessionStorage.setItem(`reliability_${sessionId}`, newScore.toString());
              syncMonitoringStatus('يجيب حالياً (علامات تبويب متعددة)', updated, newScore);
              return updated;
            });
          }
        }
      };
      
      return () => {
        channel.close();
      };
    } catch (err) {
      console.warn('BroadcastChannel not supported in this browser environment', err);
    }
  }, [activeSession, studentName, tabId]);

  // Load session info on initialization
  useEffect(() => {
    if (currentSessionId) {
      loadSessionDetails(currentSessionId, true);
    }
  }, [currentSessionId]);

  const loadSessionDetails = async (code: string, isFromUrl: boolean = false) => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) {
        throw new Error('يرجى إدخال رمز الجلسة لحضور التشخيص.');
      }
      ensureStudentAnonymousAuth().catch(() => null);
      const appCheckHeaders = await getAppCheckTokenHeader(true);
      const response = await fetch(`/api/sessions/${trimmed}`, {
        headers: appCheckHeaders,
      });
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok && data?.session) {
        setActiveSession(data.session);
        if (isFromUrl) {
          setUrlSessionInvalid(false);
        }
        return;
      }

      // Cloud Run cold-start fallback: resolve session directly from Firestore
      const firestoreSession = await fetchSessionFromFirestore(trimmed);
      if (firestoreSession) {
        setActiveSession(firestoreSession);
        if (isFromUrl) {
          setUrlSessionInvalid(false);
        }
        return;
      }

      throw new Error(data?.error || 'فشل تحميل بيانات الجلسة.');
    } catch (err: any) {
      setSessionError(err.message || 'الرمز المدخل غير معتمد أو غير صالح.');
      setActiveSession(null);
      if (isFromUrl) {
        setUrlSessionInvalid(true);
      }
    } finally {
      setSessionLoading(false);
    }
  };

  const handleTextChange = (field: keyof StudentAnswers, value: string) => {
    const prevVal = answers[field];
    if (typeof prevVal === 'string' && value.length - prevVal.length > 15) {
      addViolation('محاولة لصق النصوص');
    }
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (field: keyof StudentAnswers, value: number) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const handleSelectChange = (field: keyof StudentAnswers, value: string) => {
    setAnswers(prev => ({ ...prev, [field]: value }));
  };

  const handleToggleQuestion = (question: string) => {
    setAnswers(prev => {
      const selected = prev.selectedPhilosophicalQuestions.includes(question)
        ? prev.selectedPhilosophicalQuestions.filter(q => q !== question)
        : [...prev.selectedPhilosophicalQuestions, question];
      return { ...prev, selectedPhilosophicalQuestions: selected };
    });
  };

  const customQuestions = activeSession?.questions?.filter((q: any) => 
    q.isCustom || !q.id.match(/^(p|ct|arg|val|read|rel|kt|dc)-\d+$/)
  ) || [];
  const maxStep = customQuestions.length > 0 ? 6 : 5;

  const simulatorQuestions: FormQuestion[] = useMemo(() => {
    const standardQuestions: FormQuestion[] = [
      {
        id: 'philosophyMeaning',
        type: 'long',
        label: 'ما معنى الفلسفة بالنسبة لك؟ (عبّر بحُرية تامة)',
        dimension: 'التصور الأولي',
        weight: 4,
        required: true,
      },
      {
        id: 'sourceOfIdea',
        type: 'single',
        label: 'كيف تشكلت لديك هذه الفكرة المسبقة؟',
        options: ['المدرسة', 'الإنترنت', 'المحيط الاجتماعي', 'لا فكرة مسبقة'],
        dimension: 'التصور الأولي',
        weight: 3,
        required: true,
      },
      {
        id: 'feelingWhenHearing',
        type: 'single',
        label: 'عند سماع كلمة "الفلسفة"، بماذا تشعر في الغالب؟',
        options: ['فضول', 'خوف', 'صعوبة', 'حياد', 'إعجاب'],
        dimension: 'البعد الوجداني',
        weight: 4,
        required: true,
      },
      {
        id: 'feelingJustification',
        type: 'long',
        label: 'علّل برأيك الشخصي سبب اختيارك لهذا الشعور:',
        dimension: 'البعد الوجداني',
        weight: 4,
        required: true,
      },
      {
        id: 'reactionToFreedomQuestion',
        type: 'single',
        label: 'عند مواجهة سؤال كبير مثل: "ما معنى الحرية؟"، كيف يتفاعل ذهنك؟',
        options: ['أفكر في أمثلة من الواقع', 'أبحث عن جواب جاهز', 'أعتبره صعباً', 'أطلب المساعدة'],
        dimension: 'التفكير النقدي',
        weight: 4,
        required: true,
      },
      {
        id: 'selectedPhilosophicalQuestions',
        type: 'multi',
        label: 'برأيك، أي الأسئلة التالية تعتبر سؤالاً فلسفياً؟ (يمكنك اختيار أكثر من سؤال)',
        options: ['لماذا نعيش؟', 'كيف تعمل السيارة؟', 'هل الخير موجود؟', 'ما أكبر عدد؟'],
        dimension: 'التفكير النقدي',
        weight: 4,
        required: true,
      },
      {
        id: 'valueRating',
        type: 'scale',
        label: 'ما مدى موافقتك على القول: "الفلسفة تساعد على فهم الذات والعالم"؟',
        dimension: 'تقييم عام',
        weight: 3,
        required: true,
      },
      {
        id: 'philosophyPrimaryGoal',
        type: 'single',
        label: 'برأيك الخاص، ما هو الهدف الأسمى والأساسي للفلسفة؟',
        options: ['النجاح الدراسي', 'تعلم التفكير', 'حفظ المعلومات', 'النقاش'],
        dimension: 'تقييم عام',
        weight: 4,
        required: true,
      },
      {
        id: 'debateReaction',
        type: 'single',
        label: 'خلال مناقشة حول موضوع شائك ليس له جواب نهائي واحد ووحيد:',
        options: ['أشارك برأيي', 'أستمع فقط', 'أتوتر', 'أرفض المشاركة'],
        dimension: 'الاستعداد للمناقشة',
        weight: 4,
        required: true,
      },
      {
        id: 'expectSuccess',
        type: 'long',
        label: 'هل تتوقع النجاح الحقيقي في دراسة الفلسفة هذا العام؟ ولماذا؟',
        dimension: 'الاستعداد للمناقشة',
        weight: 4,
        required: true,
      },
    ];

    if (customQuestions.length === 0) {
      return standardQuestions;
    }

    const existingIds = new Set(standardQuestions.map((q) => q.id));
    const uniqueCustom = customQuestions.filter((q: FormQuestion) => !existingIds.has(q.id));
    return [...standardQuestions, ...uniqueCustom];
  }, [customQuestions]);

  const simulatorInitialAnswers = useMemo(() => {
    return {
      ...answers,
      ...customAnswers,
    };
  }, [answers, customAnswers]);

  const nextStep = () => {
    if (step === 0 && !studentName.trim()) {
      setError('يرجى كتابة اسمك الثلاثي للمتابعة.');
      return;
    }

    if (step === 0 && activeSession?.supervisedMode && !monitoringActive) {
      setShowAgreementModal(true);
      return;
    }

    if (step === 1) {
      if (!answers.philosophyMeaning.trim() || !answers.sourceOfIdea) {
        setError('يرجى ملء جميع تساؤلات هذا المحور.');
        return;
      }
    }
    if (step === 2) {
      if (!answers.feelingWhenHearing || !answers.feelingJustification.trim()) {
        setError('يرجى اختيار شعورك مع تدوين التعليل المناسب.');
        return;
      }
    }
    if (step === 3) {
      if (!answers.reactionToFreedomQuestion || answers.selectedPhilosophicalQuestions.length === 0) {
        setError('يرجى اختيار طريقة تفكيرك على الأقل وسؤال واحد تفضله.');
        return;
      }
    }
    if (step === 4) {
      if (!answers.philosophyPrimaryGoal) {
        setError('يرجى تحديد غايتك المفضلة من الفلسفة.');
        return;
      }
    }
    if (step === 5) {
      if (!answers.debateReaction || !answers.expectSuccess.trim()) {
        setError('يرجى اختيار رد فعلك في النقاش وموقفك من توقع النجاح لمتابعة التحليل.');
        return;
      }
    }
    if (step === 6) {
      const unanswered = customQuestions.find((q: FormQuestion) => {
        if (q.required === false) return false;
        if (q.type === 'scale' || q.type === 'order') return false;
        return !isQuestionAnswered(q, customAnswers[q.id]);
      });
      if (unanswered) {
        setError(`يرجى الإجابة عن السؤال الإلزامي: "${unanswered.label}"`);
        return;
      }
    }

    setError(null);
    if (step < maxStep) {
      setStep(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const prevStep = () => {
    setError(null);
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  };

  const handleAcceptAgreement = async () => {
    setShowAgreementModal(false);
    setError(null);
    
    // Attempt fullscreen
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreenActive(true);
      }
    } catch (fsErr) {
      console.warn('Fullscreen bypassed:', fsErr);
    }
    
    sessionStorage.setItem(`studentName_${activeSession?.sessionId}`, studentName.trim());
    sessionStorage.setItem(`reloaded_${activeSession?.sessionId}`, 'false');
    setMonitoringActive(true);
    
    // Send immediate heartbeat marking 'joined' without blocking progression
    try {
      await fetch(`/api/sessions/${activeSession?.sessionId}/monitoring/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: studentName.trim(),
          status: 'يجيب حالياً',
          violations: violations,
          reliabilityIndex: reliabilityRef.current
        })
      });
    } catch (hbErr) {
      console.warn('Initial heartbeat failed:', hbErr);
    }

    setStep(1);
  };

  const handleSubmit = async () => {
    console.log('[StudentForm:handleSubmit] Starting submission logic...');
    if (!activeSession) {
      console.error('[StudentForm:handleSubmit] Submission aborted: No active session loaded.');
      setError('عذراً، لا يمكن إرسال الاستمارة دون جلسة نشيطة.');
      return;
    }

    // Stop active monitoring triggers and notify server of completion
    if (activeSession.supervisedMode) {
      setMonitoringActive(false);
      try {
        await fetch(`/api/sessions/${activeSession.sessionId}/monitoring/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: studentName.trim(),
            status: 'أنهى الاستمارة',
            violations,
            reliabilityIndex
          })
        });
      } catch (err) {
        console.warn('Silent issue reporting final heartbeat completing session:', err);
      }
      
      // Attempt to escape fullscreen beautifully
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch (fsExitErr) {
        console.warn('Failed to exit fullscreen automatically:', fsExitErr);
      }
    }

    setLoading(true);
    setError(null);

    const normalizedCustomAnswers = { ...customAnswers };
    customQuestions.forEach((q: FormQuestion) => {
      if (q.type === 'scale' && (normalizedCustomAnswers[q.id] === undefined || normalizedCustomAnswers[q.id] === '')) {
        normalizedCustomAnswers[q.id] = 3;
      } else if (q.type === 'order' && !Array.isArray(normalizedCustomAnswers[q.id]) && q.options?.length) {
        normalizedCustomAnswers[q.id] = [...q.options];
      }
    });

    const clientSubmissionId = 'sub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const payload = { 
      studentName: studentName.trim(), 
      answers: {
        ...answers,
        ...normalizedCustomAnswers
      }, 
      sessionId: activeSession.sessionId.trim(),
      clientSubmissionId,
      violations: activeSession.supervisedMode ? violations : [],
      reliabilityIndex: activeSession.supervisedMode ? reliabilityRef.current : 100,
      questionLabels: activeSession.questions?.reduce((acc: any, q: any) => {
        acc[q.id] = q.label;
        return acc;
      }, {}) || {},
      questionMeta: activeSession.questions?.reduce((acc: any, q: FormQuestion) => {
        acc[q.id] = {
          label: q.label,
          dimension: q.dimension,
          weight: q.weight,
          type: q.type,
        };
        return acc;
      }, {}) || {}
    };

    try {
      const reqHeaders = await getStudentRequestHeaders({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
      const response = await fetch('/api/student-submit', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(payload)
      });

      let data;
      if (response.status === 404) {
        // Fallback for cold containers where session metadata resides in Firestore publicSessions
        const fallbackRes = await fetch('/api/submissions/analyze-public', {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify({
            ...payload,
            institution: activeSession.institution,
            level: activeSession.level,
            stream: activeSession.stream,
            classNumber: activeSession.classNumber,
          }),
        });
        const fallbackJson = await fallbackRes.json();
        if (!fallbackRes.ok) {
          throw new Error(fallbackJson.error || 'فشلت عملية التحليل الموقّع على الخادم.');
        }
        data = {
          submission: fallbackJson.submission || {
            id: fallbackJson.signedEnvelope?.submissionId || clientSubmissionId,
            studentName: studentName.trim(),
            sessionId: activeSession.sessionId.trim(),
            answers: payload.answers,
            analysis: fallbackJson.analysis,
            signedEnvelope: fallbackJson.signedEnvelope,
            reliabilityIndex: payload.reliabilityIndex,
            violations: payload.violations,
            institution: activeSession.institution,
            level: activeSession.level,
            stream: activeSession.stream,
            classNumber: activeSession.classNumber,
            deliveryReceiptId: fallbackJson.deliveryReceiptId,
            deliveredAt: fallbackJson.deliveredAt,
            submittedAt: fallbackJson.deliveredAt || new Date().toISOString(),
          },
        };
      } else {
        try {
          data = await response.json();
        } catch (jsonErr: any) {
          throw new Error(`فشل في قراءة استجابة الخادم (HTTP ${response.status}). التفاصيل: ${jsonErr.message}`);
        }

        if (!response.ok) {
          const errorMsg = data.error || 'فشلت عملية الحفظ والتحليل الذكي.';
          throw new Error(errorMsg);
        }
      }

      // Submission success -> clear active storage to prevent leakage
      if (activeSession) {
        localStorage.removeItem(`philoscan_name_${activeSession.sessionId}`);
        localStorage.removeItem(`philoscan_answers_${activeSession.sessionId}`);
        localStorage.removeItem(`philoscan_custom_answers_${activeSession.sessionId}`);
        localStorage.removeItem(`philoscan_step_${activeSession.sessionId}`);
      }
      if (activeSession.supervisedMode) {
        sessionStorage.removeItem(`violations_${activeSession.sessionId}`);
        sessionStorage.removeItem(`reliability_${activeSession.sessionId}`);
        sessionStorage.removeItem(`studentName_${activeSession.sessionId}`);
        sessionStorage.removeItem(`reloaded_${activeSession.sessionId}`);
      }

      setOfflineSavedBanner(false);
      setResult(data.submission);
      setShowSuccessAlert(true);
      if (activeSession.supervisedMode) {
        syncStudentPresenceToFirestore(activeSession.sessionId, {
          studentLabel: studentName.trim(),
          status: 'submitted',
          violationCount: violations.reduce((sum, v) => sum + (v.count || 1), 0),
          currentQuestionIndex: maxStep,
        }).catch(() => {});
      }
      if (data?.submission) {
        createStudentSubmissionInFirestore(data.submission).catch(() => {});
      }
    } catch (err: any) {
      const isNetworkIssue =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err?.name === 'TypeError' ||
        String(err?.message || '').toLowerCase().includes('fetch') ||
        String(err?.message || '').toLowerCase().includes('network');

      if (isNetworkIssue) {
        await enqueueOfflineSubmission({
          localQueueId: clientSubmissionId,
          sessionId: activeSession.sessionId.trim(),
          studentName: studentName.trim(),
          payload,
          queuedAt: new Date().toISOString(),
          attempts: 1,
          lastError: err?.message || 'انقطاع الاتصال',
        });
        const updatedQueue = await getPendingOfflineSubmissions();
        setPendingOfflineQueue(updatedQueue);
        setOfflineSavedBanner(true);
        setError('تعذر الاتصال الفوري بالخادم، لكن تم حفظ إجاباتك بأمان في ذاكرة جهازك (IndexedDB) وسيتم إرسالها مباشرة لأستاذك فور عودة الإنترنت.');
      } else {
        setError(err.message || 'حدث خطأ غير متوقع أثناء إرسال البيانات.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsRestoredProgress(false);
    setAutoSaveStatus(null);
    if (activeSession) {
      localStorage.removeItem(`philoscan_name_${activeSession.sessionId}`);
      localStorage.removeItem(`philoscan_answers_${activeSession.sessionId}`);
      localStorage.removeItem(`philoscan_custom_answers_${activeSession.sessionId}`);
      localStorage.removeItem(`philoscan_step_${activeSession.sessionId}`);
    }
    if (activeSession?.supervisedMode) {
      sessionStorage.removeItem(`violations_${activeSession.sessionId}`);
      sessionStorage.removeItem(`reliability_${activeSession.sessionId}`);
      sessionStorage.removeItem(`studentName_${activeSession.sessionId}`);
      sessionStorage.removeItem(`reloaded_${activeSession.sessionId}`);
    }
    
    setStudentName('');
    setCustomAnswers({});
    setAnswers({
      philosophyMeaning: '',
      sourceOfIdea: '',
      feelingWhenHearing: '',
      feelingJustification: '',
      reactionToFreedomQuestion: '',
      selectedPhilosophicalQuestions: [],
      valueRating: 3,
      philosophyPrimaryGoal: '',
      debateReaction: '',
      expectSuccess: ''
    });
    setStep(0);
    setResult(null);
    setError(null);
    setShowSuccessAlert(false);
    setViolations([]);
    reliabilityRef.current = 100;
    setReliabilityIndex(100);
    setMonitoringActive(false);
  };

  const getThemeColors = (cls: string) => {
    switch (cls) {
      case 'خوف معرفي':
        return {
          bg: 'bg-red-50 border-red-200',
          text: 'text-red-700',
          accent: 'bg-red-500',
          badge: 'bg-red-100 text-red-800 border-red-200',
          darkText: 'text-red-950',
          lightBg: 'bg-red-50/50'
        };
      case 'تفكير سطحي':
        return {
          bg: 'bg-amber-50 border-amber-200',
          text: 'text-amber-800',
          accent: 'bg-amber-500',
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
          darkText: 'text-amber-950',
          lightBg: 'bg-amber-50/50'
        };
      case 'فضول معرفي':
        return {
          bg: 'bg-blue-50 border-blue-200',
          text: 'text-blue-700',
          accent: 'bg-blue-500',
          badge: 'bg-blue-100 text-blue-800 border-blue-200',
          darkText: 'text-blue-950',
          lightBg: 'bg-blue-50/50'
        };
      case 'تفكير نقدي':
      default:
        return {
          bg: 'bg-emerald-50 border-emerald-200',
          text: 'text-emerald-700',
          accent: 'bg-emerald-500',
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          darkText: 'text-emerald-950',
          lightBg: 'bg-emerald-50/50'
        };
    }
  };

  const currentAnsweredCount = (() => {
    let count = 0;
    if (answers.philosophyMeaning?.trim() !== '') count++;
    if (answers.sourceOfIdea?.trim() !== '') count++;
    if (answers.feelingWhenHearing?.trim() !== '') count++;
    if (answers.feelingJustification?.trim() !== '') count++;
    if (answers.reactionToFreedomQuestion?.trim() !== '') count++;
    if (answers.selectedPhilosophicalQuestions && answers.selectedPhilosophicalQuestions.length > 0) count++;
    if (typeof answers.valueRating === 'number' && answers.valueRating > 0) count++;
    if (answers.philosophyPrimaryGoal?.trim() !== '') count++;
    if (answers.debateReaction?.trim() !== '') count++;
    if (answers.expectSuccess?.trim() !== '') count++;

    // Add custom questions answered count
    customQuestions.forEach((q: FormQuestion) => {
      if (isQuestionAnswered(q, customAnswers[q.id])) {
        count++;
      }
    });

    return count;
  })();
  const totalQuestionsNeeded = 10 + customQuestions.length;
  const completionPercentage = Math.round((currentAnsweredCount / totalQuestionsNeeded) * 100);

  return (
    <div className="max-w-3xl w-full mx-auto px-1 sm:px-4 py-4 sm:py-8 relative">
      {/* 1. MONITORING AGREEMENT OVERLAY MODAL */}
      <AnimatePresence>
        {showAgreementModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/75 backdrop-blur-md flex items-center justify-center z-[110] p-3 sm:p-4 text-right"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.94, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 15 }}
              className="bg-white rounded-3xl sm:rounded-[32px] max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 sm:p-8 border border-slate-200 shadow-2xl space-y-5 sm:space-y-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 border border-blue-200 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Brain className="w-8 h-8" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">الوضع التشخيصي المراقب 🛡️</h3>
                <p className="text-xs text-blue-600 font-bold mt-1">منصة PhiloScan - من تشخيص التمثلات إلى بناء التعلمات الأصيلة</p>
              </div>

              <div className="space-y-3 bg-slate-50 border border-slate-200 p-4 sm:p-5 rounded-2xl text-xs leading-relaxed text-slate-600 font-bold">
                <p className="font-extrabold text-slate-800 text-sm border-b pb-2 mb-2">📌 قواعد السلامة وبناء التعلمات الذاتية:</p>
                <p>• تفكيرك الشخصي هو رأسمال هذه التجربة، وليس العثور على إجابات جاهزة.</p>
                <p>• لقد قام الأستاذ بتفعيل <strong>الوضع المراقب النشط</strong> لضمان موثوقية التشخيص الفلسفي.</p>
                <p>• <strong>المخالفات المرصودة تلقائياً تشمل:</strong> مغادرة التبويب، تصغير النافذة، الخروج من وضع ملء الشاشة، وإجراءات النسخ واللصق.</p>
                <p>• تدوين أي مخالفة سيؤثر على <strong>مؤشر الموثوقية (Trust Score)</strong> المعروض في تقرير أستاذك.</p>
                <p className="text-blue-700 mt-2">* يرجى إغلاق كافة البرامج وإلغاء تشتيت الانتباه قبل البدء للتعبير بصدق.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowAgreementModal(false)}
                  className="sm:flex-1 min-h-[46px] py-3 text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-xl font-bold transition text-xs"
                >
                  تراجع وإلغاء
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAgreement}
                  className="sm:flex-[1.5] min-h-[46px] py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black transition text-xs shadow-md shadow-blue-500/20 active:scale-[0.98]"
                >
                  فهمت وأوافق (تفعيل ملء الشاشة والبدء)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. FORCE FULLSCREEN SHIELD OVERLAY */}
      <AnimatePresence>
        {monitoringActive && isFullscreenEnforced && !isFullscreenActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-lg flex items-center justify-center z-[120] p-3 sm:p-4 text-center overflow-y-auto"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 text-white rounded-3xl sm:rounded-[32px] p-5 sm:p-8 max-w-md w-full max-h-[92vh] overflow-y-auto space-y-5 sm:space-y-6 shadow-2xl relative"
            >
              <div className="absolute top-4 left-4 bg-red-500 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                محظور
              </div>
              <div className="w-16 h-16 bg-red-900/40 border border-red-500/30 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-2 animate-bounce">
                <AlertCircle className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg sm:text-xl font-black text-red-400">عذراً، يجب البقاء في وضع ملء الشاشة!</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  تحت شروط وضع المراقبة التشخيصي المعتمد من قبل أستاذ المادة، لا يسمح بمتابعة ملء الأسئلة الفلسفية خارج وضع التكبير الشامل لضمان النزاهة البيداغوجية.
                </p>
              </div>

              <div className="bg-slate-950/50 p-4 rounded-2xl text-xs text-slate-400 leading-relaxed border border-slate-800 font-mono text-right space-y-1">
                <p className="text-amber-400 font-sans font-bold">⚠️ تم تسجيل الخروج كـ (مخالفة لملء الشاشة).</p>
                <p>مؤشر الموثوقية الحالي الخاص بك: <span className="text-red-500 font-extrabold">{reliabilityIndex}%</span></p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    if (document.documentElement.requestFullscreen) {
                      await document.documentElement.requestFullscreen();
                      setIsFullscreenActive(true);
                    }
                  } catch (e) {
                    console.warn(e);
                  }
                }}
                className="w-full py-3.5 min-h-[48px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-black text-sm transition shadow-lg shadow-blue-500/10 active:scale-95"
              >
                إعادة تفعيل ملء الشاشة واستئناف العمل 🔄
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2.1 FORCE MULTI-TAB BLOCKER SHIELD OVERLAY */}
      <AnimatePresence>
        {isMultiTabDetected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl flex items-center justify-center z-[130] p-3 sm:p-4 text-center overflow-y-auto"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border-2 border-red-500/30 text-white rounded-3xl sm:rounded-[32px] p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto space-y-5 sm:space-y-6 shadow-2xl relative"
            >
              <div className="absolute top-4 left-4 bg-red-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">
                تنبيـه ازدواجيـة الدخـول ⚠️
              </div>
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-950 border-2 border-red-500 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-2 animate-pulse">
                <AlertCircle className="w-9 h-9 sm:w-11 sm:h-11" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg sm:text-2xl font-black text-red-400">تم رصد فتح الاختبار في علامة تبويب أخرى!</h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-semibold">
                  يا <span className="text-blue-400 font-extrabold">{studentName}</span>، يثبت نظام الحماية النشط لمنصة <strong>فِيلوسكان</strong> وجود علامة تبويب أخرى مفتوحة باسمك في هذه الجلسة.
                </p>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  لغرض تأمين نزاهة ومصداقية التقويم البيداغوجي وتجنب تشويش البيانات أو إرسال إجابات مكررة، تم حظر هذه الصفحة مؤقتاً.
                </p>
              </div>

              <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl text-xs text-slate-400 leading-relaxed border border-slate-800 text-right space-y-2 font-medium">
                <p className="text-amber-500 font-bold">• الإجراء المطلوب:</p>
                <p>يرجى إغلاق هذه الصفحة فوراً، والعودة إلى علامة التبويب الأصلية التي بدأت منها الاختبار.</p>
                <p>إذا كنت قد أغلقت الصفحة السابقة عن طريق الخطأ، يرجى إعادة تحميل هذه الصفحة لتحديث الاتصال بالخادم.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="w-full py-3.5 min-h-[48px] bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl font-black text-sm transition shadow-lg shadow-red-500/10 active:scale-95 cursor-pointer"
              >
                تحديث وحل الاتصال الحدي 🔄
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. STUDENT REAL-TIME WARNING TOAST POPUP */}
      <AnimatePresence>
        {isAlertVisible && (
          <motion.div
            initial={{ opacity: 0, y: -60, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-red-950 border border-red-800 text-red-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3 w-[min(90vw,540px)] text-right relative"
            dir="rtl"
          >
            <div className="bg-red-900/30 p-2 rounded-xl text-red-400 flex-shrink-0">
              <AlertCircle className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1">
              <h5 className="font-extrabold text-xs text-red-300 mb-0.5">⚠️ تنبيه من محرك السلامة فِيلوسكان</h5>
              <p className="text-[11px] leading-relaxed text-red-200/90 font-medium">
                {alertMessage}
              </p>
              <div className="flex items-center gap-2 mt-1 px-1.5 py-0.5 bg-red-900/40 rounded-lg w-max text-[9px] font-semibold text-amber-300">
                <span>درجة الموثوقية: {reliabilityIndex}/100</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAlertVisible(false)}
              className="text-red-400 hover:text-red-300 font-bold text-[10px] bg-red-900/20 px-2 py-1 rounded transition self-center cursor-pointer"
            >
              فهمت
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuccessAlert && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 border border-emerald-400 text-white rounded-2xl shadow-xl px-6 py-4 flex items-center gap-3 w-[min(90vw,480px)] text-right"
            dir="rtl"
          >
            <div className="bg-white/20 p-2 rounded-xl text-white flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1">
              <h4 className="font-extrabold text-sm mb-0.5">تم وبحمد الله إرسال الاستمارة!</h4>
              <p className="text-xs text-emerald-50/90 font-medium">وصلت إجاباتك بنجاح وأمان إلى فضاء أستاذك الموجه.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowSuccessAlert(false)}
              className="text-white hover:text-emerald-100 font-bold text-xs mr-2 cursor-pointer bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg border border-emerald-400/40 transition duration-150"
            >
              إغلاق
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {(pendingOfflineQueue.length > 0 || offlineSavedBanner) && (
        <div
          className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right"
          dir="rtl"
        >
          <div className="flex items-start gap-2.5">
            <WifiOff className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-black text-amber-900">
                لديك ({pendingOfflineQueue.length}) استمارة محفوظة محلياً بانتظار الإرسال لأستاذك
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                إجاباتك محفوظة بأمان ولن تضيع. يمكنك إعادة المحاولة يدوياً بمجرد توفر الشبكة.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={retryingQueue}
            onClick={flushOfflineQueue}
            className="min-h-[42px] px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retryingQueue ? 'animate-spin' : ''}`} />
            <span>{retryingQueue ? 'جاري الإرسال...' : 'إعادة الإرسال الآن'}</span>
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 text-center"
          >
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col items-center">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin"></div>
                <Brain className="absolute inset-0 m-auto text-blue-600 w-8 h-8 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">جاري تحليل وعيك الفلسفي...</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-4">
                يقوم محرك فـيــلـوسـكـان الذكي الآن بمراجعة إجاباتك العميقة، وتقييم مؤشرات حجاجك العقلي وتصنيفك في الأنماط الفكرية الأربعة...
              </p>
              <div className="flex gap-1.5 justify-center items-center">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce delay-75"></span>
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce delay-150"></span>
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          </motion.div>
        )}

        {result ? (
          // ==================== RESULT CONFIRMATION (TEACHER ONLY ACCESS ON REAL DISCLOSURES) ====================
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl sm:rounded-[32px] shadow-sm border border-slate-200 overflow-hidden text-center"
          >
            {/* Elegant Header with Victory Halo */}
            <div className="bg-slate-900 border-b border-slate-800 text-white p-6 sm:p-10 relative flex flex-col items-center">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent"></div>
              
              {/* Dynamic success logo circle */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl border border-emerald-400 mb-5 sm:mb-6 animate-bounce">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>

              <span className="bg-emerald-500/20 text-emerald-300 text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/30">
                تم تقديم وإرسال الاستمارة بنجاح 🎯
              </span>
              <h2 className="text-2xl sm:text-3xl font-black mt-4 mb-2">شكراً لك يا {result.studentName}!</h2>
              <p className="text-slate-400 text-xs sm:text-sm max-w-md leading-relaxed">
                لقد تم حفظ وتصنيف إجاباتك العميقة وتوقعاتك بنجاح في قاعدة البيانات السحابية لمنصة فِيلوسكان.
              </p>
            </div>

            <div className="p-5 sm:p-8 max-w-xl mx-auto space-y-5 sm:space-y-6">
              {/* Verified Direct-to-Teacher Delivery Receipt Card */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 sm:p-5 text-right space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 pb-3">
                  <div>
                    <span className="text-[11px] font-black text-emerald-800 block">إيصال تأكيد التسليم المباشر لفضاء الأستاذ</span>
                    <span className="text-base sm:text-lg font-mono font-black text-slate-900 tracking-wide">
                      {result.deliveryReceiptId || `REC-${(result.sessionId || result.session_id || 'PS').slice(-4)}-${result.id.slice(-5).toUpperCase()}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const code = result.deliveryReceiptId || result.id;
                      navigator.clipboard?.writeText(code).catch(() => {});
                      setReceiptCopied(true);
                      setTimeout(() => setReceiptCopied(false), 2000);
                    }}
                    className="min-h-[40px] px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                  >
                    {receiptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{receiptCopied ? 'تم النسخ' : 'نسخ رقم الإيصال'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700 tabular-nums">
                  <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100">
                    <span className="text-[10px] text-slate-500 block">رمز الجلسة والمؤسسة</span>
                    <strong className="font-bold text-slate-900">
                      {result.sessionId || result.session_id} · {result.institution || activeSession?.institution || '—'}
                    </strong>
                  </div>
                  <div className="bg-white/90 rounded-xl p-2.5 border border-emerald-100">
                    <span className="text-[10px] text-slate-500 block">توقيت التسليم الفعلي</span>
                    <strong className="font-mono font-bold text-slate-900">
                      {new Date(result.deliveredAt || result.submittedAt).toLocaleString('ar-MA')}
                    </strong>
                  </div>
                </div>

                <p className="text-[11px] font-bold text-emerald-900 leading-relaxed">
                  تم بث استمارتك وتوصيلها بنجاح مباشرة إلى لوحة تحكم أستاذ المادة مع التوثيق الزمني. احتفظ برقم الإيصال أعلاه عند الحاجة.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6 text-right space-y-4">
                <div className="flex gap-3 items-start">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl mt-1 shrink-0">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm sm:text-base mb-1.5">لماذا لا تظهر لي نسب التحليلات هنا؟</h4>
                    <p className="text-slate-600 text-xs leading-relaxed">
                      وفقاً للميثاق التربوي الخاص بمنصة <strong>فِيلوسكان (PhiloScan)</strong> والتعليمات الصارمة لمصمم المنصة والمفتشين الموجهين: 
                      فإن نتائج الاستمارات والصيغ الدقيقة للمؤشرات الفكرية والنفسية يقتصر الاطلاع عليها <strong>حصرياً على أستاذ المادة الخاص بك</strong> من خلال فضائه المحمي.
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <p className="text-slate-500 text-xs leading-relaxed">
                    يساعد هذا التنظيم التربوي على تلافي المقارنات الجانبية، ويتيح لأستاذك فرصة صياغة التوجيه البيداغوجي الفردي، تكييف الإشكالات داخل الفصل، وصقل استعدادك الفكري بدون ضغوط مسبقة.
                  </p>
                </div>
              </div>

              {/* Action buttons simple return/new form */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2 sm:pt-4">
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="flex-1 py-3.5 min-h-[48px] px-6 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 hover:text-slate-900 transition duration-150 flex items-center justify-center gap-2 text-sm"
                >
                  <ChevronRight className="w-4.5 h-4.5" />
                  الرجوع للرئيسية
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-3.5 min-h-[48px] px-6 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition duration-150 flex items-center justify-center gap-2 text-sm shadow-lg shadow-slate-900/10"
                >
                  <RotateCcw className="w-4.5 h-4.5" />
                  تعبئة استمارة أخرى
                </button>
              </div>
            </div>
          </motion.div>
        ) : urlSessionInvalid ? (
          // ==================== FRIENDLY SESSION NOT FOUND VIEW ====================
          <motion.div
            key="url_session_invalid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] w-full max-w-xl mx-auto shadow-sm border border-slate-200 overflow-hidden text-right"
            dir="rtl"
          >
            <div className="bg-red-50 border-b border-slate-100 text-slate-900 p-5 sm:p-8 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 to-transparent"></div>
              <div className="relative w-16 h-16 bg-red-100 border border-red-200 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 scale-105 shadow-sm">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black mb-1 text-red-900">رمز الجلسة غير صالح أو منتهي</h2>
              <p className="text-red-700/90 text-xs font-bold">عذراً، لم نتمكن من التحقق من هذه الجلسة التشخيصية للفلسفة.</p>
            </div>

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 leading-relaxed text-sm text-slate-600 font-semibold" dir="rtl">
                <p className="font-extrabold text-slate-800">تفاصيل الخطأ البيداغوجي:</p>
                <p className="text-xs text-slate-500">• يبدو أن رابط الجلسة الذي دخلت من خلاله غير مسجل أو قد تم إيقافه من طرف الأستاذ.</p>
                <p className="text-xs text-slate-500">• يرجى التثبت من الرمز وإعادة كتابته يدوياً بعد الرجوع إلى الصفحة الرئيسية.</p>
              </div>

              <button
                type="button"
                onClick={onBackToHome}
                className="w-full py-3.5 min-h-[48px] px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 text-sm shadow-md shadow-slate-900/10"
              >
                <Home className="w-4 h-4 ml-1" />
                <span>الرجوع إلى الصفحة الرئيسية</span>
              </button>
            </div>
          </motion.div>
        ) : sessionLoading ? (
          // ==================== URL SESSION VALIDATION SPINNER ====================
          <motion.div
            key="url_session_checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-3xl sm:rounded-[32px] p-8 sm:p-12 shadow-sm border border-slate-200 text-center space-y-6 max-w-xl mx-auto"
          >
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin"></div>
              <Brain className="absolute inset-0 m-auto text-blue-600 w-6 h-6 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-extrabold text-slate-800 text-lg">جاري التحقق من رمز الجلسة...</h3>
              <p className="text-xs text-slate-400 font-semibold">تتحقق المنصة من الرمز لتسجيل حضورك في نظام PhiloScan.</p>
            </div>
          </motion.div>
        ) : !activeSession ? (
          // ==================== SESSION CODE LOOKUP VIEW ====================
          <motion.div
            key="session_lookup"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] shadow-sm border border-slate-200 overflow-hidden text-right"
          >
            <div className="bg-slate-900 border-b border-slate-800 text-white p-6 sm:p-8 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent"></div>
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 bg-blue-600/10 border border-blue-500/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 scale-105 shadow-md">
                <Brain className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black mb-1">حضور جلسة تشخيصية بالفلسفة</h2>
              <p className="text-slate-400 text-xs">منصة فِيلوسكان - PhiloScan للتحليل البيداغوجي الذكي</p>
            </div>

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
              {sessionError && (
                <div className="bg-red-50 border-r-4 border-red-500 text-red-800 p-4 rounded-xl text-sm leading-relaxed font-semibold">
                  {sessionError}
                </div>
              )}

              <div className="space-y-3">
                <label className="block text-slate-700 font-black text-xs sm:text-sm">
                  رمز الجلسة المسلم لك من طرف الأستاذ (مثال: PS-DE7M00):
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={sessionIdInput}
                    disabled={sessionLoading}
                    onChange={(e) => setSessionIdInput(e.target.value)}
                    placeholder="ضع رمز الجلسة هنا..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3.5 px-4 min-h-[48px] text-center text-base sm:text-lg font-mono font-black tracking-widest text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    disabled={sessionLoading}
                    onClick={() => loadSessionDetails(sessionIdInput)}
                    className="py-3.5 min-h-[48px] px-6 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl active:scale-95 transition text-sm flex items-center justify-center gap-2 shadow-md shadow-slate-900/10"
                  >
                    {sessionLoading ? 'جاري التحقق...' : 'تأكيد الحضور والبدء'}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                <p className="font-extrabold text-blue-800">💡 توجيهات للتلاميذ:</p>
                <p>• تأكد من إدخال الرمز المكون من 6 أحرف والمسبوق بـ PS- بدقة تامة.</p>
                <p>• لا تتطلب المنصة إنشاء حساب تلميذ، بل يتم ربط إجاباتك بجلسة أستاذك مباشرة لتقييم مستواك.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(true)}
                  className="flex-1 py-3 min-h-[48px] px-4 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>معاينة (محاكاة التلميذ)</span>
                </button>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="flex-1 py-3 min-h-[48px] px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  الرجوع إلى الصفحة الرئيسية
                </button>
              </div>
            </div>
          </motion.div>
        ) : activeSession.isFrozen ? (
          // ==================== REJECT FROZEN SESSION VIEW ====================
          <motion.div
            key="frozen_session"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl sm:rounded-[32px] shadow-sm border border-slate-200 overflow-hidden text-right max-w-xl mx-auto"
            dir="rtl"
          >
            <div className="bg-amber-500 border-b border-amber-600 text-white p-6 sm:p-8 text-center relative">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"></div>
              <div className="relative w-16 h-16 bg-white/20 border border-white/30 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 scale-105 shadow-md">
                <Lock className="w-8 h-8 text-white animate-bounce" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black mb-1">هذه الجلسة التشخيصية مجمدة ❄️</h2>
              <p className="text-amber-100 text-xs">تم إيقاف تلقي ردود التلاميذ من طرف الأستاذ الموجه</p>
            </div>

            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
              <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 sm:p-5 text-sm text-amber-800 space-y-2 leading-relaxed">
                <p className="font-extrabold text-amber-900 flex items-center gap-1.5">
                  <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                  <span>انتهى الوقت المخصص للتشخيص:</span>
                </p>
                <p className="text-xs text-slate-600">• قام الأستاذ بتجميد الجلسة (<strong>{activeSession.sessionId}</strong>) لمنع إرسال استمارات جديدة بعد انتهاء الزمن المحدد للنشاط الصفّي.</p>
                <p className="text-xs text-slate-600">• إذا كنت قد أرسلت استمارتك بالفعل، فقد تم حفظها بنجاح في سجل النتائج والتقرير التحليلي الخاص بالقسم.</p>
                <p className="text-xs text-slate-600">• يرجى من التلاميذ المتأخرين مراجعة أستاذ المادة مباشرة لتنسيق فتح الجلسة مؤقتاً أو تزويدهم برمز نشاط جديد.</p>
              </div>

              <div className="border-t border-slate-100 pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="w-full py-3.5 min-h-[48px] px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition duration-150 flex items-center justify-center gap-2 text-sm shadow-md shadow-slate-900/10"
                >
                  <Home className="w-4 h-4 ml-1" />
                  <span>الرجوع إلى الصفحة الرئيسية</span>
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          // ==================== THE FORM STEPS ====================
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl sm:rounded-[32px] shadow-sm border border-slate-200 overflow-hidden relative"
          >
            {/* Real-time high-fidelity progress bar at the very top of the diagnostic session */}
            <div className="w-full bg-slate-100 h-2.5 relative overflow-hidden flex items-stretch select-none" dir="rtl">
              <motion.div
                className="h-full bg-gradient-to-l from-emerald-500 via-teal-500 to-indigo-600 rounded-l-full shadow-[0_0_12px_rgba(16,185,129,0.3)] flex-shrink-0"
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <span className="text-[9px] font-black tracking-tight text-slate-800 bg-white/90 border border-slate-200/50 px-2 py-0.5 rounded-md shadow-xs animate-pulse font-sans">
                  منجز: {completionPercentage}%
                </span>
                <span className="hidden sm:inline text-[9px] font-bold text-slate-500 font-sans">
                  ({currentAnsweredCount} من أصل {totalQuestionsNeeded} أسئلة متكاملة)
                </span>
              </div>
            </div>
            {/* Form Progress Segment */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  {step === 0 && <User className="w-5 h-5" />}
                  {step === 1 && <BookOpen className="w-5 h-5" />}
                  {step === 2 && <Heart className="w-5 h-5" />}
                  {step === 3 && <Brain className="w-5 h-5" />}
                  {step === 4 && <Award className="w-5 h-5" />}
                  {step === 5 && <MessageSquare className="w-5 h-5" />}
                  {step === 6 && <Sparkles className="w-5 h-5" />}
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">المحور الحسابي {step}/{maxStep}</span>
                  <h3 className="font-bold text-slate-800 text-sm md:text-base leading-none">
                    {AXIS_TITLES[step]}
                  </h3>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(true)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة (محاكاة التلميذ)</span>
                </button>

                {/* Visual Auto-save badge */}
                {autoSaveStatus && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-tight border transition-all duration-300 font-sans ${
                      autoSaveStatus === 'saving'
                        ? 'bg-amber-50 text-amber-600 border-amber-200/60 animate-pulse'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                    }`}
                    dir="rtl"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autoSaveStatus === 'saving' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                    <span>{autoSaveStatus === 'saving' ? 'جاري الحفظ...' : 'حفظ تلقائي ✓'}</span>
                  </motion.div>
                )}

                {/* Visual Step Progress Bar */}
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        i === step ? 'w-8 bg-blue-600' : 'w-2.5 bg-slate-200'
                      }`}
                    ></div>
                  ))}
                </div>
                <span className="text-slate-500 text-xs font-mono font-semibold tabular-nums">
                  {Math.round((step / 5) * 100)}%
                </span>
              </div>
            </div>

            {/* Answered Questions Progress Bar */}
            <div className="bg-blue-50/40 border-b border-slate-100 px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans" dir="rtl">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-black text-slate-700">✍️ نسبة اكتمال الإجابة على أسئلة الاستمارة:</span>
                <span className="text-[11px] font-mono font-black text-blue-700 bg-blue-100 border border-blue-200/50 px-2 py-0.5 rounded-lg">
                  {(() => {
                    let count = 0;
                    if (answers.philosophyMeaning?.trim() !== '') count++;
                    if (answers.sourceOfIdea?.trim() !== '') count++;
                    if (answers.feelingWhenHearing?.trim() !== '') count++;
                    if (answers.feelingJustification?.trim() !== '') count++;
                    if (answers.reactionToFreedomQuestion?.trim() !== '') count++;
                    if (answers.selectedPhilosophicalQuestions && answers.selectedPhilosophicalQuestions.length > 0) count++;
                    if (typeof answers.valueRating === 'number' && answers.valueRating > 0) count++;
                    if (answers.philosophyPrimaryGoal?.trim() !== '') count++;
                    if (answers.debateReaction?.trim() !== '') count++;
                    if (answers.expectSuccess?.trim() !== '') count++;
                    return Math.round((count / 10) * 100);
                  })()}%
                </span>
              </div>
              <div className="flex-1 max-w-md w-full bg-slate-200 h-2 rounded-full overflow-hidden relative">
                <motion.div
                  className="bg-gradient-to-l from-blue-600 to-indigo-500 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(() => {
                      let count = 0;
                      if (answers.philosophyMeaning?.trim() !== '') count++;
                      if (answers.sourceOfIdea?.trim() !== '') count++;
                      if (answers.feelingWhenHearing?.trim() !== '') count++;
                      if (answers.feelingJustification?.trim() !== '') count++;
                      if (answers.reactionToFreedomQuestion?.trim() !== '') count++;
                      if (answers.selectedPhilosophicalQuestions && answers.selectedPhilosophicalQuestions.length > 0) count++;
                      if (typeof answers.valueRating === 'number' && answers.valueRating > 0) count++;
                      if (answers.philosophyPrimaryGoal?.trim() !== '') count++;
                      if (answers.debateReaction?.trim() !== '') count++;
                      if (answers.expectSuccess?.trim() !== '') count++;
                      return Math.min(100, Math.round((count / 10) * 100));
                    })()}%`
                  }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <div className="text-[10px] text-slate-500 font-bold select-none shrink-0 arab-num">
                {(() => {
                  let count = 0;
                  if (answers.philosophyMeaning?.trim() !== '') count++;
                  if (answers.sourceOfIdea?.trim() !== '') count++;
                  if (answers.feelingWhenHearing?.trim() !== '') count++;
                  if (answers.feelingJustification?.trim() !== '') count++;
                  if (answers.reactionToFreedomQuestion?.trim() !== '') count++;
                  if (answers.selectedPhilosophicalQuestions && answers.selectedPhilosophicalQuestions.length > 0) count++;
                  if (typeof answers.valueRating === 'number' && answers.valueRating > 0) count++;
                  if (answers.philosophyPrimaryGoal?.trim() !== '') count++;
                  if (answers.debateReaction?.trim() !== '') count++;
                  if (answers.expectSuccess?.trim() !== '') count++;
                  return `${count} من أصل 10 أسئلة مكتملة`;
                })()}
              </div>
            </div>

            {/* 2.2 STUDENTS' REAL-TIME TRUST & INTEGRITY MONITORING DIAL */}
            {activeSession.supervisedMode && monitoringActive && (
              <div className="bg-slate-900 border-b border-slate-800 text-slate-100 p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 transition-all" dir="rtl">
                <div className="flex items-center gap-3.5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border-t-2 relative flex-shrink-0 ${
                    reliabilityIndex >= 85 
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' 
                      : reliabilityIndex >= 55 
                      ? 'bg-amber-950/40 border-amber-500 text-amber-400 animate-pulse' 
                      : 'bg-red-950/40 border-red-500 text-red-400 animate-bounce'
                  }`}>
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs text-slate-300">مؤشر موثوقية النزاهة البيداغوجي (استرشادي فقط):</span>
                      <span className={`text-sm font-black px-2.5 py-0.5 rounded-lg ${
                        reliabilityIndex >= 85 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : reliabilityIndex >= 55 
                          ? 'bg-amber-500/10 text-amber-400' 
                          : 'bg-red-500/10 text-red-500'
                      }`}>
                        {reliabilityIndex}/100
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-bold mt-1 max-w-xl">
                      {reliabilityIndex >= 85 
                        ? '🟢 مؤشر استرشادي ممتاز — يظهر انتظام جلسة الإجابة دون تشتيت متصفح.' 
                        : reliabilityIndex >= 55 
                        ? '🟡 مؤشر استرشادي: تم رصد تنقلات أو اختصارات في المتصفح (للمراجعة التربوية فقط).' 
                        : '🔴 تنبيه استرشادي للأستاذ: كثرة الخروج أو النسخ قد تستدعي متابعة تربوية مباشرة (لا يُعد حكماً تلقائياً).'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 flex-shrink-0 text-center font-semibold text-xs border-t md:border-t-0 md:border-r border-slate-800 pt-3 md:pt-0 md:pr-4 w-full md:w-auto justify-around md:justify-end">
                  <div>
                    <span className="text-slate-400 block text-[9px] mb-0.5">المخالفات المسجلة</span>
                    <span className={`text-xs font-black px-2 py-0.5 rounded ${violations.length > 0 ? 'text-red-400 bg-red-950/30' : 'text-slate-400 bg-slate-800/20'}`}>
                      {violations.reduce((acc, v) => acc + (v.count || 0), 0)} مخلوف
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] mb-0.5">درع الحماية</span>
                    <span className="text-emerald-400 text-[10px] font-black flex items-center justify-center gap-1 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      نشط 🛡️
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Notification */}
            {error && (
              <div className="bg-red-50 border-r-4 border-red-500 text-red-800 p-4 m-6 rounded-xl text-sm flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 scroll-m-0.5 text-red-600 rotate-180" />
                <span>{error}</span>
              </div>
            )}

            {/* The core interactive field steps */}
            <div className={`p-4 sm:p-8 ${monitoringActive ? 'select-none' : ''}`}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* STEP 0: BASIC INFORMATION WITH SESSIONS BANNERS */}
                  {step === 0 && (
                    <div className="space-y-6">
                      {/* Enriched Diagnostic Session Header for multi-teachers */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3.5 text-right">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                          <span className="bg-blue-100 text-blue-800 border border-blue-200 text-xs font-extrabold px-3 py-0.5 rounded-full">
                            جلسة تشخيص مفعلة: {activeSession.sessionId}
                          </span>
                          <h4 className="font-extrabold text-slate-800 text-sm">تفاصيل الصف الدراسي</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-bold text-slate-600">
                          <div>
                            <span className="text-slate-400 block mb-1">المؤسسة التعليمية:</span>
                            <span className="text-slate-800 text-sm font-extrabold">{activeSession.institution}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block mb-1">المدينة / الإقليم:</span>
                            <span className="text-slate-800 text-sm font-extrabold">{activeSession.province}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block mb-1">المستوى والمسلك:</span>
                            <span className="text-slate-800 text-sm font-extrabold">{activeSession.level} - {activeSession.stream}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block mb-1">عنوان الجلسة / القسم:</span>
                            <span className="text-indigo-600 text-sm font-extrabold">{activeSession.title} (القسم: {activeSession.classNumber})</span>
                          </div>
                        </div>
                      </div>

                      <div className="border bg-gradient-to-br from-indigo-50 to-blue-50/40 border-indigo-100 rounded-2xl p-6 text-indigo-950">
                        <h4 className="font-extrabold text-lg mb-2 flex items-center gap-2 text-indigo-900">
                          <Sparkles className="w-5 h-5 text-indigo-500" />
                          أهلاً بك يا بطل الفكر في فِيلوسكان
                        </h4>
                        <p className="text-sm text-indigo-800/90 leading-relaxed">
                          هذه استمارة تشخيصية وليست اختباراً مدرسياً بالاختيار الخاطئ أو الصحيح. الغرض منها هو مساعدتك ومساعدة معلمك على معرفة الطريقة التي يشتغل بها ذهنك الإبداعي لتأسيس نقاش مثمر يناسبك. يرجى الإجابة بمنتهى الأمانة والشفافية.
                        </p>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-2.5">
                          الاسم واللقب (الاسم الكامل):
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={studentName}
                            onChange={(e) => setStudentName(e.target.value)}
                            placeholder="اكتب اسمك الكامل هنا..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 px-4 pr-11 text-slate-800 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition duration-150"
                            dir="rtl"
                          />
                          <User className="absolute right-4 top-4 text-slate-400 w-5 h-5" />
                        </div>
                        <p className="text-slate-400 text-xs mt-2">
                          * نستخدم اسمك من أجل تدوين التقرير في فضاء الأستاذ لمساعدتك تربوياً.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* STEP 1: AXIS 1 - ORIGINAL CONCEIPT OF PHILOSOPHY */}
                  {step === 1 && (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-slate-700 font-bold mb-2.5">
                          ما معنى الفلسفة بالنسبة لك؟ (عبّر بحُرية تامة):
                        </label>
                        <textarea
                          rows={4}
                          value={answers.philosophyMeaning}
                          onChange={(e) => handleTextChange('philosophyMeaning', e.target.value)}
                          onPaste={(e) => {
                            e.preventDefault();
                            addViolation('محاولة لصق النصوص');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            addViolation('محاولة لصق النصوص');
                          }}
                          onBeforeInput={(e: any) => {
                            const inputType = e.nativeEvent?.inputType;
                            if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
                              e.preventDefault();
                              addViolation('محاولة لصق النصوص');
                            }
                          }}
                          placeholder="اكتب المعنى التلقائي أو ما تظنه بصدق عن الفلسفة..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        ></textarea>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-3">
                          كيف تشكلت لديك هذه الفكرة المسبقة؟
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {['المدرسة', 'الإنترنت', 'المحيط الاجتماعي', 'لا فكرة مسبقة'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSelectChange('sourceOfIdea', opt)}
                              className={`min-h-[48px] p-4 rounded-xl border text-right transition duration-150 flex items-center justify-between text-sm ${
                                answers.sourceOfIdea === opt
                                  ? 'bg-blue-50/60 border-blue-500 text-blue-700 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{opt}</span>
                              {answers.sourceOfIdea === opt && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: AXIS 2 - EMOTIONAL DIMENSION */}
                  {step === 2 && (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-slate-700 font-bold mb-3">
                          عند سماع كلمة “الفلسفة”، بماذا تشعر في الغالب؟
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {[
                            { name: 'فضول', color: 'hover:border-blue-400', active: 'bg-blue-50 border-blue-500 text-blue-700 font-bold' },
                            { name: 'خوف', color: 'hover:border-red-400', active: 'bg-red-50 border-red-500 text-red-700 font-bold' },
                            { name: 'صعوبة', color: 'hover:border-amber-400', active: 'bg-amber-50 border-amber-500 text-amber-700 font-bold' },
                            { name: 'حياد', color: 'hover:border-slate-400', active: 'bg-slate-100 border-slate-400 text-slate-700 font-bold' },
                            { name: 'إعجاب', color: 'hover:border-emerald-400', active: 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold' }
                          ].map((opt) => (
                            <button
                              key={opt.name}
                              type="button"
                              onClick={() => handleSelectChange('feelingWhenHearing', opt.name)}
                              className={`min-h-[48px] p-4 rounded-xl border text-center transition duration-150 text-sm flex items-center justify-center ${
                                answers.feelingWhenHearing === opt.name
                                  ? opt.active
                                  : `bg-white border-slate-200 text-slate-700 ${opt.color}`
                              }`}
                            >
                              <span>{opt.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-2.5">
                          علل برأيك الشخصي سبب اختيارك لهذا الشعور:
                        </label>
                        <textarea
                          rows={3}
                          value={answers.feelingJustification}
                          onChange={(e) => handleTextChange('feelingJustification', e.target.value)}
                          onPaste={(e) => {
                            e.preventDefault();
                            addViolation('محاولة لصق النصوص');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            addViolation('محاولة لصق النصوص');
                          }}
                          onBeforeInput={(e: any) => {
                            const inputType = e.nativeEvent?.inputType;
                            if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
                              e.preventDefault();
                              addViolation('محاولة لصق النصوص');
                            }
                          }}
                          placeholder="مثلاً: أخاف من صعوبتها، يراودني الفضول للمواضيع الغريبة، أعتبرها مادة للحفظ فقط..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        ></textarea>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: AXIS 3 - THINKING STYLE */}
                  {step === 3 && (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-slate-700 font-bold mb-3">
                          عند مواجهة سؤال كبير مثل: “ما معنى الحرية؟”، كيف يتفاعل ذهنك؟
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            'أفكر في أمثلة من الواقع',
                            'أبحث عن جواب جاهز',
                            'أعتبره صعباً',
                            'أطلب المساعدة'
                          ].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSelectChange('reactionToFreedomQuestion', opt)}
                              className={`min-h-[48px] p-4 rounded-xl border text-right transition duration-150 flex items-center justify-between text-sm ${
                                answers.reactionToFreedomQuestion === opt
                                  ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{opt}</span>
                              {answers.reactionToFreedomQuestion === opt && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-2.5">
                          برأيك، أي الأسئلة التالية تعتبر سؤالاً فلسفياً؟ (يمكنك اختيار أكثر من سؤال):
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {[
                            'لماذا نعيش؟',
                            'كيف تعمل السيارة؟',
                            'هل الخير موجود؟',
                            'ما أكبر عدد؟'
                          ].map((q) => {
                            const isSelected = answers.selectedPhilosophicalQuestions.includes(q);
                            return (
                              <button
                                key={q}
                                type="button"
                                onClick={() => handleToggleQuestion(q)}
                                className={`min-h-[48px] p-4 rounded-xl border text-right transition duration-150 flex items-center justify-between cursor-pointer text-sm ${
                                  isSelected
                                    ? 'bg-blue-50/80 border-blue-400 text-blue-700 font-bold'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span>{q}</span>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="w-5 h-5 accent-blue-600 shrink-0"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 6: CUSTOM ADDITIONAL QUESTIONS */}
                  {step === 6 && customQuestions.length > 0 && (
                    <div className="space-y-6 text-right" dir="rtl">
                      <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mb-4 text-right">
                        <span className="text-indigo-800 text-xs font-black">
                          الأسئلة الإضافية المخصصة للأستاذ · {customQuestions.length} بنود
                        </span>
                        <p className="text-xs text-indigo-700 font-semibold mt-1.5">
                          أضاف أستاذك هذه الأسئلة المخصصة لاستكشاف مهارات ومعارف إضافية تتماشى مع خطته البيداغوجية لقسمك:
                        </p>
                      </div>

                      <QuestionRenderer
                        questions={customQuestions}
                        answers={customAnswers}
                        onChange={(qid, val) => setCustomAnswers((prev) => ({ ...prev, [qid]: val }))}
                        onProctorViolation={monitoringActive ? addViolation : undefined}
                      />
                    </div>
                  )}

                  {/* STEP 4: AXIS 4 - COGNITIVE VALUE */}
                  {step === 4 && (
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-slate-700 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span>ما مدى موافقتك على القول: “الفلسفة تساعد على فهم الذات والعالم”؟</span>
                          <span className="text-blue-600 font-bold font-mono text-base">{answers.valueRating} / 5</span>
                        </label>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>أرفض بشدة (1)</span>
                          <span>متردد (3)</span>
                          <span>أوافق تماماً (5)</span>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {[1, 2, 3, 4, 5].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => handleNumberChange('valueRating', num)}
                              className={`min-h-[46px] rounded-xl border font-mono font-black text-base transition cursor-pointer ${
                                answers.valueRating === num
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="5"
                          step="1"
                          value={answers.valueRating}
                          onChange={(e) => handleNumberChange('valueRating', parseInt(e.target.value))}
                          className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-3">
                          برأيك الخاص، ما هو الهدف الأسمى والأساسي للفلسفة؟
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {['النجاح الدراسي', 'تعلم التفكير', 'حفظ المعلومات', 'النقاش'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSelectChange('philosophyPrimaryGoal', opt)}
                              className={`min-h-[48px] p-4 rounded-xl border text-right transition duration-150 flex items-center justify-between cursor-pointer text-sm ${
                                answers.philosophyPrimaryGoal === opt
                                  ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{opt}</span>
                              {answers.philosophyPrimaryGoal === opt && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 5: AXIS 5 - DEBATE READINESS */}
                  {step === 5 && (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-slate-700 font-bold mb-3">
                          خلال مناقشة حول موضوع شائك ليس له جواب نهائي واحد ووحيد:
                        </label>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            'أشارك برأيي',
                            'أستمع فقط',
                            'أتوتر',
                            'أرفض المشاركة'
                          ].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => handleSelectChange('debateReaction', opt)}
                              className={`min-h-[48px] p-4 rounded-xl border text-right transition duration-150 flex items-center justify-between text-sm ${
                                answers.debateReaction === opt
                                  ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span>{opt}</span>
                              {answers.debateReaction === opt && <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-2.5">
                          هل تتوقع النجاح الحقيقي في دراسة الفلسفة هذا العام؟ ولماذا؟
                        </label>
                        <textarea
                          rows={3}
                          value={answers.expectSuccess}
                          onChange={(e) => handleTextChange('expectSuccess', e.target.value)}
                          onPaste={(e) => {
                            e.preventDefault();
                            addViolation('محاولة لصق النصوص');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            addViolation('محاولة لصق النصوص');
                          }}
                          onBeforeInput={(e: any) => {
                            const inputType = e.nativeEvent?.inputType;
                            if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') {
                              e.preventDefault();
                              addViolation('محاولة لصق النصوص');
                            }
                          }}
                          placeholder="نعم لأنني أحب الكتابة، أو لا لأنني أجد التعبير صعباً، أو أخاف من صرامة التصحيح..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-slate-800 text-base focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        ></textarea>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation Actions below cards */}
              <div className="flex justify-between items-center mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-slate-100 gap-2.5 sm:gap-4">
                <button
                  type="button"
                  disabled={loading}
                  onClick={step === 0 ? onBackToHome : prevStep}
                  className="flex-1 sm:flex-initial min-h-[48px] py-3 px-4 sm:px-6 rounded-xl border border-slate-200 font-bold text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 flex items-center justify-center gap-1 sm:gap-1.5"
                >
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{step === 0 ? 'إلغاء واسترجاع' : 'السابق'}</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={nextStep}
                  className="flex-[1.3] sm:flex-initial min-h-[48px] py-3 px-5 sm:px-8 bg-blue-600 text-white rounded-xl font-bold text-xs sm:text-sm hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition duration-150 flex items-center justify-center gap-1 sm:gap-1.5 focus:ring-4 focus:ring-blue-500/10 shadow-lg shadow-blue-500/10"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>جاري المعالجة...</span>
                    </>
                  ) : (
                    <>
                      <span>{step === maxStep ? 'تقديم وتحليل المعطيات 🤖' : 'التالي'}</span>
                      <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StudentSimulator
        isOpen={isSimulatorOpen}
        mode="modal"
        title={activeSession?.title || 'استمارة تشخيص تمثلات الفلسفة'}
        description={
          activeSession?.formTitle
            ? `معاينة الاستمارة المخصصة: ${activeSession.formTitle}`
            : 'معاينة تفاعلية كاملة لجميع أسئلة الجلسة التشخيصية كما تظهر للتلميذ.'
        }
        questions={simulatorQuestions}
        sessionMeta={{
          sessionId: activeSession?.sessionId,
          institution: activeSession?.institution,
          province: activeSession?.province,
          level: activeSession?.level,
          stream: activeSession?.stream,
          classNumber: activeSession?.classNumber,
        }}
        initialAnswers={simulatorInitialAnswers}
        returnLabel="إغلاق والعودة إلى الاستمارة"
        onClose={() => setIsSimulatorOpen(false)}
      />
    </div>
  );
}
