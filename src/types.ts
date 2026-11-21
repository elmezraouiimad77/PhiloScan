/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ThinkingStyle = 'خوف معرفي' | 'فضول معرفي' | 'تفكير سطحي' | 'تفكير نقدي';

export interface StudentAnswers {
  // المحور 1: التصور الأولي للفلسفة
  philosophyMeaning: string;
  sourceOfIdea: 'المدرسة' | 'الإنترنت' | 'المحيط الاجتماعي' | 'لا فكرة مسبقة' | string;

  // المحور 2: البعد الوجداني
  feelingWhenHearing: 'فضول' | 'خوف' | 'صعوبة' | 'حياد' | 'إعجاب' | string;
  feelingJustification: string;

  // المحور 3: نمط التفكير
  reactionToFreedomQuestion: 'أفكر في أمثلة من الواقع' | 'أبحث عن جواب جاهز' | 'أعتبره صعباً' | 'أطلب المساعدة' | string;
  selectedPhilosophicalQuestions: string[]; // e.g. ["لماذا نعيش؟", "هل الخير موجود؟"]

  // المحور 4: القيمة المعرفية
  valueRating: number; // 1 to 5
  philosophyPrimaryGoal: 'النجاح الدراسي' | 'تعلم التفكير' | 'حفظ المعلومات' | 'النقاش' | string;

  // المحور 5: الاستعداد الحجاجي
  debateReaction: 'أشارك برأيي' | 'أستمع فقط' | 'أتوتر' | 'أرفض المشاركة' | string;
  expectSuccess: string; // "نعم" أو "لا" مع التعليل
}

export interface DiagnosticMetrics {
  cognitiveFear: number;      // مؤشر الخوف المعرفي (0 - 100)
  cognitiveCuriosity: number;   // مؤشر الفضول المعرفي (0 - 100)
  shallowThinking: number;      // مؤشر التفكير السطحي (0 - 100)
  criticalThinking: number;     // مؤشر التفكير النقدى (0 - 100)
  learningReadiness?: number;   // مؤشر الاستعداد للتعلم (0 - 100) - مضاف للأثر الشامل
}

export interface QuestionBreakdownItem {
  questionId: string;
  questionLabel: string;
  answerText: string;
  dimension: string;
  depthScore: number; // 0 - 100
  semanticNote: string;
}

export interface CredibilityAssessment {
  overallScore: number; // 0 - 100
  verdict: 'موثوقة جداً' | 'موثوقة نسبياً' | 'تحتاج مراجعة';
  textualEffortScore: number;
  consistencyScore: number;
  proctoringScore: number;
  signals: string[];
}

export interface ContradictionItem {
  pairLabel: string;
  questionA: string;
  questionB: string;
  description: string;
  severity: 'منخفض' | 'متوسط' | 'مرتفع';
}

export interface CognitiveObstacleItem {
  title: string;
  category: string;
  severity: 'منخفض' | 'متوسط' | 'مرتفع';
  evidence: string;
  intervention: string;
}

export interface RemedialStep {
  phase: string;
  action: string;
  objective: string;
}

export interface AIDiagnosisResult {
  metrics: DiagnosticMetrics;
  classification: ThinkingStyle;
  explanation: string;              // تفسير مختصر (سطران)
  pedagogicalRecommendation: string; // توصية تربوية للأستاذ (إجراء عملي واحد)
  pedagogicalRecommendationsList?: string[]; // Exactly 3 custom recommendations
  analysisSource?: 'gemini' | 'heuristic';
  questionBreakdown?: QuestionBreakdownItem[];
  credibilityAssessment?: CredibilityAssessment;
  contradictions?: ContradictionItem[];
  cognitiveObstacles?: CognitiveObstacleItem[];
  remedialPlan?: RemedialStep[];
}

export interface ViolationRecord {
  type: string;
  time: string;
  duration?: number; // duration in seconds
  count: number;
}

export interface StudentSubmission {
  id: string;
  studentName: string;
  student_name?: string; // snake_case compatibility
  answers: StudentAnswers;
  responses?: StudentAnswers; // alias for snake_case compatibility
  analysis: AIDiagnosisResult;
  teacherNotes?: string;            // ملاحظات إضافية للأستاذ
  overriddenClassification?: ThinkingStyle; // تعديل التصنيف من طرف الأستاذ
  submittedAt: string;

