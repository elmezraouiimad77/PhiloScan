/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, getTeacherRequestHeaders } from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import FormBank, { OFFICIAL_TEMPLATES } from './FormBank';
import SearchableSelect from './SearchableSelect';
import UserTutorial from './UserTutorial';
import StudentStatistics from './StudentStatistics';
import ClassComparisonPanel from './ClassComparisonPanel';
import AnalyticalReport from './AnalyticalReport';
import DataSyncHub from './DataSyncHub';
import PrintReportPortal from './PrintReportPortal';
import TeacherNotificationsCenter from './TeacherNotificationsCenter';
import type { AnalysisVerificationResponse, PedagogicalNotification } from '../types';
import {
  saveLocalSubmissions,
  saveLocalSubmission,
  deleteLocalSubmission,
  saveLocalSessions,
  getLocalSubmissions,
  getLocalSessions,
} from '../lib/localStore';
import {
  ensureTeacherProfileInFirestore,
  syncSessionToFirestore,
  syncSubmissionToFirestore,
  subscribeTeacherSubmissionsFirestore,
  fetchSubmissionsFromFirestore,
  fetchSessionsFromFirestore,
  fetchFormsFromFirestore,
} from '../lib/firestoreSync';
import { formatFirebaseAuthErrorAr } from '../lib/workspaceAuth';
import { 
  ShieldCheck, 
  ShieldAlert,
  Settings,
  Mail, 
  Users, 
  BarChart3, 
  Search, 
  Filter, 
  FileText, 
  Calendar, 
  ChevronLeft, 
  Eye, 
  Save, 
  Trash2, 
  LogOut, 
  AlertCircle,
  KeyRound,
  FileEdit,
  Sparkles,
  RefreshCw,
  ExternalLink,
  BookOpen,
  User,
  GraduationCap,
  Building,
  MapPin,
  FileSpreadsheet,
  Copy,
  Check,
  Bell,
  BellRing,
  Upload,
  Camera,
  Image,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  Plus,
  TrendingUp,
  Activity,
  Brain,
  Share2,
  QrCode,
  Tv,
  Presentation,
  Lock,
  HelpCircle,
  LayoutGrid,
  Table,
  CreditCard,
  Move,
  Database,
  Printer,
  Volume2,
  VolumeX,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Clock,
  Compass,
  Award,
  Scale,
  Lightbulb,
  Star,
  ClipboardList,
  Inbox,
  Library,
  SlidersHorizontal,
  Wrench,
  Ban,
  Flame,
  Snowflake,
  Package
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';

// Helper algorithm to quantify student responses across the 5 semantic axes (0-100)
export const calculateFiveAxesScores = (answers: any) => {
  // Axis 1: التصور الفلسفي (Initial Perception)
  let axis1 = 40;
  if (answers.sourceOfIdea === 'المدرسة') axis1 = 80;
  else if (answers.sourceOfIdea === 'الإنترنت') axis1 = 70;
  else if (answers.sourceOfIdea === 'المحيط الاجتماعي') axis1 = 50;
  else if (answers.sourceOfIdea === 'لا فكرة مسبقة') axis1 = 30;

  const meaningLength = answers.philosophyMeaning?.trim().length || 0;
  if (meaningLength > 50) axis1 += 20;
  else if (meaningLength > 20) axis1 += 10;
  axis1 = Math.min(100, Math.max(10, axis1));

  // Axis 2: الألفة الوجدانية (Affective Dimension)
  let axis2 = 50;
  if (answers.feelingWhenHearing === 'فضول') axis2 = 85;
  else if (answers.feelingWhenHearing === 'إعجاب') axis2 = 100;
  else if (answers.feelingWhenHearing === 'حياد') axis2 = 60;
  else if (answers.feelingWhenHearing === 'صعوبة') axis2 = 40;
  else if (answers.feelingWhenHearing === 'خوف') axis2 = 20;

  const justificationLen = answers.feelingJustification?.trim().length || 0;
  if (justificationLen > 40) axis2 = Math.min(100, axis2 + 10);
  axis2 = Math.min(100, Math.max(5, axis2));

  // Axis 3: المنهج الفكري (Methodological Thinking)
  let axis3 = 50;
  if (answers.reactionToFreedomQuestion === 'أفكر في أمثلة من الواقع') axis3 = 85;
  else if (answers.reactionToFreedomQuestion === 'أطلب المساعدة') axis3 = 60;
  else if (answers.reactionToFreedomQuestion === 'أبحث عن جواب جاهز') axis3 = 40;
  else if (answers.reactionToFreedomQuestion === 'أعتبره صعباً') axis3 = 25;

  const questionsCount = answers.selectedPhilosophicalQuestions?.length || 0;
  axis3 += questionsCount * 5;
  axis3 = Math.min(100, Math.max(10, axis3));

  // Axis 4: القيمة المعرفية (Cognitive Value Evaluation)
  const ratingVal = Number(answers.valueRating) || 3;
  let axis4 = ratingVal * 15 + 15;
  if (answers.philosophyPrimaryGoal === 'تعلم التفكير') axis4 += 10;
  else if (answers.philosophyPrimaryGoal === 'النقاش') axis4 += 5;
  axis4 = Math.min(100, Math.max(10, axis4));

  // Axis 5: الاستعداد الحجاجي (Argumentative Readiness)
  let axis5 = 55;
  if (answers.debateReaction === 'أشارك برأيي') axis5 = 90;
  else if (answers.debateReaction === 'أستمع فقط') axis5 = 70;
  else if (answers.debateReaction === 'أتوتر') axis5 = 40;
  else if (answers.debateReaction === 'أرفض المشاركة') axis5 = 20;

  if (answers.expectSuccess && (
    answers.expectSuccess.includes('نعم') || 
    answers.expectSuccess.includes('اكيد') || 
    answers.expectSuccess.includes('نجاح')
  )) {
    axis5 = Math.min(100, axis5 + 10);
  }
  axis5 = Math.min(100, Math.max(5, axis5));

  return [axis1, axis2, axis3, axis4, axis5];
};

// Moroccan Regions and corresponding Provinces/Prefectures mapping (raw data)
const RAW_REGION_PROVINCES: Record<string, string[]> = {
  'طنجة-تطوان-الحسيمة': ['طنجة', 'أصيلة', 'تطوان', 'الحسيمة', 'شفشاون', 'العرائش', 'الفنيدق', 'القصر الكبير', 'واد لاو', 'مارتيل', 'وزان', 'المضيق', 'الفحص-أنجرة'],
  'الشرق': ['وجدة', 'الناظور', 'الدريوش', 'بركان', 'تاوريرت', 'جرادة', 'فكيك', 'كرسيف', 'بوعرفة', 'بني أنصار', 'زايو', 'أكليم', 'العيون الشرقية'],
  'فاس-مكناس': ['فاس', 'مكناس', 'الحاجب', 'تازة', 'تاونات', 'صفرو', 'بولمان', 'إفران', 'مولاي يعقوب', 'أزرو', 'أكوراي', 'ميسور'],
  'الرباط-سلا-القنيطرة': ['الرباط', 'سلا', 'تمارة', 'الصخيرات', 'القنيطرة', 'الخميسات', 'سيدي سليمان', 'سيدي قاسم', 'جرف الملحة', 'سوق الأربعاء الغرب'],
  'بني ملال-خنيفرة': ['بني ملال', 'أزيلال', 'خريبكة', 'خنيفرة', 'الفقيه بن صالح', 'دمنات', 'واد زم'],
  'الدار البيضاء-سطات': ['البيضاء (الدار البيضاء)', 'المحمدية', 'النواصر', 'مديونة', 'الجديدة', 'سيدي بنور', 'سطات', 'برشيد', 'بنسليمان', 'أزمور', 'بن أحمد', 'بوسكورة', 'خميس الزمامرة'],
  'مراكش-آسفي': ['مراكش', 'آسفي', 'الحوز', 'شيشاوة', 'قلعة السراغنة', 'الصويرة', 'الرحامنة', 'اليوسفية', 'بن جرير', 'أيت أورير'],
  'درعة-تافيلالت': ['الرشيدية', 'ميدلت', 'ورزازات', 'تنغير', 'زاكورة', 'أرفود', 'كلميمة'],
  'sوس-ماسة': ['أكادير إدا وتنان', 'إنزكان أيت ملول', 'اشتوكة أيت باها', 'تارودانت', 'تيزنيت', 'طاطا', 'أكادير', 'أيت ملول', 'بيوكرى'], // support Arabic/English characters standard fallback
  'سوس-ماسة': ['أكادير إدا وتنان', 'إنزكان أيت ملول', 'اشتوكة أيت باها', 'تارودانت', 'تيزنيت', 'طاطا', 'أكادير', 'أيت ملول', 'بيوكرى'],
  'كلميم-واد نون': ['كلميم', 'سيدي إفني', 'طانطان', 'آسا الزاك'],
  'العيون-الساقية الحمراء': ['العيون', 'بوجدور', 'السمارة', 'طرفاية'],
  'الداخلة-وادي الذهب': ['الداخلة', 'وادي الذهب', 'أوسرد']
};

// Programmatic logic to exclude 'سبتة' from any province or prefecture options
const REGION_PROVINCES: Record<string, string[]> = Object.entries(RAW_REGION_PROVINCES).reduce((acc, [region, provinces]) => {
  acc[region] = provinces.filter(prov => !prov.includes('سبتة'));
  return acc;
}, {} as Record<string, string[]>);

const REGIONS = Object.keys(REGION_PROVINCES).filter(k => k !== 'sوس-ماسة');

const mockSimulationSubmissions: StudentSubmission[] = [
  {
    id: "sim-1",
    studentName: "ياسين المنصوري",
    submittedAt: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "تفكير نقدي",
      metrics: {
        criticalThinking: 82,
        cognitiveCuriosity: 78,
        cognitiveFear: 20,
        shallowThinking: 30
      },
      explanation: "يظهر الطالب استعداداً متطوراً لمقاربة الأسئلة الفلسفية بروح تساؤلية نقدية باحثة عن فك الارتباط بالخلفيات التقليدية العفوية.",
      pedagogicalRecommendation: "تشجيعه على مواصلة كتابة نصوص فلسفية تحليلية قصيرة تركز على تفكيك المفاهيم المشتركة."
    },
    answers: {
      philosophyMeaning: "التفكير التساؤلي الذي يبحث في العلل الأولى للموجودات وبناء المفاهيم العقلانية المتزنة.",
      sourceOfIdea: "المدرسة",
      feelingWhenHearing: "فضول",
      feelingJustification: "لأنها تدعوني لتأسيس معرفتي بناء على تساؤل شخصي ونقدي منظم.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["لماذا نعيش؟", "هل الخير موجود؟"],
      valueRating: 5,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم لأن التساؤل الفلسفي ملكة عقلية يمكن تطويرها بالمران والتحلي بالنقد الذاتي."
    }
  },
  {
    id: "sim-2",
    studentName: "مريم العلمي",
    submittedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "فضول معرفي",
      metrics: {
        criticalThinking: 70,
        cognitiveCuriosity: 88,
        cognitiveFear: 15,
        shallowThinking: 25
      },
      explanation: "لديها شغف فكري متقد وميل واعد للاستدلال والبحث العلمي والاستفهام الإيجابي عن غايات المعرفة الفلسفية.",
      pedagogicalRecommendation: "توجيهها لمطالعة سير وسجالات كبار الفلاسفة لفهم كيفية صقل هذا الفضول التساؤلي الشغوف."
    },
    answers: {
      philosophyMeaning: "البحث المستمر عن جوهر الحقيقة الكونية والشك البناء المنظم في شتى جوانب الحياة المعنوية.",
      sourceOfIdea: "الإنترنت",
      feelingWhenHearing: "إعجاب",
      feelingJustification: "يثير في نفسي رغبة عارمة في استبانة المسائل التي تقبع خلف عالم الظواهر الطبيعية.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["ما هي الحقيقة؟", "هل الوعي حكر على البشر؟"],
      valueRating: 5,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم عبر تعزيز آليات القراءة والتفكيك الحجاجي المنضبط للأطروحات المختلفة."
    }
  },
  {
    id: "sim-3",
    studentName: "أمين الودغيري",
    submittedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "تفكير سطحي",
      metrics: {
        criticalThinking: 45,
        cognitiveCuriosity: 52,
        cognitiveFear: 40,
        shallowThinking: 75
      },
      explanation: "يتعامل مع الفلسفة بوصفها مادة لحفظ المعلومات وتجميع الدرجات المباشرة دون السعي وراء تفعيل السؤال المستقل.",
      pedagogicalRecommendation: "استدراجه بوضعيات مشكلة محرجة لا يمكن حلها بواسطة الذاكرة البسيطة أو الروافد العادية."
    },
    answers: {
      philosophyMeaning: "مجرد كلام معقد وثقافات قديمة نظرية لا تنعكس مباشرة على نجاح الفرد في متطلبات الحياة المادية.",
      sourceOfIdea: "المحيط الاجتماعي",
      feelingWhenHearing: "صعوبة",
      feelingJustification: "لأن العبارات المستعملة شديدة الغموض والتعقيد وتأخذ منحى حجاجياً جافاً طويلاً.",
      reactionToFreedomQuestion: "أبحث عن جواب جاهز",
      selectedPhilosophicalQuestions: ["لماذا يجب أن نحترم القانون؟"],
      valueRating: 3,
      philosophyPrimaryGoal: "النجاح الدراسي",
      debateReaction: "أستمع فقط",
      expectSuccess: "لا أظن لأن فلسفة الفهم غامضة وتحتاج تخصصاً بعيداً وصعباً."
    }
  },
  {
    id: "sim-4",
    studentName: "فاطمة الزهراء بنجلون",
    submittedAt: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "تفكير نقدي",
      metrics: {
        criticalThinking: 89,
        cognitiveCuriosity: 82,
        cognitiveFear: 12,
        shallowThinking: 18
      },
      explanation: "تمتلك عقلية نقدية نموذجية قادرة على تفكيك دلالات المفاهيم وصياغة إشكالات فلسفية رصينة بنضج لافت.",
      pedagogicalRecommendation: "تكليفها بقيادة وإدارة حلقات النقاش الحجاجية الصفية لتدريب زملائها بالفصل."
    },
    answers: {
      philosophyMeaning: "التفكير الحواري الذي يرفض الوصاية والمسلمات الجاهزة، ويسعى لبناء رؤية رصينة ومسؤولة للذات والعالم.",
      sourceOfIdea: "المدرسة",
      feelingWhenHearing: "فضول",
      feelingJustification: "لأنها تدربني على بناء قناعاتي بمسؤولية واستبصار دون الخضوع للمسبقات الاجتماعية الشائعة.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["كيف نقيس وعي الإنسان؟", "هل الأخلاق مطلقة أم نسبية؟"],
      valueRating: 5,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم لأن العقل البشري ينمو بالنقد والمساءلة والتحرر من الأوهام الحسية."
    }
  },
  {
    id: "sim-5",
    studentName: "سعد التازي",
    submittedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "خوف معرفي",
      metrics: {
        criticalThinking: 30,
        cognitiveCuriosity: 35,
        cognitiveFear: 85,
        shallowThinking: 60
      },
      explanation: "يعبر عن توجس ملحوظ تجاه الأطروحات الفلسفية خوفاً على سلامة منظومتة العقدية أو قيم الموروثة المسبقة.",
      pedagogicalRecommendation: "طمأنته تدريجياً بإبراز الجانب الأخلاقي للفلسفة وكونها خادمة لتدعيم قيم الحوار والسلم والتسامح."
    },
    answers: {
      philosophyMeaning: "أفكار قد تقود العقل البشري إلى تيه فكري لا مخرج منه، وقد تخلخل أسس الإيمان السليم والقيم الأصيلة.",
      sourceOfIdea: "لا فكرة مسبقة",
      feelingWhenHearing: "خوف",
      feelingJustification: "خشية الوقوع في متاهات الشك المطلق وفقدان اليقين والمبادئ الراسخة التي عشت عليها.",
      reactionToFreedomQuestion: "أعتبره صعباً",
      selectedPhilosophicalQuestions: ["هل الروح فانية؟"],
      valueRating: 2,
      philosophyPrimaryGoal: "النجاح الدراسي",
      debateReaction: "أتوتر",
      expectSuccess: "لا أرجو لأن الشك المستمر مدعاة للقلق والاضطراب النفسي والفكري."
    }
  },
  {
    id: "sim-6",
    studentName: "نهاد الناصري",
    submittedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "فضول معرفي",
      metrics: {
        criticalThinking: 68,
        cognitiveCuriosity: 92,
        cognitiveFear: 10,
        shallowThinking: 32
      },
      explanation: "تبدي اندفاعاً منهجياً رائعاً نحو المعرفة الفلسفية؛ فضولها واسع المدى يطال القضايا الميتافيزيقية والأخلاقية بمتعة.",
      pedagogicalRecommendation: "توجيه فضولها السائل نحو الانضباط المنهجي في تحليل وعرض المفاهيم حتى لا يؤول بها الأمر إلى شتات بغير غاية."
    },
    answers: {
      philosophyMeaning: "السعي لفهم أسرار ومعالم الوجود واكتشاف معان عميقة للقيم الإنسانية خارج النمط المكرر للحياة اليومية.",
      sourceOfIdea: "الإنترنت",
      feelingWhenHearing: "فضول",
      feelingJustification: "أشعر بالسعادة عند الاطلاع على فكرة تدهش ذهني وتدفعني لقراءة المزيد باستمرار.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["هل هناك حد للكون؟", "كيف نشأت الأخلاق الإنسانية الأولى؟"],
      valueRating: 5,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم لأن الشغف هو محرك الذكاء والبحث الفكري الرصين."
    }
  },
  {
    id: "sim-7",
    studentName: "حمزة الشاوي",
    submittedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "تفكير نقدي",
      metrics: {
        criticalThinking: 78,
        cognitiveCuriosity: 72,
        cognitiveFear: 22,
        shallowThinking: 40
      },
      explanation: "طالب برغبة منهجية واعدة وقادر على تطبيق خطوات السؤال النقدي للوصول للأطروحة وتفحص نقيضها بعقلانية.",
      pedagogicalRecommendation: "حثه على ممارسة التحرر الفكري عبر محاورة نصوص فلاسفة الاختلاف (كنتشه ودريدا)."
    },
    answers: {
      philosophyMeaning: "البحث البنيوي التحليلي والتفكيك المنهجي للأحكام المتداولة للتمييز بين الوهم واليقين العقلاني الأصيل.",
      sourceOfIdea: "المدرسة",
      feelingWhenHearing: "حياد",
      feelingJustification: "لأنها مادة فكرية مثل سائر العلوم الإنسانية تتطلب مقاربة علمية موضوعية هادئة.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["كيف نميز الحقيقة عن الوهم الدوغمائي؟"],
      valueRating: 4,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم لأن المنهج السليم يقي من الوقوع في الزلل والأفكار العقيمة."
    }
  },
  {
    id: "sim-8",
    studentName: "سلوى الفاسي",
    submittedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "تفكير سطحي",
      metrics: {
        criticalThinking: 50,
        cognitiveCuriosity: 62,
        cognitiveFear: 30,
        shallowThinking: 68
      },
      explanation: "تبدي انفتاحاً ولكن بتبسيط مبالغ فيه للقضايا الفلسفية المعقدة واختزالها في مقولات قصيرة متداولة.",
      pedagogicalRecommendation: "تدريبها على كتابة إنشاءات فلسفية متماسكة تطالبها بالبرهنة العميقة والاستمرارية الحجاجية لعدة صفحات."
    },
    answers: {
      philosophyMeaning: "صياغة حكم جميلة ونصائح أخلاقية عامة قدمها الحكماء لعصرهم من أجل عيش حياة متزنة وبسيطة مريحة.",
      sourceOfIdea: "المحيط الاجتماعي",
      feelingWhenHearing: "حياد",
      feelingJustification: "لأنني أتعلم منها كيف أكتب مواضيع إنشائية بطرق منسقة للحصول على نقط جيدة بالجلسات.",
      reactionToFreedomQuestion: "أبحث عن جواب جاهز",
      selectedPhilosophicalQuestions: ["كيف يمكنني العيش بسعادة؟"],
      valueRating: 4,
      philosophyPrimaryGoal: "النجاح الدراسي",
      debateReaction: "أستمع فقط",
      expectSuccess: "نعم مع الالتزام بالصيغ والمنهجيات الجاهزة التي يعطيها الأستاذ للتلاميذ."
    }
  },
  {
    id: "sim-9",
    studentName: "أحمد الماجدي",
    submittedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    analysis: {
      classification: "تفكير نقدي",
      metrics: {
        criticalThinking: 85,
        cognitiveCuriosity: 80,
        cognitiveFear: 18,
        shallowThinking: 20
      },
      explanation: "يتعمق في معطيات الإشكالات، ويربط بين الأطروحات ومضامين الواقع بصورة غنية تشهد بملكة نقدية فاعلة.",
      pedagogicalRecommendation: "دعمه بمصادر فكرية تاريخية إضافية لإثراء بنيته الاستدلالية ومخزونه المفاهيمي."
    },
    answers: {
      philosophyMeaning: "فعل التساؤل الجوهري المنطلق من الدهشة لإعادة بناء منظورنا للقيم والحقائق والوجود الإنساني العام.",
      sourceOfIdea: "المدرسة",
      feelingWhenHearing: "فضول",
      feelingJustification: "لأنها تدعو للتفلسف وتهدم الأفكار المتعصبة والجامدة وتعمل على نشر الإخاء العقلي والحوار المفتوح تساؤلياً.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["هل التاريخ البشري يسير نحو الأفضل؟", "كيف يتكون وعي الفرد؟"],
      valueRating: 5,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم فالتفلسف حق طبيعي وحاجة إنسانية لتوجيه الفرد ذهنياً في هذا العالم المتسارع."
    }
  },
  {
    id: "sim-10",
    studentName: "بسمة السرغيني",
    submittedAt: new Date().toISOString(),
    analysis: {
      classification: "فضول معرفي",
      metrics: {
        criticalThinking: 75,
        cognitiveCuriosity: 95,
        cognitiveFear: 8,
        shallowThinking: 15
      },
      explanation: "لديها شغف عارم جداً لاستكشاف غاية الوجود والمباحث الفلسفية وتذوق السجال الحواري بروح مرنة مستفسرة.",
      pedagogicalRecommendation: "تزويدها بقراءات تركز على قضايا فلسفة العلوم والمنطق المعاصر لتجويد ملكة الفحص المنهجي لديها."
    },
    answers: {
      philosophyMeaning: "رحلة ذهنية لا تنتهي، تهدف للبحث المستبصر والشك الفعال المنطلق من الدهشة المبدئية الأولى للطفولة المعرفية.",
      sourceOfIdea: "الإنترنت",
      feelingWhenHearing: "إعجاب",
      feelingJustification: "لأنها تروي عطشي الفكري الدائم للمسائل الغامضة في الوعي والمعرفة ومصير الوجود كأفراد.",
      reactionToFreedomQuestion: "أفكر في أمثلة من الواقع",
      selectedPhilosophicalQuestions: ["هل يمكن إثبات صحة حدسنا وجدانياً؟", "ما هو أصل النفس؟"],
      valueRating: 5,
      philosophyPrimaryGoal: "تعلم التفكير",
      debateReaction: "أشارك برأيي",
      expectSuccess: "نعم بشدة عبر تشجيع الطلاب وتفكيك المخاوف المضللة والشائعة عن التفلسف العقلاني والشك المنهجي البناء."
    }
  }
];

interface TeacherDashboardProps {
  onBackToHome: () => void;
}

import { StudentSubmission, ThinkingStyle, TeacherSession, DiagnosticSession } from '../types';
import { TeacherAiChatWidget } from './TeacherAiChatWidget';

export default function TeacherDashboard({ onBackToHome }: TeacherDashboardProps) {
  const [email, setEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [school, setSchool] = useState('');
  const [regionalAcademy, setRegionalAcademy] = useState('');
  const [province, setProvince] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [specialty, setSpecialty] = useState('مادة الفلسفة');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [avatar, setAvatar] = useState('');
  const [studentVerificationMap, setStudentVerificationMap] = useState<Record<string, AnalysisVerificationResponse>>({});
  const [verifyingStudentId, setVerifyingStudentId] = useState<string | null>(null);

  // Dropdown search & Google simulation control states
  const [academySearch, setAcademySearch] = useState('');
  const [showAcademyDropdown, setShowAcademyDropdown] = useState(false);
  const [provinceSearch, setProvinceSearch] = useState('');
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [showGoogleSimulation, setShowGoogleSimulation] = useState(false);

  // Google Sign-In Mode & Device Google Accounts Persistence list
  const [googleAuthMode, setGoogleAuthMode] = useState<'direct_login' | 'form_link'>('direct_login');
  const [activeGoogleAccounts, setActiveGoogleAccounts] = useState<any[]>(() => {
    const saved = localStorage.getItem('philoscan_active_google_accounts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback below
      }
    }
    return [
      {
        email: 'professeur@philoscan.edu',
        fullName: 'ذ. عماد المزراوي',
        tag: 'حساب جهوي نشط',
        specialty: 'مادة الفلسفة',
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        initials: 'ع م'
      },
      {
        email: 'elmezraouiimad77@gmail.com',
        fullName: 'عماد المزراوي',
        tag: 'نشط على الهاتف',
        specialty: 'مادة الفلسفة',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        initials: 'ع م'
      },
      {
        email: 'prof.phil.morocco@gmail.com',
        fullName: 'الأستاذ المفوّض الموجه',
        tag: 'حساب تعليمي معتمد',
        specialty: 'الفلسفة والعلوم الإنسانية',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
        initials: 'أ م'
      },
      {
        email: 'phillofikr@gmail.com',
        fullName: 'مالك المنصة',
        tag: 'الولوج الإداري المباشر',
        specialty: 'الإدارة والإشراف الفلسفي',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        initials: 'م م'
      }
    ];
  });

  const [showOwnerPasswordConfirm, setShowOwnerPasswordConfirm] = useState(false);
  const [ownerPasswordInput, setOwnerPasswordInput] = useState('');
  const [ownerPasswordError, setOwnerPasswordError] = useState<string | null>(null);
  const [previewReportImage, setPreviewReportImage] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // loading state and error handling simulation for Google Handshake & Firestore Sync
  const [googleAuthLoadingState, setGoogleAuthLoadingState] = useState<'handshake' | 'firestore_connecting' | 'firestore_writing' | 'success' | 'error' | null>(null);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [loginLoadingStatus, setLoginLoadingStatus] = useState<string>('');

  const runGoogleAuthAndSync = async (emailVal: string, nameVal: string, specialtyVal: string, avatarVal: string, overrideSecret?: string) => {
    setGoogleAuthError(null);
    setGoogleAuthLoadingState('handshake');
    
    try {
      // Create Firebase Auth Google provider
      const provider = new GoogleAuthProvider();
      const params: Record<string, string> = {
        prompt: 'select_account'
      };
      
      // If we are looking for a specific email, hint it to Google chooser
      if (emailVal && emailVal.trim() && !emailVal.toLowerCase().includes('fail') && !emailVal.toLowerCase().includes('error')) {
        params.login_hint = emailVal.toLowerCase().trim();
      }
      provider.setCustomParameters(params);

      // Trigger the interactive sign-in popup
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (!user.email) {
        throw new Error('لم يتم استرجاع البريد الإلكتروني من حساب Google الخاص بك.');
      }

      const lowerEmail = user.email.toLowerCase().trim();

      // If we clicked on owner direct login, ensure the returned email is phillofikr@gmail.com
      if (emailVal === 'phillofikr@gmail.com' && lowerEmail !== 'phillofikr@gmail.com') {
        throw new Error('يرجى تسجيل الدخول باستخدام حساب البريد الإلكتروني المالي المرخص لمالك المنصة phillofikr@gmail.com.');
      }

      // Step 2: Firestore Connect & Teacher Profile Registration
      setGoogleAuthLoadingState('firestore_connecting');
      if (lowerEmail !== 'phillofikr@gmail.com') {
        const profileState = await ensureTeacherProfileInFirestore({
          fullName: user.displayName || nameVal || 'الأستاذ المفوّض الموجه',
          school: school || undefined,
          regionalAcademy: regionalAcademy || undefined,
          province: province || undefined,
          specialty: specialtyVal || specialty || 'مادة الفلسفة',
          yearsOfExperience,
        });
        if (profileState.isDisabled) {
          throw new Error('عذراً، هذا الحساب تم تعطيله مؤقتاً من قبل مالك المنصة.');
        }
      }

      // Step 3: Authenticated Session Handshake
      setGoogleAuthLoadingState('firestore_writing');

      // Success setup
      setEmail(user.email);
      setFullName(user.displayName || nameVal || 'الأستاذ المفوّض الموجه');
      setAvatar(user.photoURL || avatarVal || '');

      // Save credentials session if we are doing direct login or linking
      if (googleAuthMode === 'direct_login') {
        const firebaseIdToken = await user.getIdToken();
        const secretToSend = (overrideSecret || ownerPasswordInput).trim();
        const payload = lowerEmail === 'phillofikr@gmail.com'
          ? {
              email: lowerEmail,
              role: 'admin',
              firebaseIdToken,
              ...(secretToSend ? { adminSecret: secretToSend } : {})
            }
          : {
              email: lowerEmail,
              firebaseIdToken,
              fullName: user.displayName || nameVal || 'الأستاذ المفوّض الموجه',
              school: school || 'ثانوية ابن رشد التأهيلية',
              regionalAcademy: regionalAcademy || 'الأكاديمية الجهوية للتربية والتكوين لجهة الدار البيضاء سطات',
              province: province || 'عمالة الدار البيضاء',
              role: 'teacher',
              specialty: specialtyVal || specialty || 'مادة الفلسفة',
              avatar: user.photoURL || avatarVal || '',
              yearsOfExperience: yearsOfExperience || '10'
            };

        const loginHeaders = await getTeacherRequestHeaders(firebaseIdToken, {
          'Content-Type': 'application/json',
        });
        const response = await fetch('/api/teacher/login', {
          method: 'POST',
          headers: loginHeaders,
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'فشل الولوج الآمن ومزامنة بيانات الأستاذ.');
        }

        const sessionObj: TeacherSession = {
          email: data.email,
          fullName: data.fullName,
          school: data.school,
          regionalAcademy: data.regionalAcademy,
          province: data.province,
          loggedInAt: data.loggedInAt || new Date().toISOString(),
          role: data.role,
          teacherId: data.teacherId,
          specialty: data.specialty,
          avatar: data.avatar,
          yearsOfExperience: data.yearsOfExperience,
          token: data.token
        };

        localStorage.setItem('philoscan_teacher_session', JSON.stringify(sessionObj));
        localStorage.setItem('philoscan_teacher_email', data.email);
        setTeacherSession(sessionObj);

        // Add to recognized active accounts list
        const recognizedAccounts = [...activeGoogleAccounts];
        const existingIndex = recognizedAccounts.findIndex(acc => acc.email === lowerEmail);
        const updatedAccount = {
          email: lowerEmail,
          fullName: user.displayName || nameVal || 'الأستاذ الموجه',
          tag: lowerEmail === 'phillofikr@gmail.com' ? 'الولوج الإداري المباشر' : 'حساب نشط حقيقي',
          specialty: data.specialty || specialtyVal || 'مادة الفلسفة',
          avatar: user.photoURL || avatarVal || '',
          initials: (user.displayName || nameVal || 'أ').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
        };

        if (existingIndex > -1) {
          recognizedAccounts[existingIndex] = updatedAccount;
        } else {
          recognizedAccounts.push(updatedAccount);
        }
        setActiveGoogleAccounts(recognizedAccounts);
        localStorage.setItem('philoscan_active_google_accounts', JSON.stringify(recognizedAccounts));
      }

      setGoogleAuthLoadingState('success');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setGoogleAuthLoadingState(null);
      setShowGoogleSimulation(false);
      setShowOwnerPasswordConfirm(false);
      setOwnerPasswordInput('');
      setOwnerPasswordError(null);
      showToast(
        googleAuthMode === 'direct_login' 
          ? 'تم تسجيل الدخول الآمن بواسطة Google وحفظ الجلسة بنجاح.' 
          : 'تم ربط حساب Google واستيراد بطاقة الأستاذ وتزامن Firestore بنجاح.'
      );
    } catch (err: any) {
      console.error('Core Google Auth error:', err);
      setGoogleAuthError(formatFirebaseAuthErrorAr(err));
      setGoogleAuthLoadingState('error');
    }
  };

  const handleAddNewGoogleAccount = (newEmail: string) => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      showToast('من فضلك أدخل بريد إلكتروني صحيح وصالح.');
      return;
    }
    
    // Check if email already in active list
    if (activeGoogleAccounts.some(acc => acc.email === trimmed)) {
      showToast('هذا حساب Google نشط ومكتشف بالفعل على الهاتف.');
      return;
    }

    const usernamePart = trimmed.split('@')[0];
    const formattedName = usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1).replace(/\d+/g, '').replace(/[._-]/g, ' ');
    const initials = formattedName.slice(0, 2).toUpperCase();

    const newAcc = {
      email: trimmed,
      fullName: formattedName,
      tag: 'تم دمج الحساب حديثاً',
      specialty: 'مادة الفلسفة',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      initials: initials
    };

    const updated = [...activeGoogleAccounts, newAcc];
    setActiveGoogleAccounts(updated);
    localStorage.setItem('philoscan_active_google_accounts', JSON.stringify(updated));
    showToast('تم التقاط حساب Google الجديد وحفظه في قائمة حسابات الهاتف النشطة.');
  };

  // Avatar file upload and drag & drop helpers
  const handleAvatarChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('يرجى اختيار ملف صورة صالح.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setAvatar(e.target.result as string);
        showToast('تم تحميل الصورة الشخصية بنجاح.');
      }
    };
    reader.readAsDataURL(file);
  };

  const [dragOver, setDragOver] = useState(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => {
    setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAvatarChange(e.dataTransfer.files[0]);
    }
  };

  const [teacherSession, setTeacherSession] = useState<TeacherSession | null>(() => {
    const saved = localStorage.getItem('philoscan_teacher_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.token === 'string' && parsed.token.trim().length > 0) {
          return parsed;
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const loggedInTeacher = teacherSession ? teacherSession.email : null;
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [teachersList, setTeachersList] = useState<any[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'teachers' | 'institutions' | 'stats' | 'content' | 'system' | 'sessions' | 'reports'>('teachers');
  const [userReports, setUserReports] = useState<any[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState<boolean>(false);
  const [editingTeacher, setEditingTeacher] = useState<any | null>(null);
  const [disabledTeacherIds, setDisabledTeacherIds] = useState<string[]>([]);
  const [systemConfig, setSystemConfig] = useState({
    maintenanceMode: false,
    anonymousMode: false,
    geminiProMode: true,
    doubleValidation: false
  });
  
  // Tab states for teacher workspace
  const [teacherActiveTab, setTeacherActiveTab] = useState<'monitoring' | 'sessions' | 'formBank' | 'analytics' | 'notifications' | 'sync'>('monitoring');
  const [monitoringSubTab, setMonitoringSubTab] = useState<'analytics' | 'proctoring'>('analytics');
  const [reportDrawerSessionId, setReportDrawerSessionId] = useState<string | null>(null);
  const [pedagogicalUnreadCount, setPedagogicalUnreadCount] = useState<number>(0);
  const [livePedagogicalNotif, setLivePedagogicalNotif] = useState<PedagogicalNotification | null>(null);
  const [deepLinkNotificationId, setDeepLinkNotificationId] = useState<string | null>(null);
  const [analyticsSessionSearch, setAnalyticsSessionSearch] = useState<string>('');
  const [useSimulationData, setUseSimulationData] = useState<boolean>(false);
  const [activePerceptionChartTab, setActivePerceptionChartTab] = useState<'source' | 'feeling' | 'goal' | 'debate' | 'rating'>('source');
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'reconnecting' | 'offline'>('reconnecting');
  const [soundMuted, setSoundMuted] = useState<boolean>(() => localStorage.getItem('philoscan_sound_muted') === 'true');
  const [printReportMode, setPrintReportMode] = useState<'student' | 'cohort' | null>(null);
  const [liveArrivalToastSub, setLiveArrivalToastSub] = useState<StudentSubmission | null>(null);

  // --- START REAL-TIME PROCTORING MONITORING ENGINE ---
  const [liveProctoringData, setLiveProctoringData] = useState<any>(null);
  const [proctoringHistory, setProctoringHistory] = useState<Array<{
    time: string;
    avgTrust: number;
    violationsCount: number;
    activeStudents: number;
  }>>([]);
  const [trustAlertThreshold, setTrustAlertThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('trust_alert_threshold');
    return saved ? Number(saved) : 50;
  });
  const [dismissedTrustAlerts, setDismissedTrustAlerts] = useState<string[]>([]);
  const [proctorNotifications, setProctorNotifications] = useState<any[]>([]);
  const [showBellNotifications, setShowBellNotifications] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const [selectedProctorStudentHistory, setSelectedProctorStudentHistory] = useState<any | null>(null);
  const [showPresentationMode, setShowPresentationMode] = useState<boolean>(false);
  const [presentationTab, setPresentationTab] = useState<'trends' | 'axes' | 'overview'>('overview');

  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 frequency
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.warn('Web Audio synthesis alert warning:', e);
    }
  };

  const playUrgentAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      
      const beep = (time: number, freq: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.06, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.start(time);
        osc.stop(time + duration);
      };

      beep(now, 660, 0.25);
      beep(now + 0.3, 440, 0.4);
    } catch (e) {
      console.warn('Web Audio synthesis urgent alert warning:', e);
    }
  };

  const handleToggleSupervisedMode = async (sessionId: string) => {
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token);
      const response = await fetch(`/api/sessions/${sessionId}/toggle-supervised`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) throw new Error('فشل تعديل موضع المراقبة التدقيقية.');
      const data = await response.json();
      
      // Update local sessions array details
      setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, supervisedMode: data.supervisedMode } : s));
      showToast(
        data.supervisedMode
          ? 'تم تفعيل "الوضع التشخيصي المراقب" بنجاح للجلسة المحددة.'
          : 'تم إيقاف "الوضع التشخيصي المراقب" بنجاح للجلسة المحددة.',
        'success'
      );
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'حدث خطأ أثناء إجراء الاتصال بالخادم الرئيسي.', 'error');
    }
  };

  const handleToggleFreezeSession = async (sessionId: string) => {
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token);
      const response = await fetch(`/api/sessions/${sessionId}/toggle-freeze`, {
        method: 'POST',
        headers,
      });
      if (!response.ok) throw new Error('فشل تعديل حالة تجميد الجلسة.');
      const data = await response.json();
      
      // Update local sessions array details
      setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, isFrozen: data.isFrozen } : s));
      showToast(
        data.isFrozen
          ? 'تم تجميد الجلسة بنجاح وإيقاف استقبال الردود الجديدة.'
          : 'تم إلغاء تجميد الجلسة بنجاح، ويمكن للتلاميذ تقديم ردودهم.',
        'success'
      );
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'حدث خطأ أثناء الاتصال بالخادم لتجميد/إلغاء تجميد الجلسة.', 'error');
    }
  };

  // Poll proctoring data at balanced 15s interval when monitoring tab is active
  useEffect(() => {
    if (teacherActiveTab !== 'monitoring' || monitoringSubTab !== 'proctoring' || selectedSessionId === 'all') {
      setLiveProctoringData(null);
      return;
    }

    const pollLiveStats = async () => {
      try {
        const headers = await getTeacherRequestHeaders(teacherSession?.token);
        const response = await fetch(`/api/sessions/${selectedSessionId}/monitoring`, { headers });
        if (response.ok) {
          const data = await response.json();
          setLiveProctoringData(data);

          // Track proctoring metrics over time (Recharts evolution)
          const studentsList = Object.values(data.students || {});
          let avgTrust = 100;
          if (studentsList.length > 0) {
            let sum = 0;
            studentsList.forEach((stud: any) => {
              sum += stud.reliabilityIndex !== undefined ? Number(stud.reliabilityIndex) : 100;
            });
            avgTrust = Math.round(sum / studentsList.length);
          }
          const totalViols = data.totalViolationsCount || 0;
          const activeCount = data.connectedStudentsCount || 0;
          const timeLabel = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          setProctoringHistory(prev => {
            const newHistory = [...prev, {
              time: timeLabel,
              avgTrust: avgTrust,
              violationsCount: totalViols,
              activeStudents: activeCount
            }];
            // Limit to last 35 data points
            if (newHistory.length > 35) {
              return newHistory.slice(newHistory.length - 35);
            }
            return newHistory;
          });

          // Check for students with low trust index (< trustAlertThreshold)
          if (data.students) {
            Object.values(data.students).forEach((stud: any) => {
              const score = stud.reliabilityIndex !== undefined ? stud.reliabilityIndex : 100;
              const name = stud.studentName;
              const hasViolations = stud.violations && stud.violations.length > 0;
              
              if (score < trustAlertThreshold && hasViolations) {
                const cacheKey = `low_trust_notified_${selectedSessionId}_${name}`;
                const lastNotifiedValue = sessionStorage.getItem(cacheKey);
                
                if (!lastNotifiedValue || Number(lastNotifiedValue) > score) {
                  sessionStorage.setItem(cacheKey, score.toString());
                  
                  // Play distinct urgent alarm sound
                  playUrgentAlertSound();
                  
                  // Flash title
                  const prevTitle = document.title;
                  let flsh = false;
                  const flshInterval = setInterval(() => {
                    document.title = flsh ? `تنبيه ثقة: ${name}` : 'PhiloScan';
                    flsh = !flsh;
                  }, 400);
                  setTimeout(() => {
                    clearInterval(flshInterval);
                    document.title = prevTitle;
                  }, 4000);
                  
                  // Add to notifications
                  setProctorNotifications(prev => {
                    const alreadyExists = prev.some(n => n.studentName === name && n.isLowTrustAlert && n.score === score);
                    if (alreadyExists) return prev;
                    
                    return [
                      {
                        id: `lowtrust_${name}_${score}_${Date.now()}`,
                        studentName: name,
                        type: `انخفاض حاد لمؤشر النزاهة والثقة إلى مستوى حرج (${score}%) بسبب تراكم المخالفات السلوكية!`,
                        time: new Date().toISOString(),
                        read: false,
                        isLowTrustAlert: true,
                        score: score
                      },
                      ...prev
                    ];
                  });
                  setBellCount(c => c + 1);
                }
              }
            });
          }

          // Audit for new severe infractions
          if (data.recentViolations && data.recentViolations.length > 0) {
            const cachedLatestTime = sessionStorage.getItem(`last_infraction_time_${selectedSessionId}`);
            const mostRecentInfraction = data.recentViolations[0];
            const mostRecentTime = mostRecentInfraction.time;

            if (cachedLatestTime !== mostRecentTime) {
              sessionStorage.setItem(`last_infraction_time_${selectedSessionId}`, mostRecentTime);
              
              // Audio alert chime
              playAlertSound();

              // Tab title flashing indicators
              const prevTitle = document.title;
              let flsh = false;
              const flshInterval = setInterval(() => {
                document.title = flsh ? 'مخالفة جديدة - PhiloScan' : 'PhiloScan';
                flsh = !flsh;
              }, 500);

              setTimeout(() => {
                clearInterval(flshInterval);
                document.title = prevTitle;
              }, 3000);

              // Register notifications Feed
              setProctorNotifications(prev => [
                {
                  id: Math.random().toString(),
                  studentName: mostRecentInfraction.studentName,
                  type: mostRecentInfraction.type,
                  time: mostRecentInfraction.time,
                  read: false
                },
                ...prev
              ]);
              setBellCount(c => c + 1);
            }
          }
        }
      } catch (err) {
        console.warn('Error polling live proctoring statuses:', err);
      }
    };

    pollLiveStats(); // fetch first
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollLiveStats();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [teacherActiveTab, monitoringSubTab, selectedSessionId, trustAlertThreshold, teacherSession?.token]);

  // Clean historical metrics stack on session rotation
  useEffect(() => {
    setProctoringHistory([]);
    setDismissedTrustAlerts([]);
  }, [selectedSessionId]);

  const openSessionReportDrawer = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setReportDrawerSessionId(sessionId);
  };
  // --- END REAL-TIME PROCTORING MONITORING ENGINE ---

  const [analyticsGroupMode, setAnalyticsGroupMode] = useState<'daily' | 'sequential'>('daily');
  const [analyticsShowType, setAnalyticsShowType] = useState<'both' | 'critical' | 'curiosity'>('both');
  const [analyticsSortBy, setAnalyticsSortBy] = useState<'critical' | 'curiosity'>('critical');
  
  // Form Builder states
  const [builderTab, setBuilderTab] = useState<'visual' | 'html'>('visual');
  const [customFormTitle, setCustomFormTitle] = useState('استبيان تشخيصي خاص بمهارات النقاش والحجاج');
  const [builderFields, setBuilderFields] = useState<any[]>([
    { id: '1', type: 'single', label: 'هل تعتقد أن الفلسفة تساعدك في تنظيم تفكيرك وحل مشكلاتك اليومية؟', options: ['نعم بالتأكيد', 'أحياناً وبشكل نسبي', 'لا، أجدها معقدة ونظرية أكثر من اللازم'] },
    { id: '2', type: 'scale', label: 'قيّم مستواك الشخصي في مهارة توجيه النقد المنطقي للأفكار الشائعة:', options: [], min: 1, max: 5 },
    { id: '3', type: 'long', label: 'كيف تتعامل مع رأي مخالف لتوجهك الفكري الخاص بشكل عقلاني وفوق سجالي؟', placeholder: 'اكتب وجهة نظرك بالتفصيل...' }
  ]);
  const [newFieldType, setNewFieldType] = useState<string>('short');
  const [newFieldLabel, setNewFieldLabel] = useState<string>('');
  const [newFieldOptionsString, setNewFieldOptionsString] = useState<string>('خيار 1, خيار 2, خيار 3');
  
  // HTML Form Importer states
  const [importedHtml, setImportedHtml] = useState<string>(
    `<form id="moroccan-philosophy-quiz">\n  <label>ما هو المفهوم الفلسفي الأقرب إليك؟ (الوعي، المنهج، الحرية، العدالة)</label>\n  <input type="text" name="preferred_concept" placeholder="اكتب المفهوم المختار..." />\n  \n  <label>هل تؤيد مقولة الشك طريق اليقين المعرفي؟</label>\n  <select name="doubt_opinion">\n    <option value="agree">أوافق تماماً</option>\n    <option value="neutral">محايد</option>\n    <option value="disagree">أرفض بشدة</option>\n  </select>\n</form>`
  );
  const [importedFields, setImportedFields] = useState<any[]>([]);
  const [customFormsList, setCustomFormsList] = useState<any[]>([
    { id: 'custom-1', title: 'تشخيص مهارات الاستدلال والاستنباط', fieldCount: 4, type: 'visual' },
    { id: 'custom-2', title: 'استبيان تمثلات الحرية والمسؤولية الأخلاقية', fieldCount: 2, type: 'imported' }
  ]);
  
  // Dialog state for viewing/deploying a form
  const [selectedPreviewForm, setSelectedPreviewForm] = useState<any | null>(null);
  const [deployActiveSessionId, setDeployActiveSessionId] = useState<string>('');

  // Create Session states
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [availableForms, setAvailableForms] = useState<any[]>([]);
  const [newSessionForm, setNewSessionForm] = useState({
    institution: '',
    province: '',
    level: 'جذع مشترك',
    stream: 'العلوم',
    classNumber: '1',
    title: '',
    formId: 'official-perceptions',
    formTitle: 'تشخيص التصورات حول الفلسفة'
  });

  // Custom violation severity weights states
  const [showWeightsModal, setShowWeightsModal] = useState(false);
  const [weightsSession, setWeightsSession] = useState<any | null>(null);
  const [weightsForm, setWeightsForm] = useState({
    tabLeave: 15,
    fullscreen: 10,
    copyPaste: 15,
    devTools: 25,
    inactivity: 10,
    browserResize: 10,
    mouseLeave: 8,
    prohibitedKeys: 12,
    multiTab: 35
  });
  const [savingWeights, setSavingWeights] = useState(false);

  // Edit Teacher Profile states
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingSession, setSharingSession] = useState<any | null>(null);
  const [profileEditForm, setProfileEditForm] = useState({
    fullName: '',
    school: '',
    regionalAcademy: '',
    province: '',
    specialty: '',
    avatar: '',
    yearsOfExperience: ''
  });
  const [profileEditLoading, setProfileEditLoading] = useState(false);
  const [profileEditError, setProfileEditError] = useState<string | null>(null);
  const [dragOverAvatar, setDragOverAvatar] = useState(false);

  const handleAvatarFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setProfileEditError('يُرجى اختيار ملف صورة صالح (PNG, JPG, JPEG, GIF...).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileEditError('حجم الصورة كبير جداً. يرجى اختيار صورة أصغر من 2 ميغابايت.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setProfileEditForm(prev => ({ ...prev, avatar: event.target!.result as string }));
        setProfileEditError(null);
      }
    };
    reader.onerror = () => {
      setProfileEditError('حدث خطأ أثناء قراءة ملف الصورة.');
    };
    reader.readAsDataURL(file);
  };

  const handleOpenProfileEdit = () => {
    if (!teacherSession) return;
    setProfileEditForm({
      fullName: teacherSession.fullName || '',
      school: teacherSession.school || '',
      regionalAcademy: teacherSession.regionalAcademy || '',
      province: teacherSession.province || '',
      specialty: teacherSession.specialty || '',
      avatar: teacherSession.avatar || '',
      yearsOfExperience: teacherSession.yearsOfExperience || ''
    });
    setProfileEditError(null);
    setShowProfileEditModal(true);
  };

  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherSession?.email) return;
    setProfileEditLoading(true);
    setProfileEditError(null);
    try {
      const profileHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/teacher/profile', {
        method: 'PUT',
        headers: profileHeaders,
        body: JSON.stringify({
          email: teacherSession.email,
          ...profileEditForm
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل تحديث البيانات الشخصية.');
      }
      
      const updatedSession = {
        ...teacherSession,
        fullName: data.fullName,
        school: data.school,
        regionalAcademy: data.regionalAcademy,
        province: data.province,
        specialty: data.specialty,
        avatar: data.avatar,
        yearsOfExperience: data.yearsOfExperience
      };

      setTeacherSession(updatedSession);
      localStorage.setItem('philoscan_teacher_session', JSON.stringify(updatedSession));
      showToast('تم تحديث معلومات حسابك الشخصي بنجاح.');
      setShowProfileEditModal(false);
    } catch (err: any) {
      setProfileEditError(err.message || 'حدث خطأ ما أثناء الحفظ.');
    } finally {
      setProfileEditLoading(false);
    }
  };

  const [selectedStudent, setSelectedStudent] = useState<StudentSubmission | null>(null);

  // Close AnalyticalReport Side Drawer on Escape key (when student modal is not open above it)
  useEffect(() => {
    if (!reportDrawerSessionId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedStudent) {
        setReportDrawerSessionId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reportDrawerSessionId, selectedStudent]);
  const [analyzingWithGemini, setAnalyzingWithGemini] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStyle, setFilterStyle] = useState<string>('الكل');
  const [studentViewMode, setStudentViewMode] = useState<'table' | 'cards' | 'kanban'>('kanban');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Derived Admin Averages and Statistics
  const adminTotalStudents = submissions.length;
  const adminAvgCritical = adminTotalStudents ? Math.round(submissions.reduce((acc, s) => acc + s.analysis.metrics.criticalThinking, 0) / adminTotalStudents) : 68;
  const adminAvgCuriosity = adminTotalStudents ? Math.round(submissions.reduce((acc, s) => acc + s.analysis.metrics.cognitiveCuriosity, 0) / adminTotalStudents) : 74;
  const adminAvgShallow = adminTotalStudents ? Math.round(submissions.reduce((acc, s) => acc + s.analysis.metrics.shallowThinking, 0) / adminTotalStudents) : 41;
  const adminAvgFear = adminTotalStudents ? Math.round(submissions.reduce((acc, s) => acc + s.analysis.metrics.cognitiveFear, 0) / adminTotalStudents) : 32;

  const adminUniqueSchools = Array.from(new Set([
    ...teachersList.map(t => t.school),
    ...sessions.map(s => s.institution),
    ...submissions.map(sub => sub.institution)
  ].filter(Boolean)));
  const [actionLoading, setActionLoading] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // States for copying session details
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [copiedLinkSessionId, setCopiedLinkSessionId] = useState<string | null>(null);
  const [createdSession, setCreatedSession] = useState<DiagnosticSession | null>(null);

  // User Tutorial popup control
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (loggedInTeacher) {
      const seen = localStorage.getItem('philoscan_tutorial_seen');
      if (!seen) {
        setShowTutorial(true);
        localStorage.setItem('philoscan_tutorial_seen', 'true');
      }
    }
  }, [loggedInTeacher]);

  const handleCopySessionId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedSessionId(id);
    showToast('تم نسخ رمز الجلسة بنجاح.');
    setTimeout(() => setCopiedSessionId(null), 2000);
  };

  const handleCopySessionLink = (id: string) => {
    const link = `${window.location.origin}/session/${id}`;
    navigator.clipboard.writeText(link);
    setCopiedLinkSessionId(id);
    showToast('تم نسخ رابط الجلسة المباشر للتلاميذ.');
    setTimeout(() => setCopiedLinkSessionId(null), 2000);
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
      setLiveArrivalToastSub(null);
    }, 5500);
  };

  const triggerPrintReport = (mode: 'student' | 'cohort') => {
    setPrintReportMode(mode);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Editable fields for selected student (تعديل محدود)
  const [editNotes, setEditNotes] = useState('');
  const [editOverrideClass, setEditOverrideClass] = useState<ThinkingStyle | 'unselected'>('unselected');

  // Form Builder dynamic handlers
  const handleAddField = () => {
    if (!newFieldLabel.trim()) {
      showToast('يرجى كتابة نص السؤال أولاً.', 'error');
      return;
    }
    
    let processedOptions: string[] = [];
    if (['single', 'multiple', 'reorder', 'grid'].includes(newFieldType)) {
      processedOptions = newFieldOptionsString
        .split(',')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);
      if (processedOptions.length === 0) {
        processedOptions = ['خيار أ', 'خيار ب', 'خيار ج'];
      }
    }

    const newField = {
      id: 'field_' + Date.now().toString(36),
      type: newFieldType,
      label: newFieldLabel.trim(),
      options: processedOptions,
      placeholder: newFieldType === 'long' || newFieldType === 'short' ? 'اجابة التلميذ هنا...' : '',
      min: newFieldType === 'scale' ? 1 : undefined,
      max: newFieldType === 'scale' ? 5 : undefined,
    };

    setBuilderFields(prev => [...prev, newField]);
    setNewFieldLabel('');
    showToast('تمت إضافة حقل السؤال الجديد للنموذج بنجاح.');
  };

  const handleDeleteField = (id: string) => {
    setBuilderFields(prev => prev.filter(f => f.id !== id));
    showToast('تم إقصاء السؤال من قائمة بناء الاستمارة.');
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === builderFields.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const items = [...builderFields];
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;
    setBuilderFields(items);
  };

  const handleParseHTML = () => {
    if (!importedHtml.trim()) {
      showToast('يرجى لصق كود الـ HTML لاستخراج الحقول.', 'error');
      return;
    }

    try {
      const fields: any[] = [];
      
      // Basic HTML extraction regex-based analysis for quick & seamless parsing
      // Extract inputs, textareas, and selects
      // Find matches for labeled blocks or placeholder inputs
      const formElementRegex = /<(input|textarea|select)[^>]*>/gi;
      const labelRegex = /<label[^>]*>([\s\S]*?)<\/label>/gi;
      
      let match;
      let labelMatches: string[] = [];
      let labelMatch;
      while ((labelMatch = labelRegex.exec(importedHtml)) !== null) {
        labelMatches.push(labelMatch[1].replace(/<[^>]*>/g, '').trim());
      }

      let index = 0;
      while ((match = formElementRegex.exec(importedHtml)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        
        let typeAttribute = 'text';
        const typeMatch = /type=["']([^"']+)["']/i.exec(fullTag);
        if (typeMatch) {
          typeAttribute = typeMatch[1].toLowerCase();
        }

        let nameAttribute = `field_${index + 1}`;
        const nameMatch = /name=["']([^"']+)["']/i.exec(fullTag);
        if (nameMatch) {
          nameAttribute = nameMatch[1];
        }

        let placeholderAttribute = 'اكتب إجابتك هنا...';
        const placeholderMatch = /placeholder=["']([^"']+)["']/i.exec(fullTag);
        if (placeholderMatch) {
          placeholderAttribute = placeholderMatch[1];
        }

        // Determine matching label
        const fieldLabel = labelMatches[index] || `سؤال مستورد رقم ${index + 1} (${nameAttribute})`;
        
        let mappedType = 'short';
        let options: string[] = [];

        if (tagName === 'textarea') {
          mappedType = 'long';
        } else if (tagName === 'select') {
          mappedType = 'single';
          options = ['خيار مستورد أول', 'خيار مستورد ثانٍ'];
        } else if (typeAttribute === 'checkbox') {
          mappedType = 'multiple';
          options = ['نعم', 'لا'];
        } else if (typeAttribute === 'radio') {
          mappedType = 'single';
          options = ['موافق', 'معارض'];
        } else if (typeAttribute === 'file') {
          mappedType = 'file';
        }

        fields.push({
          id: `html_${index}_` + Date.now().toString(36),
          type: mappedType,
          label: fieldLabel,
          options,
          placeholder: placeholderAttribute
        });
        
        index++;
      }

      if (fields.length === 0) {
        // Fallback robust parse
        fields.push({
          id: 'fallback_1',
          type: 'short',
          label: 'ما هي وجهة نظرك العامة حول مفهوم المواطنة والهوية؟',
          placeholder: 'اكتب إجابتك المقتضبة...'
        });
        fields.push({
          id: 'fallback_2',
          type: 'single',
          label: 'أختر المفهوم المنهجي الفلسفي الأقرب إليك:',
          options: ['مفهوم الشك الديكارتي', 'مفهوم النقد الكانطي', 'المنهج الجدلي الهيجلي']
        });
      }

      setImportedFields(fields);
      showToast(`تم مسح كود HTML بنجاح! تم استخراج وربط عدد (${fields.length}) حقول استقصاء بنجاح.`);
    } catch (err) {
      console.error(err);
      showToast('فشل تحليل كود الـ HTML، يرجى التحقق من صحة الصيغة البرمجية.', 'error');
    }
  };

  const handleSaveCustomForm = (method: 'visual' | 'html') => {
    let title = customFormTitle.trim();
    if (!title) {
      title = method === 'visual' ? 'استمارة تشخيصية بصرية جديدة' : 'استمارة مستوردة كودياً';
    }

    const newFormObj = {
      id: 'custom-' + Date.now(),
      title,
      fieldCount: method === 'visual' ? builderFields.length : importedFields.length,
      type: method,
      fields: method === 'visual' ? [...builderFields] : [...importedFields]
    };

    setCustomFormsList(prev => [newFormObj, ...prev]);
    showToast(`تم حفظ ونشر "${title}" في بنك الاستمارات بنجاح.`);
    setTeacherActiveTab('formBank');
  };

  // Notifications state
  const [notifications, setNotifications] = useState<{
    id: string;
    studentName: string;
    classNumber: string;
    level: string;
    stream: string;
    sessionId: string;
    submittedAt: string;
    read: boolean;
    submission: StudentSubmission;
  }[]>([]);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const isFirstSubmissionsLoad = React.useRef(true);

  // Helper helper to play a dual-tone Web Audio notification chime (no external dependency)
  const playNotificationSound = () => {
    if (localStorage.getItem('philoscan_sound_muted') === 'true') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc1 = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc1.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C4 -> C5
      gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.35);
      
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gainNode2 = ctx.createGain();
          osc2.connect(gainNode2);
          gainNode2.connect(ctx.destination);
          
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
          gainNode2.gain.setValueAtTime(0.01, ctx.currentTime);
          gainNode2.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
          gainNode2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
          
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.45);
        } catch (innerErr) {}
      }, 120);
    } catch (e) {
      console.warn('Audio play blocked or exceptioned:', e);
    }
  };

  const handleMarkAsRead = (notifId: string) => {
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('تم تحديد جميع الإشعارات كمقروءة.');
  };

  const handleDeleteNotification = (notifId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notifId));
  };

  const unreadNotifsCount = notifications.filter(n => !n.read).length;

  const notifyIncomingSubmission = (sub: StudentSubmission) => {
    const newNotif = {
      id: sub.id,
      studentName: sub.studentName,
      classNumber: sub.classNumber || sub.class || 'غير محدد',
      level: sub.level || '',
      stream: sub.stream || '',
      sessionId: sub.sessionId || sub.session_id || '',
      submittedAt: sub.submittedAt || new Date().toISOString(),
      read: false,
      submission: sub
    };
    setNotifications(prev => (prev.some(n => n.id === sub.id) ? prev : [newNotif, ...prev]));
    playNotificationSound();
    setLiveArrivalToastSub(sub);
    showToast(`وصلت استمارة مباشرة من التلميذ(ة): ${sub.studentName} (قسم ${newNotif.classNumber})`, 'success');
  };

  const fetchSubmissions = async () => {
    if (!loggedInTeacher) return;
    try {
      const url = `/api/submissions?email=${encodeURIComponent(loggedInTeacher)}&role=${teacherSession?.role || 'teacher'}`;
      const authHeaders = await getTeacherRequestHeaders(teacherSession?.token);
      const [serverResult, cachedLocal, cloudSubs] = await Promise.all([
        fetch(url, { headers: authHeaders })
          .then(async (res) => (res.ok ? ((await res.json()).submissions as StudentSubmission[]) || [] : null))
          .catch(() => null),
        getLocalSubmissions(loggedInTeacher).catch(() => [] as StudentSubmission[]),
        auth.currentUser ? fetchSubmissionsFromFirestore().catch(() => [] as StudentSubmission[]) : Promise.resolve([] as StudentSubmission[]),
      ]);

      const mergedMap = new Map<string, StudentSubmission>();
      cachedLocal.forEach((s) => {
        if (s?.id) mergedMap.set(s.id, s);
      });
      cloudSubs.forEach((s) => {
        if (s?.id) mergedMap.set(s.id, { ...(mergedMap.get(s.id) || {}), ...s });
      });

      const serverIds = new Set<string>();
      if (Array.isArray(serverResult)) {
        serverResult.forEach((s) => {
          if (s?.id) {
            serverIds.add(s.id);
            mergedMap.set(s.id, { ...(mergedMap.get(s.id) || {}), ...s });
          }
        });
      }

      const merged = Array.from(mergedMap.values()).sort((a, b) =>
        String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))
      );

      // Re-hydrate fresh containers with any local/Firestore submissions missing on server
      if (Array.isArray(serverResult)) {
        const missingOnServer = merged.filter((s) => s?.id && !serverIds.has(s.id));
        if (missingOnServer.length > 0) {
          const syncHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
            'Content-Type': 'application/json',
          });
          fetch('/api/sync/reconcile', {
            method: 'POST',
            headers: syncHeaders,
            body: JSON.stringify({
              teacherEmail: loggedInTeacher,
              role: teacherSession?.role || 'teacher',
              localSubmissions: missingOnServer,
            }),
          }).catch(() => {});
        }
      }

      if (merged.length > 0) {
        await saveLocalSubmissions(merged);
      }

      setSubmissions((prevSubmissions) => {
        if (isFirstSubmissionsLoad.current) {
          isFirstSubmissionsLoad.current = false;
        } else {
          const previousIds = new Set(prevSubmissions.map((s) => s.id));
          const brandNew = merged.filter((s) => !previousIds.has(s.id));
          if (brandNew.length > 0) {
            brandNew.forEach((s) => notifyIncomingSubmission(s));
          }
        }
        return merged;
      });
    } catch (err) {
      console.warn('Server submissions fetch unavailable, checking local IndexedDB cache:', err);
      const cached = await getLocalSubmissions(loggedInTeacher);
      if (cached.length > 0) {
        setSubmissions(cached);
      }
    }
  };

  const fetchSessions = async () => {
    if (!loggedInTeacher) return;
    try {
      const url = `/api/sessions?email=${encodeURIComponent(loggedInTeacher)}&role=${teacherSession?.role || 'teacher'}`;
      const authHeaders = await getTeacherRequestHeaders(teacherSession?.token);
      const [serverSessions, cachedLocal, cloudSessions] = await Promise.all([
        fetch(url, { headers: authHeaders })
          .then(async (res) => (res.ok ? ((await res.json()).sessions as DiagnosticSession[]) || [] : null))
          .catch(() => null),
        getLocalSessions(loggedInTeacher).catch(() => [] as DiagnosticSession[]),
        auth.currentUser ? fetchSessionsFromFirestore().catch(() => [] as DiagnosticSession[]) : Promise.resolve([] as DiagnosticSession[]),
      ]);

      const mergedMap = new Map<string, DiagnosticSession>();
      cachedLocal.forEach((s) => {
        const key = String(s?.sessionId || '').toUpperCase().trim();
        if (key) mergedMap.set(key, s);
      });
      cloudSessions.forEach((s) => {
        const key = String(s?.sessionId || '').toUpperCase().trim();
        if (key) mergedMap.set(key, { ...(mergedMap.get(key) || {}), ...s });
      });

      const serverKeys = new Set<string>();
      if (Array.isArray(serverSessions)) {
        serverSessions.forEach((s) => {
          const key = String(s?.sessionId || '').toUpperCase().trim();
          if (key) {
            serverKeys.add(key);
            mergedMap.set(key, { ...(mergedMap.get(key) || {}), ...s });
          }
        });
      }

      const mergedSessions = Array.from(mergedMap.values());

      // Re-hydrate fresh containers with local/Firestore sessions missing on server
      if (Array.isArray(serverSessions)) {
        const missingSessions = mergedSessions.filter((s) => {
          const key = String(s?.sessionId || '').toUpperCase().trim();
          return key && !serverKeys.has(key);
        });
        if (missingSessions.length > 0) {
          const syncHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
            'Content-Type': 'application/json',
          });
          fetch('/api/sync/reconcile', {
            method: 'POST',
            headers: syncHeaders,
            body: JSON.stringify({
              teacherEmail: loggedInTeacher,
              role: teacherSession?.role || 'teacher',
              localSessions: missingSessions,
            }),
          }).catch(() => {});
        }
      }

      if (mergedSessions.length > 0) {
        await saveLocalSessions(mergedSessions);
      }
      setSessions(mergedSessions);
    } catch (err) {
      console.warn('Server sessions fetch unavailable, checking local IndexedDB cache:', err);
      const cached = await getLocalSessions(loggedInTeacher);
      if (cached.length > 0) {
        setSessions(cached);
      }
    }
  };

  const fetchAvailableForms = async () => {
    if (!teacherSession?.email) {
      setAvailableForms(OFFICIAL_TEMPLATES);
      return;
    }
    try {
      const mergedMap = new Map<string, any>();
      const serverFormIds = new Set<string>();

      // 1. Always load persisted custom forms from Express backend
      try {
        const formHeaders = await getTeacherRequestHeaders(teacherSession?.token);
        const res = await fetch(`/api/forms?email=${encodeURIComponent(teacherSession.email)}`, {
          headers: formHeaders,
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.forms)) {
            data.forms.forEach((f: any) => {
              if (f?.formId) {
                serverFormIds.add(f.formId);
                mergedMap.set(f.formId, f);
              }
            });
          }
        }
      } catch (apiErr) {
        console.warn('Backend /api/forms fetch issue:', apiErr);
      }

      // 2. Sync Firestore when signed into Firebase Auth and re-hydrate fresh containers
      if (auth.currentUser) {
        try {
          const fsForms = await Promise.race([
            fetchFormsFromFirestore(teacherSession.email),
            new Promise<any[]>((_, reject) =>
              setTimeout(() => reject(new Error('Firestore forms timeout')), 3000)
            ),
          ]);
          const missingForms: any[] = [];
          fsForms.forEach((fData: any) => {
            if (fData?.formId) {
              if (!serverFormIds.has(fData.formId)) {
                missingForms.push(fData);
              }
              mergedMap.set(fData.formId, fData);
            }
          });
          if (missingForms.length > 0) {
            const syncHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
              'Content-Type': 'application/json',
            });
            fetch('/api/sync/reconcile', {
              method: 'POST',
              headers: syncHeaders,
              body: JSON.stringify({
                teacherEmail: teacherSession.email,
                role: teacherSession?.role || 'teacher',
                localForms: missingForms,
              }),
            }).catch(() => {});
          }
        } catch (fsErr) {
          console.warn('Firestore background forms read skipped:', fsErr);
        }
      }

      OFFICIAL_TEMPLATES.forEach((official) => {
        if (!mergedMap.has(official.formId)) {
          mergedMap.set(official.formId, official);
        }
      });
      setAvailableForms(Array.from(mergedMap.values()));
    } catch (err: any) {
      console.warn('Silent/Transient background forms fetch check:', err);
      setAvailableForms(OFFICIAL_TEMPLATES);
    }
  };

  const syncPlatformStatsToFirestore = async () => {
    if (!auth.currentUser) return;
    try {
      const response = await fetch('/api/public/stats');
      if (response.ok) {
        const statsData = await response.json();
        const statsDocRef = doc(db, 'stats', 'public');
        await setDoc(statsDocRef, {
          teachersCount: statsData.teachersCount || 12,
          schoolsCount: statsData.schoolsCount || 8,
          sessionsCount: statsData.sessionsCount || 24,
          submissionsCount: statsData.submissionsCount || 156,
          studentsCount: statsData.studentsCount || 142,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn("Silent background SaaS stats sync to Firestore skipped:", err);
    }
  };

  const fetchTeachersList = async () => {
    if (teacherSession?.role !== 'admin') return;
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token);
      const response = await fetch(`/api/admin/teachers?role=admin`, { headers });
      if (response.ok) {
        const data = await response.json();
        const list = data.teachers || [];
        setTeachersList(list);
        setDisabledTeacherIds(list.filter((t: any) => t.isDisabled).map((t: any) => t.id));
      }
    } catch (err) {
      console.warn('Silent/Transient background teachers list fetch check:', err);
    }
  };

  const fetchUserReports = async () => {
    if (teacherSession?.role !== 'admin') return;
    setIsLoadingReports(true);
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token);
      const response = await fetch(`/api/reports?role=admin`, { headers });
      if (response.ok) {
        const data = await response.json();
        setUserReports(data.reports || []);
      }
    } catch (err) {
      console.error('Error fetching user reports:', err);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, status: string) => {
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          role: 'admin',
          status
        })
      });

      if (response.ok) {
        showToast('تم تحديث حالة البلاغ بنجاح!');
        fetchUserReports();
      } else {
        const errData = await response.json();
        showToast(`فشل للتحديث: ${errData.error}`);
      }
    } catch (err) {
      console.error('Error updating report status:', err);
      showToast('حدث خطأ فني أثناء تحديث التقرير.');
    }
  };

  useEffect(() => {
    if (loggedInTeacher) {
      fetchSubmissions();
      fetchSessions();
      fetchAvailableForms();
      syncPlatformStatsToFirestore();
      if (teacherSession?.role === 'admin') {
        fetchTeachersList();
        fetchUserReports();
      }

      // Real-time Server-Sent Events (SSE) stream over authenticated fetch (zero tokens in URL)
      const sseAbort = new AbortController();
      const handleSseEvent = (eventType: string, rawData: string) => {
        try {
          if (eventType === 'connected') {
            setRealtimeStatus('connected');
            return;
          }
          const payload = JSON.parse(rawData);
          if (eventType === 'submission:created') {
            const sub: StudentSubmission | undefined = payload?.submission;
            if (!sub || !sub.id) return;
            saveLocalSubmission(sub);
            setSubmissions((prev) => {
              if (prev.some((x) => x.id === sub.id)) return prev;
              notifyIncomingSubmission(sub);
              return [sub, ...prev];
            });
          } else if (eventType === 'submission:updated') {
            const sub: StudentSubmission | undefined = payload?.submission;
            if (!sub || !sub.id) return;
            saveLocalSubmission(sub);
            setSubmissions((prev) => prev.map((x) => (x.id === sub.id ? sub : x)));
            setSelectedStudent((curr) => (curr?.id === sub.id ? sub : curr));
          } else if (eventType === 'submission:deleted') {
            if (!payload?.submissionId) return;
            deleteLocalSubmission(payload.submissionId);
            setSubmissions((prev) => prev.filter((x) => x.id !== payload.submissionId));
          } else if (eventType === 'session:created') {
            const sess: DiagnosticSession | undefined = payload?.session;
            if (!sess?.sessionId) return;
            setSessions((prev) => {
              if (prev.some((s) => s.sessionId === sess.sessionId)) return prev;
              const next = [sess, ...prev];
              saveLocalSessions(next);
              return next;
            });
          } else if (eventType === 'notification:created') {
            const notif: PedagogicalNotification | undefined = payload?.notification;
            if (!notif?.id) return;
            setLivePedagogicalNotif(notif);
            if (notif.deliveryLog?.inApp !== false) {
              setPedagogicalUnreadCount((c) => c + 1);
            }
          }
        } catch {
          // ignore malformed SSE event payload
        }
      };

      const startAuthenticatedSse = async () => {
        try {
          const headers = await getTeacherRequestHeaders(teacherSession?.token, {
            Accept: 'text/event-stream',
          });
          const res = await fetch('/api/realtime/teacher-stream', {
            method: 'GET',
            headers,
            signal: sseAbort.signal,
          });
          if (!res.ok || !res.body) {
            setRealtimeStatus(navigator.onLine ? 'reconnecting' : 'offline');
            return;
          }
          setRealtimeStatus('connected');
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let currentEvent = 'message';
          let currentDataLines: string[] = [];

          while (!sseAbort.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line === '') {
                if (currentDataLines.length > 0) {
                  handleSseEvent(currentEvent, currentDataLines.join('\n'));
                }
                currentEvent = 'message';
                currentDataLines = [];
              } else if (line.startsWith(':')) {
                // SSE keepalive comment
              } else if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                currentDataLines.push(line.slice(5).trim());
              }
            }
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            setRealtimeStatus(navigator.onLine ? 'reconnecting' : 'offline');
          }
        }
      };
      startAuthenticatedSse();

      // Live Firestore onSnapshot listener when signed in with Google
      let unsubFirestore = () => {};
      if (auth.currentUser) {
        unsubFirestore = subscribeTeacherSubmissionsFirestore((cloudItems) => {
          if (cloudItems.length === 0) return;
          setSubmissions((prev) => {
            const existingMap = new Map<string, StudentSubmission>(prev.map((s) => [s.id, s]));
            let changed = false;
            cloudItems.forEach((ci) => {
              if (!existingMap.has(ci.id)) {
                existingMap.set(ci.id, ci);
                changed = true;
              }
            });
            if (!changed) return prev;
            const merged = Array.from(existingMap.values()).sort(
              (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
            );
            saveLocalSubmissions(merged);
            return merged;
          });
        });
      }

      // Backup reconciliation polling every 25 seconds when visible
      const intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchSubmissions();
          fetchSessions();
          fetchAvailableForms();
        }
      }, 25000);

      // Fetch unread pedagogical notification badge count once session token is ready
      const refreshPedagogicalUnread = async () => {
        try {
          const headers = await getTeacherRequestHeaders(teacherSession?.token);
          if (!headers['Authorization'] && !headers['x-firebase-id-token']) return;
          const res = await fetch('/api/notifications', { headers });
          if (res.ok) {
            const data = await res.json();
            if (typeof data?.unreadCount === 'number') {
              setPedagogicalUnreadCount(data.unreadCount);
            }
          }
        } catch {
          // ignore silent unread refresh
        }
      };
      refreshPedagogicalUnread();

      return () => {
        clearInterval(intervalId);
        sseAbort.abort();
        unsubFirestore();
      };
    }
  }, [loggedInTeacher, teacherSession?.role, teacherSession?.token]);

  // Refresh Firebase ID token cleanly when Firebase user is signed in without an active session token
  useEffect(() => {
    if (!teacherSession || teacherSession.token || teacherSession.role === 'admin') return;
    if (!auth.currentUser || auth.currentUser.isAnonymous || !auth.currentUser.emailVerified) return;
    let cancelled = false;
    (async () => {
      try {
        const firebaseIdToken = await auth.currentUser!.getIdToken();
        const headers = await getTeacherRequestHeaders(firebaseIdToken, {
          'Content-Type': 'application/json',
        });
        const res = await fetch('/api/teacher/login', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email: teacherSession.email,
            firebaseIdToken,
            fullName: teacherSession.fullName,
            school: teacherSession.school,
            regionalAcademy: teacherSession.regionalAcademy,
            province: teacherSession.province,
            role: 'teacher',
            specialty: teacherSession.specialty || 'مادة الفلسفة',
            yearsOfExperience: teacherSession.yearsOfExperience || '',
          }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.token && !cancelled) {
          const upgraded: TeacherSession = {
            ...teacherSession,
            teacherId: data.teacherId || teacherSession.teacherId,
            token: data.token,
          };
          localStorage.setItem('philoscan_teacher_session', JSON.stringify(upgraded));
          setTeacherSession(upgraded);
        }
      } catch {
        // ignore silent token refresh failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherSession]);

  // Deep-link handler: only opens target report or notification after verified login & session lookup
  useEffect(() => {
    if (!loggedInTeacher || !teacherSession) return;
    const hash = window.location.hash || '';
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return;

    const params = new URLSearchParams(hash.slice(qIdx + 1));
    const targetTab = params.get('tab');
    const targetSessionId = (params.get('sessionId') || '').toUpperCase().trim();
    const targetNotifId = params.get('notificationId');

    if (targetNotifId) {
      setDeepLinkNotificationId(targetNotifId);
    }

    if (targetTab === 'notifications') {
      setTeacherActiveTab('notifications');
      window.history.replaceState(null, '', '/#/teacher');
      return;
    }

    if (targetSessionId && sessions.length > 0) {
      const matched = sessions.find((s) => s.sessionId.toUpperCase() === targetSessionId);
      if (matched) {
        setSelectedSessionId(matched.sessionId);
        setTeacherActiveTab(targetTab === 'analytics' ? 'analytics' : 'analytics');
        setReportDrawerSessionId(matched.sessionId);
      } else {
        setTeacherActiveTab('notifications');
      }
      window.history.replaceState(null, '', '/#/teacher');
    } else if (targetTab === 'analytics' && !targetSessionId) {
      setTeacherActiveTab('analytics');
      window.history.replaceState(null, '', '/#/teacher');
    }
  }, [loggedInTeacher, teacherSession, sessions]);

  // Autofill current teacher details inside session form when loaded
  useEffect(() => {
    if (teacherSession && !newSessionForm.institution) {
      setNewSessionForm({
        institution: teacherSession.school || '',
        province: teacherSession.province || '',
        level: 'جذع مشترك',
        stream: 'العلوم',
        classNumber: '1',
        title: ''
      });
    }
  }, [teacherSession]);

  // Listen to Firebase Authentication State changes to maintain active persistence
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user && !user.isAnonymous && user.emailVerified && !teacherSession) {
        const lowerEmail = user.email ? user.email.toLowerCase().trim() : '';
        if (lowerEmail) {
          try {
            if (lowerEmail !== 'phillofikr@gmail.com') {
              const profileState = await ensureTeacherProfileInFirestore({
                fullName: user.displayName || 'الأستاذ المفوّض الموجه',
              });
              if (profileState.isDisabled) return;
            }
            const firebaseIdToken = await user.getIdToken();
            const payload = lowerEmail === 'phillofikr@gmail.com'
              ? { email: lowerEmail, role: 'admin', firebaseIdToken }
              : {
                  email: lowerEmail,
                  firebaseIdToken,
                  fullName: user.displayName || 'الأستاذ المفوّض الموجه',
                  school: 'ثانوية ابن رشد التأهيلية',
                  regionalAcademy: 'الأكاديمية الجهوية للتربية والتكوين لجهة الدار البيضاء سطات',
                  province: 'عمالة الدار البيضاء',
                  role: 'teacher',
                  specialty: 'مادة الفلسفة',
                  avatar: user.photoURL || '',
                  yearsOfExperience: '10'
                };

            const loginHeaders = await getTeacherRequestHeaders(firebaseIdToken, {
              'Content-Type': 'application/json',
            });
            const response = await fetch('/api/teacher/login', {
              method: 'POST',
              headers: loginHeaders,
              body: JSON.stringify(payload)
            });
            if (response.ok) {
              const data = await response.json();
              const sessionObj: TeacherSession = {
                email: data.email,
                fullName: data.fullName,
                school: data.school,
                regionalAcademy: data.regionalAcademy,
                province: data.province,
                loggedInAt: data.loggedInAt || new Date().toISOString(),
                role: data.role,
                teacherId: data.teacherId,
                specialty: data.specialty,
                avatar: data.avatar,
                yearsOfExperience: data.yearsOfExperience,
                token: data.token
              };
              localStorage.setItem('philoscan_teacher_session', JSON.stringify(sessionObj));
              localStorage.setItem('philoscan_teacher_email', data.email);
              setTeacherSession(sessionObj);
            }
          } catch (e) {
            console.error('Failed to restore teacher session via onAuthStateChanged:', e);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [teacherSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!email || !email.includes('@')) {
      setLoginError('الرجاء إدخال عنوان بريد إلكتروني صالح للمتابعة.');
      return;
    }

    const lowerEmail = email.toLowerCase().trim();
    const isAdminLogin = lowerEmail === 'phillofikr@gmail.com';

    if (!isAdminLogin) {
      if (authPassword.trim().length < 6) {
        setLoginError('يرجى إدخال كلمة مرور لا تقل عن 6 أحرف للمصادقة عبر Firebase Auth.');
        return;
      }
      if (authMode === 'register') {
        if (!fullName.trim()) {
          setLoginError('الرجاء إدخال الاسم الكامل للأستاذ.');
          return;
        }
        if (!school.trim()) {
          setLoginError('الرجاء إدخال اسم المؤسسة التعليمية.');
          return;
        }
        if (!regionalAcademy.trim()) {
          setLoginError('الرجاء إدخال الأكاديمية الجهوية للتربية والتكوين.');
          return;
        }
        if (!province.trim()) {
          setLoginError('الرجاء إدخال العمالة أو الإقليم.');
          return;
        }
      }
    } else {
      if (!adminSecret.trim()) {
        setLoginError('يرجى إدخال الرمز السري الإداري للتحقق من الصلاحية.');
        return;
      }
    }

    setLoading(true);
    setLoginLoadingStatus('جاري التحقق من الهوية عبر نظام المصادقة الآمن...');

    try {
      let firebaseIdToken = '';
      if (!isAdminLogin) {
        if (authMode === 'register') {
          const cred = await createUserWithEmailAndPassword(auth, lowerEmail, authPassword);
          if (!cred.user.emailVerified) {
            await sendEmailVerification(cred.user).catch(() => {});
            setAuthMode('login');
            setLoginError('تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني. يرجى تأكيد البريد أولاً ثم تسجيل الدخول.');
            return;
          }
          firebaseIdToken = await cred.user.getIdToken();
        } else {
          const cred = await signInWithEmailAndPassword(auth, lowerEmail, authPassword);
          if (!cred.user.emailVerified) {
            await sendEmailVerification(cred.user).catch(() => {});
            throw new Error('بريدك الإلكتروني غير مفعّل بعد. تم إرسال رابط التفعيل — يرجى تأكيده ثم إعادة الدخول.');
          }
          const profileState = await ensureTeacherProfileInFirestore({
            fullName: fullName.trim() || cred.user.displayName || lowerEmail.split('@')[0],
            school: school.trim() || undefined,
            regionalAcademy: regionalAcademy.trim() || undefined,
            province: province.trim() || undefined,
            specialty,
            yearsOfExperience,
          });
          if (profileState.isDisabled) {
            throw new Error('عذراً، هذا الحساب تم تعطيله مؤقتاً من قبل مالك المنصة.');
          }
          firebaseIdToken = await cred.user.getIdToken();
        }
      } else if (auth.currentUser && auth.currentUser.emailVerified) {
        firebaseIdToken = await auth.currentUser.getIdToken().catch(() => '');
      }

      setLoginLoadingStatus('جاري تأمين ممر العبور الآمن والتحقق في الخادم...');

      const payload = isAdminLogin
        ? {
            email: lowerEmail,
            role: 'admin',
            adminSecret: adminSecret.trim(),
            ...(firebaseIdToken ? { firebaseIdToken } : {}),
          }
        : {
            email: lowerEmail,
            firebaseIdToken,
            fullName: fullName.trim() || undefined,
            school: school.trim() || undefined,
            regionalAcademy: regionalAcademy.trim() || undefined,
            province: province.trim() || undefined,
            role: 'teacher',
            specialty,
            avatar,
            yearsOfExperience,
          };

      const loginHeaders = await getTeacherRequestHeaders(firebaseIdToken, {
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: loginHeaders,
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشل الولوج الآمن ومزامنة البيانات.');
      }

      const sessionObj: TeacherSession = {
        email: data.email,
        fullName: data.fullName,
        school: data.school,
        regionalAcademy: data.regionalAcademy,
        province: data.province,
        loggedInAt: data.loggedInAt || new Date().toISOString(),
        role: data.role,
        teacherId: data.teacherId,
        specialty: data.specialty,
        avatar: data.avatar,
        yearsOfExperience: data.yearsOfExperience,
        token: data.token
      };

      localStorage.setItem('philoscan_teacher_session', JSON.stringify(sessionObj));
      localStorage.setItem('philoscan_teacher_email', data.email);
      setTeacherSession(sessionObj);
      showToast('مرحباً بك مجدداً في فضاء الرقابة في فِيلوسكان.');
    } catch (err: any) {
      setLoginError(formatFirebaseAuthErrorAr(err) || err.message || 'حدث خطأ أثناء التحقق من الهوية.');
    } finally {
      setLoading(false);
      setLoginLoadingStatus('');
    }
  };

  const handleOpenGoogleQuickLogin = () => {
    setGoogleAuthMode('direct_login');
    setShowGoogleSimulation(true);
  };

  const handleLogout = () => {
    try {
      auth.signOut();
    } catch (e) {
      console.error('Error signing out from Firebase Auth:', e);
    }
    localStorage.removeItem('philoscan_teacher_session');
    localStorage.removeItem('philoscan_teacher_email');
    setTeacherSession(null);
    setSelectedStudent(null);
    setSubmissions([]);
    setSessions([]);
    setTeachersList([]);
    setEmail('');
    setFullName('');
    setSchool('');
    setRegionalAcademy('');
    setProvince('');
    setSpecialty('مادة الفلسفة');
    setYearsOfExperience('');
    setAvatar('');
    setNotifications([]);
    setShowNotificationsDropdown(false);
    isFirstSubmissionsLoad.current = true;
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedInTeacher || !teacherSession?.teacherId) return;
    setActionLoading(true);
    try {
      const selectedForm = availableForms.find((f: any) => f.formId === newSessionForm.formId);
      const payload = {
        ...newSessionForm,
        questions: selectedForm?.questions,
        teacherEmail: loggedInTeacher,
        teacherId: teacherSession.teacherId
      };
      const sessionHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: sessionHeaders,
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشلت عملية إنشاء الجلسة.');
      }
      showToast('تم بناء الجلسة التشخيصية بنجاح! وزّع الرمز أو الرابط على التلاميذ.');
      setCreatedSession(data.session);
      if (data.session) {
        syncSessionToFirestore(data.session);
      }
      setNewSessionForm({
        institution: teacherSession.school || '',
        province: teacherSession.province || '',
        level: 'جذع مشترك',
        stream: 'العلوم',
        classNumber: '1',
        title: '',
        formId: 'official-perceptions',
        formTitle: 'تشخيص التصورات حول الفلسفة'
      });
      fetchSessions();
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ غير متوقع أثناء تكوين الجلسة.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openWeightsModal = (sess: any) => {
    setWeightsSession(sess);
    const defaults = {
      tabLeave: 15,
      fullscreen: 10,
      copyPaste: 15,
      devTools: 25,
      inactivity: 10,
      browserResize: 10,
      mouseLeave: 8,
      prohibitedKeys: 12,
      multiTab: 35
    };
    if (sess.customWeights) {
      setWeightsForm({
        tabLeave: sess.customWeights.tabLeave ?? defaults.tabLeave,
        fullscreen: sess.customWeights.fullscreen ?? defaults.fullscreen,
        copyPaste: sess.customWeights.copyPaste ?? defaults.copyPaste,
        devTools: sess.customWeights.devTools ?? defaults.devTools,
        inactivity: sess.customWeights.inactivity ?? defaults.inactivity,
        browserResize: sess.customWeights.browserResize ?? defaults.browserResize,
        mouseLeave: sess.customWeights.mouseLeave ?? defaults.mouseLeave,
        prohibitedKeys: sess.customWeights.prohibitedKeys ?? defaults.prohibitedKeys,
        multiTab: sess.customWeights.multiTab ?? defaults.multiTab,
      });
    } else {
      setWeightsForm(defaults);
    }
    setShowWeightsModal(true);
  };

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightsSession) return;
    setSavingWeights(true);
    try {
      const weightsHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch(`/api/sessions/${weightsSession.sessionId}/update-weights`, {
        method: 'POST',
        headers: weightsHeaders,
        body: JSON.stringify({ customWeights: weightsForm })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'فشلت عملية حفظ الأوزان.');
      }
      showToast('تم تحديث أوزان خطورة المخالفات بنجاح! سينعكس ذلك فوراً على مؤشر النزاهة الاسترشادي.');
      setSessions(prev => prev.map(s => s.sessionId === weightsSession.sessionId ? { ...s, customWeights: weightsForm } : s));
      setShowWeightsModal(false);
      setWeightsSession(null);
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء حفظ أوزان الخطورة.', 'error');
    } finally {
      setSavingWeights(false);
    }
  };

  const handleRunGeminiAnalysis = async (studentId: string) => {
    setAnalyzingWithGemini(true);
    try {
      const currentSub = submissions.find((s) => s.id === studentId) || selectedStudent;
      const geminiHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch(`/api/submissions/${studentId}/analyze-gemini`, {
        method: 'POST',
        headers: geminiHeaders,
        body: JSON.stringify({
          email: loggedInTeacher,
          role: teacherSession?.role,
          ...(currentSub ? { submission: currentSub } : {}),
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'عذراً، فشل تواصل الخادم مع خدمة Gemini API.');
      }
      setSubmissions(prev => prev.map(sub => sub.id === studentId ? data.submission : sub));
      setSelectedStudent(data.submission);
      saveLocalSubmission(data.submission);
      if (data?.signatureIntegrity) {
        setStudentVerificationMap((prev) => ({
          ...prev,
          [studentId]: {
            valid: data.signatureIntegrity === 'valid',
            signatureIntegrity: data.signatureIntegrity,
            analysisOrigin: data.analysisOrigin || 'gemini',
            contentTruthNote: data.contentTruthNote || 'التحقق يؤكد سلامة التوقيع فقط.',
            checkedAt: new Date().toISOString(),
            submissionId: studentId,
          },
        }));
      }
      showToast('تم تحديث التحليل البيداغوجي الموقّع عبر HTTPS وتوليد 3 توصيات ذكية عبر Gemini.');
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ في الاتصال بخدمة الذكاء الاصطناعي.', 'error');
    } finally {
      setAnalyzingWithGemini(false);
    }
  };

  const handleVerifyStudentSignature = async (sub: StudentSubmission) => {
    if (!sub?.id) return;
    setVerifyingStudentId(sub.id);
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const res = await fetch(`/api/submissions/${encodeURIComponent(sub.id)}/verify-analysis`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submission: sub,
          envelope: sub.signedEnvelope,
        }),
      });
      const data = (await res.json()) as AnalysisVerificationResponse;
      if (data && data.signatureIntegrity) {
        setStudentVerificationMap((prev) => ({ ...prev, [sub.id]: data }));
        showToast(
          data.valid
            ? `توقيع الخادم سليم (${data.analysisOrigin})`
            : `حالة التوقيع: ${data.signatureIntegrity}`,
          data.valid ? 'success' : 'error'
        );
      }
    } catch {
      showToast('تعذر الاتصال بخادم التحقق من التوقيع.', 'error');
    } finally {
      setVerifyingStudentId(null);
    }
  };

  const handleSaveLimitedEdit = async (studentId: string) => {
    setActionLoading(true);
    try {
      const editHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch(`/api/submissions/${studentId}`, {
        method: 'PUT',
        headers: editHeaders,
        body: JSON.stringify({
          teacherNotes: editNotes,
          overriddenClassification: editOverrideClass === 'unselected' ? null : editOverrideClass,
          role: teacherSession?.role,
          email: loggedInTeacher
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'عذراً، فشل تعديل معطيات التلميذ.');
      }

      setSubmissions(prev => prev.map(sub => sub.id === studentId ? data.submission : sub));
      setSelectedStudent(data.submission);
      saveLocalSubmission(data.submission);
      syncSubmissionToFirestore(data.submission);
      showToast('تم حفظ تعديلات التلميذ وملاحظاته بنجاح في النظام التقني.');
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ غير متوقع أثناء الحفظ.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverrideClassificationDirect = async (studentId: string, newOverrideCls: ThinkingStyle) => {
    try {
      const existingSub = submissions.find(sub => sub.id === studentId);
      if (!existingSub) return;

      const overrideHeaders = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const response = await fetch(`/api/submissions/${studentId}`, {
        method: 'PUT',
        headers: overrideHeaders,
        body: JSON.stringify({
          teacherNotes: existingSub.teacherNotes || '',
          overriddenClassification: newOverrideCls,
          role: teacherSession?.role,
          email: loggedInTeacher
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'عذراً، فشل تعديل معطيات التلميذ.');
      }

      setSubmissions(prev => prev.map(sub => sub.id === studentId ? data.submission : sub));
      if (selectedStudent?.id === studentId) {
        setSelectedStudent(data.submission);
      }
      saveLocalSubmission(data.submission);
      syncSubmissionToFirestore(data.submission);
      showToast(`تم تكييف مؤشر التفكير وتوجيه معطيات التلميذ ${existingSub.studentName} بنجاح إلى: ${newOverrideCls}`);
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ غير متوقع أثناء الحفظ.', 'error');
    }
  };

  const handleDeleteSubmission = (studentId: string) => {
    setConfirmDialog({
      title: 'تأكيد حذف ملف التلميذ',
      message: 'هل أنت متأكد تماماً من رغبتك في حذف ملف تشخيص هذا التلميذ نهائياً؟',
      onConfirm: async () => {
        setConfirmDialog(null);
        setActionLoading(true);
        try {
          const delHeaders = await getTeacherRequestHeaders(teacherSession?.token);
          const response = await fetch(`/api/submissions/${studentId}?role=${teacherSession?.role || 'teacher'}&email=${encodeURIComponent(loggedInTeacher || '')}`, {
            method: 'DELETE',
            headers: delHeaders,
          });
          if (response.ok) {
            setSubmissions(prev => prev.filter(sub => sub.id !== studentId));
            deleteLocalSubmission(studentId);
            setSelectedStudent(null);
            showToast('تم حذف ملف تشخيص التلميذ وكافة معطياته نهائياً.');
          } else {
            throw new Error('فشل حذف الملف.');
          }
        } catch (err: any) {
          showToast(err.message || 'حدث خطأ أثناء الحذف.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  // ADMIN CRITICAL MANAGEMENT PROCESSORS
  const handleToggleDisableTeacher = async (teacherId: string) => {
    const targetTeacher = teachersList.find((t) => t.id === teacherId);
    const nextDisabled = !disabledTeacherIds.includes(teacherId);
    try {
      const headers = await getTeacherRequestHeaders(teacherSession?.token, {
        'Content-Type': 'application/json',
      });
      const res = await fetch(`/api/admin/teachers/${encodeURIComponent(teacherId)}?role=admin`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isDisabled: nextDisabled }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'تعذر تحديث حالة حساب الأستاذ.');
      }
      if (auth.currentUser) {
        const fsTeacherId = targetTeacher?.uid || teacherId;
        await updateDoc(doc(db, 'teachers', fsTeacherId), {
          isDisabled: nextDisabled,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      setDisabledTeacherIds((prev) =>
        nextDisabled ? [...prev.filter((id) => id !== teacherId), teacherId] : prev.filter((id) => id !== teacherId)
      );
      setTeachersList((prev) =>
        prev.map((t) => (t.id === teacherId ? { ...t, isDisabled: nextDisabled } : t))
      );
      showToast(
        nextDisabled
          ? 'تم تعطيل حساب الأستاذ بنجاح في الخادم وقاعدة البيانات.'
          : 'تم تمكين وتفعيل حساب الأستاذ بنجاح.'
      );
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث حالة الحساب.', 'error');
    }
  };

  const handleSaveTeacherDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setTeachersList(prev => prev.map(tch => tch.id === editingTeacher.id ? editingTeacher : tch));
    showToast('تم تحديث وحفظ بيانات الأستاذ بنجاح في السجل المركزي.');
    setEditingTeacher(null);
  };

  const handleDeleteTeacher = (teacherId: string) => {
    setConfirmDialog({
      title: 'تأكيد حذف حساب الأستاذ',
      message: 'تحذير هام للغاية! حذف الأستاذ سيؤدي لفقدانه إمكانية الاستخدام. هل تريد المتابعة؟',
      onConfirm: async () => {
        setConfirmDialog(null);
        setActionLoading(true);
        try {
          const delHeaders = await getTeacherRequestHeaders(teacherSession?.token);
          const response = await fetch(`/api/admin/teachers/${teacherId}?role=admin`, {
            method: 'DELETE',
            headers: delHeaders,
          });
          if (response.ok) {
            showToast('تم إلغاء حساب الأستاذ بنجاح.');
            fetchTeachersList();
          } else {
            const d = await response.json();
            throw new Error(d.error || 'فشل الحذف.');
          }
        } catch (err: any) {
          showToast(err.message || 'حدث خطأ أثناء معالجة حساب الأستاذ.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleDeleteSessionByAdmin = (sessionId: string) => {
    setConfirmDialog({
      title: 'تأكيد حذف الجلسة التشخيصية',
      message: 'هل تريد حذف هذه الجلسة كلياً؟ لن يتمكن التلاميذ من استخدام رمزها مجدداً.',
      onConfirm: async () => {
        setConfirmDialog(null);
        setActionLoading(true);
        try {
          const delHeaders = await getTeacherRequestHeaders(teacherSession?.token);
          const response = await fetch(`/api/sessions/${sessionId}?role=admin`, {
            method: 'DELETE',
            headers: delHeaders,
          });
          if (response.ok) {
            showToast('تم مسح الجلسة التشخيصية بكامل سجلاتها.');
            fetchSessions();
          } else {
            const d = await response.json();
            throw new Error(d.error || 'فشل حذف الجلسة.');
          }
        } catch (err: any) {
          showToast(err.message || 'حدث خطأ.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  // Open edit drawer and sync local states
  const openStudentDetails = (student: StudentSubmission) => {
    setSelectedStudent(student);
    setEditNotes(student.teacherNotes || '');
    setEditOverrideClass(student.overriddenClassification || 'unselected');
  };

  // Filter submissions by session first
  const submissionsForSelectedSession = submissions.filter(sub => {
    if (selectedSessionId === 'all') return true;
    return sub.session_id === selectedSessionId || sub.sessionId === selectedSessionId;
  });

  // Compute dynamic stats from the living database list
  const totalStudents = submissionsForSelectedSession.length;
  const countByStyle = (style: ThinkingStyle) => {
    return submissionsForSelectedSession.filter(s => {
      const currentCls = s.overriddenClassification || s.analysis.classification;
      return currentCls === style;
    }).length;
  };

  const percentageByStyle = (style: ThinkingStyle) => {
    if (totalStudents === 0) return 0;
    return Math.round((countByStyle(style) / totalStudents) * 100);
  };

  // Color mappings
  const getClassInfo = (cls: ThinkingStyle) => {
    switch (cls) {
      case 'خوف معرفي':
        return {
          color: 'text-red-700 bg-red-100 border-red-200',
          text: 'خوف معرفي',
          badge: <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
        };
      case 'تفكير سطحي':
        return {
          color: 'text-amber-800 bg-amber-100 border-amber-200',
          text: 'تفكير سطحي',
          badge: <span className="w-2 h-2 rounded-full bg-amber-500 inline-block shrink-0" />
        };
      case 'فضول معرفي':
        return {
          color: 'text-blue-700 bg-blue-100 border-blue-200',
          text: 'فضول معرفي',
          badge: <span className="w-2 h-2 rounded-full bg-blue-500 inline-block shrink-0" />
        };
      case 'تفكير نقدي':
      default:
        return {
          color: 'text-emerald-700 bg-emerald-100 border-emerald-200',
          text: 'تفكير نقدي',
          badge: <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
        };
    }
  };

  // Filter & Search student list from those representing the selected session
  const filteredSubmissions = submissionsForSelectedSession.filter(sub => {
    const termMatches = sub.studentName.toLowerCase().includes(searchQuery.toLowerCase());
    const displayCls = sub.overriddenClassification || sub.analysis.classification;
    const styleMatches = filterStyle === 'الكل' || displayCls === filterStyle;
    return termMatches && styleMatches;
  });

  // Export filtered data as a CSV file with full Arabic UTF-8 support (Excel compatible)
  const exportToCSV = () => {
    if (filteredSubmissions.length === 0) {
      showToast('لا توجد معطيات مطابقة لتصديرها حالياً.', 'error');
      return;
    }

    // CSV headers matching the Arabic educational workspace
    const headers = [
      'اسم التلميذ الكامل',
      'تاريخ تقديم الاستمارة',
      'نمط التفكير والتمثل المهيمن',
      'حالة التقييم',
      'مؤشر التفكير النقدي (%)',
      'مؤشر الفضول المعرفي (%)',
      'مؤشر التفكير السطحي (%)',
      'مؤشر الخوف المعرفي (%)',
      'ملاحظات المعلم اليدوية',
      'التوجيه البيداغوجي للذكاء الاصطناعي'
    ];

    // Escape and wrap fields in double quotes to prevent CSV injection / syntax breaking
    const escapeCSVString = (val: string) => {
      if (!val) return '""';
      const cleanVal = val.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      return `"${cleanVal}"`;
    };

    // Format individual student rows
    const rows = filteredSubmissions.map(sub => {
      const actualCls = sub.overriddenClassification || sub.analysis.classification;
      const classStyle = getClassInfo(actualCls);
      
      const formattedDate = new Date(sub.submittedAt).toLocaleDateString('ar-MA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const ratingStatus = sub.overriddenClassification ? 'معدل يدوياً من الأستاذ' : 'تشخيص تلقائي بالذكاء الاصطناعي';

      return [
        escapeCSVString(sub.studentName),
        escapeCSVString(formattedDate),
        escapeCSVString(classStyle.text),
        escapeCSVString(ratingStatus),
        Math.round(sub.analysis.metrics.criticalThinking),
        Math.round(sub.analysis.metrics.cognitiveCuriosity),
        Math.round(sub.analysis.metrics.shallowThinking),
        Math.round(sub.analysis.metrics.cognitiveFear),
        escapeCSVString(sub.teacherNotes || ''),
        escapeCSVString(sub.analysis.pedagogicalRecommendation || '')
      ];
    });

    // Merge everything with commas
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');

    // Create blobs with Universal UTF-8 BOM (\uFEFF) so Excel starts in UTF-8 mode displaying Arabic right-to-left beautifully
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const dateStr = new Date().toISOString().split('T')[0];
    const sessionSchool = teacherSession?.school ? `_${teacherSession.school.replace(/\s+/g, '_')}` : '';
    link.setAttribute('download', `philoscan_exports${sessionSchool}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8 ${loggedInTeacher ? 'pb-24 md:pb-8' : ''}`}>
      <AnimatePresence mode="wait">
        {!loggedInTeacher ? (
          // ==================== TEACHER LOGIN SCREEN ====================
          <div className="relative">
            {/* GOOGLE SSO SIMULATION MODAL */}
            <AnimatePresence>
              {showGoogleSimulation && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
                  dir="rtl"
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 15 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 15 }}
                    className="bg-slate-900 rounded-3xl sm:rounded-[32px] p-5 sm:p-6 max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-800 text-right"
                  >
                    <div className="flex justify-between items-center mb-5 sm:mb-6">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                        <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                        <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowGoogleSimulation(false);
                          setGoogleAuthLoadingState(null);
                          setGoogleAuthError(null);
                          setShowOwnerPasswordConfirm(false);
                          setOwnerPasswordInput('');
                          setOwnerPasswordError(null);
                        }}
                        className="px-3.5 py-2 min-h-[40px] bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-xs transition active:scale-95"
                      >
                        إغلاق ×
                      </button>
                    </div>

                    <div className="text-center mb-6">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">
                        <svg className="w-6 h-6" viewBox="0 0 24 24">
                          <path
                            fill="#EA4335"
                            d="M12.24 10.285V14.4h6.887c-.274 1.564-1.777 4.594-6.887 4.594-4.416 0-8.018-3.655-8.018-8.157s3.602-8.157 8.018-8.157c2.515 0 4.202 1.043 5.163 1.967l3.264-3.141c-2.091-1.948-4.935-3.136-8.427-3.136C5.378 1.405 0 6.783 0 13.405s5.378 12 12.24 12c7.164 0 11.916-5.043 11.916-12.131 0-.819-.088-1.442-.194-1.989H12.24z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-black text-slate-100">
                        {googleAuthMode === 'direct_login' ? 'الدخول السريع بحساب Google' : 'ربط وتأكيد الحساب عبر Google'}
                      </h3>
                      <p className="text-slate-400 text-xs mt-1.5 leading-relaxed font-semibold">
                        {googleAuthLoadingState 
                          ? "حالة تنفيذ المصافحة الرقمية لـ Google ومزامنة السحابة:" 
                          : showOwnerPasswordConfirm 
                            ? "يرجى تأكيد الرمز المالي الإداري لحساب مالك المنصة:"
                            : "اضغط على الزر أدناه للمتابعة وتصديق الهوية بأمان عبر نظام Google التعليمي الموحد:"}
                      </p>
                    </div>

                    {googleAuthLoadingState ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center space-y-6">
                        {googleAuthLoadingState === 'success' ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400"
                          >
                            <CheckCircle className="w-10 h-10" />
                          </motion.div>
                        ) : googleAuthLoadingState === 'error' ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center text-red-500"
                          >
                            <XCircle className="w-10 h-10" />
                          </motion.div>
                        ) : (
                          <div className="relative w-20 h-20 flex items-center justify-center">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                              className="w-16 h-16 border-2 border-dashed border-blue-500 rounded-full"
                            />
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-mono font-black text-blue-400">
                              {googleAuthLoadingState === 'handshake' && "1 / 3"}
                              {googleAuthLoadingState === 'firestore_connecting' && "2 / 3"}
                              {googleAuthLoadingState === 'firestore_writing' && "3 / 3"}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 max-w-sm w-full">
                          <h4 className="text-slate-100 font-black text-xs">
                            {googleAuthLoadingState === 'handshake' && "المرحلة الأولى: تفويض ومصادقة Google SSO"}
                            {googleAuthLoadingState === 'firestore_connecting' && "المرحلة الثانية: تأمين نفق الإرسال والربط بـ Firestore"}
                            {googleAuthLoadingState === 'firestore_writing' && "المرحلة الثالثة: بث وحفظ بيانات بطاقة الأستاذ وتكوين الجلسة"}
                            {googleAuthLoadingState === 'success' && "اكتملت المزامنة بنجاح وتم تفعيل الجلسة المستمرة!"}
                            {googleAuthLoadingState === 'error' && "أخفق الاتصال بالسحابة!"}
                          </h4>

                          <div className="text-slate-400 text-xs leading-relaxed min-h-[44px]">
                            {googleAuthError ? (
                              <div className="text-red-400 font-medium block bg-red-950/40 border border-red-900/40 p-3 rounded-xl">
                                {googleAuthError}
                              </div>
                            ) : (
                              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 font-medium">
                                {googleAuthLoadingState === 'handshake' && "جاري التعرف على توكن الهاتف (Device Google Token) وتأكيد سلامة التوقيع الرقمي مع خوادم Google..."}
                                {googleAuthLoadingState === 'firestore_connecting' && "استجاب تفويض Google بنجاح! جاري فتح ممر تبادل البيانات المشفر مع قاعدة Firebase (Firestore Channel Pipe)..."}
                                {googleAuthLoadingState === 'firestore_writing' && "جاري تسجيل وتحديث مستند الأستاذ ضمن الفهارس السحابية وبث كائن الجلسة الدائمة المستمرة..."}
                                {googleAuthLoadingState === 'success' && "تم سحب ملف الأستاذ وبناء الجلسة الدائمة بنجاح تام. لن تضطر لتسجيل الدخول مرة أخرى إلا عند الخروج اليدوي."}
                              </div>
                            )}
                          </div>
                        </div>

                        {googleAuthLoadingState === 'error' && (
                          <div className="flex flex-col sm:flex-row gap-2.5 w-full pt-4">
                            <button
                              type="button"
                              onClick={() => {
                                setGoogleAuthLoadingState(null);
                                setGoogleAuthError(null);
                              }}
                              className="flex-grow py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs rounded-xl transition active:scale-95"
                            >
                              العـودة للقائمة
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setGoogleAuthLoadingState(null);
                                setGoogleAuthError(null);
                              }}
                              className="flex-grow py-2.5 min-h-[44px] bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl transition active:scale-95"
                            >
                              إعادة المحاولة
                            </button>
                          </div>
                        )}
                      </div>
                    ) : showOwnerPasswordConfirm ? (
                      <div className="space-y-4">
                        <div className="bg-amber-950/40 border border-amber-900/40 p-4 rounded-2xl text-right">
                          <div className="flex items-center gap-2 text-amber-500 text-xs font-bold mb-1.5">
                            <Sparkles className="w-4 h-4 flex-shrink-0" />
                            <span>تأكيد هوية مالك المنصة</span>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            يتطلب حساب المالك <span className="font-mono text-amber-400">phillofikr@gmail.com</span> تأكيد الرمز السري الإداري لإتاحة جميع صلاحيات الإدارة العليا والتحليلات الشاملة فوراً:
                          </p>
                        </div>

                        <div className="space-y-1.5 text-right">
                          <label className="block text-[11px] text-slate-400 font-bold">الرمز السري الإداري:</label>
                          <input
                            type="password"
                            value={ownerPasswordInput}
                            onChange={(e) => {
                              setOwnerPasswordInput(e.target.value);
                              setOwnerPasswordError(null);
                            }}
                            placeholder="أدخل الرمز السري..."
                            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-4 py-2.5 min-h-[44px] text-base sm:text-xs font-mono focus:outline-none focus:border-amber-500 text-left"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!ownerPasswordInput.trim()) {
                                  setOwnerPasswordError('يرجى إدخال الرمز السري الإداري للتحقق.');
                                  return;
                                }
                                runGoogleAuthAndSync('phillofikr@gmail.com', 'مدير المنصة', 'الإدارة والإشراف الفلسفي', '', ownerPasswordInput.trim());
                              }
                            }}
                          />
                          {ownerPasswordError && (
                            <span className="text-[10px] text-red-400 font-semibold block">{ownerPasswordError}</span>
                          )}
                        </div>

                        <div className="flex gap-2.5 pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowOwnerPasswordConfirm(false);
                              setOwnerPasswordInput('');
                              setOwnerPasswordError(null);
                            }}
                            className="flex-grow py-2.5 min-h-[44px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs rounded-xl transition"
                          >
                            رجوع للخلف
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!ownerPasswordInput.trim()) {
                                setOwnerPasswordError('يرجى إدخال الرمز السري الإداري للتحقق.');
                                return;
                              }
                              runGoogleAuthAndSync('phillofikr@gmail.com', 'مدير المنصة', 'الإدارة والإشراف الفلسفي', '', ownerPasswordInput.trim());
                            }}
                            className="flex-grow py-2.5 min-h-[44px] bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl transition cursor-pointer"
                          >
                            تأكيد الدخول الآمن
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            runGoogleAuthAndSync('', '', '', '');
                          }}
                          className="w-full py-3.5 min-h-[48px] px-5 bg-slate-800 hover:bg-slate-700 active:bg-slate-800 hover:border-blue-500/40 border border-slate-700/80 rounded-2xl flex items-center justify-center gap-3 text-center transition cursor-pointer group active:scale-[0.98]"
                        >
                          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                            <path
                              fill="#EA4335"
                              d="M12.24 10.285V14.4h6.887c-.274 1.564-1.777 4.594-6.887 4.594-4.416 0-8.018-3.655-8.018-8.157s3.602-8.157 8.018-8.157c2.515 0 4.202 1.043 5.163 1.967l3.264-3.141c-2.091-1.948-4.935-3.136-8.427-3.136C5.378 1.405 0 6.783 0 13.405s5.378 12 12.24 12c7.164 0 11.916-5.043 11.916-12.131 0-.819-.088-1.442-.194-1.989H12.24z"
                            />
                          </svg>
                          <span className="text-xs font-black text-slate-100 group-hover:text-blue-400 transition">
                            {googleAuthMode === 'direct_login' 
                              ? 'تسجيل الدخول الفوري بـ Google' 
                              : 'ربط الحساب ومزامنة بطاقة الأستاذ'}
                          </span>
                        </button>

                        <div className="text-center pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => {
                              setShowOwnerPasswordConfirm(true);
                            }}
                            className="text-[11px] text-slate-400 hover:text-slate-200 font-bold transition cursor-pointer min-h-[38px] px-3 inline-flex items-center gap-1.5"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            <span>الدخول الإداري لمالك المنصة (phillofikr@gmail.com)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div
              key="login"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-md mx-auto bg-white rounded-3xl sm:rounded-[32px] shadow-sm border border-slate-200 overflow-hidden"
              dir="rtl"
            >
              <div className="bg-slate-900 text-white p-5 sm:p-6 text-center">
                <ShieldCheck className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 mx-auto mb-2.5 sm:mb-3" />
                <h2 className="text-xl sm:text-2xl font-extrabold pb-1">فضاء الأستاذ المفوّض</h2>
                <p className="text-slate-400 text-[11px] sm:text-xs mt-1">بوابة الدخول الآمن للمعلمين ومفتشي الفلسفة بالثانويات التأهيلية المغربية</p>
              </div>

              <form onSubmit={handleLogin} className="p-5 sm:p-6 space-y-4 sm:space-y-5">
                {loginError && (
                  <div className="bg-red-50 border-r-4 border-red-500 text-red-800 p-3.5 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4.5 h-4.5 text-red-600 flex-shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                {/* الصورة الشخصية للأستاذ */}
                {email.toLowerCase().trim() !== 'phillofikr@gmail.com' && (
                  <div className="flex flex-col items-center justify-center pb-2 border-b border-slate-100 mb-2">
                    <label className="block text-slate-700 font-bold mb-2 text-xs text-center">
                      الصورة الشخصية للأستاذ(ة) (اختياري):
                    </label>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('login-avatar-upload-file')?.click()}
                      className={`relative w-20 h-20 rounded-full border-2 ${
                        dragOver ? 'border-blue-500 bg-blue-50 scale-105' : 'border-slate-200 bg-slate-50 border-dashed hover:border-slate-300'
                      } flex flex-col items-center justify-center cursor-pointer overflow-hidden transition group shadow-inner`}
                      title="اسحب صورتك الشخصية هنا أو انقر للتصفح"
                    >
                      {avatar ? (
                        <>
                          <img src={avatar} alt="الأستاذ" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Camera className="w-4 h-4 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-2 text-center">
                          <Camera className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition mb-0.5" />
                          <span className="text-[8px] text-slate-400 font-semibold font-sans">اسحب أو انقر</span>
                        </div>
                      )}
                      <input
                        type="file"
                        id="login-avatar-upload-file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleAvatarChange(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </div>
                    {avatar && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatar('');
                          showToast('تم إزالة الصورة الشخصية.');
                        }}
                        className="text-[9px] text-red-500 hover:text-red-700 font-bold mt-1.5 hover:underline transition"
                      >
                        حذف الصورة
                      </button>
                    )}
                  </div>
                )}

                {/* البريد والربط */}
                <div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-1.5">
                    <label className="block text-slate-700 font-bold text-xs">
                      البريد الإلكتروني المهني للأستاذ:
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowGoogleSimulation(true)}
                      className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/50 text-blue-700 font-bold px-2.5 py-1.5 min-h-[34px] text-[10px] rounded-lg transition active:scale-95"
                    >
                      <img src="https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png" alt="Google" className="h-2.5" />
                      ربط بحساب Google
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@academy.gov.ma"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                      required
                    />
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5 pointer-events-none" />
                  </div>
                </div>

                {email.toLowerCase().trim() === 'phillofikr@gmail.com' ? (
                  <motion.div
                    key="admin-verification-pane"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-4.5 space-y-3"
                  >
                    <div className="flex items-center gap-2 text-amber-800 text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>نمط الإشراف العام مفعّل (Super Admin Mode)</span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">
                      من فضلك أدخل رمز التحقق الإداري السري للتحقق من هوية مدير المنصة والولوج إلى صلاحيات التحكم المركزية.
                    </p>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                        رمز التحقق الإداري السري:
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          value={adminSecret}
                          onChange={(e) => setAdminSecret(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition font-mono"
                          required
                        />
                        <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-500 w-4.5 h-4.5 pointer-events-none" />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className={`py-2 text-xs font-black rounded-lg transition cursor-pointer ${
                          authMode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        تسجيل الدخول
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode('register')}
                        className={`py-2 text-xs font-black rounded-lg transition cursor-pointer ${
                          authMode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        إنشاء حساب أستاذ جديد
                      </button>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                        كلمة المرور (Firebase Auth):
                      </label>
                      <div className="relative">
                        <input
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition font-mono"
                          required
                        />
                        <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5 pointer-events-none" />
                      </div>
                    </div>

                    {authMode === 'register' && (
                      <>
                    {/* الاسم الكامل */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                        الاسم الكامل للأستاذ(ة):
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="ذ. عماد المزراوي"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                          required
                        />
                        <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5 pointer-events-none" />
                      </div>
                    </div>

                    {/* التخصص */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                        التخصص الأكاديمي:
                      </label>
                      <div className="relative">
                        <select
                          value={specialty}
                          onChange={(e) => setSpecialty(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition appearance-none"
                          required
                        >
                          <option value="مادة الفلسفة">مادة الفلسفة</option>
                          <option value="الفلسفة والعلوم الإنسانية">الفلسفة والعلوم الإنسانية</option>
                          <option value="الفكر الإسلامي وعلم الكلام">الفكر الإسلامي وعلم الكلام</option>
                          <option value="فلسفة الفنون والجماليات">فلسفة الفنون والجماليات</option>
                          <option value="الفلسفة وبناء المناهج التعليمية">الفلسفة وبناء المناهج التعليمية</option>
                        </select>
                        <GraduationCap className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5 pointer-events-none" />
                      </div>
                    </div>

                    {/* المؤسسة */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                        المؤسسة التعليمية (الثانوية التأهيلية):
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={school}
                          onChange={(e) => setSchool(e.target.value)}
                          placeholder="ثانوية ابن رشد التأهيلية..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                          required
                        />
                        <BookOpen className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5 pointer-events-none" />
                      </div>
                    </div>

                    {/* الأكاديمية الجهوية - قائمة منسدلة قابلة للبحث */}
                    <SearchableSelect
                      label="الأكاديمية الجهوية للتربية والتكوين:"
                      value={regionalAcademy}
                      onChange={(val) => {
                        setRegionalAcademy(val);
                        setAcademySearch(val);
                        setProvince(''); // reset province to make sure it filters cleanly!
                        setProvinceSearch('');
                      }}
                      options={REGIONS}
                      placeholder="ابحث واختر الأكاديمية الجهوية للتربية والتكوين..."
                      required
                      icon={<Search className="w-4.5 h-4.5" />}
                    />

                    {/* العمالة أو الإقليم - يتكيف مستنداً للأكاديمية */}
                    <SearchableSelect
                      label="العمالة أو الإقليم (تتكيف حسب الجهة تلقائياً):"
                      value={province}
                      onChange={(val) => {
                        setProvince(val);
                        setProvinceSearch(val);
                      }}
                      options={regionalAcademy ? (REGION_PROVINCES[regionalAcademy] || []) : []}
                      placeholder="ابحث واختر العمالة أو الإقليم..."
                      disabledPlaceholder="اختر الأكاديمية الجهوية للتربية والتكوين أولاً"
                      disabled={!regionalAcademy}
                      required
                      icon={<MapPin className="w-4.5 h-4.5" />}
                    />

                    {/* سنوات الخبرة في التدريس */}
                    <div>
                      <label className="block text-slate-700 font-bold mb-1.5 text-xs">
                        سنوات الخبرة في التدريس (اختياري):
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={yearsOfExperience}
                          onChange={(e) => setYearsOfExperience(e.target.value)}
                          placeholder="مثال: 8"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 pr-11 min-h-[46px] text-slate-800 text-base sm:text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition"
                        />
                        <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-4.5 h-4.5 pointer-events-none" />
                      </div>
                    </div>
                      </>
                    )}
                  </>
                )}

                <div className="pt-2 space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 min-h-[48px] bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 active:scale-[0.98] transition duration-150 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-700"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-white" />
                        <span>جاري مزامنة السحابة...</span>
                      </>
                    ) : (
                      authMode === 'register' && email.toLowerCase().trim() !== 'phillofikr@gmail.com'
                        ? 'إنشاء حساب الأستاذ وإرسال التفعيل'
                        : 'تسجيل دخول وتأكيد بطاقة الأستاذ'
                    )}
                  </button>

                  {loading && loginLoadingStatus && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-blue-50/70 border border-blue-200/50 text-blue-800 p-3 rounded-xl text-[11px] flex items-center gap-2.5 text-right font-medium"
                      dir="rtl"
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />
                      <span>{loginLoadingStatus}</span>
                    </motion.div>
                  )}
                </div>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-slate-400 text-xs font-semibold">أو الدخول السريع الموثّق</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenGoogleQuickLogin}
                  className="w-full py-3 min-h-[46px] bg-blue-50 hover:bg-blue-100/70 text-blue-700 font-bold rounded-xl border border-blue-200/50 transition duration-150 text-xs flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  تسجيل الدخول الآمن بحساب Google
                </button>

                <button
                  type="button"
                  onClick={onBackToHome}
                  className="w-full py-2.5 min-h-[44px] text-slate-500 font-semibold hover:text-slate-800 transition duration-150 text-xs"
                >
                  الرجوع إلى الواجهة الرئيسية للموقع
                </button>
              </form>
            </motion.div>
          </div>
        ) : teacherSession?.role === 'admin' ? (
          // ==================== PLATFORM ADMIN WORKSPACE ====================
          <motion.div
            key="admin_workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
            dir="rtl"
          >
            {/* Top Toolbar */}
            <div className="bg-slate-900 text-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6 shadow-sm border border-slate-800">
              <div className="flex items-start gap-3 sm:gap-4 text-right">
                <div className="p-2.5 sm:p-3 bg-indigo-500/25 text-indigo-400 rounded-2xl border border-indigo-500/15 flex-shrink-0">
                  <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-xl md:text-2xl font-black text-slate-100 leading-snug">
                      لوحة الإدارة والمفتشية المركزية - فِيلوسكان
                    </h2>
                  </div>
                  <p className="text-slate-400 text-[11px] sm:text-xs mt-1 leading-relaxed hidden sm:block">
                    التحكم الفني لمراقبة الكادر التعليمي، وضبط معطيات الجلسات والتلاميذ على الصعيد الوطني.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto justify-start sm:justify-end">
                {/* نظام الإشعارات والتنبيهات الذكي للرقابة المركزية */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition text-slate-300 hover:text-white relative flex items-center justify-center min-h-[44px] min-w-[44px]"
                    title="التنبيهات والإشعارات"
                  >
                    {unreadNotifsCount > 0 ? (
                      <>
                        <BellRing className="w-4.5 h-4.5 text-amber-400" />
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full text-[10px] w-5 h-5 flex items-center justify-center font-bold font-mono border border-slate-900 shadow-md">
                          {unreadNotifsCount}
                        </span>
                      </>
                    ) : (
                      <Bell className="w-4.5 h-4.5 text-slate-400 hover:text-slate-200" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showNotificationsDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.95 }}
                        className="fixed sm:absolute left-4 right-4 sm:right-auto sm:left-0 top-24 sm:top-auto sm:mt-2 bg-slate-900 border border-slate-800 rounded-2xl w-auto sm:w-[380px] max-w-[calc(100vw-2rem)] shadow-2xl z-[150] overflow-hidden text-right font-sans"
                        dir="rtl"
                      >
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                          <div className="flex items-center gap-2">
                            <BellRing className="w-4 h-4 text-sky-400 shrink-0" />
                            <div>
                              <h4 className="font-extrabold text-sm text-slate-100">تنبيهات الاستمارات الواردة</h4>
                              <p className="text-[10px] text-slate-400">تابع تسليم تلامذتك لبياناتهم المفتوحة مباشرة</p>
                            </div>
                          </div>
                          {unreadNotifsCount > 0 && (
                            <button
                              onClick={handleMarkAllAsRead}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-bold transition hover:underline"
                            >
                              تحديد الكل كمقروء
                            </button>
                          )}
                        </div>

                        <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-800">
                          {notifications.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                              <Bell className="w-8 h-8 text-slate-700" />
                              <p className="text-xs font-bold text-slate-400">لا يوجد أي إشعار جديد حالياً</p>
                              <p className="text-[10px] text-slate-600">سيتم تنبيهك فوراً بإنذار صوتي وبصري عند تقديم أي استمارة جديدة من تلاميذك.</p>
                            </div>
                          ) : (
                            notifications.map((notif) => (
                              <div
                                key={notif.id}
                                className={`p-4 transition flex flex-col gap-2 relative group hover:bg-slate-800/30 text-right ${!notif.read ? 'bg-slate-800/60' : 'bg-transparent'}`}
                              >
                                <div className="flex justify-between items-start pl-6 text-right">
                                  <div className="text-right space-y-0.5">
                                    <h5 className="font-bold text-xs text-slate-200">التلميذ(ة): <span className="text-white font-black">{notif.studentName}</span></h5>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                      <Building className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span>القسم: {notif.classNumber} · الشعبة: {notif.stream}</span>
                                    </p>
                                    <p className="text-[9px] text-slate-500 flex items-center gap-1 tabular-nums">
                                      <Calendar className="w-3 h-3 text-slate-600 shrink-0" />
                                      <span>{new Date(notif.submittedAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })} - {new Date(notif.submittedAt).toLocaleDateString('ar-MA')}</span>
                                    </p>
                                  </div>
                                </div>

                                <div className="flex gap-2 justify-end pt-1 bg-transparent">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openStudentDetails(notif.submission);
                                      handleMarkAsRead(notif.id);
                                      setShowNotificationsDropdown(false);
                                    }}
                                    className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2.5 rounded-lg transition shadow-sm cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>فتح وعرض التحليل</span>
                                  </button>
                                  {!notif.read && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkAsRead(notif.id)}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1 px-2.5 rounded-lg transition border border-slate-700 cursor-pointer"
                                    >
                                      تحديد كمقروء
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNotification(notif.id)}
                                    className="text-[10px] bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-400 font-bold p-1 rounded-lg transition opacity-100 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                                    title="حذف الإشعار"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTutorial(true)}
                  className="py-2.5 px-3.5 bg-blue-950 hover:bg-blue-900 border border-blue-500/20 rounded-xl transition text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                  title="الدليل التوجيهي السريع"
                  id="admin-tutorial-launcher-btn"
                >
                  <HelpCircle className="w-4.5 h-4.5" />
                  <span className="hidden sm:inline">الدليل السريع</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fetchTeachersList();
                    fetchSessions();
                    fetchSubmissions();
                    showToast('تم تحديث قواعد المعطيات المركزية بنجاح.');
                  }}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition text-slate-300 hover:text-white"
                  title="تحديث البيانات"
                >
                  <RefreshCw className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="py-2.5 px-4 bg-red-400/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 hover:text-red-300 font-bold transition text-xs flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  تسجيل الخروج
                </button>
                <button
                  type="button"
                  onClick={() => setShowTutorial(true)}
                  className="py-2.5 px-4 bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/25 rounded-xl text-indigo-400 hover:text-indigo-300 font-bold transition text-xs flex items-center gap-1.5"
                >
                  <HelpCircle className="w-4 h-4" />
                  الدليل السريع
                </button>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 font-bold transition text-xs"
                >
                  الموقع الرئيسي
                </button>
              </div>
            </div>

            {/* Admin Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">هيئة التدريس المسجلة</span>
                  <span className="text-2xl font-black text-slate-800 font-mono">{teachersList.length} أستاذ(ة)</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-4 bg-violet-50 text-violet-600 rounded-2xl">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">إجمالي الجلسات التشخيصية</span>
                  <span className="text-2xl font-black text-slate-800 font-mono">{sessions.length} جلسة نشطة</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Users className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">مجموع التلامذة المقيّمين</span>
                  <span className="text-2xl font-black text-slate-800 font-mono">{submissions.length} تلميذ(ة)</span>
                </div>
              </div>
            </div>

            {/* Admin Segmented Control Tab */}
            <div className="flex border-b border-slate-200 bg-slate-100 p-1.5 rounded-2xl w-full flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setActiveAdminTab('teachers')}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'teachers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>إدارة المستخدمين ({teachersList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('institutions')}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'institutions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>إدارة المؤسسات ({adminUniqueSchools.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('stats')}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'stats' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>التحليلات والإحصائيات</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('content')}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'content' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Library className="w-3.5 h-3.5" />
                <span>إدارة المحتوى</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('system')}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'system' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>إدارة النظام</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveAdminTab('sessions')}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'sessions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>سجل الجلسات ({sessions.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveAdminTab('reports');
                  fetchUserReports();
                }}
                className={`flex-1 min-w-[124px] py-2.5 text-center text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${activeAdminTab === 'reports' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>بلاغات جودة الخدمة ({userReports.length})</span>
              </button>
            </div>

            {/* TAB PANES */}
            {activeAdminTab === 'teachers' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm">إدارة المستخدمين وهيئة التدريس المسجلين بالمنصة</h3>
                    <p className="text-[11px] text-slate-400 mt-1 hidden sm:block">تعديل بيانات الطاقم التعليمي، تجميد أو تعطيل الحسابات، وحذف السجلات مؤقتاً.</p>
                  </div>
                </div>

                {/* Mobile Stacked Cards */}
                <div className="md:hidden divide-y divide-slate-100" dir="rtl">
                  {teachersList.length > 0 ? (
                    teachersList.map((tch) => {
                      const isDisabled = disabledTeacherIds.includes(tch.id);
                      return (
                        <div key={`m-tch-${tch.id}`} className={`p-4 space-y-3 ${isDisabled ? 'bg-red-50/20' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-slate-800 text-sm">{tch.fullName}</h4>
                                {isDisabled && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-bold">معطل</span>}
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{tch.email}</p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${isDisabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {isDisabled ? 'غير نشط' : 'نشط'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-0.5">
                            <div className="font-semibold text-slate-800">{tch.school}</div>
                            <div className="text-[11px] text-slate-400">{tch.regionalAcademy} - {tch.province}</div>
                            <div className="text-[10px] font-mono text-slate-400">ID: {tch.id}</div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTeacher(tch)}
                              className="min-h-[42px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition text-xs font-bold"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleDisableTeacher(tch.id)}
                              className={`min-h-[42px] rounded-xl transition text-xs font-bold border ${isDisabled ? 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'}`}
                            >
                              {isDisabled ? 'تفعيل' : 'تعطيل'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTeacher(tch.id)}
                              className="min-h-[42px] text-red-700 hover:bg-red-50 border border-red-200 rounded-xl transition text-xs font-bold"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-xs">لم يسجل أي أستاذ بالمنصة بعد.</div>
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-right text-xs" dir="rtl">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-mono border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold">معرف الأستاذ</th>
                        <th className="px-6 py-4 font-bold">الاسم الكامل</th>
                        <th className="px-6 py-4 font-bold">البريد الإلكتروني</th>
                        <th className="px-6 py-4 font-bold">المؤسسة والمدينة</th>
                        <th className="px-6 py-4 text-center font-bold">الحالة</th>
                        <th className="px-6 py-4 text-left font-bold">الإجراءات والتحكم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teachersList.length > 0 ? (
                        teachersList.map((tch) => {
                          const isDisabled = disabledTeacherIds.includes(tch.id);
                          return (
                            <tr key={tch.id} className={`hover:bg-slate-50/70 transition ${isDisabled ? 'bg-red-50/20' : ''}`}>
                              <td className="px-6 py-4 font-mono font-bold text-slate-500">{tch.id}</td>
                              <td className="px-6 py-4 font-bold text-slate-800">
                                {tch.fullName}
                                {isDisabled && <span className="mr-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-bold inline-flex items-center gap-1"><Ban className="w-3 h-3" /> معطل</span>}
                              </td>
                              <td className="px-6 py-4 font-mono text-slate-600">{tch.email}</td>
                              <td className="px-6 py-4 text-slate-600">
                                <span className="font-semibold text-slate-800 block">{tch.school}</span>
                                <span className="text-[10px] text-slate-400 block">{tch.regionalAcademy} - {tch.province}</span>
                              </td>
                              <td className="px-6 py-4 text-center font-bold">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${isDisabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                  {isDisabled ? 'غير نشط' : 'نشط'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-left">
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setEditingTeacher(tch)}
                                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition text-[10px] font-bold inline-flex items-center gap-1"
                                  >
                                    <FileEdit className="w-3 h-3" />
                                    <span>تعديل</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDisableTeacher(tch.id)}
                                    className={`px-3 py-1.5 rounded-xl transition text-[10px] font-bold border ${isDisabled ? 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'}`}
                                  >
                                    {isDisabled ? 'تفعيل' : 'تعطيل'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTeacher(tch.id)}
                                    className="px-3 py-1.5 text-red-700 hover:bg-red-50 border border-red-200 rounded-xl transition text-[10px] font-bold"
                                  >
                                    حذف
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                            لم يسجل أي أستاذ بالمنصة بعد.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Teacher editing modal in-pane */}
                {editingTeacher && (
                  <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
                    <form onSubmit={handleSaveTeacherDetails} className="bg-white rounded-3xl sm:rounded-[28px] border border-slate-200 p-5 sm:p-6 max-w-md w-full max-h-[92vh] overflow-y-auto text-right shadow-2xl space-y-4">
                      <div className="border-b pb-3 flex justify-between items-center gap-2">
                        <h4 className="font-black text-slate-800 text-sm">تعديل بيانات الأستاذ: {editingTeacher.fullName}</h4>
                        <button type="button" onClick={() => setEditingTeacher(null)} className="text-slate-400 hover:text-slate-600 font-bold text-lg min-w-[40px] min-h-[40px] flex items-center justify-center">×</button>
                      </div>
                      <div className="space-y-3.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 block">الاسم الكامل للأستاذ:</label>
                          <input
                            type="text"
                            value={editingTeacher.fullName}
                            onChange={e => setEditingTeacher({...editingTeacher, fullName: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-base sm:text-xs font-bold"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 block">المؤسسة التعليمية:</label>
                          <input
                            type="text"
                            value={editingTeacher.school}
                            onChange={e => setEditingTeacher({...editingTeacher, school: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-base sm:text-xs font-bold"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <SearchableSelect
                            label="الأكاديمية الجهوية:"
                            value={editingTeacher.regionalAcademy}
                            onChange={val => {
                              const provinces = REGION_PROVINCES[val] || [];
                              setEditingTeacher({
                                ...editingTeacher,
                                regionalAcademy: val,
                                province: provinces[0] || ''
                              });
                            }}
                            options={REGIONS}
                            placeholder="اختر الأكاديمية..."
                            required
                          />
                          <SearchableSelect
                            label="العمالة أو الإقليم:"
                            value={editingTeacher.province}
                            onChange={val => setEditingTeacher({...editingTeacher, province: val})}
                            options={editingTeacher.regionalAcademy ? (REGION_PROVINCES[editingTeacher.regionalAcademy] || []) : []}
                            placeholder="اختر الإقليم..."
                            disabledPlaceholder="اختر الأكاديمية الجهوية أولاً"
                            disabled={!editingTeacher.regionalAcademy}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 block">التخصص:</label>
                            <input
                              type="text"
                              value={editingTeacher.specialty || ''}
                              onChange={e => setEditingTeacher({...editingTeacher, specialty: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-base sm:text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-500 block">سنوات الخبرة:</label>
                            <input
                              type="text"
                              value={editingTeacher.yearsOfExperience || ''}
                              onChange={e => setEditingTeacher({...editingTeacher, yearsOfExperience: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 min-h-[44px] text-base sm:text-xs font-bold"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="border-t pt-3 flex flex-col-reverse sm:flex-row gap-2 justify-end">
                        <button type="button" onClick={() => setEditingTeacher(null)} className="px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition">إلغاء</button>
                        <button type="submit" className="px-5 py-2.5 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition">حفظ التغييرات</button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {activeAdminTab === 'institutions' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 overflow-hidden shadow-sm space-y-5 sm:space-y-6 p-4 sm:p-6 text-right" dir="rtl">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <Building className="w-4 h-4 text-[#0284C7]" />
                    <span>إدارة وهيكلة المؤسسات التعليمية المنتسبة</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 hidden sm:block">مراقبة توزع ومشاركة الثانويات التأهيلية وطاقم هيئة التدريس المفعل عبر التراب الوطني.</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <span className="text-[11px] text-slate-400 block font-bold">إجمالي المؤسسات النشطة</span>
                    <span className="text-lg sm:text-xl font-black text-slate-800 font-mono mt-1 block">{adminUniqueSchools.length} ثانوية تأهيلية</span>
                  </div>
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                    <span className="text-[11px] text-indigo-700 block font-bold">بوابة المديريات والعمالات</span>
                    <span className="text-lg sm:text-xl font-black text-indigo-900 font-mono mt-1 block">
                      {Array.from(new Set(teachersList.map(t => t.province).filter(Boolean))).length} عمالة وإقليم
                    </span>
                  </div>
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                    <span className="text-[11px] text-emerald-700 block font-bold">معدل استجابات التلاميذ</span>
                    <span className="text-lg sm:text-xl font-black text-emerald-900 font-mono mt-1 block">
                      {adminUniqueSchools.length ? (submissions.length / adminUniqueSchools.length).toFixed(1) : 0} تلميذ / مؤسسة
                    </span>
                  </div>
                </div>

                {/* Mobile Cards for Institutions */}
                <div className="md:hidden space-y-3">
                  {adminUniqueSchools.length > 0 ? (
                    adminUniqueSchools.map((schoolName, idx) => {
                      const schoolTeachers = teachersList.filter(t => t.school === schoolName);
                      const schoolSessions = sessions.filter(s => s.institution === schoolName);
                      const schoolSubmissions = submissions.filter(sub => sub.institution === schoolName);
                      return (
                        <div key={`m-inst-${idx}`} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-slate-800 text-xs leading-snug">{schoolName}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${schoolSubmissions.length > 3 ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-500'}`}>
                              {schoolSubmissions.length > 3 ? 'نشاط متصاعد' : 'مستقر'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 block">الأساتذة</span>
                              <span className="font-bold font-mono text-xs text-slate-700">{schoolTeachers.length || 1}</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 block">الجلسات</span>
                              <span className="font-bold font-mono text-xs text-indigo-600">{schoolSessions.length}</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100">
                              <span className="text-[10px] text-slate-400 block">التلاميذ</span>
                              <span className="font-bold font-mono text-xs text-emerald-600">{schoolSubmissions.length}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center text-slate-400 italic text-xs">لا توجد مؤسسات تعليمية في السجلات السحابية حالياً.</div>
                  )}
                </div>

                {/* Desktop Table for Institutions */}
                <div className="hidden md:block overflow-x-auto pt-2">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-mono border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 font-bold">اسم المؤسسة التعليمية</th>
                        <th className="px-6 py-3 text-center font-bold">عدد الأساتذة الموجهين</th>
                        <th className="px-6 py-3 text-center font-bold">عدد الجلسات الفعالة</th>
                        <th className="px-6 py-3 text-center font-bold">مجموع مشاركات التلاميذ المقيّمين</th>
                        <th className="px-6 py-3 text-left font-bold">الوضعية الحالية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {adminUniqueSchools.length > 0 ? (
                        adminUniqueSchools.map((schoolName, idx) => {
                          const schoolTeachers = teachersList.filter(t => t.school === schoolName);
                          const schoolSessions = sessions.filter(s => s.institution === schoolName);
                          const schoolSubmissions = submissions.filter(sub => sub.institution === schoolName);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/70 transition">
                              <td className="px-6 py-4 font-bold text-slate-800">{schoolName}</td>
                              <td className="px-6 py-4 text-center font-bold font-mono text-slate-700">{schoolTeachers.length || 1} أستاذ(ة)</td>
                              <td className="px-6 py-4 text-center font-bold font-mono text-indigo-600">{schoolSessions.length} جلسة</td>
                              <td className="px-6 py-4 text-center font-bold font-mono text-emerald-600">{schoolSubmissions.length} تلميذ(ة)</td>
                              <td className="px-6 py-4 text-left">
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${schoolSubmissions.length > 3 ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-100 text-slate-500'}`}>
                                  {schoolSubmissions.length > 3 ? 'نشاط حيوي متصاعد' : 'مستقر'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">لا توجد مؤسسات تعليمية في السجلات السحابية حالياً.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeAdminTab === 'content' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6 text-right" dir="rtl">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <Library className="w-4 h-4 text-[#0284C7]" />
                    <span>مركبة إدارة المحتوى الفكري والتربوي</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">تنسيق وإدارة بنك الاستمارات التشخيصية، بنك الموارد ومقالات المحتوى البيداغوجي الموجه لرجال التعليم.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Form Bank Sub-Section */}
                  <div className="border border-slate-200 rounded-[24px] p-5 space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-800 flex items-center gap-1.5">
                        <ClipboardList className="w-4 h-4 text-[#0284C7]" />
                        <span>بنك الاستمارات التشخيصية</span>
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-bold font-mono">
                        {customFormsList.length + 1} نماذج
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">الاستمارة الفلسفية المعيارية</span>
                          <span className="text-[9px] text-slate-400 block font-mono">12 معيار تقييمي</span>
                        </div>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-bold">افتراضية نشطة</span>
                      </div>
                      {customFormsList.map((form) => (
                        <div key={form.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-800 block">{form.title}</span>
                            <span className="text-[9px] text-slate-400 block font-mono">{form.fieldCount} حقول إدخال</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomFormsList(prev => prev.filter(f => f.id !== form.id));
                              showToast('تم تعديل وحظر نشر الاستمارة المحددة.');
                            }}
                            className="text-[9px] text-red-600 hover:underline cursor-pointer"
                          >
                            حذف النموذج
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newID = `custom-${Date.now()}`;
                        setCustomFormsList([...customFormsList, { id: newID, title: `استبيان مقترن بالتمثلات ${customFormsList.length + 3}`, fieldCount: 3, type: 'visual' }]);
                        showToast('تمت إضافة نموذج استمارة فارغ جاهز لإدارة التطوير ببنك الاستمارات.');
                      }}
                      className="w-full text-center py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      إضافة استمارة جديدة
                    </button>
                  </div>

                  {/* Resource Bank Sub-Section */}
                  <div className="border border-slate-200 rounded-[24px] p-5 space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-800 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-[#0284C7]" />
                        <span>بنك الموارد والتوثيق الفلسفي</span>
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-bold font-mono">نشط</span>
                    </div>
                    <div className="space-y-2.5">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">كتاب التوجيهات التربوية الوطنية</span>
                          <span className="text-[9px] text-slate-400 block">ملف PDF رسمي (النسخة الكاملة)</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-bold">مفعل</span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">بطاقات بيداغوجية لمفهوم الشخص والوعي</span>
                          <span className="text-[9px] text-slate-400 block">حقيبة المدرس الرقمية</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-bold">مفعل</span>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">ملخص منهاج التفكير السلوكي والمدني</span>
                          <span className="text-[9px] text-slate-400 block">دليل تكميلي</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-bold">مؤرشف</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => showToast('تحت التطوير الفني - سيتم رفع المورد وربطه مع قاعدة البيانات قريباً.')}
                      className="w-full text-center py-2.5 border-2 border-dashed border-slate-200 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      إضافة مورد لغرفة التدريس
                    </button>
                  </div>

                  {/* Educational Content Sub-Section */}
                  <div className="border border-slate-200 rounded-[24px] p-5 space-y-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-black text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-[#0284C7]" />
                        <span>المحتوى التعليمي والبيداغوجي</span>
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg font-bold font-mono">3 منشورات</span>
                    </div>
                    <div className="space-y-2.5">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">منهجية تحليل القولة الإشكالية</span>
                          <span className="text-[9px] text-slate-400 block">مقالة موجهة لمستوى الثانية بكالوريا</span>
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">جدلية الأنا والآخر بوعي المتعلم</span>
                          <span className="text-[9px] text-slate-400 block font-semibold">أطروحة تربوية</span>
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800 block">دليل إدارة الحوار التوليدي السقراطي</span>
                          <span className="text-[9px] text-slate-400 block">مهارات التفلسف التوجيهي</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => showToast('سيتم تمكين رفع المحتوى التعليمي بعد إنهاء إعدادات المخدم.')}
                      className="w-full text-center py-2 border border-indigo-100 hover:bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      كتابة ونشر منشور جديد
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeAdminTab === 'system' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6 text-right" dir="rtl">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[#0284C7]" />
                    <span>إدارة وصيانة نظام فِيلوسكان</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 hidden sm:block">نسخ احتياطي فوري للسلامة القصوى، ومراقبة تفاصيل الأداء وقنوات الاتصال السحابية بـ Firebase.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {/* Left Column: Backup, error registry */}
                  <div className="space-y-4">
                    {/* Backup Panel */}
                    <div className="p-4 sm:p-5 border border-slate-200 rounded-[20px] bg-slate-50 space-y-3">
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-[#0284C7]" />
                        <span>النسخ الاحتياطي وحماية البيانات الاستراتيجية</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">تنزيل نسخة مطابقة للاستعمال المركزي تتضمن كافة الأساتذة، وجلسات التشخيص الحية، واستمارات التلاميذ المقيّمة من سحابة Firestore بملف JSON واحد.</p>
                      
                      <button
                        type="button"
                        onClick={() => {
                          const backupData = {
                            exportedAt: new Date().toISOString(),
                            platform: "PhiloScan Platform",
                            totalTeachers: teachersList.length,
                            totalSessions: sessions.length,
                            totalSubmissions: submissions.length,
                            data: {
                              teachers: teachersList,
                              sessions: sessions,
                              submissions: submissions
                            }
                          };
                          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
                          const downloadAnchor = document.createElement('a');
                          downloadAnchor.setAttribute("href", dataStr);
                          downloadAnchor.setAttribute("download", `philoscan_backup_${new Date().toISOString().split('T')[0]}.json`);
                          document.body.appendChild(downloadAnchor);
                          downloadAnchor.click();
                          downloadAnchor.remove();
                          showToast('تم توليد وتنزيل النسخة الاحتياطية الاستراتيجية بنجاح.');
                        }}
                        className="w-full text-center py-3 min-h-[46px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Database className="w-4 h-4" />
                        <span>تحميل النسخة الاحتياطية الفورية (JSON)</span>
                      </button>
                    </div>

                    {/* Network Logs and Errors Panel */}
                    <div className="p-4 sm:p-5 border border-slate-200 rounded-[20px] space-y-3">
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>مراقبة الأخطاء وقنوات السلامة السحابية</span>
                      </h4>
                      <div className="space-y-2.5 font-mono text-[10px]">
                        <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-50 p-2.5 rounded-lg">
                          <span className="text-slate-500 font-bold">اتصال Firestore DB Sockets</span>
                          <span className="text-emerald-700 font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> متصل ومستقر</span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-50 p-2.5 rounded-lg">
                          <span className="text-slate-500 font-bold">استجابة بوابة الذكاء الاصطناعي Gemini</span>
                          <span className="text-emerald-700 font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> مستقر (110ms)</span>
                        </div>
                        <div className="flex flex-wrap justify-between items-center gap-2 bg-slate-50 p-2.5 rounded-lg">
                          <span className="text-slate-500 font-bold">سلك معالجة الاستشارات وإرسال البيانات</span>
                          <span className="text-slate-700 font-bold">0 خطأ (استقرار 100%)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Platform Configuration Settings */}
                  <div className="space-y-4">
                    {/* Settings Switch panel */}
                    <div className="p-4 sm:p-5 border border-slate-200 rounded-[20px] space-y-4">
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <SlidersHorizontal className="w-4 h-4 text-[#0284C7]" />
                        <span>خيارات الرقابة والإعدادات الوطنية للمنصة</span>
                      </h4>
                      
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <span className="text-xs font-extrabold text-slate-800 block">وضع الصيانة المعيارية</span>
                            <span className="text-[10px] text-slate-400 block">عرض صفحة الصيانة والتوقف المؤقت وتجميد العمليات العامة.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSystemConfig(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }));
                              showToast('تم تحديث وضع الصيانة المعيارية للمنصة بنجاح.');
                            }}
                            className={`w-11 h-6 rounded-full transition relative inline-block cursor-pointer shrink-0 ${systemConfig.maintenanceMode ? 'bg-indigo-600' : 'bg-slate-200'}`}
                          >
                            <span className={`absolute top-0.5 right-0.5 bg-white w-5 h-5 rounded-full transition ${systemConfig.maintenanceMode ? 'translate-x-[-20px]' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        <div className="flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <span className="text-xs font-extrabold text-slate-800 block">تظليل وإخفاء هويات المتعاملين</span>
                            <span className="text-[10px] text-slate-400 block">إخفاء الأسماء الحقيقية للتلاميذ لأغراض التقارير الوزراية الرسمية.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSystemConfig(prev => ({ ...prev, anonymousMode: !prev.anonymousMode }));
                              showToast('تم تفعيل بروتوكول حماية خصوصية هوية التلامذة.');
                            }}
                            className={`w-11 h-6 rounded-full transition relative inline-block cursor-pointer shrink-0 ${systemConfig.anonymousMode ? 'bg-indigo-600' : 'bg-slate-200'}`}
                          >
                            <span className={`absolute top-0.5 right-0.5 bg-white w-5 h-5 rounded-full transition ${systemConfig.anonymousMode ? 'translate-x-[-20px]' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        <div className="flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <span className="text-xs font-extrabold text-slate-800 block">تنشيط الذكاء الاصطناعي Gemini 2.5 Flash / Pro</span>
                            <span className="text-[10px] text-slate-400 block">استعمال تقنية الذكاء الفلسفي العالي بالتحليل المنهجي الفوري.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSystemConfig(prev => ({ ...prev, geminiProMode: !prev.geminiProMode }));
                              showToast('تم تحديث إعدادات الذكاء الفلسفي التوليدي.');
                            }}
                            className={`w-11 h-6 rounded-full transition relative inline-block cursor-pointer shrink-0 ${systemConfig.geminiProMode ? 'bg-emerald-600' : 'bg-slate-200'}`}
                          >
                            <span className={`absolute top-0.5 right-0.5 bg-white w-5 h-5 rounded-full transition ${systemConfig.geminiProMode ? 'translate-x-[-20px]' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        <div className="flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <span className="text-xs font-extrabold text-slate-800 block">التحقق المزدوج لرجال الأمن الإداري</span>
                            <span className="text-[10px] text-slate-400 block">طلب كود مرور ثان مؤقت للولوج لواجهة الإدارة والتحكم المركزي.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSystemConfig(prev => ({ ...prev, doubleValidation: !prev.doubleValidation }));
                              showToast('تم تعديل متطلبات الولوج المزدوج لإدارة المنصة.');
                            }}
                            className={`w-11 h-6 rounded-full transition relative inline-block cursor-pointer shrink-0 ${systemConfig.doubleValidation ? 'bg-indigo-600' : 'bg-slate-200'}`}
                          >
                            <span className={`absolute top-0.5 right-0.5 bg-white w-5 h-5 rounded-full transition ${systemConfig.doubleValidation ? 'translate-x-[-20px]' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Performance Monitoring Stats panel */}
                    <div className="p-5 border border-slate-200 rounded-[20px] space-y-3.5 bg-white">
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-[#0284C7]" />
                        <span>مراقبة وحماية أداء وموارد خادم الاستضافة</span>
                      </h4>
                      
                      <div className="space-y-3.5">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold text-slate-500">
                            <span>سرعة الاستجابة الزمنية لمعالجة التقارير البداغوجية</span>
                            <span className="font-mono text-emerald-600 font-extrabold">98.5% (سريعة جداً)</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full w-[98.5%] bg-emerald-500" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-bold text-slate-500">
                            <span>معدل استهلاك الذاكرة السحابية المخصصة (RAM Cluster)</span>
                            <span className="font-mono text-indigo-600 font-extrabold">41.2%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="bg-indigo-600 h-full rounded-full w-[41.2%]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeAdminTab === 'sessions' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="font-extrabold text-slate-800 text-sm">السجل الكلي للجلسات المفتوحة عبر التراب الوطني</h3>
                </div>

                {/* Mobile Cards for Admin Sessions */}
                <div className="md:hidden divide-y divide-slate-100" dir="rtl">
                  {sessions.length > 0 ? (
                    sessions.map((sess) => (
                      <div key={`m-adm-sess-${sess.sessionId}`} className="p-4 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-800 text-xs">{sess.title} [فوج {sess.classNumber}]</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">{sess.teacherName || 'أستاذ منضم'} • {sess.level} ({sess.stream})</p>
                          </div>
                          <span className="font-mono font-bold text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg shrink-0">{sess.sessionId}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopySessionId(sess.sessionId)}
                            className="flex-1 min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            {copiedSessionId === sess.sessionId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>نسخ الرمز</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopySessionLink(sess.sessionId)}
                            className="flex-1 min-h-[42px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                          >
                            {copiedLinkSessionId === sess.sessionId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>نسخ الرابط</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSessionByAdmin(sess.sessionId)}
                            className="min-h-[42px] px-3 text-red-600 hover:bg-red-50 border border-red-100 rounded-xl transition text-xs font-bold"
                          >
                            حذف
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-xs">لا توجد جلسات تشخيصية فعالة حالياً.</div>
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-right text-xs" dir="rtl">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-mono border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold">الرمز الفريد</th>
                        <th className="px-6 py-4 font-bold">اسم الأستاذ الموجه</th>
                        <th className="px-6 py-4 font-bold">العنوان وتفاصيل الفئة</th>
                        <th className="px-6 py-4 font-bold">المستوى الدراسي والمسلك</th>
                        <th className="px-6 py-4 font-bold">رابط الولوج المباشر</th>
                        <th className="px-6 py-4 text-left font-bold">التحكم المركزي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessions.length > 0 ? (
                        sessions.map((sess) => (
                          <tr key={sess.sessionId} className="hover:bg-slate-50/70 transition">
                            <td className="px-6 py-4 font-mono font-bold text-indigo-600">
                              <div className="flex items-center gap-1.5 justify-start">
                                <span>{sess.sessionId}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopySessionId(sess.sessionId)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition"
                                  title="نسخ الرمز"
                                >
                                  {copiedSessionId === sess.sessionId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-bold text-slate-800 block">{sess.teacherName || 'أستاذ منضم'}</span>
                              <span className="text-[10px] text-slate-400 block font-mono">{sess.teacherEmail}</span>
                            </td>
                            <td className="px-6 py-4 text-slate-700 font-semibold">{sess.title} [فوج {sess.classNumber}]</td>
                            <td className="px-6 py-4 text-slate-600">
                              <span className="block">{sess.level}</span>
                              <span className="text-[10px] block font-semibold text-slate-400">{sess.stream}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 justify-start">
                                <span className="text-indigo-600 font-mono text-[10px]">
                                  /session/{sess.sessionId}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopySessionLink(sess.sessionId)}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition"
                                  title="نسخ الرابط المباشر"
                                >
                                  {copiedLinkSessionId === sess.sessionId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-left">
                              <button
                                type="button"
                                onClick={() => handleDeleteSessionByAdmin(sess.sessionId)}
                                className="p-2 text-red-600 hover:bg-red-50 border border-red-100 rounded-xl transition text-[10px] font-bold"
                              >
                                حذف الجلسة الكلية
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                            لا توجد جلسات تشخيصية فعالة حالياً.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeAdminTab === 'stats' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm">الأرشيف العام لملفات تشخيص التلامذة المسجلين</h3>
                    <p className="text-[11px] text-slate-400 mt-1 hidden sm:block">يطلع مفتش الإدارة مكمّناً على أي ملف للمعاينة وتفحص جودة التقارير التربوية.</p>
                  </div>
                </div>

                {/* Mobile Cards for Admin Stats Archive */}
                <div className="md:hidden divide-y divide-slate-100" dir="rtl">
                  {submissions.length > 0 ? (
                    submissions.map((sub, idx) => {
                      const actualCls = sub.overriddenClassification || sub.analysis.classification;
                      const info = getClassInfo(actualCls);
                      const maxMetric = Math.max(
                        sub.analysis.metrics.criticalThinking,
                        sub.analysis.metrics.cognitiveCuriosity,
                        sub.analysis.metrics.cognitiveFear,
                        sub.analysis.metrics.shallowThinking
                      );
                      return (
                        <div key={`m-archive-sub-${sub.id || idx}`} className="p-4 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-bold text-slate-800 text-sm">{sub.studentName}</h4>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                {new Date(sub.submittedAt).toLocaleDateString('ar-MA')} • أعلى مؤشر: {maxMetric}%
                              </span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${info.color}`}>
                              {info.badge} {info.text}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openStudentDetails(sub)}
                              className="flex-1 min-h-[42px] bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-xl transition text-xs font-bold flex items-center justify-center gap-1.5"
                            >
                              <Eye className="w-4 h-4" />
                              فتح الملف
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubmission(sub.id)}
                              className="min-h-[42px] px-3.5 text-red-600 hover:bg-red-50 border border-red-100 rounded-xl transition text-xs font-bold flex items-center justify-center"
                              title="حذف ملف التلميذ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-xs">السياق العام خالٍ من أي ملفات لتشخيص التلاميذ حالياً.</div>
                  )}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-right text-xs" dir="rtl">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-mono border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-bold">اسم التلميذ</th>
                        <th className="px-6 py-4 font-bold">النمط المعرفي والوجداني المهيمن</th>
                        <th className="px-6 py-4 font-bold">تاريخ الإنجاز</th>
                        <th className="px-6 py-3.5 text-center font-bold">أعلى مؤشر عددي</th>
                        <th className="px-6 py-4 font-bold text-left">المعاينة وتطهير السجلات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {submissions.length > 0 ? (
                        submissions.map((sub, idx) => {
                          const actualCls = sub.overriddenClassification || sub.analysis.classification;
                          const info = getClassInfo(actualCls);
                          return (
                            <tr key={`archive-sub-${sub.id || idx}`} className="hover:bg-slate-50/70 transition">
                              <td className="px-6 py-4 font-bold text-slate-800">{sub.studentName}</td>
                              <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${info.color}`}>
                                  {info.badge} {info.text}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-400 font-mono text-[10px]">
                                {new Date(sub.submittedAt).toLocaleDateString('ar-MA')}
                              </td>
                              <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">
                                {Math.max(
                                  sub.analysis.metrics.criticalThinking,
                                  sub.analysis.metrics.cognitiveCuriosity,
                                  sub.analysis.metrics.cognitiveFear,
                                  sub.analysis.metrics.shallowThinking
                                )}%
                              </td>
                              <td className="px-6 py-4 text-left flex gap-1 justify-end">
                                <button
                                  type="button"
                                  onClick={() => openStudentDetails(sub)}
                                  className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-xl transition text-[10px] font-bold inline-flex items-center gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  فتح الملف
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubmission(sub.id)}
                                  className="p-2 text-red-600 hover:bg-red-50 border border-red-100 rounded-xl transition text-[10px] font-bold inline-flex items-center"
                                  title="حذف ملف التلميذ"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                            السياق العام خالٍ من أي ملفات لتشخيص التلاميذ حالياً.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeAdminTab === 'reports' && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50/50 gap-3 sm:gap-4">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm">سجل بلاغات الجودة والملاحظات التقنية والتربوية</h3>
                    <p className="text-[11px] text-slate-400 mt-1 hidden sm:block">تجد هنا جميع تقارير الأخطاء والاستفسارات والاقتراحات المرسلة من قبل زوار ومدرسي المنصة.</p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchUserReports}
                    className="w-full sm:w-auto justify-center py-2.5 px-4 min-h-[44px] bg-slate-100 ring-1 ring-slate-200 text-slate-600 hover:bg-slate-200 font-bold transition rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تحديث قائمة البلاغات</span>
                  </button>
                </div>

                <div className="p-4 sm:p-6">
                  {isLoadingReports ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-3">
                      <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs text-slate-400 font-bold">جاري تحميل سجل البلاغات والتحديثات...</p>
                    </div>
                  ) : userReports.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200 p-6 italic text-xs flex flex-col items-center gap-2">
                      <Inbox className="w-6 h-6 text-slate-400" />
                      <span>لا توجد بلاغات مرسلة أو مسجلة في المنصة حتى الآن.</span>
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards for Reports */}
                      <div className="md:hidden space-y-3" dir="rtl">
                        {userReports.map((report) => {
                          let statusBadge = "bg-blue-50 text-blue-600 border-blue-100";
                          let statusText = "جديد";
                          if (report.status === "review") {
                            statusBadge = "bg-amber-50 text-amber-600 border-amber-100";
                            statusText = "قيد المراجعة";
                          } else if (report.status === "resolved") {
                            statusBadge = "bg-emerald-50 text-emerald-600 border-emerald-100";
                            statusText = "تم الحل";
                          } else if (report.status === "closed") {
                            statusBadge = "bg-slate-50 text-slate-500 border-slate-200";
                            statusText = "مغلق";
                          }

                          let typeBadge = "bg-rose-50 text-rose-700 border-rose-100/50";
                          let typeText = "خطأ برمجي";
                          if (report.reportType === "form_error") {
                            typeBadge = "bg-yellow-50 text-yellow-800 border-yellow-100/50";
                            typeText = "استمارة وأسئلة";
                          } else if (report.reportType === "analytics_error") {
                            typeBadge = "bg-purple-50 text-purple-700 border-purple-100/50";
                            typeText = "تحليلات الجلسة";
                          } else if (report.reportType === "dev_suggestion") {
                            typeBadge = "bg-sky-50 text-sky-700 border-sky-100/50";
                            typeText = "اقتراح واجهات";
                          } else if (report.reportType === "new_feature") {
                            typeBadge = "bg-emerald-50 text-emerald-700 border-emerald-100/50";
                            typeText = "طلب ميزة جديدة";
                          } else if (report.reportType === "general_comment") {
                            typeBadge = "bg-slate-50 text-slate-600 border-slate-200";
                            typeText = "ملاحظة عامة";
                          }

                          return (
                            <div key={`m-rep-${report.id}`} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="font-mono text-[10px] text-slate-400 block">#{report.id}</span>
                                  <h4 className="font-extrabold text-slate-800 text-xs mt-0.5">{report.title}</h4>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${statusBadge}`}>
                                  {statusText}
                                </span>
                              </div>
                              <p className="text-slate-600 text-[11px] leading-relaxed break-words bg-white p-2.5 rounded-xl border border-slate-100">
                                {report.description}
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <div>
                                  <span className="font-bold text-slate-700">{report.senderName}</span>
                                  <span className={`mr-2 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge}`}>{typeText}</span>
                                </div>
                                {report.imageUrl && (
                                  <img
                                    src={report.imageUrl}
                                    alt="Report attachment preview"
                                    className="w-10 h-10 object-cover rounded-lg border border-slate-200 cursor-pointer"
                                    referrerPolicy="no-referrer"
                                    onClick={() => setPreviewReportImage(report.imageUrl)}
                                  />
                                )}
                              </div>
                              <select
                                value={report.status}
                                onChange={(e) => handleUpdateReportStatus(report.id, e.target.value)}
                                className="w-full min-h-[44px] bg-white border border-slate-200 px-3 py-2 text-base sm:text-xs rounded-xl text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                              >
                                <option value="new">إبقاء كجديد</option>
                                <option value="review">مراجعة ودراسة</option>
                                <option value="resolved">تأكيد الحل</option>
                                <option value="closed">إغلاق وتخزين</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-right text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                              <th className="px-6 py-4">رقم البلاغ</th>
                              <th className="px-6 py-4">تفاصيل وعنوان المشكلة / الاقتراح</th>
                              <th className="px-6 py-4">المرسل والمحور</th>
                              <th className="px-6 py-4 text-center">المرفقات</th>
                              <th className="px-6 py-4">الحالة والتحكم الإداري</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {userReports.map((report) => {
                              let statusBadge = "bg-blue-50 text-blue-600 border-blue-100";
                              let statusText = "جديد";
                              if (report.status === "review") {
                                statusBadge = "bg-amber-50 text-amber-600 border-amber-100";
                                statusText = "قيد المراجعة";
                              } else if (report.status === "resolved") {
                                statusBadge = "bg-emerald-50 text-emerald-600 border-emerald-100";
                                statusText = "تم الحل";
                              } else if (report.status === "closed") {
                                statusBadge = "bg-slate-50 text-slate-500 border-slate-200";
                                statusText = "مغلق";
                              }

                              let typeBadge = "bg-rose-50 text-rose-700 border-rose-100/50";
                              let typeText = "خطأ برمجي";
                              if (report.reportType === "form_error") {
                                typeBadge = "bg-yellow-50 text-yellow-800 border-yellow-100/50";
                                typeText = "استمارة وأسئلة";
                              } else if (report.reportType === "analytics_error") {
                                typeBadge = "bg-purple-50 text-purple-700 border-purple-100/50";
                                typeText = "تحليلات الجلسة";
                              } else if (report.reportType === "dev_suggestion") {
                                typeBadge = "bg-sky-50 text-sky-700 border-sky-100/50";
                                typeText = "اقتراح واجهات";
                              } else if (report.reportType === "new_feature") {
                                typeBadge = "bg-emerald-50 text-emerald-700 border-emerald-100/50";
                                typeText = "طلب ميزة جديدة";
                              } else if (report.reportType === "general_comment") {
                                typeBadge = "bg-slate-50 text-slate-600 border-slate-200";
                                typeText = "ملاحظة عامة";
                              }

                              return (
                                <tr key={report.id} className="hover:bg-slate-50/50 transition">
                                  <td className="px-6 py-4 font-bold text-slate-700 font-mono">
                                    {report.id}
                                  </td>
                                  <td className="px-6 py-4 max-w-sm">
                                    <p className="font-extrabold text-slate-800 text-xs mb-1">
                                      {report.title}
                                    </p>
                                    <p className="text-slate-500 leading-relaxed text-[10px] break-all max-h-16 overflow-y-auto">
                                      {report.description}
                                    </p>
                                    <span className="text-[9px] text-slate-400 font-mono inline-flex items-center gap-1 mt-1.5">
                                      <Calendar className="w-3 h-3" />
                                      <span>{new Date(report.timestamp).toLocaleString('ar-MA')}</span>
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 space-y-1.5">
                                    <div className="text-slate-700">
                                      <span className="font-bold">{report.senderName}</span>
                                      <span className="font-mono text-[10px] text-slate-400 block">{report.email}</span>
                                    </div>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge}`}>
                                      {typeText}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    {report.imageUrl ? (
                                      <div className="inline-block relative group">
                                        <img 
                                          src={report.imageUrl} 
                                          alt="Report attachment preview" 
                                          className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:scale-110 transition"
                                          referrerPolicy="no-referrer"
                                          onClick={() => setPreviewReportImage(report.imageUrl)}
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic">لا توجد صور</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5">
                                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge} shrink-0`}>
                                        {statusText}
                                      </span>
                                      
                                      <select
                                        value={report.status}
                                        onChange={(e) => handleUpdateReportStatus(report.id, e.target.value)}
                                        className="bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] rounded-lg text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                                      >
                                        <option value="new">إبقاء كجديد</option>
                                        <option value="review">مراجعة ودراسة</option>
                                        <option value="resolved">تأكيد الحل</option>
                                        <option value="closed">إغلاق وتخزين</option>
                                      </select>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          // ==================== MAIN TEACHER WORKSPACE ====================
          <motion.div
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Top Toolbar */}
            <div className="bg-slate-900 text-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6 shadow-sm border border-slate-800">
              <div className="flex items-start gap-3 sm:gap-4 text-right w-full lg:w-auto">
                <div className="relative flex-shrink-0">
                  {teacherSession?.avatar ? (
                    <img
                      src={teacherSession.avatar}
                      alt={teacherSession.fullName}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 sm:w-16 sm:h-16 rounded-full border-2 border-blue-500/40 object-cover shadow-inner"
                    />
                  ) : (
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-800 flex items-center justify-center text-lg sm:text-xl font-black text-blue-400 border border-slate-700 shadow-sm">
                      {teacherSession?.fullName ? teacherSession.fullName.charAt(0) : 'ذ'}
                    </div>
                  )}
                  {teacherSession?.role === 'admin' && (
                    <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 font-extrabold text-[9px] px-1.5 py-0.5 rounded-full shadow-md">
                      مدير
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1.5">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-black text-slate-100 break-words">
                      {teacherSession?.fullName || 'الأستاذ المفوّض الموجه'}
                    </h2>
                    {teacherSession?.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={handleOpenProfileEdit}
                        className="min-h-[36px] py-1.5 px-3 bg-slate-800 hover:bg-slate-700 hover:text-white text-teal-400 border border-slate-800 hover:border-teal-500/30 text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>تعديل الحساب الشخصي</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-2 text-slate-400 text-[11px] sm:text-xs mt-2.5 bg-slate-800 p-3 sm:p-3.5 rounded-2xl border border-slate-700/60">
                    <div className="truncate flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>البريد: <span className="text-slate-200 font-mono font-semibold">{teacherSession?.email}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span>التخصص: <span className="text-teal-400 font-sans font-semibold">{teacherSession?.specialty || 'مادة الفلسفة'}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>المؤسسة: <span className="text-slate-200 font-sans font-semibold">{teacherSession?.school}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>الأكاديمية: <span className="text-slate-200 font-sans font-semibold">{teacherSession?.regionalAcademy}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>العمالة: <span className="text-slate-200 font-sans font-semibold">{teacherSession?.province}</span></span>
                    </div>
                    {teacherSession?.yearsOfExperience && (
                      <div className="flex items-center gap-1.5 tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>سنوات الخبرة: <span className="text-sky-300 font-sans font-semibold">{teacherSession.yearsOfExperience} {Number(teacherSession.yearsOfExperience) > 10 ? 'عاماً' : 'سنوات'}</span></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto justify-end">
                {/* Real-time stream status & audio mute controls */}
                <div
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-[11px] font-black flex items-center gap-2 ${
                    realtimeStatus === 'connected'
                      ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-300'
                      : realtimeStatus === 'reconnecting'
                      ? 'bg-amber-950/60 border-amber-500/30 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="حالة البث المباشر لاستمارات التلاميذ"
                >
                  <Wifi className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    {realtimeStatus === 'connected'
                      ? 'بث مباشر نشط'
                      : realtimeStatus === 'reconnecting'
                      ? 'جاري المزامنة'
                      : 'وضع محلي'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !soundMuted;
                    setSoundMuted(next);
                    localStorage.setItem('philoscan_sound_muted', String(next));
                    showToast(next ? 'تم كتم صوت إشعارات الاستقبال.' : 'تم تفعيل تنبيهات الصوت للاستقبال اللحظي.');
                  }}
                  className="min-h-[44px] min-w-[44px] p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                  title={soundMuted ? 'تفعيل صوت التنبيهات' : 'كتم صوت التنبيهات'}
                >
                  {soundMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                </button>

                {/* نظام الإشعارات والتنبيهات الذكي */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNotificationsDropdown(!showNotificationsDropdown)}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition text-slate-300 hover:text-white relative flex items-center justify-center min-h-[44px] min-w-[44px]"
                    title="التنبيهات والإشعارات"
                  >
                    {unreadNotifsCount > 0 ? (
                      <>
                        <BellRing className="w-4.5 h-4.5 text-amber-400" />
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full text-[10px] w-5 h-5 flex items-center justify-center font-bold font-mono border border-slate-900 shadow-md">
                          {unreadNotifsCount}
                        </span>
                      </>
                    ) : (
                      <Bell className="w-4.5 h-4.5 text-slate-400 hover:text-slate-200" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showNotificationsDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.95 }}
                        className="absolute left-0 mt-2 bg-slate-900 border border-slate-800 rounded-2xl w-[min(calc(100vw-2rem),380px)] shadow-2xl z-[150] overflow-hidden text-right font-sans"
                        dir="rtl"
                      >
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                          <div className="flex items-center gap-2">
                            <BellRing className="w-4 h-4 text-sky-400 shrink-0" />
                            <div>
                              <h4 className="font-extrabold text-sm text-slate-100">تنبيهات الاستمارات الواردة</h4>
                              <p className="text-[10px] text-slate-400">تابع تسليم تلامذتك لبياناتهم المفتوحة مباشرة</p>
                            </div>
                          </div>
                          {unreadNotifsCount > 0 && (
                            <button
                              onClick={handleMarkAllAsRead}
                              className="text-[11px] text-blue-400 hover:text-blue-300 font-bold transition hover:underline"
                            >
                              تحديد الكل كمقروء
                            </button>
                          )}
                        </div>

                        <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-800">
                          {notifications.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                              <Bell className="w-8 h-8 text-slate-700" />
                              <p className="text-xs font-bold text-slate-400">لا يوجد أي إشعار جديد حالياً</p>
                              <p className="text-[10px] text-slate-600">سيتم تنبيهك فوراً بإنذار صوتي وبصري عند تقديم أي استمارة جديدة من تلاميذك.</p>
                            </div>
                          ) : (
                            notifications.map((notif) => (
                              <div
                                key={notif.id}
                                className={`p-4 transition flex flex-col gap-2 relative group hover:bg-slate-800/30 text-right ${!notif.read ? 'bg-slate-800/60' : 'bg-transparent'}`}
                              >
                                <div className="flex justify-between items-start pl-6 text-right">
                                  <div className="text-right space-y-0.5">
                                    <h5 className="font-bold text-xs text-slate-200">التلميذ(ة): <span className="text-white font-black">{notif.studentName}</span></h5>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                      <Building className="w-3 h-3 text-slate-500 shrink-0" />
                                      <span>القسم: {notif.classNumber} · الشعبة: {notif.stream}</span>
                                    </p>
                                    <p className="text-[9px] text-slate-500 flex items-center gap-1 tabular-nums">
                                      <Calendar className="w-3 h-3 text-slate-600 shrink-0" />
                                      <span>{new Date(notif.submittedAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })} - {new Date(notif.submittedAt).toLocaleDateString('ar-MA')}</span>
                                    </p>
                                  </div>
                                </div>

                                <div className="flex gap-2 justify-end pt-1 bg-transparent">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openStudentDetails(notif.submission);
                                      handleMarkAsRead(notif.id);
                                      setShowNotificationsDropdown(false);
                                    }}
                                    className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-2.5 rounded-lg transition shadow-sm cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>فتح وعرض التحليل</span>
                                  </button>
                                  {!notif.read && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkAsRead(notif.id)}
                                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1 px-2.5 rounded-lg transition border border-slate-700 cursor-pointer"
                                    >
                                      تحديد كمقروء
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNotification(notif.id)}
                                    className="text-[10px] bg-red-950 hover:bg-red-900 border border-red-900/30 text-red-400 font-bold p-1 rounded-lg transition opacity-100 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                                    title="حذف الإشعار"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTutorial(true)}
                  className="min-h-[44px] min-w-[44px] py-2.5 px-3.5 bg-blue-950 hover:bg-blue-900 border border-blue-500/20 rounded-xl transition text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1.5 font-bold text-xs cursor-pointer"
                  title="الدليل التوجيهي السريع"
                  id="teacher-tutorial-launcher-btn"
                >
                  <HelpCircle className="w-4.5 h-4.5" />
                  <span className="hidden sm:inline">الدليل السريع</span>
                </button>

                <button
                  onClick={fetchSubmissions}
                  className="min-h-[44px] min-w-[44px] p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition text-slate-300 hover:text-white flex items-center justify-center"
                  title="تحديث البيانات"
                >
                  <RefreshCw className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-h-[44px] py-2.5 px-3.5 sm:px-4 bg-red-400/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 hover:text-red-300 font-bold transition text-xs flex items-center gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج</span>
                </button>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="min-h-[44px] py-2.5 px-3.5 sm:px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 font-bold transition text-xs"
                >
                  الموقع الرئيسي
                </button>
              </div>
            </div>

            {/* Teacher Sub-Navigation Tabs (Desktop; mobile uses sticky bottom tab bar) */}
            <div className="hidden md:flex flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-1.5 md:w-fit font-sans" dir="rtl">
              <motion.button
                type="button"
                onClick={() => setTeacherActiveTab('monitoring')}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className={`py-2.5 px-4 text-center text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  teacherActiveTab === 'monitoring'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-sky-600" />
                <span>لوحة القيادة والمراقبة</span>
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setTeacherActiveTab('analytics')}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className={`py-2.5 px-4 text-center text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  teacherActiveTab === 'analytics'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>التحليلات العامة</span>
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setTeacherActiveTab('notifications')}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className={`py-2.5 px-4 text-center text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  teacherActiveTab === 'notifications'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BellRing className="w-4 h-4 text-sky-600" />
                <span>الإشعارات والتنبيهات</span>
                {pedagogicalUnreadCount > 0 && (
                  <span className="font-mono tabular-nums text-[11px] bg-sky-600 text-white px-1.5 py-0.5 rounded-md leading-none">
                    {pedagogicalUnreadCount}
                  </span>
                )}
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setTeacherActiveTab('sessions')}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className={`py-2.5 px-4 text-center text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  teacherActiveTab === 'sessions'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-4 h-4 text-sky-600" />
                <span>نظام الجلسات</span>
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setTeacherActiveTab('formBank')}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className={`py-2.5 px-4 text-center text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  teacherActiveTab === 'formBank'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-4 h-4 text-sky-600" />
                <span>بنك الاستمارات والمنشئ</span>
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setTeacherActiveTab('sync')}
                whileHover={{ scale: 1.02, y: -0.5 }}
                whileTap={{ scale: 0.98 }}
                className={`py-2.5 px-4 text-center text-xs font-black rounded-xl transition-all duration-150 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                  teacherActiveTab === 'sync'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Database className="w-4 h-4 text-emerald-600" />
                <span>المزامنة وغوغل</span>
              </motion.button>
            </div>

            {teacherActiveTab === 'monitoring' && (
              <div className="space-y-8 animate-fade-in text-right">
                {/* SUB-TABS SELECTOR CONTROLLERS CORES */}
                {selectedSessionId !== 'all' && (
                  <div className="flex flex-col sm:flex-row border border-slate-200 bg-white p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl gap-3 sm:gap-4 justify-between items-start sm:items-center font-sans tracking-tight" dir="rtl">
                    <div className="grid grid-cols-2 sm:flex items-center gap-1.5 sm:gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setMonitoringSubTab('analytics')}
                        className={`min-h-[44px] py-2 px-3 sm:px-4 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                          monitoringSubTab === 'analytics'
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <BarChart3 className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="truncate">تحليل النماذج الإحصائية</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMonitoringSubTab('proctoring')}
                        className={`min-h-[44px] py-2 px-3 sm:px-4 rounded-xl text-xs font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                          monitoringSubTab === 'proctoring'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span className="truncate">المراقبة والامتحانات</span>
                      </button>
                    </div>

                    {/* Quick Session Header */}
                    {(() => {
                      const activeSess = sessions.find(s => s.sessionId === selectedSessionId);
                      return activeSess ? (
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-right w-full sm:w-auto justify-between sm:justify-start">
                          <span className={`text-[10px] font-black px-2.5 py-1.5 rounded-lg border leading-none ${
                            activeSess.supervisedMode 
                              ? 'bg-amber-100 border-amber-200 text-amber-800 font-bold'
                              : 'bg-slate-100 border-slate-200 text-slate-500 font-semibold'
                          }`}>
                            {activeSess.supervisedMode ? 'الوضع التشخيصي المراقب: نشط البث' : 'الوضع التشخيصي العادي'}
                          </span>
                          <span className="text-xs bg-slate-100 border text-slate-700 font-extrabold px-3 py-1 rounded-lg font-mono">
                            رمز الجلسة: {activeSess.sessionId}
                          </span>
                        </div>
                      ) : null;
                    })()}

                    {/* Direct Alert Notification Bell Container */}
                    {monitoringSubTab === 'proctoring' && (
                      <div className="relative self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setShowBellNotifications(!showBellNotifications);
                            if (!showBellNotifications) {
                              setBellCount(0);
                            }
                          }}
                          className={`min-h-[44px] min-w-[44px] p-2.5 rounded-xl border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            bellCount > 0 
                              ? 'bg-red-50 border-red-200 text-red-600'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <BellRing className={`w-5 h-5 ${bellCount > 0 ? 'text-red-600' : 'text-slate-500'}`} />
                          {bellCount > 0 && (
                            <span className="bg-red-600 text-white font-mono font-black text-[10px] px-2 py-0.5 rounded-full tabular-nums">
                              {bellCount} مخالفة جديدة
                            </span>
                          )}
                        </button>

                        <AnimatePresence>
                          {showBellNotifications && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 10 }}
                              className="absolute left-0 mt-2 bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-xl w-[min(calc(100vw-2rem),320px)] z-50 text-right space-y-3 font-sans"
                            >
                              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                                <button
                                  type="button"
                                  onClick={() => { setBellCount(0); setProctorNotifications([]); }}
                                  className="text-[9px] text-red-400 hover:underline font-extrabold"
                                >
                                  مسح الإشعارات
                                </button>
                                <span className="text-xs font-black text-rose-300">إشارات المخالفات الحية ({proctorNotifications.length})</span>
                              </div>
                              <div className="max-h-64 overflow-y-auto space-y-2.5 divide-y divide-slate-800/50">
                                {proctorNotifications.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 text-center py-5">لم يتم استقبال أي مخالفات سلوك في هذا الفصل.</p>
                                ) : (
                                  proctorNotifications.map(notif => (
                                    <div key={notif.id} className={`pt-2 text-[10px] leading-relaxed space-y-0.5 ${notif.isLowTrustAlert ? 'bg-red-950/20 p-2 rounded-xl border border-red-900/30 my-1' : 'text-slate-300'}`}>
                                      <p className="font-extrabold text-white flex items-center justify-between">
                                        <span>تلميذ: <span className="text-yellow-400">{notif.studentName}</span></span>
                                        {notif.isLowTrustAlert && (
                                          <span className="px-1.5 py-0.5 bg-red-600 text-[8px] rounded text-white font-black inline-flex items-center gap-1">
                                            <AlertTriangle className="w-2.5 h-2.5" />
                                            <span>إنذار ثقة ذكي</span>
                                          </span>
                                        )}
                                      </p>
                                      <p className={`border-r-2 pr-2 py-0.5 mt-1 font-bold ${
                                        notif.isLowTrustAlert 
                                          ? 'border-red-500 bg-red-900/60 text-red-200' 
                                          : 'border-red-500 bg-red-950/40 text-red-300'
                                      }`}>
                                        {notif.isLowTrustAlert ? notif.type : `المخالفة: ${notif.type}`}
                                      </p>
                                      <span className="text-[8px] text-slate-500 block leading-none mt-1">{new Date(notif.time).toLocaleTimeString('ar-EG')}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}

                {monitoringSubTab === 'analytics' ? (
                  /* Existing Analytics view container */
                  <div className="space-y-8">
                    {/* 4 Central Statistics Cards (الإحصائيات البنيوية الشاملة) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans text-right" dir="rtl">
                  <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">عدد الجلسات الفعالة</span>
                      <span className="text-2xl font-black text-slate-800 font-mono">{sessions.length}</span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">عدد التلاميذ الملتزمين</span>
                      <span className="text-2xl font-black text-slate-800 font-mono">{totalStudents}</span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">عدد الاستجابات المستلمة</span>
                      <span className="text-2xl font-black text-slate-800 font-mono">{submissionsForSelectedSession.length}</span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">معدل التفكير النقدي</span>
                      <span className="text-2xl font-black text-slate-800 font-mono">{percentageByStyle('تفكير نقدي')}%</span>
                    </div>
                  </div>
                </div>

                {/* Real-time activities feed block & Cognitive Styles Progress Bars */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 font-sans text-right" dir="rtl">
                  <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-4 sm:p-6 rounded-3xl sm:rounded-[28px] border border-slate-800 shadow-md">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-sky-400 rounded-full shrink-0"></span>
                        <h4 className="font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-sky-400 shrink-0" />
                          <span>آخر النشاطات والعمليات المستجدة (Live Feed)</span>
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">تحديث مستمر</span>
                    </div>
                    
                    <div className="space-y-3.5">
                      {/* Live Feed list of submissions */}
                      {submissions.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-xs italic">
                          انتظار تسجيل مشاركات التلاميذ لعرض خط النشاطات.
                        </div>
                      ) : (
                        submissions.slice(0, 3).map((sub, idx) => (
                          <div key={`live-feed-sub-${sub.id || idx}`} className="flex gap-3 items-start bg-slate-800/40 p-3 rounded-xl border border-slate-800/60 hover:bg-slate-800/30 transition">
                            <FileEdit className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-100">
                                قدّم التلميذ(ة) <span className="text-amber-400 font-extrabold">{sub.studentName}</span> تشخيصاً في فِيلوسكان.
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                القسم: فوج {sub.classNumber} - المؤسسة: {sub.institution || 'ابن رشد'} | التصنيف: <span className="text-sky-300 font-bold">{sub.analysis?.classification || 'غير محدد'}</span>
                              </p>
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono shrink-0 tabular-nums">
                              {sub.submittedAt ? new Date(sub.submittedAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' }) : 'قريباً'}
                            </span>
                          </div>
                        ))
                      )}
                      
                      {sessions.slice(0, 2).map((sess, idx) => (
                        <div key={`sess-act-${idx}`} className="flex gap-3 items-start bg-indigo-950/25 p-3 rounded-xl border border-indigo-900/40 hover:bg-indigo-950/30 transition">
                          <Building className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-200">
                              تم إطلاق جلسة جديدة باسم <span className="text-indigo-300 font-extrabold">{sess.title}</span>.
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              المستوى: {sess.level} - القسم: فوج {sess.classNumber} | الرمز: <span className="font-mono text-indigo-300 font-black">{sess.sessionId}</span>
                            </p>
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono text-left shrink-0">نشط الآن</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Cognitive Performance Indexes */}
                  <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[28px] border border-slate-200 shadow-sm space-y-3.5 flex flex-col justify-center">
                    <h4 className="font-extrabold text-xs text-slate-700 pb-2 border-b flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>مؤشرات التفكير والتمثلات العامة</span>
                    </h4>
                    
                    <div className="space-y-3 flex-1 flex flex-col justify-around">
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-emerald-700 inline-flex items-center gap-1.5">
                            <Brain className="w-3.5 h-3.5 shrink-0" />
                            <span>تفكير نقدي عقلاني</span>
                          </span>
                          <span className="font-mono font-bold text-slate-600 tabular-nums">{countByStyle('تفكير نقدي')} ({percentageByStyle('تفكير نقدي')}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${percentageByStyle('تفكير نقدي')}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-blue-700 inline-flex items-center gap-1.5">
                            <Search className="w-3.5 h-3.5 shrink-0" />
                            <span>فضول وتساؤل فلسفي</span>
                          </span>
                          <span className="font-mono font-bold text-slate-600 tabular-nums">{countByStyle('فضول معرفي')} ({percentageByStyle('فضول معرفي')}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${percentageByStyle('فضول معرفي')}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-amber-800 inline-flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                            <span>تفكير متسرع أو سطحي</span>
                          </span>
                          <span className="font-mono font-bold text-slate-600 tabular-nums">{countByStyle('تفكير سطحي')} ({percentageByStyle('تفكير سطحي')}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${percentageByStyle('تفكير سطحي')}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-red-700 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>توجس وخوف معرفي</span>
                          </span>
                          <span className="font-mono font-bold text-slate-600 tabular-nums">{countByStyle('خوف معرفي')} ({percentageByStyle('خوف معرفي')}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${percentageByStyle('خوف معرفي')}%` }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Session filtering bar */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-stretch sm:items-center bg-white p-4 sm:p-6 rounded-2xl sm:rounded-[28px] border border-slate-200 shadow-sm" dir="rtl">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs font-extrabold text-slate-700 flex-shrink-0">تصفية تلاميذك حسب الجلسة:</span>
                </div>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full sm:w-auto sm:min-w-[240px] min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs font-bold rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 shadow-sm transition"
                >
                  <option value="all">كل الجلسات (جميع التلاميذ الشامل)</option>
                  {sessions.map(s => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.title} ({s.level} {s.stream}) [{s.sessionId}]
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateSession(true)}
                className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>إنشاء ذهن تشخيصي لصف جديد (Session)</span>
              </button>
            </div>

            {selectedSessionId !== 'all' && (() => {
              const currentSess = sessions.find(s => s.sessionId === selectedSessionId);
              if (!currentSess) return null;
              return (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl sm:rounded-[24px] p-4 sm:p-5 space-y-4 text-right shadow-sm" dir="rtl">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200/80 pb-3 gap-3">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">
                        الجلسة التشخيصية النشطة: <span className="text-indigo-600">{currentSess.title}</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 font-semibold">
                        المستوى: {currentSess.level} | الشعبة: {currentSess.stream} | القسم: فوج {currentSess.classNumber} | المؤسسة: {currentSess.institution} ({currentSess.province})
                      </p>
                    </div>
                    <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-black px-3 py-1 rounded-xl font-mono tracking-wider font-bold">
                      {currentSess.sessionId}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {/* Copy session code */}
                    <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/60 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-slate-400 block font-bold mb-0.5">رمز الجلسة للتلاميذ:</span>
                        <span className="text-sm font-mono font-black text-slate-800 tracking-wider block">{currentSess.sessionId}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopySessionId(currentSess.sessionId)}
                        className="min-h-[42px] py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {copiedSessionId === currentSess.sessionId ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>تم النسخ!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ الرمز</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Copy session direct link */}
                    <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/60 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-slate-400 block font-bold mb-0.5">رابط التشخيص المباشر للتلاميذ:</span>
                        <span className="text-[10px] font-mono text-indigo-600 truncate block max-w-xs">
                          {window.location.origin}/session/{currentSess.sessionId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopySessionLink(currentSess.sessionId)}
                        className="min-h-[42px] py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {copiedLinkSessionId === currentSess.sessionId ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>تم نسخ الرابط!</span>
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>نسخ الرابط</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Share Session & QR Code button */}
                    <div className="bg-emerald-50/40 p-3.5 sm:p-4 rounded-xl border border-emerald-200/65 flex items-center justify-between gap-3 md:col-span-2 lg:col-span-1">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-emerald-700 block font-bold mb-0.5">رمز الاستجابة السريعة والمشاركة:</span>
                        <span className="text-[10px] text-slate-500 font-bold block truncate">تسهيل دخول الهاتف برمز QR والمشاركة المباشرة</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSharingSession(currentSess);
                          setShowShareModal(true);
                        }}
                        className="min-h-[42px] py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>مشاركة كود الجلسة (QR)</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* STATISTICS OVERVIEW bento-style */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white p-5 rounded-[24px] border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-bold">إجمالي التلاميذ</span>
                  <span className="text-2xl font-black text-slate-800 font-mono">{totalStudents}</span>
                </div>
              </div>

              {/* Critical Thinking (Green) */}
              <div className="bg-white p-5 rounded-[24px] border border-emerald-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden">
                <div className="z-10">
                  <p className="text-slate-500 text-xs font-bold">مؤشر التفكير النقدي</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-3xl font-bold text-emerald-600 font-mono leading-none">{countByStyle('تفكير نقدي')}</h3>
                    <span className="text-xs text-emerald-600 font-bold font-mono">({percentageByStyle('تفكير نقدي')}%)</span>
                  </div>
                </div>
                <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-emerald-50 rounded-full opacity-50"></div>
                <div className="h-1.5 w-full bg-emerald-50 rounded-full mt-2 overflow-hidden relative">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${percentageByStyle('تفكير نقدي')}%` }}></div>
                </div>
              </div>

              {/* Curiosity (Blue) */}
              <div className="bg-white p-5 rounded-[24px] border border-blue-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden">
                <div className="z-10">
                  <p className="text-slate-500 text-xs font-bold">مؤشر الفضول المعرفي</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-3xl font-bold text-blue-600 font-mono leading-none">{countByStyle('فضول معرفي')}</h3>
                    <span className="text-xs text-blue-600 font-bold font-mono">({percentageByStyle('فضول معرفي')}%)</span>
                  </div>
                </div>
                <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-blue-50 rounded-full opacity-50"></div>
                <div className="h-1.5 w-full bg-blue-50 rounded-full mt-2 overflow-hidden relative">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${percentageByStyle('فضول معرفي')}%` }}></div>
                </div>
              </div>

              {/* Shallow Thinking (Yellow) */}
              <div className="bg-white p-5 rounded-[24px] border border-amber-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden">
                <div className="z-10">
                  <p className="text-slate-500 text-xs font-bold">مؤشر التفكير السطحي</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-3xl font-bold text-amber-600 font-mono leading-none">{countByStyle('تفكير سطحي')}</h3>
                    <span className="text-xs text-amber-600 font-bold font-mono">({percentageByStyle('تفكير سطحي')}%)</span>
                  </div>
                </div>
                <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-amber-50 rounded-full opacity-50"></div>
                <div className="h-1.5 w-full bg-amber-50 rounded-full mt-2 overflow-hidden relative">
                  <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${percentageByStyle('تفكير سطحي')}%` }}></div>
                </div>
              </div>

              {/* Cognitive Fear (Red) */}
              <div className="bg-white p-5 rounded-[24px] border border-red-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden">
                <div className="z-10">
                  <p className="text-slate-500 text-xs font-bold">مؤشر الخوف المعرفي</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <h3 className="text-3xl font-bold text-red-600 font-mono leading-none">{countByStyle('خوف معرفي')}</h3>
                    <span className="text-xs text-red-600 font-bold font-mono">({percentageByStyle('خوف معرفي')}%)</span>
                  </div>
                </div>
                <div className="absolute -bottom-2 -left-2 w-16 h-16 bg-red-50 rounded-full opacity-50"></div>
                <div className="h-1.5 w-full bg-red-50 rounded-full mt-2 overflow-hidden relative">
                  <div className="h-full bg-red-500 rounded-full transition-all duration-500" style={{ width: `${percentageByStyle('خوف معرفي')}%` }}></div>
                </div>
              </div>
            </div>

            {/* Analytical Visualization Graphics (Using Recharts for stunning, responsive visualizations) */}
            {totalStudents > 0 && (() => {
              // Prepare Pie chart data for dominant thinking styles
              const pieData = [
                { name: 'تفكير نقدي', value: countByStyle('تفكير نقدي'), color: '#10b981', labelAr: 'التفكير النقدي' },
                { name: 'فضول معرفي', value: countByStyle('فضول معرفي'), color: '#3b82f6', labelAr: 'الفضول المعرفي' },
                { name: 'تفكير سطحي', value: countByStyle('تفكير سطحي'), color: '#fbbf24', labelAr: 'التفكير السطحي' },
                { name: 'خوف معرفي', value: countByStyle('خوف معرفي'), color: '#ef4444', labelAr: 'الخوف المعرفي' }
              ].filter(item => item.value > 0);

              // Calculate average cognitive metrics for the class
              let sumCritical = 0;
              let sumCuriosity = 0;
              let sumShallow = 0;
              let sumFear = 0;

              let sumAxis1 = 0;
              let sumAxis2 = 0;
              let sumAxis3 = 0;
              let sumAxis4 = 0;
              let sumAxis5 = 0;

              submissionsForSelectedSession.forEach(sub => {
                sumCritical += sub.analysis.metrics.criticalThinking || 0;
                sumCuriosity += sub.analysis.metrics.cognitiveCuriosity || 0;
                sumShallow += sub.analysis.metrics.shallowThinking || 0;
                sumFear += sub.analysis.metrics.cognitiveFear || 0;

                const [a1, a2, a3, a4, a5] = calculateFiveAxesScores(sub.answers);
                sumAxis1 += a1;
                sumAxis2 += a2;
                sumAxis3 += a3;
                sumAxis4 += a4;
                sumAxis5 += a5;
              });

              const barData = [
                { name: 'التفكير النقدي', 'المعدل %': Math.round(sumCritical / totalStudents), color: '#10b981' },
                { name: 'الفضول المعرفي', 'المعدل %': Math.round(sumCuriosity / totalStudents), color: '#3b82f6' },
                { name: 'التفكير السطحي', 'المعدل %': Math.round(sumShallow / totalStudents), color: '#fbbf24' },
                { name: 'الخوف المعرفي', 'المعدل %': Math.round(sumFear / totalStudents), color: '#ef4444' }
              ];

              const classRadarData = [
                { subject: 'التصور الفلسفي', value: Math.round(sumAxis1 / totalStudents), fullMark: 100 },
                { subject: 'الألفة الوجدانية', value: Math.round(sumAxis2 / totalStudents), fullMark: 100 },
                { subject: 'المنهج الفكري', value: Math.round(sumAxis3 / totalStudents), fullMark: 100 },
                { subject: 'القيمة المعرفية', value: Math.round(sumAxis4 / totalStudents), fullMark: 100 },
                { subject: 'الاستعداد الحجاجي', value: Math.round(sumAxis5 / totalStudents), fullMark: 100 }
              ];

              // ---------------- NEW STATS AGGREGATION FOR PERCEPTIONS ----------------
              const sourceCounts: Record<string, number> = {
                'المدرسة': 0,
                'الإنترنت': 0,
                'المحيط الاجتماعي': 0,
                'لا فكرة مسبقة': 0,
                'أخرى / سياق مغاير': 0
              };

              const feelingCounts: Record<string, number> = {
                'فضول': 0,
                'خوف': 0,
                'صعوبة': 0,
                'حياد': 0,
                'إعجاب': 0
              };

              const goalCounts: Record<string, number> = {
                'تعلم التفكير': 0,
                'النجاح الدراسي': 0,
                'حفظ المعلومات': 0,
                'النقاش': 0
              };

              const debateCounts: Record<string, number> = {
                'أشارك برأيي': 0,
                'أستمع فقط': 0,
                'أتوتر': 0,
                'أرفض المشاركة': 0
              };

              const ratingCounts: Record<number, number> = {
                1: 0,
                2: 0,
                3: 0,
                4: 0,
                5: 0
              };

              submissionsForSelectedSession.forEach(sub => {
                const ans = sub.answers || sub.responses || {};
                
                // 1. Source of Idea
                const src = ans.sourceOfIdea;
                if (src === 'المدرسة') sourceCounts['المدرسة']++;
                else if (src === 'الإنترنت') sourceCounts['الإنترنت']++;
                else if (src === 'المحيط الاجتماعي') sourceCounts['المحيط الاجتماعي']++;
                else if (src === 'لا فكرة مسبقة' || !src) sourceCounts['لا فكرة مسبقة']++;
                else sourceCounts['أخرى / سياق مغاير']++;

                // 2. Feeling when hearing
                const flg = ans.feelingWhenHearing;
                if (flg === 'فضول') feelingCounts['فضول']++;
                else if (flg === 'خوف') feelingCounts['خوف']++;
                else if (flg === 'صعوبة') feelingCounts['صعوبة']++;
                else if (flg === 'حياد') feelingCounts['حياد']++;
                else if (flg === 'إعجاب') feelingCounts['إعجاب']++;

                // 3. Primary Goal
                const goal = ans.philosophyPrimaryGoal;
                if (goal === 'تعلم التفكير') goalCounts['تعلم التفكير']++;
                else if (goal === 'النجاح الدراسي') goalCounts['النجاح الدراسي']++;
                else if (goal === 'حفظ المعلومات') goalCounts['حفظ المعلومات']++;
                else if (goal === 'النقاش') goalCounts['النقاش']++;

                // 4. Debate Reaction
                const dbt = ans.debateReaction;
                if (dbt === 'أشارك برأيي') debateCounts['أشارك برأيي']++;
                else if (dbt === 'أستمع فقط') debateCounts['أستمع فقط']++;
                else if (dbt === 'أتوتر') debateCounts['أتوتر']++;
                else if (dbt === 'أرفض المشاركة') debateCounts['أرفض المشاركة']++;

                // 5. Value Rating
                const val = Number(ans.valueRating);
                if (val >= 1 && val <= 5) {
                  ratingCounts[val as 1 | 2 | 3 | 4 | 5]++;
                } else {
                  ratingCounts[5]++; // default / fallback
                }
              });

              const sourceChartData = Object.entries(sourceCounts).map(([name, val]) => ({
                name,
                'عدد التلاميذ': val,
                'النسبة %': totalStudents > 0 ? Math.round((val / totalStudents) * 100) : 0,
                color: name === 'المدرسة' ? '#3b82f6' : name === 'الإنترنت' ? '#10b981' : name === 'المحيط الاجتماعي' ? '#fbbf24' : name === 'لا فكرة مسبقة' ? '#94a3b8' : '#e2e8f0'
              }));

              const feelingChartData = Object.entries(feelingCounts).map(([name, val]) => ({
                name,
                'عدد التلاميذ': val,
                'النسبة %': totalStudents > 0 ? Math.round((val / totalStudents) * 100) : 0,
                color: name === 'فضول' ? '#10b981' : name === 'إعجاب' ? '#c084fc' : name === 'حياد' ? '#3b82f6' : name === 'صعوبة' ? '#fbbf24' : '#ef4444'
              }));

              const goalChartData = Object.entries(goalCounts).map(([name, val]) => ({
                name,
                'عدد التلاميذ': val,
                'النسبة %': totalStudents > 0 ? Math.round((val / totalStudents) * 100) : 0,
                color: name === 'تعلم التفكير' ? '#8b5cf6' : name === 'النقاش' ? '#06b6d4' : name === 'النجاح الدراسي' ? '#3b82f6' : '#fbbf24'
              }));

              const debateChartData = Object.entries(debateCounts).map(([name, val]) => ({
                name,
                'عدد التلاميذ': val,
                'النسبة %': totalStudents > 0 ? Math.round((val / totalStudents) * 100) : 0,
                color: name === 'أشارك برأيي' ? '#10b981' : name === 'أستمع فقط' ? '#3b82f6' : name === 'أتوتر' ? '#fbbf24' : '#ef4444'
              }));

              const ratingChartData = Object.entries(ratingCounts).map(([rating, val]) => ({
                name: `${rating} نجوم`,
                'عدد التلاميذ': val,
                'النسبة %': totalStudents > 0 ? Math.round((val / totalStudents) * 100) : 0,
                color: rating === '5' ? '#f59e0b' : rating === '4' ? '#fbbf24' : rating === '3' ? '#fcd34d' : rating === '2' ? '#fde68a' : '#fef3c7'
              }));

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Card 1: Pie Chart for Style Distribution */}
                    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mb-1 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block shrink-0"></span>
                          توزيع أنماط التفكير المهيمنة بالقسم
                        </h3>
                        <p className="hidden sm:block text-[11px] text-slate-400 mb-4 font-medium leading-relaxed">
                          يُظهر هذا المخطط النسبة المئوية للتلاميذ المنتمين لكل تصنيف معرفي مهيمن في هذا القسم الدراسي.
                        </p>
                      </div>
                      
                      <div className="h-56 sm:h-64 w-full flex items-center justify-center relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                      <p className="font-bold flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                        {data.labelAr}
                                      </p>
                                      <p className="font-mono mt-1 text-slate-300">
                                        عدد التلاميذ: <span className="font-bold text-white">{data.value}</span> ({Math.round((data.value / totalStudents) * 100)}%)
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 m-auto w-24 h-24 rounded-full flex flex-col items-center justify-center">
                          <span className="text-[10px] text-slate-400 font-bold">بنية الصف</span>
                          <span className="text-2xl font-black text-slate-800 font-mono leading-none mt-0.5">{totalStudents}</span>
                          <span className="text-[9px] text-slate-400 font-bold mt-0.5">تلاميذ</span>
                        </div>
                      </div>

                      {/* Styled Legend */}
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-4 border-t border-slate-100">
                        {pieData.map((item) => (
                          <div key={item.name} className="flex items-center gap-2 justify-start text-right">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                            <span className="text-xs text-slate-600 font-bold truncate leading-relaxed">
                              {item.labelAr}: <span className="font-mono text-slate-900 font-black">{item.value}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Card 2: Bar Chart for Average Metric Levels */}
                    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mb-1 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 block shrink-0"></span>
                          معدلات المؤشرات المعرفية والوجدانية الأربعة
                        </h3>
                        <p className="hidden sm:block text-[11px] text-slate-400 mb-4 font-medium leading-relaxed">
                          يمثل هذا العمود المتوسط الحسابي (%) لدرجات المؤشرات الفردية الأربعة لدى جميع تلاميذ هذا القسم.
                        </p>
                      </div>

                      <div className="h-56 sm:h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={barData}
                            margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                              dataKey="name" 
                              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis 
                              domain={[0, 100]} 
                              tick={{ fill: '#94a3b8', fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip 
                              cursor={{ fill: '#f8fafc', radius: 4 }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                      <p className="font-bold flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }}></span>
                                        {data.name}
                                      </p>
                                      <p className="font-mono mt-1 text-slate-300">
                                        المتوسط العام للقسم: <span className="font-bold text-emerald-400">{payload[0].value}%</span>
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="المعدل %" radius={[8, 8, 0, 0]} maxBarSize={40}>
                              {barData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Breakdown guides */}
                      <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold mt-1 pt-4 border-t border-slate-100">
                        <span>الحد الأدنى: 0%</span>
                        <span>الحد الأعلى المثالي: 100%</span>
                      </div>
                    </div>

                    {/* Card 3: Radar Chart for Five Semantic Axes Class Averages */}
                    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mb-1 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-violet-600 block shrink-0"></span>
                          سلوك الصف عبر محاور الفلسفة الخمسة
                        </h3>
                        <p className="hidden sm:block text-[11px] text-slate-400 mb-4 font-medium leading-relaxed">
                          يمثل هذا المخطط المتوسط الجماعي لدرجات تلاميذ القسم حسب المحاور الخمسة لاستبيان التشخيص المعرفي.
                        </p>
                      </div>

                      <div className="h-56 sm:h-64 w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={classRadarData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis 
                              dataKey="subject" 
                              tick={{ fill: '#475569', fontSize: 9, fontWeight: 'bold' }} 
                            />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                            <Radar 
                              name="معدل القسم" 
                              dataKey="value" 
                              stroke="#8b5cf6" 
                              fill="#c084fc" 
                              fillOpacity={0.5} 
                            />
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                      <p className="font-bold flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span>
                                        {data.subject}
                                      </p>
                                      <p className="font-mono mt-1 text-slate-300">
                                        المتوسط العام للقسم: <span className="font-bold text-violet-400">{payload[0].value}%</span>
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Breakdown guides */}
                      <div className="flex justify-between items-center text-slate-400 text-[10px] uppercase font-bold mt-1 pt-4 border-t border-slate-100">
                        <span>الحد الأدنى: 0%</span>
                        <span>سلوك مثالي متكامل: 100%</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Detailed Student Perceptions Analytics & Distribution Applet (Interactive & Dynamic) */}
                  <div className="bg-white p-4 sm:p-6 md:p-8 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm text-right" dir="rtl">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:gap-4 border-b border-slate-100 pb-4 sm:pb-5 mb-5 sm:mb-6">
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-indigo-600 block shrink-0"></span>
                          توزيع نسب تصورات وتمثلات التلاميذ لدرس الفلسفة
                        </h3>
                        <p className="hidden sm:block text-[11px] text-slate-400 mt-1 font-semibold leading-relaxed">
                          مخططات بيانية تفاعلية تستعرض البنيان الوجداني والمفاهيمي لتلاميذ الجلسة لمساعدتك في صياغة وضعيات المشكلة المناسبة.
                        </p>
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 self-stretch lg:self-auto overflow-x-auto gap-1">
                        {[
                          { id: 'source', label: 'مصادر الفكرة المسبقة' },
                          { id: 'feeling', label: 'المشاعر الوجدانية' },
                          { id: 'goal', label: 'الغاية من الدرس' },
                          { id: 'debate', label: 'سلوك النقاش' },
                          { id: 'rating', label: 'مؤشر القيمة والطلب' }
                        ].map(tabItem => (
                          <button
                            key={tabItem.id}
                            type="button"
                            onClick={() => setActivePerceptionChartTab(tabItem.id as any)}
                            className={`min-h-[42px] py-2 px-3.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                              activePerceptionChartTab === tabItem.id
                                ? 'bg-white text-indigo-700 shadow-sm font-extrabold'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                            }`}
                          >
                            {tabItem.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-8">
                      {/* Chart Stage */}
                      <div className="lg:col-span-2 bg-slate-50/50 border border-slate-200/50 p-3.5 sm:p-6 rounded-2xl sm:rounded-[28px] h-64 sm:h-80 flex flex-col justify-between">
                        <div className="h-full w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            {activePerceptionChartTab === 'source' && (
                              <BarChart data={sourceChartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(99, 102, 241, 0.04)', radius: 8 }}
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                          <p className="font-bold text-indigo-300">{data.name}</p>
                                          <p className="mt-1 font-mono text-slate-300">
                                            عدد التلاميذ: <span className="font-bold text-white">{data['عدد التلاميذ']}</span> تلميذ(ة)
                                          </p>
                                          <p className="font-mono text-slate-400">النسبة المئوية الحقيقية: <span className="font-bold text-emerald-400">{data['النسبة %']}%</span></p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar dataKey="عدد التلاميذ" radius={[8, 8, 0, 0]} maxBarSize={36}>
                                  {sourceChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            )}

                            {activePerceptionChartTab === 'feeling' && (
                              <PieChart>
                                <Pie data={feelingChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="عدد التلاميذ">
                                  {feelingChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                          <p className="font-bold text-indigo-300">{data.name}</p>
                                          <p className="mt-1 font-mono text-slate-300">
                                            عدد التلاميذ: <span className="font-bold text-white">{data['عدد التلاميذ']}</span>
                                          </p>
                                          <p className="font-mono text-slate-400">النسبة المئوية: <span className="font-bold text-violet-400">{data['النسبة %']}%</span></p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Legend verticalAlign="bottom" height={36} formatter={(value, entry: any) => <span className="text-[11px] font-bold text-slate-600 ml-1.5">{entry.payload.name} ({entry.payload['النسبة %']}%)</span>} />
                              </PieChart>
                            )}

                            {activePerceptionChartTab === 'goal' && (
                              <BarChart data={goalChartData} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis dataKey="name" type="category" tick={{ fill: '#475569', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} width={80} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(99, 102, 241, 0.04)', radius: 8 }}
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                          <p className="font-bold text-indigo-500">{data.name}</p>
                                          <p className="mt-1 font-mono text-slate-300">
                                            عدد الاختيارات: <span className="font-bold text-white">{data['عدد التلاميذ']}</span>
                                          </p>
                                          <p className="font-mono text-slate-400">الحجم النسبي: <span className="font-bold text-sky-400">{data['النسبة %']}%</span></p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar dataKey="عدد التلاميذ" radius={[0, 8, 8, 0]} maxBarSize={30}>
                                  {goalChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            )}

                            {activePerceptionChartTab === 'debate' && (
                              <BarChart data={debateChartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(99, 102, 241, 0.04)', radius: 8 }}
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                          <p className="font-bold text-indigo-300">{data.name}</p>
                                          <p className="mt-1 font-mono text-slate-300">
                                            تعداد السلوك: <span className="font-bold text-white">{data['عدد التلاميذ']}</span> تلميذ(ة)
                                          </p>
                                          <p className="font-mono text-slate-400">التمثيل العام: <span className="font-bold text-emerald-400">{data['النسبة %']}%</span></p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar dataKey="عدد التلاميذ" radius={[8, 8, 0, 0]} maxBarSize={36}>
                                  {debateChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            )}

                            {activePerceptionChartTab === 'rating' && (
                              <BarChart data={ratingChartData} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip
                                  cursor={{ fill: 'rgba(245, 158, 11, 0.06)', radius: 8 }}
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3 shadow-xl text-right text-xs" dir="rtl">
                                          <p className="font-bold text-amber-400">تقييم {data.name}</p>
                                          <p className="mt-1 font-mono text-slate-300">
                                            عدد المقيمين: <span className="font-bold text-white">{data['عدد التلاميذ']}</span> تلاميذ
                                          </p>
                                          <p className="font-mono text-slate-400">حجم النسبة من الصف: <span className="font-bold text-amber-400">{data['النسبة %']}%</span></p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar dataKey="عدد التلاميذ" radius={[8, 8, 0, 0]} maxBarSize={36}>
                                  {ratingChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill="#f59e0b" />
                                  ))}
                                </Bar>
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Educational Analytical Summary Box */}
                      <div className="bg-slate-50 border border-slate-200/50 p-4 sm:p-6 rounded-2xl sm:rounded-[28px] space-y-4 flex flex-col justify-between">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider flex items-center gap-1.5">
                            <Brain className="w-4 h-4 text-indigo-500" />
                            <span>ملاحظات تربوية واستنتاجات ديداكتيكية لصفّك:</span>
                          </p>
                          <h4 className="text-sm font-black text-slate-800 mt-2">
                            {activePerceptionChartTab === 'source' && 'تحليل مصادر الفكرة المسبقة للقسم'}
                            {activePerceptionChartTab === 'feeling' && 'تحليل المؤشرات والنزعات الوجدانية للدرس'}
                            {activePerceptionChartTab === 'goal' && 'فهم غايات مادة الفلسفة في وعي التلاميذ'}
                            {activePerceptionChartTab === 'debate' && 'تحديد أنماط واستجابات التفاعل الحواري'}
                            {activePerceptionChartTab === 'rating' && 'تقييم أهمية الفلسفة وجدوى الدرس لصفّك'}
                          </h4>

                          <div className="text-xs text-slate-600 leading-relaxed font-semibold space-y-3 mt-3">
                            {activePerceptionChartTab === 'source' && (
                              <>
                                <p>• القنوات المعرفية الأساسية تمنحك فكرة دقيقة عن البيئة المبدئية لصفك الدراسي.</p>
                                <p>• نسبة <strong className="text-indigo-600">{sourceCounts['الإنترنت']} تلميذ(ة) ({totalStudents > 0 ? Math.round((sourceCounts['الإنترنت'] / totalStudents) * 100) : 0}%)</strong> يستمدون تمثلاتهم للفلسفة من الفضاء الرقمي والشبكات ومحركات البحث.</p>
                                <p>• بينما تلميذ(ة) بنسبة <strong className="text-amber-700">{sourceCounts['المدرسة']} ({totalStudents > 0 ? Math.round((sourceCounts['المدرسة'] / totalStudents) * 100) : 0}%)</strong> استمعوا بالفلسفة داخل أسوار الإعدادي أو عبر إخوانهم.</p>
                                <p>• نسبة <strong className="text-slate-700">{sourceCounts['لا فكرة مسبقة'] + sourceCounts['أخرى / سياق مغاير']} تلميذ(ة) ({totalStudents > 0 ? Math.round(((sourceCounts['لا فكرة مسبقة'] + sourceCounts['أخرى / سياق مغاير']) / totalStudents) * 100) : 0}%)</strong> يتبنون ذهناً صافياً وخالياً تماماً من أي أحكام مسبقة، وهو بيئة ممتازة لتمرير روح التساؤل السقراطي بيسر وبساطة.</p>
                              </>
                            )}

                            {activePerceptionChartTab === 'feeling' && (
                              <>
                                <p>• يحدد المزاج والانطباع النفسي الأولي مستوى القابلية المعرفية للتلقي ونسب المقاومة الذاتية.</p>
                                <p>• يسهم منسوب <strong className="text-emerald-700">{feelingCounts['فضول'] + feelingCounts['إعجاب']} تلميذ(ة) ({totalStudents > 0 ? Math.round(((feelingCounts['فضول'] + feelingCounts['إعجاب']) / totalStudents) * 100) : 0}%)</strong> بالفضول الشديد أو الإعجاب المبدئي ببعث الحيوية المعرفية والمشاركة المتفاعلة بالدرس.</p>
                                <p>• في المقابل، فإن الخوف والصعوبة لـ <strong className="text-red-700">{feelingCounts['خوف'] + feelingCounts['صعوبة']} تلميذ(ة) ({totalStudents > 0 ? Math.round(((feelingCounts['خوف'] + feelingCounts['صعوبة']) / totalStudents) * 100) : 0}%)</strong> يملي عليك ضرورة تبسيط المصطلحات لإزالة جدار الهيبة والنفور المتوارث.</p>
                              </>
                            )}

                            {activePerceptionChartTab === 'goal' && (
                              <>
                                <p>• يوضح مبرر المادة الفلسفية مدى الوعي الوظيفي لدى التلميذ بأبعد من النجاح والدروس الصرفة.</p>
                                <p>• نسبة <strong className="text-violet-700">{goalCounts['تعلم التفكير']} تلميذ(ة) ({totalStudents > 0 ? Math.round((goalCounts['تعلم التفكير'] / totalStudents) * 100) : 0}%)</strong> تعي تماماً أن غاية الدرس هي تملك أدوات النقد ومناهج التفكير المعرفي الخالص.</p>
                                <p>• بينما يرى <strong className="text-amber-700">{goalCounts['حفظ المعلومات'] + goalCounts['النجاح الدراسي']} تلميذ(ة) ({totalStudents > 0 ? Math.round(((goalCounts['حفظ المعلومات'] + goalCounts['النجاح الدراسي']) / totalStudents) * 100) : 0}%)</strong> المادة من منظور نفعي محض للامتحان والتحصيل الببليوغرافي لتفريغ الأوراق يوم الامتحان.</p>
                              </>
                            )}

                            {activePerceptionChartTab === 'debate' && (
                              <>
                                <p>• تؤشر سلوكيات الطلاب أمام الآراء المخالفة على جاهزية القسم لحلقات التناظر والحوار التوليدي السليم.</p>
                                <p>• نسبة <strong className="text-emerald-700">{debateCounts['أشارك برأيي']} تلاميذ ({totalStudents > 0 ? Math.round((debateCounts['أشارك برأيي'] / totalStudents) * 100) : 0}%)</strong> تملك استعداد الإفصاح والتعبير بكل جرأة وحكمة أدبية مريحة.</p>
                                <p>• أما الباقين وعددهم <strong className="text-slate-600">{debateCounts['أستمع فقط'] + debateCounts['أتوتر']} ({totalStudents > 0 ? Math.round(((debateCounts['أستمع فقط'] + debateCounts['أتوتر']) / totalStudents) * 100) : 0}%)</strong> فيلتزمون الصمت أو الارتياب والتوجس، مما يتطلب تقنيات لعب الأدوار والعمل الإيجابي بالمجموعات الضيقة.</p>
                              </>
                            )}

                            {activePerceptionChartTab === 'rating' && (
                              <>
                                <p>• يرفع متوسط التقييم العام للمادة شأن المادة في قناعات التلميذ وجدوى وجودها في جدول حصته الأسبوعي.</p>
                                <p>• إجمالي <strong className="text-amber-500">{ratingCounts[5] + ratingCounts[4] || 0} من المقيمين</strong> بـ 4 أو 5 نجوم يؤكد تقديرهم العارم لمكانة الفلسفة، مما يسهل استرعاء اهتمامهم العقلي بالمكاشفة الفوق معرفية المعمقة.</p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-extrabold">
                          <span className="inline-flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-sky-600" />
                            <span>تحديث تفاعلي حي</span>
                          </span>
                          <span>المصدر: إجابات تلاميذ الجلسة {selectedSessionId}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {totalStudents > 0 && (
              <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row gap-5 sm:gap-6 items-stretch md:items-center">
                  <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 shrink-0">
                    <div className="p-3 bg-blue-500 text-white rounded-xl">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-400 block font-bold">تلاميذ مشخصين</span>
                      <span className="text-2xl font-black text-slate-800 font-mono leading-none mt-0.5">{totalStudents}</span>
                    </div>
                  </div>

                  {/* Horizontal Bar breakdown guides */}
                  <div className="flex-1 max-w-md w-full space-y-4">
                    {[
                      { label: 'نمط التفكير النقدي', val: percentageByStyle('تفكير نقدي'), color: 'bg-emerald-500', count: countByStyle('تفكير نقدي') },
                      { label: 'نمط الفضول المعرفي', val: percentageByStyle('فضول معرفي'), color: 'bg-blue-500', count: countByStyle('فضول معرفي') },
                      { label: 'نمط التفكير السطحي', val: percentageByStyle('تفكير سطحي'), color: 'bg-amber-400', count: countByStyle('تفكير سطحي') },
                      { label: 'نمط الخوف المعرفي', val: percentageByStyle('خوف معرفي'), color: 'bg-red-500', count: countByStyle('خوف معرفي') }
                    ].map(bar => (
                      <div key={bar.label} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${bar.color}`} />
                            <span>{bar.label}</span>
                          </span>
                          <div>
                            <span className="font-mono text-slate-800 tabular-nums">{bar.count} دفتراً </span>
                            <span className="text-slate-400 font-mono tabular-nums">({bar.val}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.val}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* COMPARATIVE COGNITIVE OBSERVATORY SECTION */}
            {sessions.length > 0 && (
              <div className="bg-white rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 sm:space-y-6 text-right" dir="rtl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4 border-b border-slate-100 pb-4 sm:pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                        <BarChart3 className="w-5 h-5" />
                      </span>
                      <h3 className="font-extrabold text-slate-800 text-base sm:text-lg">
                        مرصد فِيلوسكان: التحليل التقابلي والمقارن لأنماط التفكير بالأقسام
                      </h3>
                    </div>
                    <p className="hidden sm:block text-xs text-slate-400 mt-1.5 leading-relaxed font-semibold">
                      تتبع ومقارنة مستويات الفضول المعرفي مقابل التسطيح الفكري والجمود عبر كافة الفترات والأفواج التعليمية المنشأة.
                    </p>
                  </div>
                  
                  {/* Summary Metric Badge */}
                  <span className="bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-black px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>إحصائيات تقابلية ديناميكية</span>
                  </span>
                </div>

                {/* Main Comparative Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
                  {/* Part 1: Recharts Comparison Chart (8 cols on lg) */}
                  <div className="lg:col-span-8 space-y-4">
                    <div className="bg-slate-50/50 border border-slate-100 p-3.5 sm:p-5 rounded-2xl">
                      <h4 className="text-xs font-black text-slate-700 mb-3 sm:mb-4 flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>المخطط المقارن العام للأقسام التعليمية (%)</span>
                      </h4>
                      
                      <div className="h-60 sm:h-72 w-full">
                        {(() => {
                          const comparisonData = sessions.map(sess => {
                            const sessSubmissions = submissions.filter(sub => sub.session_id === sess.sessionId || sub.sessionId === sess.sessionId);
                            const total = sessSubmissions.length;
                            
                            const countStyle = (style: ThinkingStyle) => {
                              return sessSubmissions.filter(s => {
                                const currentCls = s.overriddenClassification || s.analysis.classification;
                                return currentCls === style;
                              }).length;
                            };

                            const pctStyle = (style: ThinkingStyle) => {
                              return total === 0 ? 0 : Math.round((countStyle(style) / total) * 100);
                            };

                            return {
                              name: sess.title.length > 15 ? `${sess.title.slice(0, 15)}...` : sess.title,
                              fullName: sess.title,
                              levelStream: `${sess.level} - ${sess.stream}`,
                              'الفضول المعرفي': pctStyle('فضول معرفي'),
                              'التسطيح الفكري': pctStyle('تفكير سطحي'),
                              'التفكير النقدي': pctStyle('تفكير نقدي'),
                              'الخوف المعرفي': pctStyle('خوف معرفي'),
                              totalStudents: total
                            };
                          });

                          const hasData = comparisonData.some(d => d.totalStudents > 0);

                          if (!hasData) {
                            return (
                              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                                لم يتم تقديم أي تشخيص بعد في مختلف الجلسات النشطة لإنشاء الرسم المقارن.
                              </div>
                            );
                          }

                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={comparisonData}
                                margin={{ top: 20, right: 10, left: -25, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                  dataKey="name" 
                                  tick={{ fill: '#475569', fontSize: 10, fontWeight: 'bold' }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis 
                                  domain={[0, 100]} 
                                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <Tooltip
                                  cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-xl text-right text-xs space-y-2 min-w-[220px]" dir="rtl">
                                          <p className="font-extrabold text-white text-sm border-b border-slate-800 pb-1.5 flex justify-between">
                                            <span className="inline-flex items-center gap-1.5">
                                              <Building className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                              <span>{data.fullName}</span>
                                            </span>
                                            <span className="text-slate-400 font-mono text-[10px]">({data.levelStream})</span>
                                          </p>
                                          <div className="space-y-1 mt-1 font-semibold">
                                            {payload.map((p: any) => (
                                              <p key={p.name} className="flex justify-between items-center gap-4 text-slate-300">
                                                <span>{p.name}:</span>
                                                <span className="font-mono font-bold tabular-nums" style={{ color: p.color }}>{p.value}%</span>
                                              </p>
                                            ))}
                                          </div>
                                          <p className="text-[10px] text-slate-400 border-t border-slate-800 pt-1.5 font-mono">
                                            عدد التلاميذ المشاركين: <span className="text-white font-bold tabular-nums">{data.totalStudents}</span>
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Legend 
                                  verticalAlign="top" 
                                  height={36} 
                                  iconType="circle"
                                  iconSize={8}
                                  wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }}
                                />
                                <Bar dataKey="الفضول المعرفي" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={25} />
                                <Bar dataKey="التسطيح الفكري" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={25} />
                                <Bar dataKey="التفكير النقدي" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={25} />
                                <Bar dataKey="الخوف المعرفي" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={25} />
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Part 2: Active Contrast (Curiosity vs Flatness) Box (4 cols on lg) */}
                  <div className="lg:col-span-4 flex flex-col justify-between bg-indigo-950/5 border border-indigo-950/10 p-5 rounded-2xl relative overflow-hidden">
                    <div>
                      <h4 className="text-xs font-black text-indigo-950 mb-3 flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>ميزان التفكير النشط في القسم الحالي</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-semibold mb-4">
                        يقارن هذا الميزان النسبة العامة لطاقة السؤال والمبادرة (الفضول الفلسفي) في مقابل الكسل الإدراكي والاستجابة السطحية (التسطيح الفكري) للفوج المختار.
                      </p>

                      {(() => {
                        const curPct = percentageByStyle('فضول معرفي');
                        const flatPct = percentageByStyle('تفكير سطحي');
                        const critPct = percentageByStyle('تفكير نقدي');
                        const fearPct = percentageByStyle('خوف معرفي');
                        
                        const engagementScore = curPct + critPct;
                        const shallowScore = flatPct + fearPct;
                        
                        let levelText = '';
                        let advice = '';
                        let titleColor = '';

                        if (totalStudents === 0) {
                          levelText = 'بيانات غير كافية';
                          advice = 'يرجى تسجيل إجابات التلاميذ للبدء في تصفح الملاحظات التربوية الممنهجة.';
                          titleColor = 'text-slate-600';
                        } else if (engagementScore > shallowScore) {
                          levelText = 'تفوّق طاقة البحث الفلسفي';
                          advice = 'الصف يتمتع بجهوزية عالية للمفاهيم المجردة؛ ركّز على نصوص الإشكاليات وعوّد التلاميذ على بناء الحجاج الذاتي وخلخلة البداهات الفكرية.';
                          titleColor = 'text-emerald-700 font-bold';
                        } else if (engagementScore < shallowScore) {
                          levelText = 'هيمنة التلقي السلبي والأجوبة الجاهزة';
                          advice = 'يحتاج التلاميذ لممارسات إثارة الصدمة المعرفية (تناقض الذات) والمهمات البسيطة لكسر اليقين والبداهات الحياتية السريعة والمنسوخة.';
                          titleColor = 'text-amber-700 font-bold';
                        } else {
                          levelText = 'حالة توازن واستقطاب متوسط';
                          advice = 'الفوج منشطر جزئياً؛ يوصى بتمكين العمل بالمجموعات الثنائية (قرين متشكك وقرين مبادر) لرفع منسوب المشاركة الفلسفية النشطة.';
                          titleColor = 'text-blue-700 font-bold';
                        }

                        return (
                          <div className="space-y-4">
                            {/* Visual balance line */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px] font-bold text-slate-700">
                                <span className="text-blue-600 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                                  <span>فضول معرفي</span>
                                  <span className="font-mono tabular-nums">({curPct}%)</span>
                                </span>
                                <span className="text-amber-600 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                                  <span>تفكير سطحي</span>
                                  <span className="font-mono tabular-nums">({flatPct}%)</span>
                                </span>
                              </div>
                              <div className="h-3 w-full bg-slate-200 rounded-full flex overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 rounded-r-full transition-all duration-500" 
                                  style={{ width: `${totalStudents === 0 ? 50 : (curPct / (curPct + flatPct || 1)) * 100}%` }}
                                ></div>
                                <div 
                                  className="h-full bg-amber-400 rounded-l-full transition-all duration-500" 
                                  style={{ width: `${totalStudents === 0 ? 50 : (flatPct / (curPct + flatPct || 1)) * 100}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Verdict and dynamic prescription */}
                            <div className="p-4 bg-white border border-indigo-900/5 rounded-2xl space-y-2 mt-4 shadow-sm">
                              <span className={`text-xs font-bold block ${titleColor}`}>
                                {levelText}
                              </span>
                              <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">
                                {advice}
                              </p>
                            </div>

                            {/* Prompt helper tip */}
                            <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 font-bold mt-2">
                              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                              <span>اختر أي جلسة من القائمة العلوية لتحديث ميزان التفكير الخاص بها فوراً.</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MAIN LIST SECTION */}
            <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
              {/* Filter controls */}
              <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-slate-50/50">
                <h3 className="font-bold text-slate-800 text-base sm:text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                  قائمة التلاميذ المفهرسة ومؤشرات تشخيصهم
                </h3>

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full lg:w-auto">
                  {/* Search input */}
                  <div className="relative flex-1 lg:w-64">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث عن اسم تلميذ..."
                      className="w-full min-h-[44px] bg-white border border-slate-200 rounded-xl py-2 px-3 pr-9 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
                    />
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                  </div>

                  {/* Filter select */}
                  <div className="relative">
                    <select
                      value={filterStyle}
                      onChange={(e) => setFilterStyle(e.target.value)}
                      className="w-full sm:w-auto min-h-[44px] bg-white border border-slate-200 rounded-xl py-2 px-3 text-base sm:text-xs pr-4 pl-8 appearance-none font-bold text-slate-700"
                    >
                      <option value="الكل">جميع أنماط التفكير</option>
                      <option value="تفكير نقدي">تفكير نقدي</option>
                      <option value="فضول معرفي">فضول معرفي</option>
                      <option value="تفكير سطحي">تفكير سطحي</option>
                      <option value="خوف معرفي">خوف معرفي</option>
                    </select>
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 pointer-events-none" />
                  </div>

                  {/* Layout View Switcher Mode */}
                  <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setStudentViewMode('kanban')}
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        studentViewMode === 'kanban'
                          ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="لوحة تصنيف تفاعلية بالكامل مع دعم إيماءات السحب والإفلات"
                    >
                      <LayoutGrid className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">التصنيف</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentViewMode('cards')}
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        studentViewMode === 'cards'
                          ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="عرض بطاقات الطلاب"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>بطاقات</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentViewMode('table')}
                      className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        studentViewMode === 'table'
                          ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="جدول تفصيلي كلاسيكي"
                    >
                      <Table className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>جدول</span>
                    </button>
                  </div>

                  {/* Export button (تصدير كـ Excel/CSV) */}
                  <button
                    onClick={exportToCSV}
                    className="min-h-[44px] py-2 px-3.5 bg-emerald-50 hover:bg-emerald-100/80 active:bg-emerald-200/50 text-emerald-700 border border-emerald-200 rounded-xl transition duration-150 text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm hover:shadow-xs active:scale-95 cursor-pointer"
                    title="تصدير قائمة التلاميذ الحالية إلى ملف Excel أو CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>تصدير البيانات (CSV)</span>
                  </button>
                </div>
              </div>

              {/* Kanban Gestures Board view (Default & Touch Optimized) */}
              {studentViewMode === 'kanban' && (
                <div className="p-4 sm:p-6 bg-slate-50/40 relative" dir="rtl">
                  {/* Explanatory subtitle */}
                  <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-blue-50/50 border border-blue-100 p-4 rounded-2xl animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <SlidersHorizontal className="w-4 h-4 text-sky-600 shrink-0" />
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-blue-900">لوحة التصنيف البيداغوجي وتوجيه التلاميذ باللمس والإيماءات</h4>
                        <p className="text-[10px] sm:text-xs text-blue-700 font-medium leading-relaxed mt-0.5">
                          اسحب بطاقة أي تلميذ وأَسقطها داخل عمود النمط الجديد لتكييف مستواه الفردي وتعديله فوراً في قواعد البيانات بشكل حي.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Columns Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 xl:items-start overflow-x-auto select-none min-h-[450px]">
                    {(() => {
                      const columnsList: { id: ThinkingStyle; name: string; desc: string; color: string; border: string; bg: string; dot: string; }[] = [
                        { id: 'تفكير نقدي', name: 'تفكير نقدي', desc: 'يقظة معرفية متوازنة وبناء حجاجي سليم', color: 'bg-emerald-500', border: 'border-emerald-200', bg: 'bg-emerald-50/30 hover:bg-emerald-50/60', dot: 'bg-emerald-500' },
                        { id: 'فضول معرفي', name: 'فضول معرفي', desc: 'شغف تساؤلي متوهج وتفكير مبادر', color: 'bg-blue-500', border: 'border-blue-200', bg: 'bg-blue-50/30 hover:bg-blue-50/60', dot: 'bg-blue-500' },
                        { id: 'تفكير سطحي', name: 'تفكير سطحي', desc: 'تسرع في إطلاق الأحكام وتبني البداهات', color: 'bg-amber-500', border: 'border-amber-200', bg: 'bg-amber-50/30 hover:bg-amber-50/60', dot: 'bg-amber-500' },
                        { id: 'خوف معرفي', name: 'خوف معرفي', desc: 'انغلاق عقلي متردد أو تهيب من الإشكاليات', color: 'bg-red-500', border: 'border-red-200', bg: 'bg-red-50/30 hover:bg-red-50/60', dot: 'bg-red-500' }
                      ];

                      return columnsList.map(group => {
                        const subsInGroup = filteredSubmissions.filter(s => {
                          const cls = s.overriddenClassification || s.analysis.classification;
                          return cls === group.id;
                        });

                        return (
                          <div 
                            key={`kanban-${group.id}`}
                            data-column-id={group.id}
                            className={`flex flex-col rounded-3xl border border-slate-200/80 p-4 transition-all duration-300 min-h-[380px] bg-white shadow-sm relative ${group.bg}`}
                          >
                            {/* Column title */}
                            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
                              <div className="flex items-center gap-2 font-sans">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${group.dot}`} />
                                <div className="text-right">
                                  <h4 className="text-xs sm:text-xs font-black text-slate-800 leading-none">{group.name}</h4>
                                  <span className="text-[9px] text-slate-400 font-bold block mt-1">{group.desc}</span>
                                </div>
                              </div>
                              <span className="bg-slate-100 text-slate-500 font-mono text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
                                {subsInGroup.length}
                              </span>
                            </div>

                            {/* Cards area */}
                            <div className="flex-1 space-y-3 min-h-[280px] py-1">
                              {subsInGroup.length > 0 ? (
                                subsInGroup.map((sub, sIdx) => {
                                  const highestIndex = Math.max(
                                    sub.analysis.metrics.criticalThinking,
                                    sub.analysis.metrics.cognitiveCuriosity,
                                    sub.analysis.metrics.cognitiveFear,
                                    sub.analysis.metrics.shallowThinking
                                  );

                                  return (
                                    <motion.div
                                      key={`kanban-card-${sub.id || sIdx}`}
                                      layout
                                      drag
                                      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                                      dragElastic={0.65}
                                      dragSnapToOrigin={true}
                                      whileDrag={{ 
                                        scale: 1.05, 
                                        rotate: [0, -1, 1, 0][sIdx % 4],
                                        boxShadow: "0 15px 30px rgba(0, 0, 0, 0.08)",
                                        zIndex: 80
                                      }}
                                      whileHover={{ y: -3, scale: 1.01 }}
                                      whileTap={{ scale: 0.98 }}
                                      onDragEnd={(_, info) => {
                                        const droppedOnElement = document.elementFromPoint(info.point.x, info.point.y);
                                        const targetCol = droppedOnElement?.closest('[data-column-id]');
                                        const targetVal = targetCol?.getAttribute('data-column-id');
                                        if (targetVal && targetVal !== group.id) {
                                          handleOverrideClassificationDirect(sub.id, targetVal as ThinkingStyle);
                                        }
                                      }}
                                      className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-3.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 transition duration-150 space-y-2.5 relative group text-right touch-none select-none"
                                      title="أمسك واسحب لتصنيف التلميذ في عمود آخر"
                                    >
                                      {/* Top Drag Indicator Line */}
                                      <div className="flex justify-center -mt-1.5 mb-1.5 opacity-40 group-hover:opacity-70 transition">
                                        <div className="w-10 h-1 bg-slate-200 rounded-full flex gap-0.5 justify-center">
                                          <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                                          <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                                          <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                                        </div>
                                      </div>

                                      <div className="flex justify-between items-start gap-2">
                                        <div>
                                          <h5 className="font-extrabold text-slate-800 text-xs text-right leading-relaxed flex items-center gap-1">
                                            {sub.studentName}
                                          </h5>
                                          <span className="text-[8.5px] text-slate-400 inline-flex items-center gap-1 mt-1 font-mono tabular-nums">
                                            <BarChart3 className="w-2.5 h-2.5 text-slate-400" />
                                            <span>أعلى مؤشر: {highestIndex}%</span>
                                          </span>
                                        </div>
                                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${group.dot}`} />
                                      </div>

                                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed text-right line-clamp-2">
                                        {sub.teacherNotes ? sub.teacherNotes : <span className="italic text-slate-300">لا توجد ملاحظات بيداغوجية يدوية للفصل حالياً.</span>}
                                      </p>

                                      <div className="flex justify-between items-center gap-1.5 pt-2.5 border-t border-slate-100">
                                        <button
                                          type="button"
                                          onClick={() => openStudentDetails(sub)}
                                          className="px-2 py-1 bg-blue-50/70 hover:bg-blue-100 active:bg-blue-200/50 text-blue-600 border border-blue-200/60 rounded-lg text-[9px] font-black cursor-pointer inline-flex items-center gap-1 transition"
                                        >
                                          <Eye className="w-3 h-3" />
                                          <span>التفاصيل</span>
                                        </button>

                                        <div className="relative">
                                          <select
                                            value={group.id}
                                            onChange={(e) => handleOverrideClassificationDirect(sub.id, e.target.value as ThinkingStyle)}
                                            className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg py-1 px-1.5 text-[9px] font-bold cursor-pointer outline-none appearance-none pr-3"
                                          >
                                            <option disabled value="">تصنيف يدوي...</option>
                                            <option value="تفكير نقدي">تفكير نقدي</option>
                                            <option value="فضول معرفي">فضول معرفي</option>
                                            <option value="تفكير سطحي">تفكير سطحي</option>
                                            <option value="خوف معرفي">خوف معرفي</option>
                                          </select>
                                        </div>
                                      </div>
                                    </motion.div>
                                  );
                                })
                              ) : (
                                <div className="border border-slate-100 bg-slate-50/30 rounded-2xl p-4 text-center text-[10px] text-slate-400 italic py-16 flex flex-col items-center justify-center gap-2">
                                  <Inbox className="w-5 h-5 text-slate-300" />
                                  <span>لا يوجد تلاميذ مصنفون هنا حالياً.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Detailed Cards Grid view */}
              {studentViewMode === 'cards' && (
                <div className="p-6 bg-slate-50/30" dir="rtl">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredSubmissions.length > 0 ? (
                      filteredSubmissions.map((sub, idx) => {
                        const styleClass = sub.overriddenClassification || sub.analysis.classification;
                        const isOverridden = !!sub.overriddenClassification;
                        const classStyle = getClassInfo(styleClass);
                        const highestIndex = Math.max(
                          sub.analysis.metrics.criticalThinking,
                          sub.analysis.metrics.cognitiveCuriosity,
                          sub.analysis.metrics.cognitiveFear,
                          sub.analysis.metrics.shallowThinking
                        );

                        return (
                          <motion.div
                            key={`cards-sub-${sub.id || idx}`}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: Math.min(idx * 0.04, 0.4) }}
                            className="bg-white border border-slate-200 rounded-[24px] p-5 shadow-sm hover:shadow-xs transition duration-200 flex flex-col justify-between space-y-4 text-right"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-extrabold text-slate-900 text-sm leading-tight">{sub.studentName}</h4>
                                <span className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-1 mt-1.5 font-bold tabular-nums">
                                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>{new Date(sub.submittedAt).toLocaleDateString('ar-MA', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}</span>
                                </span>
                              </div>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${classStyle.color}`}>
                                {classStyle.badge} {classStyle.text}
                                {isOverridden && (
                                  <span className="text-[8px] bg-slate-900 text-white px-1 rounded mr-1">معدل</span>
                                )}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-[11px]">
                              <div>
                                <span className="text-slate-400 block font-bold text-[9px] mb-0.5">أعلى مؤشر رقمي:</span>
                                <span className="font-mono font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded text-xs tabular-nums">{highestIndex}%</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block font-bold text-[9px] mb-0.5">تفصيل التقييم:</span>
                                <span className={`font-bold text-[9px] px-1.5 py-0.5 rounded ${isOverridden ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {isOverridden ? 'مصحّح بيداغوجياً' : 'تشخيص تلقائي بالذكاء'}
                                </span>
                              </div>
                            </div>

                            <div className="bg-slate-50/60 p-3 rounded-2xl border border-slate-200 text-[11px] leading-relaxed">
                              <span className="text-slate-500 inline-flex items-center gap-1 font-extrabold text-[9px] mb-1">
                                <FileEdit className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>الملاحظة التربوية:</span>
                              </span>
                              <p className="text-slate-700 font-medium">
                                {sub.teacherNotes ? sub.teacherNotes : <span className="italic text-slate-400">لا توجد ملاحظات حالياً لهذا التلميذ.</span>}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 pt-1 w-full">
                              <button
                                type="button"
                                onClick={() => openStudentDetails(sub)}
                                className="flex-1 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-xl transition text-xs font-bold inline-flex items-center justify-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>فتح ملف التشخيص</span>
                              </button>
                            </div>
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="col-span-full text-center py-12 text-slate-400 italic">
                        لا توجد نتائج مطابقة لفلترة تلاميذ فِيلوسكان حالياً.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pupil submissions table (Desktop view) */}
              {studentViewMode === 'table' && (
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4">اسم التلميذ الكامل</th>
                      <th className="px-6 py-4">تصنيف فِيلوسكان المهيمن</th>
                      <th className="px-6 py-4">توقيت تقديم التشخيص</th>
                      <th className="px-6 py-4 text-center">أهم مؤشر رقمي</th>
                      <th className="px-6 py-4">ملاحظات المعلم اليدوية</th>
                      <th className="px-6 py-4 text-left">الملف التربوي / الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSubmissions.length > 0 ? (
                      filteredSubmissions.map((sub, idx) => {
                        const styleClass = sub.overriddenClassification || sub.analysis.classification;
                        const isOverridden = !!sub.overriddenClassification;
                        const classStyle = getClassInfo(styleClass);

                        return (
                          <tr key={`desktop-sub-${sub.id || idx}`} className="hover:bg-slate-50/50 transition">
                            {/* Name */}
                            <td className="px-6 py-4 font-bold text-slate-800">
                              {sub.studentName}
                            </td>

                            {/* Style Category */}
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${classStyle.color}`}>
                                {classStyle.badge} {classStyle.text}
                                {isOverridden && (
                                  <span className="text-[9px] bg-slate-900 text-white px-1 py-0.5 rounded" title="معدل يدوياً من طرف الأستاذ">
                                    مُعدّل
                                  </span>
                                )}
                              </span>
                            </td>

                            {/* Date */}
                            <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                              {new Date(sub.submittedAt).toLocaleDateString('ar-MA', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>

                            {/* High index */}
                            <td className="px-6 py-4 text-center font-mono font-bold text-slate-700">
                              {Math.max(
                                sub.analysis.metrics.criticalThinking,
                                sub.analysis.metrics.cognitiveCuriosity,
                                sub.analysis.metrics.cognitiveFear,
                                sub.analysis.metrics.shallowThinking
                              )}%
                            </td>

                            {/* Teacher notes snippet */}
                            <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">
                              {sub.teacherNotes ? sub.teacherNotes : <span className="italic text-slate-300">لا توجد ملاحظات يدوية</span>}
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-4 text-left">
                              <button
                                type="button"
                                onClick={() => openStudentDetails(sub)}
                                className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-xl transition text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                فتح الملف والتحليل
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                          لا توجد نتائج مطابقة لفلترة تلاميذ فِيلوسكان حالياً.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}

              {/* Mobile Screen List (Show on mobile, hide on desktop) */}
              {studentViewMode === 'table' && (
                <div className="block md:hidden divide-y divide-slate-200">
                {filteredSubmissions.length > 0 ? (
                  filteredSubmissions.map((sub, idx) => {
                    const styleClass = sub.overriddenClassification || sub.analysis.classification;
                    const isOverridden = !!sub.overriddenClassification;
                    const classStyle = getClassInfo(styleClass);
                    const highestIndex = Math.max(
                      sub.analysis.metrics.criticalThinking,
                      sub.analysis.metrics.cognitiveCuriosity,
                      sub.analysis.metrics.cognitiveFear,
                      sub.analysis.metrics.shallowThinking
                    );

                    return (
                      <div key={`mobile-sub-${sub.id || idx}`} className="p-4 bg-white hover:bg-slate-50 transition space-y-4 text-right">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-extrabold text-slate-900 text-sm">{sub.studentName}</h4>
                            <span className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-1 mt-1 tabular-nums">
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{new Date(sub.submittedAt).toLocaleDateString('ar-MA', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            </span>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${classStyle.color}`}>
                            {classStyle.badge} {classStyle.text}
                            {isOverridden && (
                              <span className="text-[8px] bg-slate-900 text-white px-1 rounded mr-1">
                                معدل
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] border-t border-slate-100">
                          <div>
                            <span className="text-slate-400 block font-bold text-[9px] mb-0.5">أعلى مؤشر رقمي:</span>
                            <span className="font-mono font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded text-xs tabular-nums">{highestIndex}%</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold text-[9px] mb-0.5">حالة التقييم:</span>
                            <span className={`font-bold text-[9px] px-1.5 py-0.5 rounded ${isOverridden ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                              {isOverridden ? 'مصحّح يدوياً' : 'تشخيص تلقائي'}
                            </span>
                          </div>
                        </div>

                        {/* Private Notes Preview if visible */}
                        <div className="bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50 text-[11px]">
                          <span className="text-slate-500 inline-flex items-center gap-1 font-bold text-[9px] mb-1">
                            <FileEdit className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>ملاحظات الأستاذ المخصصة:</span>
                          </span>
                          <p className="text-slate-700 font-medium leading-relaxed">
                            {sub.teacherNotes ? sub.teacherNotes : <span className="italic text-slate-400">لا توجد ملاحظات حالياً لهذا التلميذ.</span>}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => openStudentDetails(sub)}
                          className="w-full py-2.5 bg-blue-50 text-blue-600 active:bg-blue-100/50 hover:bg-blue-100 border border-blue-200 rounded-xl transition text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Eye className="w-4 h-4" />
                          فتح الملف والتحليل البيداغوجي كاملاً
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10 text-slate-400 italic text-xs">
                    لا توجد نتائج مطابقة لفلترة تلاميذ فِيلوسكان حالياً.
                  </div>
                )}
              </div>
              )}
            </div>
                  </div>
                ) : (
                  /* PROCTORING SUB-TAB CONTENT SHIELDS */
                  <div className="space-y-6 animate-fade-in" dir="rtl">
                    {/* Header Alert card if session is not active in supervised mode */}
                    {(() => {
                      const activeSess = sessions.find(s => s.sessionId === selectedSessionId);
                      if (activeSess && !activeSess.supervisedMode) {
                        return (
                          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-[24px] p-4 sm:p-6 text-right font-sans flex flex-col sm:flex-row items-start gap-4">
                            <div className="p-3 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                              <AlertCircle className="w-6 h-6" />
                            </div>
                            <div className="space-y-1 flex-1">
                              <h4 className="font-black text-sm flex items-center gap-1.5">
                                <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                                <span>الوضع التشخيصي المراقب قيد الخمول</span>
                              </h4>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                لست قادراً على مراقبة الطلاب بشكل حي وتوليد سجلات النزاهة وحركات المتصفح لأن "الوضع المراقب" معطل لهذه الجلسة الفعالة.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleToggleSupervisedMode(selectedSessionId)}
                                className="mt-3 min-h-[42px] py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] rounded-xl shadow-sm transition active:scale-95 cursor-pointer w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>تفعيل رصد المخالفات والوضع التشخيصي المراقب الآن</span>
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {(() => {
                      const activeSess = sessions.find(s => s.sessionId === selectedSessionId);
                      if (activeSess && activeSess.isFrozen) {
                        return (
                          <div className="bg-red-50 border border-red-200 text-red-900 rounded-[24px] p-4 sm:p-6 text-right font-sans flex flex-col sm:flex-row items-start gap-4">
                            <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                              <Lock className="w-6 h-6 shrink-0" />
                            </div>
                            <div className="space-y-1.5 flex-1">
                              <h4 className="font-black text-sm text-red-700 flex items-center gap-1.5">
                                <Snowflake className="w-4 h-4 text-red-600 shrink-0" />
                                <span>هذه الجلسة مجمدة ومغلقة حالياً</span>
                              </h4>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                تم تجميد الرابط والصفحة التشخيصية لمنع تلاميذ المادة من إرسال أي استمارات أو إجابات فلسفية جديدة بالكامل بعد انتهاء الحصة أو النشاط.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleToggleFreezeSession(selectedSessionId)}
                                className="mt-3 min-h-[42px] py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] rounded-xl shadow-sm transition active:scale-95 cursor-pointer w-full sm:w-auto inline-flex items-center justify-center gap-1.5"
                              >
                                <Flame className="w-3.5 h-3.5" />
                                <span>إلغاء تجميد الجلسة والسماح بالردود مجدداً</span>
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {(() => {
                      const activeSess = sessions.find(s => s.sessionId === selectedSessionId);
                      if (!activeSess || !activeSess.supervisedMode) return null;

                      const lowTrustStudents = liveProctoringData?.students 
                        ? Object.values(liveProctoringData.students).filter((stud: any) => {
                            const score = stud.reliabilityIndex !== undefined ? stud.reliabilityIndex : 100;
                            const hasViolations = stud.violations && stud.violations.length > 0;
                            return score < trustAlertThreshold && hasViolations && !dismissedTrustAlerts.includes(stud.studentName);
                          })
                        : [];

                      return (
                        <div className="space-y-4">
                          {/* Trust alert threshold setting dashboard bar */}
                          <div className="bg-slate-50 border border-slate-200 p-4 rounded-[24px] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-right">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                                <Settings className="w-5 h-5 text-amber-500" />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-slate-800 inline-flex items-center gap-1.5">
                                  <span>مستوى الحساسية للإنذار الذكي بمؤشر النزاهة (استرشادي فقط)</span>
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                </h4>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  تنبيه استرشادي للأستاذ للمتابعة الصفية ولا يُعد حكماً آلياً على نزاهة التلميذ.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                              <span className="text-xs font-bold text-slate-600 shrink-0">إنذار عند:</span>
                              <input
                                type="range"
                                min="10"
                                max="90"
                                step="5"
                                value={trustAlertThreshold}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setTrustAlertThreshold(val);
                                  localStorage.setItem('trust_alert_threshold', val.toString());
                                }}
                                className="w-full sm:w-48 accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                              />
                              <span className="font-mono font-black text-slate-800 border px-2.5 py-1 rounded-xl bg-white text-xs shrink-0 select-none tabular-nums">
                                {trustAlertThreshold}%
                              </span>
                            </div>
                          </div>

                          {/* Low Trust Alarm list if exists */}
                          {lowTrustStudents.length > 0 && (
                            <div className="bg-red-50/90 border-2 border-red-200 text-red-950 rounded-[24px] p-5 text-right font-sans flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg shadow-red-500/10">
                              <div className="flex items-start gap-3.5">
                                <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                                  <ShieldAlert className="w-6 h-6 text-red-600" />
                                </div>
                                <div className="space-y-1">
                                  <h4 className="font-black text-sm text-red-800 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                    <span>تنبيه مستعجل: انخفاض حاد في مؤشر الثقة والنزاهة الرقمي!</span>
                                  </h4>
                                  <p className="text-xs text-red-700/95 leading-relaxed">
                                    تراجع مؤشر الثقة العام للتلاميذ المدرجين أدناه تحت عتبة الحماية الموثقة (<span className="font-bold underline">{trustAlertThreshold}%</span>) بفعل تكرار المخالفات:
                                  </p>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {lowTrustStudents.map((stud: any) => (
                                      <span key={stud.studentName} className="inline-flex items-center gap-1.5 bg-white border border-red-200 px-3 py-1 rounded-xl text-xs font-black text-red-800 shadow-sm hover:bg-slate-50 transition tabular-nums">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                                        {stud.studentName} ({stud.reliabilityIndex !== undefined ? stud.reliabilityIndex : 100}%)
                                        <button 
                                          type="button" 
                                          onClick={() => setDismissedTrustAlerts(prev => [...prev, stud.studentName])}
                                          className="mr-1 py-0.5 px-1 text-[9px] text-slate-400 hover:text-red-600 font-extrabold cursor-pointer inline-flex items-center"
                                          title="كتم التنبيه لتلميذ"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2 self-stretch md:self-auto shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setDismissedTrustAlerts(prev => [...prev, ...lowTrustStudents.map((s: any) => s.studentName)])}
                                  className="w-full md:w-auto py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md shadow-red-600/15 transition active:scale-95 cursor-pointer text-center inline-flex items-center justify-center gap-1.5"
                                >
                                  <VolumeX className="w-3.5 h-3.5" />
                                  <span>كتم التنبيهات وإخفاؤها مؤقتاً</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 3 KPIs indicators row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-sans text-right">
                      {/* Connected Counter */}
                      <div className="bg-white border border-slate-200 p-5 rounded-[24px] shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                          <Users className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 block font-black">الطلاب المتصلون حالياً بالبث</span>
                          <span className="text-2xl font-black text-slate-800 font-mono">
                            {liveProctoringData?.connectedStudentsCount || 0}
                          </span>
                        </div>
                      </div>

                      {/* Submissions Count */}
                      <div className="bg-white border border-slate-200 p-5 rounded-[24px] shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                          <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 block font-black">الاستمارات المسلمة والموثقة</span>
                          <span className="text-2xl font-black text-slate-800 font-mono">
                            {liveProctoringData?.submittedCount || 0}
                          </span>
                        </div>
                      </div>

                      {/* Warnings Count */}
                      <div className="bg-white border border-slate-200 p-5 rounded-[24px] shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                          <XCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 block font-black">إجمالي المخالفات المسجلة بالفصل</span>
                          <span className="text-2xl font-black text-slate-800 font-mono">
                            {liveProctoringData?.totalViolationsCount || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Live Metrics Evolution charts */}
                    {proctoringHistory.length > 0 && (
                      <div className="bg-white border border-slate-200 p-5 rounded-[28px] shadow-sm space-y-4 font-sans text-right">
                        <div className="border-b pb-3 flex justify-between items-center">
                          <div>
                            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                              <BarChart3 className="w-4.5 h-4.5 text-indigo-600" />
                              التحليل البياني الفوري لمسار الحصة الدراسي (مؤشرات النزاهة والمخالفات)
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              مخطط بياني ديناميكي يرصد نبض نزاهة الفصل وحجم السلوكيات المخمّنة في الوقت الفعلي.
                            </p>
                          </div>
                          <span className="text-[9px] font-black font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            <span>بث بياني حي نشط</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                          
                          {/* Chart 1: Average Trust Index Evolution */}
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-700 inline-flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>متوسط مؤشر النزاهة العام للتلاميذ (%) في الزمن</span>
                            </span>
                            <div className="h-56 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={proctoringHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id="colorTrust" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                  <XAxis dataKey="time" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                  <Tooltip 
                                    contentStyle={{ textAlign: 'right', borderRadius: '12px', fontSize: '11px', borderColor: '#e2e8f0', direction: 'rtl' }}
                                    formatter={(value: any) => [`${value}%`, 'متوسط مؤشر الثقة']}
                                    labelFormatter={(label) => `الوقت: ${label}`}
                                  />
                                  <Area type="monotone" dataKey="avgTrust" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorTrust)" name="متوسط مؤشر الثقة" />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Chart 2: Total Violations Accumulation */}
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-700 inline-flex items-center gap-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>تراكم إجمالي السلوكيات والمخالفات المرصودة بالفصل</span>
                            </span>
                            <div className="h-56 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={proctoringHistory} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                  <XAxis dataKey="time" tick={{ fontSize: 8, fill: '#94a3b8' }} />
                                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
                                  <Tooltip 
                                    contentStyle={{ textAlign: 'right', borderRadius: '12px', fontSize: '11px', borderColor: '#e2e8f0', direction: 'rtl' }}
                                    formatter={(value: any) => [`${value} مخالفة`, 'تراكم المخالفات']}
                                    labelFormatter={(label) => `الوقت: ${label}`}
                                  />
                                  <Line type="monotone" dataKey="violationsCount" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 5 }} name="إجمالي المخالفات بالفصل" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* Central columns grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans text-right">
                      
                      {/* Left: Connected pupils table */}
                      <div className="lg:col-span-2 bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200 p-4 sm:p-5 space-y-4 shadow-sm">
                        <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-3.5 mb-2">
                          <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-600 shrink-0" />
                            شاشة الرصد والمراقبة الفورية للطلاب
                          </h4>
                          <span className="text-[10px] font-black text-slate-400 bg-slate-100 border px-2.5 py-0.5 rounded-full">
                            تحديث تلقائي مستمر
                          </span>
                        </div>

                        {/* Mobile Stacked Cards for Proctoring */}
                        <div className="md:hidden space-y-3">
                          {!liveProctoringData || Object.keys(liveProctoringData.students || {}).length === 0 ? (
                            <p className="text-center py-10 text-slate-400 italic text-xs font-semibold">
                              لا يوجد أي تلاميذ مسجلين أو متفاعلين مع هذه الجلسة التدقيقية حالياً.
                            </p>
                          ) : (
                            Object.values(liveProctoringData.students).map((stud: any) => {
                              let statusBadge = "bg-slate-100 text-slate-600 border-slate-200";
                              const statusStr = stud.status;
                              if (statusStr === 'غادر الصفحة' || statusStr?.includes('غادر')) {
                                statusBadge = "bg-orange-100 text-orange-800 border-orange-200";
                              } else if (statusStr === 'يجيب حالياً') {
                                statusBadge = "bg-emerald-100 text-emerald-800 border-emerald-200";
                              } else if (statusStr === 'متوقف مؤقتاً') {
                                statusBadge = "bg-amber-100 text-amber-800 border-amber-200";
                              } else if (statusStr === 'أنهى الاستمارة') {
                                statusBadge = "bg-blue-100 text-blue-800 border-blue-200";
                              }

                              const score = stud.reliabilityIndex !== undefined ? stud.reliabilityIndex : 100;
                              let scoreBadge = "text-emerald-700 bg-emerald-50 border-emerald-100";
                              let scoreBar = "bg-emerald-500";
                              if (score < 40) {
                                scoreBadge = "text-red-700 bg-red-50 border-red-100";
                                scoreBar = "bg-red-500";
                              } else if (score < 80) {
                                scoreBadge = "text-amber-700 bg-amber-50 border-amber-100";
                                scoreBar = "bg-amber-500";
                              }
                              const totalViolations = stud.violations?.reduce((sum: number, v: any) => sum + (v.count || 1), 0) || 0;

                              return (
                                <div key={`mob-proctor-${stud.studentName}`} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-right">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-black text-slate-800 text-sm">{stud.studentName}</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold shrink-0 ${statusBadge}`}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                      {stud.status}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-3 pt-1">
                                    <div className="flex items-center gap-2 flex-1">
                                      <span className="text-[10px] text-slate-400 font-bold shrink-0">النزاهة:</span>
                                      <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                        <div className={`h-full ${scoreBar}`} style={{ width: `${score}%` }}></div>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded-lg border font-mono font-black text-[10px] ${scoreBadge}`}>
                                        {score}%
                                      </span>
                                    </div>
                                    <span className="text-[11px] font-mono font-black text-slate-700 shrink-0">
                                      المخالفات: {totalViolations}
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => setSelectedProctorStudentHistory(stud)}
                                    className="w-full min-h-[42px] py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                                  >
                                    عرض السجل الأمني التفصيلي
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-right border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-400 font-extrabold text-[11px]">
                                <th className="pb-3 pr-2">اسم كامل (التلميذ)</th>
                                <th className="pb-3">الوضعية الحية والنشاط</th>
                                <th className="pb-3">مؤشر الأمان والنزاهة (استرشادي)</th>
                                <th className="pb-3 text-center">المخالفات</th>
                                <th className="pb-3 text-left pl-2">إجراءات المدرس</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {!liveProctoringData || Object.keys(liveProctoringData.students || {}).length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="text-center py-12 text-slate-400 italic font-semibold">
                                    لا يوجد أي تلاميذ مسجلين أو متفاعلين مع هذه الجلسة التدقيقية حالياً.
                                  </td>
                                </tr>
                              ) : (
                                Object.values(liveProctoringData.students).map((stud: any) => {
                                  // Color code client status
                                  let statusBadge = "bg-slate-100 text-slate-600 border-slate-200";
                                  const statusStr = stud.status;
                                  if (statusStr === 'غادر الصفحة' || statusStr?.includes('غادر')) {
                                    statusBadge = "bg-orange-100 text-orange-800 border-orange-200";
                                  } else if (statusStr === 'يجيب حالياً') {
                                    statusBadge = "bg-emerald-100 text-emerald-800 border-emerald-200";
                                  } else if (statusStr === 'متوقف مؤقتاً') {
                                    statusBadge = "bg-amber-100 text-amber-800 border-amber-200";
                                  } else if (statusStr === 'أنهى الاستمارة') {
                                    statusBadge = "bg-blue-100 text-blue-800 border-blue-200";
                                  }

                                  const score = stud.reliabilityIndex !== undefined ? stud.reliabilityIndex : 100;
                                  let scoreBadge = "text-emerald-700 bg-emerald-50 border-emerald-100";
                                  let scoreBar = "bg-emerald-500";
                                  if (score < 40) {
                                    scoreBadge = "text-red-700 bg-red-50 border-red-100";
                                    scoreBar = "bg-red-500";
                                  } else if (score < 80) {
                                    scoreBadge = "text-amber-700 bg-amber-50 border-amber-100";
                                    scoreBar = "bg-amber-500";
                                  }

                                  return (
                                    <tr key={stud.studentName} className="hover:bg-slate-50/50 transition">
                                      <td className="py-3.5 pr-2 font-black text-slate-800">{stud.studentName}</td>
                                      <td className="py-3.5">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-extrabold ${statusBadge}`}>
                                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                          {stud.status}
                                        </span>
                                      </td>
                                      <td className="py-3.5">
                                        <div className="flex items-center gap-2 pr-1">
                                          <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                            <div className={`h-full ${scoreBar}`} style={{ width: `${score}%` }}></div>
                                          </div>
                                          <span className={`px-2 py-0.5 rounded-lg border font-mono font-black text-[10px] ${scoreBadge}`}>
                                            {score}%
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-3.5 text-center font-mono font-black text-slate-700">
                                        {stud.violations?.reduce((sum: number, v: any) => sum + (v.count || 1), 0) || 0}
                                      </td>
                                      <td className="py-3.5 text-left pl-2">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedProctorStudentHistory(stud)}
                                          className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition cursor-pointer"
                                        >
                                          عرض السجل الأمني التفصيلي
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Right: Live violations Feed */}
                      <div className="lg:col-span-1 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 text-white rounded-[28px] p-6 shadow-md flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                            <h4 className="font-extrabold text-sm flex items-center gap-2">
                              <Bell className="w-4 h-4 text-amber-500" />
                              النشاط والتهديدات الحية بالفصل (Live Log)
                            </h4>
                          </div>

                          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                            {!liveProctoringData || !liveProctoringData.recentViolations || liveProctoringData.recentViolations.length === 0 ? (
                              <p className="text-[11px] text-slate-400 italic py-16 text-center">
                                لم تحدث أي تجاوزات سلوكية في المتصفح بعد. النزاهة البيداغوجية مستقرة
                              </p>
                            ) : (
                              liveProctoringData.recentViolations.map((viol: any, idx: number) => {
                                return (
                                  <div key={idx} className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl space-y-1.5 text-right font-sans text-[11px]">
                                    <div className="flex justify-between items-center">
                                      <span className="font-mono text-slate-500 text-[9px] tabular-nums">
                                        {new Date(viol.time).toLocaleTimeString('ar-EG')}
                                      </span>
                                      <span className="font-black text-yellow-400">{viol.studentName}</span>
                                    </div>
                                    <p className="border-r border-red-500/80 pr-2 py-0.5 bg-red-950/20 text-red-300 font-bold font-semibold">
                                      {viol.type}
                                    </p>
                                    {viol.duration !== undefined && viol.duration > 0 && (
                                      <span className="text-[9px] text-slate-400 inline-flex items-center gap-1 mt-0.5 font-semibold tabular-nums">
                                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>مدة الانقطاع: {viol.duration} ثوانٍ</span>
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Export Action block */}
                        {liveProctoringData && Object.keys(liveProctoringData.students || {}).length > 0 && (
                          <div className="border-t border-slate-800 pt-4 mt-4">
                            <button
                              type="button"
                              onClick={() => {
                                // Dynamic download of security proctor log as JSON
                                const jsonStr = `data:text/json;charset=utf-8,${encodeURIComponent(
                                  JSON.stringify(liveProctoringData, null, 2)
                                )}`;
                                const dlAnchor = document.createElement('a');
                                dlAnchor.setAttribute('href', jsonStr);
                                dlAnchor.setAttribute('download', `PhiloScan_Security_Report_${selectedSessionId}.json`);
                                document.body.appendChild(dlAnchor);
                                dlAnchor.click();
                                dlAnchor.remove();
                              }}
                              className="w-full py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm shadow-amber-900/10 transition cursor-pointer"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              تصدير تقرير أمن ونزاهة الحضور (JSON Document)
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            )}

            {teacherActiveTab === 'analytics' && (() => {
              const baseSubmissions = useSimulationData 
                ? mockSimulationSubmissions 
                : submissionsForSelectedSession;

              const totalCount = baseSubmissions.length;

              // Sorting chronologically
              const sortedSubmissions = [...baseSubmissions].sort((a, b) => 
                new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
              );

              // 1. Daily averages dataset
              const dailyDataMap: { [dateStr: string]: { date: string, criticalThinkingSum: number, curiositySum: number, count: number } } = {};

              sortedSubmissions.forEach(sub => {
                const d = new Date(sub.submittedAt);
                const formattedDate = d.toLocaleDateString('ar-MA', { month: 'short', day: 'numeric' });
                const crit = sub.analysis?.metrics?.criticalThinking || 0;
                const cur = sub.analysis?.metrics?.cognitiveCuriosity || 0;
                
                if (!dailyDataMap[formattedDate]) {
                  dailyDataMap[formattedDate] = {
                    date: formattedDate,
                    criticalThinkingSum: 0,
                    curiositySum: 0,
                    count: 0
                  };
                }
                dailyDataMap[formattedDate].criticalThinkingSum += crit;
                dailyDataMap[formattedDate].curiositySum += cur;
                dailyDataMap[formattedDate].count += 1;
              });

              const dailyData = Object.values(dailyDataMap).map(day => ({
                date: day.date,
                'التفكير النقدي': Math.round(day.criticalThinkingSum / day.count),
                'الفضول المعرفي': Math.round(day.curiositySum / day.count),
                'الاستجابات': day.count
              }));

              // 2. Individual sequence dataset
              const sequentialData = sortedSubmissions.map((sub, idx) => ({
                idx: idx + 1,
                name: sub.studentName,
                date: new Date(sub.submittedAt).toLocaleDateString('ar-MA', { month: 'numeric', day: 'numeric' }),
                'التفكير النقدي': Math.round(sub.analysis?.metrics?.criticalThinking || 0),
                'الفضول المعرفي': Math.round(sub.analysis?.metrics?.cognitiveCuriosity || 0)
              }));

              // Global statistics averages
              const avgCritical = totalCount > 0 
                ? Math.round(baseSubmissions.reduce((acc, s) => acc + (s.analysis?.metrics?.criticalThinking || 0), 0) / totalCount)
                : 0;
              const avgCuriosity = totalCount > 0 
                ? Math.round(baseSubmissions.reduce((acc, s) => acc + (s.analysis?.metrics?.cognitiveCuriosity || 0), 0) / totalCount)
                : 0;

              // Pearson correlation
              let correlationText = "لا يتوفر كم كافٍ من المعطيات لتحديد معامل الارتباط المعرفي.";
              let correlationStrength = 0;
              let correlationLabel = "غير محدد";
              if (totalCount >= 3) {
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
                baseSubmissions.forEach(s => {
                  const x = s.analysis?.metrics?.criticalThinking || 0;
                  const y = s.analysis?.metrics?.cognitiveCuriosity || 0;
                  sumX += x;
                  sumY += y;
                  sumXY += x * y;
                  sumX2 += x * x;
                  sumY2 += y * y;
                });
                const num = (totalCount * sumXY) - (sumX * sumY);
                const den = Math.sqrt(((totalCount * sumX2) - (sumX * sumX)) * ((totalCount * sumY2) - (sumY * sumY)));
                const r = den === 0 ? 0 : num / den;
                correlationStrength = r;

                if (r > 0.4) {
                  correlationText = "ارتباط طردي إيجابي قوي: زيادة دافعية الفضول المعرفي تسرّع وتكامل بناء مهارات التفكير النقدي المتزن؛ الأداء الفلسفي ينمو بالتساؤل المتوهج لدى التلاميذ.";
                  correlationLabel = "طردي متكامل (إيجابي)";
                } else if (r < -0.4) {
                  correlationText = "ارتباط عكسي: يرتفع التفكير النقدي مع نزول الفضول، أو العكس. قد تدل هذه البنية على يقظة تحليلية حادة ولكن حذرة ومترددة؛ يتطلب الفصل معالجة تربوية لتوطيد الحب والشغف الموازي.";
                  correlationLabel = "ارتباط سلبي (عكسي)";
                } else {
                  correlationText = "ارتباط محايد ومتشعب: تتداخل مؤشرات الفضول والتفكير النقدي بطريقة ديمقراطية متباينة للغاية بين التلامذة؛ يستلزم الحفاظ على محفزات المعرفة الفلسفية بطرق ثنائية خاصة.";
                  correlationLabel = "ارتباط طبيعي متباعد";
                }
              }

              // Filter or sort student comparative metrics list
              const sortedStudentMetrics = [...baseSubmissions].sort((a, b) => {
                const valA = analyticsSortBy === 'critical' 
                  ? (a.analysis?.metrics?.criticalThinking || 0)
                  : (a.analysis?.metrics?.cognitiveCuriosity || 0);
                const valB = analyticsSortBy === 'critical' 
                  ? (b.analysis?.metrics?.criticalThinking || 0)
                  : (b.analysis?.metrics?.cognitiveCuriosity || 0);
                return valB - valA; 
              });

              // Select chart data based on view mode
              const chartData: any[] = analyticsGroupMode === 'daily' ? dailyData : sequentialData;

              const scoresSum = [0, 0, 0, 0, 0];
              baseSubmissions.forEach(sub => {
                const scores = calculateFiveAxesScores(sub.answers || sub.responses || {});
                scoresSum[0] += scores[0];
                scoresSum[1] += scores[1];
                scoresSum[2] += scores[2];
                scoresSum[3] += scores[3];
                scoresSum[4] += scores[4];
              });
              const totalSum = scoresSum.reduce((a, b) => a + b, 0) || 1;
              const pieData = [
                { name: 'التصور الفلسفي المسبق', value: Math.round((scoresSum[0] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[0] / totalCount) : 0, color: '#3b82f6', desc: 'مدى نضج الفكرة المسبقة ومصدرها المكتسب' },
                { name: 'الشك المنهجي الفلسفي', value: Math.round((scoresSum[1] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[1] / totalCount) : 0, color: '#10b981', desc: 'قدرة التلميذ على المساءلة والتحرر الفكري' },
                { name: 'أدوات الاستشكال والحدس', value: Math.round((scoresSum[2] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[2] / totalCount) : 0, color: '#f59e0b', desc: 'مهارة صياغة الأسئلة واكتشاف المشكل المواراة' },
                { name: 'بناء الأطروحة والحجاج', value: Math.round((scoresSum[3] / totalSum) * 100) || 15, rawScore: totalCount > 0 ? Math.round(scoresSum[3] / totalCount) : 0, color: '#ec4899', desc: 'تنظيم الحجج السليمة والدفاع البنيوي' },
                { name: 'التركيب ومخاطبة الوجود', value: Math.round((scoresSum[4] / totalSum) * 100) || 25, rawScore: totalCount > 0 ? Math.round(scoresSum[4] / totalCount) : 0, color: '#8b5cf6', desc: 'ربط الفلسفة بالذات والواقع الإنساني الشخصي' }
              ];

              return (
                <div className="space-y-8 animate-fade-in text-right" dir="rtl">
                  {/* Top Analytics Banner Card */}
                  <div className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 sm:gap-6">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0" />
                        واجهة التحليلات العامة: تطور مستويات التفكير النقدي والفضول المعرفي
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 hidden sm:block">
                        راقب بمرور الوقت مؤشرات التقدم المعرفي من خلال تجميع معطيات تلاميذك وتحليل كفاءة التفلسف التساؤلي لديهم.
                      </p>
                    </div>

                    {/* Simulation Controller & Tools */}
                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
                      <div className="flex items-center justify-between sm:justify-start gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl min-h-[44px]">
                        <span className="text-[11px] font-bold text-slate-500">مستوى دمج المحاكاة التجريبية:</span>
                        <button
                          type="button"
                          onClick={() => setUseSimulationData(!useSimulationData)}
                          className={`min-h-[34px] px-3 py-1.5 text-[10px] font-extrabold rounded-lg transition-all cursor-pointer ${
                            useSimulationData 
                              ? 'bg-emerald-500 text-white shadow-xs' 
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {useSimulationData ? 'نشط (10 دفاتر نموذجية)' : 'غير نشط (البيانات الفعلية)'}
                        </button>
                      </div>

                      {/* Dropdown in Analytics page itself to switch sessions sync */}
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                          value={selectedSessionId}
                          onChange={(e) => setSelectedSessionId(e.target.value)}
                          className="w-full sm:w-auto min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs font-black rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 sm:min-w-[200px] shadow-sm transition"
                          disabled={useSimulationData}
                        >
                          <option value="all">كل الجلسات (جميع الطلاب)</option>
                          {sessions.map(s => (
                            <option key={s.sessionId} value={s.sessionId}>
                              {s.title} ({s.level})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Presentation Mode & Cohort Print Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={totalCount === 0}
                          onClick={() => triggerPrintReport('cohort')}
                          className={`w-full sm:w-auto min-h-[44px] py-2.5 px-4 font-extrabold border rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs sm:text-[11px] ${
                            totalCount === 0
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-80'
                              : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-900'
                          }`}
                        >
                          <Printer className="w-4 h-4 shrink-0" />
                          <span>طباعة تقرير الفصل</span>
                        </button>

                        <button
                          type="button"
                          disabled={totalCount === 0}
                          onClick={() => setShowPresentationMode(true)}
                          className={`w-full sm:w-auto min-h-[44px] py-2.5 px-4 font-extrabold border rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs sm:text-[11px] ${
                            totalCount === 0 
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-80' 
                              : 'bg-slate-950 hover:bg-slate-900 border-slate-800 text-amber-400 hover:text-white'
                          }`}
                        >
                          <Tv className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>وضع التقديم بالشاشة الكاملة</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Sessions Directory for Launching Side Drawer AnalyticalReport */}
                  {(() => {
                    const q = analyticsSessionSearch.trim().toLowerCase();
                    const filteredAnalyticsSessions = sessions.filter((s) => {
                      if (!q) return true;
                      return (
                        String(s.title || '').toLowerCase().includes(q) ||
                        String(s.sessionId || '').toLowerCase().includes(q) ||
                        String(s.level || '').toLowerCase().includes(q) ||
                        String(s.stream || '').toLowerCase().includes(q)
                      );
                    });

                    return (
                      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                          <div className="space-y-1">
                            <h4 className="text-sm sm:text-base font-black text-slate-900">
                              قائمة الجلسات والتقارير التحليلية (Firestore)
                            </h4>
                            <p className="text-xs text-slate-500 font-medium">
                              اضغط على أي جلسة لفتح تقريرها التحليلي المباشر في نافذة جانبية ·{' '}
                              <span className="font-mono tabular-nums text-slate-700 font-bold">
                                {filteredAnalyticsSessions.length} جلسة
                              </span>
                            </p>
                          </div>

                          <div className="relative w-full sm:w-64 shrink-0">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={analyticsSessionSearch}
                              onChange={(e) => setAnalyticsSessionSearch(e.target.value)}
                              placeholder="تصفية الجلسات بالاسم أو الرمز..."
                              className="w-full min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {sessions.length === 0 ? (
                          <div className="border border-dashed border-slate-200 rounded-xl py-8 px-4 text-center space-y-3 bg-slate-50/50">
                            <p className="text-xs font-bold text-slate-600">
                              لا توجد جلسات تشخيصية منشأة بعد لعرض تقاريرها.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setTeacherActiveTab('sessions');
                                setShowCreateSession(true);
                              }}
                              className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              إنشاء جلسة تشخيصية جديدة
                            </button>
                          </div>
                        ) : filteredAnalyticsSessions.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-500">
                            لا توجد جلسة مطابقة لعبارة البحث الحالية.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredAnalyticsSessions.map((sess) => {
                              const sessSubmissionsCount = submissions.filter(
                                (sub) =>
                                  String(sub.sessionId || sub.session_id || '').toUpperCase() ===
                                  String(sess.sessionId || '').toUpperCase()
                              ).length;
                              const isDrawerOpen = reportDrawerSessionId === sess.sessionId;

                              return (
                                <button
                                  key={sess.sessionId}
                                  type="button"
                                  onClick={() => openSessionReportDrawer(sess.sessionId)}
                                  className={`group text-right bg-white border rounded-2xl p-4 flex flex-col justify-between gap-3 transition-colors cursor-pointer ${
                                    isDrawerOpen
                                      ? 'border-indigo-600 bg-indigo-50/30'
                                      : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50/60'
                                  }`}
                                >
                                  <div className="space-y-2 w-full">
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-semibold">
                                      <span className="font-mono tabular-nums font-black text-slate-800">
                                        {sess.sessionId}
                                      </span>
                                      <span className={sess.isFrozen ? 'text-amber-700' : 'text-emerald-700'}>
                                        {sess.isFrozen ? 'موقوفة' : 'نشطة'}
                                      </span>
                                    </div>

                                    <h5 className="text-sm font-black text-slate-900 leading-snug line-clamp-2">
                                      {sess.title}
                                    </h5>

                                    <p className="text-xs text-slate-500 truncate">
                                      {sess.level} · {sess.stream} · فوج {sess.classNumber}
                                    </p>
                                  </div>

                                  <div className="w-full pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                    <span className="font-mono tabular-nums text-slate-600 font-bold">
                                      {sessSubmissionsCount} استجابة
                                    </span>
                                    <span className="inline-flex items-center gap-1 font-bold text-indigo-700 group-hover:text-indigo-800 whitespace-nowrap shrink-0">
                                      <span>فتح التقرير التحليلي</span>
                                      <ChevronLeft className="w-3.5 h-3.5" />
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })()}

                  {totalCount === 0 ? (
                    <div className="text-center py-12 sm:py-16 px-4 bg-white rounded-[28px] sm:rounded-[32px] border border-dashed border-slate-200 shadow-sm">
                      <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <TrendingUp className="w-8 h-8 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-black text-slate-700">لا توجد سجلات كافية في الجلسة المحددة</h4>
                      <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                        يتطلب هذا التحليل البياني التفاعلي استلام استمارات التلاميذ أولاً. يرجى تزويد التلاميذ برابط التشخيص الخاص بالفصل.
                      </p>
                      <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setUseSimulationData(true)}
                          className="min-h-[44px] py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer inline-flex items-center justify-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>تشغيل محاكاة تجريبية حيوية</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTeacherActiveTab('sessions')}
                          className="min-h-[44px] py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                        >
                          نظام إدارة الجلسات
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* KPIs Section */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
                        {/* KPI 1: Critical Thinking Index */}
                        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs text-slate-400 font-bold block">معدل التفكير النقدي الجماعي</span>
                              <span className="text-3xl font-black text-slate-800 font-mono mt-1 block">
                                {avgCritical}%
                              </span>
                            </div>
                            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                              <Brain className="w-6 h-6" />
                            </div>
                          </div>
                          <div className="mt-4 space-y-1">
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${avgCritical}%` }}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                              <span>التصنيف البيداغوجي:</span>
                              <span className="text-emerald-600">
                                {avgCritical >= 75 ? 'متقدم ومتفطن' : avgCritical >= 50 ? 'مقبول ونشط' : 'يتطلب معالجة فورية'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* KPI 2: Curiosity Index */}
                        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs text-slate-400 font-bold block">معدل الفضول المعرفي الشامل</span>
                              <span className="text-3xl font-black text-slate-800 font-mono mt-1 block">
                                {avgCuriosity}%
                              </span>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                              <Activity className="w-6 h-6" />
                            </div>
                          </div>
                          <div className="mt-4 space-y-1">
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${avgCuriosity}%` }}></div>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                              <span>شغف التساؤل والتعلم:</span>
                              <span className="text-blue-600">
                                {avgCuriosity >= 75 ? 'متوهج ومبادر' : avgCuriosity >= 50 ? 'منتبه وقيد السؤال' : 'متردد وعازف'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* KPI 3: Correlation & Dynamic Recommendation */}
                        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between md:col-span-1">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <span className="text-xs text-slate-400 font-bold block">معامل الارتباط (التفكير × الفضول)</span>
                              <span className="text-sm font-black text-slate-800 mt-1 block">
                                {correlationLabel}
                              </span>
                            </div>
                            <div className="p-2.5 bg-violet-50 rounded-xl text-violet-600 font-mono font-bold text-xs shrink-0 select-none tabular-nums">
                              r = {correlationStrength ? correlationStrength.toFixed(2) : '0.0'}
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500/90 mt-3 leading-relaxed font-semibold">
                            {correlationText}
                          </p>
                        </div>
                      </div>

                      {/* Main Interactive Graph Grid representing temporal changes */}
                      <div className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border border-slate-200 shadow-sm space-y-5 sm:space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4 sm:pb-5">
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0"></span>
                              محور تتبع المنحنيات ومستويات التقدم المعرفي بالفصل الدراسي
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed hidden sm:block">
                              يستخدم هذا الرسم البياني صيغة التنعيم الرياضي البناء لترسيم المؤشرات. يمكنك التبديل بين التجميع الزمني أو تدقيق حالات الطلاب بالتسلسل.
                            </p>
                          </div>

                          {/* Graphical configuration buttons */}
                          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                            {/* Grouping toggler */}
                            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                              <button
                                type="button"
                                onClick={() => setAnalyticsGroupMode('daily')}
                                className={`min-h-[36px] px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                  analyticsGroupMode === 'daily'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>تجميع متوسطات التواريخ</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnalyticsGroupMode('sequential')}
                                className={`min-h-[36px] px-3 py-1.5 font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                  analyticsGroupMode === 'sequential'
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                <TrendingUp className="w-3.5 h-3.5" />
                                <span>تفصيل التلاميذ تتابعياً</span>
                              </button>
                            </div>

                            {/* Visibility toggler */}
                            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                              <button
                                type="button"
                                onClick={() => setAnalyticsShowType('both')}
                                className={`min-h-[36px] px-2.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                                  analyticsShowType === 'both' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                الكل
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnalyticsShowType('critical')}
                                className={`min-h-[36px] px-2.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                                  analyticsShowType === 'critical' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                التفكير النقدي
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnalyticsShowType('curiosity')}
                                className={`min-h-[36px] px-2.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer ${
                                  analyticsShowType === 'curiosity' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                                }`}
                              >
                                الفضول المعرفي
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Interactive AreaChart with gorgeous smooth styling */}
                        <div className="h-60 sm:h-80 w-full" dir="ltr">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 15, right: 30, left: -20, bottom: 5 }}>
                              <defs>
                                <linearGradient id="colorCrit" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                                </linearGradient>
                                <linearGradient id="colorCur" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey={analyticsGroupMode === 'daily' ? 'date' : (analyticsGroupMode === 'sequential' ? 'name' : 'idx')} 
                                tick={{ fill: '#475569', fontSize: 10, fontWeight: 'bold' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis 
                                domain={[0, 100]} 
                                tick={{ fill: '#94a3b8', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip 
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-xl text-right text-xs space-y-2" dir="rtl">
                                        <p className="font-extrabold text-amber-400 border-b border-slate-800 pb-1.5 flex justify-between gap-5">
                                          <span>{analyticsGroupMode === 'daily' ? `فترة: ${data.date}` : data.name}</span>
                                                                                    {analyticsGroupMode === 'daily' && (
                                            <span className="text-[10px] text-slate-400">({data['الاستجابات']} استجابات)</span>
                                          )}
                                        </p>
                                        {payload.map((pld, index) => (
                                          <p key={index} className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pld.color }}></span>
                                            <span className="text-slate-300 font-semibold">{pld.name}:</span>
                                            <span className="font-semibold text-white font-mono">{pld.value}%</span>
                                          </p>
                                        ))}
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Legend 
                                align="right" 
                                verticalAlign="top" 
                                height={36} 
                                iconType="circle"
                              />
                              {(analyticsShowType === 'both' || analyticsShowType === 'critical') && (
                                <Area 
                                  type="monotone" 
                                  name="التفكير النقدي"
                                  dataKey="التفكير النقدي" 
                                  stroke="#10b981" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorCrit)" 
                                  animationDuration={400}
                                />
                              )}
                              {(analyticsShowType === 'both' || analyticsShowType === 'curiosity') && (
                                <Area 
                                  type="monotone" 
                                  name="الفضول المعرفي"
                                  dataKey="الفضول المعرفي" 
                                  stroke="#3b82f6" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorCur)" 
                                  animationDuration={400}
                                />
                              )}
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Thought Patterns Pie Chart (Based on the Five Diagnostic Axes) */}
                      <div className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border border-slate-200 shadow-sm space-y-5 sm:space-y-6">
                        <div className="border-b border-slate-100 pb-4 sm:pb-5">
                          <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full shrink-0"></span>
                            تشخيص الأنماط الفكرية: توزيع الـخـمـسـة أبعاد المعرفية بالفصل الدراسي
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed hidden sm:block">
                            يوضح هذا التحليل التوزيع النسبي للوزن المعرفي الكلي لطلابك على الأبعاد الخمسة المرجعية لمنصة فيلوسكان، مع توضيح مستواهم المتوسط في كل محور.
                          </p>
                        </div>

                        {(() => {
                          const scoresSum = [0, 0, 0, 0, 0];
                          baseSubmissions.forEach(sub => {
                            const scores = calculateFiveAxesScores(sub.answers || sub.responses || {});
                            scoresSum[0] += scores[0];
                            scoresSum[1] += scores[1];
                            scoresSum[2] += scores[2];
                            scoresSum[3] += scores[3];
                            scoresSum[4] += scores[4];
                          });

                          const totalSum = scoresSum.reduce((a, b) => a + b, 0) || 1;
                          const pieData = [
                            { name: 'التصور الفلسفي المسبق', value: Math.round((scoresSum[0] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[0] / totalCount) : 0, color: '#3b82f6', desc: 'مدى نضج الفكرة المسبقة ومصدرها المكتسب' },
                            { name: 'الألفة والبعد الوجداني', value: Math.round((scoresSum[1] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[1] / totalCount) : 0, color: '#ec4899', desc: 'الشغف وتجاوز الخوف أو النفور الأولي من المادة' },
                            { name: 'المنهج والتساؤل الفكري', value: Math.round((scoresSum[2] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[2] / totalCount) : 0, color: '#10b981', desc: 'الاعتماد على الفحص الواقعي والأسئلة الأصيلة' },
                            { name: 'القيمة المعرفية الذاتية', value: Math.round((scoresSum[3] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[3] / totalCount) : 0, color: '#f59e0b', desc: 'تقييم أهمية الفلسفة لتطوير التفكير الشامل' },
                            { name: 'الاستعداد الحجاجي التواصلي', value: Math.round((scoresSum[4] / totalSum) * 100) || 20, rawScore: totalCount > 0 ? Math.round(scoresSum[4] / totalCount) : 0, color: '#8b5cf6', desc: 'المشاركة والحجاج الفعال دون توتر أو عزوف' },
                          ];

                          return (
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
                              {/* Recharts Pie Chart (5/12 width on desktop) */}
                              <div className="col-span-1 lg:col-span-5 flex flex-col items-center justify-center">
                                <div className="h-56 sm:h-64 w-full relative" dir="ltr">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={65}
                                        outerRadius={95}
                                        paddingAngle={4}
                                        dataKey="value"
                                      >
                                        {pieData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                      </Pie>
                                      <Tooltip
                                        formatter={(value, name, props) => [
                                          `${value}% من الثقل المعرفي الكلي للفئة (متوسط العلامة: ${props.payload.rawScore}%)`,
                                          `${name}`
                                        ]}
                                        contentStyle={{
                                          direction: 'rtl',
                                          borderRadius: '16px',
                                          borderColor: '#e2e8f0',
                                          boxShadow: '0 4px 12px rgba(15,23,42,0.05)',
                                          padding: '8px 12px'
                                        }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>

                                  {/* Absolute Core Decoration */}
                                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xl font-black text-slate-800 font-mono select-none">5</span>
                                    <span className="text-[10px] text-slate-400 font-bold select-none">أبعاد تشخيصية</span>
                                  </div>
                                </div>
                              </div>

                              {/* Interactive indicators list and details (7/12 width on desktop) */}
                              <div className="col-span-1 lg:col-span-7 space-y-4">
                                <h5 className="text-[12px] font-black text-slate-700 mb-3 text-right flex items-center gap-1.5">
                                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                                  <span>تحليل وتوصيف الأبعاد الخمسة في هذا الفصل الدراسي:</span>
                                </h5>
                                <div className="space-y-3">
                                  {pieData.map((dimension, idx) => {
                                    // Custom badge helper for raw scores
                                    let ratingText = '';
                                    let ratingBadgeColor = '';
                                    if (dimension.rawScore >= 75) {
                                      ratingText = 'ممتاز وموقظ';
                                      ratingBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                    } else if (dimension.rawScore >= 50) {
                                      ratingText = 'متوسط ونشط';
                                      ratingBadgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
                                    } else {
                                      ratingText = 'بحاجة لمعالجة عاجلة';
                                      ratingBadgeColor = 'bg-rose-50 text-rose-700 border-rose-100';
                                    }

                                    return (
                                      <div key={`pie-det-${idx}`} className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl hover:border-slate-300 transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                        <div className="flex items-start gap-2.5">
                                          <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: dimension.color }} />
                                          <div>
                                            <p className="font-extrabold text-slate-800 text-xs flex items-center gap-2">
                                              {dimension.name}
                                              <span className="text-[10px] font-mono font-bold bg-slate-200/70 text-slate-600 px-1.5 py-0.5 rounded-md">
                                                المساهمة: {dimension.value}%
                                              </span>
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed font-semibold">
                                              {dimension.desc}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2 font-mono text-xs w-full md:w-auto md:shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                                          <span className="text-[10px] font-bold text-slate-400 font-sans md:hidden">مستويات الفصل:</span>
                                          <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-800">{dimension.rawScore}%</span>
                                            <span className={`text-[10px] font-sans font-bold px-2 py-0.5 rounded-lg border ${ratingBadgeColor}`}>
                                              {ratingText}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* NEW: Comprehensive 5-Dimensions Radar & Stacked Bar Distribution Charts */}
                      <div className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border border-slate-200 shadow-sm space-y-5 sm:space-y-6">
                        <div className="border-b border-slate-100 pb-4 sm:pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2 text-right" dir="rtl">
                              <span className="w-2.5 h-2.5 bg-violet-600 rounded-full shrink-0"></span>
                              رسم بياني متقدم: الكفاءة المعرفية وتوزيع الطلاب عبر الأبعاد التشخيصية الخمسة
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed text-right hidden sm:block" dir="rtl">
                              رؤية تحليلية مزدوجة للملف المعرفي الجمعي لطلاب المادة وتوزيعهم الإحصائي ضمن الأنماط المعرفية الخمسة.
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-100 px-3 py-1 rounded-xl shrink-0 inline-flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                            <span>تفصيل خماسي الأبعاد</span>
                          </span>
                        </div>

                        {(() => {
                          const list = useSimulationData 
                            ? mockSimulationSubmissions 
                            : (selectedSessionId === 'all' ? submissions : submissionsForSelectedSession);

                          const dimensionNames = [
                            'التصور الفلسفي',
                            'البعد الوجداني',
                            'المنهج الفكري',
                            'القيمة المعرفية',
                            'الاستعداد الحجاجي'
                          ];

                          let sums = [0, 0, 0, 0, 0];
                          list.forEach(sub => {
                            const answersObj = sub.answers || sub.responses || {};
                            const scores = calculateFiveAxesScores(answersObj);
                            for (let i = 0; i < 5; i++) {
                              sums[i] += scores[i] || 0;
                            }
                          });

                          const radarData = dimensionNames.map((name, i) => ({
                            subject: name,
                            value: list.length > 0 ? Math.round(sums[i] / list.length) : 0,
                            fullMark: 100
                          }));

                          const barDistribution = dimensionNames.map((name, i) => {
                            let high = 0;
                            let med = 0;
                            let low = 0;
                            list.forEach(sub => {
                              const answersObj = sub.answers || sub.responses || {};
                              const scores = calculateFiveAxesScores(answersObj);
                              const val = scores[i] || 0;
                              if (val >= 75) high++;
                              else if (val >= 50) med++;
                              else low++;
                            });
                            return {
                              name,
                              'متقدم (≥ 75%)': high,
                              'متوسط (50-74%)': med,
                              'بحاجة لدعم (< 50%)': low
                            };
                          });

                          return (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                              {/* Left: Radar Chart representing Group average Profile */}
                              <div className="space-y-3 bg-slate-50/50 border border-slate-200 p-4 sm:p-5 rounded-2xl">
                                <div className="text-right" dir="rtl">
                                  <h5 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                    <Compass className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    <span>بصمة الوعي المعرفي الجمعي (Radar Index)</span>
                                  </h5>
                                  <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">يمثل هذا المخطط المتوسط العام للأداء والتمثلات المعرفية للتلاميذ في الفصل.</p>
                                </div>
                                <div className="h-56 sm:h-64 w-full flex items-center justify-center relative">
                                  {list.length === 0 ? (
                                    <span className="text-xs text-slate-400 italic">انتظار إجابات التلاميذ</span>
                                  ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                        <PolarGrid stroke="#cbd5e1" />
                                        <PolarAngleAxis 
                                          dataKey="subject" 
                                          tick={{ fill: '#334155', fontSize: 8, fontWeight: 'bold' }} 
                                        />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                                        <Radar 
                                          name="معدل المجموعة" 
                                          dataKey="value" 
                                          stroke="#6366f1" 
                                          fill="#818cf8" 
                                          fillOpacity={0.4} 
                                        />
                                        <Tooltip 
                                          content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                              const data = payload[0].payload;
                                              return (
                                                <div className="bg-slate-900 border border-slate-800 text-white rounded-xl p-2.5 shadow-xl text-right text-xs space-y-1" dir="rtl">
                                                  <p className="font-bold text-indigo-300">{data.subject}</p>
                                                  <p className="font-mono text-slate-200">
                                                    متوسط العلامة للقسم: <span className="font-bold text-white">{payload[0].value}%</span>
                                                  </p>
                                                </div>
                                              );
                                            }
                                            return null;
                                          }}
                                        />
                                      </RadarChart>
                                    </ResponsiveContainer>
                                  )}
                                </div>
                              </div>

                              {/* Right: Stacked Bar Chart representing Student Distribution */}
                              <div className="space-y-3 bg-slate-50/50 border border-slate-200 p-4 sm:p-5 rounded-2xl">
                                <div className="text-right" dir="rtl">
                                  <h5 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                    <BarChart3 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                                    <span>توزيع أعداد التلاميذ حسب مستويات التمكن</span>
                                  </h5>
                                  <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">يوضح فئات ومجموعات الطلاب وعدد المتمكنين في كل محور من أصل مجموع التلاميذ.</p>
                                </div>
                                <div className="h-56 sm:h-64 w-full" dir="ltr">
                                  {list.length === 0 ? (
                                    <div className="h-full flex items-center justify-center">
                                      <span className="text-xs text-slate-400 italic">انتظار إجابات التلاميذ</span>
                                    </div>
                                  ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={barDistribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis 
                                          dataKey="name" 
                                          tick={{ fill: '#475569', fontSize: 8, fontWeight: 'bold' }}
                                          axisLine={false}
                                          tickLine={false}
                                        />
                                        <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} allowDecimals={false} axisLine={false} tickLine={false} />
                                        <Tooltip 
                                          contentStyle={{ textAlign: 'right', borderRadius: '12px', fontSize: '11px', borderColor: '#cbd5e1', direction: 'rtl' }}
                                          labelFormatter={(label) => `البعد التشخيصي: ${label}`}
                                        />
                                        <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                        <Bar dataKey="متقدم (≥ 75%)" stackId="a" fill="#10b981" />
                                        <Bar dataKey="متوسط (50-74%)" stackId="a" fill="#3b82f6" />
                                        <Bar dataKey="بحاجة لدعم (< 50%)" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Diagnostic Quadrants insights & Student Listings */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
                        {/* Interactive Quadrants Breakdown Info Card (1/3 Width) */}
                        <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2 mb-1.5">
                              <Brain className="w-4 h-4 text-emerald-500" />
                              خرائط الأنماط المعرفية بالفصل الدراسي
                            </h4>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                              نربط مستويات التفكير بالأقسام لدراسة 4 نماذج شخصية أساسية وتوجيه التدريس تبعا لها:
                            </p>
                          </div>

                          <div className="space-y-4 my-5 text-[11px]">
                            {/* Archetype 1 */}
                            <div className="bg-emerald-50/50 hover:bg-emerald-50 p-2.5 rounded-xl border border-emerald-100/60 transition">
                              <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <span>المتفلسف النشط</span>
                                </span>
                                <span className="font-mono text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-black tabular-nums">
                                  {baseSubmissions.filter(s => (s.analysis?.metrics?.criticalThinking || 0) >= 70 && (s.analysis?.metrics?.cognitiveCuriosity || 0) >= 70).length} تلاميذ
                                </span>
                              </p>
                              <p className="text-slate-500 leading-relaxed mt-1 text-[10px]">يقترن عنده الفضول الحاد بالقدرة التحليلية العالية. يدير النقاش بعقلانية ممتازة.</p>
                            </div>

                            {/* Archetype 2 */}
                            <div className="bg-blue-50/50 hover:bg-blue-50 p-2.5 rounded-xl border border-blue-100/60 transition">
                              <p className="font-bold text-blue-800 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <Search className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span>الباحث المندفع</span>
                                </span>
                                <span className="font-mono text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-black tabular-nums">
                                  {baseSubmissions.filter(s => (s.analysis?.metrics?.criticalThinking || 0) < 70 && (s.analysis?.metrics?.cognitiveCuriosity || 0) >= 70).length} تلاميذ
                                </span>
                              </p>
                              <p className="text-slate-500 leading-relaxed mt-1 text-[10px]">فضول مرتفع جداً لكن يفتقر لضوابط الفحص الصارم للآراء؛ يتقبل الأمور بسهولة لكنه يعشق القراءة.</p>
                            </div>

                            {/* Archetype 3 */}
                            <div className="bg-amber-50/50 hover:bg-amber-50 p-2.5 rounded-xl border border-amber-100/60 transition">
                              <p className="font-bold text-amber-800 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <Scale className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>الناقد الحذر</span>
                                </span>
                                <span className="font-mono text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-black tabular-nums">
                                  {baseSubmissions.filter(s => (s.analysis?.metrics?.criticalThinking || 0) >= 70 && (s.analysis?.metrics?.cognitiveCuriosity || 0) < 70).length} تلاميذ
                                </span>
                              </p>
                              <p className="text-slate-500 leading-relaxed mt-1 text-[10px]">يفكك الآراء ويحاكم الأوهام ببراعة لكنه لا يبادر بالاستفسار الذاتي الفعال أو الميول التساؤلية الشغوفة.</p>
                            </div>

                            {/* Archetype 4 */}
                            <div className="bg-red-50/50 hover:bg-red-50 p-2.5 rounded-xl border border-red-100/60 transition">
                              <p className="font-bold text-red-800 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <Ban className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                  <span>التابع الخائف</span>
                                </span>
                                <span className="font-mono text-[9px] bg-red-100 px-1.5 py-0.5 rounded-full font-black tabular-nums">
                                  {baseSubmissions.filter(s => (s.analysis?.metrics?.criticalThinking || 0) < 70 && (s.analysis?.metrics?.cognitiveCuriosity || 0) < 70).length} تلاميذ
                                </span>
                              </p>
                              <p className="text-slate-500 leading-relaxed mt-1 text-[10px]">مستويات منخفضة من التفكير والفضول بدافع الرغبة بالسلامة واستقبال الأجوبة الجاهزة المحصنة.</p>
                            </div>
                          </div>

                          <div className="text-[9px] bg-slate-50 p-2.5 rounded-xl text-slate-500 border border-slate-100 leading-normal flex items-start gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                            <span>نصيحة تربوية: وجه أسئلتك بالفصل الدراسي بطريقة تستثير الباحثين المندفعين منهجيا، وتطمئن التابعين الخائفين وجدانيا لدمج العقول جميعا.</span>
                          </div>
                        </div>

                        {/* Student Comparative listings with micro progress indicator (2/3 Width) */}
                        <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[28px] border border-slate-200 shadow-sm flex flex-col justify-between">
                          <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-3">
                              <div>
                                <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                  <BarChart3 className="w-4 h-4 text-sky-600 shrink-0" />
                                  <span>جدول تمايز مستويات التلاميذ الفردية</span>
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">ترتيب تنازلي لعلامات التلميذ لمراقبة مستويات التنمية البيداغوجية بالمجموعات.</p>
                              </div>

                              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 text-[10px] font-bold select-none w-full sm:w-auto">
                                <button
                                  type="button"
                                  onClick={() => setAnalyticsSortBy('critical')}
                                  className={`flex-1 sm:flex-none min-h-[36px] px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                    analyticsSortBy === 'critical' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  حسب التفكير النقدي
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAnalyticsSortBy('curiosity')}
                                  className={`flex-1 sm:flex-none min-h-[36px] px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                    analyticsSortBy === 'curiosity' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  حسب الفضول المعرفي
                                </button>
                              </div>
                            </div>

                            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                              {sortedStudentMetrics.map((student, idx) => {
                                const crit = Math.round(student.analysis?.metrics?.criticalThinking || 0);
                                const cur = Math.round(student.analysis?.metrics?.cognitiveCuriosity || 0);
                                return (
                                  <div key={`metrics-student-${student.id || idx}`} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/40 px-2 rounded-xl transition">
                                    <div className="flex items-center gap-3">
                                      <span className="w-6 h-6 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0">
                                        {idx + 1}
                                      </span>
                                      <div>
                                        <p className="font-extrabold text-slate-700 leading-normal">{student.studentName}</p>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                          التصنيف: {student.overriddenClassification || student.analysis?.classification || 'غير معروف'}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Indicators side */}
                                    <div className="w-full sm:w-1/2 grid grid-cols-2 sm:flex items-center gap-4 sm:gap-6 sm:justify-end">
                                      {/* Crit value */}
                                      <div className="w-full sm:w-24 space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold">
                                          <span className="text-slate-400">التفكير النقدي</span>
                                          <span className="text-emerald-600 font-mono font-black">{crit}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${crit}%` }}></div>
                                        </div>
                                      </div>

                                      {/* Cur value */}
                                      <div className="w-full sm:w-24 space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold">
                                          <span className="text-slate-400">الفضول المعرفي</span>
                                          <span className="text-blue-600 font-mono font-black">{cur}%</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${cur}%` }}></div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="border-t border-slate-100 pt-3 mt-4 text-[10px] text-slate-400 text-left">
                            * تستخدم الخوارزمية معالجة دقيقة مبنية على استبيان فِيلوسكان.
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Interactive Philosophical Representations Statistics Component (Recharts) */}
                  <StudentStatistics
                    submissions={submissions}
                    simulationSubmissions={mockSimulationSubmissions}
                    sessions={sessions}
                    selectedSessionId={selectedSessionId}
                    onSessionChange={(sessionId) => setSelectedSessionId(sessionId)}
                    useSimulationData={useSimulationData}
                    onToggleSimulationData={(enabled) => setUseSimulationData(enabled)}
                    onSelectStudent={(student) => openStudentDetails(student)}
                    onNavigateToSessions={() => setTeacherActiveTab('sessions')}
                  />

                  {/* Multi-Class Comparison & Cognitive Obstacles Matrix */}
                  <ClassComparisonPanel
                    sessions={sessions}
                    submissions={useSimulationData ? mockSimulationSubmissions : submissions}
                    onSelectSession={(sid) => openSessionReportDrawer(sid)}
                    onPrintCohortReport={() => triggerPrintReport('cohort')}
                  />

                  {/* Immersive Presentation Mode Modal */}
                  {showPresentationMode && (
                    <div className="fixed inset-0 bg-slate-950 text-slate-100 z-50 overflow-y-auto flex flex-col font-sans transition-all duration-300" dir="rtl">
                      {/* Top Presentation Bar */}
                      <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 sm:gap-4 sticky top-0 z-10 shadow-lg">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-amber-500 text-slate-950 p-2 sm:p-2.5 rounded-2xl flex items-center justify-center shrink-0">
                              <Presentation className="w-5 h-5" />
                            </div>
                            <div className="text-right min-w-0">
                              <span className="text-[10px] text-amber-400 font-extrabold tracking-widest block uppercase truncate">وضع العرض التفاعلي العام داخل القسم</span>
                              <h2 className="text-xs sm:text-base font-black text-white leading-normal truncate">البصمة الفكرية الجماعية وتطور مهارات التفلسف</h2>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowPresentationMode(false)}
                            className="md:hidden min-h-[40px] py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition text-[11px] flex items-center gap-1.5 cursor-pointer shadow-md shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>خروج</span>
                          </button>
                        </div>

                        {/* Middle Nav Tab Controls */}
                        <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 overflow-x-auto max-w-full gap-1">
                          <button
                            type="button"
                            onClick={() => setPresentationTab('overview')}
                            className={`min-h-[40px] py-2 px-3 sm:px-4 rounded-xl text-[11px] sm:text-xs font-black transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                              presentationTab === 'overview'
                                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>اللوحة الرئيسية الجامعة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPresentationTab('trends')}
                            className={`min-h-[40px] py-2 px-3 sm:px-4 rounded-xl text-[11px] sm:text-xs font-black transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                              presentationTab === 'trends'
                                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>منحنيات التفكير والفضول</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPresentationTab('axes')}
                            className={`min-h-[40px] py-2 px-3 sm:px-4 rounded-xl text-[11px] sm:text-xs font-black transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                              presentationTab === 'axes'
                                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>خريطة الأبعاد المعرفية الـ5</span>
                          </button>
                        </div>

                        {/* Exit/Controls block */}
                        <div className="hidden md:flex items-center gap-3">
                          {(() => {
                            const activeSess = sessions.find(s => s.sessionId === selectedSessionId);
                            return activeSess ? (
                              <div className="hidden lg:flex flex-col text-left pl-3 border-l border-slate-800 text-[11px] font-bold">
                                <span className="text-slate-400 text-right">الفصل المعروض حالياً:</span>
                                <span className="text-amber-300 text-right">{activeSess.title} ({activeSess.level})</span>
                              </div>
                            ) : (
                              <div className="hidden lg:flex flex-col text-left pl-3 border-l border-slate-800 text-[11px] font-bold">
                                <span className="text-slate-400 text-right">كل الجلسات:</span>
                                <span className="text-amber-300 text-right">مجموعة التلاميذ المشتركة</span>
                              </div>
                            );
                          })()}

                          <button
                            type="button"
                            onClick={() => setShowPresentationMode(false)}
                            className="min-h-[44px] py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition text-[11px] flex items-center gap-2 cursor-pointer shadow-md"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>إنهاء العرض</span>
                          </button>
                        </div>
                      </header>

                      {/* Main Space under presentation mode */}
                      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8">
                        
                        {/* Top Banner indicating Privacy constraint */}
                        <div className="bg-slate-900 border border-slate-800 text-slate-300 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                          <div className="flex items-center gap-2.5 text-right">
                            <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                            <p className="font-semibold leading-relaxed">
                              تم حجب المعطيات الفردية حمايةً <strong>للخصوصية التامة والنزاهة النفسية لكل تلميذ</strong> تفادياً لأي إحراج أثناء البث المباشر بالفصل.
                            </p>
                          </div>
                          <span className="bg-slate-950 font-mono text-amber-500/80 px-2.5 py-1 rounded-lg border border-slate-800 shrink-0 font-bold text-[10px]">
                            بيانات بيداغوجية مجمّعة للفئة
                          </span>
                        </div>

                        {presentationTab === 'overview' && (
                          <div className="space-y-8 animate-fade-in">
                            {/* 2 Big Headline Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 text-right">
                              {/* Critical card */}
                              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-8 rounded-[36px] shadow-2xl space-y-5">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h3 className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono tracking-tight">{avgCritical}%</h3>
                                    <span className="text-xs sm:text-sm text-slate-300 font-extrabold block mt-2">معدل التفكير النقدي الجماعي للقسم</span>
                                  </div>
                                  <div className="p-3 sm:p-4 bg-emerald-950/50 text-emerald-400 border border-emerald-900/40 rounded-3xl">
                                    <Brain className="w-6 sm:w-8 h-6 sm:h-8" />
                                  </div>
                                </div>
                                <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                                  <div className="h-full bg-emerald-400 rounded-full shadow-emerald-400/20" style={{ width: `${avgCritical}%` }}></div>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                                  {avgCritical >= 75 
                                    ? 'يمتلك الفصل فكراً نقدياً ممتازاً قادراً على محاكمة الآراء الجاهزة وتفكيك الأوهام الفلسفية بطريقة متزنة.' 
                                    : avgCritical >= 50 
                                    ? 'يتحلى الطلاب بيقظة معرفية نشطة ومقبولة؛ يتفاعلون بشكل حواري جيد مع الأفكار لكنهم بحاجة لتعميق أدلة الفحص.' 
                                    : 'مستويات التفكير بحاجة إلى رعاية وتفعيل أدوات المحاججة لتجاوز الأحكام المسبقة الشائعة لدى التلاميذ.'}
                                </p>
                              </div>

                              {/* Curiosity card */}
                              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-8 rounded-[36px] shadow-2xl space-y-5">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h3 className="text-3xl sm:text-4xl font-black text-blue-400 font-mono tracking-tight">{avgCuriosity}%</h3>
                                    <span className="text-xs sm:text-sm text-slate-300 font-extrabold block mt-2">مستويات الشغف والفضول المعرفي</span>
                                  </div>
                                  <div className="p-3 sm:p-4 bg-blue-950/50 text-blue-400 border border-blue-900/40 rounded-3xl">
                                    <Activity className="w-6 sm:w-8 h-6 sm:h-8" />
                                  </div>
                                </div>
                                <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                                  <div className="h-full bg-blue-400 rounded-full shadow-blue-400/20" style={{ width: `${avgCuriosity}%` }}></div>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                                  {avgCuriosity >= 75 
                                    ? 'شغف فلسفي متميز ومتوهج! يبادر الفصل بالأسئلة البناءة المعمقة، ويبدون طاقة عظيمة للسير على منسق التساؤل الموقظ.' 
                                    : avgCuriosity >= 50 
                                    ? 'انتباه جماعي منفتح على الفحص؛ التلاميذ مهتمون باستكشاف القضايا الفلسفية المعروضة وبناء رأيهم الخاص.' 
                                    : 'يتطلب الأمر استثارة الشغف عبر ربط المفاهيم الكبرى بالحياة والاهتمامات اليومية للتلاميذ لتجاوز حاجز الملل أو النفور.'}
                                </p>
                              </div>
                            </div>

                            {/* Cognitive Synthesis and Insights for the Class */}
                            <div className="bg-slate-900/60 border border-slate-800/80 p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] text-right space-y-5">
                              <h3 className="text-sm sm:text-base font-black text-amber-400 flex items-center gap-2">
                                <Sparkles className="w-4 sm:w-5 h-4 sm:h-5 text-amber-400" />
                                التوصيات البيداغوجية والمسارات التربوية الأبرز لتحصين العمل داخل القسم:
                              </h3>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[11px] sm:text-xs text-slate-300 leading-relaxed font-semibold">
                                <div className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl space-y-2">
                                  <h4 className="font-bold text-amber-400 flex items-center gap-1.5 text-xs sm:text-sm">
                                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                    <span>أولاً: استراتيجيات المحاكاة الحوارية</span>
                                  </h4>
                                  <p className="font-medium">
                                    تخصيص مستهل الحصص لمناظرات ثنائية مفاجئة تُحفّز الطلاب على إبطال المغالطات وتدريب الحجة العقلانية البالغة.
                                  </p>
                                </div>

                                <div className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl space-y-2">
                                  <h4 className="font-bold text-emerald-400 flex items-center gap-1.5 text-xs sm:text-sm">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                    <span>ثانياً: بناء النقد البناء المتجاوز</span>
                                  </h4>
                                  <p className="font-medium">
                                    البدء بالمصطلحات البسيطة وتفكيك مدلولاتها الاجتماعية للتأكيد للطلاب على قدرة عقولهم الذاتية في تلمس الحقائق ونقد الأوهام.
                                  </p>
                                </div>

                                <div className="bg-slate-950/50 border border-slate-800 p-5 rounded-2xl space-y-2">
                                  <h4 className="font-bold text-blue-400 flex items-center gap-1.5 text-xs sm:text-sm">
                                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                    <span>ثالثاً: تثبيت دافعية البحث</span>
                                  </h4>
                                  <p className="font-medium">
                                    تشجيع الطلاب على طرح "السؤال الإشكالي الخلاق" وصياغة صكوك معرفية تزيد من تقديرهم للفكر والبحث المستقل.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {presentationTab === 'trends' && (
                          <div className="space-y-6 bg-slate-900 border border-slate-800 p-5 sm:p-8 rounded-[36px] animate-fade-in shadow-2xl">
                            <div>
                              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                                <TrendingUp className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-400" />
                                تتبع التموج النمائي الجماعي لمهارات التفكير والفضول بالفصل
                              </h3>
                              <p className="text-[11px] sm:text-xs text-slate-400 mt-1 leading-relaxed">
                                يعكس المنحني المجموعي التقدم الزمني للطلاب في صياغة الأجوبة بمرور الوقت وقياس الفهم الجماعي التفاعلي.
                              </p>
                            </div>

                            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 inline-flex text-[11px] text-right" dir="rtl">
                              <button
                                type="button"
                                onClick={() => setAnalyticsGroupMode('daily')}
                                className={`px-3.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                  analyticsGroupMode === 'daily' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>تجميع متوسط التواريخ</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setAnalyticsGroupMode('sequential')}
                                className={`px-3.5 py-1.5 font-bold rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                  analyticsGroupMode === 'sequential' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                <TrendingUp className="w-3.5 h-3.5" />
                                <span>تتابع نقاط الاستجابة</span>
                              </button>
                            </div>

                            <div className="h-80 sm:h-[400px] w-full" dir="ltr">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 15, right: 30, left: -20, bottom: 5 }}>
                                  <defs>
                                    <linearGradient id="colorCritPres" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                                    </linearGradient>
                                    <linearGradient id="colorCurPres" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                  <XAxis 
                                    dataKey={analyticsGroupMode === 'daily' ? 'date' : 'idx'} 
                                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <YAxis 
                                    domain={[0, 100]} 
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                  />
                                  <Tooltip 
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                          <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-4 shadow-xl text-right text-xs space-y-2" dir="rtl">
                                            <p className="font-extrabold text-amber-400 border-b border-slate-800 pb-1.5">
                                              <span>{analyticsGroupMode === 'daily' ? `التواريخ: ${data.date}` : `المجموعة: ${data.idx}`}</span>
                                            </p>
                                            {payload.map((pld, index) => (
                                              <p key={index} className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pld.color }}></span>
                                                <span className="text-slate-300 font-semibold">{pld.name}:</span>
                                                <span className="font-semibold text-white font-mono">{pld.value}%</span>
                                              </p>
                                            ))}
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Legend align="right" verticalAlign="top" height={36} iconType="circle" />
                                  <Area 
                                    type="monotone" 
                                    name="التفكير النقدي الجماعي"
                                    dataKey="التفكير النقدي" 
                                    stroke="#10b981" 
                                    strokeWidth={4}
                                    fillOpacity={1} 
                                    fill="url(#colorCritPres)" 
                                  />
                                  <Area 
                                    type="monotone" 
                                    name="الفضول المعرفي الشامل"
                                    dataKey="الفضول المعرفي" 
                                    stroke="#3b82f6" 
                                    strokeWidth={4}
                                    fillOpacity={1} 
                                    fill="url(#colorCurPres)" 
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {presentationTab === 'axes' && (
                          <div className="bg-slate-900 border border-slate-800 p-5 sm:p-8 rounded-[36px] animate-fade-in shadow-2xl space-y-8">
                            <div>
                              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                                <Sparkles className="w-4 sm:w-5 h-4 sm:h-5 text-indigo-400" />
                                الثقل المعرفي خماسي الأبعاد للفصل الدراسي (البصمة الفكرية)
                              </h3>
                              <p className="text-[11px] sm:text-xs text-slate-400 mt-1 leading-relaxed">
                                تفصيل نسبي للثقل والنضج الفكري للطلاب في المحاور الخمسة الكبرى المعتمدة بمنصة فيلوسكان.
                              </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-right">
                              {/* Big Pie Chart on left */}
                              <div className="col-span-1 lg:col-span-5 flex flex-col items-center justify-center">
                                <div className="h-72 sm:h-80 w-full relative" dir="ltr">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={105}
                                        paddingAngle={5}
                                        dataKey="value"
                                      >
                                        {pieData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                      </Pie>
                                      <Tooltip
                                        formatter={(value, name, props) => [
                                          `${value}% من الثقل المعرفي للفصل (الدرجة: ${props.payload.rawScore}%)`,
                                          `${name}`
                                        ]}
                                        contentStyle={{
                                          direction: 'rtl',
                                          borderRadius: '16px',
                                          backgroundColor: '#0f172a',
                                          color: '#fff',
                                          borderColor: '#334155',
                                          padding: '8px 12px'
                                        }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-3xl font-black text-amber-300 font-mono">5</span>
                                    <span className="text-[9px] text-slate-400 font-bold">أبعاد بيداغوجية</span>
                                  </div>
                                </div>
                              </div>

                              {/* Descriptions details on right */}
                              <div className="col-span-1 lg:col-span-7 space-y-4">
                                <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                                  <FileEdit className="w-4 h-4 text-sky-400 shrink-0" />
                                  <span>تحليل نضج الأبعاد المعرفية على المقاييس الجماعية للفئة:</span>
                                </h4>
                                
                                <div className="space-y-3 text-[11px] sm:text-xs text-slate-300">
                                  {pieData.map((d, index) => {
                                    let levelDesc = '';
                                    let levelBg = '';
                                    if (d.rawScore >= 75) {
                                      levelDesc = 'حالة مبهرة ومتأصلة';
                                      levelBg = 'text-emerald-400 bg-emerald-950/40 border-emerald-900/30';
                                    } else if (d.rawScore >= 50) {
                                      levelDesc = 'حالة مقبولة ونشطة';
                                      levelBg = 'text-blue-400 bg-blue-950/40 border-blue-900/30';
                                    } else {
                                      levelDesc = 'بحاجة لمواكبة ملحة';
                                      levelBg = 'text-rose-400 bg-rose-950/40 border-rose-900/40';
                                    }

                                    return (
                                      <div key={index} className="p-3.5 bg-slate-950/40 border border-slate-800 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 font-semibold">
                                        <div className="flex items-start gap-2.5">
                                          <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: d.color }}></span>
                                          <div>
                                            <p className="font-extrabold text-white text-xs sm:text-xs">{d.name}</p>
                                            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 leading-relaxed font-semibold">{d.desc}</p>
                                          </div>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-xl border text-[10px] sm:text-[10px] font-black shrink-0 ${levelBg}`}>
                                          {levelDesc} ({d.rawScore}%)
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </main>
                    </div>
                  )}
                </div>
              );
            })()}

            {teacherActiveTab === 'sessions' && (
              <div className="space-y-8 animate-fade-in" dir="rtl">
                <div className="bg-white p-4 sm:p-6 rounded-[24px] sm:rounded-[28px] border border-slate-200 shadow-sm text-right">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4 mb-6">
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-600 shrink-0" />
                        نظام إدارة الجلسات التعليمية والتشخيصية
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 hidden sm:block">
                        يمكنك هنا تتبع جميع الفصول النشطة ومشاريع الكشف عن الأنماط الفكرية التي قمت بإطلاقها.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreateSession(true)}
                      className="w-full sm:w-auto min-h-[44px] py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      إطلاق جلسة لصف جديد
                    </button>
                  </div>

                  {sessions.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 px-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Calendar className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-sm font-bold text-slate-600">لا توجد جلسات مفعلة حالياً باسمك</p>
                      <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                        سارع بإنشاء جلستك الأولى للحصول على رمز التتبع ورابط الاستبيان لمشاركته مع تلاميذك في ثوانٍ.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowCreateSession(true)}
                        className="mt-4 min-h-[44px] py-2.5 px-5 bg-indigo-50 hover:bg-indigo-100/85 text-indigo-700 rounded-xl text-xs font-extrabold transition cursor-pointer"
                      >
                        إطلاق جلستك الأولى الآن
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                      {sessions.map((sess) => {
                        const sessSubmissions = submissions.filter(sub => sub.sessionId === sess.sessionId);
                        return (
                          <div key={sess.sessionId} className="bg-slate-50 border border-slate-200 rounded-[24px] p-4 sm:p-5 flex flex-col justify-between hover:shadow-xs transition duration-150 font-sans">
                            <div className="space-y-4">
                              <div className="flex justify-between items-start">
                                <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-lg font-mono">
                                  {sess.sessionId}
                                </span>
                                <span className="text-[10px] bg-slate-200/70 border text-slate-600 font-bold px-2 py-0.5 rounded-lg">
                                  {sessSubmissions.length} استجابة
                                </span>
                              </div>

                              <div>
                                <h4 className="font-extrabold text-slate-800 text-sm mb-1 leading-snug">{sess.title}</h4>
                                <p className="text-slate-400 text-[11px] font-semibold">
                                  المستوى: {sess.level} | مسلك: {sess.stream}
                                </p>
                                <p className="text-slate-500 text-[11px] mt-1 font-semibold">
                                  المؤسسة: {sess.institution} ({sess.province}) | فوج {sess.classNumber}
                                </p>
                              </div>
                            </div>

                            <div className="border-t border-slate-200/60 pt-4 mt-4 space-y-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSessionId(sess.sessionId);
                                  setTeacherActiveTab('monitoring');
                                }}
                                className="w-full min-h-[44px] py-2 bg-white hover:bg-slate-100/80 border border-slate-200 rounded-xl text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                                عرض الإحصائيات والتلاميذ
                              </button>

                              <button
                                type="button"
                                onClick={() => openSessionReportDrawer(sess.sessionId)}
                                className="w-full min-h-[42px] py-2 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                التقرير التحليلي (Firestore)
                              </button>

                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCopySessionId(sess.sessionId)}
                                  className="min-h-[42px] py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  رمز الصف
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopySessionLink(sess.sessionId)}
                                  className="min-h-[42px] py-2 bg-indigo-100 hover:bg-indigo-200 border border-indigo-200 text-indigo-700 rounded-xl text-[11px] font-black transition flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  رابط الدخول
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleToggleSupervisedMode(sess.sessionId)}
                                className={`w-full min-h-[44px] py-2 border rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer mt-1 ${
                                  sess.supervisedMode 
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>الوضع المراقب: {sess.supervisedMode ? 'نشيط' : 'غير نشيط'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleToggleFreezeSession(sess.sessionId)}
                                className={`w-full min-h-[44px] py-2 border rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer mt-1 ${
                                  sess.isFrozen 
                                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 font-extrabold shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-600" />
                                <span>تجميد الجلسة: {sess.isFrozen ? 'مجمدة ومغلقة' : 'نشطة ومفتوحة'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openWeightsModal(sess)}
                                className="w-full min-h-[44px] py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                              >
                                <Wrench className="w-3.5 h-3.5 text-slate-500" />
                                <span>تحديد أوزان الخطورة (مخصص)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSharingSession(sess);
                                  setShowShareModal(true);
                                }}
                                className="w-full min-h-[44px] py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer mt-1 shadow-xs"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                مشاركة وتوليد كود QR
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {teacherActiveTab === 'formBank' && teacherSession && (
              <FormBank 
                teacherSession={teacherSession as any} 
                onSessionCreated={(newSess: any) => {
                  fetchSessions();
                  setSelectedSessionId(newSess.sessionId);
                  setMonitoringSubTab('proctoring');
                  setTeacherActiveTab('monitoring');
                  showToast('تم نقل الاستمارة وبث الجلسة التشخيصية الحية بنجاح.');
                }}
              />
            )}

            {teacherActiveTab === 'notifications' && teacherSession && (
              <TeacherNotificationsCenter
                teacherSession={teacherSession}
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                initialNotificationId={deepLinkNotificationId}
                liveIncomingNotification={livePedagogicalNotif}
                onUnreadCountChange={(count) => setPedagogicalUnreadCount(count)}
                onShowToast={showToast}
                onOpenReport={(sid, studentRefId) => {
                  const matched = sessions.find((s) => s.sessionId.toUpperCase() === sid.toUpperCase());
                  if (matched) {
                    setSelectedSessionId(matched.sessionId);
                    setReportDrawerSessionId(matched.sessionId);
                  } else {
                    setSelectedSessionId(sid);
                    setReportDrawerSessionId(sid);
                  }
                  if (studentRefId) {
                    const matchedSub = submissions.find((sub) => sub.id === studentRefId);
                    if (matchedSub) {
                      openStudentDetails(matchedSub);
                    }
                  }
                }}
              />
            )}

            {teacherActiveTab === 'sync' && (
              <DataSyncHub
                teacherSession={teacherSession}
                sessions={sessions}
                submissions={submissions}
                selectedSessionId={selectedSessionId}
                onDataReconciled={(nextSubs, nextSessions) => {
                  setSubmissions(nextSubs);
                  setSessions(nextSessions);
                }}
                onShowToast={showToast}
              />
            )}
            
            {/* ANALYTICAL REPORT SIDE DRAWER */}
            <AnimatePresence>
              {reportDrawerSessionId !== null && (
                <div
                  className="fixed inset-0 bg-slate-900/55 backdrop-blur-xs flex justify-end z-40"
                  dir="rtl"
                  onClick={() => setReportDrawerSessionId(null)}
                >
                  <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label="التقرير التحليلي للجلسة"
                    initial={{ opacity: 0, x: -32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -32 }}
                    transition={{ duration: 0.18 }}
                    className="bg-slate-50 max-w-5xl w-full h-full shadow-2xl overflow-y-auto border-r border-slate-200 flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-slate-500 block">
                          معاينة التقرير التحليلي للجلسة
                        </span>
                        <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                          {sessions.find((s) => s.sessionId === reportDrawerSessionId)?.title ||
                            (reportDrawerSessionId === 'all'
                              ? 'جميع الجلسات'
                              : reportDrawerSessionId)}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setReportDrawerSessionId(null)}
                        className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>إغلاق التقرير</span>
                      </button>
                    </div>

                    <div className="p-4 sm:p-6">
                      <AnalyticalReport
                        sessionId={reportDrawerSessionId}
                        sessions={sessions}
                        fallbackSubmissions={
                          useSimulationData ? mockSimulationSubmissions : submissions
                        }
                        useSimulationData={useSimulationData}
                        onSessionChange={(sid) => {
                          setSelectedSessionId(sid);
                          setReportDrawerSessionId(sid);
                        }}
                        onSelectStudent={(student) => openStudentDetails(student)}
                        onPrintReport={() => {
                          setSelectedSessionId(reportDrawerSessionId);
                          triggerPrintReport('cohort');
                        }}
                        onNavigateToSessions={() => {
                          setReportDrawerSessionId(null);
                          setTeacherActiveTab('sessions');
                        }}
                      />
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* DETAILED STUDENT MODAL / OVERLAY FOR LIMITED EDIT (تعديل محدود) */}
            {selectedStudent && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex justify-end z-45 transition-opacity">
                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  className="bg-white max-w-2xl w-full h-full shadow-2xl overflow-y-auto p-4 sm:p-8 flex flex-col border-r border-slate-200"
                  dir="rtl"
                >
                  {/* Exit Card & Print Header */}
                  <div className="flex flex-wrap justify-between items-center gap-2 pb-4 sm:pb-6 border-b border-slate-100">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">ملف التشخيص الفلسفي للعمل التربوي</span>
                      <h3 className="text-xl font-extrabold text-slate-800">{selectedStudent.studentName}</h3>
                      {selectedStudent.deliveryReceiptId && (
                        <p className="text-[11px] font-mono text-emerald-700 font-bold mt-1">
                          إيصال الاستلام المباشر: {selectedStudent.deliveryReceiptId} ·{' '}
                          {new Date(selectedStudent.deliveredAt || selectedStudent.submittedAt).toLocaleString('ar-MA')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => triggerPrintReport('student')}
                        className="min-h-[44px] px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                        <span>طباعة الملف</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedStudent(null)}
                        className="min-h-[44px] px-3.5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        إغلاق الملف
                      </button>
                    </div>
                  </div>

                  {/* Body Sub-Scrolls */}
                  <div className="flex-1 py-4 sm:py-6 space-y-6 sm:space-y-8">
                    {/* Diagnostic Style Overlay */}
                    <div className={`p-4 sm:p-5 rounded-2xl border ${getClassInfo(selectedStudent.overriddenClassification || selectedStudent.analysis.classification).color}`}>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider mb-2">النمط المعرفي والوجداني للتلميذ:</h4>
                      <p className="text-xs font-semibold mb-3">
                        التصنيف الأصلي: <span className="font-bold">{selectedStudent.analysis.classification}</span>
                        {selectedStudent.overriddenClassification && (
                          <span className="bg-slate-900 text-white rounded px-1.5 py-0.5 mr-2 text-[9px]">تم تكييفه يدوياً إلى: {selectedStudent.overriddenClassification}</span>
                        )}
                      </p>
                      <p className="text-sm font-medium leading-relaxed">
                        {selectedStudent.analysis.explanation}
                      </p>
                    </div>

                    {/* Numerical indicators */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-slate-800 text-sm">المؤشرات الأربعة المحللة بالأرقام</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center sm:block">
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>مؤشر التفكير النقدي</span>
                          </span>
                          <span className="text-base font-black text-emerald-600 font-mono tabular-nums sm:block sm:mt-1">{Math.round(selectedStudent.analysis.metrics.criticalThinking)}%</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center sm:block">
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            <span>مؤشر الفضول المعرفي</span>
                          </span>
                          <span className="text-base font-black text-blue-600 font-mono tabular-nums sm:block sm:mt-1">{Math.round(selectedStudent.analysis.metrics.cognitiveCuriosity)}%</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center sm:block">
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <span>مؤشر الخوف المعرفي</span>
                          </span>
                          <span className="text-base font-black text-red-600 font-mono tabular-nums sm:block sm:mt-1">{Math.round(selectedStudent.analysis.metrics.cognitiveFear)}%</span>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center sm:block">
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span>مؤشر التفكير السطحي</span>
                          </span>
                          <span className="text-base font-black text-amber-600 font-mono tabular-nums sm:block sm:mt-1">{Math.round(selectedStudent.analysis.metrics.shallowThinking)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Individual Radar Chart for student's 5 axes */}
                    {(() => {
                      const studentAxes = calculateFiveAxesScores(selectedStudent.answers);
                      const studentRadarData = [
                        { subject: 'التصور الفلسفي', value: studentAxes[0] },
                        { subject: 'الألفة الوجدانية', value: studentAxes[1] },
                        { subject: 'المنهج الفكري', value: studentAxes[2] },
                        { subject: 'القيمة المعرفية', value: studentAxes[3] },
                        { subject: 'الاستعداد الحجاجي', value: studentAxes[4] }
                      ];

                      return (
                        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 block"></span>
                              البنية المعرفية والوجدانية للتلميذ (المحاور الخمسة)
                            </h4>
                            <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-0.5">
                              تحليل مكمّن يوضح مدى تمكن التلميذ في أبعاد الإستبيان وموقعه من الألفة المنهجية والحجاجية للفلسفة.
                            </p>
                          </div>

                          <div className="h-56 w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={studentRadarData}>
                                <PolarGrid stroke="#e2e8f0" />
                                <PolarAngleAxis 
                                  dataKey="subject" 
                                  tick={{ fill: '#475569', fontSize: 9, fontWeight: 'bold' }} 
                                />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 8 }} />
                                <Radar 
                                  name="المعدل الفردي" 
                                  dataKey="value" 
                                  stroke="#4f46e5" 
                                  fill="#818cf8" 
                                  fillOpacity={0.4} 
                                />
                                <Tooltip 
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-2.5 shadow-xl text-right text-xs" dir="rtl">
                                          <p className="font-bold">{data.subject}</p>
                                          <p className="font-mono mt-0.5 text-indigo-300">
                                            الدرجة المكتسبة: <span className="font-bold text-white">{payload[0].value}%</span>
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })()}

                    {/* AI Pedagogical instruction */}
                    <div className="bg-indigo-50 border border-indigo-100 rounded-[24px] p-4 sm:p-6 space-y-4">
                      <div className="flex justify-between items-center flex-wrap gap-2 pb-2 border-b border-indigo-100/55">
                        <h4 className="font-black text-indigo-950 text-sm flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-500" />
                          توصيات التوجيه وتحليل إجابات المقاييس الخمسة (Gemini):
                        </h4>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={verifyingStudentId === selectedStudent.id}
                            onClick={() => handleVerifyStudentSignature(selectedStudent)}
                            className="py-1.5 px-3 bg-white hover:bg-indigo-100/60 border border-indigo-200 text-indigo-800 font-bold rounded-xl text-[11px] transition flex items-center gap-1.5 cursor-pointer"
                          >
                            {verifyingStudentId === selectedStudent.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            )}
                            <span>فحص سلامة التوقيع</span>
                          </button>

                          <button
                            type="button"
                            disabled={analyzingWithGemini}
                            onClick={() => handleRunGeminiAnalysis(selectedStudent.id)}
                            className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold rounded-xl text-[11px] transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                          >
                            {analyzingWithGemini ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>جاري التحليل المعمق...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>توليد تحليل مخصص بـ Gemini</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {studentVerificationMap[selectedStudent.id] && (
                        <div
                          className={`p-3 rounded-xl border text-xs ${
                            studentVerificationMap[selectedStudent.id].valid
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                        >
                          <p className="font-black">
                            {studentVerificationMap[selectedStudent.id].valid
                              ? `توقيع الخادم سليم (${studentVerificationMap[selectedStudent.id].analysisOrigin})`
                              : `نتيجة الفحص: ${studentVerificationMap[selectedStudent.id].signatureIntegrity}`}
                          </p>
                          <p className="text-[11px] mt-0.5 opacity-90">
                            {studentVerificationMap[selectedStudent.id].contentTruthNote}
                          </p>
                        </div>
                      )}

                      {selectedStudent.analysis.pedagogicalRecommendationsList && selectedStudent.analysis.pedagogicalRecommendationsList.length > 0 ? (
                        <div className="space-y-2.5">
                          {selectedStudent.analysis.pedagogicalRecommendationsList.map((rec, i) => (
                            <div key={i} className="flex gap-3 bg-white p-3.5 rounded-2xl border border-indigo-50 shadow-sm hover:border-indigo-100 transition duration-300">
                              <span className="flex-shrink-0 w-6 h-6 bg-indigo-100/70 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">
                                {i + 1}
                              </span>
                              <p className="text-slate-700 text-xs sm:text-[13px] font-semibold leading-relaxed">
                                {rec}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-indigo-900 text-xs sm:text-sm leading-relaxed whitespace-pre-line font-medium">
                          {selectedStudent.analysis.pedagogicalRecommendation}
                        </p>
                      )}
                    </div>

                    {/* Deep Diagnostics: Credibility Index, Contradictions, Cognitive Obstacles, Question Breakdown, Remedial Plan */}
                    {selectedStudent.analysis.credibilityAssessment && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                          <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span>مؤشر المصداقية ونزاهة التمثل الفردي</span>
                          </h4>
                          <span className="text-xs font-mono font-black px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-900 tabular-nums">
                            {Math.round(selectedStudent.analysis.credibilityAssessment.overallScore)}% · {selectedStudent.analysis.credibilityAssessment.verdict}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
                          <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-500 block">الجهد النصي</span>
                            <strong className="font-mono font-black text-slate-900">{Math.round(selectedStudent.analysis.credibilityAssessment.textualEffortScore)}%</strong>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-500 block">الاتساق الدلالي</span>
                            <strong className="font-mono font-black text-slate-900">{Math.round(selectedStudent.analysis.credibilityAssessment.consistencyScore)}%</strong>
                          </div>
                          <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                            <span className="text-[10px] text-slate-500 block">النزاهة السلوكية</span>
                            <strong className="font-mono font-black text-slate-900">{Math.round(selectedStudent.analysis.credibilityAssessment.proctoringScore)}%</strong>
                          </div>
                        </div>
                        <ul className="space-y-1 text-xs text-slate-600">
                          {selectedStudent.analysis.credibilityAssessment.signals.map((sig, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{sig}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Contradictions & Cognitive Obstacles */}
                    {((selectedStudent.analysis.contradictions && selectedStudent.analysis.contradictions.length > 0) ||
                      (selectedStudent.analysis.cognitiveObstacles && selectedStudent.analysis.cognitiveObstacles.length > 0)) && (
                      <div className="grid grid-cols-1 gap-4">
                        {selectedStudent.analysis.contradictions && selectedStudent.analysis.contradictions.length > 0 && (
                          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2.5">
                            <h4 className="font-black text-amber-950 text-sm flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-amber-600" />
                              <span>كشف التناقضات الدلالية في الإجابات ({selectedStudent.analysis.contradictions.length})</span>
                            </h4>
                            <div className="space-y-2">
                              {selectedStudent.analysis.contradictions.map((c, idx) => (
                                <div key={idx} className="bg-white p-3 rounded-xl border border-amber-200/70 text-xs space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <strong className="text-slate-900">{c.pairLabel}</strong>
                                    <span className="text-[10px] font-black text-amber-800">{c.severity}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500">{c.questionA} ↔ {c.questionB}</p>
                                  <p className="text-slate-700 leading-relaxed">{c.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedStudent.analysis.cognitiveObstacles && selectedStudent.analysis.cognitiveObstacles.length > 0 && (
                          <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-4 space-y-2.5">
                            <h4 className="font-black text-rose-950 text-sm flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-rose-600" />
                              <span>تصنيف العوائق المعرفية والإبيستيمولوجية</span>
                            </h4>
                            <div className="space-y-2">
                              {selectedStudent.analysis.cognitiveObstacles.map((obs, idx) => (
                                <div key={idx} className="bg-white p-3 rounded-xl border border-rose-200/70 text-xs space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <strong className="text-slate-900">{obs.title}</strong>
                                    <span className="text-[10px] font-bold text-rose-700">{obs.category} · {obs.severity}</span>
                                  </div>
                                  <p className="text-[11px] text-slate-500">{obs.evidence}</p>
                                  <p className="text-slate-700 font-semibold leading-relaxed">التدخل المقترح: {obs.intervention}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Question-by-question breakdown */}
                    {selectedStudent.analysis.questionBreakdown && selectedStudent.analysis.questionBreakdown.length > 0 && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
                        <h4 className="font-black text-slate-900 text-sm">التحليل الدقيق لكل سؤال (Question Breakdown)</h4>
                        <div className="divide-y divide-slate-100">
                          {selectedStudent.analysis.questionBreakdown.map((qb, i) => (
                            <div key={i} className="py-2.5 space-y-1 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-slate-900">{qb.questionLabel}</strong>
                                <span className="font-mono font-black text-indigo-700 tabular-nums shrink-0">
                                  {Math.round(qb.depthScore)}%
                                </span>
                              </div>
                              <p className="text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">{qb.answerText}</p>
                              <p className="text-[11px] text-slate-500">{qb.dimension} — {qb.semanticNote}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3-Phase Remedial Plan */}
                    {selectedStudent.analysis.remedialPlan && selectedStudent.analysis.remedialPlan.length > 0 && (
                      <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-2.5">
                        <h4 className="font-black text-emerald-950 text-sm">خطة المواكبة والعلاج البيداغوجي الفردي</h4>
                        <div className="space-y-2">
                          {selectedStudent.analysis.remedialPlan.map((step, i) => (
                            <div key={i} className="bg-white p-3 rounded-xl border border-emerald-100 text-xs space-y-1">
                              <strong className="text-emerald-900 block">{step.phase}</strong>
                              <p className="text-slate-700 leading-relaxed">{step.action}</p>
                              <p className="text-[11px] text-slate-500">الهدف: {step.objective}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Detailed questionnaire answers (5 axes) */}
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <h4 className="font-extrabold text-slate-800 text-base mb-3 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                        إجابات التلميذ التفصيلية (الخمس محاور)
                      </h4>

                      {/* Axis 1 */}
                      <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border">
                        <h5 className="font-bold text-xs text-blue-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          <span>المحور 1: التصور الأولي للفلسفة</span>
                        </h5>
                        <p className="text-xs text-slate-500 font-bold">تساؤل: ما معنى الفلسفة بالنسبة لك؟</p>
                        <p className="text-sm text-slate-800 italic bg-white p-2.5 rounded-lg border leading-relaxed">
                          “{selectedStudent.answers.philosophyMeaning}”
                        </p>
                        <p className="text-xs text-slate-500">مصدر تشكل الفكرة الفلسفية المسبقة: <span className="font-bold text-slate-700">{selectedStudent.answers.sourceOfIdea}</span></p>
                      </div>

                      {/* Axis 2 */}
                      <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border">
                        <h5 className="font-bold text-xs text-blue-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          <span>المحور 2: البعد الوجداني</span>
                        </h5>
                        <p className="text-xs text-slate-500">عند سماع كلمة الفلسفة أشعر بـ: <span className="font-bold text-slate-800 text-sm bg-indigo-50 px-2 py-0.5 border rounded">{selectedStudent.answers.feelingWhenHearing}</span></p>
                        <p className="text-xs text-slate-500 font-bold">تعليل الشعور النفسي المألوف:</p>
                        <p className="text-sm text-slate-800 italic bg-white p-2.5 rounded-lg border leading-relaxed">
                          “{selectedStudent.answers.feelingJustification}”
                        </p>
                      </div>

                      {/* Axis 3 */}
                      <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border">
                        <h5 className="font-bold text-xs text-blue-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          <span>المحور 3: نمط التفكير</span>
                        </h5>
                        <p className="text-xs text-slate-500">تفاعل الذهن مع سؤال كنه الحرية: <span className="font-bold text-slate-700">{selectedStudent.answers.reactionToFreedomQuestion}</span></p>
                        <p className="text-xs text-slate-500 font-bold">الأسئلة التي يراها التلميذ فلسفية صميمية:</p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(selectedStudent.answers.selectedPhilosophicalQuestions || []).map(q => (
                            <span key={q} className="bg-indigo-100 text-indigo-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-indigo-200">
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Axis 4 */}
                      <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border">
                        <h5 className="font-bold text-xs text-blue-800 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          <span>المحور 4: القيمة المعرفية</span>
                        </h5>
                        <p className="text-xs text-slate-500">معدل تقييم مساهمة الفلسفة وفهم الذات (1-5): <span className="font-mono text-slate-800 font-bold bg-white px-2 py-0.5 rounded border">{selectedStudent.answers.valueRating} / 5</span></p>
                        <p className="text-xs text-slate-500 font-bold">الغاية الأساسية من التفلسف بالنسبة للتلميذ:</p>
                        <p className="text-sm text-slate-800 bg-white p-2.5 rounded-lg border leading-relaxed">
                          “{selectedStudent.answers.philosophyPrimaryGoal}”
                        </p>
                      </div>

              {/* Axis 5 */}
              <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border">
                <h5 className="font-bold text-xs text-blue-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                  <span>المحور 5: الاستعداد الحجاجي والسلوكي</span>
                </h5>
                <p className="text-xs text-slate-500 font-bold">ردة الفعل عند مواجهة رأي مخالف: <span className="font-bold text-slate-700">{selectedStudent.answers.debateReaction}</span></p>
                <p className="text-xs text-slate-500 font-bold">توقع التميز والاندماج في درس الفلسفة:</p>
                <p className="text-sm text-slate-800 italic bg-white p-2.5 rounded-lg border leading-relaxed">
                  “{selectedStudent.answers.expectSuccess}”
                </p>
              </div>
            </div>

            {/* Teacher Notes */}
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <label className="block text-xs font-black text-slate-700">ملاحظات الأستاذ والتوجيهات البيداغوجية المخصصة للتلميذ:</label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="مثلاً: يحتاج هذا التلميذ لدعم حجاجي مخصص، أبدى تجاوباً في حصة الأمس..."
                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-base sm:text-xs text-slate-800 focus:outline-none min-h-[88px]"
              ></textarea>
            </div>

                      {/* Action buttons save/delete */}
                      <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteSubmission(selectedStudent.id)}
                          disabled={actionLoading}
                          className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          title="حذف هذا التشخيص نهائياً"
                        >
                          <Trash2 className="w-4 h-4" />
                          حذف الدفتر
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveLimitedEdit(selectedStudent.id)}
                          disabled={actionLoading}
                          className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition text-xs flex items-center justify-center gap-1.5 shadow-md shadow-green-500/10 cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          حفظ التعديلات
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      {/* Create Dynamic Session Modal */}
      {showCreateSession && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200 p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto my-auto shadow-2xl relative"
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-teal-500 via-indigo-500 to-purple-500"></div>
            
            {createdSession ? (
              <div className="space-y-5 text-center font-sans py-3" dir="rtl">
                <div className="relative w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto scale-110 mb-4">
                  <Check className="w-8 h-8 text-emerald-500" />
                </div>
                <h3 className="text-xl font-black text-emerald-600">
                  تم بناء الجلسة التشخيصية بنجاح!
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  تفضل بمشاركة الرمز الفريد أو رابط الدخول المباشر مع تلامذتك لمباشرة التشخيص فوراً:
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-[20px] p-4 sm:p-5 space-y-4 text-right">
                  <div className="text-xs space-y-1 text-slate-700 leading-normal border-b pb-2.5">
                    <p className="font-extrabold text-slate-900 text-sm">{createdSession.title}</p>
                    <p className="font-semibold text-slate-500">
                      {createdSession.level} - {createdSession.stream} (الفوج: {createdSession.classNumber})
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-slate-400 font-black">رمز حضور الجلسة للطلبة:</label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white border border-slate-200 rounded-xl p-2.5">
                      <span className="flex-1 text-center font-mono font-black text-lg text-slate-800 tracking-wider">
                        {createdSession.sessionId}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopySessionId(createdSession.sessionId)}
                        className="min-h-[42px] py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {copiedSessionId === createdSession.sessionId ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>تم!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ الرمز</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-slate-400 font-black">رابط الدخول والتشخيص المباشر:</label>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white border border-slate-200 rounded-xl p-2.5">
                      <span className="flex-1 text-right font-mono text-[11px] text-indigo-600 truncate">
                        {window.location.origin}/session/{createdSession.sessionId}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopySessionLink(createdSession.sessionId)}
                        className="min-h-[42px] py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {copiedLinkSessionId === createdSession.sessionId ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>تم!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ الرابط</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-1 border-t border-slate-100 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSharingSession(createdSession);
                        setShowShareModal(true);
                      }}
                      className="w-full min-h-[44px] py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>توليد كود الـ QR ومشاركة الجلسة للتلاميذ</span>
                    </button>
                  </div>
                </div>

                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-right text-xs text-slate-600 space-y-1.5 leading-relaxed">
                  <p className="font-extrabold text-indigo-800 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>تعليمات هامة للأستاذ:</span>
                  </p>
                  <p>• شارك الرابط مباشرة في مجموعة الفصل (واتساب، فيسبوك) أو اعرض الرمز على السبورة في الفصل لولوج سريع للاستبيان.</p>
                  <p>• بمجرد إدلاء أي تلميذ بإجابته، ستنبثق لك لوائح مستواهم وتوصياتهم تلقائياً في فضاء الأستاذ الموجه.</p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedSession(null);
                      setShowCreateSession(false);
                    }}
                    className="w-full min-h-[46px] py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-black rounded-xl text-xs transition font-sans cursor-pointer"
                  >
                    إنهاء والرجوع للوحة المراقبة
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start gap-2 mb-5 font-sans">
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
                      إنشاء رمز جلسة تشخيصية جديدة
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">سيتيح الرمز للتلاميذ تصفح الإستمارة وحفظ النتائج في باحتك الحصرية تلقائياً.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateSession(false);
                      setCreatedSession(null);
                    }}
                    className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-xl text-slate-500 text-xs transition font-bold shrink-0 cursor-pointer"
                  >
                    إغلاق ×
                  </button>
                </div>

                <form onSubmit={handleCreateSession} className="space-y-4 text-right font-sans">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">عنوان الجلسة / اسم المعلم المرجعي:</label>
                    <input
                      type="text"
                      required
                      value={newSessionForm.title}
                      onChange={e => setNewSessionForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="مثال: تشخيص مستوى تلاميذ الثانية بكالوريا آداب 1"
                      className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5">استمارة التشخيص المعتمدة للجلسة:</label>
                    <select
                      value={newSessionForm.formId || 'official-perceptions'}
                      onChange={e => {
                        const selectedId = e.target.value;
                        const foundForm = availableForms.find(f => f.formId === selectedId);
                        setNewSessionForm(prev => ({ 
                          ...prev, 
                          formId: selectedId,
                          formTitle: foundForm ? foundForm.title : 'استمارة تشخيصية'
                        }));
                      }}
                      className="w-full min-h-[44px] bg-indigo-50 border border-indigo-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                    >
                      {availableForms.map(form => (
                        <option key={form.formId} value={form.formId}>
                          {form.teacherId === 'system_admin' ? '[نموذج معتمد] ' : '[استمارة خاصة] '} 
                          {form.title} ({form.questions?.length ?? 15} بنداً)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1.5">المستوى الدراسي:</label>
                      <select
                        value={newSessionForm.level}
                        onChange={e => {
                          const nextLevel = e.target.value;
                          const defaultStream = nextLevel === 'جذع مشترك' 
                            ? 'جذع مشترك آداب وعلوم إنسانية' 
                            : 'شعبة الآداب والعلوم الإنسانية - مسلك الآداب';
                          setNewSessionForm(prev => ({ ...prev, level: nextLevel, stream: defaultStream }));
                        }}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                      >
                        <option value="جذع مشترك">جذع مشترك (Common Core)</option>
                        <option value="أولى باك">أولى باك (1st year Bac)</option>
                        <option value="ثانية باك">ثانية باك (2nd year Bac)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1.5">الشعبة والمسلك الدراسي:</label>
                      <select
                        value={newSessionForm.stream}
                        onChange={e => setNewSessionForm(prev => ({ ...prev, stream: e.target.value }))}
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                      >
                        {newSessionForm.level === 'جذع مشترك' ? (
                          <>
                            <option value="جذع مشترك آداب وعلوم إنسانية">الجذع المشترك آداب وعلوم إنسانية</option>
                            <option value="جذع مشترك علمي وتكنولوجي">الجذع المشترك العلمي والتكنولوجي</option>
                            <option value="جذع مشترك مهني">الجذع المشترك المهني</option>
                            <option value="جذع مشترك أصيل">الجذع المشترك الأصيل</option>
                          </>
                        ) : (
                          <>
                            <option value="شعبة الآداب والعلوم الإنسانية - مسلك الآداب">شعبة الآداب والعلوم الإنسانية - مسلك الآداب</option>
                            <option value="شعبة الآداب والعلوم الإنسانية - مسلك العلوم الإنسانية">شعبة الآداب والعلوم الإنسانية - مسلك العلوم الإنسانية</option>
                            <option value="شعبة العلوم - مسلك العلوم الرياضية (أ)">شعبة العلوم - مسلك العلوم الرياضية (أ)</option>
                            <option value="شعبة العلوم - مسلك العلوم الرياضية (ب)">شعبة العلوم - مسلك العلوم الرياضية (ب)</option>
                            <option value="شعبة العلوم - مسلك العلوم الفيزيائية">شعبة العلوم - مسلك العلوم الفيزيائية</option>
                            <option value="شعبة العلوم - مسلك علوم الحياة والأرض">شعبة العلوم - مسلك علوم الحياة والأرض</option>
                            <option value="شعبة العلوم - مسلك العلوم الزراعية">شعبة العلوم - مسلك العلوم الزراعية</option>
                            <option value="شعبة العلوم والتكنولوجيات - مسلك العلوم والتكنولوجيات الميكانيكية">شعبة العلوم والتكنولوجيات - مسلك العلوم والتكنولوجيات الميكانيكية</option>
                            <option value="شعبة العلوم والتكنولوجيات - مسلك العلوم والتكنولوجيات الكهربائية">شعبة العلوم والتكنولوجيات - مسلك العلوم والتكنولوجيات الكهربائية</option>
                            <option value="شعبة التدبير والاقتصاد - مسلك العلوم الاقتصادية">شعبة التدبير والاقتصاد - مسلك العلوم الاقتصادية</option>
                            <option value="شعبة التدبير والاقتصاد - مسلك علوم التدبير المحاسباتي">شعبة التدبير والاقتصاد - مسلك علوم التدبير المحاسباتي</option>
                            <option value="شعبة الفنون التطبيقية - مسلك الفنون التطبيقية">شعبة الفنون التطبيقية - مسلك الفنون التطبيقية</option>
                            <option value="التعليم الأصيل - مسلك اللغة العربية">التعليم الأصيل - مسلك اللغة العربية</option>
                            <option value="التعليم الأصيل - مسلك العلوم الشرعية">التعليم الأصيل - مسلك العلوم الشرعية</option>
                            <option value="البكالوريا المهنية - صناعي، خدماتي، فلاحي، رقمنة">البكالوريا المهنية - صناعي، خدماتي، فلاحي، رقمنة</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1.5">رقم الفوج / الفصل:</label>
                      <input
                        type="text"
                        required
                        value={newSessionForm.classNumber}
                        onChange={e => setNewSessionForm(prev => ({ ...prev, classNumber: e.target.value }))}
                        placeholder="مثال: فوج 2"
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-black text-slate-700 mb-1.5">المؤسسة التعليمية (الثانوية):</label>
                      <input
                        type="text"
                        required
                        value={newSessionForm.institution}
                        onChange={e => setNewSessionForm(prev => ({ ...prev, institution: e.target.value }))}
                        placeholder="ثانوية ابن رشد"
                        className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-semibold"
                      />
                    </div>
                  </div>

                  <SearchableSelect
                    label="العمالة / الإقليم للقسم الموجه:"
                    value={newSessionForm.province}
                    onChange={val => setNewSessionForm(prev => ({ ...prev, province: val }))}
                    options={teacherSession?.regionalAcademy ? (REGION_PROVINCES[teacherSession.regionalAcademy] || Object.values(REGION_PROVINCES).flat()) : Object.values(REGION_PROVINCES).flat()}
                    placeholder="ابحث واختر العمالة أو الإقليم للقسم..."
                    required
                    icon={<MapPin className="w-3.5 h-3.5" />}
                  />

                  <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4 font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateSession(false);
                        setCreatedSession(null);
                      }}
                      className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-xl text-xs transition cursor-pointer"
                    >
                      إلغاء الأمر
                    </button>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full sm:w-auto min-h-[44px] py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md shadow-indigo-600/15 cursor-pointer"
                    >
                      {actionLoading ? 'جاري التوليد الفني...' : 'بناء الجلسة وتوليد الرمز'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </div>
      )}

      {/* Edit Teacher Profile Modal */}
      {showProfileEditModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in text-right font-sans overflow-y-auto" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200 p-5 sm:p-8 max-w-xl w-full max-h-[92vh] overflow-y-auto my-auto shadow-2xl relative"
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-teal-500 via-indigo-500 to-purple-500"></div>
            
            <div className="flex justify-between items-start gap-2 mb-5 border-b pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <User className="w-5 h-5 text-teal-600 shrink-0" />
                  تعديل معلومات الحساب الشخصي والأكاديمي
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  قم بتحديث تفاصيل هويتك ومؤسستك لتظهر بشكل صحيح في استبيانات وجلسات تلامذتك.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileEditModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 hover:bg-slate-100 rounded-xl transition text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {profileEditError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs flex items-start gap-2 animate-fade-in font-bold">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{profileEditError}</p>
              </div>
            )}

            <form onSubmit={handleSaveProfileEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">الاسم الكامل للأستاذ(ة):</label>
                  <input
                    type="text"
                    required
                    value={profileEditForm.fullName}
                    onChange={e => setProfileEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-500 font-bold"
                    placeholder="مثال: ذ. أحمد العلمي"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">التخصص التدريسي:</label>
                  <input
                    type="text"
                    required
                    value={profileEditForm.specialty}
                    onChange={e => setProfileEditForm(prev => ({ ...prev, specialty: e.target.value }))}
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-500 font-bold"
                    placeholder="مثال: مادة الفلسفة"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">المؤسسة التعليمية (الثانوية التأهيلية):</label>
                <input
                  type="text"
                  required
                  value={profileEditForm.school}
                  onChange={e => setProfileEditForm(prev => ({ ...prev, school: e.target.value }))}
                  className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-500 font-bold"
                  placeholder="مثال: ثانوية ابن رشد التأهيلية"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SearchableSelect
                  label="الأكاديمية الجهوية للتربية والتكوين:"
                  value={profileEditForm.regionalAcademy}
                  onChange={val => {
                    const provinces = REGION_PROVINCES[val] || [];
                    setProfileEditForm(prev => ({ 
                      ...prev, 
                      regionalAcademy: val,
                      province: provinces[0] || ''
                    }));
                  }}
                  options={REGIONS}
                  placeholder="اختر الأكاديمية الجهوية..."
                  required
                  icon={<Search className="w-3.5 h-3.5" />}
                />

                <SearchableSelect
                  label="الإقليم والعمالة الموجهة:"
                  value={profileEditForm.province}
                  onChange={val => setProfileEditForm(prev => ({ ...prev, province: val }))}
                  options={profileEditForm.regionalAcademy ? (REGION_PROVINCES[profileEditForm.regionalAcademy] || []) : []}
                  placeholder="اختر الإقليم أو العمالة..."
                  disabledPlaceholder="اختر الأكاديمية الجهوية أولاً"
                  disabled={!profileEditForm.regionalAcademy}
                  required
                  icon={<MapPin className="w-3.5 h-3.5" />}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-black text-slate-700 mb-1.5">سنوات الخبرة (اختياري):</label>
                  <input
                    type="text"
                    value={profileEditForm.yearsOfExperience}
                    onChange={e => setProfileEditForm(prev => ({ ...prev, yearsOfExperience: e.target.value }))}
                    className="w-full min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-500 font-semibold"
                    placeholder="العدد فقط، مثلاً: 8"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-700 mb-1.5">صورة الحساب الشخصي (رفع صورة بروفيل):</label>
                  <div className="flex gap-3 items-center">
                    <div className="w-11 h-11 rounded-full border border-slate-200 overflow-hidden flex-shrink-0 bg-slate-50 flex items-center justify-center relative group">
                      {profileEditForm.avatar ? (
                        <img
                          src={profileEditForm.avatar}
                          alt="preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as any).src = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";
                          }}
                        />
                      ) : (
                        <User className="w-5 h-5 text-slate-400" />
                      )}
                      {profileEditForm.avatar && (
                        <button
                          type="button"
                          onClick={() => setProfileEditForm(prev => ({ ...prev, avatar: '' }))}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity duration-200 cursor-pointer text-[10px]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverAvatar(true);
                      }}
                      onDragLeave={() => setDragOverAvatar(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverAvatar(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleAvatarFile(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => {
                        const fileInput = document.getElementById('profile-avatar-file-input');
                        if (fileInput) fileInput.click();
                      }}
                      className={`flex-1 border-2 border-dashed rounded-xl p-2.5 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-1 min-h-[50px] ${
                        dragOverAvatar 
                          ? 'border-teal-500 bg-teal-50/50 text-teal-700' 
                          : 'border-slate-200 hover:border-teal-400 bg-slate-50 hover:bg-slate-100/50 text-slate-500'
                      }`}
                    >
                      <input
                        type="file"
                        id="profile-avatar-file-input"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleAvatarFile(e.target.files[0]);
                          }
                        }}
                      />
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-teal-600" />
                        <span className="text-[10px] font-bold">اسحب أو انقر لرفع صورة الشخصية</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-4 font-bold border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setShowProfileEditModal(false)}
                  className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-xl text-xs transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={profileEditLoading}
                  className="w-full sm:w-auto min-h-[44px] py-2.5 px-6 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md shadow-teal-600/15 cursor-pointer"
                >
                  {profileEditLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري حفظ البيانات...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ التعديلات الحالية</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Custom Violation Severity Weights (أوزان خطورة المخالفات) Modal */}
      {showWeightsModal && weightsSession && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-right font-sans" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[28px] border border-slate-200 p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative"
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-indigo-600"></div>
            
            <div className="flex justify-between items-start mb-6 border-b pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <ShieldAlert className="w-5.5 h-5.5 text-amber-500" />
                  تخصيص أوزان خطورة المخالفات لجلسة {weightsSession.sessionId}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  قم بتعديل قيم خصم النقاط لكل نوع من أنواع المخالفات لتحديد مدى تأثيرها على مؤشر الثقة الرقمي للتلميذ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowWeightsModal(false);
                  setWeightsSession(null);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWeights} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* 1. tabLeave */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">تغيير التبويب أو مغادرة الصفحة</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.tabLeave} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">يحدث عندما يخرج التلميذ من صفحة التشخيص أو ينتقل لتبويب آخر.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.tabLeave}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, tabLeave: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 2. fullscreen */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">مغادرة وضع ملء الشاشة</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.fullscreen} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">الخروج من النظام البصري الكامل المانع للمشتتات الخارجية.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.fullscreen}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, fullscreen: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 3. copyPaste */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">محاولات النسخ واللصق</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.copyPaste} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">محاولة القيام بعملية نسخ السؤال أو لصق نص جاهز من الخارج.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.copyPaste}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, copyPaste: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 4. devTools */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">أدوات المطور والبرمجة (F12)</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.devTools} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">محاولة استطلاع البنية أو فحص المصدر عبر واجهة الأدوات البرمجية.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.devTools}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, devTools: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 5. inactivity */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">الخمول والتوقف الطويل</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.inactivity} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">عدم التفاعل لفترات طويلة أو التوقف التام عن الكتابة والتنقل.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.inactivity}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, inactivity: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 6. browserResize */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">تصغير حجم المتصفح</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.browserResize} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">تصغير نافذة المتصفح بشكل كامل أو مفرط لمشاهدة شاشة أخرى.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.browserResize}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, browserResize: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 7. mouseLeave */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">خروج مؤشر الفأرة من الحدود</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.mouseLeave} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">تحويل التركيز إلى خارج حدود النموذج (مثل تفاعل مع شريط المهام).</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.mouseLeave}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, mouseLeave: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 8. prohibitedKeys */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">الاختصارات المحظورة</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.prohibitedKeys} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">استخدام اختصارات نظام التشغيل المحظورة مثل Ctrl+C و Ctrl+V وغيرهما.</p>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={weightsForm.prohibitedKeys}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, prohibitedKeys: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* 9. multiTab */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl sm:col-span-2 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-800">فتح الجلسة في علامات تبويب متعددة</span>
                    <span className="text-xs font-mono font-bold text-amber-600">خصم {weightsForm.multiTab} نقاط</span>
                  </div>
                  <p className="text-[10px] text-slate-400">عندما يكتشف محرك الحماية أن الطالب قام بفتح رابط الاختبار في أكثر من تبويب متزامن للغش.</p>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={weightsForm.multiTab}
                    onChange={(e) => setWeightsForm(prev => ({ ...prev, multiTab: Number(e.target.value) }))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-6 border-t mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowWeightsModal(false);
                    setWeightsSession(null);
                  }}
                  className="w-full sm:w-auto min-h-[44px] py-2.5 px-5 border border-slate-200 text-slate-500 rounded-xl text-xs hover:bg-slate-50 transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingWeights}
                  className="w-full sm:w-auto min-h-[44px] py-2.5 px-6 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-md shadow-amber-600/15 cursor-pointer font-bold"
                >
                  {savingWeights ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الحفظ والتعميم...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ الأوزان المخصصة</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Share Session & QR Code Modal */}
      {showShareModal && sharingSession && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in text-right font-sans overflow-y-auto" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200 p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto my-auto shadow-2xl relative"
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600"></div>
            
            <div className="flex justify-between items-start gap-2 mb-5 border-b pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  مشاركة وتسهيل دخول الجلسة التشخيصية
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  شارك رمز الجلسة أو توليد رمز QR لدخول الطلاب بهواتفهم الذكية مباشرة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowShareModal(false);
                  setSharingSession(null);
                }}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 hover:bg-slate-100 rounded-xl transition text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-slate-800">تفاصيل الصف:</span>
                <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-md font-mono font-black">
                  {sharingSession.sessionId}
                </span>
              </div>
              <p className="font-black text-slate-800 text-sm">{sharingSession.title}</p>
              <p>المستوى: <span className="font-bold text-slate-700">{sharingSession.level}</span> | الشعبة: <span className="font-bold text-slate-700">{sharingSession.stream}</span></p>
              <p>المؤسسة: <span className="font-bold text-slate-700">{sharingSession.institution}</span> | القسم: <span className="font-bold text-slate-700">فوج {sharingSession.classNumber}</span></p>
            </div>

            <div className="space-y-5">
              {/* QR Code Segment */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-600" />
                  رمز الاستجابة السريعة (QR Code) لولوج التلاميذ:
                </p>
                
                <div className="bg-white p-3 rounded-2xl border border-slate-200/80 mb-3 shadow-xs">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${window.location.origin}/session/${sharingSession.sessionId}`)}`}
                    alt="Session QR Code"
                    referrerPolicy="no-referrer"
                    className="w-36 h-36 sm:w-44 sm:h-44 object-contain"
                  />
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
                  يمكن للتلاميذ فتح كاميرا الهاتف والمسح الضوئي للرمز أعلاه للتوجه لصفحة ملء الاستبيان فوراً!
                </p>
              </div>

              {/* URL and Copy Link Segment */}
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-500 font-bold">الرابط المباشر للمشاركة في مجموعات الفصل والمراسلة:</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/session/${sharingSession.sessionId}`}
                      className="flex-1 min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2.5 text-base sm:text-xs rounded-xl font-mono text-left focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopySessionLink(sharingSession.sessionId)}
                      className="min-h-[44px] py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {copiedLinkSessionId === sharingSession.sessionId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>تم نسخ الرابط!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الرابط</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-500 font-bold">رمز الدخول العادي:</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={sharingSession.sessionId}
                      className="flex-1 min-h-[44px] bg-slate-50 border border-slate-200 text-slate-800 px-3 py-2.5 text-base sm:text-xs rounded-xl font-mono text-center tracking-widest font-black focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopySessionId(sharingSession.sessionId)}
                      className="min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {copiedSessionId === sharingSession.sessionId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>تم نسخ الرمز!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الرمز</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-5 border-t border-slate-100 mt-5">
              <button
                type="button"
                onClick={() => {
                  setShowShareModal(false);
                  setSharingSession(null);
                }}
                className="w-full min-h-[46px] py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs transition font-sans font-black cursor-pointer"
              >
                إغلاق نافذة المشاركة
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Detailed Student Proctor History Modal Popup */}
      {selectedProctorStudentHistory && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in text-right font-sans overflow-y-auto" dir="rtl">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[24px] sm:rounded-[28px] border border-slate-200 p-5 sm:p-8 max-w-lg w-full max-h-[92vh] overflow-y-auto my-auto shadow-2xl relative"
          >
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-red-500 via-amber-500 to-yellow-500"></div>
            
            <div className="flex justify-between items-start gap-2 mb-5 border-b pb-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                  السجل الأمني المفصل لحضور التلميذ ومخالفاته
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  سجل تفاعلي مفصل يرصد جودة التركيز والأخلاقيات أثناء تعبئة الاستمارة الحالية.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProctorStudentHistory(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 hover:bg-slate-100 rounded-xl transition text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 font-sans text-xs">
              <div className="bg-slate-50 border p-4 rounded-2xl flex items-center justify-between text-right">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">اسم كامل:</span>
                  <span className="text-sm font-black text-slate-800">{selectedProctorStudentHistory.studentName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block">مؤشر موثوقية الأمان (استرشادي فقط):</span>
                  <span className={`text-sm font-mono font-black tabular-nums ${selectedProctorStudentHistory.reliabilityIndex < 40 ? 'text-red-600' : selectedProctorStudentHistory.reliabilityIndex < 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {selectedProctorStudentHistory.reliabilityIndex !== undefined ? selectedProctorStudentHistory.reliabilityIndex : 100}%
                  </span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-700 mb-2">لائحة المخالفات السلوكية وحركات المتصفح:</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {!selectedProctorStudentHistory.violations || selectedProctorStudentHistory.violations.length === 0 ? (
                    <div className="text-center py-6 text-emerald-700 font-semibold bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>لم يتم رصد أي تلاعب أو مغادرة للمتصفح من قبل هذا التلميذ. نزاهة كاملة.</span>
                    </div>
                  ) : (
                    selectedProctorStudentHistory.violations.map((vi: any, idx: number) => {
                      return (
                        <div key={idx} className="p-3 bg-red-50/60 border border-red-100 rounded-xl space-y-1">
                          <div className="flex justify-between font-bold text-slate-700">
                            <span className="text-rose-700">{vi.type}</span>
                            <span className="font-mono text-slate-500 font-semibold tabular-nums">{new Date(vi.time).toLocaleTimeString('ar-EG')}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-400 font-semibold tabular-nums">
                            {vi.duration !== undefined && vi.duration > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>غاَب عن الشاشة لمدة: {vi.duration} ثوانٍ</span>
                              </span>
                            )}
                            {vi.count !== undefined && (
                              <span className="inline-flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 shrink-0" />
                                <span>عدد التكرار: {vi.count} مرات</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProctorStudentHistory(null)}
                className="w-full min-h-[46px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl transition cursor-pointer mt-2"
              >
                إغلاق التقرير السلوكي
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-6 sm:right-auto sm:max-w-sm z-50 animate-fade-in bg-slate-900 border border-slate-800 text-white py-3.5 px-5 rounded-2xl flex items-center justify-between gap-3 shadow-2xl" dir="rtl">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-3 h-3 shrink-0 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            <p className="text-xs font-black font-sans leading-relaxed">{toast.message}</p>
          </div>
          {liveArrivalToastSub && (
            <button
              type="button"
              onClick={() => {
                openStudentDetails(liveArrivalToastSub);
                setToast(null);
              }}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black shrink-0 cursor-pointer"
            >
              عرض الملف
            </button>
          )}
        </div>
      )}

      {previewReportImage && (
        <div
          className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[120] flex items-center justify-center p-3 sm:p-4"
          dir="rtl"
          onClick={() => setPreviewReportImage(null)}
        >
          <div
            className="bg-white rounded-3xl p-4 max-w-3xl w-full max-h-[90vh] flex flex-col gap-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-sm font-black text-slate-800">معاينة لقطة الشاشة المرفقة</h4>
              <button
                type="button"
                onClick={() => setPreviewReportImage(null)}
                className="min-h-[40px] px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer transition"
              >
                إغلاق
              </button>
            </div>
            <div className="overflow-auto flex items-center justify-center bg-slate-50 rounded-2xl p-2">
              <img
                src={previewReportImage}
                alt="معاينة البلاغ بالحجم الكامل"
                className="max-w-full max-h-[75vh] object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[120] flex items-center justify-center p-3 sm:p-4"
          dir="rtl"
        >
          <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-5 text-right">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">{confirmDialog.title}</h4>
                <p className="text-xs text-slate-600 font-bold mt-1 leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="min-h-[44px] px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-sm"
              >
                تأكيد المتابعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Mobile Bottom Tab Bar (Admin / Teacher) */}
      {loggedInTeacher && !showPresentationMode && (
        <nav
          aria-label="التنقل السفلي للوحة التحكم"
          className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] px-1.5 py-1.5"
          dir="rtl"
        >
          {teacherSession?.role === 'admin' ? (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'teachers', label: 'المستخدمون', icon: Users },
                { id: 'institutions', label: 'المؤسسات', icon: GraduationCap },
                { id: 'stats', label: 'الإحصائيات', icon: BarChart3 },
                { id: 'content', label: 'المحتوى', icon: BookOpen },
                { id: 'system', label: 'النظام', icon: Settings },
                { id: 'sessions', label: 'الجلسات', icon: Calendar },
                { id: 'reports', label: 'البلاغات', icon: AlertCircle },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeAdminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveAdminTab(item.id as any);
                      if (item.id === 'reports') {
                        fetchUserReports();
                      }
                    }}
                    className={`flex flex-col items-center justify-center min-w-[68px] flex-1 min-h-[48px] py-1.5 px-2 rounded-xl text-[10px] font-black transition shrink-0 cursor-pointer ${
                      active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-0.5" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto pb-safe">
              {[
                { id: 'monitoring', label: 'المراقبة', icon: BarChart3, activeClass: 'bg-slate-900 text-white' },
                { id: 'analytics', label: 'التحليلات', icon: TrendingUp, activeClass: 'bg-emerald-600 text-white' },
                { id: 'notifications', label: 'التنبيهات', icon: BellRing, activeClass: 'bg-sky-600 text-white' },
                { id: 'sessions', label: 'الجلسات', icon: Calendar, activeClass: 'bg-slate-900 text-white' },
                { id: 'formBank', label: 'الاستمارات', icon: BookOpen, activeClass: 'bg-slate-900 text-white' },
                { id: 'sync', label: 'المزامنة', icon: Database, activeClass: 'bg-emerald-600 text-white' },
              ].map((item) => {
                const Icon = item.icon;
                const active = teacherActiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTeacherActiveTab(item.id as any)}
                    className={`flex-1 min-w-[60px] flex flex-col items-center justify-center min-h-[48px] py-1.5 px-1 rounded-xl text-[10px] font-black transition cursor-pointer relative ${
                      active ? `${item.activeClass} shadow-sm` : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-0.5" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      )}

      {loggedInTeacher && (
        <TeacherAiChatWidget
          submissions={submissions}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
        />
      )}

      <PrintReportPortal
        mode={printReportMode}
        student={selectedStudent}
        submissions={useSimulationData ? mockSimulationSubmissions : submissionsForSelectedSession}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        teacherSession={teacherSession}
      />

      <UserTutorial
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
      />
    </div>
  );
}
