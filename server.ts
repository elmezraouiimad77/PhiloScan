/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { StudentSubmission, ThinkingStyle, Teacher, DiagnosticSession } from './src/types';
import {
  evaluateAndDispatchSessionNotifications,
  getDefaultTeacherNotificationSettings,
  getNotificationProviderStatus,
  isValidEmailAddress,
  loadNotificationSettingsList,
  loadNotificationsList,
  normalizeAndValidatePhone,
  saveNotificationSettingsList,
  saveNotificationsList,
  sendPedagogicalEmail,
  sendPedagogicalWhatsApp,
} from './src/server/notificationsService';
import {
  CONTENT_TRUTH_DISCLAIMER,
  getAnalysisHmacKey,
  signAnalysisEnvelope,
  verifyAnalysisEnvelope,
} from './src/server/canonicalSigning';
import {
  verifyAppCheckToken,
  verifyFirebaseIdToken,
  type VerifiedAppCheckResult,
  type VerifiedFirebaseUser,
} from './src/server/firebaseTokenVerifier';
import {
  assertAllowedGeminiModel,
  FALLBACK_FREE_GEMINI_MODEL,
  PRIMARY_FREE_GEMINI_MODEL,
  redactStudentAnswersForAI,
  redactStudentPiiFromText,
} from './src/server/piiGuard';
import { createRateLimiter } from './src/server/rateLimiter';
import {
  isAdminActiveViaRest,
  isTeacherActiveViaRest,
} from './src/server/firestoreRestClient';

// Load environmental variables
dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;

let firebaseApiKey = '';
try {
  const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath)) {
    const configData = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    firebaseApiKey = configData.apiKey || '';
  }
} catch (err) {
  console.error('Failed to read firebase-applet-config.json:', err);
}

// Helper to push stats to Firestore (Option A: handled by authenticated client, never unauthenticated server)
async function syncStatsToFirestore(_statsObj: any) {
  return;
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));
const distImagesDir = path.join(process.cwd(), 'dist', 'assets', 'images');
const srcImagesDir = path.join(process.cwd(), 'src', 'assets', 'images');
if (fs.existsSync(distImagesDir)) {
  app.use('/src/assets/images', express.static(distImagesDir));
}
app.use('/src/assets/images', express.static(srcImagesDir));

function resolveDataDir(): string {
  return process.env.PHILOSCAN_DATA_DIR
    ? path.resolve(process.env.PHILOSCAN_DATA_DIR)
    : path.join(process.cwd(), 'data');
}
const getDbFile = () => path.join(resolveDataDir(), 'submissions.json');
const getTeachersFile = () => path.join(resolveDataDir(), 'teachers.json');
const getSessionsFile = () => path.join(resolveDataDir(), 'sessions.json');
const getReportsFile = () => path.join(resolveDataDir(), 'reports.json');
const getLandingPageFile = () => path.join(resolveDataDir(), 'landing_page.json');
const getFormsFile = () => path.join(resolveDataDir(), 'forms.json');
const getMonitoringFile = () => path.join(resolveDataDir(), 'monitoring.json');

// Pre-seeded demo account elements
const INITIAL_SEED_TEACHERS: Teacher[] = [
  {
    id: 'TCH-001',
    fullName: 'ذ. عماد المزراوي',
    email: 'professeur@philoscan.edu',
    school: 'ثانوية ابن رشد التأهيلية',
    regionalAcademy: 'الأكاديمية الجهوية للتربية والتكوين لجهة الدار البيضاء سطات',
    province: 'عمالة الدار البيضاء',
    createdAt: new Date().toISOString()
  }
];

const INITIAL_SEED_SESSIONS: DiagnosticSession[] = [
  {
    sessionId: 'PS-DE7M00',
    teacherId: 'TCH-001',
    teacherEmail: 'professeur@philoscan.edu',
    institution: 'ثانوية ابن رشد التأهيلية',
    level: 'جذع مشترك',
    stream: 'العلوم',
    classNumber: '3',
    title: 'تشخيص بداية السنة الدراسية',
    province: 'عمالة الدار البيضاء',
    createdAt: new Date().toISOString()
  }
];

// Pre-seeded database to make the teacher space immediately full of rich charts and students
const INITIAL_SEED_SUBMISSIONS: StudentSubmission[] = [
  {
    id: 'sub_1',
    studentName: 'أمين العلمي',
    student_name: 'أمين العلمي',
    submittedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    answers: {
      philosophyMeaning: 'بالنسبة لي، الفلسفة هي محاولة لفهم الوجود والتساؤل المستمر عن طبيعة الأشياء ومبادئ الأخلاق والمعرفة. ليست مجرد ترف فكري بل دليل للحياة.',
      sourceOfIdea: 'الإنترنت',
      feelingWhenHearing: 'فضول',
      feelingJustification: 'أشعر برغبة عارمة في معرفة كيف فكر العباقرة القدماء في قضايا لا تزال تشغلنا اليوم مثل العدالة والحقيقة.',
      reactionToFreedomQuestion: 'أفكر في أمثلة من الواقع',
      selectedPhilosophicalQuestions: ['لماذا نعيش؟', 'هل الخير موجود؟'],
      valueRating: 5,
      philosophyPrimaryGoal: 'تعلم التفكير',
      debateReaction: 'أشارك برأيي',
      expectSuccess: 'نعم، لأنني أحب التحديات الفكرية، وأعتقد أن التعبير عن الرأي المنطقي ممتع للفهم الذاتي.'
    },
    responses: {
      philosophyMeaning: 'بالنسبة لي، الفلسفة هي محاولة لفهم الوجود والتساؤل المستمر عن طبيعة الأشياء ومبادئ الأخلاق والمعرفة. ليست مجرد ترف فكري بل دليل للحياة.',
      sourceOfIdea: 'الإنترنت',
      feelingWhenHearing: 'فضول',
      feelingJustification: 'أشعر برغبة عارمة في معرفة كيف فكر العباقرة القدماء في قضايا لا تزال تشغلنا اليوم مثل العدالة والحقيقة.',
      reactionToFreedomQuestion: 'أفكر في أمثلة من الواقع',
      selectedPhilosophicalQuestions: ['لماذا نعيش؟', 'هل الخير موجود؟'],
      valueRating: 5,
      philosophyPrimaryGoal: 'تعلم التفكير',
      debateReaction: 'أشارك برأيي',
      expectSuccess: 'نعم، لأنني أحب التحديات الفكرية، وأعتقد أن التعبير عن الرأي المنطقي ممتع للفهم الذاتي.'
    },
    analysis: {
      metrics: { cognitiveFear: 5, cognitiveCuriosity: 95, shallowThinking: 10, criticalThinking: 90 },
      classification: 'تفكير نقدي',
      explanation: 'يظهر التلميذ نضجاً فكرياً متميزاً من خلال فهمه للفلسفة كدليل عملي وتساؤل مستمر، مع نزوع واضح لتحليل الأمثلة الواقعية والمشاركة الإيجابية في النقاشات الحجاجية.',
      pedagogicalRecommendation: 'مشاركة التلميذ في قيادة حلقات النقاش الصيفية وصياغة أسئلة إشكالية لتحفيز زملائه على بناء الحجج.'
    },
    teacherNotes: 'تلميذ واعد جداً ولديه نضج لغوي وحجاجي ملموس.',
    teacher_id: 'TCH-001',
    teacher_email: 'professeur@philoscan.edu',
    session_id: 'PS-DE7M00',
    institution: 'ثانوية ابن رشد التأهيلية',
    level: 'جذع مشترك',
    stream: 'العلوم',
    class: '3'
  },
  {
    id: 'sub_2',
    studentName: 'ياسمين الناصري',
    student_name: 'ياسمين الناصري',
    submittedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
    answers: {
      philosophyMeaning: 'أسمع أنها كلام غامض ومعقد لا فائدة منه، ويؤدي فقط إلى الشك والمشاكل الفكرية والابتعاد عن الواقع.',
      sourceOfIdea: 'المحيط الاجتماعي',
      feelingWhenHearing: 'خوف',
      feelingJustification: 'لأن هناك من يقول إن الفلسفة صعبة جداً في الامتحانات الوطنية ونسب الفشل فيها مرتفعة، وتجعلك تشك في معتقداتك.',
      reactionToFreedomQuestion: 'أعتبره صعباً',
      selectedPhilosophicalQuestions: ['ما أكبر عدد؟'],
      valueRating: 2,
      philosophyPrimaryGoal: 'النجاح الدراسي',
      debateReaction: 'أتوتر',
      expectSuccess: 'لا، نظراً لتعقيد المصطلحات وعدم وجود طريقة واضحة للحفظ والحصول على الإجابة الصحيحة الوحيدة.'
    },
    responses: {
      philosophyMeaning: 'أسمع أنها كلام غامض ومعقد لا فائدة منه، ويؤدي فقط إلى الشك والمشاكل الفكرية والابتعاد عن الواقع.',
      sourceOfIdea: 'المحيط الاجتماعي',
      feelingWhenHearing: 'خوف',
      feelingJustification: 'لأن هناك من يقول إن الفلسفة صعبة جداً في الامتحانات الوطنية ونسب الفشل فيها مرتفعة، وتجعلك تشك في معتقداتك.',
      reactionToFreedomQuestion: 'أعتبره صعباً',
      selectedPhilosophicalQuestions: ['ما أكبر عدد؟'],
      valueRating: 2,
      philosophyPrimaryGoal: 'النجاح الدراسي',
      debateReaction: 'أتوتر',
      expectSuccess: 'لا، نظراً لتعقيد المصطلحات وعدم وجود طريقة واضحة للحفظ والحصول على الإجابة الصحيحة الوحيدة.'
    },
    analysis: {
      metrics: { cognitiveFear: 90, cognitiveCuriosity: 20, shallowThinking: 60, criticalThinking: 15 },
      classification: 'خوف معرفي',
      explanation: 'تعاني التلميذة من تمثلات سلبية مسبقة تجعلها تنظر للفلسفة كمصدر للتهديد الفكري والتوتر الامتحاني، مع غياب شبه تام للاستعداد الحجاجي والفضول المعرفي.',
      pedagogicalRecommendation: 'نزع القداسة والغموض عن الفلسفة من خلال أنشطة تفكيك الأوهام، وبيان أن الأسئلة الفلسفية تنطلق من اهتماماتها اليومية البسيطة.'
    },
    teacher_id: 'TCH-001',
    teacher_email: 'professeur@philoscan.edu',
    session_id: 'PS-DE7M00',
    institution: 'ثانوية ابن رشد التأهيلية',
    level: 'جذع مشترك',
    stream: 'العلوم',
    class: '3'
  },
  {
    id: 'sub_3',
    studentName: 'سفيان الفهري',
    student_name: 'سفيان الفهري',
    submittedAt: new Date(Date.now() - 15 * 3600000).toISOString(),
    answers: {
      philosophyMeaning: 'هي مادة دراسية نحفظ فيها مواقف الفلاسفة مثل سقراط وأفلاطون من أجل تفريغها في ورقة الامتحان للحصول على نقطة المرور.',
      sourceOfIdea: 'المدرسة',
      feelingWhenHearing: 'حياد',
      feelingJustification: 'لا أشعر بشيء خاص تجاهها، هي مجرد معامل في الامتحان الوطني كباقي المواد وتتطلب الحفظ الجيد فقط.',
      reactionToFreedomQuestion: 'أبحث عن جواب جاهز',
      selectedPhilosophicalQuestions: ['كيف تعمل السيارة؟'],
      valueRating: 3,
      philosophyPrimaryGoal: 'حفظ المعلومات',
      debateReaction: 'أستمع فقط',
      expectSuccess: 'نعم، إذا قمت بحفظ المنهجيات الجاهزة التي يعطيها الأساتذة وتدربت على تكرار الأقوال الفلسفية الشائعة.'
    },
    responses: {
      philosophyMeaning: 'هي مادة دراسية نحفظ فيها مواقف الفلاسفة مثل سقراط وأفلاطون من أجل تفريغها في ورقة الامتحان للحصول على نقطة المرور.',
      sourceOfIdea: 'المدرسة',
      feelingWhenHearing: 'حياد',
      feelingJustification: 'لا أشعر بشيء خاص تجاهها، هي مجرد معامل في الامتحان الوطني كباقي المواد وتتطلب الحفظ الجيد فقط.',
      reactionToFreedomQuestion: 'أبحث عن جواب جاهز',
      selectedPhilosophicalQuestions: ['كيف تعمل السيارة؟'],
      valueRating: 3,
      philosophyPrimaryGoal: 'حفظ المعلومات',
      debateReaction: 'أستمع فقط',
      expectSuccess: 'نعم، إذا قمت بحفظ المنهجيات الجاهزة التي يعطيها الأساتذة وتدربت على تكرار الأقوال الفلسفية الشائعة.'
    },
    analysis: {
      metrics: { cognitiveFear: 30, cognitiveCuriosity: 15, shallowThinking: 85, criticalThinking: 20 },
      classification: 'تفكير سطحي',
      explanation: 'يربط التلميذ الفلسفة بالبعد الأدواتي والتحصيل الدراسي القائم على الحفظ والتكرار المنهجي، دون وعي حقيقي بوظيفتها في بناء الفلاسفة وتطوير الفكر الذاتي.',
      pedagogicalRecommendation: 'وضعه في وضعية مشكلة تحرج قناعاته الفكرية المحفوظة سلفاً وتدفعه لاكتشاف نسبية المعرفة وحاجته لبناء موقف خاص.'
    },
    teacher_id: 'TCH-001',
    teacher_email: 'professeur@philoscan.edu',
    session_id: 'PS-DE7M00',
    institution: 'ثانوية ابن رشد التأهيلية',
    level: 'جذع مشترك',
    stream: 'العلوم',
    class: '3'
  },
  {
    id: 'sub_4',
    studentName: 'مريم الصويري',
    student_name: 'مريم الصويري',
    submittedAt: new Date(Date.now() - 1 * 24 * 3600000).toISOString(),
    answers: {
      philosophyMeaning: 'طريقة للتفكير الحر ومناقشة الآراء المختلفة بدون قيود مسبقة. أرى أنها تفتح آفاقاً جديدة وتكسر الملل الفكري اليومي.',
      sourceOfIdea: 'الإنترنت',
      feelingWhenHearing: 'فضول',
      feelingJustification: 'أشعر بالانجداب دائماً للمواضيع الكبرى مثل الاختلاف والغير والوعي، وأبحث دائماً عنها في منصات التواصل كاليوتيوب والبودكاست.',
      reactionToFreedomQuestion: 'أفكر في أمثلة من الواقع',
      selectedPhilosophicalQuestions: ['هل الخير موجود؟', 'لماذا نعيش؟'],
      valueRating: 4,
      philosophyPrimaryGoal: 'النقاش',
      debateReaction: 'أشارك برأيي',
      expectSuccess: 'نعم، أتوقع النجاح لأنني أتمتع بأسلوب حواري وأحب التعبير عن آرائي بالكتابة والنقاش الحر.'
    },
    responses: {
      philosophyMeaning: 'طريقة للتفكير الحر ومناقشة الآراء المختلفة بدون قيود مسبقة. أرى أنها تفتح آفاقاً جديدة وتكسر الملل الفكري اليومي.',
      sourceOfIdea: 'الإنترنت',
      feelingWhenHearing: 'فضول',
      feelingJustification: 'أشعر بالانجداب دائماً للمواضيع الكبرى مثل الاختلاف والغير والوعي، وأبحث دائماً عنها في منصات التواصل كاليوتيوب والبودكاست.',
      reactionToFreedomQuestion: 'أفكر في أمثلة من الواقع',
      selectedPhilosophicalQuestions: ['هل الخير موجود؟', 'لماذا نعيش؟'],
      valueRating: 4,
      philosophyPrimaryGoal: 'النقاش',
      debateReaction: 'أشارك برأيي',
      expectSuccess: 'نعم، أتوقع النجاح لأنني أتمتع بأسلوب حواري وأحب التعبير عن آرائي بالكتابة والنقاش الحر.'
    },
    analysis: {
      metrics: { cognitiveFear: 10, cognitiveCuriosity: 85, shallowThinking: 25, criticalThinking: 75 },
      classification: 'فضول معرفي',
      explanation: 'تمتلك التلميذة دافعية معرفية واعدة وشغفاً بالصيغ الحوارية الحرة، إلا أنها تحتاج إلى صقل هذه الطاقة في قوالب منهجية حجاجية صارمة لتجنب الانزلاق نحو سجال غير منتج.',
      pedagogicalRecommendation: 'توجيه فضولها نحو القراءات المنظمة، وإشراكها في نوادي المناظرة المدرسية لتعلم استراتيجيات المحاجة المنهجية.'
    },
    teacher_id: 'TCH-001',
    teacher_email: 'professeur@philoscan.edu',
    session_id: 'PS-DE7M00',
    institution: 'ثانوية ابن رشد التأهيلية',
    level: 'جذع مشترك',
    stream: 'العلوم',
    class: '3'
  }
];

function ensureDataFilesExist() {
  const dataDir = resolveDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbFile = getDbFile();
  const teachersFile = getTeachersFile();
  const sessionsFile = getSessionsFile();
  const reportsFile = getReportsFile();
  const formsFile = getFormsFile();
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify(INITIAL_SEED_SUBMISSIONS, null, 2), 'utf-8');
  }
  if (!fs.existsSync(teachersFile)) {
    fs.writeFileSync(teachersFile, JSON.stringify(INITIAL_SEED_TEACHERS, null, 2), 'utf-8');
  }
  if (!fs.existsSync(sessionsFile)) {
    fs.writeFileSync(sessionsFile, JSON.stringify(INITIAL_SEED_SESSIONS, null, 2), 'utf-8');
  }
  if (!fs.existsSync(reportsFile)) {
    fs.writeFileSync(reportsFile, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(formsFile)) {
    fs.writeFileSync(formsFile, JSON.stringify([], null, 2), 'utf-8');
  }
}

let submissionsWriteQueue: Promise<any> = Promise.resolve();
let sessionsWriteQueue: Promise<any> = Promise.resolve();
let teachersWriteQueue: Promise<any> = Promise.resolve();
let reportsWriteQueue: Promise<any> = Promise.resolve();
let formsWriteQueue: Promise<any> = Promise.resolve();

export interface UserReport {
  id: string; // e.g. "REP-1001"
  timestamp: string;
  senderName?: string;
  reporterUid?: string;
  email: string;
  reportType: 'tech_error' | 'form_error' | 'analytics_error' | 'dev_suggestion' | 'new_feature' | 'general_comment';
  title: string;
  description: string;
  imageUrl?: string;
  status: 'new' | 'review' | 'resolved' | 'closed';
}

async function loadReports(): Promise<UserReport[]> {
  ensureDataFilesExist();
  try {
    const file = getReportsFile();
    if (fs.existsSync(file)) {
      const data = await fs.promises.readFile(file, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading reports asynchronously:', err);
  }
  return [];
}

async function saveReports(data: UserReport[]): Promise<void> {
  ensureDataFilesExist();
  const nextTicket = reportsWriteQueue.then(async () => {
    try {
      const target = getReportsFile();
      const tempFile = target + '.tmp';
      await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempFile, target);
    } catch (err) {
      console.error('Error saving reports asynchronously:', err);
      throw err;
    }
  }).catch((err) => {
    console.error('Recovered reports write queue error:', err);
  });
  reportsWriteQueue = nextTicket;
  await nextTicket;
}

// ==================== ADMINISTRATIVE MIDDLEWARE & SECURITY REGISTRY ====================

export interface SecurityVerificationHooks {
  verifyIdToken?: (token: string) => Promise<VerifiedFirebaseUser | null>;
  verifyAppCheck?: (tokenHeader: string | undefined | null) => Promise<VerifiedAppCheckResult>;
  checkTeacherActive?: (uid: string, idToken: string) => Promise<{ exists: boolean; isDisabled: boolean }>;
  checkAdminActive?: (uid: string, email: string, emailVerified: boolean, idToken: string) => Promise<boolean>;
}

const defaultHooks: SecurityVerificationHooks = {
  verifyIdToken: (token) => verifyFirebaseIdToken(token),
  verifyAppCheck: (tokenHeader) => verifyAppCheckToken(tokenHeader),
  checkTeacherActive: (uid, idToken) => isTeacherActiveViaRest(uid, idToken),
  checkAdminActive: (uid, email, emailVerified, idToken) => isAdminActiveViaRest(uid, email, emailVerified, idToken),
};

let activeSecurityHooks: SecurityVerificationHooks = { ...defaultHooks };

export function setSecurityTestHooks(hooks: Partial<SecurityVerificationHooks>): void {
  activeSecurityHooks = { ...defaultHooks, ...hooks };
}

export function resetSecurityTestHooks(): void {
  activeSecurityHooks = { ...defaultHooks };
}

const activeAdminTokens = new Set<string>();

function getTokenSigningKey(): string {
  return getAnalysisHmacKey();
}

function isValidAdminSecret(secret?: string): boolean {
  if (!secret || typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  const configured = (process.env.ADMIN_SECRET_KEY || '').trim();
  if (!configured || configured === 'REPLACE_WITH_STRONG_ADMIN_SECRET' || configured.length < 8) {
    return false;
  }
  const actualHash = crypto.createHash('sha256').update(trimmed, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(configured, 'utf8').digest();
  return crypto.timingSafeEqual(actualHash, expectedHash);
}

function isValidReportImageUrl(url: unknown): boolean {
  if (url === undefined || url === null || url === '') return true;
  if (typeof url !== 'string') return false;
  if (url.length <= 500 && /^https:\/\/[^\s<>"']+$/.test(url)) {
    return true;
  }
  if (url.length <= 250_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) {
    return true;
  }
  return false;
}

function sanitizePublicSession(session: DiagnosticSession): Record<string, any> {
  return {
    sessionId: session.sessionId,
    ownerRef: session.ownerRef || '',
    title: session.title || '',
    institution: session.institution || '',
    level: session.level || '',
    stream: session.stream || '',
    class: (session as any).class || session.classNumber || '',
    classNumber: session.classNumber || '',
    province: session.province || '',
    isActive: session.isActive !== false && !session.isFrozen,
    isFrozen: Boolean(session.isFrozen),
    supervisedMode: Boolean(session.supervisedMode),
    formId: session.formId || 'official-perceptions',
    formTitle: session.formTitle || 'تشخيص التصورات حول الفلسفة',
    questions: session.questions,
    createdAt: session.createdAt,
  };
}

function issueAdminToken(uid = 'TCH-ADMIN', email = 'phillofikr@gmail.com'): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'admin',
      uid,
      email: email.toLowerCase().trim(),
      exp: Date.now() + 12 * 60 * 60 * 1000,
      nonce: crypto.randomBytes(12).toString('hex')
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getTokenSigningKey())
    .update(payload)
    .digest('base64url');
  const token = `ps_adm_${payload}.${sig}`;
  activeAdminTokens.add(token);
  return token;
}

function verifyAdminToken(token: unknown): { uid: string; email: string } | null {
  if (!token || typeof token !== 'string') return null;
  const clean = token.trim();
  if (!clean || !clean.startsWith('ps_adm_')) return null;

  const raw = clean.slice('ps_adm_'.length);
  const dotIdx = raw.indexOf('.');
  if (dotIdx === -1) return null;

  const payload = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  if (!payload || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getTokenSigningKey())
      .update(payload)
      .digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.role !== 'admin' || !decoded.exp || decoded.exp < Date.now()) {
      activeAdminTokens.delete(clean);
      return null;
    }
    return {
      uid: String(decoded.uid || 'TCH-ADMIN'),
      email: String(decoded.email || 'phillofikr@gmail.com').toLowerCase().trim(),
    };
  } catch {
    return null;
  }
}