  // Direct delivery receipt metadata
  deliveryReceiptId?: string;
  deliveredAt?: string;
  deliveryChannel?: 'realtime_direct' | 'offline_requeued' | 'standard_api';

  // Local / Cloud synchronization metadata
  syncState?: 'synced' | 'local_pending' | 'cloud_pending';
  localUpdatedAt?: string;
  cloudSyncedAt?: string;

  // Supervision mode data
  violations?: ViolationRecord[];
  reliabilityIndex?: number;

  // Multi-Teacher multi-tenant properties
  teacher_id?: string;
  teacherId?: string;
  teacher_email?: string;
  teacherEmail?: string;
  session_id?: string;
  sessionId?: string;
  sessionTitle?: string;
  institution?: string;
  level?: string;
  stream?: string;
  class?: string;
  classNumber?: string;
}

export interface GoogleSheetExportRecord {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sessionId: string;
  lastExportedAt: string;
  rowCount: number;
}

export interface Teacher {
  id: string; // e.g. TCH-001
  fullName: string;
  email: string;
  school: string;
  regionalAcademy: string;
  province: string;
  createdAt: string;
  specialty?: string;
  avatar?: string;
  yearsOfExperience?: string;
}

export interface DiagnosticSession {
  sessionId: string; // e.g. PS-8KX4Q2
  teacherId: string;
  teacherEmail: string;
  institution: string;
  level: string; // e.g. جذع مشترك
  stream: string; // e.g. العلوم
  classNumber: string; // e.g. 1
  title: string; // e.g. تشخيص بداية السنة
  province: string; // e.g. العمالة أو الإقليم
  createdAt: string;
  supervisedMode?: boolean; // الوضع التشخيصي المراقب
  isFrozen?: boolean; // تجميد الجلسة لمنع التلاميذ من إرسال إجابات جديدة
  formId?: string; // معرف استمارة التشخيص المتبعة
  formTitle?: string; // عنوان الاستمارة المربوطة بالجلسة
  questions?: any[]; // الأسئلة المخصصة المربوطة بالجلسة
  customWeights?: {
    tabLeave?: number;
    fullscreen?: number;
    copyPaste?: number;
    devTools?: number;
    inactivity?: number;
    browserResize?: number;
    mouseLeave?: number;
    prohibitedKeys?: number;
    multiTab?: number;
  };
}

export interface TeacherSession {
  email: string;
  fullName: string;
  school: string;
  regionalAcademy: string;
  province: string;
  loggedInAt: string;
  teacherId?: string; // TCH ID
  role?: 'teacher' | 'admin';
  specialty?: string;
  avatar?: string;
  yearsOfExperience?: string;
  token?: string;
}

export interface UserReport {
  id: string; // e.g. "REP-1001"
  timestamp: string;
  senderName?: string;
  email: string;
  reportType: 'tech_error' | 'form_error' | 'analytics_error' | 'dev_suggestion' | 'new_feature' | 'general_comment';
  title: string;
  description: string;
  imageUrl?: string;
  status: 'new' | 'review' | 'resolved' | 'closed';
}

export type QuestionType =
  | 'short'
  | 'long'
  | 'single'
  | 'multi'
  | 'scale'
  | 'boolean'
  | 'order'
  | 'grid'
  | 'file'
  | 'open';

export type PhilosophicalDimension =
  | 'التصور الأولي'
  | 'البعد الوجداني'
  | 'التفكير النقدي'
  | 'الاستدلال والحجاج'
  | 'الاستعداد للمناقشة'
  | 'تقييم عام';

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[];
  required?: boolean;
  dimension?: PhilosophicalDimension;
  weight?: number; // 1 to 5
  hint?: string;
  gridColumns?: string[];
  acceptedFileTypes?: string;
}

export interface FileAnswerPayload {
  fileName: string;
  fileSizeKb: number;
  mimeType: string;
  dataUrl?: string;
}

export interface FormDocument {
  formId: string;
  title: string;
  description: string;
  teacherId: string;
  teacherEmail: string;
  questions: FormQuestion[];
  status: 'saved' | 'published' | 'ready';
  isTemplate: boolean;
  createdAt?: string;
  updatedAt?: string;
  level?: string;
  stream?: string;
  classNumber?: string;
  lessonTopic?: string;
  pedagogicalGoal?: string;
  aim?: string;
  measuredIndicators?: string[];
}