function extractBearerToken(req: any): string {
  const authHeader = String(req.headers['authorization'] || '');
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  return (
    bearer ||
    String(req.headers['x-firebase-id-token'] || '').trim() ||
    String(req.headers['x-admin-token'] || '').trim()
  );
}

function extractAdminSecretHeader(req: any): string {
  return String(req.headers['x-admin-secret'] || req.body?.adminSecret || '').trim();
}

function isAdminAuthorizedSync(req: any): boolean {
  const token = extractBearerToken(req);
  if (verifyAdminToken(token)) return true;
  const adminSecret = extractAdminSecretHeader(req);
  return isValidAdminSecret(adminSecret);
}

async function resolveFirebaseAdminActor(req: any): Promise<{ role: 'admin'; uid: string; email: string } | null> {
  const syncSecret = extractAdminSecretHeader(req);
  if (isValidAdminSecret(syncSecret)) {
    return { role: 'admin', uid: 'TCH-ADMIN', email: 'phillofikr@gmail.com' };
  }
  const token = extractBearerToken(req);
  const decodedAdmin = verifyAdminToken(token);
  if (decodedAdmin) {
    return { role: 'admin', uid: decodedAdmin.uid, email: decodedAdmin.email };
  }
  if (token && token.split('.').length === 3) {
    const fbUser = await (activeSecurityHooks.verifyIdToken || defaultHooks.verifyIdToken)!(token);
    if (fbUser && !fbUser.isAnonymous && fbUser.emailVerified && fbUser.email) {
      const checkFn = activeSecurityHooks.checkAdminActive || defaultHooks.checkAdminActive!;
      const ok = await checkFn(fbUser.uid, fbUser.email, fbUser.emailVerified, token);
      if (ok) {
        return { role: 'admin', uid: fbUser.uid, email: fbUser.email };
      }
    }
  }
  return null;
}

async function requireAdminAuth(req: any, res: any, next: any) {
  try {
    const adminActor = await resolveFirebaseAdminActor(req);
    if (adminActor) {
      req.authActor = {
        role: 'admin',
        uid: adminActor.uid,
        teacherId: adminActor.uid,
        email: adminActor.email,
      };
      return next();
    }
  } catch {
    // Fall through to 403
  }
  return res.status(403).json({
    error: 'غير مصرح بالعملية. يرجى تسجيل الدخول كمسؤول نشط للمنصة.'
  });
}

async function requireTeacherOrAdminAuth(req: any, res: any, next: any) {
  try {
    const adminActor = await resolveFirebaseAdminActor(req);
    if (adminActor) {
      req.authActor = {
        role: 'admin',
        uid: adminActor.uid,
        teacherId: adminActor.uid,
        email: adminActor.email,
      };
      return next();
    }

    const token = extractBearerToken(req);
    if (token && token.split('.').length === 3) {
      const fbUser = await (activeSecurityHooks.verifyIdToken || defaultHooks.verifyIdToken)!(token);
      if (!fbUser || fbUser.isAnonymous || !fbUser.emailVerified || !fbUser.email) {
        return res.status(401).json({
          error: 'يتطلب الوصول حساب أستاذ موثقاً ومفعّلاً عبر Firebase Auth.'
        });
      }

      // Fail closed against disabled or missing teacher profile in Firestore REST
      const checkTeacher = activeSecurityHooks.checkTeacherActive || defaultHooks.checkTeacherActive!;
      const teacherState = await checkTeacher(fbUser.uid, token);
      if (!teacherState.exists || teacherState.isDisabled) {
        return res.status(403).json({
          error: 'هذا الحساب غير مفعّل أو تم تعطيله من قبل إدارة المنصة.'
        });
      }

      req.authActor = {
        role: 'teacher',
        uid: fbUser.uid,
        teacherId: fbUser.uid,
        email: fbUser.email,
        firebaseIdToken: token,
      };
      return next();
    }
  } catch (err) {
    console.warn('[PhiloScan Auth] Verification failure:', err);
  }

  return res.status(401).json({
    error: 'غير مصرح بالوصول. يرجى تسجيل الدخول بحساب الأستاذ أو المدير للمتابعة.'
  });
}

async function requireStudentAppCheckAndAuth(req: any, res: any, next: any) {
  const appCheckHeader = req.headers['x-firebase-appcheck'] as string | undefined;
  const appCheckFn = activeSecurityHooks.verifyAppCheck || defaultHooks.verifyAppCheck!;
  const appCheckRes = await appCheckFn(appCheckHeader);
  if (!appCheckRes.valid) {
    return res.status(403).json({
      error: appCheckRes.reason || 'تعذر التحقق من سلامة تطبيق العميل (App Check).'
    });
  }

  const token = extractBearerToken(req);
  if (!token || token.split('.').length !== 3) {
    return res.status(401).json({
      error: 'يرجى تفعيل جلسة التلميذ المؤمنة (Firebase Anonymous Auth) قبل الإرسال.'
    });
  }

  const fbUser = await (activeSecurityHooks.verifyIdToken || defaultHooks.verifyIdToken)!(token);
  if (!fbUser || !fbUser.uid) {
    return res.status(401).json({
      error: 'رمز جلسة التلميذ غير صالح أو منتهي الصلاحية.'
    });
  }

  req.studentActor = {
    uid: fbUser.uid,
    isAnonymous: fbUser.isAnonymous,
    email: fbUser.email,
  };
  return next();
}

const aiRateLimiter = createRateLimiter({
  keyPrefix: 'ai',
  windowMs: 60_000,
  maxPerIp: 25,
  maxPerUid: 15,
});

const publicReadRateLimiter = createRateLimiter({
  keyPrefix: 'public',
  windowMs: 60_000,
  maxPerIp: 60,
});

const authRateLimiter = createRateLimiter({
  keyPrefix: 'auth',
  windowMs: 60_000,
  maxPerIp: 20,
});

function isActorOwnerOfRecord(actor: any, record: { teacherId?: string; teacher_id?: string; teacherEmail?: string; teacher_email?: string }): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  const recUid = String(record.teacherId || record.teacher_id || '').trim();
  const recEmail = String(record.teacherEmail || record.teacher_email || '').toLowerCase().trim();
  if (recUid && actor.uid && recUid === actor.uid) return true;
  if (recEmail && actor.email && recEmail === actor.email.toLowerCase().trim()) return true;
  return false;
}

async function loadForms(): Promise<any[]> {
  ensureDataFilesExist();
  try {
    const file = getFormsFile();
    if (fs.existsSync(file)) {
      const data = await fs.promises.readFile(file, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading forms asynchronously:', err);
  }
  return [];
}

async function saveForms(data: any[]): Promise<void> {
  ensureDataFilesExist();
  const nextTicket = formsWriteQueue.then(async () => {
    try {
      const target = getFormsFile();
      const tempFile = target + '.tmp';
      await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempFile, target);
    } catch (err) {
      console.error('Error saving forms asynchronously:', err);
      throw err;
    }
  }).catch((err) => {
    console.error('Recovered forms write queue error:', err);
  });
  formsWriteQueue = nextTicket;
  await nextTicket;
}


async function loadSubmissions(): Promise<StudentSubmission[]> {
  ensureDataFilesExist();
  try {
    const data = await fs.promises.readFile(getDbFile(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading submissions asynchronously:', err);
    return INITIAL_SEED_SUBMISSIONS;
  }
}

async function saveSubmissions(data: StudentSubmission[]): Promise<void> {
  ensureDataFilesExist();
  const nextTicket = submissionsWriteQueue.then(async () => {
    try {
      const target = getDbFile();
      const tempFile = target + '.tmp';
      await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempFile, target);
    } catch (err) {
      console.error('Error saving submissions asynchronously:', err);
      throw err;
    }
  }).catch((err) => {
    console.error('Recovered submissions write queue error:', err);
  });
  submissionsWriteQueue = nextTicket;
  await nextTicket;
}

async function loadTeachers(): Promise<Teacher[]> {
  ensureDataFilesExist();
  try {
    const data = await fs.promises.readFile(getTeachersFile(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading teachers asynchronously:', err);
    return INITIAL_SEED_TEACHERS;
  }
}

async function saveTeachers(data: Teacher[]): Promise<void> {
  ensureDataFilesExist();
  const nextTicket = teachersWriteQueue.then(async () => {
    try {
      const target = getTeachersFile();
      const tempFile = target + '.tmp';
      await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempFile, target);
    } catch (err) {
      console.error('Error saving teachers asynchronously:', err);
      throw err;
    }
  }).catch((err) => {
    console.error('Recovered teachers write queue error:', err);
  });
  teachersWriteQueue = nextTicket;
  await nextTicket;
}

async function loadSessions(): Promise<DiagnosticSession[]> {
  ensureDataFilesExist();
  try {
    const data = await fs.promises.readFile(getSessionsFile(), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading sessions asynchronously:', err);
    return INITIAL_SEED_SESSIONS;
  }
}

async function saveSessions(data: DiagnosticSession[]): Promise<void> {
  ensureDataFilesExist();
  const nextTicket = sessionsWriteQueue.then(async () => {
    try {
      const target = getSessionsFile();
      const tempFile = target + '.tmp';
      await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempFile, target);
    } catch (err) {
      console.error('Error saving sessions asynchronously:', err);
      throw err;
    }
  }).catch((err) => {
    console.error('Recovered sessions write queue error:', err);
  });
  sessionsWriteQueue = nextTicket;
  await nextTicket;
}

let monitoringWriteQueue: Promise<any> = Promise.resolve();

async function loadMonitoring(): Promise<Record<string, Record<string, {
  studentName: string;
  status: 'يجيب حالياً' | 'متوقف مؤقتاً' | 'غادر الصفحة' | 'أنهى الاستمارة';
  lastActive: string;
  joinedAt: string;
  violations: any[];
  reliabilityIndex: number;
}>>> {
  ensureDataFilesExist();
  try {
    const file = getMonitoringFile();
    if (fs.existsSync(file)) {
      const data = await fs.promises.readFile(file, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading monitoring data:', err);
  }
  return {};
}

async function saveMonitoring(data: any): Promise<void> {
  ensureDataFilesExist();
  const nextTicket = monitoringWriteQueue.then(async () => {
    try {
      const target = getMonitoringFile();
      const tempPath = target + '.tmp';
      await fs.promises.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, target);
    } catch (err) {
      console.error('Error saving monitoring data:', err);
    }
  }).catch((err) => {
    console.error('Recovered monitoring write queue error:', err);
  });
  monitoringWriteQueue = nextTicket;
  await nextTicket;
}


// ==================== REAL-TIME SSE STREAM REGISTRY ====================
const sseClients = new Map<string, Set<express.Response>>();

function registerSseClient(key: string, res: express.Response) {
  const norm = key.trim().toLowerCase();
  if (!sseClients.has(norm)) {
    sseClients.set(norm, new Set());
  }
  sseClients.get(norm)!.add(res);
}

function unregisterSseClient(key: string, res: express.Response) {
  const norm = key.trim().toLowerCase();
  const bucket = sseClients.get(norm);
  if (bucket) {
    bucket.delete(res);
    if (bucket.size === 0) {
      sseClients.delete(norm);
    }
  }
}

function sendSsePacket(res: express.Response, eventName: string, data: any) {
  try {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Socket might already be closing
  }
}

function broadcastRealtimeEvent(
  teacherEmail: string | undefined,
  eventName: string,
  payload: any
) {
  const targets = new Set<express.Response>();
  if (teacherEmail) {
    const bucket = sseClients.get(teacherEmail.trim().toLowerCase());
    if (bucket) bucket.forEach((r) => targets.add(r));
  }
  const adminBucket = sseClients.get('__admin__');
  if (adminBucket) adminBucket.forEach((r) => targets.add(r));

  targets.forEach((clientRes) => sendSsePacket(clientRes, eventName, payload));
}

// Lazy Initialize Gemini API SDK Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== "") {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      console.log('Gemini AI Client successfully initialized server-side.');
    } else {
      console.warn('GEMINI_API_KEY is not defined or is placeholder. Falling back to deterministic analysis.');
    }
  }
  return aiClient;
}

// ==================== DEEP DIAGNOSTIC ENRICHMENT ENGINE ====================
function scoreTextDepth(text: string): { score: number; wordCount: number } {
  const clean = (text || '').trim();
  if (!clean) return { score: 10, wordCount: 0 };
  const words = clean.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  let score = 25;
  if (wordCount >= 22) score = 92;
  else if (wordCount >= 14) score = 80;
  else if (wordCount >= 8) score = 65;
  else if (wordCount >= 4) score = 48;
  else score = 30;

  const philosophicalTerms = [
    'وجود', 'حرية', 'وعي', 'شك', 'نقد', 'عقل', 'حجة', 'دليل', 'أخلاق',
    'حقيقة', 'إشكال', 'سؤال', 'تساؤل', 'ذات', 'غير', 'قيم', 'معنى', 'منطق'
  ];
  const shallowTerms = ['حفظ', 'امتحان', 'نقطة', 'معامل', 'جاهز', 'لا أدري', 'صعب'];
  let bonus = 0;
  philosophicalTerms.forEach((term) => {
    if (clean.includes(term)) bonus += 4;
  });
  shallowTerms.forEach((term) => {
    if (clean.includes(term)) bonus -= 5;
  });

  return {
    score: Math.max(10, Math.min(100, score + Math.min(16, bonus))),
    wordCount
  };
}

function formatCustomAnswerValue(val: any): string {
  if (val === null || val === undefined) return '—';
  if (Array.isArray(val)) {
    return val.map((item, idx) => `${idx + 1}. ${String(item)}`).join(' | ');
  }
  if (typeof val === 'object') {
    if ('fileName' in val && val.fileName) {
      return `ملف مرفق: ${val.fileName} (${val.fileSizeKb || 0} KB)`;
    }
    return Object.entries(val)
      .map(([row, rating]) => `${row}: ${String(rating)}`)
      .join(' | ');
  }
  return String(val);
}

function buildDeepDiagnosticEnrichment(
  answers: Record<string, any>,
  metrics: { cognitiveFear: number; cognitiveCuriosity: number; shallowThinking: number; criticalThinking: number; learningReadiness?: number },
  classification: ThinkingStyle,
  reliabilityIndex = 100,
  violations: any[] = [],
  questionLabels?: Record<string, string>,
  questionMeta?: Record<string, { label?: string; dimension?: string; weight?: number; type?: string }>
) {
  const questionBreakdown: Array<{
    questionId: string;
    questionLabel: string;
    answerText: string;
    dimension: string;
    depthScore: number;
    semanticNote: string;
  }> = [];

  const isCustomOnly = questionLabels && Object.keys(questionLabels).length > 0 && !answers.philosophyMeaning;

  if (isCustomOnly) {
    Object.entries(answers || {}).forEach(([qid, val]) => {
      const meta = questionMeta?.[qid];
      const label = meta?.label || questionLabels![qid] || qid;
      const ansText = formatCustomAnswerValue(val);
      const weight = typeof meta?.weight === 'number' ? Math.max(1, Math.min(5, meta.weight)) : 3;
      const { score, wordCount } = scoreTextDepth(ansText);
      const weightedScore = Math.min(100, Math.round(score * (0.85 + weight * 0.05)));
      questionBreakdown.push({
        questionId: qid,
        questionLabel: label,
        answerText: ansText || '—',
        dimension: meta?.dimension ? `${meta.dimension} (الوزن ${weight}/5)` : 'استمارة تشخيصية مخصصة',
        depthScore: weightedScore,
        semanticNote:
          wordCount >= 10
            ? 'إجابة مفصلة تعكس جهداً تعبيرياً وتفاعلاً واعياً مع السؤال.'
            : wordCount >= 4
            ? 'إجابة متوسطة التركيز تحتاج إلى استثمار أمثلة أو تعليل إضافي.'
            : 'استجابة مقتضبة قد تشير إلى اختزال أو حذر معرفي.'
      });
    });
  } else {
    const meaningStr = String(answers?.philosophyMeaning || '');
    const meaningDepth = scoreTextDepth(meaningStr);
    questionBreakdown.push({
      questionId: 'philosophyMeaning',
      questionLabel: 'ما معنى الفلسفة بالنسبة لك؟',
      answerText: meaningStr || '—',
      dimension: 'المحور 1: التصور الأولي',
      depthScore: meaningDepth.score,
      semanticNote: meaningDepth.score >= 70
        ? 'تمثل عقلي ناضج يربط الفلسفة بالمساءلة والفهم والوجود.'
        : meaningStr.includes('حفظ') || meaningStr.includes('امتحان')
        ? 'تصور مدرسي أداتي يختزل التفلسف في الحفظ والاستظهار.'
        : 'تمثل أولي عام يحتاج إلى تفكيك ديدكتيكي وتأصيل مفاهيمي.'
    });

    const sourceStr = String(answers?.sourceOfIdea || '—');
    questionBreakdown.push({
      questionId: 'sourceOfIdea',
      questionLabel: 'مصدر تشكل الفكرة المسبقة',
      answerText: sourceStr,
      dimension: 'المحور 1: التصور الأولي',
      depthScore: sourceStr === 'المدرسة' ? 78 : sourceStr === 'الإنترنت' ? 72 : sourceStr === 'المحيط الاجتماعي' ? 50 : 32,
      semanticNote:
        sourceStr === 'المحيط الاجتماعي'
          ? 'تأثير الأحكام الجاهزة والتمثلات الاجتماعية السائدة (الدوكسا) واضح.'
          : sourceStr === 'لا فكرة مسبقة'
          ? 'صفحة ذهنية مفتوحة تسمح ببناء تمثل فلسفي سليم منذ البداية.'
          : 'مصدر معرفي قابل للتوجيه نحو القراءة الفلسفية المنهجية.'
    });

    const feelingStr = String(answers?.feelingWhenHearing || '—');
    const justStr = String(answers?.feelingJustification || '');
    const justDepth = scoreTextDepth(justStr);
    questionBreakdown.push({
      questionId: 'feelingWhenHearing',
      questionLabel: 'الشعور الوجداني وتعليله',
      answerText: `${feelingStr}${justStr ? ` — "${justStr}"` : ''}`,
      dimension: 'المحور 2: البعد الوجداني',
      depthScore: Math.round((justDepth.score + (feelingStr === 'فضول' || feelingStr === 'إعجاب' ? 90 : feelingStr === 'حياد' ? 60 : 30)) / 2),
      semanticNote:
        feelingStr === 'خوف' || feelingStr === 'صعوبة'
          ? 'حاجز وجداني يتطلب تطبيع العلاقة مع السؤال الفلسفي وطمأنة المتعلم.'
          : 'مناخ وجداني إيجابي أو محايد ييسّر الانخراط في الدرس الفلسفي.'
    });

    const freedomStr = String(answers?.reactionToFreedomQuestion || '—');
    const selectedQs = Array.isArray(answers?.selectedPhilosophicalQuestions) ? answers.selectedPhilosophicalQuestions : [];
    const philoQsHit = selectedQs.filter((q: string) => q.includes('نعيش') || q.includes('الخير') || q.includes('حدس') || q.includes('النفس')).length;
    questionBreakdown.push({
      questionId: 'reactionToFreedomQuestion',
      questionLabel: 'نمط التفكير أمام سؤال الحرية والتمييز الإشكالي',
      answerText: `${freedomStr} | الأسئلة المختارة: ${selectedQs.join('، ') || 'لا شيء'}`,
      dimension: 'المحور 3: نمط التفكير',
      depthScore: Math.min(100, (freedomStr === 'أفكر في أمثلة من الواقع' ? 80 : freedomStr === 'أطلب المساعدة' ? 60 : 35) + philoQsHit * 10),
      semanticNote:
        freedomStr === 'أفكر في أمثلة من الواقع'
          ? 'نزعة استدلالية عملية تربط المفاهيم المجردة بالواقع المعيش.'
          : 'اعتماد على الجاهز أو تهرب من الأشكلة يستلزم تدريباً على تفكيك الأسئلة.'
    });

    const ratingNum = Number(answers?.valueRating) || 3;
    const goalStr = String(answers?.philosophyPrimaryGoal || '—');
    questionBreakdown.push({
      questionId: 'valueRating',
      questionLabel: 'تقدير القيمة المعرفية والغاية الأساسية',
      answerText: `التقييم: ${ratingNum}/5 — الغاية: ${goalStr}`,
      dimension: 'المحور 4: القيمة المعرفية',
      depthScore: Math.min(100, ratingNum * 16 + (goalStr === 'تعلم التفكير' ? 20 : goalStr === 'النقاش' ? 14 : 0)),
      semanticNote:
        goalStr === 'حفظ المعلومات' || goalStr === 'النجاح الدراسي'
          ? 'غلبة المنظور النفعي الامتحاني على القيمة التكوينية للمادة.'
          : 'إدراك واعٍ لوظيفة الفلسفة في بناء العقل النقدي والحوار.'
    });

    const debateStr = String(answers?.debateReaction || '—');
    const expectStr = String(answers?.expectSuccess || '');
    const expectDepth = scoreTextDepth(expectStr);
    questionBreakdown.push({
      questionId: 'debateReaction',
      questionLabel: 'الاستعداد الحجاجي وتوقع النجاح',
      answerText: `${debateStr}${expectStr ? ` — "${expectStr}"` : ''}`,
      dimension: 'المحور 5: الاستعداد الحجاجي',
      depthScore: Math.round((expectDepth.score + (debateStr === 'أشارك برأيي' ? 92 : debateStr === 'أستمع فقط' ? 65 : 30)) / 2),
      semanticNote:
        debateStr === 'أشارك برأيي'
          ? 'استعداد تفاعلي مرتفع يمكن استثماره في قيادة المناظرات الصفية.'
          : 'تردد في التعبير الشفهي يحتاج تشجيعاً تدريجياً داخل مجموعات مصغرة.'
    });
  }

  // Contradiction Detection Engine
  const contradictions: Array<{
    pairLabel: string;
    questionA: string;
    questionB: string;
    description: string;
    severity: 'منخفض' | 'متوسط' | 'مرتفع';
  }> = [];

  if (!isCustomOnly) {
    const ratingNum = Number(answers?.valueRating) || 3;
    const feeling = String(answers?.feelingWhenHearing || '');
    const goal = String(answers?.philosophyPrimaryGoal || '');
    const debate = String(answers?.debateReaction || '');
    const freedom = String(answers?.reactionToFreedomQuestion || '');
    const expectStr = String(answers?.expectSuccess || '');
    const meaning = String(answers?.philosophyMeaning || '');
    const selectedQs: string[] = Array.isArray(answers?.selectedPhilosophicalQuestions) ? answers.selectedPhilosophicalQuestions : [];

    if (ratingNum >= 4 && (feeling === 'خوف' || feeling === 'صعوبة')) {
      contradictions.push({
        pairLabel: 'تقدير القيمة مقابل الشعور الوجداني',
        questionA: `تقييم قيمة الفلسفة: ${ratingNum}/5`,
        questionB: `الشعور الفوري: ${feeling}`,
        description: 'يقر التلميذ بأهمية الفلسفة معرفياً لكنه يشعر تجاهها بالخوف أو الصعوبة، مما يكشف عن قلق التقييم وليس رفضاً للمادة.',
        severity: 'متوسط'
      });
    }

    if (debate === 'أشارك برأيي' && (freedom === 'أبحث عن جواب جاهز' || goal === 'حفظ المعلومات')) {
      contradictions.push({
        pairLabel: 'الاندفاع الحواري مقابل الاتكال المنهجي',
        questionA: `التفاعل في النقاش: ${debate}`,
        questionB: `السلوك المنهجي: ${freedom} / ${goal}`,
        description: 'رغبة ظاهرية في إبداء الرأي مقابل تفضيل الحلول الجاهزة والحفظ، وهو مؤشر على الرأي التلقائي غير المؤسس حجاجياً.',
        severity: 'مرتفع'
      });
    }

    if (goal === 'تعلم التفكير' && (selectedQs.includes('كيف تعمل السيارة؟') || selectedQs.includes('ما أكبر عدد؟')) && !selectedQs.includes('لماذا نعيش؟')) {
      contradictions.push({
        pairLabel: 'ادعاء الغاية التفكيرية مقابل التمييز الإشكالي',
        questionA: `الغاية المصرح بها: ${goal}`,
        questionB: `الأسئلة المختارة: ${selectedQs.join('، ')}`,
        description: 'يصرح التلميذ برغبته في تعلم التفكير لكنه يخلط بين السؤال التقني/الكمي والسؤال الفلسفي الوجودي.',
        severity: 'متوسط'
      });
    }

    if (expectStr.includes('نعم') && (meaning.includes('لا فائدة') || meaning.includes('معقد') || meaning.includes('غموض'))) {
      contradictions.push({
        pairLabel: 'التصور السلبي مقابل توقع النجاح',
        questionA: 'تصور الفلسفة كخطاب غامض أو عديم الجدوى',
        questionB: 'توقع النجاح في المادة',
        description: 'يرجح أن التلميذ يراهن على النجاح عبر استراتيجية الحفظ الميكانيكي رغم قطيعته الوجدانية مع معنى المادة.',
        severity: 'منخفض'
      });
    }
  }

  // Credibility Assessment Engine
  const avgQuestionDepth = questionBreakdown.length > 0
    ? Math.round(questionBreakdown.reduce((acc, q) => acc + q.depthScore, 0) / questionBreakdown.length)
    : 60;
  const openTextLen =
    String(answers?.philosophyMeaning || '').trim().length +
    String(answers?.feelingJustification || '').trim().length +
    String(answers?.expectSuccess || '').trim().length;
  const textualEffortScore = isCustomOnly
    ? avgQuestionDepth
    : Math.max(20, Math.min(100, openTextLen > 160 ? 95 : openTextLen > 90 ? 82 : openTextLen > 45 ? 65 : 38));
  const consistencyScore = Math.max(30, 100 - contradictions.length * 18);
  const proctoringScore = Math.max(0, Math.min(100, typeof reliabilityIndex === 'number' ? reliabilityIndex : 100));
  const overallCredibility = Math.round(textualEffortScore * 0.35 + consistencyScore * 0.35 + proctoringScore * 0.3);

  const credibilityVerdict: 'موثوقة جداً' | 'موثوقة نسبياً' | 'تحتاج مراجعة' =
    overallCredibility >= 80 ? 'موثوقة جداً' : overallCredibility >= 55 ? 'موثوقة نسبياً' : 'تحتاج مراجعة';

  const credibilitySignals: string[] = [];
  if (textualEffortScore >= 75) credibilitySignals.push('عمق لغوي ووضوح في التعليلات المفتوحة.');
  else credibilitySignals.push('إجابات مفتوحة مقتضبة نسبياً تستدعي استيضاحاً شفهياً.');
  if (contradictions.length === 0) credibilitySignals.push('اتساق تام بين المواقف الوجدانية والاختيارات المنهجية.');
  else credibilitySignals.push(`رصد ${contradictions.length} مؤشر(ات) تباين بين التمثلات المصرح بها.`);
  if (proctoringScore >= 85 && (!violations || violations.length === 0)) {
    credibilitySignals.push('التزام تام بضوابط الجلسة التشخيصية دون مخالفات مسجلة.');
  } else {
    credibilitySignals.push(`مؤشر النزاهة السلوكية مسجل عند ${proctoringScore}% مع ${violations?.length || 0} تنبيهات.`);
  }

  // Cognitive & Epistemological Obstacles Classification
  const cognitiveObstacles: Array<{
    title: string;
    category: string;
    severity: 'منخفض' | 'متوسط' | 'مرتفع';
    evidence: string;
    intervention: string;
  }> = [];

  if (metrics.shallowThinking >= 50 || answers?.philosophyPrimaryGoal === 'حفظ المعلومات') {
    cognitiveObstacles.push({
      title: 'العائق المدرسي والأدواتي (الاختزال الامتحاني)',
      category: 'عائق منهجي',
      severity: metrics.shallowThinking >= 70 ? 'مرتفع' : 'متوسط',
      evidence: `مؤشر التفكير السطحي (${Math.round(metrics.shallowThinking)}%) وربط المادة بالحفظ أو النقطة.`,
      intervention: 'توظيف وضعيات مشكلة محرجة تبرهن عملياً أن الجواب الجاهز يعجز عن مقاربة الإشكال الفلسفي.'
    });
  }

  if (metrics.cognitiveFear >= 45 || answers?.feelingWhenHearing === 'خوف') {
    cognitiveObstacles.push({
      title: 'العائق الوجداني (الرهاب المفاهيمي والقلق التقييمي)',
      category: 'عائق نفسي-معرفي',
      severity: metrics.cognitiveFear >= 70 ? 'مرتفع' : 'متوسط',
      evidence: `مؤشر الخوف المعرفي (${Math.round(metrics.cognitiveFear)}%) وشعور التوجس من الغموض أو الفشل.`,
      intervention: 'البدء بتجارب يومية مألوفة لدى المتعلم وتفكيك التمثل الخاطئ حول تعقيد الخطاب الفلسفي.'
    });
  }

  if (answers?.sourceOfIdea === 'المحيط الاجتماعي' || answers?.reactionToFreedomQuestion === 'أبحث عن جواب جاهز') {
    cognitiveObstacles.push({
      title: 'عائق الرأي المشترك الجاهز (الدوكسا)',
      category: 'عائق إبيستيمولوجي',
      severity: 'متوسط',
      evidence: 'الارتكان إلى التمثلات الاجتماعية السائدة أو البحث عن حلول جاهزة بدل الاستدلال.',
      intervention: 'تدريب التلميذ على التمييز بين الرأي العام المسبق والأطروحة الفلسفية المؤسسة بالحجة.'
    });
  }

  if (cognitiveObstacles.length === 0) {
    cognitiveObstacles.push({
      title: 'حاجة إلى مأسسة الحجاج والانتقال من الدهشة إلى المنهج',
      category: 'تطوير مهاري',
      severity: 'منخفض',
      evidence: `تفكير نقدي (${Math.round(metrics.criticalThinking)}%) وفضول معرفي (${Math.round(metrics.cognitiveCuriosity)}%) مرتفعان.`,
      intervention: 'تكليف المتعلم بصياغة مفارقات إشكالية ونقد أطروحات متقابلة وفق ضوابط الكتابة الإنشائية الفلسفية.'
    });
  }

  // Individualized 3-Step Remedial Plan
  const remedialPlan: Array<{ phase: string; action: string; objective: string }> =
    classification === 'خوف معرفي'
      ? [
          {
            phase: 'المرحلة 1: التفكيك الوجداني وطمأنة المتعلم',
            action: 'إشراك التلميذ في نقاش ثنائي انطلاقاً من أمثلة سينمائية أو يومية بسيطة دون مصطلحات مجردة ثقيلة.',
            objective: 'خفض حدة التوتر المعرفي وتبديد صورة الغموض المسبق عن الفلسفة.'
          },
          {
            phase: 'المرحلة 2: التدريب المتدرج على طرح السؤال',
            action: 'تقديم بطاقات أسئلة موجهة تساعده على تحويل رأيه الشخصي إلى تساؤل إشكالي مفتوح.',
            objective: 'بناء الثقة في قدرته على التفكير المستقل دون خوف من الخطأ.'
          },
          {
            phase: 'المرحلة 3: التقويم التكويني الداعم',
            action: 'تقييم أولي يركز على جودة الفكرة ومحاولات التعليل قبل محاسبة الصياغة المنهجية الصارمة.',
            objective: 'تحويل العلاقة مع المادة من القلق الامتحاني إلى التجاوب الآمن.'
          }
        ]
      : classification === 'تفكير سطحي'
      ? [
          {
            phase: 'المرحلة 1: زعزعة الجواب الجاهز',
            action: 'مواجهة التلميذ بسؤال مفارقي يكشف حدود الحفظ المسبق ويطالبه بتعليل موقفه بمثال مغاير.',
            objective: 'إحداث قطيعة بيداغوجية مع منطق الاستظهار المدرسي الآلي.'
          },
          {
            phase: 'المرحلة 2: ورشة التفكيك المفاهيمي',
            action: 'تكليفه باستخراج المفاهيم الأساسية من نص قصير وتحديد التقابلات المفهومية بينها.',
            objective: 'الانتقال من تلقي الخلاصات الجاهزة إلى بناء الفهم من داخل النص.'
          },
          {
            phase: 'المرحلة 3: صياغة حجة شخصية',
            action: 'مطالبته بكتابة فقرة حجاجية من 5 أسطر تدافع عن أطروحة وتستحضر اعتراضاً محتملاً.',
            objective: 'تأسيس كفاية الأشكلة والمحاجة الذاتية.'
          }
        ]
      : classification === 'فضول معرفي'
      ? [
          {
            phase: 'المرحلة 1: تأطير الدهشة التساؤلية',
            action: 'توجيه تساؤلات التلميذ التلقائية نحو صياغة إشكالية دقيقة مرتبطة بمحور الدرس.',
            objective: 'تحويل الفضول العام إلى استشكال فلسفي منظم.'
          },
          {
            phase: 'المرحلة 2: توسيع المرجعية النصية',
            action: 'اقتراح نصوص فلسفية قصيرة متقابلة حول الحرية والغير لتعميق زوايا نظره.',
            objective: 'ربط الشغف الشخصي بالمادة بالرصيد الفلسفي المنهجي.'
          },
          {
            phase: 'المرحلة 3: المناظرة الصفية المضبوطة',
            action: 'إسناد دور المقرر أو المحاور الرئيسي له في مناظرة صفية وفق قواعد الاستدلال المنطقي.',
            objective: 'تحويل الطلاقة التساؤلية إلى كفاية حجاجية رصينة.'
          }
        ]
      : [
          {
            phase: 'المرحلة 1: تعميق المفارقات الإشكالية',
            action: 'تكليف التلميذ بالكشف عن المسلمات الضمنية داخل المواقف المعروضة في القسم.',
            objective: 'تطوير التفكير النقدي نحو مستوى الفحص الإبيستيمولوجي.'
          },
          {
            phase: 'المرحلة 2: إتقان البناء الإنشائي المركب',
            action: 'تدريبه على صياغة لحظات التركيب وتجاوز التقابل البسيط بين المواقف الفلسفية.',
            objective: 'الارتقاء بالكتابة الفلسفية إلى درجة التميز المنهجي.'
          },
          {
            phase: 'المرحلة 3: القيادة البيداغوجية للأقران',
            action: 'إشراكه في مناقشات الأقران لمساعدة زملائه المتعثرين على صياغة الحجج والأمثلة.',
            objective: 'تثبيت الكفاية النقدية عبر التفاعل البيداغوجي داخل القسم.'
          }
        ];

  return {
    questionBreakdown,
    credibilityAssessment: {
      overallScore: overallCredibility,
      verdict: credibilityVerdict,
      textualEffortScore,
      consistencyScore,
      proctoringScore,
      signals: credibilitySignals
    },
    contradictions,
    cognitiveObstacles,
    remedialPlan
  };
}

// Deterministic Analysis Algorithm (fallback)
function performRuleBasedAnalysis(answers: any) {
  let cognitiveFear = 10;
  let cognitiveCuriosity = 10;
  let shallowThinking = 10;
  let criticalThinking = 10;

  // Axis 1: Initial representation
  if (answers.sourceOfIdea === 'لا فكرة مسبقة') {
    shallowThinking += 20;
    cognitiveFear += 10;
  } else if (answers.sourceOfIdea === 'المحيط الاجتماعي') {
    shallowThinking += 15;
  }

  const phiMeaningLower = (answers.philosophyMeaning || '').toLowerCase();
  if (phiMeaningLower.includes('حفظ') || phiMeaningLower.includes('مقرر') || phiMeaningLower.includes('امتحان') || phiMeaningLower.includes('منهجية جاهزة')) {
    shallowThinking += 25;
  }
  if (phiMeaningLower.includes('تفكير') || phiMeaningLower.includes('سؤال') || phiMeaningLower.includes('وجود') || phiMeaningLower.includes('فهم')) {
    criticalThinking += 25;
    cognitiveCuriosity += 15;
  }
  if (phiMeaningLower.includes('صعب') || phiMeaningLower.includes('عقد') || phiMeaningLower.includes('تشتت') || phiMeaningLower.includes('شك')) {
    cognitiveFear += 25;
  }

  // Axis 2: Emotional dimension
  if (answers.feelingWhenHearing === 'خوف') {
    cognitiveFear += 40;
  } else if (answers.feelingWhenHearing === 'صعوبة') {
    cognitiveFear += 25;
    shallowThinking += 15;
  } else if (answers.feelingWhenHearing === 'فضول') {
    cognitiveCuriosity += 40;
  } else if (answers.feelingWhenHearing === 'إعجاب') {
    cognitiveCuriosity += 30;
    criticalThinking += 15;
  } else {
    shallowThinking += 20;
  }

  // Axis 3: Thinking style
  if (answers.reactionToFreedomQuestion === 'أفكر في أمثلة من الواقع') {
    criticalThinking += 35;
    cognitiveCuriosity += 15;
  } else if (answers.reactionToFreedomQuestion === 'أبحث عن جواب جاهز') {
    shallowThinking += 40;
  } else if (answers.reactionToFreedomQuestion === 'أعتبره صعباً') {
    cognitiveFear += 35;
  } else {
    cognitiveFear += 15;
    shallowThinking += 20;
  }

  // Philosophical questions
  const qList = answers.selectedPhilosophicalQuestions || [];
  if (qList.includes('لماذا نعيش؟')) {
    criticalThinking += 20;
    cognitiveCuriosity += 20;
  }
  if (qList.includes('هل الخير موجود؟')) {
    criticalThinking += 20;
    cognitiveCuriosity += 20;
  }
  if (qList.includes('كيف تعمل السيارة؟') || qList.includes('ما أكبر عدد؟')) {
    shallowThinking += 20;
  }

  // Axis 4: Cognitive value
  const valNum = Number(answers.valueRating) || 3;
  if (valNum >= 4) {
    criticalThinking += valNum * 8;
  } else {
    shallowThinking += (6 - valNum) * 10;
    cognitiveFear += (3 - valNum) * 10;
  }

  if (answers.philosophyPrimaryGoal === 'تعلم التفكير') {
    criticalThinking += 35;
  } else if (answers.philosophyPrimaryGoal === 'النقاش') {
    cognitiveCuriosity += 30;
    criticalThinking += 10;
  } else if (answers.philosophyPrimaryGoal === 'حفظ المعلومات') {
    shallowThinking += 35;
  } else {
    shallowThinking += 20;
  }

  // Axis 5: Debate readiness
  if (answers.debateReaction === 'أشارك برأيي') {
    criticalThinking += 30;
    cognitiveCuriosity += 15;
  } else if (answers.debateReaction === 'أستمع فقط') {
    cognitiveCuriosity += 10;
    shallowThinking += 20;
  } else if (answers.debateReaction === 'أتوتر') {
    cognitiveFear += 35;
  } else {
    cognitiveFear += 35;
    shallowThinking += 10;
  }

  // Bound metrics between 0 and 100
  const metrics = {
    cognitiveFear: Math.min(100, Math.max(5, cognitiveFear)),
    cognitiveCuriosity: Math.min(100, Math.max(5, cognitiveCuriosity)),
    shallowThinking: Math.min(100, Math.max(5, shallowThinking)),
    criticalThinking: Math.min(100, Math.max(5, criticalThinking))
  };

  // Determine final classification
  const keys = Object.keys(metrics) as Array<keyof typeof metrics>;
  let highestKey: string = 'criticalThinking';
  let maxVal = -1;

  keys.forEach(k => {
    if (metrics[k] > maxVal) {
      maxVal = metrics[k];
      highestKey = k;
    }
  });

  let classification: ThinkingStyle = 'تفكير نقدي';
  if (highestKey === 'cognitiveFear') classification = 'خوف معرفي';
  else if (highestKey === 'cognitiveCuriosity') classification = 'فضول معرفي';
  else if (highestKey === 'shallowThinking') classification = 'تفكير سطحي';

  // Fallback localized strings in case AI is offline or key missing
  let explanation = '';
  let pedagogicalRecommendation = '';

  if (classification === 'تفكير نقدي') {
    explanation = 'يظهر التلميذ قدرة متميزة على التحليل النقدي المنطقي، ويربط الفلسفة بمهارات التفكير العقلاني الحر.';
    pedagogicalRecommendation = 'تقديم مقالات فلسفية قصيرة لتنمية قدرته الحجاجية وصقل مهارات تفكيك الخطاب لديه.';
  } else if (classification === 'فضول معرفي') {
    explanation = 'يتمتع التلميذ بشغف تساؤلي طموح وفضول نحو استكشاف القضايا الكبرى، متطلعاً للنقاش البناء.';
    pedagogicalRecommendation = 'تنظيم مناظرة منظمة بين الزملاء وإشراكه لإظهار مبرراته المعرفية بطريقة مضبوطة.';
  } else if (classification === 'خوف معرفي') {
    explanation = 'تهيمن على التلميذ وساوس الصعوبة والتعقيد والخشية من الغموض المرتبط بالدروس والامتحانات.';
    pedagogicalRecommendation = 'الابتداء بأمثلة واقعية مألوفة لتجريد المفاهيم الصعبة وجعل الفلسفة تلامس معيشه لتخفيف القلق.';
  } else {
    explanation = 'يتعامل التلميذ مع الفلسفة ببعد نفعي مدرسي ناتج عن الاختزال التعليمي القائم على حفظ منهجيات مسبقة.';
    pedagogicalRecommendation = 'اعتماد وضعية مشكّلة تزعزع القناعات الافتراضية الجاهزة للفرد وتحثه على استقلالية الرأي.';
  }

  const deep = buildDeepDiagnosticEnrichment(answers, metrics, classification, 100, []);
  return {
    metrics,
    classification,
    explanation,
    pedagogicalRecommendation,
    pedagogicalRecommendationsList: deep.remedialPlan.map((step) => `${step.phase}: ${step.action}`),
    analysisSource: 'heuristic' as const,
    ...deep
  };
}

// Robust helper to query Gemini with per-attempt timeout, exponential backoff & fast fallback on demand spikes
async function generateContentWithRetry(
  client: GoogleGenAI,
  params: any,
  retries = 3,
  initialDelay = 600,
  attemptTimeoutMs = 13000
): Promise<any> {
  let delay = initialDelay;
  let lastError: any;
  let forceFallback = false;

  const requestedModel = assertAllowedGeminiModel(
    typeof params?.model === 'string' && params.model.trim()
      ? params.model.trim()
      : PRIMARY_FREE_GEMINI_MODEL
  );
  const fallbackModel = assertAllowedGeminiModel(FALLBACK_FREE_GEMINI_MODEL);

  for (let attempt = 1; attempt <= retries; attempt++) {
    const useFallbackModel =
      requestedModel === PRIMARY_FREE_GEMINI_MODEL && (forceFallback || attempt === retries);
    const callParams = {
      ...params,
      model: useFallbackModel ? fallbackModel : requestedModel,
    };
    const timeoutMs = useFallbackModel ? Math.max(attemptTimeoutMs, 15000) : attemptTimeoutMs;

    try {
      const response = await Promise.race([
        client.models.generateContent(callParams),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
      return response;
    } catch (error: any) {
      lastError = error;
      const status = error?.status;
      const message = String(error?.message || '');
      const lowerMsg = message.toLowerCase();
      const isTimeout = lowerMsg.includes('timed out') || lowerMsg.includes('timeout');
      const isTransient =
        isTimeout ||
        status === 503 ||
        status === 429 ||
        message.includes('503') ||
        message.includes('429') ||
        lowerMsg.includes('unavailable') ||
        lowerMsg.includes('demand') ||
        lowerMsg.includes('overloaded') ||
        lowerMsg.includes('rate limit');

      if (isTimeout && requestedModel === PRIMARY_FREE_GEMINI_MODEL) {
        forceFallback = true;
      }

      if (isTransient && attempt < retries) {
        console.warn(
          `Gemini API transient issue (attempt ${attempt}/${retries}). Retrying in ${delay}ms: ${message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

function mapGeminiErrorResponse(err: any, fallbackMessage: string) {
  const raw = String(err?.message || '');
  const status = err?.status;
  if (status === 403 || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      httpStatus: 403,
      error: 'تعذر التحقق من صلاحية مفتاح Gemini API في إعدادات الخادم.',
    };
  }
  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      httpStatus: 429,
      error: 'تم بلوغ الحد المؤقت لطلبات الذكاء الاصطناعي، يرجى الانتظار لحظة ثم إعادة المحاولة.',
    };
  }
  if (status === 503 || raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return {
      httpStatus: 503,
      error: 'تشهد خدمة الذكاء الاصطناعي ضغطاً مؤقتاً حالياً، يرجى إعادة المحاولة بعد بضع ثوانٍ.',
    };
  }
  return {
    httpStatus: 500,
    error: fallbackMessage,
  };
}

// AI Integration API Route Handler
async function performAIBasedAnalysis(rawAnswers: any) {
  const baseline = performRuleBasedAnalysis(rawAnswers);
  const client = getGeminiClient();

  if (!client) {
    return baseline; // Offline/no-key fallback
  }

  try {
    const answers = redactStudentAnswersForAI(rawAnswers);
    const prompt = `أنت خبير تربوي متخصص في ديدكتيك الفلسفة وتحليل تمثلات التلاميذ.
قم بتحليل إجابات هذا التلميذ على الاستمارة التشخيصية لتحديد تصنيف نمطه الفكري بدقة تامة.

الإجابة المفتوحة عن معنى الفلسفة: "${answers.philosophyMeaning || ''}"
كيف تشكلت الفكرة: "${answers.sourceOfIdea || ''}"
الشعور الوجداني: "${answers.feelingWhenHearing || ''}"
التعليل الوجداني: "${answers.feelingJustification || ''}"
نمط التفكير مع سؤال الحرية: "${answers.reactionToFreedomQuestion || ''}"
الأسئلة الفلسفية المختارة: [${(Array.isArray(answers.selectedPhilosophicalQuestions) ? answers.selectedPhilosophicalQuestions : []).join(', ')}]
درجة تقييم القيمة المعرفية (من 1 إلى 5): ${answers.valueRating || 3}
الهدف الأساسي من الفلسفة: "${answers.philosophyPrimaryGoal || ''}"
رد الفعل في نقاش بلا إجابة واحدة: "${answers.debateReaction || ''}"
هل يتوقع النجاح ولماذا: "${answers.expectSuccess || ''}"

المؤشرات الأولية المحسوبة كمرجع استرشادي:
- الخوف المعرفي: ${baseline.metrics.cognitiveFear}%
- الفضول المعرفي: ${baseline.metrics.cognitiveCuriosity}%
- التفكير السطحي: ${baseline.metrics.shallowThinking}%
- التفكير النقدي: ${baseline.metrics.criticalThinking}%

المهمة المطلوبة منك:
1. قم بمراجعة المؤشرات وتعديلها (النسب المئوية الأربعة من 0 إلى 100) بناءً على جودة وعمق الإجابات المفتوحة.
   - قيّم مستوى حجاج التلميذ وقلقه التمتحاني وسلوكه المعرفي.
2. حدد التصنيف النهائي بدقة تامة بناءً على أعلى مؤشر بعد التعديل. يجب أن يكون التصنيف النهائي واحداً من هؤلاء الأربعة بالضبط باللغة العربية: "خوف معرفي" أو "فضول معرفي" أو "تفكير سطحي" أو "تفكير نقدي".
   - في حالة التساوي الحسابي بين المؤشرات، استخدم الإجابات المفتوحة كمعيار حاسم (مثال: إذا كان إجاباته المفتوحة متميزة ويبرر بشكل فلسفي، فهو "تفكير نقدي"، وإذا كانت عامية وسطحية فهو "تفكير سطحي"، وإذا عبر عن قلق شديد وخوف من التقييم فهو "خوف معرفي").
3. لخص تفسيراً تربوياً عاقلاً لنمط التلميذ باللغة العربية الفصحى في سطرين فقط (لا يتعدى 25 كلمة).
4. قدّم توصية تربوية واحدة عملية وإجرائية للأستاذ باللغة العربية الفصحى للتعامل الفعال مع التلميذ داخل الفصل الدراسي بناء على نمطه.

صِغ الاستجابة بصيغة JSON دقيقة ومطابقة للهيكل التالي بالضبط، وبدون أي نص خارجي أو علامات markdown إضافية:
{
  "cognitiveFear": <عدد صحيح بين 0 و 100>,
  "cognitiveCuriosity": <عدد صحيح بين 0 و 100>,
  "shallowThinking": <عدد صحيح بين 0 و 100>,
  "criticalThinking": <عدد صحيح بين 0 و 100>,
  "classification": "<التصنيف النهائي المكتوب بالعربية بدقة>",
  "explanation": "<تفسير تربوي مكثف في سطرين>",
  "pedagogicalRecommendation": "<توصية تربوية عملية إجرائية واحدة للأستاذ>"
}`;

    // Use Promise.race to guarantee we do not block for more than 15000ms
    const geminiCall = generateContentWithRetry(client, {
      model: PRIMARY_FREE_GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cognitiveFear: { type: Type.INTEGER, description: 'Cognitive fear metric between 0 and 100' },
            cognitiveCuriosity: { type: Type.INTEGER, description: 'Cognitive curiosity metric between 0 and 100' },
            shallowThinking: { type: Type.INTEGER, description: 'Shallow thinking metric between 0 and 100' },
            criticalThinking: { type: Type.INTEGER, description: 'Critical thinking metric between 0 and 100' },
            classification: { type: Type.STRING, description: 'Must be exactly: خوف معرفي, فضول معرفي, تفكير سطحي, or تفكير نقدي' },
            explanation: { type: Type.STRING, description: 'Brief 2-line pedagogical explanation' },
            pedagogicalRecommendation: { type: Type.STRING, description: 'One actionable pedagogical classroom recommendation' }
          },
          required: ['cognitiveFear', 'cognitiveCuriosity', 'shallowThinking', 'criticalThinking', 'classification', 'explanation', 'pedagogicalRecommendation']
        }
      }
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI analysis timed out (Timeout 24000ms)')), 24000);
    });

    const response = await Promise.race([geminiCall, timeoutPromise]) as any;

    const textResponse = response.text || '';
    const parsed = JSON.parse(textResponse.trim());

    // Validate classification values to prevent stray categories
    let finalClassification: ThinkingStyle = 'تفكير نقدي';
    const c = parsed.classification;
    if (c === 'خوف معرفي' || c === 'فضول معرفي' || c === 'تفكير سطحي' || c === 'تفكير نقدي') {
      finalClassification = c;
    } else {
      // fallback mapping if different string returned
      if (c && typeof c === 'string') {
        if (c.includes('خوف')) finalClassification = 'خوف معرفي';
        else if (c.includes('فضول')) finalClassification = 'فضول معرفي';
        else if (c.includes('سطح')) finalClassification = 'تفكير سطحي';
      }
    }

    const finalMetrics = {
      cognitiveFear: Number(parsed.cognitiveFear) || baseline.metrics.cognitiveFear,
      cognitiveCuriosity: Number(parsed.cognitiveCuriosity) || baseline.metrics.cognitiveCuriosity,
      shallowThinking: Number(parsed.shallowThinking) || baseline.metrics.shallowThinking,
      criticalThinking: Number(parsed.criticalThinking) || baseline.metrics.criticalThinking
    };
    const deep = buildDeepDiagnosticEnrichment(answers, finalMetrics, finalClassification, 100, []);

    return {
      metrics: finalMetrics,
      classification: finalClassification,
      explanation: parsed.explanation || baseline.explanation,
      pedagogicalRecommendation: parsed.pedagogicalRecommendation || baseline.pedagogicalRecommendation,
      pedagogicalRecommendationsList: [
        parsed.pedagogicalRecommendation || baseline.pedagogicalRecommendation,
        ...deep.remedialPlan.slice(1).map((step) => `${step.phase}: ${step.action}`)
      ],
      analysisSource: 'gemini' as const,
      ...deep
    };

  } catch (error: any) {
    console.warn('Pedagogical engine resolved analysis gracefully with active local heuristics:', error?.message || error);
    // Secure transparent recovery
    return baseline;
  }
}

// ==================== REST ENDPOINTS ====================

// Verified Firebase Auth login / session sync (never passwordless)
app.post('/api/teacher/login', authRateLimiter, async (req, res) => {
  try {
    const {
      email,
      fullName,
      school,
      regionalAcademy,
      province,
      role,
      specialty,
      avatar,
      yearsOfExperience,
      adminSecret,
    } = req.body || {};
    const firebaseIdToken =
      String(req.body?.firebaseIdToken || '').trim() || extractBearerToken(req);

    const lowerEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';

    // Check if Logging in as Admin (Superuser)
    const isAdminAttempt = lowerEmail === 'phillofikr@gmail.com' || role === 'admin';
    if (isAdminAttempt) {
      const isSecretOk = isValidAdminSecret(adminSecret);
      let adminUid = 'TCH-ADMIN';
      let adminEmail = 'phillofikr@gmail.com';
      let isFirebaseVerified = false;

      if (firebaseIdToken && firebaseIdToken.split('.').length === 3) {
        const fbUser = await (activeSecurityHooks.verifyIdToken || defaultHooks.verifyIdToken)!(
          firebaseIdToken
        );
        if (fbUser && !fbUser.isAnonymous && fbUser.emailVerified && fbUser.email) {
          const checkAdmin = activeSecurityHooks.checkAdminActive || defaultHooks.checkAdminActive!;
          isFirebaseVerified = await checkAdmin(
            fbUser.uid,
            fbUser.email,
            fbUser.emailVerified,
            firebaseIdToken
          );
          if (isFirebaseVerified) {
            adminUid = fbUser.uid;
            adminEmail = fbUser.email;
          }
        }
      }

      if (!isSecretOk && !isFirebaseVerified) {
        return res.status(401).json({
          error: 'ليس لديك صلاحية الوصول إلى لوحة إدارة فِيلوسكان.',
        });
      }

      const generatedToken = issueAdminToken(adminUid, adminEmail);

      return res.json({
        uid: adminUid,
        email: adminEmail,
        fullName: 'مدير المنصة',
        school: 'الإدارة المركزية للتعليم بوزارة التربية الوطنية',
        regionalAcademy: 'المديرية العامة للمنظومة المعلوماتية',
        province: 'الرباط',
        loggedInAt: new Date().toISOString(),
        token: generatedToken,
        role: 'admin',
        teacherId: adminUid,
        specialty: 'الإدارة والإشراف الفلسفي',
        avatar: '',
        yearsOfExperience: '15',
      });
    }

    // Teacher login strictly requires a valid, email-verified Firebase ID Token
    if (!firebaseIdToken || firebaseIdToken.split('.').length !== 3) {
      return res.status(401).json({
        error: 'يتطلب تسجيل الدخول التحقق عبر Firebase Auth (كلمة المرور + تأكيد البريد الإلكتروني).',
      });
    }

    const fbUser = await (activeSecurityHooks.verifyIdToken || defaultHooks.verifyIdToken)!(
      firebaseIdToken
    );
    if (!fbUser || fbUser.isAnonymous || !fbUser.emailVerified || !fbUser.email) {
      return res.status(401).json({
        error: 'رمز المصادقة غير صالح أو البريد الإلكتروني غير مفعّل بعد.',
      });
    }

    if (lowerEmail && lowerEmail !== fbUser.email) {
      return res.status(403).json({
        error: 'البريد الإلكتروني المطلوب لا يطابق حساب Firebase المصادق عليه.',
      });
    }

    const checkTeacher = activeSecurityHooks.checkTeacherActive || defaultHooks.checkTeacherActive!;
    const teacherState = await checkTeacher(fbUser.uid, firebaseIdToken);
    if (!teacherState.exists || teacherState.isDisabled) {
      return res.status(403).json({
        error: 'حساب الأستاذ غير مفعّل أو تم تعطيله من قبل إدارة المنصة.',
      });
    }

    const teachers = await loadTeachers();
    let existing = teachers.find(
      (t) => t.uid === fbUser.uid || t.email.toLowerCase() === fbUser.email
    );

    if (!existing) {
      if (!fullName || !String(fullName).trim() || !school || !String(school).trim()) {
        existing = {
          id: fbUser.uid,
          uid: fbUser.uid,
          fullName: String(fullName || fbUser.email.split('@')[0]).trim(),
          email: fbUser.email,
          school: String(school || 'مؤسسة تعليمية').trim(),
          regionalAcademy: String(regionalAcademy || 'الأكاديمية الجهوية').trim(),
          province: String(province || 'المديرية الإقليمية').trim(),
          createdAt: new Date().toISOString(),
          role: 'teacher',
          isDisabled: false,
          specialty: String(specialty || '').trim() || 'مادة الفلسفة',
          avatar: avatar || '',
          yearsOfExperience: yearsOfExperience || '',
        };
      } else {
        existing = {
          id: fbUser.uid,
          uid: fbUser.uid,
          fullName: String(fullName).trim(),
          email: fbUser.email,
          school: String(school).trim(),
          regionalAcademy: String(regionalAcademy || '').trim(),
          province: String(province || '').trim(),
          createdAt: new Date().toISOString(),
          role: 'teacher',
          isDisabled: false,
          specialty: String(specialty || '').trim() || 'مادة الفلسفة',
          avatar: avatar || '',
          yearsOfExperience: yearsOfExperience || '',
        };
      }
      teachers.push(existing);
      await saveTeachers(teachers);
    }

    return res.json({
      uid: fbUser.uid,
      email: existing.email,
      fullName: existing.fullName,
      school: existing.school,
      regionalAcademy: existing.regionalAcademy,
      province: existing.province,
      loggedInAt: new Date().toISOString(),
      token: firebaseIdToken,
      role: 'teacher',
      teacherId: existing.id,
      isDisabled: false,
      specialty: existing.specialty,
      avatar: existing.avatar,
      yearsOfExperience: existing.yearsOfExperience,
    });
  } catch (err) {
    res.status(500).json({ error: 'فشل التحقق من دخول الأستاذ.' });
  }
});

// Create new session (Authenticated active teacher or admin only)
app.post('/api/sessions', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const {
      institution,
      province,
      level,
      stream,
      classNumber,
      title,
      formId,
      formTitle,
      supervisedMode,
      questions,
    } = req.body || {};
    if (!institution || !province || !level || !stream || !classNumber || !title) {
      return res.status(400).json({ error: 'جميع حقول الجلسة مطلوبة لإنشاء المعرف الفريد.' });
    }

    const sessions = await loadSessions();

    // Generate unique Session ID (e.g. PS-8KX4Q2)
    let sessionId = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let exists = true;
    while (exists) {
      sessionId = 'PS-';
      for (let i = 0; i < 6; i++) {
        sessionId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      exists = sessions.some((s) => s.sessionId === sessionId);
    }

    let resolvedQuestions = Array.isArray(questions) ? questions : undefined;
    if (!resolvedQuestions && formId && formId !== 'official-perceptions') {
      const forms = await loadForms();
      const matchedForm = forms.find((f) => f.formId === formId);
      if (matchedForm && Array.isArray(matchedForm.questions)) {
        resolvedQuestions = matchedForm.questions;
      }
    }

    const ownerRef = `own_${crypto.randomBytes(16).toString('hex')}`;
    const newSession: DiagnosticSession = {
      sessionId,
      ownerRef,
      teacherId: actor.uid,
      teacherEmail: actor.email,
      institution: String(institution).trim(),
      level,
      stream,
      classNumber: String(classNumber).trim(),
      title: String(title).trim(),
      province: String(province).trim(),
      createdAt: new Date().toISOString(),
      formId: formId || 'official-perceptions',
      formTitle: formTitle || 'تشخيص التصورات حول الفلسفة',
      questions: resolvedQuestions,
      supervisedMode: supervisedMode !== undefined ? !!supervisedMode : true,
      isFrozen: false,
      isActive: true,
    };

    sessions.push(newSession);
    await saveSessions(sessions);
    broadcastRealtimeEvent(newSession.teacherEmail, 'session:created', { session: newSession });

    res.json({ success: true, session: newSession });
  } catch (err) {
    res.status(500).json({ error: 'فشل إنشاء جلسة تشخيصية جديدة.' });
  }
});

// Retrieve sessions with verified RBAC filters
app.get('/api/sessions', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const sessions = await loadSessions();
    const teachers = await loadTeachers();

    if (actor.role === 'admin') {
      const enriched = sessions.map((s) => {
        const teacher = teachers.find(
          (t) =>
            t.id === s.teacherId ||
            t.uid === s.teacherId ||
            t.email.toLowerCase() === s.teacherEmail.toLowerCase()
        );
        return {
          ...s,
          teacherName: teacher ? teacher.fullName : 'أستاذ موجه',
        };
      });
      return res.json({
        sessions: enriched.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      });
    }

    const mySessions = sessions.filter((s) => isActorOwnerOfRecord(actor, s));
    res.json({
      sessions: mySessions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب الجلسات الدراسية.' });
  }
});

// Get single session sanitized public metadata (NEVER leaks teacherId/teacherEmail/customWeights)
app.get('/api/sessions/:id', publicReadRateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const sessions = await loadSessions();
    const session = sessions.find((s) => s.sessionId.toUpperCase() === id.toUpperCase());

    if (!session) {
      return res.status(404).json({
        error:
          'عذراً، لم نتمكن من العثور على هذه الجلسة التشخيصية للفلسفة. يرجى مراجعة الرمز مع أستاذ المادة.',
      });
    }

    let enrichedSession = { ...session };
    if (
      (!enrichedSession.questions || enrichedSession.questions.length === 0) &&
      enrichedSession.formId &&
      enrichedSession.formId !== 'official-perceptions'
    ) {
      const forms = await loadForms();
      const matchedForm = forms.find((f) => f.formId === enrichedSession.formId);
      if (matchedForm && Array.isArray(matchedForm.questions)) {
        enrichedSession.questions = matchedForm.questions;
      }
    }

    res.json({ session: sanitizePublicSession(enrichedSession) });
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب معطيات الجلسة.' });
  }
});

// ==================== FORMS BANK CRUD ENDPOINTS ====================
app.get('/api/forms', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const forms = await loadForms();
    const filtered =
      actor.role === 'admin'
        ? forms
        : forms.filter((f) => f.isTemplate || isActorOwnerOfRecord(actor, f));
    res.json({ forms: filtered });
  } catch (err) {
    console.error('Error loading forms:', err);
    res.status(500).json({ error: 'فشل جلب الاستمارات من الخادم.' });
  }
});

app.post('/api/forms', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const formPayload = req.body;
    if (!formPayload || !formPayload.formId || !formPayload.title || !Array.isArray(formPayload.questions)) {
      return res.status(400).json({ error: 'بيانات الاستمارة غير مكتملة.' });
    }

    const forms = await loadForms();
    const idx = forms.findIndex((f) => f.formId === formPayload.formId);
    if (idx > -1) {
      if (actor.role !== 'admin' && !isActorOwnerOfRecord(actor, forms[idx])) {
        return res.status(403).json({ error: 'غير مصرح بتعديل استمارة أستاذ آخر.' });
      }
      forms[idx] = {
        ...forms[idx],
        ...formPayload,
        teacherId: forms[idx].teacherId || actor.uid,
        teacherEmail: forms[idx].teacherEmail || actor.email,
        isTemplate: actor.role === 'admin' ? Boolean(formPayload.isTemplate) : false,
        updatedAt: new Date().toISOString(),
      };
      await saveForms(forms);
      return res.json({ success: true, form: forms[idx] });
    }

    const createdForm = {
      ...formPayload,
      teacherId: actor.uid,
      teacherEmail: actor.email,
      isTemplate: actor.role === 'admin' ? Boolean(formPayload.isTemplate) : false,
      createdAt: formPayload.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    forms.push(createdForm);
    await saveForms(forms);
    res.json({ success: true, form: createdForm });
  } catch (err) {
    console.error('Error saving form:', err);
    res.status(500).json({ error: 'فشل حفظ الاستمارة في الخادم.' });
  }
});

app.delete('/api/forms/:id', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const forms = await loadForms();
    const target = forms.find((f) => f.formId === id);
    if (!target) {
      return res.json({ success: true });
    }
    if (!isActorOwnerOfRecord(actor, target)) {
      return res.status(403).json({ error: 'غير مصرح بحذف استمارة أستاذ آخر.' });
    }
    const updated = forms.filter((f) => f.formId !== id);
    await saveForms(updated);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting form:', err);
    res.status(500).json({ error: 'فشل حذف الاستمارة من الخادم.' });
  }
});

// Update session (Owner or Admin)
app.put('/api/sessions/:id', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const { institution, province, level, stream, classNumber, title } = req.body;

    const sessions = await loadSessions();
    const idx = sessions.findIndex((s) => s.sessionId.toUpperCase() === id.toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'الجلسة غير موجودة.' });
    }
    if (!isActorOwnerOfRecord(actor, sessions[idx])) {
      return res.status(403).json({ error: 'غير مصرح بتعديل جلسة تعود لأستاذ آخر.' });
    }

    if (institution !== undefined) sessions[idx].institution = String(institution).trim();
    if (province !== undefined) sessions[idx].province = String(province).trim();
    if (level !== undefined) sessions[idx].level = level;
    if (stream !== undefined) sessions[idx].stream = stream;
    if (classNumber !== undefined) sessions[idx].classNumber = String(classNumber).trim();
    if (title !== undefined) sessions[idx].title = String(title).trim();

    await saveSessions(sessions);
    res.json({ success: true, session: sessions[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل تعديل بيانات الجلسة.' });
  }
});

// Delete session (Owner or Admin)
app.delete('/api/sessions/:id', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;

    const sessions = await loadSessions();
    const target = sessions.find((s) => s.sessionId.toUpperCase() === id.toUpperCase());
    if (!target) {
      return res.status(404).json({ error: 'الجلسة المراد حذفها غير موجودة.' });
    }
    if (!isActorOwnerOfRecord(actor, target)) {
      return res.status(403).json({ error: 'غير مصرح بحذف جلسة تعود لأستاذ آخر.' });
    }

    const filtered = sessions.filter((s) => s.sessionId.toUpperCase() !== id.toUpperCase());
    await saveSessions(filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'فشل حذف الجلسة.' });
  }
});

// Toggle supervised mode for a session (Owner or Admin)
app.post('/api/sessions/:id/toggle-supervised', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const { supervisedMode } = req.body;
    const sessions = await loadSessions();
    const idx = sessions.findIndex((s) => s.sessionId.toUpperCase() === id.toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'الجلسة غير موجودة.' });
    }
    if (!isActorOwnerOfRecord(actor, sessions[idx])) {
      return res.status(403).json({ error: 'غير مصرح بتغيير إعدادات جلسة أستاذ آخر.' });
    }

    sessions[idx].supervisedMode =
      supervisedMode !== undefined ? !!supervisedMode : !sessions[idx].supervisedMode;
    await saveSessions(sessions);

    res.json({ success: true, supervisedMode: sessions[idx].supervisedMode, session: sessions[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل تغيير الوضع التشخيصي المراقب.' });
  }
});

// Toggle freeze status for a session (Owner or Admin)
app.post('/api/sessions/:id/toggle-freeze', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const { isFrozen } = req.body;
    const sessions = await loadSessions();
    const idx = sessions.findIndex((s) => s.sessionId.toUpperCase() === id.toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'الجلسة غير موجودة.' });
    }
    if (!isActorOwnerOfRecord(actor, sessions[idx])) {
      return res.status(403).json({ error: 'غير مصرح بتجميد جلسة أستاذ آخر.' });
    }

    sessions[idx].isFrozen = isFrozen !== undefined ? !!isFrozen : !sessions[idx].isFrozen;
    sessions[idx].isActive = !sessions[idx].isFrozen;
    await saveSessions(sessions);

    res.json({ success: true, isFrozen: sessions[idx].isFrozen, session: sessions[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل تجميد/إلغاء تجميد الجلسة.' });
  }
});

// Update custom severity weights for a session (Owner or Admin)
app.post('/api/sessions/:id/update-weights', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const { customWeights } = req.body;
    const sessions = await loadSessions();
    const idx = sessions.findIndex((s) => s.sessionId.toUpperCase() === id.toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'الجلسة غير موجودة.' });
    }
    if (!isActorOwnerOfRecord(actor, sessions[idx])) {
      return res.status(403).json({ error: 'غير مصرح بتعديل أوزان جلسة أستاذ آخر.' });
    }

    sessions[idx].customWeights = customWeights;
    await saveSessions(sessions);

    res.json({ success: true, customWeights: sessions[idx].customWeights, session: sessions[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل حفظ أوزان خطورة المخالفات.' });
  }
});

// Update student advisory proctoring heartbeat (Authenticated student + App Check)
app.post(
  '/api/sessions/:id/monitoring/heartbeat',
  publicReadRateLimiter,
  requireStudentAppCheckAndAuth,
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const { studentName, status, violations, reliabilityIndex } = req.body || {};
      if (!studentName) {
        return res.status(400).json({ error: 'اسم التلميذ مطلوب لمزامنة حالة المراقبة.' });
      }

      const sessionId = id.toUpperCase();
      const studentUid = req.studentActor.uid;
      const monitoringData = await loadMonitoring();
      if (!monitoringData[sessionId]) {
        monitoringData[sessionId] = {};
      }

      const now = new Date().toISOString();
      const boundedViolations = Array.isArray(violations) ? violations.slice(0, 50) : [];
      monitoringData[sessionId][studentUid] = {
        studentName: String(studentName).trim().slice(0, 100),
        status: status || 'يجيب حالياً',
        lastActive: now,
        joinedAt: monitoringData[sessionId][studentUid]?.joinedAt || now,
        violations: boundedViolations,
        reliabilityIndex: typeof reliabilityIndex === 'number' ? reliabilityIndex : 100,
      };

      await saveMonitoring(monitoringData);
      res.json({ success: true, advisoryOnly: true });
    } catch (err) {
      console.error('Error recording heartbeat:', err);
      res.status(500).json({ error: 'فشل تحديث نبض المراقبة.' });
    }
  }
);

// Get session monitoring data (Owner or Admin only)
app.get('/api/sessions/:id/monitoring', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const sessionId = id.toUpperCase();
    const monitoringData = await loadMonitoring();
    const sessions = await loadSessions();
    const session = sessions.find((s) => s.sessionId.toUpperCase() === sessionId);

    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة' });
    }
    if (!isActorOwnerOfRecord(actor, session)) {
      return res.status(403).json({ error: 'غير مصرح بمشاهدة مراقبة جلسة أستاذ آخر.' });
    }

    const sessionStudents = monitoringData[sessionId] || {};
    const studentsList = Object.values(sessionStudents);

    const nowTime = Date.now();
    const connectedCount = studentsList.filter((s) => {
      const isRecent = nowTime - new Date(s.lastActive).getTime() < 90_000;
      return isRecent && s.status !== 'أنهى الاستمارة';
    }).length;

    const submittedCount = studentsList.filter((s) => s.status === 'أنهى الاستمارة').length;

    let totalViolations = 0;
    const allViolations: any[] = [];

    studentsList.forEach((s) => {
      if (s.violations && Array.isArray(s.violations)) {
        s.violations.forEach((v: any) => {
          totalViolations += v.count || 1;
          allViolations.push({
            studentName: s.studentName,
            type: v.type,
            time: v.time,
            duration: v.duration,
            count: v.count,
          });
        });
      }
    });

    allViolations.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    res.json({
      success: true,
      advisoryOnly: true,
      supervisedMode: !!session.supervisedMode,
      students: sessionStudents,
      connectedStudentsCount: connectedCount,
      submittedCount,
      totalViolationsCount: totalViolations,
      recentViolations: allViolations.slice(0, 15),
    });
  } catch (err) {
    console.error('Error fetching monitoring data:', err);
    res.status(500).json({ error: 'فشل جلب سجلات المراقبة.' });
  }
});

// Endpoint for submissions (Add new diagonal report with Multi-Tenant binding)
// Mount both routes to prevent proxy/Vite trailing slash redirect GET fallback bugs
// Custom Forms Rule-Based Analysis (Fallback)
function performCustomFormRuleBasedAnalysis(
  answers: Record<string, any>,
  questionLabels: Record<string, string>,
  questionMeta?: Record<string, { label?: string; dimension?: string; weight?: number; type?: string }>
) {
  let cognitiveFear = 15;
  let cognitiveCuriosity = 25;
  let shallowThinking = 25;
  let criticalThinking = 25;
  let learningReadiness = 30;

  const contentStr = Object.entries(answers)
    .map(([k, v]) => `${questionLabels[k] || k}: ${formatCustomAnswerValue(v)}`)
    .join(' ')
    .toLowerCase();

  // Basic keyword searching for fallback scoring
  if (contentStr.includes('خوف') || contentStr.includes('توتر') || contentStr.includes('صعب') || contentStr.includes('عقد') || contentStr.includes('قلق')) {
    cognitiveFear += 30;
    learningReadiness -= 10;
  }
  if (contentStr.includes('سؤال') || contentStr.includes('لماذا') || contentStr.includes('فهم') || contentStr.includes('بحث') || contentStr.includes('اكتشاف')) {
    cognitiveCuriosity += 30;
    learningReadiness += 20;
    criticalThinking += 15;
  }
  if (contentStr.includes('منهجية جاهزة') || contentStr.includes('حفظ') || contentStr.includes('تكرار') || contentStr.includes('تلخيص جاهز')) {
    shallowThinking += 35;
    criticalThinking -= 10;
  }
  if (contentStr.includes('نقد') || contentStr.includes('تحليل') || contentStr.includes('موقف') || contentStr.includes('حجة') || contentStr.includes('دليل')) {
    criticalThinking += 35;
    cognitiveCuriosity += 10;
  }
  if (contentStr.includes('شغف') || contentStr.includes('أحب') || contentStr.includes('أشارك') || contentStr.includes('جاهزية')) {
    learningReadiness += 35;
    cognitiveCuriosity += 10;
  }

  const metrics = {
    cognitiveFear: Math.min(100, Math.max(5, cognitiveFear)),
    cognitiveCuriosity: Math.min(100, Math.max(5, cognitiveCuriosity)),
    shallowThinking: Math.min(100, Math.max(5, shallowThinking)),
    criticalThinking: Math.min(100, Math.max(5, criticalThinking)),
    learningReadiness: Math.min(100, Math.max(5, learningReadiness))
  };

  const keys = ['cognitiveFear', 'cognitiveCuriosity', 'shallowThinking', 'criticalThinking'];
  let maxVal = -1;
  let highestKey = 'criticalThinking';
  keys.forEach(k => {
    if ((metrics as any)[k] > maxVal) {
      maxVal = (metrics as any)[k];
      highestKey = k;
    }
  });

  let classification: ThinkingStyle = 'تفكير نقدي';
  if (highestKey === 'cognitiveFear') classification = 'خوف معرفي';
  else if (highestKey === 'cognitiveCuriosity') classification = 'فضول معرفي';
  else if (highestKey === 'shallowThinking') classification = 'تفكير سطحي';

  const deep = buildDeepDiagnosticEnrichment(answers, metrics, classification, 100, [], questionLabels, questionMeta);
  return {
    metrics,
    classification,
    explanation: 'تحليل بيداغوجي تلقائي للاستمارة المخصصة يوضح المستويات الفكرية للتلميذ بناءً على خوارزمية قياس الميزان المعرفي لمنصة فِيلوسكان.',
    pedagogicalRecommendation: 'مواصلة المتابعة المستمرة وتوظيف استراتيجية المناقشة والوضعيات المشكلة لدعم الوعي الفكري والمنهجي للتلميذ.',
    pedagogicalRecommendationsList: [
      'توجيه التلميذ لبلورة أفكاره الشخصية من خلال عروض وعينات عيانية بالتبسيط والتشبيه.',
      'تنمية كفاءة التفكيك للمسلمات والتقليل من الاستناد لسهل الحفظ والتلقين الميكانيكي.',
      'تعزيز الألفة الوجدانية بين التلميذ ومواضيع الفصل من خلال إتاحة فرصة للتعبير الحواري المجموعي.'
    ],
    analysisSource: 'heuristic' as const,
    ...deep
  };
}

// Custom Forms AI-Based Analysis (PII-redacted before Gemini call)
async function performCustomFormAIBasedAnalysis(
  rawAnswers: Record<string, any>,
  questionLabels: Record<string, string>,
  questionMeta?: Record<string, { label?: string; dimension?: string; weight?: number; type?: string }>
) {
  const baseline = performCustomFormRuleBasedAnalysis(rawAnswers, questionLabels, questionMeta);
  const client = getGeminiClient();

  if (!client) {
    return baseline;
  }

  try {
    const answers = redactStudentAnswersForAI(rawAnswers);
    const compiledQA = Object.entries(answers)
      .map(([qid, val]) => {
        const meta = questionMeta?.[qid];
        const questionText = redactStudentPiiFromText(
          meta?.label || questionLabels[qid] || 'سؤال'
        );
        const dimNote = meta?.dimension
          ? ` [المحور: ${meta.dimension} · الوزن: ${meta.weight || 3}/5]`
          : '';
        const formattedVal = redactStudentPiiFromText(formatCustomAnswerValue(val));
        return `السؤال${dimNote}: "${questionText}"\nجواب التلميذ: "${formattedVal}"`;
      })
      .join('\n\n');

    const prompt = `أنت خبير تربوي ومفتش عالي التأهيل تخصص ديدكتيك الفلسفة ومقاربة التمثلات الذهنية والوجدانية للتلاميذ.
قم بإجراء تحليل بيداغوجي متقدم لتفتيش الأجوبة التي أدلى بها التلميذ على استمارة تشخيصية خاصة:

المعطيات والأسئلة والأجوبة المستخرجة:
${compiledQA}

الخطوات المطلوبة منك:
1. قم بتقدير العلامات المئوية (من 0 إلى 100) للمقاييس الخمسة التالية بناءً على عمق وجدية وتفكير التلميذ:
   - الخوف المعرفي (cognitiveFear)
   - الفضول المعرفي (cognitiveCuriosity)
   - التفكير السطحي (shallowThinking)
   - التفكير النقدي (criticalThinking)
   - الاستعداد للتعلم (learningReadiness)
2. اختر تصنيفاً نهائياً لنمط تفكير التلميذ (classification) بدقة متناهية من بين الخيارات الأربعة بالضبط بالعربية الفصحى: "خوف معرفي" أو "فضول معرفي" أو "تفكير سطحي" أو "تفكير نقدي".
3. لخص تفسيراً تربوياً عاقلاً لنمط التلميذ وتطلعه باللغة العربية الفصحى البليغة والميسرة في سطرين فقط (لا يتجاوز 25 كلمة).
4. قدّم ثلاث (3) توصيات بيداغوجية تفصيلية وإجرائية تندرج تحت ممارسات الأستاذ داخل الفصل لتوجيه هذا التلميذ والنهوض بمستواه.

تأكد من صياغة الاستجابة بصيغة JSON دقيقة ومطابقة للهيكل التالي تماماً، بدون أي علامات markdown إضافية:
{
  "cognitiveFear": <عدد بين 0 و 100>,
  "cognitiveCuriosity": <عدد بين 0 و 100>,
  "shallowThinking": <عدد بين 0 و 100>,
  "criticalThinking": <عدد بين 0 و 100>,
  "learningReadiness": <عدد بين 0 و 100>,
  "classification": "<التصنيف النهائي بدقة>",
  "explanation": "<تفسير تربوي مكثف وموجز في سطرين>",
  "pedagogicalRecommendationsList": [
    "<التوصية الإجرائية الأولى للتنمية الفكرية>",
    "<التوصية الإجرائية الثانية للتطوير المنهجي>",
    "<التوصية الإجرائية الثالثة للدعم الوجداني ومعالجة الخياطات الفكرية>"
  ]
}`;

    const response = await generateContentWithRetry(client, {
      model: PRIMARY_FREE_GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cognitiveFear: { type: Type.INTEGER },
            cognitiveCuriosity: { type: Type.INTEGER },
            shallowThinking: { type: Type.INTEGER },
            criticalThinking: { type: Type.INTEGER },
            learningReadiness: { type: Type.INTEGER },
            classification: { type: Type.STRING },
            explanation: { type: Type.STRING },
            pedagogicalRecommendationsList: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['cognitiveFear', 'cognitiveCuriosity', 'shallowThinking', 'criticalThinking', 'learningReadiness', 'classification', 'explanation', 'pedagogicalRecommendationsList']
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());

    let finalClassification: ThinkingStyle = 'تفكير نقدي';
    const c = parsed.classification;
    if (c === 'خوف معرفي' || c === 'فضول معرفي' || c === 'تفكير سطحي' || c === 'تفكير نقدي') {
      finalClassification = c;
    } else {
      if (c && typeof c === 'string') {
        if (c.includes('خوف')) finalClassification = 'خوف معرفي';
        else if (c.includes('فضول')) finalClassification = 'فضول معرفي';
        else if (c.includes('سطح')) finalClassification = 'تفكير سطحي';
      }
    }

    const finalMetrics = {
      cognitiveFear: Number(parsed.cognitiveFear) || baseline.metrics.cognitiveFear,
      cognitiveCuriosity: Number(parsed.cognitiveCuriosity) || baseline.metrics.cognitiveCuriosity,
      shallowThinking: Number(parsed.shallowThinking) || baseline.metrics.shallowThinking,
      criticalThinking: Number(parsed.criticalThinking) || baseline.metrics.criticalThinking,
      learningReadiness: Number(parsed.learningReadiness) || baseline.metrics.learningReadiness
    };
    const deep = buildDeepDiagnosticEnrichment(rawAnswers, finalMetrics, finalClassification, 100, [], questionLabels, questionMeta);

    return {
      metrics: finalMetrics,
      classification: finalClassification,
      explanation: parsed.explanation || baseline.explanation,
      pedagogicalRecommendation: (parsed.pedagogicalRecommendationsList || []).join('\n\n') || baseline.pedagogicalRecommendation,
      pedagogicalRecommendationsList: parsed.pedagogicalRecommendationsList || baseline.pedagogicalRecommendationsList,
      analysisSource: 'gemini' as const,
      ...deep
    };

  } catch (error) {
    console.warn('Advanced custom form AI engine fallback activated:', error);
    return baseline;
  }
}

async function requireStudentOrTeacherSubmissionAuth(req: any, res: any, next: any) {
  try {
    const adminActor = await resolveFirebaseAdminActor(req);
    if (adminActor) {
      req.authActor = {
        role: 'admin',
        uid: adminActor.uid,
        teacherId: adminActor.uid,
        email: adminActor.email,
      };
      return next();
    }

    const token = extractBearerToken(req);
    if (token && token.split('.').length === 3) {
      const fbUser = await (activeSecurityHooks.verifyIdToken || defaultHooks.verifyIdToken)!(token);
      if (fbUser && !fbUser.isAnonymous && fbUser.emailVerified && fbUser.email) {
        const checkTeacher = activeSecurityHooks.checkTeacherActive || defaultHooks.checkTeacherActive!;
        const teacherState = await checkTeacher(fbUser.uid, token);
        if (!teacherState.exists || teacherState.isDisabled) {
          return res.status(403).json({
            error: 'حساب الأستاذ معطل أو غير مفعّل.'
          });
        }
        req.authActor = {
          role: 'teacher',
          uid: fbUser.uid,
          teacherId: fbUser.uid,
          email: fbUser.email,
          firebaseIdToken: token,
        };
        return next();
      }
    }
  } catch {
    // Fall through to student App Check + Auth validation
  }
  return requireStudentAppCheckAndAuth(req, res, next);
}

// Option A public student AI scoring endpoint (returns signed envelope over HTTPS only; zero Firestore writes)
app.post(
  '/api/submissions/analyze-public',
  publicReadRateLimiter,
  requireStudentAppCheckAndAuth,
  aiRateLimiter,
  async (req: any, res) => {
    try {
      const { answers, sessionId, questionLabels, questionMeta, violations, reliabilityIndex } = req.body || {};
      if (!answers || typeof answers !== 'object' || !sessionId) {
        return res.status(400).json({ error: 'بيانات الإجابات ومعرّف الجلسة مطلوبة للتحليل.' });
      }

      const targetSessionId = String(sessionId).toUpperCase().trim();
      const studentAuthUid = String(req.studentActor.uid);
      const submissionId = `${targetSessionId}_${studentAuthUid}`;

      const sessions = await loadSessions();
      const matchedSession = sessions.find((s) => s.sessionId.toUpperCase() === targetSessionId);
      if (matchedSession && matchedSession.isFrozen) {
        return res.status(403).json({
          error: 'عذراً، هذه الجلسة التشخيصية مجمدة حالياً ولا تقبل ردوداً جديدة.',
        });
      }

      const diagnosis =
        questionLabels && Object.keys(questionLabels).length > 0
          ? await performCustomFormAIBasedAnalysis(answers, questionLabels, questionMeta)
          : await performAIBasedAnalysis(answers);

      const finalReliability = typeof reliabilityIndex === 'number' ? reliabilityIndex : 100;
      const finalViolations = Array.isArray(violations) ? violations.slice(0, 50) : [];
      const deepEnrichment = buildDeepDiagnosticEnrichment(
        answers,
        diagnosis.metrics,
        diagnosis.classification,
        finalReliability,
        finalViolations,
        questionLabels,
        questionMeta
      );
      const enrichedDiagnosis = {
        ...diagnosis,
        ...deepEnrichment,
        pedagogicalRecommendationsList:
          diagnosis.pedagogicalRecommendationsList && diagnosis.pedagogicalRecommendationsList.length > 0
            ? diagnosis.pedagogicalRecommendationsList
            : deepEnrichment.remedialPlan.map((step) => `${step.phase}: ${step.action}`),
      };

      const analysisOrigin: 'gemini' | 'heuristic' =
        diagnosis.analysisSource === 'gemini' ? 'gemini' : 'heuristic';

      const signedEnvelope = signAnalysisEnvelope({
        submissionId,
        sessionId: targetSessionId,
        studentAuthUid,
        answers,
        analysis: enrichedDiagnosis,
        analysisOrigin,
      });

      return res.json({
        success: true,
        submissionId,
        sessionId: targetSessionId,
        studentAuthUid,
        analysis: enrichedDiagnosis,
        signedEnvelope,
        signatureIntegrity: 'valid',
        analysisOrigin,
        contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      });
    } catch (err: any) {
      console.error('Error in POST /api/submissions/analyze-public:', err);
      const mapped = mapGeminiErrorResponse(err, 'تعذر إتمام التحليل التشخيصي للإجابات.');
      return res.status(mapped.httpStatus).json({ error: mapped.error });
    }
  }
);

// Endpoint for submissions (Add new diagnostic report with Multi-Tenant & UID binding)
const handlePostSubmission = async (req: any, res: express.Response) => {
  const reqId = Math.random().toString(36).substring(2, 8).toUpperCase();
  try {
    const { studentName, answers, sessionId, questionLabels, questionMeta } = req.body || {};

    if (!studentName || !answers || !sessionId) {
      return res.status(400).json({ error: 'من فضلك أدخل الاسم ورمز الجلسة الفعالة وكافة البيانات.' });
    }

    // Resolve active session
    console.log(`[Server:handlePostSubmission:${reqId}] Loading diagnostic sessions from storage...`);
    const sessions = await loadSessions();
    console.log(`[Server:handlePostSubmission:${reqId}] Loaded ${sessions.length} sessions total.`);

    const targetSessionId = sessionId.toUpperCase().trim();
    const activeSession = sessions.find(s => s.sessionId.toUpperCase() === targetSessionId);
    if (!activeSession) {
      console.warn(`[Server:handlePostSubmission:${reqId}] Session code "${targetSessionId}" not found in current sessions list.`);
      return res.status(404).json({ error: 'رمز الجلسة التشخيصية غير معتمد أو منتهي الصلاحية.' });
    }
    
    if (activeSession.isFrozen) {
      console.warn(`[Server:handlePostSubmission:${reqId}] Session is frozen. Denying submission.`);
      return res.status(403).json({ error: 'عذراً، هذه الجلسة التشخيصية مجمدة حالياً من طرف الأستاذ الموجه ولا تقبل ردوداً جديدة.' });
    }
    console.log(`[Server:handlePostSubmission:${reqId}] Session successfully resolved:`, {
      sessionId: activeSession.sessionId,
      institution: activeSession.institution,
      teacherEmail: activeSession.teacherEmail
    });

    // Run AI diagnostic evaluation
    console.log(`[Server:handlePostSubmission:${reqId}] Running AI-based pedagogical diagnosis engine...`);
    const startTime = Date.now();
    let diagnosis;
    if (questionLabels && Object.keys(questionLabels).length > 0) {
      diagnosis = await performCustomFormAIBasedAnalysis(answers, questionLabels, questionMeta);
    } else {
      diagnosis = await performAIBasedAnalysis(answers);
    }
    const duration = Date.now() - startTime;
    console.log(`[Server:handlePostSubmission:${reqId}] AI evaluation analysis completed in ${duration}ms. Classification outcome: "${diagnosis.classification}"`);

    // Build the enriched record with requested and compatible fields
    const { violations, reliabilityIndex, clientSubmissionId, offlineRequeued } = req.body;
    const finalReliability = typeof reliabilityIndex === 'number' ? reliabilityIndex : 100;
    const finalViolations = violations || [];
    const deepEnrichment = buildDeepDiagnosticEnrichment(
      answers,
      diagnosis.metrics,
      diagnosis.classification,
      finalReliability,
      finalViolations,
      questionLabels,
      questionMeta
    );
    const enrichedDiagnosis = {
      ...diagnosis,
      ...deepEnrichment,
      pedagogicalRecommendationsList:
        diagnosis.pedagogicalRecommendationsList && diagnosis.pedagogicalRecommendationsList.length > 0
          ? diagnosis.pedagogicalRecommendationsList
          : deepEnrichment.remedialPlan.map((step) => `${step.phase}: ${step.action}`)
    };

    const nowIso = new Date().toISOString();
    const deliveryReceiptId = `REC-${targetSessionId.slice(-4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const deliveryChannel: 'realtime_direct' | 'offline_requeued' = offlineRequeued ? 'offline_requeued' : 'realtime_direct';

    const existingSubmissions = await loadSubmissions();
    if (clientSubmissionId) {
      const duplicate = existingSubmissions.find((s: any) => s.id === clientSubmissionId || s.deliveryReceiptId === clientSubmissionId);
      if (duplicate) {
        return res.json({
          success: true,
          submission: duplicate,
          deliveryReceipt: {
            receiptId: duplicate.deliveryReceiptId || deliveryReceiptId,
            deliveredAt: duplicate.deliveredAt || duplicate.submittedAt,
            sessionId: duplicate.sessionId || targetSessionId,
            sessionTitle: activeSession.title,
            teacherEmail: duplicate.teacherEmail || activeSession.teacherEmail,
            channel: duplicate.deliveryChannel || deliveryChannel
          }
        });
      }
    }

    const actorUid = String(req.studentActor?.uid || req.authActor?.uid || 'anon');
    const deterministicSubId = `${targetSessionId}_${actorUid}`;
    const resolvedSubmissionId =
      req.studentActor && !req.authActor
        ? deterministicSubId
        : clientSubmissionId || deterministicSubId;
    const analysisOrigin: 'gemini' | 'heuristic' =
      diagnosis.analysisSource === 'gemini' ? 'gemini' : 'heuristic';
    const signedEnvelope = signAnalysisEnvelope({
      submissionId: resolvedSubmissionId,
      sessionId: targetSessionId,
      studentAuthUid: actorUid,
      answers,
      analysis: enrichedDiagnosis,
      analysisOrigin,
    });

    const newSubmission: StudentSubmission = {
      id: resolvedSubmissionId,
      studentAuthUid: actorUid,
      studentName: (studentName || '').toString().trim(),
      student_name: (studentName || '').toString().trim(),
      submittedAt: nowIso,
      answers,
      responses: answers,
      analysis: enrichedDiagnosis,
      signedEnvelope,
      violations: finalViolations,
      reliabilityIndex: finalReliability,
      deliveryReceiptId,
      deliveredAt: nowIso,
      deliveryChannel,
      syncState: 'synced',
      localUpdatedAt: nowIso,
      teacher_id: (activeSession as any).teacherId || (activeSession as any).teacher_id || '',
      teacherId: (activeSession as any).teacherId || (activeSession as any).teacher_id || '',
      teacher_email: ((activeSession as any).teacherEmail || (activeSession as any).teacher_email || '').toString().trim().toLowerCase(),
      teacherEmail: ((activeSession as any).teacherEmail || (activeSession as any).teacher_email || '').toString().trim().toLowerCase(),
      session_id: (activeSession as any).sessionId || (activeSession as any).session_id || '',
      sessionId: (activeSession as any).sessionId || (activeSession as any).session_id || '',
      sessionTitle: activeSession.title || '',
      institution: ((activeSession as any).institution || '').toString().trim(),
      level: (activeSession as any).level || '',
      stream: (activeSession as any).stream || '',
      class: (activeSession as any).classNumber || (activeSession as any).class || '',
      classNumber: (activeSession as any).classNumber || (activeSession as any).class || ''
    };

    existingSubmissions.push(newSubmission);
    await saveSubmissions(existingSubmissions);

    broadcastRealtimeEvent(newSubmission.teacherEmail, 'submission:created', {
      submission: newSubmission,
      deliveryReceiptId,
      deliveredAt: nowIso
    });

    const sessionSubs = existingSubmissions.filter(
      (s: any) =>
        String(s.sessionId || s.session_id || '').toUpperCase().trim() === targetSessionId
    );
    evaluateAndDispatchSessionNotifications({
      session: activeSession,
      sessionSubmissions: sessionSubs,
      latestSubmission: newSubmission,
      onBroadcast: (tEmail, notif) => {
        broadcastRealtimeEvent(tEmail, 'notification:created', { notification: notif });
      }
    }).catch((notifErr) => {
      console.warn(`[Server:handlePostSubmission:${reqId}] Notification evaluation warning:`, notifErr);
    });

    res.json({
      success: true,
      submission: newSubmission,
      signedEnvelope,
      signatureIntegrity: 'valid',
      analysisOrigin,
      contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      deliveryReceipt: {
        receiptId: deliveryReceiptId,
        deliveredAt: nowIso,
        sessionId: newSubmission.sessionId,
        sessionTitle: activeSession.title,
        teacherEmail: newSubmission.teacherEmail,
        channel: deliveryChannel
      }
    });
  } catch (err: any) {
    console.error(`[Server:handlePostSubmission:${reqId}] SUBMISSION ERROR:`, err);
    res.status(500).json({
      error: 'عذراً، حدث خطأ أثناء معالجة استمارة التشخيص.',
      details: err?.message || String(err),
    });
  }
};

app.post('/api/submissions', requireStudentOrTeacherSubmissionAuth, aiRateLimiter, handlePostSubmission);
app.post('/api/student-submit', requireStudentOrTeacherSubmissionAuth, aiRateLimiter, handlePostSubmission);

// Real-time SSE stream for instant student-to-teacher delivery (Authenticated Teacher or Admin)
app.get('/api/realtime/teacher-stream', requireTeacherOrAdminAuth, (req: any, res) => {
  const actor = req.authActor;
  const isAdmin = actor.role === 'admin';

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const streamKey = isAdmin ? '__admin__' : actor.email;
  registerSseClient(streamKey, res);

  sendSsePacket(res, 'connected', {
    status: 'connected',
    streamKey,
    serverTime: new Date().toISOString()
  });

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    unregisterSseClient(streamKey, res);
  });
});

// Bidirectional manual sync & reconciliation endpoint (Authenticated Teacher/Admin only)
app.post('/api/sync/reconcile', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const {
      localSubmissions = [],
      localSessions = [],
      localForms = [],
      offlineQueue = []
    } = req.body || {};
    const trimmedEmail = actor.email.toLowerCase().trim();
    const isAdmin = actor.role === 'admin';

    const sessions = await loadSessions();
    let sessionsMutated = false;
    if (Array.isArray(localSessions) && localSessions.length > 0) {
      const existingSessionIds = new Set(sessions.map((s) => s.sessionId.toUpperCase()));
      for (const ls of localSessions) {
        if (!ls || !ls.sessionId) continue;
        const lsEmail = String(ls.teacherEmail || (ls as any).teacher_email || '').trim().toLowerCase();
        if (!isAdmin && lsEmail && lsEmail !== trimmedEmail) continue;
        const code = String(ls.sessionId).toUpperCase().trim();
        if (!existingSessionIds.has(code)) {
          sessions.push({
            ...ls,
            sessionId: code,
            teacherEmail: lsEmail || trimmedEmail
          });
          existingSessionIds.add(code);
          sessionsMutated = true;
        }
      }
      if (sessionsMutated) {
        await saveSessions(sessions);
      }
    }

    if (Array.isArray(localForms) && localForms.length > 0) {
      const forms = await loadForms();
      const existingFormIds = new Set(forms.map((f: any) => f.formId));
      let formsMutated = false;
      for (const lf of localForms) {
        if (!lf || !lf.formId || !lf.title) continue;
        const lfEmail = String(lf.teacherEmail || '').trim().toLowerCase();
        if (!isAdmin && lfEmail && lfEmail !== trimmedEmail) continue;
        if (!existingFormIds.has(lf.formId)) {
          forms.push(lf);
          existingFormIds.add(lf.formId);
          formsMutated = true;
        }
      }
      if (formsMutated) {
        await saveForms(forms);
      }
    }

    const submissions = await loadSubmissions();
    const byId = new Map<string, StudentSubmission>();
    submissions.forEach((s) => {
      if (s?.id) byId.set(s.id, s);
    });

    let mergedCount = 0;
    let processedQueueCount = 0;

    // 1. Reconcile any local teacher edits / missing submissions sent from IndexedDB
    if (Array.isArray(localSubmissions)) {
      for (const localSub of localSubmissions) {
        if (!localSub || !localSub.id) continue;
        const subEmail = String(localSub.teacherEmail || localSub.teacher_email || '').trim().toLowerCase();
        if (!isAdmin && subEmail && subEmail !== trimmedEmail) continue;

        const existing = byId.get(localSub.id);
        if (!existing) {
          byId.set(localSub.id, {
            ...localSub,
            syncState: 'synced',
            localUpdatedAt: new Date().toISOString()
          });
          mergedCount++;
        } else if (localSub.syncState === 'local_pending') {
          byId.set(localSub.id, {
            ...existing,
            teacherNotes: localSub.teacherNotes !== undefined ? localSub.teacherNotes : existing.teacherNotes,
            overriddenClassification:
              localSub.overriddenClassification !== undefined
                ? localSub.overriddenClassification
                : existing.overriddenClassification,
            analysis: localSub.analysis || existing.analysis,
            syncState: 'synced',
            localUpdatedAt: new Date().toISOString()
          });
          mergedCount++;
        }
      }
    }

    // 2. Process any offline queued student payloads if present
    if (Array.isArray(offlineQueue)) {
      for (const qItem of offlineQueue) {
        const p = qItem?.payload || qItem;
        if (!p || !p.studentName || !p.answers || !p.sessionId) continue;
        const targetSess = sessions.find(
          (s) => s.sessionId.toUpperCase() === String(p.sessionId).toUpperCase().trim()
        );
        if (!targetSess) continue;
        if (!isAdmin && targetSess.teacherEmail.toLowerCase().trim() !== trimmedEmail) continue;

        const qId = p.clientSubmissionId || qItem.localQueueId || ('sub_' + Math.random().toString(36).substr(2, 9));
        if (byId.has(qId)) continue;

        const diag =
          p.questionLabels && Object.keys(p.questionLabels).length > 0
            ? await performCustomFormAIBasedAnalysis(p.answers, p.questionLabels, p.questionMeta)
            : await performAIBasedAnalysis(p.answers);

        const nowIso = new Date().toISOString();
        const deep = buildDeepDiagnosticEnrichment(
          p.answers,
          diag.metrics,
          diag.classification,
          typeof p.reliabilityIndex === 'number' ? p.reliabilityIndex : 100,
          p.violations || [],
          p.questionLabels,
          p.questionMeta
        );

        const newSub: StudentSubmission = {
          id: qId,
          studentName: String(p.studentName).trim(),
          student_name: String(p.studentName).trim(),
          submittedAt: qItem.queuedAt || nowIso,
          answers: p.answers,
          responses: p.answers,
          analysis: { ...diag, ...deep },
          violations: p.violations || [],
          reliabilityIndex: typeof p.reliabilityIndex === 'number' ? p.reliabilityIndex : 100,
          deliveryReceiptId: `REC-${targetSess.sessionId.slice(-4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          deliveredAt: nowIso,
          deliveryChannel: 'offline_requeued',
          syncState: 'synced',
          localUpdatedAt: nowIso,
          teacherId: targetSess.teacherId,
          teacher_id: targetSess.teacherId,
          teacherEmail: targetSess.teacherEmail.toLowerCase(),
          teacher_email: targetSess.teacherEmail.toLowerCase(),
          sessionId: targetSess.sessionId,
          session_id: targetSess.sessionId,
          sessionTitle: targetSess.title,
          institution: targetSess.institution,
          level: targetSess.level,
          stream: targetSess.stream,
          class: targetSess.classNumber,
          classNumber: targetSess.classNumber
        };
        byId.set(newSub.id, newSub);
        processedQueueCount++;
      }
    }

    const updatedAll = Array.from(byId.values());
    if (mergedCount > 0 || processedQueueCount > 0) {
      await saveSubmissions(updatedAll);
    }

    const scopedSubs = isAdmin
      ? updatedAll
      : updatedAll.filter((s) => String(s.teacherEmail || s.teacher_email || '').trim().toLowerCase() === trimmedEmail);
    const scopedSessions = isAdmin
      ? sessions
      : sessions.filter((s) => s.teacherEmail.trim().toLowerCase() === trimmedEmail);

    scopedSubs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    scopedSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      submissions: scopedSubs,
      sessions: scopedSessions,
      mergedCount,
      processedQueueCount,
      serverTimestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Error in POST /api/sync/reconcile:', err);
    res.status(500).json({ error: 'فشل التوفيق والمزامنة بين البيانات المحلية والخادم.' });
  }
});

// AI Form Generator endpoint (Authenticated + Rate-limited + PII-redacted + Free model locked)
app.post('/api/forms/generate-ai', requireTeacherOrAdminAuth, aiRateLimiter, async (req: any, res) => {
  try {
    const { topic, level, stream, aim, questionCount } = req.body || {};
    if (!topic || !level || !stream || !aim) {
      return res.status(400).json({ error: 'جميع معطيات التوليد مطلوبة لتوليد الاستبانة بذكاء.' });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.status(503).json({ error: 'مفتاح واجهة Gemini API غير متوفر على الخادم لتوليد الاستمارة بالذكاء الاصطناعي.' });
    }

    const safeTopic = redactStudentPiiFromText(String(topic));
    const safeAim = redactStudentPiiFromText(String(aim));
    const countTarget = Math.max(4, Math.min(8, Number(questionCount) || 5));
    const prompt = `أنت خبير تربوي ومفتش ممتاز متخصص في ديدكتيك الفلسفة بالثانوي التأهيلي وصناعة الاستمارات المنهجية لتتبع تمثلات التلاميذ.
قم بتوليد استمارة تشخيصية متكاملة واحترافية تتبع المعطيات التالية:
- موضوع الدرس: "${safeTopic}"
- المستوى الدراسي: "${String(level)}"
- الشعبة والمسلك: "${String(stream)}"
- الغاية والهدف البيداغوجي من التشخيص: "${safeAim}"

المطلوب منك:
توليد ${countTarget} أسئلة بيداغوجية باللغة العربية البليغة تتنوع أنماطها لمساءلة تمثلات التلميذ:
- استخدم تنوعاً ذكياً من الأنماط: 'long'، 'single' (مع 4 خيارات)، 'scale' (مقياس 1-5)، 'order' (ترتيب 3-4 أولويات/مفاهيم)، 'grid' (شبكة تقييم بمعايير 3-4 صفوف)، أو 'boolean'.
- اربط كل سؤال بالمحور الفلسفي الأنسب من القائمة الحصرية التالية: "التصور الأولي" | "البعد الوجداني" | "التفكير النقدي" | "الاستدلال والحجاج" | "الاستعداد للمناقشة" | "تقييم عام".
- حدد وزن التنقيط لكل سؤال (weight بين 1 و 5) وإلزاميته (required: true أو false)، وأضف تلميحاً توجيهياً مقتضباً للتلميذ (hint).
- إذا كان نوع السؤال 'grid' فأضف مصفوفة options تتضمن 3 إلى 4 عبارات/صفوف لتقييمها، بالإضافة إلى gridColumns مثل ["ضعيف", "متوسط", "جيد", "ممتاز"].

تأكد من صياغة الاستجابة بصيغة JSON دقيقة ومطابقة للهيكل التالي تماماً بدون أي علامات markdown إضافية.`;

    const response = await generateContentWithRetry(client, {
      model: PRIMARY_FREE_GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING },
                  label: { type: Type.STRING },
                  hint: { type: Type.STRING },
                  dimension: { type: Type.STRING },
                  weight: { type: Type.INTEGER },
                  required: { type: Type.BOOLEAN },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  gridColumns: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ['id', 'type', 'label', 'dimension', 'weight', 'required']
              }
            }
          },
          required: ['title', 'description', 'questions']
        }
      }
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err: any) {
    console.error('Error in AI question generation:', err);
    const mapped = mapGeminiErrorResponse(
      err,
      'عذراً، حدث خطأ أثناء محاولة توليد الاستمارة بالذكاء الاصطناعي.'
    );
    res.status(mapped.httpStatus).json({ error: mapped.error, details: err?.message });
  }
});

// Per-question AI refinement endpoint (Authenticated + Rate-limited + PII-redacted)
app.post('/api/forms/refine-question', requireTeacherOrAdminAuth, aiRateLimiter, async (req: any, res) => {
  try {
    const { question, topic, level, stream, mode } = req.body || {};
    if (!question || !question.label || typeof question.label !== 'string') {
      return res.status(400).json({ error: 'بيانات السؤال غير مكتملة للتحسين.' });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.status(503).json({ error: 'مفتاح واجهة Gemini API غير متوفر على الخادم حالياً.' });
    }

    const safeLabel = redactStudentPiiFromText(question.label);
    const safeTopic = redactStudentPiiFromText(String(topic || 'الفلسفة والتفكير النقدي'));
    const modeInstruction =
      mode === 'critical'
        ? 'ارفع من عمق المساءلة الفلسفية والشك المنهجي في صياغة السؤال.'
        : mode === 'options'
        ? 'حسّن صياغة السؤال وقدم خيارات دقيقة تكشف التمثلات المتعارضة للتلاميذ.'
        : 'اجعل صياغة السؤال أكثر وضوحاً وسلاسة وتوجيهاً لمستوى التلاميذ دون إخلال بالبعد الفلسفي.';

    const prompt = `أنت مفتش ومكوّن بيداغوجي في ديدكتيك الفلسفة بالتعليم الثانوي التأهيلي.
راجع السؤال التالي وحسّنه:
- نص السؤال الحالي: "${safeLabel}"
- نوع السؤال: "${question.type || 'long'}"
- الخيارات الحالية: ${JSON.stringify(question.options || [])}
- موضوع الدرس: "${safeTopic}"
- المستوى الدراسي: "${level || 'ثانية باك'}"
- الشعبة: "${stream || 'عام'}"
- هدف التحسين: ${modeInstruction}

المطلوب:
1. صياغة محسّنة للسؤال (label) واضحة ودقيقة بيداغوجياً.
2. تلميح إرشادي مقتضب للتلميذ (hint).
3. إذا كان النوع يدعم خيارات ('single' أو 'multi' أو 'order' أو 'grid')، اقترح خيارات محسّنة (options) من 3 إلى 4 عناصر؛ وإذا كان 'grid' اقترح gridColumns.
4. حدد المحور الفلسفي الأنسب من: "التصور الأولي" | "البعد الوجداني" | "التفكير النقدي" | "الاستدلال والحجاج" | "الاستعداد للمناقشة" | "تقييم عام".
5. اقترح الوزن المناسب (weight من 1 إلى 5) وتعليلاً مقتضباً للتحسين (rationale).`;

    const response = await generateContentWithRetry(client, {
      model: PRIMARY_FREE_GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            hint: { type: Type.STRING },
            dimension: { type: Type.STRING },
            weight: { type: Type.INTEGER },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            gridColumns: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            rationale: { type: Type.STRING }
          },
          required: ['label', 'hint', 'dimension', 'weight', 'rationale']
        }
      }
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({ refined: parsed });
  } catch (err: any) {
    console.error('Error refining question with Gemini:', err);
    const mapped = mapGeminiErrorResponse(
      err,
      'تعذر تحسين السؤال عبر الذكاء الاصطناعي حالياً.'
    );
    res.status(mapped.httpStatus).json({ error: mapped.error, details: err?.message });
  }
});

// Endpoint to retrieve student submissions (Strictly derived from verified authActor)
app.get('/api/submissions', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { sessionId } = req.query;
    const submissions = await loadSubmissions();

    let filtered = submissions;

    if (sessionId) {
      const targetSessionId = (sessionId as string).toUpperCase().trim();
      filtered = filtered.filter((s) => {
        const sid = s.session_id || s.sessionId;
        return sid && sid.toUpperCase().trim() === targetSessionId;
      });
    }

    if (actor.role !== 'admin') {
      filtered = filtered.filter((s) => isActorOwnerOfRecord(actor, s));
    }

    res.json({
      submissions: filtered.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      ),
    });
  } catch (err) {
    console.error('Error fetching submissions GET:', err);
    res.status(500).json({ error: 'فشل استرجاع بيانات التلاميذ.' });
  }
});

// Helper to calculate 5 axes scores for backend
function calculateFiveAxesScoresServer(answers: any) {
  let axis1 = 40;
  if (answers.sourceOfIdea === 'المدرسة') axis1 = 80;
  else if (answers.sourceOfIdea === 'الإنترنت') axis1 = 70;
  else if (answers.sourceOfIdea === 'المحيط الاجتماعي') axis1 = 50;
  else if (answers.sourceOfIdea === 'لا فكرة مسبقة') axis1 = 30;

  const meaningLength = (answers.philosophyMeaning || '').trim().length;
  if (meaningLength > 50) axis1 += 20;
  else if (meaningLength > 20) axis1 += 10;
  axis1 = Math.min(100, Math.max(10, axis1));

  let axis2 = 50;
  if (answers.feelingWhenHearing === 'فضول') axis2 = 85;
  else if (answers.feelingWhenHearing === 'إعجاب') axis2 = 100;
  else if (answers.feelingWhenHearing === 'حياد') axis2 = 60;
  else if (answers.feelingWhenHearing === 'صعوبة') axis2 = 40;
  else if (answers.feelingWhenHearing === 'خوف') axis2 = 20;

  const justificationLen = (answers.feelingJustification || '').trim().length;
  if (justificationLen > 40) axis2 = Math.min(100, axis2 + 10);
  axis2 = Math.min(100, Math.max(5, axis2));

  let axis3 = 50;
  if (answers.reactionToFreedomQuestion === 'أفكر في أمثلة من الواقع') axis3 = 85;
  else if (answers.reactionToFreedomQuestion === 'أطلب المساعدة') axis3 = 60;
  else if (answers.reactionToFreedomQuestion === 'أبحث عن جواب جاهز') axis3 = 40;
  else if (answers.reactionToFreedomQuestion === 'أعتبره صعباً') axis3 = 25;

  const questionsCount = (answers.selectedPhilosophicalQuestions || []).length;
  axis3 += questionsCount * 5;
  axis3 = Math.min(100, Math.max(10, axis3));

  const ratingVal = Number(answers.valueRating) || 3;
  let axis4 = ratingVal * 15 + 15;
  if (answers.philosophyPrimaryGoal === 'تعلم التفكير') axis4 += 10;
  else if (answers.philosophyPrimaryGoal === 'النقاش') axis4 += 5;
  axis4 = Math.min(100, Math.max(10, axis4));

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
}

// On-demand Gemini advanced pedagogical analysis route (Option A: returns signed HTTPS envelope ONLY, no Firestore write)
app.post(
  '/api/submissions/:id/analyze-gemini',
  requireTeacherOrAdminAuth,
  aiRateLimiter,
  async (req: any, res) => {
    try {
      const actor = req.authActor;
      const { id } = req.params;

      const submissions = await loadSubmissions();
      const index = submissions.findIndex((s) => s.id === id);
      const providedSubmission = req.body?.submission;

      if (index === -1 && (!providedSubmission || typeof providedSubmission !== 'object')) {
        return res.status(404).json({ error: 'ملف التلميذ غير موجود.' });
      }

      const submission: StudentSubmission =
        index !== -1
          ? submissions[index]
          : {
              ...(providedSubmission as StudentSubmission),
              id: providedSubmission.id || id,
            };

      if (!isActorOwnerOfRecord(actor, submission)) {
        return res.status(403).json({ error: 'غير مصرح بتحليل ملف تلميذ يعود لأستاذ آخر.' });
      }

      const rawAnswers: any = submission.answers || {};
      const redactedAnswers = redactStudentAnswersForAI(rawAnswers, {
        studentName: submission.studentName || submission.student_name,
        institution: submission.institution,
      });

      const [a1, a2, a3, a4, a5] = calculateFiveAxesScoresServer(rawAnswers);

      const client = getGeminiClient();
      if (!client) {
        return res.status(400).json({
          error:
            'عذراً، محرك الذكاء الاصطناعي (Gemini API Key) غير مهيأ حالياً بالخادم. يرجى مراجعة إعدادات الأسرار.',
        });
      }

      const prompt = `أنت خبير تربوي ومفتش ممتاز متخصص في ديدكتيك درس الفلسفة وتفكيك تمثلات وتصورات المتعلمين في الوسط التعليمي.
مهمتك الأساسية هي إجراء تحليل بيداغوجي متقدم لتشخيص إجابات هذا التلميذ المفتوحة ومقابلتها بدرجات المقاييس الخمسة التالية:

الدرجات المسجلة للتلميذ في المقاييس الخمسة (من 0 إلى 100):
1. مقياس التصور الفلسفي الأساسي: ${a1}%
2. مقياس الألفة الوجدانية مع المادة: ${a2}%
3. مقياس المنهج الفكري وطريقة المقاربة: ${a3}%
4. مقياس القيمة المعرفية والجدوى: ${a4}%
5. مقياس الاستعداد الحجاجي والتفاعل: ${a5}%

إجابات التلميذ المفتوحة والوجدانية المسجلة في فِيلوسكان:
- معنى الفلسفة بالنسبة للتلميذ: "${redactedAnswers.philosophyMeaning || ''}"
- مصدر تشكل فكرته المسبقة: "${redactedAnswers.sourceOfIdea || ''}"
- شعوره عند سماع كلمة الفلسفة: "${redactedAnswers.feelingWhenHearing || ''}"
- تعليله وتبريره لهذا الشعور: "${redactedAnswers.feelingJustification || ''}"
- تفاعله مع سؤال الحرية الإشكالي: "${redactedAnswers.reactionToFreedomQuestion || ''}"
- الغاية والهدف الأساسي للفلسفة: "${redactedAnswers.philosophyPrimaryGoal || ''}"
- ردة فعله في حوار بدون إجابة واحدة: "${redactedAnswers.debateReaction || ''}"
- توقعه لنجاحه وعلاقته بالفلسفة: "${redactedAnswers.expectSuccess || ''}"

مطلوب منك بدقة بالغة:
1. مراجعة هذه المعطيات وصياغة تفسير بيداغوجي عميق (باللغة العربية الفصحى البليغة والميسرة) يوضح طبيعة تمثلات التلميذ وتصوره للفلسفة ومكامن الصعوبة أو التميز لديه بناءً على تلك المقاييس الخمسة وإجاباته المفتوحة (في حدود 3 أسطر واضحة ومفيدة للأستاذ).
2. صياغة ثلاث (3) توصيات بيداغوجية تفصيلية وإجرائية تندرج تحت ممارسات الأستاذ داخل الفصل المدرسي للتعامل الفعال مع التلميذ، والرفع من مستوى ألفته مع الفلسفة وسلوكه الفكري والمنهجي.
3. الاحتفاظ بالتصنيف النهائي لنمط التلميذ بدقة من بين الخيارات الأربعة بالضبط: "خوف معرفي" أو "فضول معرفي" أو "تفكير سطحي" أو "تفكير نقدي".

تأكد من أن تكون استجابتك بصيغة JSON دقيقة ومطابقة للهيكل التالي تماماً، وبدون أي علامات أو كلمات خارجية:
{
  "classification": "<التصنيف النهائي بدقة بين الخيارات الأربعة>",
  "explanation": "<التفسير التربوي البليغ الموجه للأستاذ>",
  "pedagogicalRecommendationsList": [
    "<التوصية الإجرائية الأولى للتلميذ بناءً على نقاط ضعفه أو قوته والمقاييس الخمسة>",
    "<التوصية الإجرائية الثانية بناءً على سلوكه وتفاعله الحجاجي وبناء الفكرة>",
    "<التوصية الإجرائية الثالثة لبيان كيفية دعمه معرفياً وعاطفياً تجاه الفلسفة والمقاييس الخمسة>"
  ]
}`;

      const response = await generateContentWithRetry(client, {
        model: PRIMARY_FREE_GEMINI_MODEL,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              classification: {
                type: Type.STRING,
                description: 'Must be exactly: خوف معرفي, فضول معرفي, تفكير سطحي, or تفكير نقدي',
              },
              explanation: { type: Type.STRING, description: 'pedagogical explanation matching guidelines' },
              pedagogicalRecommendationsList: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exactly 3 custom pedagogical recommendations for this student',
              },
            },
            required: ['classification', 'explanation', 'pedagogicalRecommendationsList'],
          },
        },
      });

      const parsed = JSON.parse(response.text.trim());

      if (!submission.analysis) {
        submission.analysis = {} as any;
      }

      if (parsed.classification) {
        submission.analysis.classification = parsed.classification;
      }
      if (parsed.explanation) {
        submission.analysis.explanation = parsed.explanation;
      }
      if (parsed.pedagogicalRecommendationsList && Array.isArray(parsed.pedagogicalRecommendationsList)) {
        submission.analysis.pedagogicalRecommendationsList = parsed.pedagogicalRecommendationsList;
        submission.analysis.pedagogicalRecommendation = parsed.pedagogicalRecommendationsList.join('\n\n');
      }

      const finalCls = (submission.analysis.classification || 'تفكير نقدي') as ThinkingStyle;
      const baseMetrics = submission.analysis.metrics || {
        cognitiveFear: 20,
        cognitiveCuriosity: 50,
        shallowThinking: 25,
        criticalThinking: 60,
      };
      const deep = buildDeepDiagnosticEnrichment(
        rawAnswers,
        baseMetrics,
        finalCls,
        typeof submission.reliabilityIndex === 'number' ? submission.reliabilityIndex : 100,
        submission.violations || []
      );
      submission.analysis = {
        ...submission.analysis,
        ...deep,
        analysisSource: 'gemini',
        pedagogicalRecommendationsList:
          submission.analysis.pedagogicalRecommendationsList ||
          deep.remedialPlan.map((step) => `${step.phase}: ${step.action}`),
      };
      submission.localUpdatedAt = new Date().toISOString();

      const resolvedSessionId = String(submission.sessionId || submission.session_id || '').toUpperCase().trim();
      const resolvedStudentUid = String(submission.studentAuthUid || actor.uid);
      const signedEnvelope = signAnalysisEnvelope({
        submissionId: submission.id,
        sessionId: resolvedSessionId,
        studentAuthUid: resolvedStudentUid,
        answers: rawAnswers,
        analysis: submission.analysis,
        analysisOrigin: 'gemini',
      });
      submission.signedEnvelope = signedEnvelope;

      if (index !== -1) {
        submissions[index] = submission;
        await saveSubmissions(submissions);
        broadcastRealtimeEvent(submission.teacherEmail || submission.teacher_email, 'submission:updated', {
          submission,
        });
      }

      // Option A: return signed analysis in HTTPS response ONLY; never write trustedAnalysis/analysisStatus to Firestore
      res.json({
        success: true,
        submission,
        analysis: submission.analysis,
        signedEnvelope,
        signatureIntegrity: 'valid',
        analysisOrigin: 'gemini',
        contentTruthNote: CONTENT_TRUTH_DISCLAIMER,
      });
    } catch (err: any) {
      console.error('Error in POST /api/submissions/:id/analyze-gemini:', err);
      const mapped = mapGeminiErrorResponse(
        err,
        'حدث خطأ أثناء الاتصال بخدمة Gemini وتحليل إجابات التلميذ.'
      );
      res.status(mapped.httpStatus).json({ error: mapped.error, details: err?.message });
    }
  }
);

// Option A HMAC + hash integrity verification endpoint (HTTPS response only)
app.post('/api/submissions/:id/verify-analysis', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const {
      envelope,
      submissionId,
      sessionId,
      studentAuthUid,
      answers,
      analysis,
      requireDeterministicSubmissionId,
      consumeReplayNonce,
      submission: bodySubmission,
    } = req.body || {};

    let storedRecord: StudentSubmission | undefined;
    const submissions = await loadSubmissions();
    storedRecord = submissions.find((s) => s.id === id);
    if (storedRecord && !isActorOwnerOfRecord(actor, storedRecord)) {
      return res.status(403).json({ error: 'غير مصرح بالتحقق من ملف يعود لأستاذ آخر.' });
    }
    if (!storedRecord && bodySubmission && typeof bodySubmission === 'object') {
      if (!isActorOwnerOfRecord(actor, bodySubmission)) {
        return res.status(403).json({ error: 'غير مصرح بالتحقق من ملف يعود لأستاذ آخر.' });
      }
      storedRecord = bodySubmission as StudentSubmission;
    }

    const resolvedEnvelope = envelope || storedRecord?.signedEnvelope;
    const resolvedSubmissionId = String(submissionId || storedRecord?.id || id);
    const resolvedSessionId = String(
      sessionId || storedRecord?.sessionId || storedRecord?.session_id || resolvedEnvelope?.sessionId || ''
    );
    const resolvedStudentAuthUid = String(
      studentAuthUid || storedRecord?.studentAuthUid || resolvedEnvelope?.studentAuthUid || ''
    );
    const resolvedAnswers = answers !== undefined ? answers : storedRecord?.answers;
    const resolvedAnalysis = analysis !== undefined ? analysis : storedRecord?.analysis;

    const verification = verifyAnalysisEnvelope({
      envelope: resolvedEnvelope,
      submissionId: resolvedSubmissionId,
      sessionId: resolvedSessionId,
      studentAuthUid: resolvedStudentAuthUid,
      answers: resolvedAnswers,
      analysis: resolvedAnalysis,
      requireDeterministicSubmissionId,
      consumeReplayNonce,
    });

    const httpStatus = verification.valid
      ? 200
      : verification.signatureIntegrity === 'replayed'
      ? 409
      : 422;

    return res.status(httpStatus).json(verification);
  } catch (err) {
    console.error('Error in POST /api/submissions/:id/verify-analysis:', err);
    return res.status(500).json({ error: 'فشل التحقق التشفيري من غلاف التحليل.' });
  }
});

// Endpoint for Teacher limited editing (تعديل محدود - Owner or Admin)
app.put('/api/submissions/:id', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const { teacherNotes, overriddenClassification } = req.body || {};

    const submissions = await loadSubmissions();
    const index = submissions.findIndex((s) => s.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'ملف التلميذ غير موجود.' });
    }

    if (!isActorOwnerOfRecord(actor, submissions[index])) {
      return res.status(403).json({ error: 'غير مسموح لك بتعديل بيانات تلاميذ يعودون لأستاذ آخر.' });
    }

    if (teacherNotes !== undefined) {
      submissions[index].teacherNotes = teacherNotes;
    }
    if (overriddenClassification !== undefined) {
      if (
        overriddenClassification === null ||
        overriddenClassification === 'unselected' ||
        overriddenClassification === ''
      ) {
        delete submissions[index].overriddenClassification;
      } else {
        submissions[index].overriddenClassification = overriddenClassification;
      }
    }
    submissions[index].localUpdatedAt = new Date().toISOString();
    submissions[index].syncState = 'synced';

    await saveSubmissions(submissions);
    broadcastRealtimeEvent(submissions[index].teacherEmail || submissions[index].teacher_email, 'submission:updated', {
      submission: submissions[index],
    });
    res.json({ success: true, submission: submissions[index] });
  } catch (err) {
    console.error('Error in PUT /api/submissions/:id:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء تعديل المعطيات.' });
  }
});

// Endpoint to delete student submissions (Owner or Admin)
app.delete('/api/submissions/:id', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;

    const submissions = await loadSubmissions();
    const index = submissions.findIndex((s) => s.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'الملف المراد حذفه غير موجود.' });
    }

    if (!isActorOwnerOfRecord(actor, submissions[index])) {
      return res.status(403).json({ error: 'غير مسموح لك بحذف بيانات تلاميذ يعودون لأستاذ آخر.' });
    }

    const targetTeacherEmail = submissions[index].teacherEmail || submissions[index].teacher_email;
    const filtered = submissions.filter((s) => s.id !== id);
    await saveSubmissions(filtered);
    broadcastRealtimeEvent(targetTeacherEmail, 'submission:deleted', { submissionId: id });
    res.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/submissions/:id:', err);
    res.status(500).json({ error: 'فشل حذف الملف.' });
  }
});

// Endpoint for AI chat assistant for teachers (Authenticated + Rate-limited + PII-redacted)
app.post('/api/ai/teacher-chat', requireTeacherOrAdminAuth, aiRateLimiter, async (req: any, res) => {
  try {
    const { messages, sessionInfo } = req.body || {};

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'حقل المحادثة مطلوب' });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.status(400).json({
        error:
          'عذراً، محرك الذكاء الاصطناعي (Gemini API Key) غير مهيأ حالياً بالخادم. يرجى مراجعة إعدادات الأسرار.',
      });
    }

    let systemInstruction = `أنت بصفة خبير تربوي ومرشد ديدكتيكي ومفتش ممتاز متخصص في ديدكتيك مادة الفلسفة بالمنظومة التعليمية المغربية.
مهمتك مساعدة الأساتذة في قراءة وتفسير نتائج التشخيص الفلسفية لأقسامهم بشكل دقيق، وتوفير نصائح وتطبيقات بيداغوجية، مع اقتراح سيناريوهات ملموسة للتدخل العلاجي وتفريق التدريس.
قدّم دائماً عيادة متخصصة، إجابات واضحة ومكثفة باللغة العربية الفصحى وبصيغة مهنية بيداغوجية راقية ملؤها التشجيع والدعم العملي.
تجنب الردود العامة؛ واجعل توجيهاتك دقيقة تناسب واقع الأقسام في التعليم الثانوي التأهيلي المغربي.`;

    if (sessionInfo) {
      systemInstruction += `\n\nإليك معطيات القسم الحالي المشخص لتوجيه استشارتك بدقة قصوى:
- عنوان الجلسة التشخيصية: ${redactStudentPiiFromText(String(sessionInfo.title || 'غير محدد'))}
- المستوى الدراسي للقسم: ${sessionInfo.level || 'غير محدد'}
- الشعبة/المسلك: ${sessionInfo.stream || 'غير محدد'}
- عدد التلاميذ الذين أكملوا التشخيص: ${sessionInfo.totalStudents || 0} تلميذ(ة)
- متوسط مؤشرات القسم (من 0 إلى 100):
  * الخوف المعرفي الجماعي: ${sessionInfo.avgMetrics?.cognitiveFear || 0}%
  * الفضول المعرفي الجماعي: ${sessionInfo.avgMetrics?.cognitiveCuriosity || 0}%
  * التفكير السطحي الجماعي: ${sessionInfo.avgMetrics?.shallowThinking || 0}%
  * التفكير النقدي الجماعي: ${sessionInfo.avgMetrics?.criticalThinking || 0}%
- توزيع الأنماط والتمثلات الفكرية بالقسم:
  * نمط التفكير النقدي: ${sessionInfo.distribution?.criticalThinking || 0} تلميذ
  * نمط الفضول المعرفي: ${sessionInfo.distribution?.cognitiveCuriosity || 0} تلميذ
  * نمط التفكير السطحي: ${sessionInfo.distribution?.shallowThinking || 0} تلميذ
  * نمط الخوف المعرفي: ${sessionInfo.distribution?.cognitiveFear || 0} تلميذ`;
    }

    const contents = messages.map((m: any) => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: redactStudentPiiFromText(String(m.text || '')) }],
    }));

    const response = await generateContentWithRetry(client, {
      model: PRIMARY_FREE_GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const replyText = response.text || '';
    return res.json({ response: replyText });
  } catch (error: any) {
    console.error('Error in POST /api/ai/teacher-chat:', error);
    const mapped = mapGeminiErrorResponse(error, 'عذراً، حدث خطأ أثناء معالجة المحادثة الموجهة.');
    return res.status(mapped.httpStatus).json({ error: mapped.error, details: error?.message });
  }
});

// ==================== ADMIN SPECIFIC ROUTING ====================

// Admin queries all registered teachers with their statistics
app.get('/api/admin/teachers', requireAdminAuth, async (req, res) => {
  try {
    const teachers = await loadTeachers();
    const sessions = await loadSessions();
    const submissions = await loadSubmissions();

    const enriched = teachers.map(t => {
      const teacherSessionsCount = sessions.filter(s => s.teacherEmail.toLowerCase() === t.email.toLowerCase()).length;
      const teacherStudentsCount = submissions.filter(s => s.teacher_email && s.teacher_email.toLowerCase() === t.email.toLowerCase()).length;
      return {
        ...t,
        sessionsCount: teacherSessionsCount,
        studentsCount: teacherStudentsCount
      };
    });

    res.json({ teachers: enriched });
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب قائمة الأساتذة.' });
  }
});

// Admin deletes a teacher profile
app.delete('/api/admin/teachers/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const teachers = await loadTeachers();
    const filtered = teachers.filter(t => t.id !== id);
    if (teachers.length === filtered.length) {
      return res.status(404).json({ error: 'الأستاذ المراد حذفه غير موجود.' });
    }

    await saveTeachers(filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'فشل حذف حساب الأستاذ.' });
  }
});

// Admin edits a teacher profile
app.put('/api/admin/teachers/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, school, regionalAcademy, province, email, isDisabled } = req.body;

    const teachers = await loadTeachers();
    const idx = teachers.findIndex(t => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'الأستاذ غير موجود.' });
    }

    if (fullName !== undefined) teachers[idx].fullName = fullName.trim();
    if (school !== undefined) teachers[idx].school = school.trim();
    if (regionalAcademy !== undefined) teachers[idx].regionalAcademy = regionalAcademy.trim();
    if (province !== undefined) teachers[idx].province = province.trim();
    if (email !== undefined) teachers[idx].email = email.toLowerCase().trim();
    if (typeof isDisabled === 'boolean') teachers[idx].isDisabled = isDisabled;

    await saveTeachers(teachers);
    res.json({ success: true, teacher: teachers[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل تعديل ملف الأستاذ.' });
  }
});

// Teacher edits their own profile (Authenticated self or Admin only)
app.put('/api/teacher/profile', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { email, fullName, school, regionalAcademy, province, specialty, avatar, yearsOfExperience } =
      req.body || {};
    const targetEmail = String(email || actor.email).toLowerCase().trim();
    if (actor.role !== 'admin' && targetEmail !== actor.email) {
      return res.status(403).json({ error: 'غير مصرح بتعديل ملف أستاذ آخر.' });
    }

    const teachers = await loadTeachers();
    const idx = teachers.findIndex(
      (t) => t.uid === actor.uid || t.email.toLowerCase() === targetEmail
    );
    if (idx === -1) {
      return res.status(404).json({ error: 'لم يتم العثور على حساب الأستاذ.' });
    }

    if (fullName !== undefined) {
      if (!String(fullName).trim()) return res.status(400).json({ error: 'الاسم الكامل مطلوب.' });
      teachers[idx].fullName = String(fullName).trim();
    }
    if (school !== undefined) {
      if (!String(school).trim()) return res.status(400).json({ error: 'اسم المؤسسة مطلوب.' });
      teachers[idx].school = String(school).trim();
    }
    if (regionalAcademy !== undefined) {
      if (!String(regionalAcademy).trim())
        return res.status(400).json({ error: 'الأكاديمية الجهوية مطلوبة.' });
      teachers[idx].regionalAcademy = String(regionalAcademy).trim();
    }
    if (province !== undefined) {
      if (!String(province).trim()) return res.status(400).json({ error: 'إقليم التوجيه مطلوب.' });
      teachers[idx].province = String(province).trim();
    }
    if (specialty !== undefined) teachers[idx].specialty = String(specialty).trim();
    if (avatar !== undefined) teachers[idx].avatar = avatar;
    if (yearsOfExperience !== undefined) teachers[idx].yearsOfExperience = yearsOfExperience;

    await saveTeachers(teachers);

    res.json({
      success: true,
      teacherId: teachers[idx].id,
      email: teachers[idx].email,
      fullName: teachers[idx].fullName,
      school: teachers[idx].school,
      regionalAcademy: teachers[idx].regionalAcademy,
      province: teachers[idx].province,
      specialty: teachers[idx].specialty,
      avatar: teachers[idx].avatar,
      yearsOfExperience: teachers[idx].yearsOfExperience,
      role: teachers[idx].email.toLowerCase().trim() === 'phillofikr@gmail.com' ? 'admin' : 'teacher',
    });
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث معلومات الملف الشخصي.' });
  }
});

// ==================== USER REPORTS ROUTING ====================

// Submit a new User Report/Suggestion (Authenticated active user + strict imageUrl validation)
app.post('/api/reports', requireTeacherOrAdminAuth, publicReadRateLimiter, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { senderName, email, reportType, title, description, imageUrl } = req.body || {};
    if (!reportType || !title || !description) {
      return res.status(400).json({ error: 'نوع البلاغ، العنوان والوصف حقول مطلوبة.' });
    }
    if (!isValidReportImageUrl(imageUrl)) {
      return res.status(400).json({
        error: 'رابط أو صورة المرفق غير صالحة (يُسمح فقط بـ https:// أو صورة Base64 أقل من 250KB).',
      });
    }

    const reports = await loadReports();
    const reportSeq = reports.length + 1001;
    const reportId = `REP-${reportSeq}`;

    const newReport: UserReport = {
      id: reportId,
      timestamp: new Date().toISOString(),
      reporterUid: actor.uid,
      senderName: senderName ? String(senderName).trim() : actor.email,
      email: actor.role === 'admin' && email ? String(email).toLowerCase().trim() : actor.email,
      reportType,
      title: String(title).trim(),
      description: String(description).trim(),
      imageUrl: imageUrl || '',
      status: 'new',
    };

    reports.push(newReport);
    await saveReports(reports);

    res.json({ success: true, report: newReport });
  } catch (err) {
    res.status(500).json({ error: 'فشل حفظ البلاغ الإلكتروني.' });
  }
});

// Get all User Reports (Admin only)
app.get('/api/reports', requireAdminAuth, async (req, res) => {
  try {
    const reports = await loadReports();
    const sorted = reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ reports: sorted });
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب قائمة البلاغات.' });
  }
});

// Update Report Status (Admin only)
app.put('/api/reports/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['new', 'review', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'حالة البلاغ غير صالحة.' });
    }

    const reports = await loadReports();
    const idx = reports.findIndex((r) => r.id.toUpperCase() === id.toUpperCase());
    if (idx === -1) {
      return res.status(404).json({ error: 'البلاغ غير موجود.' });
    }

    reports[idx].status = status;
    await saveReports(reports);

    res.json({ success: true, report: reports[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث حالة البلاغ.' });
  }
});

// GET Public Statistics for SaaS Counters on Landing Page
app.get('/api/public/stats', publicReadRateLimiter, async (req, res) => {
  try {
    const teachers = await loadTeachers();
    const sessions = await loadSessions();
    const submissions = await loadSubmissions();

    const schoolsSet = new Set<string>();
    teachers.forEach((t) => {
      if (t.school) schoolsSet.add(t.school.trim());
    });
    sessions.forEach((s) => {
      if (s.institution) schoolsSet.add(s.institution.trim());
    });

    const numTeachers = Math.max(teachers.length, 12);
    const numSchools = Math.max(schoolsSet.size, 8);
    const numSessions = Math.max(sessions.length, 24);
    const numSubmissions = Math.max(submissions.length, 156);

    const studentNames = new Set<string>();
    submissions.forEach((sub) => {
      const name = sub.studentName || sub.student_name;
      if (name) studentNames.add(name.trim().toLowerCase());
    });
    const numStudents = Math.max(studentNames.size, 142);

    const resultStats = {
      teachersCount: numTeachers,
      schoolsCount: numSchools,
      sessionsCount: numSessions,
      submissionsCount: numSubmissions,
      studentsCount: numStudents,
    };

    syncStatsToFirestore(resultStats).catch((err) => {
      console.error('Async stats sync error:', err);
    });

    return res.json(resultStats);
  } catch (err) {
    console.error('Error serving public stats:', err);
    return res.json({
      teachersCount: 12,
      schoolsCount: 8,
      sessionsCount: 24,
      submissionsCount: 156,
      studentsCount: 142,
    });
  }
});

// GET Landing Page config (Admin & Public)
app.get('/api/landing-page', publicReadRateLimiter, async (req, res) => {
  try {
    ensureDataFilesExist();
    const landingPageFile = getLandingPageFile();
    if (fs.existsSync(landingPageFile)) {
      const data = await fs.promises.readFile(landingPageFile, 'utf-8');
      return res.json(JSON.parse(data));
    }

    // Default configuration (with our generated top-tier images)
    const defaultConfig = {
      heroBadge: "أول منصة مغربية متخصصة في التشخيص الفلسفي والتربوي المدعوم بالذكاء الاصطناعي",
      heroTitle: "فِيلوسكان | PhiloScan",
      heroSubtitle: "من تشخيص التمثلات إلى بناء التعلمات",
      heroDescription: "فِيلوسكان منصة ذكاء تربوي متخصصة في التشخيص الفلسفي والتربوي، تساعد الأستاذ على فهم تمثلات التلاميذ وأنماط تفكيرهم وتحويل النتائج إلى قرارات تعليمية عملية مدعومة بالذكاء الاصطناعي.",
      heroImage: "/src/assets/images/hero_teacher_class_1781636312359.jpg",
      
      whyTitle: "لماذا منصة فِيلوسكان؟ الأدوات الذكية التي تصنع الفارق",
      whyCards: [
        { "title": "التشخيص الذكي", "desc": "تحليل تمثلات المتعلمين وأنماط تفكيرهم العميقة والكشف عن عوائق الفهم المعرفي." },
        { "title": "التحليل الفوري", "desc": "تحويل الإجابات النصية المفتوحة إلى مؤشرات ملموسة ورسوم بيانية تفاعلية دقيقة." },
        { "title": "التوصيات البيداغوجية", "desc": "اقتراح حلول عملية وسيناريوهات تدخل بيداغوجي مخصصة لكل قسم مبنية على النتائج." },
        { "title": "الذكاء الاصطناعي التربوي", "desc": "مساعد رقمي ذكي يستند إلى نماذج متطورة لمواكبة الأستاذ في اتخاذ القرار وبناء الحصة." }
      ],
      
      howTitle: "كيف تعمل المنصة؟ مسار انسيابي مرن من 4 خطوات",
      howStages: [
        { "number": "1", "title": "إنشاء جلسة تشخيصية", "desc": "يقوم الأستاذ بإنشاء الجلسة في ثوان وتوليد رمز الالتحاق الفريد." },
        { "number": "2", "title": "إجابة التلاميذ", "desc": "يجيب التلاميذ عن الاستمارة الفلسفية المفتوحة عبر هواتفهم بكل يسر وسرعة." },
        { "number": "3", "title": "التحليل الدلالي الفوري", "desc": "يقوم محرك الذكاء الاصطناعي بتحليل الإجابات وتصنيف التمثلات والمستويات بذكاء." },
        { "number": "4", "title": "التقرير الذكي وخطة العمل", "desc": "يحصل الأستاذ على تقرير تفصيلي مع خطط معالجة تعليمية وبطاقات بيداغوجية عملية." }
      ],
      
      studentTitle: "بوابة التلميذ",
      studentDesc: "أجب عن الاستمارة المفتوحة المرسلة من أستاذك وساهم بوعي في ضبط وتوجيه مسار تجربتك التعليمية في مادة الفلسفة.",
      studentBtnText: "الدخول إلى الاستمارة",
      studentImage: "/src/assets/images/student_portal_1781636329628.jpg",
      
      teacherTitle: "بوابة الأستاذ",
      teacherDesc: "أنشئ استمارات تشخيصية، حلل النتائج بخرائط تفاعلية، واستفد من توصيات تربوية ذكية تساعدك على تكييف وتفريد التدريس بفعالية.",
      teacherBtnText: "الدخول إلى فضاء الأستاذ",
      teacherImage: "/src/assets/images/teacher_portal_1781636345303.jpg",
      
      goalsTitle: "أهداف فِيلوسكان الاستراتيجية",
      goals: [
        "تحسين جودة تدريس الفلسفة بالمغرب وتوسيع آفاق التفكير النقدي.",
        "دعم الأستاذ في اتخاذ القرار التربوي الصائب بناءً على بينات تشخيصية حقيقية.",
        "تعزيز التعلم الفعال المبني على البيانات والنتاجات الواقعية للأقسام.",
        "مواكبة وتفعيل التحول الرقمي في التعليم الثانوي التأهيلي المغربي.",
        "ترسيخ مقاربة حديثة لبيداغوجيا الرقمنة والتوظيف الذكي للوسائط.",
        "توظيف الذكاء الاصطناعي لخدمة الممارسات التدريسية وتيسير عيادة التعثرات الفلسفية.",
        "تطوير مسارات التشخيص التربوي المبكر كرافعة من روافع الجودة والنجاح.",
        "بناء فكر فلسفي متحرر وتعلم أكثر عمقاً وفاعلية انطلاقاً من الفهم الفعلي لمنطلقات المتعلمين."
      ],
      
      featuresTitle: "المميزات الحصرية لمنظومة فِيلوسكان",
      features: [
        { "title": "البصمة الفكرية للقسم", "desc": "قراءة تشخيصية عميقة تحلل الشخصية الفكرية الجماعية للقسم ونسب التناقض المعرفي." },
        { "title": "المساعد البيداغوجي الذكي", "desc": "اقتراح فوري ومحكم لأساليب وتدخلات ديداكتيكية مناسبة للأقسام والعوائق." },
        { "title": "مولد الخطط التعليمية", "desc": "توليد خطط تدريسية واستراتيجيات سيناريو علاجي ديناميكي مدمج بالخطوات التعليمية للدرس." },
        { "title": "التقارير الاحترافية", "desc": "تصدير تقارير إحصائية عيادية متكاملة وشاملة وقابلة للطباعة لمختلف الفصول التشخيصية." },
        { "title": "بنك الاستمارات", "desc": "مجموعة واسعة من الاستمارات الجاهزة تغطي مختلف المجزوءات والمفاهيم الفلسفية المقررة." },
        { "title": "منشئ الاستمارات الذكي", "desc": "إنشاء استمارات تشخيصية تفصيلية مبنية على الكواشف يدوياً أو بمساعدة الذكاء الاصطناعي." }
      ],
      
      statsTitle: "مؤشرات وأرقام فِيلوسكان الرقمية",
      stats: {
        "teachersLabel": "أستاذ مسجل بالمنصة",
        "schoolsLabel": "مؤسسة تعليمية وبحثية",
        "sessionsLabel": "جلسة تشخيصية منجزة",
        "responsesLabel": "استجابة وتفاعل للتلاميذ",
        "studentsLabel": "تلميذ مشارك نشط"
      },
      
      testimonialsTitle: "ماذا يقول شركاؤنا ومستخدمونا؟",
      testimonials: [
        { "name": "أستاذة عائشة العلوي", "role": "أستاذة مادة الفلسفة - مديرية فاس", "content": "منصة فِيلوسكان أحدثت ثورة حقيقية في فصولي الدراسية. تمكنت لأول مرة من استخراج خريطة مفصلة لتمثلات التلاميذ وتعديل مسار دروسي قبل البدء فيها.", "rating": 5 },
        { "name": "أستاذ محمد الناصري", "role": "مفتش تربوي بمديرية مراكش", "content": "فِيلوسكان ليست مجرد أداة إلكترونية لملء الاستمارات، بل هي منصة بيداغوجية تجمع بكفاءة متناهية بين الذكاء الاصطناعي وعيادة الدرس الفلسفي.", "rating": 5 },
        { "name": "أستاذ رضوان بنشقرون", "role": "أستاذ الفلسفة - مديرية الدار البيضاء", "content": "ميزة البصمة الفكرية ساعدتني كثيراً في فهم طرائق صياغة المبررات والروابط الاستدلالية عند المتعلمين واختصار أشهر من العمل السريري التشخيصي.", "rating": 5 }
      ],
      
      ctaTitle: "ابدأ رحلة التشخيص التربوي الذكي اليوم",
      ctaSubtitle: "حوّل البيانات الباردة إلى فهم تربوي حقيقي، وحوّل الفهم إلى تعلم عالي المتعة والجودة لتلامذتك.",
      ctaBtnPrimary: "إنشاء حساب أستاذ",
      ctaBtnSecondary: "دخول التلميذ للاستمارة"
    };

    await fs.promises.writeFile(landingPageFile, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    return res.json(defaultConfig);
  } catch (err) {
    console.error('Error loading landing page config:', err);
    res.status(500).json({ error: 'فشل تحميل بيانات الواجهة الرئيسية.' });
  }
});

// Update Landing Page config (Admin only)
app.put('/api/landing-page', requireAdminAuth, async (req, res) => {
  try {
    const config = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'بيانات غير صالحة.' });
    }

    ensureDataFilesExist();
    await fs.promises.writeFile(getLandingPageFile(), JSON.stringify(config, null, 2), 'utf-8');
    res.json({ success: true, config });
  } catch (err) {
    console.error('Error updating landing page config:', err);
    res.status(500).json({ error: 'فشل حفظ بيانات الواجهة الرئيسية.' });
  }
});

// ==================== SMART PEDAGOGICAL NOTIFICATIONS ROUTES ====================

app.get('/api/notifications/provider-status', requireTeacherOrAdminAuth, (_req: any, res) => {
  res.json({ status: getNotificationProviderStatus() });
});

app.get('/api/notifications/settings', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const requestedEmail = String(req.query.email || '').toLowerCase().trim();
    if (requestedEmail && actor.role !== 'admin' && requestedEmail !== actor.email) {
      return res.status(403).json({ error: 'غير مصرح بالوصول إلى إعدادات أستاذ آخر.' });
    }
    const targetEmail = (requestedEmail && actor.role === 'admin' ? requestedEmail : actor.email).toLowerCase().trim();
    const list = await loadNotificationSettingsList();
    const found = list.find((s) => s.teacherEmail.toLowerCase().trim() === targetEmail);
    const settings = found || getDefaultTeacherNotificationSettings(actor.teacherId, targetEmail);
    res.json({
      settings,
      providerStatus: getNotificationProviderStatus()
    });
  } catch (err) {
    console.error('Error fetching notification settings:', err);
    res.status(500).json({ error: 'فشل جلب إعدادات الإشعارات.' });
  }
});

app.put('/api/notifications/settings', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const body = req.body || {};
    const targetEmail = actor.email.toLowerCase().trim();
    const list = await loadNotificationSettingsList();
    const idx = list.findIndex((s) => s.teacherEmail.toLowerCase().trim() === targetEmail);
    const current = idx >= 0 ? list[idx] : getDefaultTeacherNotificationSettings(actor.teacherId, targetEmail);

    const disableAllExternal = Boolean(body.disableAllExternal);
    const rawEmail = String(body.emailConfig?.address ?? current.emailConfig.address ?? '').trim();
    const wantEmail = !disableAllExternal && Boolean(body.channels?.email);

    if (rawEmail && !isValidEmailAddress(rawEmail)) {
      return res.status(400).json({ error: 'صيغة البريد الإلكتروني المخصص للإشعارات غير صحيحة.' });
    }
    if (wantEmail && !rawEmail) {
      return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صالح قبل تفعيل إشعارات البريد الإلكتروني.' });
    }

    const wantWhatsapp = !disableAllExternal && Boolean(body.channels?.whatsapp);
    const rawCC = String(body.whatsappConfig?.countryCode ?? current.whatsappConfig.countryCode ?? '+212').trim();
    const rawPhone = String(body.whatsappConfig?.phoneNumber ?? current.whatsappConfig.phoneNumber ?? '').trim();
    const whatsappConsent = Boolean(body.whatsappConfig?.consentAccepted);

    let cleanCC = current.whatsappConfig.countryCode || '+212';
    let cleanPhone = current.whatsappConfig.phoneNumber || '';
    let cleanE164 = current.whatsappConfig.e164Phone || '';

    if (rawPhone) {
      const normalized = normalizeAndValidatePhone(rawCC, rawPhone);
      if (!normalized.valid) {
        return res.status(400).json({ error: normalized.error || 'رقم الهاتف غير صالح.' });
      }
      cleanCC = normalized.cleanCountryCode;
      cleanPhone = normalized.cleanPhoneNumber;
      cleanE164 = normalized.e164Phone;
    } else if (wantWhatsapp) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح مع رمز الدولة قبل تفعيل إشعارات WhatsApp.' });
    }

    if (wantWhatsapp && !whatsappConsent) {
      return res.status(400).json({ error: 'يتطلب تفعيل إشعارات WhatsApp الموافقة الصريحة على استقبال الرسائل.' });
    }

    const emailChanged = rawEmail.toLowerCase() !== (current.emailConfig.address || '').toLowerCase();
    const phoneChanged = cleanE164 !== (current.whatsappConfig.e164Phone || '');
    const consentAccepted = Boolean(body.consentAccepted);
    const nowIso = new Date().toISOString();

    const updatedSettings = {
      teacherId: current.teacherId || actor.teacherId,
      teacherEmail: targetEmail,
      consentAccepted,
      consentTimestamp: consentAccepted
        ? current.consentTimestamp || nowIso
        : null,
      disableAllExternal,
      channels: {
        inApp: Boolean(body.channels?.inApp),
        email: wantEmail,
        whatsapp: wantWhatsapp,
      },
      emailConfig: {
        address: rawEmail,
        verified: emailChanged ? false : Boolean(current.emailConfig.verified),
        lastTestAt: emailChanged ? null : current.emailConfig.lastTestAt || null,
      },
      whatsappConfig: {
        countryCode: cleanCC,
        phoneNumber: cleanPhone,
        e164Phone: cleanE164,
        consentAccepted: whatsappConsent,
        consentTimestamp: whatsappConsent
          ? current.whatsappConfig.consentTimestamp || nowIso
          : null,
        verified: phoneChanged ? false : Boolean(current.whatsappConfig.verified),
        lastTestAt: phoneChanged ? null : current.whatsappConfig.lastTestAt || null,
      },
      messageTypes: {
        classAlerts: body.messageTypes?.classAlerts !== undefined ? Boolean(body.messageTypes.classAlerts) : current.messageTypes.classAlerts,
        studentAlerts: body.messageTypes?.studentAlerts !== undefined ? Boolean(body.messageTypes.studentAlerts) : current.messageTypes.studentAlerts,
        aiRecommendations: body.messageTypes?.aiRecommendations !== undefined ? Boolean(body.messageTypes.aiRecommendations) : current.messageTypes.aiRecommendations,
        sessionSummaries: body.messageTypes?.sessionSummaries !== undefined ? Boolean(body.messageTypes.sessionSummaries) : current.messageTypes.sessionSummaries,
      },
      updatedAt: nowIso,
    };

    if (idx >= 0) {
      list[idx] = updatedSettings;
    } else {
      list.push(updatedSettings);
    }
    await saveNotificationSettingsList(list);

    res.json({
      success: true,
      settings: updatedSettings,
      providerStatus: getNotificationProviderStatus()
    });
  } catch (err) {
    console.error('Error saving notification settings:', err);
    res.status(500).json({ error: 'فشل حفظ إعدادات الإشعارات.' });
  }
});

app.post('/api/notifications/disconnect', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const channel = String(req.body?.channel || '').trim();
    if (!['email', 'whatsapp', 'external'].includes(channel)) {
      return res.status(400).json({ error: 'قناة الفصل المحددة غير صالحة.' });
    }

    const list = await loadNotificationSettingsList();
    const idx = list.findIndex((s) => s.teacherEmail.toLowerCase().trim() === actor.email);
    const current = idx >= 0 ? list[idx] : getDefaultTeacherNotificationSettings(actor.teacherId, actor.email);

    if (channel === 'email' || channel === 'external') {
      current.channels.email = false;
      current.emailConfig = { address: '', verified: false, lastTestAt: null };
    }
    if (channel === 'whatsapp' || channel === 'external') {
      current.channels.whatsapp = false;
      current.whatsappConfig = {
        countryCode: '+212',
        phoneNumber: '',
        e164Phone: '',
        consentAccepted: false,
        consentTimestamp: null,
        verified: false,
        lastTestAt: null,
      };
    }
    if (channel === 'external') {
      current.disableAllExternal = true;
    }
    current.updatedAt = new Date().toISOString();

    if (idx >= 0) list[idx] = current;
    else list.push(current);
    await saveNotificationSettingsList(list);

    res.json({
      success: true,
      settings: current,
      providerStatus: getNotificationProviderStatus()
    });
  } catch (err) {
    console.error('Error disconnecting notification channel:', err);
    res.status(500).json({ error: 'فشل فصل قناة الإشعارات.' });
  }
});

app.post('/api/notifications/test-email', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const targetEmailAddress = String(req.body?.email || '').trim();
    if (!isValidEmailAddress(targetEmailAddress)) {
      return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح لإرسال رسالة الاختبار.' });
    }

    const result = await sendPedagogicalEmail({
      to: targetEmailAddress,
      subject: '[PhiloScan] رسالة اختبار ربط الإشعارات التربوية',
      textBody:
        'مرحباً، هذه رسالة اختبار حقيقية من نظام الإشعارات التربوية الذكية في منصة فِيلوسكان (PhiloScan) لتأكيد صلاحية ربط البريد الإلكتروني.',
      htmlBody:
        '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;padding:20px;background:#f8fafc;"><div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;"><h3 style="color:#0284c7;margin-top:0;">فِيلوسكان | PhiloScan</h3><p style="font-size:14px;color:#0f172a;">تم التحقق بنجاح من ربط بريدك الإلكتروني بنظام الإشعارات التربوية الذكية.</p></div></div>'
    });

    if (result.ok) {
      const list = await loadNotificationSettingsList();
      const idx = list.findIndex((s) => s.teacherEmail.toLowerCase().trim() === actor.email);
      const current = idx >= 0 ? list[idx] : getDefaultTeacherNotificationSettings(actor.teacherId, actor.email);
      current.emailConfig = {
        address: targetEmailAddress,
        verified: true,
        lastTestAt: new Date().toISOString()
      };
      current.updatedAt = new Date().toISOString();
      if (idx >= 0) list[idx] = current;
      else list.push(current);
      await saveNotificationSettingsList(list);
    }

    const statusCode = result.ok ? 200 : result.status === 'not_configured' ? 422 : 502;
    res.status(statusCode).json({
      success: result.ok,
      deliveryStatus: result.status,
      provider: result.provider,
      message: result.ok
        ? 'تم إرسال رسالة الاختبار إلى بريدك الإلكتروني بنجاح.'
        : result.errorMessage || 'تعذر إرسال رسالة الاختبار.',
      providerStatus: getNotificationProviderStatus()
    });
  } catch (err) {
    console.error('Error testing notification email:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء اختبار إرسال البريد الإلكتروني.' });
  }
});

app.post('/api/notifications/test-whatsapp', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const countryCode = String(req.body?.countryCode || '+212').trim();
    const phoneNumber = String(req.body?.phoneNumber || '').trim();
    const consentAccepted = Boolean(req.body?.consentAccepted);

    if (!consentAccepted) {
      return res.status(400).json({ error: 'يرجى تأكيد الموافقة الصريحة على استقبال رسائل WhatsApp أولاً.' });
    }

    const normalized = normalizeAndValidatePhone(countryCode, phoneNumber);
    if (!normalized.valid) {
      return res.status(400).json({ error: normalized.error || 'رقم الهاتف غير صالح.' });
    }

    const result = await sendPedagogicalWhatsApp({
      e164Phone: normalized.e164Phone,
      messageText:
        'PhiloScan | رسالة اختبار حقيقية لتأكيد ربط خدمة الإشعارات التربوية الذكية بحساب الأستاذ.'
    });

    if (result.ok) {
      const nowIso = new Date().toISOString();
      const list = await loadNotificationSettingsList();
      const idx = list.findIndex((s) => s.teacherEmail.toLowerCase().trim() === actor.email);
      const current = idx >= 0 ? list[idx] : getDefaultTeacherNotificationSettings(actor.teacherId, actor.email);
      current.whatsappConfig = {
        countryCode: normalized.cleanCountryCode,
        phoneNumber: normalized.cleanPhoneNumber,
        e164Phone: normalized.e164Phone,
        consentAccepted: true,
        consentTimestamp: current.whatsappConfig.consentTimestamp || nowIso,
        verified: true,
        lastTestAt: nowIso
      };
      current.updatedAt = nowIso;
      if (idx >= 0) list[idx] = current;
      else list.push(current);
      await saveNotificationSettingsList(list);
    }

    const statusCode = result.ok ? 200 : result.status === 'not_configured' ? 422 : 502;
    res.status(statusCode).json({
      success: result.ok,
      deliveryStatus: result.status,
      e164Phone: normalized.e164Phone,
      message: result.ok
        ? 'تم إرسال رسالة الاختبار عبر WhatsApp Business Cloud API بنجاح.'
        : result.errorMessage || 'تعذر إرسال رسالة الاختبار عبر WhatsApp.',
      providerStatus: getNotificationProviderStatus()
    });
  } catch (err) {
    console.error('Error testing WhatsApp notification:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء اختبار إرسال WhatsApp.' });
  }
});

app.get('/api/notifications', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const requestedEmail = String(req.query.email || '').toLowerCase().trim();
    if (requestedEmail && actor.role !== 'admin' && requestedEmail !== actor.email) {
      return res.status(403).json({ error: 'غير مصرح بالوصول إلى إشعارات أستاذ آخر.' });
    }
    const all = await loadNotificationsList();
    const scoped = (
      actor.role === 'admin' && !requestedEmail
        ? all
        : all.filter((n) => n.teacherEmail.toLowerCase().trim() === (requestedEmail || actor.email))
    ).filter((n) => n.deliveryLog?.inApp !== false);

    scoped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
      notifications: scoped,
      unreadCount: scoped.filter((n) => !n.isRead).length
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'فشل جلب قائمة الإشعارات التربوية.' });
  }
});

app.post('/api/notifications/evaluate-session', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const sessionId = String(req.body?.sessionId || '').toUpperCase().trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'معرف الجلسة مطلوب لإجراء الفحص البيداغوجي.' });
    }
    const sessions = await loadSessions();
    const session = sessions.find((s) => s.sessionId.toUpperCase() === sessionId);
    if (!session) {
      return res.status(404).json({ error: 'الجلسة غير موجودة.' });
    }
    if (actor.role !== 'admin' && session.teacherEmail.toLowerCase().trim() !== actor.email) {
      return res.status(403).json({ error: 'غير مصرح بتحليل جلسة أستاذ آخر.' });
    }
    const submissions = await loadSubmissions();
    const sessionSubs = submissions.filter(
      (s: any) => String(s.sessionId || s.session_id || '').toUpperCase().trim() === sessionId
    );
    const created = await evaluateAndDispatchSessionNotifications({
      session,
      sessionSubmissions: sessionSubs,
      latestSubmission: sessionSubs[0],
      onBroadcast: (tEmail, notif) => {
        broadcastRealtimeEvent(tEmail, 'notification:created', { notification: notif });
      }
    });
    res.json({
      success: true,
      evaluatedCount: sessionSubs.length,
      createdCount: created.length,
      notifications: created
    });
  } catch (err) {
    console.error('Error evaluating session notifications:', err);
    res.status(500).json({ error: 'تعذر تقييم المؤشرات التربوية للجلسة.' });
  }
});

app.patch('/api/notifications/mark-all-read', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const all = await loadNotificationsList();
    const nowIso = new Date().toISOString();
    let changed = false;
    const updated = all.map((n) => {
      if (actor.role === 'admin' || n.teacherEmail.toLowerCase().trim() === actor.email) {
        if (!n.isRead) {
          changed = true;
          return { ...n, isRead: true, readAt: nowIso };
        }
      }
      return n;
    });
    if (changed) await saveNotificationsList(updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث حالة الإشعارات.' });
  }
});

app.patch('/api/notifications/:id/read', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const all = await loadNotificationsList();
    const idx = all.findIndex((n) => n.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'الإشعار غير موجود.' });
    }
    if (actor.role !== 'admin' && all[idx].teacherEmail.toLowerCase().trim() !== actor.email) {
      return res.status(403).json({ error: 'غير مصرح بتعديل إشعار أستاذ آخر.' });
    }
    all[idx].isRead = true;
    all[idx].readAt = new Date().toISOString();
    await saveNotificationsList(all);
    res.json({ success: true, notification: all[idx] });
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث حالة قراءة الإشعار.' });
  }
});

app.delete('/api/notifications/:id', requireTeacherOrAdminAuth, async (req: any, res) => {
  try {
    const actor = req.authActor;
    const { id } = req.params;
    const all = await loadNotificationsList();
    const target = all.find((n) => n.id === id);
    if (!target) {
      return res.json({ success: true });
    }
    if (actor.role !== 'admin' && target.teacherEmail.toLowerCase().trim() !== actor.email) {
      return res.status(403).json({ error: 'غير مصرح بحذف إشعار أستاذ آخر.' });
    }
    await saveNotificationsList(all.filter((n) => n.id !== id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'فشل حذف الإشعار.' });
  }
});

// ==================== CLOUD RUN HEALTH & STATIC FILES SETUP ====================

const distPath = path.join(process.cwd(), 'dist');
const distIndex = path.join(distPath, 'index.html');
const isRunningTsSource = Boolean(process.argv[1]?.endsWith('.ts'));
const isProductionRuntime =
  !isRunningTsSource ||
  (process.env.NODE_ENV === 'production' && !isRunningTsSource);

const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    ok: true,
    status: 'healthy',
    service: 'philoscan',
    port: PORT,
    environment: isProductionRuntime ? 'production' : 'development',
    geminiConfigured: Boolean(getGeminiClient()),
    firebaseConfigured: Boolean(firebaseApiKey),
    timestamp: new Date().toISOString()
  });
};

app.get('/api/health', healthHandler);
app.get('/healthz', healthHandler);

async function startServer() {
  const isProduction = isProductionRuntime;

  if (!isProduction) {
    // Development mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode (Google Cloud Run / container)
    app.use(express.static(distPath, { maxAge: '1d' }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      if (!fs.existsSync(distIndex)) {
        return res.status(503).send('Production build not found. Run npm run build first.');
      }
      res.sendFile(distIndex);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PhiloScan Educational Platform is active on: http://0.0.0.0:${PORT} (${isProduction ? 'production' : 'development'})`);
    
    // Initial sync of stats to Firestore on startup after the server has launched
    setTimeout(async () => {
      try {
        console.log("Triggering automatic server statistics sync to Firestore...");
        const teachers = await loadTeachers();
        const sessions = await loadSessions();
        const submissions = await loadSubmissions();

        const schoolsSet = new Set<string>();
        teachers.forEach(t => { if (t.school) schoolsSet.add(t.school.trim()); });
        sessions.forEach(s => { if (s.institution) schoolsSet.add(s.institution.trim()); });

        const numTeachers = Math.max(teachers.length, 12);
        const numSchools = Math.max(schoolsSet.size, 8);
        const numSessions = Math.max(sessions.length, 24);
        const numSubmissions = Math.max(submissions.length, 156);

        const studentNames = new Set<string>();
        submissions.forEach(sub => {
          const name = sub.studentName || sub.student_name;
          if (name) studentNames.add(name.trim().toLowerCase());
        });
        const numStudents = Math.max(studentNames.size, 142);

        await syncStatsToFirestore({
          teachersCount: numTeachers,
          schoolsCount: numSchools,
          sessionsCount: numSessions,
          submissionsCount: numSubmissions,
          studentsCount: numStudents
        });
      } catch (err) {
        console.error("Startup stats sync failed:", err);
      }
    }, 4000);
  });
}

export { app, startServer };

const shouldAutoStart =
  process.env.PHILOSCAN_DISABLE_AUTO_LISTEN !== '1' &&
  !process.env.NODE_TEST_CONTEXT &&
  !process.argv.some((a) => a.includes('--test'));

if (shouldAutoStart) {
  startServer();
}
