/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Download,
  Edit3,
  Eye,
  FileCode,
  FileText,
  Filter,
  Info,
  Layers,
  LayoutGrid,
  Link2,
  ListPlus,
  Play,
  Plus,
  QrCode,
  Rocket,
  Save,
  Scale,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { syncSessionToFirestore } from '../lib/firestoreSync';
import {
  clearFormDraftLocal,
  FormBuilderDraft,
  getFormDraftLocal,
  saveFormDraftLocal,
} from '../lib/localStore';
import {
  FormDocument,
  FormQuestion,
  PhilosophicalDimension,
  QuestionType,
} from '../types';
import { DEFAULT_GRID_COLUMNS } from './QuestionRenderer';
import StudentSimulator, { SimulatorSessionMeta } from './StudentSimulator';

export type {
  FormDocument,
  FormQuestion,
  PhilosophicalDimension,
  QuestionType,
} from '../types';

interface FormBankProps {
  teacherSession: {
    teacherId: string;
    email: string;
    fullName: string;
    role: string;
    school?: string;
    province?: string;
  };
  onSessionCreated?: (newSess: any) => void;
}

export const PHILOSOPHICAL_DIMENSIONS: PhilosophicalDimension[] = [
  'التصور الأولي',
  'البعد الوجداني',
  'التفكير النقدي',
  'الاستدلال والحجاج',
  'الاستعداد للمناقشة',
  'تقييم عام',
];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short: 'نص قصير',
  long: 'نص حجاجي طويل',
  single: 'اختيار واحد',
  multi: 'اختيار متعدد',
  scale: 'مقياس 1-5',
  boolean: 'صح / خطأ',
  order: 'ترتيب عناصر',
  grid: 'شبكة تقييم',
  file: 'رفع ملف',
  open: 'سؤال مفتوح',
};

const DIMENSION_COLORS: Record<PhilosophicalDimension, string> = {
  'التصور الأولي': 'bg-indigo-600',
  'البعد الوجداني': 'bg-rose-500',
  'التفكير النقدي': 'bg-emerald-600',
  'الاستدلال والحجاج': 'bg-blue-600',
  'الاستعداد للمناقشة': 'bg-amber-500',
  'تقييم عام': 'bg-slate-600',
};

const DIMENSION_BADGE_STYLES: Record<PhilosophicalDimension, string> = {
  'التصور الأولي': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'البعد الوجداني': 'bg-rose-50 text-rose-700 border-rose-200',
  'التفكير النقدي': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'الاستدلال والحجاج': 'bg-blue-50 text-blue-700 border-blue-200',
  'الاستعداد للمناقشة': 'bg-amber-50 text-amber-800 border-amber-200',
  'تقييم عام': 'bg-slate-100 text-slate-700 border-slate-200',
};

const ALLOWED_QUESTION_TYPES: QuestionType[] = [
  'short',
  'long',
  'single',
  'multi',
  'scale',
  'boolean',
  'order',
  'grid',
  'file',
  'open',
];

function normalizeDimension(dim: unknown): PhilosophicalDimension {
  if (typeof dim === 'string' && (PHILOSOPHICAL_DIMENSIONS as string[]).includes(dim)) {
    return dim as PhilosophicalDimension;
  }
  return 'تقييم عام';
}

function normalizeWeight(weight: unknown): number {
  const num = Number(weight);
  if (!Number.isFinite(num)) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}

function normalizeQuestion(q: Partial<FormQuestion> & { label?: string }, idx: number): FormQuestion {
  const qType: QuestionType =
    q.type && ALLOWED_QUESTION_TYPES.includes(q.type as QuestionType)
      ? (q.type as QuestionType)
      : 'long';

  let options: string[] | undefined = Array.isArray(q.options)
    ? q.options.map((o) => String(o).trim()).filter(Boolean)
    : undefined;

  if (qType === 'boolean' && (!options || options.length < 2)) {
    options = ['نعم / صحيح', 'لا / خطأ'];
  }
  if (['single', 'multi', 'order', 'grid'].includes(qType) && (!options || options.length < 2)) {
    options =
      qType === 'order'
        ? ['فهم الإشكال', 'تحليل المفاهيم', 'بناء الحجاج']
        : qType === 'grid'
        ? ['وضوح الإشكال', 'سلامة الحجاج', 'توظيف الأمثلة']
        : ['خيار أول', 'خيار ثان'];
  }

  let gridColumns: string[] | undefined = undefined;
  if (qType === 'grid') {
    gridColumns =
      Array.isArray(q.gridColumns) && q.gridColumns.length > 0
        ? q.gridColumns.map((c) => String(c).trim()).filter(Boolean)
        : [...DEFAULT_GRID_COLUMNS];
  }

  return {
    id: q.id && String(q.id).trim() ? String(q.id).trim() : `q-${idx + 1}-${Date.now()}`,
    type: qType,
    label: String(q.label || '').trim(),
    options,
    required: q.required !== false,
    dimension: normalizeDimension(q.dimension),
    weight: normalizeWeight(q.weight),
    hint: q.hint ? String(q.hint).trim() : undefined,
    gridColumns,
    acceptedFileTypes:
      qType === 'file'
        ? q.acceptedFileTypes || '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg'
        : undefined,
  };
}

// The 8 Official PhiloScan Scientific Templates
export const OFFICIAL_TEMPLATES: FormDocument[] = [
  {
    formId: 'official-perceptions',
    title: 'تشخيص التصورات حول الفلسفة',
    aim: 'قياس التمثلات والمواقف الأولية لترصد دافعية عقل التلميذ والتخوفات المسبقة حيال مادة الفلسفة.',
    measuredIndicators: ['مستوى الفضول المعرفي', 'مستوى الخوف المعرفي', 'مستوى الاستعداد للتعلم'],
    description:
      'النموذج العلمي القياسي والمعتمد لتشخيص علاقة المتعلمين بالتفلسف والأسئلة الإشكالية في مستهل السلك التأهيلي.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'p-1',
        type: 'long',
        label: 'ما هي الفلسفة بالنسبة إليك ومصدر هذا التصور في نظرك؟ (الذات أو المدرسة أو المحيط الاجتماعي)',
        dimension: 'التصور الأولي',
        weight: 4,
        required: true,
      },
      {
        id: 'p-2',
        type: 'single',
        label: 'ما هو الشعور المباشر والوجداني الذي يعتريك عند سماع كلمة الفلسفة؟',
        options: [
          'فضول فكري ورغبة في الاكتشاف',
          'خوف وارتياب من الإشكالات العقائدية',
          'صعوبة وغموض غير مفيد',
          'حياد كامل وعدم مبالاة',
        ],
        dimension: 'البعد الوجداني',
        weight: 4,
        required: true,
      },
      {
        id: 'p-3',
        type: 'long',
        label: 'لماذا تظن بوجود مادة الفلسفة في المقرر التعليمي الثانوي؟ وما هي غايتها البيداغوجية؟',
        dimension: 'التصور الأولي',
        weight: 3,
        required: true,
      },
      {
        id: 'p-4',
        type: 'scale',
        label: 'ما مدى أهمية الفلسفة من أجل تطوير كفاية التفكير الحر وتكوين شخصية الأفراد؟',
        dimension: 'تقييم عام',
        weight: 3,
        required: true,
      },
      {
        id: 'p-5',
        type: 'long',
        label: 'كيف تواجه الآراء والأفكار التي تتباين بشكل كلي وجذري مع قناعاتك الشخصية وبيئتك الموروثة؟',
        dimension: 'الاستعداد للمناقشة',
        weight: 4,
        required: true,
      },
    ],
  },
  {
    formId: 'official-critical-thinking',
    title: 'تشخيص مهارات التفكير النقدي',
    aim: 'تقييم مستويات الشك المنهجي، تماسك التبرير المنطقي، والقدرة الذاتية على فك الارتباط بالبديهيات الساذجة.',
    measuredIndicators: ['مستوى التفكير النقدي', 'مستوى التفكير السطحي', 'نسبة تماسك الاستدلال المنهجي'],
    description: 'استمارة مركبة وموجهة لقياس كفايات الشك العقلاني، الفحص المنهجي للمقولات، وتبرير التقريرات.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'ct-1',
        type: 'long',
        label: 'هل تعتقد أن كل ما يقدم كحقائق في الحياة اليومية هو صادق فعلاً أم يتعين إخضاعه دوماً للنقد والشك؟ ولماذا؟',
        dimension: 'التفكير النقدي',
        weight: 5,
        required: true,
      },
      {
        id: 'ct-2',
        type: 'single',
        label: 'ما هي أول خطوة تنهجها فور قراءتك لخبر مثير أو فكرة شائعة بمنصات التواصل؟',
        options: [
          'أصدقه مباشرة إذا كان واسع الانتشار وبصياغة فنية مقنعة',
          'أشكك فيه على عجل وأبحث عن دلائله ومصدره وسياقه',
          'لا أهتم بصحته ما دام يروق لتوجهاتي ووجداني',
          'أناقشه عاطفياً مع الأصدقاء دون تفتيش علمي للمحتوى',
        ],
        dimension: 'التفكير النقدي',
        weight: 4,
        required: true,
      },
      {
        id: 'ct-3',
        type: 'long',
        label: 'حدد بطريقتك الفرق بين الفهم العلمي المؤسس على الدليل والبرهان وبين مجرد الرأي المشاع والاعتقاد التكراري.',
        dimension: 'الاستدلال والحجاج',
        weight: 4,
        required: true,
      },
      {
        id: 'ct-4',
        type: 'scale',
        label: 'ما مستوى دافعيتك للتخلي عن قناعة تتبناها إذا أثبت لك الزملاء بالدليل العقلي الرصين أنها غير دقيقة؟',
        dimension: 'الاستعداد للمناقشة',
        weight: 3,
        required: true,
      },
      {
        id: 'ct-5',
        type: 'long',
        label: 'أورد مثالاً واضحاً من محيطك كنت تعده حقيقة مسَلَّمة، ثم اكتشفت لاحقاً محدوديته بنقد منطقي.',
        dimension: 'التفكير النقدي',
        weight: 4,
        required: false,
      },
    ],
  },
  {
    formId: 'official-argumentation',
    title: 'تشخيص مهارات الحجاج والبرهنة',
    aim: 'رصد كفايات توليد البراهين المتماسكة، مواجهة الحجج المضادة، وبناء نسق إقناعي خلو من التناقض.',
    measuredIndicators: ['مستوى الاستدلال الحجاجي', 'جودة الاستدلال', 'الاستعداد للتعلم'],
    description:
      'أداة معززة بالسيناريوهات الاستقصائية لتشخيص مدى تمكن التلميذ من آليات الاستدلال والموازنة بين الحجج المتنافسة.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'arg-1',
        type: 'long',
        label: 'مقولة: "الإنسان حر حرية مطلقة" — ابنِ حجتين منطقيتين لتأييد هذه الأطروحة، وحجتين معارضتين للموازنة.',
        dimension: 'الاستدلال والحجاج',
        weight: 5,
        required: true,
      },
      {
        id: 'arg-2',
        type: 'single',
        label: 'لكي تقنع طرفاً يصر على رأيه في مناظرة ثقافية، أي الأساليب الآتية تراها سليمة؟',
        options: [
          'التشبث بالمشاعر والتعاطف البديهي',
          'بناء استدلال منطقي مع توظيف أمثلة حية واقعية دامغة',
          'رفع نبرة الصوت وصيغة الحزم الشخصي',
          'الاعتماد على آراء الأغلبية واستشهادات الرأي العام',
        ],
        dimension: 'الاستدلال والحجاج',
        weight: 4,
        required: true,
      },
      {
        id: 'arg-3',
        type: 'order',
        label: 'رتب خطوات بناء الرد الحجاجي الفعال عند مواجهة حجة مضادة في القسم:',
        options: [
          'الإنصات الدقيق وتحديد دعامة الحجة المضادة',
          'استخراج التناقض أو الحدود المنطقية في الدعوى',
          'صياغة أطروحة بديلة مدعومة بمثال وبرهان',
        ],
        dimension: 'الاستدلال والحجاج',
        weight: 4,
        required: true,
      },
      {
        id: 'arg-4',
        type: 'scale',
        label: 'ما مدى ثقتك الشخصية في صياغة مقال حجاجي فلسفي متكامل تدافع فيه عن أطروحة غير مألوفة لديك؟',
        dimension: 'البعد الوجداني',
        weight: 3,
        required: true,
      },
      {
        id: 'arg-5',
        type: 'long',
        label: 'اشرح كيف يمكن للاستناد إلى حجة ضعيفة أن يتسبب في إضعاف قضية عادلة.',
        dimension: 'التفكير النقدي',
        weight: 4,
        required: true,
      },
    ],
  },
  {
    formId: 'official-values',
    title: 'تشخيص القيم والمواقف الأخلاقية',
    aim: 'سبر المنظومة القيمية والأخلاقية والتفاعل مع مفاهيم العدالة والتسامح وحرية الغير في الفضاء المشترك.',
    measuredIndicators: ['الوعي القيمي الإيجابي', 'احترام المشترك الإنساني', 'مستوى النضج الأخلاقي'],
    description: 'نموذج دقيق لدراسة تمثلات التلميذ بخصوص معضلات الحرية، المسؤولية، والوعي القيمي بالعيش المشترك.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'val-1',
        type: 'long',
        label: 'ما هي القيمة الأخلاقية التي تعتبرها أساسية وموجهة لسائر سلوكيات الأفراد بالمجتمعات؟ وضح سبب ريادتها.',
        dimension: 'التصور الأولي',
        weight: 4,
        required: true,
      },
      {
        id: 'val-2',
        type: 'single',
        label: 'عندما تشهد تجاوزاً على مبدأ التسامح أو حقوق زميل بالصف، ما هو رد فعلك التلقائي؟',
        options: [
          'أتدخل بحكمة وهدوء لمناقشة مكمن الخلل عقلانياً',
          'أتجاهل الواقعة تفادياً لتوترات وسجالات غير مجدية لي',
          'أعبر عن رفضي من منطلق انفعالي وتضامن عاطفي حاد',
          'أترك معالجة الأمر للمشرفين التربويين دون تدخل ذاتي',
        ],
        dimension: 'الاستعداد للمناقشة',
        weight: 4,
        required: true,
      },
      {
        id: 'val-3',
        type: 'long',
        label: 'هل تعتقد بأن القيم الأخلاقية ثابتة عبر الأجيال أم متغيرة بتطور شروط الثقافة والمجتمع؟',
        dimension: 'التفكير النقدي',
        weight: 5,
        required: true,
      },
      {
        id: 'val-4',
        type: 'scale',
        label: 'ما مدى مساهمة تأمل نظريات الأخلاق الفلسفية في تقويم وتوجيه تصرفات الفرد المعاصر؟',
        dimension: 'تقييم عام',
        weight: 3,
        required: true,
      },
      {
        id: 'val-5',
        type: 'long',
        label: 'كيف تفصل في ذهنك بين ممارسة الحرية الشخصية وبين واجب الالتزام باحترام حرية الآخرين؟',
        dimension: 'الاستدلال والحجاج',
        weight: 4,
        required: true,
      },
    ],
  },
  {
    formId: 'official-readiness',
    title: 'تشخيص الاستعداد والدافعية للتعلم',
    aim: 'رصد الجاهزية الذهنية والنفسية ومستويات الشغف لمعالجة الموضوعات والأشكلة الفلسفية المعقدة.',
    measuredIndicators: ['مستوى الاستعداد للتعلم', 'دافعية المشاركة الفعالة', 'مستوى الصمود الإشكالي'],
    description: 'استمارة تهدف لاستكشاف رغبة التلميذ في الاندماج الفكري وطبيعة طرائق التدريس المفضلة لديه.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'read-1',
        type: 'long',
        label: 'ما هي أهم أهدافك الشخصية التي تتوقع ملامستها من درس الفلسفة في نهاية السنة الجارية؟',
        dimension: 'التصور الأولي',
        weight: 3,
        required: true,
      },
      {
        id: 'read-2',
        type: 'single',
        label: 'عند مواجهتك لنص فلسفي معقد ومستغلق المفردات في الواجبات المنزلية، كيف تتصرف عادة؟',
        options: [
          'أبحث عن ملخصات جاهزة في الإنترنت لأحفظها',
          'أقرأ النص بنظرة تأملية وأعمل على تفكيك مفاهيمه ومحاوره مراراً',
          'أترك الأمر للاستفسار ومناقشة أستاذ المادة داخل الفصل',
          'أشعر بالضجر التام والإحباط المعيق للمواصلة',
        ],
        dimension: 'البعد الوجداني',
        weight: 4,
        required: true,
      },
      {
        id: 'read-3',
        type: 'grid',
        label: 'قيّم مدى استعدادك وملاءمتك للأنشطة الصفية التالية:',
        options: ['المناظرات الصفية', 'تحليل النصوص الفلسفية', 'كتابة المقال الإنشائي'],
        gridColumns: ['ضعيف', 'متوسط', 'جيد', 'ممتاز'],
        dimension: 'الاستعداد للمناقشة',
        weight: 4,
        required: true,
      },
      {
        id: 'read-4',
        type: 'scale',
        label: 'ما مستوى شغفك بالبحث الشخصي ومطالعة قضايا فلسفية خارج جدول الحصص الرسمي؟',
        dimension: 'البعد الوجداني',
        weight: 3,
        required: true,
      },
      {
        id: 'read-5',
        type: 'long',
        label: 'ما هي التخوفات المنهجية أو المهارية التي تظنها قد تحول دون إظهار تميزك الفكري مع المجموعة؟',
        dimension: 'تقييم عام',
        weight: 4,
        required: false,
      },
    ],
  },
  {
    formId: 'official-relationship',
    title: 'تشخيص العلاقة بمادة الفلسفة والامتحان',
    aim: 'رصد التمثلات الانفعالية المرتبطة بضغط الامتحانات وصور الدروس في محيط التلميذ المعاش.',
    measuredIndicators: ['الألفة الوجدانية بمادة الفلسفة', 'مستوى التوجس من الامتحان الوطني', 'دافعية الإنجاز الدراسي'],
    description: 'استقصاء نوعي مخصص لتبديد الحواجز والمنفرات النفسية التي تنعكس سلباً على التحصيل المدرسي.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'rel-1',
        type: 'long',
        label: 'كيف يتداول أفراد عائلتك أو أقرانك مادة الفلسفة؟ وما انعكاس هذا الخطاب على تحفزك المسبق؟',
        dimension: 'التصور الأولي',
        weight: 4,
        required: true,
      },
      {
        id: 'rel-2',
        type: 'single',
        label: 'في ضوء الفهم السائد، هل تعتقد بإمكانية تفوق تلاميذ الشعب العلمية في مادة الفلسفة؟',
        options: [
          'نعم، لأن التفكير والمنهج المنطقي لا يشترط شعبة أدبية',
          'أظنها مادة موجهة للأدبيين لقدرتهم التعبيرية فقط',
          'الصعوبة تعم الجميع بغض النظر عن المسلك والشعبة',
          'الأمر مرتبط بالقدرة على حفظ النماذج الجاهزة مسبقاً',
        ],
        dimension: 'التفكير النقدي',
        weight: 4,
        required: true,
      },
      {
        id: 'rel-3',
        type: 'long',
        label: 'اذكر هواجسك الأبرز أو الصعوبات اللغوية والمنهجية التي تخشاها عند التفكير في الامتحان الإنشائي الفلسفي.',
        dimension: 'البعد الوجداني',
        weight: 4,
        required: true,
      },
      {
        id: 'rel-4',
        type: 'scale',
        label: 'ما مدى ثقتك في موضوعية معايير تنقيط المصححين للإنشاء الفلسفي بالامتحان الوطني؟',
        dimension: 'تقييم عام',
        weight: 3,
        required: true,
      },
      {
        id: 'rel-5',
        type: 'long',
        label: 'صغ طلباً تربوياً لأستاذ الفلسفة يبين الدعم الذي تحتاجه لتهيئة بيئة تفاعلية ملائمة للتعلم.',
        dimension: 'الاستعداد للمناقشة',
        weight: 3,
        required: false,
      },
    ],
  },
  {
    formId: 'official-knowledge-truth',
    title: 'تشخيص تمثلات المعرفة والحقيقة والعلوم',
    aim: 'سبر الكفاءة الإبستمولوجية والتصورات العميقة للمعارف والاعتقاد بنهائية العلوم.',
    measuredIndicators: ['مستوى الوعي العلمي', 'الانتقال المفهومي الرصين', 'فهم نسبية الحقيقة والمعرفة'],
    description: 'استبانة مصممة لربط درس الفلسفة بمناهج العلوم والرياضيات والتحول من الرأي السطحي نحو الحقيقة المبنية.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'kt-1',
        type: 'long',
        label: 'هل ترى أن الحقيقة مبنية بالجهد الإنساني المستمر أم أنها معطاة وجاهزة وتنتظر تقبلها بتسليم؟ علل وجهة نظرك.',
        dimension: 'التفكير النقدي',
        weight: 5,
        required: true,
      },
      {
        id: 'kt-2',
        type: 'single',
        label: 'ما هي الطريقة الأوثق في نظرك لبناء يقين علمي حيال إحدى قضايا الطبيعة؟',
        options: [
          'المنهج الاستدلالي العقلي الخالص (كالرياضيات)',
          'التجربة المشاهدة والمختبر المكرر بصرامة',
          'الإجماع العام للخبراء وفائدته العملية',
          'الحدس الملهم والإشراق الذاتي الداخلي',
        ],
        dimension: 'الاستدلال والحجاج',
        weight: 4,
        required: true,
      },
      {
        id: 'kt-3',
        type: 'long',
        label: 'أوضح ما يفيده لك مصطلح "الرأي السائد المغلف برداء الحقيقة" وتأثيره على الابتكار العقلي.',
        dimension: 'التفكير النقدي',
        weight: 4,
        required: true,
      },
      {
        id: 'kt-4',
        type: 'scale',
        label: 'ما مدى اعتقادك بوجود تكامل بين مناهج الفلسفة التحليلية والعلوم الفيزيائية والبيولوجية المعاصرة؟',
        dimension: 'التصور الأولي',
        weight: 3,
        required: true,
      },
      {
        id: 'kt-5',
        type: 'long',
        label: 'كيف تميز بين القول العلمي القابل للتكذيب والتصحيح وبين القول العقائدي الثابت؟',
        dimension: 'الاستدلال والحجاج',
        weight: 4,
        required: true,
      },
    ],
  },
  {
    formId: 'official-discussion-communication',
    title: 'تشخيص مهارات النقاش والتواصل الصفي',
    aim: 'رصد الجاهزية للمشاركة في الحوارات، آداب الاستماع الفلسفي الرصين، وقدرات الإنصات الفعال.',
    measuredIndicators: ['مستوى آداب الحوار الفكري', 'جودة الإنصات التفاعلي', 'مستوى التواصل والتعبير المنهجي'],
    description: 'استمارة تتبع كفايات التواصل اللغوي والمنطقي وحضور آداب الخلاف الفلسفي بالساحة التعليمية.',
    teacherId: 'system_admin',
    teacherEmail: 'phillofikr@gmail.com',
    isTemplate: true,
    status: 'ready',
    questions: [
      {
        id: 'dc-1',
        type: 'long',
        label: 'عندما تدير جماعة الفصل نقاشاً محتدماً، ما هي ركائز وآداب التواصل الصفي التي تلتزم بها ذاتياً؟',
        dimension: 'الاستعداد للمناقشة',
        weight: 4,
        required: true,
      },
      {
        id: 'dc-2',
        type: 'single',
        label: 'إذا قدم زميل بالقسم أطروحة تجدها خاطئة كلياً أو ضعيفة منطقياً، كيف تتصرف مع قوله؟',
        options: [
          'أقاطعه فوراً لتصحيح رأيه أمام الفصل',
          'أنصت له بهدوء وأسجل براهينه ثم أرد بالحجة البنائية والبديل المنهجي',
          'أتجاهل رأيه وأعبر عن استغرابي مع الزملاء',
          'أفضل التزام الصمت والانسحاب من الحوار',
        ],
        dimension: 'الاستعداد للمناقشة',
        weight: 5,
        required: true,
      },
      {
        id: 'dc-3',
        type: 'long',
        label: 'اشرح كيف يساهم الحوار الفلسفي الموجه بالصف المدرسي في تعميق ثقافة التسامح وتقبل الاختلاف.',
        dimension: 'البعد الوجداني',
        weight: 4,
        required: true,
      },
      {
        id: 'dc-4',
        type: 'scale',
        label: 'ما مدى رغبتك في إشراك باقي تلاميذ المؤسسة في ورشات مناظرة ثقافية بإشراف الأستاذ؟',
        dimension: 'الاستعداد للمناقشة',
        weight: 3,
        required: true,
      },
      {
        id: 'dc-5',
        type: 'long',
        label: 'أورد واقعة تراجعت فيها عن قناعة سابقة بعد اقتناعك بقوة الحجة المنطقية التي طرحها زميل لك.',
        dimension: 'التفكير النقدي',
        weight: 4,
        required: false,
      },
    ],
  },
];

export default function FormBank({ teacherSession, onSessionCreated }: FormBankProps) {
  const [forms, setForms] = useState<FormDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'saved' | 'published' | 'ready'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedAiStatus, setSelectedAiStatus] = useState<string>('all');
  const [sortByDate, setSortByDate] = useState<'newest' | 'oldest'>('newest');
  const [customViewMode, setCustomViewMode] = useState<'table' | 'cards'>('table');

  // Builder / Studio State
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [builderMode, setBuilderMode] = useState<'edit' | 'simulate'>('edit');
  const [creatorTab, setCreatorTab] = useState<'visual' | 'ai' | 'code'>('visual');
  const [editFormId, setEditFormId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'saved' | 'published' | 'ready'>('saved');
  const [questions, setQuestions] = useState<FormQuestion[]>([
    {
      id: '1',
      type: 'long',
      label: 'ما هي الفلسفة بالنسبة إليك ومصدر تمثلها في نظرك؟ (الفصل والذات)',
      required: true,
      dimension: 'التصور الأولي',
      weight: 4,
    },
  ]);

  // Custom Metadata Fields
  const [metaLevel, setMetaLevel] = useState<string>('ثانية باك');
  const [metaStream, setMetaStream] = useState<string>('شعبة الآداب والعلوم الإنسانية - مسلك الآداب');
  const [metaClassNumber, setMetaClassNumber] = useState<string>('فوج 1');
  const [metaLessonTopic, setMetaLessonTopic] = useState<string>('مفهوم الشخص والغير (الأنا والوعي الأخلاقي)');
  const [metaPedagogicalGoal, setMetaPedagogicalGoal] = useState<string>(
    'تشخيص وتمايز المقاربة الحجاجية والوجدانية للطلبة مطلع العام الدراسي.'
  );

  // Per-question inline edit + AI Refine state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [refiningQuestionId, setRefiningQuestionId] = useState<string | null>(null);
  const [refineModes, setRefineModes] = useState<Record<string, 'clarity' | 'critical' | 'options'>>({});
  const [aiSuggestionByQid, setAiSuggestionByQid] = useState<
    Record<
      string,
      {
        label: string;
        hint?: string;
        dimension: PhilosophicalDimension;
        weight: number;
        options?: string[];
        gridColumns?: string[];
        rationale: string;
      }
    >
  >({});

  // Field Adder state
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('long');
  const [newQuestionLabel, setNewQuestionLabel] = useState<string>('');
  const [newQuestionOptions, setNewQuestionOptions] = useState<string>('خيار 1, خيار 2, خيار 3, خيار 4');
  const [newQuestionGridColumns, setNewQuestionGridColumns] = useState<string>(DEFAULT_GRID_COLUMNS.join(', '));
  const [newQuestionHint, setNewQuestionHint] = useState<string>('');
  const [newQuestionDimension, setNewQuestionDimension] = useState<PhilosophicalDimension>('التفكير النقدي');
  const [newQuestionWeight, setNewQuestionWeight] = useState<number>(3);
  const [newQuestionRequired, setNewQuestionRequired] = useState<boolean>(true);

  // AI Full-Form Generator state
  const [aiTopic, setAiTopic] = useState<string>('');
  const [aiLevel, setAiLevel] = useState<string>('ثانية باك');
  const [aiStream, setAiStream] = useState<string>('شعبة العلوم الفيزيائية');
  const [aiGoal, setAiGoal] = useState<string>('تشخيص مهارات التفكير النقدي وفهم التمثلات الذهنية حول الدرس.');
  const [aiQuestionCount, setAiQuestionCount] = useState<number>(5);
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [aiLoadingMessage, setAiLoadingMessage] = useState<string>('جاري صياغة الأسئلة الفلسفية...');

  // Code Builder state
  const [codeType, setCodeType] = useState<'json' | 'html'>('json');
  const [rawCodeText, setRawCodeText] = useState<string>('');
  const [codeValidationError, setCodeValidationError] = useState<string | null>(null);
  const [parsedCodeQuestions, setParsedCodeQuestions] = useState<FormQuestion[]>([]);
  const [jsonValidation, setJsonValidation] = useState<{
    isValid: boolean;
    hasTitle: boolean;
    hasQuestions: boolean;
    hasValidTypes: boolean;
    hasValidOptions: boolean;
    errors: string[];
  }>({
    isValid: false,
    hasTitle: false,
    hasQuestions: false,
    hasValidTypes: false,
    hasValidOptions: false,
    errors: [],
  });

  // Live Interactive Simulator state
  const [simAnswers, setSimAnswers] = useState<Record<string, any>>({});
  const [simulatorModalData, setSimulatorModalData] = useState<{
    title: string;
    description?: string;
    questions: FormQuestion[];
    sessionMeta?: SimulatorSessionMeta;
    initialAnswers?: Record<string, any>;
    showPedagogicalMetaByDefault?: boolean;
    returnLabel?: string;
    syncWithBuilder?: boolean;
  } | null>(null);

  const openBuilderInSimulatorModal = () => {
    setSimulatorModalData({
      title: formTitle.trim() || 'استمارة تشخيصية قيد التصميم',
      description: formDesc,
      questions,
      sessionMeta: {
        level: metaLevel,
        stream: metaStream,
        classNumber: metaClassNumber,
        lessonTopic: metaLessonTopic,
      },
      initialAnswers: simAnswers,
      showPedagogicalMetaByDefault: true,
      returnLabel: 'إغلاق والعودة إلى لوحة تحرير الاستمارة',
      syncWithBuilder: true,
    });
  };

  const openFormInSimulatorModal = (target: FormDocument) => {
    setSimulatorModalData({
      title: target.title,
      description: target.description,
      questions: target.questions,
      sessionMeta: {
        institution: teacherSession.school,
        province: teacherSession.province,
        level: target.level,
        stream: target.stream,
        classNumber: target.classNumber,
        lessonTopic: target.lessonTopic,
      },
      initialAnswers: {},
      showPedagogicalMetaByDefault: true,
      returnLabel: 'إغلاق والعودة إلى بنك الاستمارات',
      syncWithBuilder: false,
    });
  };

  // Auto-Draft & JSON File Import/Export state
  const [savedDraftPrompt, setSavedDraftPrompt] = useState<FormBuilderDraft | null>(null);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  // Preview Modal state
  const [previewForm, setPreviewForm] = useState<FormDocument | null>(null);
  const [previewModalTab, setPreviewModalTab] = useState<'structure' | 'interactive'>('structure');
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});

  // Confirm Delete Modal + Toast
  const [confirmDeleteFormId, setConfirmDeleteFormId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Instant Session Launch + Share Modal state
  const [transferForm, setTransferForm] = useState<FormDocument | null>(null);
  const [transferSessionForm, setTransferSessionForm] = useState<{
    title: string;
    institution: string;
    province: string;
    level: string;
    stream: string;
    classNumber: string;
    supervisedMode: boolean;
  }>({
    title: '',
    institution: '',
    province: '',
    level: 'جذع مشترك',
    stream: 'العلوم',
    classNumber: '1',
    supervisedMode: true,
  });
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [questionsPreviewOpen, setQuestionsPreviewOpen] = useState<boolean>(false);
  const [launchedSession, setLaunchedSession] = useState<{
    sessionId: string;
    title: string;
    level?: string;
    stream?: string;
    classNumber?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<'code' | 'link' | null>(null);
  const [qrImageError, setQrImageError] = useState<boolean>(false);

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3800);
  };

  // Load any unsaved draft on mount
  useEffect(() => {
    let active = true;
    if (!teacherSession?.email) return;
    getFormDraftLocal(teacherSession.email).then((draft) => {
      if (!active) return;
      if (draft && (draft.formTitle.trim() || draft.questions.length > 0)) {
        setSavedDraftPrompt(draft);
      }
    });
    return () => {
      active = false;
    };
  }, [teacherSession?.email]);

  // Debounced auto-save when editing inside Builder
  useEffect(() => {
    if (!isCreating || !teacherSession?.email) return;
    const timer = setTimeout(() => {
      const nowIso = new Date().toISOString();
      saveFormDraftLocal({
        teacherEmail: teacherSession.email,
        editFormId,
        formTitle,
        formDesc,
        formStatus,
        questions,
        metaLevel,
        metaStream,
        metaClassNumber,
        metaLessonTopic,
        metaPedagogicalGoal,
        savedAt: nowIso,
      }).then(() => {
        setLastAutoSavedAt(nowIso);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [
    isCreating,
    teacherSession?.email,
    editFormId,
    formTitle,
    formDesc,
    formStatus,
    questions,
    metaLevel,
    metaStream,
    metaClassNumber,
    metaLessonTopic,
    metaPedagogicalGoal,
  ]);

  // Update smart option placeholders when newQuestionType changes
  const handleNewTypeChange = (nextType: QuestionType) => {
    setNewQuestionType(nextType);
    if (nextType === 'order') {
      setNewQuestionOptions('فهم الإشكال الفلسفي, تحليل المفاهيم الأساسية, بناء الحجاج والأمثلة, المناقشة والتركيب');
    } else if (nextType === 'grid') {
      setNewQuestionOptions('وضوح الإشكال, سلامة الاستدلال الحجاجي, توظيف الأمثلة الفلسفية');
      setNewQuestionGridColumns(DEFAULT_GRID_COLUMNS.join(', '));
    } else if (nextType === 'single' || nextType === 'multi') {
      if (
        newQuestionOptions.includes('فهم الإشكال الفلسفي') ||
        newQuestionOptions.includes('وضوح الإشكال')
      ) {
        setNewQuestionOptions('خيار 1, خيار 2, خيار 3, خيار 4');
      }
    }
  };

  // Pre-load JSON editor when switching to code tab
  useEffect(() => {
    if (creatorTab === 'code' && !rawCodeText.trim()) {
      setRawCodeText(
        JSON.stringify(
          {
            title: formTitle.trim() || 'استقصاء مهارات التفكير النقدي وفحص الحجج',
            description:
              formDesc.trim() || 'استمارة مخصصة لرصد مستويات النقد والتحليل العقلاني لدى تلاميذ الفصل.',
            level: metaLevel,
            stream: metaStream,
            lessonTopic: metaLessonTopic,
            pedagogicalGoal: metaPedagogicalGoal,
            questions:
              questions.length > 0
                ? questions
                : [
                    {
                      id: 'q-ct-1',
                      type: 'long',
                      label: 'ما هو الفارق الجوهري والمنهجي في نظرك بين الحجة العلمية والاعتقاد التكراري؟',
                      dimension: 'التفكير النقدي',
                      weight: 4,
                      required: true,
                    },
                  ],
          },
          null,
          2
        )
      );
    }
  }, [creatorTab]);

  // Real-time Semantic JSON Verification Engine
  useEffect(() => {
    if (codeType !== 'json' || !rawCodeText.trim()) {
      setJsonValidation({
        isValid: false,
        hasTitle: false,
        hasQuestions: false,
        hasValidTypes: false,
        hasValidOptions: false,
        errors: [],
      });
      return;
    }

    const errors: string[] = [];
    let isValid = false;
    let hasTitle = false;
    let hasQuestions = false;
    let hasValidTypes = true;
    let hasValidOptions = true;

    try {
      const parsed = JSON.parse(rawCodeText);
      isValid = true;

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        errors.push('بنية ملف جيسون يجب أن تكون كائناً (Object) متكاملاً.');
        isValid = false;
      } else {
        if (parsed.title) {
          if (typeof parsed.title !== 'string' || parsed.title.trim().length < 3) {
            errors.push('العنوان "title" يجب أن يكون نصاً لا يقل عن 3 أحرف.');
          } else if (parsed.title.trim().length > 200) {
            errors.push('العنوان "title" طويل للغاية (الأقصى 200 حرف).');
          } else {
            hasTitle = true;
          }
        } else {
          errors.push('حقل العنوان الأساسي "title" مفقود في هيكلة جيسون.');
        }

        if (parsed.questions) {
          if (!Array.isArray(parsed.questions)) {
            errors.push('حقل الأسئلة "questions" يجب أن يكون مصفوفة ممتلئة (Array).');
          } else if (parsed.questions.length === 0) {
            errors.push('يجب إدراج سؤال كاشف واحد على الأقل في مصفوفة "questions".');
          } else {
            hasQuestions = true;
            parsed.questions.forEach((q: any, idx: number) => {
              const qNum = idx + 1;
              if (!q.label || typeof q.label !== 'string' || q.label.trim().length < 4) {
                errors.push(`السؤال رقم ${qNum}: حقل صياغة السؤال "label" مفقود أو قصير جداً.`);
              }
              if (q.type) {
                if (!ALLOWED_QUESTION_TYPES.includes(q.type)) {
                  errors.push(`السؤال رقم ${qNum}: نوع السؤال "${q.type}" غير مدعوم.`);
                  hasValidTypes = false;
                } else if (['single', 'multi', 'order', 'grid'].includes(q.type)) {
                  if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
                    errors.push(
                      `السؤال رقم ${qNum} من نوع "${q.type}": يستلزم مصفوفة خيارات "options" تحتوي على عنصرين على الأقل.`
                    );
                    hasValidOptions = false;
                  } else if (!q.options.every((opt: any) => typeof opt === 'string' && opt.trim().length > 0)) {
                    errors.push(`السؤال رقم ${qNum}: أحد الخيارات المضمنة فارغ أو غير نصي.`);
                    hasValidOptions = false;
                  }
                }
              } else {
                errors.push(`السؤال رقم ${qNum}: حقل نوع السؤال "type" مفقود.`);
                hasValidTypes = false;
              }
            });
          }
        } else {
          errors.push('مصفوفة الأسئلة "questions" مفقودة في صياغة جيسون.');
        }
      }
    } catch (err: any) {
      errors.push(`خطأ تركيبي في JSON: ${err.message}`);
    }

    setJsonValidation({
      isValid,
      hasTitle,
      hasQuestions,
      hasValidTypes: hasValidTypes && hasQuestions,
      hasValidOptions: hasValidOptions && hasQuestions,
      errors,
    });
  }, [rawCodeText, codeType]);

  // Fetch forms (Backend + Firestore + Official Templates)
  const fetchForms = async () => {
    setLoading(true);
    try {
      const mergedMap = new Map<string, FormDocument>();

      try {
        const res = await fetch(`/api/forms?email=${encodeURIComponent(teacherSession.email)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.forms)) {
            data.forms.forEach((f: FormDocument) => {
              if (f?.formId) mergedMap.set(f.formId, f);
            });
          }
        }
      } catch (apiErr) {
        console.warn('Backend /api/forms fetch issue:', apiErr);
      }

      if (auth.currentUser) {
        try {
          const fsEmail = (auth.currentUser.email || teacherSession.email || '').toLowerCase().trim();
          const q = query(
            collection(db, 'forms'),
            where('teacherEmail', 'in', [fsEmail, 'phillofikr@gmail.com'])
          );
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Firestore read timeout')), 3000)
          );
          const querySnapshot = await Promise.race([getDocs(q), timeoutPromise]);
          querySnapshot.forEach((docSnap) => {
            const fData = { ...docSnap.data() } as FormDocument;
            if (fData?.formId) mergedMap.set(fData.formId, fData);
          });
        } catch (fsErr) {
          console.warn('Firestore Read skipped/fallback:', fsErr);
        }
      }

      OFFICIAL_TEMPLATES.forEach((official) => {
        if (!mergedMap.has(official.formId)) {
          mergedMap.set(official.formId, official);
        }
      });

      setForms(Array.from(mergedMap.values()));
    } catch (err) {
      console.error('Forms Load Error:', err);
      setForms(OFFICIAL_TEMPLATES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teacherSession?.teacherId) {
      fetchForms();
    }
  }, [teacherSession?.teacherId]);

  const resetFormState = () => {
    setIsCreating(false);
    setBuilderMode('edit');
    setEditFormId(null);
    setFormTitle('');
    setFormDesc('');
    setFormStatus('saved');
    setQuestions([
      {
        id: '1',
        type: 'long',
        label: 'ما هي الفلسفة بالنسبة إليك ومصدر تمثلها في نظرك؟ (الفصل والذات)',
        required: true,
        dimension: 'التصور الأولي',
        weight: 4,
      },
    ]);
    setEditingQuestionId(null);
    setAiSuggestionByQid({});
    setSimAnswers({});
    setParsedCodeQuestions([]);
    setRawCodeText('');
    setCodeValidationError(null);
    setCreatorTab('visual');
    setLastAutoSavedAt(null);
  };

  const handleResumeDraft = (draft: FormBuilderDraft) => {
    setEditFormId(draft.editFormId);
    setFormTitle(draft.formTitle);
    setFormDesc(draft.formDesc);
    setFormStatus(draft.formStatus);
    setQuestions(draft.questions.map((q, idx) => normalizeQuestion(q, idx)));
    setMetaLevel(draft.metaLevel || 'ثانية باك');
    setMetaStream(draft.metaStream || 'شعبة الآداب والعلوم الإنسانية');
    setMetaClassNumber(draft.metaClassNumber || 'فوج 1');
    setMetaLessonTopic(draft.metaLessonTopic || 'مفهوم الشخص والغير');
    setMetaPedagogicalGoal(draft.metaPedagogicalGoal || 'تشخيص بيداغوجي عام.');
    setSavedDraftPrompt(null);
    setBuilderMode('edit');
    setCreatorTab('visual');
    setIsCreating(true);
    triggerToast('تم استئناف المسودة المحفوظة محلياً بنجاح.', 'success');
  };

  const handleDiscardSavedDraft = async () => {
    if (teacherSession?.email) {
      await clearFormDraftLocal(teacherSession.email);
    }
    setSavedDraftPrompt(null);
    triggerToast('تم حذف المسودة المؤقتة.', 'success');
  };

  // Save Custom Questionnaire to Backend + Firestore + Clear Auto-Draft
  const handleSaveForm = async () => {
    if (!formTitle.trim()) {
      triggerToast('يرجى تحديد عنوان ملائم للاستمارة قبل الحفظ.', 'error');
      return;
    }
    if (questions.length === 0) {
      triggerToast('يجب إدراج سؤال كاشف واحد على الأقل للاستبيان.', 'error');
      return;
    }

    const normalizedQuestions = questions.map((q, idx) => normalizeQuestion(q, idx));
    const fid = editFormId || `form-${Date.now()}`;
    const formPayload: FormDocument = {
      formId: fid,
      title: formTitle.trim(),
      description: formDesc.trim() || 'استمارة تتبع التمثلات الدلالية والذهنية لطلبة الفلسفة.',
      questions: normalizedQuestions,
      status: formStatus,
      isTemplate: false,
      teacherId: teacherSession.teacherId,
      teacherEmail: (auth.currentUser?.email || teacherSession.email || '').toLowerCase().trim(),
      createdAt: editFormId
        ? forms.find((f) => f.formId === fid)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      level: metaLevel,
      stream: metaStream,
      classNumber: metaClassNumber,
      lessonTopic: metaLessonTopic,
      pedagogicalGoal: metaPedagogicalGoal,
    };

    try {
      const apiRes = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPayload),
      });

      if (auth.currentUser) {
        try {
          await Promise.race([
            setDoc(doc(db, 'forms', fid), formPayload),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Firestore save timeout')), 3000)),
          ]);
        } catch (fsErr) {
          console.warn('Firestore form sync skipped (saved on server):', fsErr);
        }
      }

      if (!apiRes.ok && !auth.currentUser) {
        throw new Error('تعذر حفظ الاستمارة على الخادم.');
      }

      await clearFormDraftLocal(teacherSession.email);
      setSavedDraftPrompt(null);
      triggerToast(
        editFormId ? 'تم تحديث الاستمارة بنجاح!' : 'تم حفظ الاستمارة الجديدة في بنكك الشخصي بنجاح!',
        'success'
      );

      resetFormState();
      await fetchForms();
    } catch (err) {
      console.error('Error saving form:', err);
      const localForms = [...forms.filter((f) => f.formId !== fid), formPayload];
      setForms(localForms);
      resetFormState();
      triggerToast('تم حفظ الاستمارة في العرض الحالي وتعذر الاتصال بالخادم.', 'error');
    }
  };

  // Delete Custom Questionnaire
  const handleDeleteForm = (fid: string) => {
    setConfirmDeleteFormId(fid);
  };

  const executeDeleteForm = async () => {
    if (!confirmDeleteFormId) return;
    const fid = confirmDeleteFormId;
    setConfirmDeleteFormId(null);
    try {
      await fetch(`/api/forms/${encodeURIComponent(fid)}`, {
        method: 'DELETE',
      });
      if (auth.currentUser) {
        try {
          await deleteDoc(doc(db, 'forms', fid));
        } catch (fsErr) {
          console.warn('Firestore delete skipped:', fsErr);
        }
      }
      triggerToast('تمت إزالة الاستمارة بنجاح من البنك.', 'success');
      await fetchForms();
    } catch (err) {
      console.error('Delete error:', err);
      setForms(forms.filter((f) => f.formId !== fid));
      triggerToast('تمت الإزالة من العرض الحالي.', 'success');
    }
  };

  // Copy Official Template or Existing Form as custom draft
  const handleCopyAsDraft = (template: FormDocument) => {
    setEditFormId(null);
    setFormTitle(`${template.title} (نسخة معدلة)`);
    setFormDesc(template.description);
    setQuestions(
      template.questions.map((q, index) =>
        normalizeQuestion({ ...q, id: `copied-q-${index}-${Date.now()}` }, index)
      )
    );
    setFormStatus('saved');
    setMetaLevel(template.level || 'ثانية باك');
    setMetaStream(template.stream || 'شعبة الآداب والعلوم الإنسانية');
    setMetaClassNumber(template.classNumber || 'فوج 1');
    setMetaLessonTopic(template.lessonTopic || template.title);
    setMetaPedagogicalGoal(template.aim || template.pedagogicalGoal || 'تشخيص بيداغوجي ومفاهيمي.');

    setBuilderMode('edit');
    setCreatorTab('visual');
    setIsCreating(true);
    triggerToast('تم نسخ بنود الاستمارة لتخصيصها بحرية.', 'success');
  };

  const handleEditForm = (target: FormDocument) => {
    if (target.isTemplate) {
      triggerToast('القوالب القياسية محمية. يرجى استخدام زر (نسخ) لتخصيص نسخة خاصة بك.', 'error');
      return;
    }
    setEditFormId(target.formId);
    setFormTitle(target.title);
    setFormDesc(target.description);
    setFormStatus(target.status);
    setQuestions(target.questions.map((q, idx) => normalizeQuestion(q, idx)));

    setMetaLevel(target.level || 'ثانية باك');
    setMetaStream(target.stream || 'شعبة الآداب والعلوم الإنسانية');
    setMetaClassNumber(target.classNumber || 'فوج 1');
    setMetaLessonTopic(target.lessonTopic || 'مفهوم الشخص والغير');
    setMetaPedagogicalGoal(target.pedagogicalGoal || 'تشخيص بيداغوجي عام.');

    setBuilderMode('edit');
    setCreatorTab('visual');
    setIsCreating(true);
  };

  // Export & Import JSON file helpers
  const exportFormAsJsonFile = (docToExport: {
    title: string;
    description: string;
    level?: string;
    stream?: string;
    classNumber?: string;
    lessonTopic?: string;
    pedagogicalGoal?: string;
    questions: FormQuestion[];
  }) => {
    const payload = {
      schemaVersion: 'philoscan-form-v2',
      exportedAt: new Date().toISOString(),
      title: docToExport.title || 'استمارة تشخيصية',
      description: docToExport.description || '',
      level: docToExport.level || 'ثانية باك',
      stream: docToExport.stream || '',
      classNumber: docToExport.classNumber || '',
      lessonTopic: docToExport.lessonTopic || '',
      pedagogicalGoal: docToExport.pedagogicalGoal || '',
      questions: docToExport.questions,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeSlug = (docToExport.title || 'philoscan-form')
      .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '-')
      .slice(0, 48);
    link.href = url;
    link.download = `${safeSlug || 'philoscan-form'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast('تم تصدير ملف الاستمارة بصيغة JSON بنجاح.', 'success');
  };

  const handleImportJsonFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('الملف لا يحتوي على مصفوفة أسئلة صالحة (questions).');
      }

      const importedQuestions = parsed.questions.map((q: any, idx: number) => {
        if (!q || typeof q.label !== 'string' || !q.label.trim()) {
          throw new Error(`السؤال رقم ${idx + 1} يفتقد نص السؤال (label).`);
        }
        return normalizeQuestion(q, idx);
      });

      setEditFormId(null);
      setFormTitle(String(parsed.title || file.name.replace(/\.json$/i, '')).trim());
      setFormDesc(String(parsed.description || '').trim());
      if (parsed.level) setMetaLevel(String(parsed.level));
      if (parsed.stream) setMetaStream(String(parsed.stream));
      if (parsed.classNumber) setMetaClassNumber(String(parsed.classNumber));
      if (parsed.lessonTopic) setMetaLessonTopic(String(parsed.lessonTopic));
      if (parsed.pedagogicalGoal) setMetaPedagogicalGoal(String(parsed.pedagogicalGoal));
      setQuestions(importedQuestions);
      setBuilderMode('edit');
      setCreatorTab('visual');
      setIsCreating(true);
      triggerToast(`تم استيراد ${importedQuestions.length} بنود بنجاح من ملف JSON.`, 'success');
    } catch (err: any) {
      triggerToast(err?.message || 'تعذر قراءة ملف JSON المرفق.', 'error');
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  // Visual Workbench: Add / Reorder / Duplicate / Toggle Required / Inline Update / AI Refine
  const addQuestion = () => {
    if (!newQuestionLabel.trim()) {
      triggerToast('الرجاء كتابة نص السؤال أولاً.', 'error');
      return;
    }

    let opts: string[] | undefined = undefined;
    let gridCols: string[] | undefined = undefined;

    if (['single', 'multi', 'order', 'grid', 'boolean'].includes(newQuestionType)) {
      if (newQuestionType === 'boolean') {
        opts = ['نعم / صحيح', 'لا / خطأ'];
      } else {
        opts = newQuestionOptions
          .split(/[,،\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (opts.length < 2) {
          triggerToast('يرجى إدخال خيارين على الأقل مفصولين بفواصل أو أسطر.', 'error');
          return;
        }
      }
    }

    if (newQuestionType === 'grid') {
      gridCols = newQuestionGridColumns
        .split(/[,،]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (gridCols.length < 2) {
        gridCols = [...DEFAULT_GRID_COLUMNS];
      }
    }

    const nextQuestion = normalizeQuestion(
      {
        id: `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: newQuestionType,
        label: newQuestionLabel.trim(),
        options: opts,
        gridColumns: gridCols,
        hint: newQuestionHint.trim() || undefined,
        dimension: newQuestionDimension,
        weight: newQuestionWeight,
        required: newQuestionRequired,
      },
      questions.length
    );

    setQuestions([...questions, nextQuestion]);
    setNewQuestionLabel('');
    setNewQuestionHint('');
    triggerToast('تمت إضافة السؤال إلى بنية الاستمارة.', 'success');
  };

  const removeQuestion = (qid: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== qid));
    if (editingQuestionId === qid) setEditingQuestionId(null);
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const duplicateQuestion = (index: number) => {
    const source = questions[index];
    if (!source) return;
    const copy: FormQuestion = {
      ...source,
      id: `q-copy-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label: `${source.label} (نسخة)`,
      options: source.options ? [...source.options] : undefined,
      gridColumns: source.gridColumns ? [...source.gridColumns] : undefined,
    };
    setQuestions((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    triggerToast('تم تكرار السؤال أسفل البند المحدد.', 'success');
  };

  const toggleQuestionRequired = (qid: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === qid ? { ...q, required: q.required === false } : q))
    );
  };

  const updateQuestionField = (qid: string, patch: Partial<FormQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (q.id === qid ? normalizeQuestion({ ...q, ...patch }, idx) : q))
    );
  };

  // Per-question AI Refinement
  const handleRefineQuestionAI = async (q: FormQuestion) => {
    const mode = refineModes[q.id] || 'clarity';
    setRefiningQuestionId(q.id);
    try {
      const response = await fetch('/api/forms/refine-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          topic: metaLessonTopic || formTitle || 'مفهوم الشخص والغير',
          level: metaLevel,
          stream: metaStream,
          mode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.refined) {
        throw new Error(data.error || 'تعذر تحسين السؤال بالذكاء الاصطناعي.');
      }

      setAiSuggestionByQid((prev) => ({
        ...prev,
        [q.id]: {
          label: data.refined.label || q.label,
          hint: data.refined.hint || q.hint,
          dimension: normalizeDimension(data.refined.dimension || q.dimension),
          weight: normalizeWeight(data.refined.weight || q.weight),
          options:
            Array.isArray(data.refined.options) && data.refined.options.length >= 2
              ? data.refined.options
              : q.options,
          gridColumns:
            Array.isArray(data.refined.gridColumns) && data.refined.gridColumns.length >= 2
              ? data.refined.gridColumns
              : q.gridColumns,
          rationale: data.refined.rationale || 'تحسين بيداغوجي لصياغة السؤال ومؤشراته.',
        },
      }));
      triggerToast('تم إعداد اقتراح التحسين لهذا السؤال.', 'success');
    } catch (err: any) {
      triggerToast(err?.message || 'فشل الاتصال بخدمة التحسين الذكي.', 'error');
    } finally {
      setRefiningQuestionId(null);
    }
  };

  const applyAiSuggestionToQuestion = (qid: string) => {
    const suggestion = aiSuggestionByQid[qid];
    if (!suggestion) return;
    updateQuestionField(qid, {
      label: suggestion.label,
      hint: suggestion.hint,
      dimension: suggestion.dimension,
      weight: suggestion.weight,
      options: suggestion.options,
      gridColumns: suggestion.gridColumns,
    });
    setAiSuggestionByQid((prev) => {
      const next = { ...prev };
      delete next[qid];
      return next;
    });
    triggerToast('تم اعتماد التحسين وتطبيقه على السؤال.', 'success');
  };

  const dismissAiSuggestion = (qid: string) => {
    setAiSuggestionByQid((prev) => {
      const next = { ...prev };
      delete next[qid];
      return next;
    });
  };

  // Full Form AI Generator
  const generateFormAI = async () => {
    if (!aiTopic.trim()) {
      triggerToast('يرجى إدخال موضوع الدرس المراد توليد الاستمارة حوله.', 'error');
      return;
    }

    setIsGeneratingAI(true);
    setAiLoadingMessage('جاري تصميم المحاور والأسئلة بالذكاء الاصطناعي...');

    const citations = [
      'صياغة بنود المساءلة الفلسفية وتفكيك التمثلات...',
      'توزيع الأوزان والمحاور البيداغوجية بدقة...',
      'تهيئة الخيارات التفاعلية ومقاييس التقييم...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      setAiLoadingMessage(citations[i % citations.length]);
      i++;
    }, 2200);

    try {
      const response = await fetch('/api/forms/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          level: aiLevel,
          stream: aiStream,
          aim: aiGoal,
          questionCount: aiQuestionCount,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'تعذر توليد الاستمارة عبر الخادم.');
      }

      const normalizedQs = Array.isArray(data.questions)
        ? data.questions.map((q: any, idx: number) => normalizeQuestion(q, idx))
        : [];

      setFormTitle(data.title || `تشخيص درس: ${aiTopic}`);
      setFormDesc(data.description || `استمارة مولدة آلياً لدراسة تمثلات: ${aiTopic}.`);
      setQuestions(normalizedQs);
      setMetaLevel(aiLevel);
      setMetaStream(aiStream);
      setMetaClassNumber('فوج 1');
      setMetaLessonTopic(aiTopic);
      setMetaPedagogicalGoal(aiGoal);

      triggerToast(`تم توليد ${normalizedQs.length} أسئلة موزعة على المحاور الفلسفية!`, 'success');
      setCreatorTab('visual');
      setBuilderMode('edit');
    } catch (err: any) {
      console.error('AI Generation Failed:', err);
      triggerToast(err.message || 'فشل توليد الاستمارة بالذكاء الاصطناعي.', 'error');
    } finally {
      clearInterval(interval);
      setIsGeneratingAI(false);
    }
  };

  // JSON Presets
  const JSON_PRESETS = [
    {
      name: 'تشخيص التصورات الأولية حول الفلسفة',
      description: 'كشف التمثلات، المواقف والصور النمطية الأولى مطلع العام.',
      code: {
        title: 'كشف التمثلات الأولية لمادة الفلسفة',
        description: 'استمارة صفية لرصد آراء وتخوفات التلاميذ المسبقة حول الفلسفة.',
        level: 'ثانية باك',
        stream: 'جميع الشعب العلمية والتقنية',
        questions: [
          {
            id: 'per-1',
            type: 'long',
            label: 'ما هي التمثلات المباشرة التي تتبادر لذهنك فور سماع كلمة فلسفة؟',
            dimension: 'التصور الأولي',
            weight: 4,
            required: true,
          },
          {
            id: 'per-2',
            type: 'single',
            label: 'ما هو الشعور الغالب عند مناقشة درس فلسفي جديد؟',
            options: [
              'رغبة في المعرفة والاستكشاف العقلي',
              'تخوف وقلق من المفارقات الفلسفية',
              'حياد عادي واستئناس بالمقرر',
            ],
            dimension: 'البعد الوجداني',
            weight: 4,
            required: true,
          },
          {
            id: 'per-3',
            type: 'boolean',
            label: 'هل تظن أن دراسة الفلسفة تقدم مهارات عملية لتقويم تفكيرك اليومي؟',
            dimension: 'تقييم عام',
            weight: 3,
            required: true,
          },
        ],
      },
    },
    {
      name: 'تشخيص مهارات الاستدلال والحجاج العقلاني',
      description: 'قياس القدرة على تفكيك النصوص، صياغة الحجج، وتفنيد الأطروحات.',
      code: {
        title: 'تشخيص مهارات الاستدلال الفكري والبرهنة',
        description: 'استمارة قياسية لرصد جودة الحجاج في الفضاء الفلسفي المدرسي.',
        level: 'ثانية باك',
        stream: 'شعبة الآداب والعلوم الإنسانية',
        questions: [
          {
            id: 'arg-1',
            type: 'long',
            label: 'أطروحة: الإنسان حر حرية مطلقة. قدم برهاناً لتأييد القول وحجة بديلة للمعارضة.',
            dimension: 'الاستدلال والحجاج',
            weight: 5,
            required: true,
          },
          {
            id: 'arg-2',
            type: 'order',
            label: 'رتب خطوات الإقناع الفلسفي داخل المناظرة الصفية:',
            options: ['تحديد الإشكال', 'تقديم البرهان العقلي', 'ضرب مثال واقعي'],
            dimension: 'الاستدلال والحجاج',
            weight: 4,
            required: true,
          },
        ],
      },
    },
    {
      name: 'استطلاع تمثلات الحقيقة والعلوم',
      description: 'فهم العلاقة المنهجية بمناهج الحقيقة واليقين العلمي.',
      code: {
        title: 'تشخيص العلاقة بمفاهيم الحقيقة والمعرفة',
        description: 'استقصاء لتدارك مستويات التفكير العلمي والإبستمولوجي.',
        level: 'ثانية باك',
        stream: 'شعبة العلوم الرياضية والفيزيائية',
        questions: [
          {
            id: 'kt-1',
            type: 'grid',
            label: 'قيّم درجة اليقين في كل مجال معرفي:',
            options: ['الرياضيات', 'العلوم التجريبية', 'العلوم الإنسانية'],
            gridColumns: ['ظني', 'نسبي', 'قوي', 'يقيني'],
            dimension: 'التفكير النقدي',
            weight: 4,
            required: true,
          },
          {
            id: 'kt-2',
            type: 'boolean',
            label: 'هل تعتقد أن المعرفة العلمية ثابتة لا تقبل المراجعة؟',
            dimension: 'التفكير النقدي',
            weight: 4,
            required: true,
          },
        ],
      },
    },
  ];

  // Code-Based Builder import
  const validateAndImportCode = () => {
    setCodeValidationError(null);
    setParsedCodeQuestions([]);

    const text = rawCodeText.trim();
    if (!text) {
      setCodeValidationError('يرجى كتابة الكود البرمجي (JSON أو HTML) أولاً.');
      return;
    }

    if (codeType === 'json') {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('الشيفرة المدخلة يجب أن تكون كائناً (Object).');
        }
        if (!parsed.title || typeof parsed.title !== 'string' || parsed.title.trim().length < 3) {
          throw new Error('حقل العنوان "title" مفقود أو قصير جداً.');
        }
        if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
          throw new Error('مصفوفة الأسئلة "questions" مفقودة أو فارغة.');
        }

        const validated: FormQuestion[] = parsed.questions.map((item: any, index: number) => {
          const qNum = index + 1;
          if (!item.label || typeof item.label !== 'string' || item.label.trim().length < 4) {
            throw new Error(`السؤال رقم ${qNum}: يفتقد حقل "label" أو صياغته قصيرة.`);
          }
          const qType: QuestionType =
            item.type && ALLOWED_QUESTION_TYPES.includes(item.type) ? item.type : 'long';
          if (['single', 'multi', 'order', 'grid'].includes(qType)) {
            if (!item.options || !Array.isArray(item.options) || item.options.length < 2) {
              throw new Error(`السؤال رقم ${qNum} من نوع "${qType}": يستلزم عنصرين على الأقل في "options".`);
            }
          }
          return normalizeQuestion(item, index);
        });

        setParsedCodeQuestions(validated);
        setQuestions(validated);
        setFormTitle(parsed.title.trim());
        if (typeof parsed.description === 'string') setFormDesc(parsed.description.trim());
        if (typeof parsed.level === 'string') setMetaLevel(parsed.level.trim());
        if (typeof parsed.stream === 'string') setMetaStream(parsed.stream.trim());
        if (typeof parsed.lessonTopic === 'string') setMetaLessonTopic(parsed.lessonTopic.trim());
        if (typeof parsed.pedagogicalGoal === 'string') setMetaPedagogicalGoal(parsed.pedagogicalGoal.trim());

        triggerToast('تم تحليل كود JSON واستيراد كافة البنود والأوزان بنجاح.', 'success');
      } catch (err: any) {
        setCodeValidationError(`خطأ في تحقق JSON: ${err.message}`);
        triggerToast('فشل الاستيراد بسبب أخطاء في بنية JSON.', 'error');
      }
    } else {
      try {
        const foundQuestions: FormQuestion[] = [];
        const labelRegex = /<label[^>]*>([\s\S]*?)<\/label>/gi;
        let match;
        let cIdx = 1;
        while ((match = labelRegex.exec(text)) !== null) {
          const rawLabel = match[1].replace(/<[^>]*>/g, '').trim();
          if (rawLabel.length > 3) {
            foundQuestions.push(
              normalizeQuestion({ id: `html-label-${cIdx}-${Date.now()}`, type: 'long', label: rawLabel }, cIdx)
            );
            cIdx++;
          }
        }
        if (foundQuestions.length === 0) {
          const inputRegex = /placeholder="([^"]+)"/gi;
          while ((match = inputRegex.exec(text)) !== null) {
            const rawPlaceholder = match[1].trim();
            if (rawPlaceholder.length > 4) {
              foundQuestions.push(
                normalizeQuestion(
                  { id: `html-input-${cIdx}-${Date.now()}`, type: 'long', label: rawPlaceholder },
                  cIdx
                )
              );
              cIdx++;
            }
          }
        }
        if (foundQuestions.length === 0) {
          throw new Error('لم يتم العثور على وسوم <label> أو حقول صالحة داخل كود HTML.');
        }

        setParsedCodeQuestions(foundQuestions);
        setQuestions(foundQuestions);
        triggerToast(`تم استيراد ${foundQuestions.length} أسئلة من كود HTML بنجاح.`, 'success');
      } catch (err: any) {
        setCodeValidationError(`خطأ في فحص HTML: ${err.message}`);
      }
    }
  };

  const formatJSONCode = () => {
    try {
      const parsed = JSON.parse(rawCodeText);
      setRawCodeText(JSON.stringify(parsed, null, 2));
      triggerToast('تم تنسيق كود JSON بنجاح.', 'success');
      setCodeValidationError(null);
    } catch (err: any) {
      triggerToast('تعذر تنسيق الكود بسبب خطأ تركيبي.', 'error');
      setCodeValidationError(`فشل التنسيق: ${err.message}`);
    }
  };

  const syncVisualToJsonEditor = () => {
    setCodeType('json');
    setRawCodeText(
      JSON.stringify(
        {
          title: formTitle.trim() || 'استمارة تشخيصية جديدة',
          description: formDesc.trim(),
          level: metaLevel,
          stream: metaStream,
          lessonTopic: metaLessonTopic,
          pedagogicalGoal: metaPedagogicalGoal,
          questions,
        },
        null,
        2
      )
    );
    triggerToast('تمت مزامنة البنود الحالية إلى محرر JSON.', 'success');
  };

  // Instant Session Launch + Share Flow
  const handleInitTransfer = (form: FormDocument) => {
    setLaunchedSession(null);
    setCopiedField(null);
    setQrImageError(false);
    setTransferForm(form);
    setTransferSessionForm({
      title: `حلقة تشخيص: ${form.title}`,
      institution: teacherSession.school || '',
      province: teacherSession.province || '',
      level: form.level || 'جذع مشترك',
      stream: form.stream || 'العلوم',
      classNumber: form.classNumber || '1',
      supervisedMode: true,
    });
    setQuestionsPreviewOpen(false);
  };

  const handleConfirmTransfer = async () => {
    if (!transferForm) return;
    if (!transferSessionForm.title.trim()) {
      triggerToast('يرجى تحديد عنوان للجلسة التشخيصية.', 'error');
      return;
    }
    if (!transferSessionForm.institution.trim()) {
      triggerToast('يرجى تحديد اسم المؤسسة التعليمية.', 'error');
      return;
    }

    setTransferLoading(true);
    try {
      const payload = {
        institution: transferSessionForm.institution.trim(),
        province: transferSessionForm.province.trim(),
        level: transferSessionForm.level,
        stream: transferSessionForm.stream,
        classNumber: transferSessionForm.classNumber.trim(),
        title: transferSessionForm.title.trim(),
        teacherEmail: teacherSession.email,
        teacherId: teacherSession.teacherId,
        formId: transferForm.formId,
        formTitle: transferForm.title,
        questions: transferForm.questions,
        supervisedMode: transferSessionForm.supervisedMode,
      };

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.session) {
        throw new Error(data.error || 'فشلت عملية إطلاق الجلسة.');
      }

      setLaunchedSession(data.session);
      syncSessionToFirestore(data.session).catch(() => {});
      triggerToast('تم إطلاق الجلسة الفورية وتوليد رمز الدخول والرابط المباشر.', 'success');
      if (onSessionCreated) {
        onSessionCreated(data.session);
      }
    } catch (err: any) {
      triggerToast(err.message || 'حدث خطأ أثناء الاتصال بالخادم.', 'error');
    } finally {
      setTransferLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2200);
    } catch {
      triggerToast('تعذر النسخ التلقائي، يرجى النسخ يدوياً.', 'error');
    }
  };

  // Pedagogical Balance computation
  const balanceStats = useMemo(() => {
    const requiredCount = questions.filter((q) => q.required !== false).length;
    const totalWeight = questions.reduce((sum, q) => sum + normalizeWeight(q.weight), 0);
    const byDim = PHILOSOPHICAL_DIMENSIONS.map((dim) => {
      const matched = questions.filter((q) => normalizeDimension(q.dimension) === dim);
      const weightSum = matched.reduce((s, q) => s + normalizeWeight(q.weight), 0);
      return {
        dimension: dim,
        count: matched.length,
        weightSum,
        pct: totalWeight > 0 ? Math.round((weightSum / totalWeight) * 100) : 0,
      };
    }).filter((d) => d.count > 0);
    return { requiredCount, totalWeight, byDim };
  }, [questions]);


  // Fallback level calculation helper
  const getFallbackLevel = (formId: string) => {
    if (formId.includes('perceptions') || formId.includes('discussion')) return 'جذع مشترك';
    if (formId.includes('critical-thinking') || formId.includes('argumentation')) return 'أولى باك';
    return 'ثانية باك';
  };

  // Filtering and sorting
  const filteredForms = forms.filter((form) => {
    const matchesTab = activeFilter === 'all' || form.status === activeFilter;
    const matchesSearch =
      form.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.description.toLowerCase().includes(searchQuery.toLowerCase());
    const formLevel = form.level || getFallbackLevel(form.formId);
    const matchesLevel = selectedLevel === 'all' || formLevel === selectedLevel;
    const isProcessed = form.status === 'published' || form.status === 'ready';
    const aiStatus = isProcessed ? 'analyzed' : 'processing';
    const matchesAiStatus = selectedAiStatus === 'all' || selectedAiStatus === aiStatus;
    return matchesTab && matchesSearch && matchesLevel && matchesAiStatus;
  });

  const sortedForms = [...filteredForms].sort((a, b) => {
    const dateA = a.createdAt
      ? new Date(a.createdAt).getTime()
      : a.isTemplate
      ? 1000 - OFFICIAL_TEMPLATES.findIndex((t) => t.formId === a.formId)
      : 0;
    const dateB = b.createdAt
      ? new Date(b.createdAt).getTime()
      : b.isTemplate
      ? 1000 - OFFICIAL_TEMPLATES.findIndex((t) => t.formId === b.formId)
      : 0;
    return sortByDate === 'newest' ? dateB - dateA : dateA - dateB;
  });

  // Honest KPI metrics from actual forms
  const totalInBank = forms.length;
  const templatesCount = forms.filter((f) => f.isTemplate).length;
  const customCount = forms.filter((f) => !f.isTemplate).length;
  const totalDiagnosticQuestions = forms.reduce((sum, f) => sum + (f.questions?.length || 0), 0);
  const publishedOrReadyCount = forms.filter((f) => f.status === 'published' || f.status === 'ready').length;
  const savedDraftsCount = forms.filter((f) => f.status === 'saved').length;

  const launchedShareUrl = launchedSession
    ? `${window.location.origin}/session/${launchedSession.sessionId}`
    : '';
  const launchedQrUrl = launchedShareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(launchedShareUrl)}`
    : '';

  return (
    <div className="w-full space-y-6 text-right font-sans" dir="rtl" id="formbank-root">
      {/* Hidden JSON import input */}
      <input
        ref={jsonFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => handleImportJsonFile(e.target.files?.[0])}
      />

      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-8 left-1/2 -translate-x-1/2 z-[120] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border max-w-md w-[90%] sm:w-auto ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <p className="text-xs font-black tracking-tight">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Header */}
      <div className="bg-slate-950 text-white rounded-[28px] p-6 sm:p-8 border border-slate-800 shadow-lg relative overflow-hidden">
        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
          <div className="space-y-2">
            <span className="text-blue-400 text-[11px] font-extrabold tracking-wide block">
              استوديو تصميم الاستمارات الفلسفية وبنك الروائز
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              منشئ وبنك الاستمارات التشخيصية
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm font-medium leading-relaxed max-w-2xl">
              صمّم استمارات تفاعلية بـ 10 أنماط سؤال، واضبط المحاور الفلسفية والأوزان، وحاكِ تجربة التلميذ قبل الإطلاق الفوري برمز QR والرابط المباشر.
            </p>
          </div>

          {!isCreating && (
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <button
                type="button"
                onClick={() => jsonFileInputRef.current?.click()}
                className="flex-1 md:flex-initial py-3 px-4 min-h-[44px] bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-blue-400" />
                <span>استيراد JSON</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setIsCreating(true);
                }}
                className="flex-1 md:flex-initial py-3 px-6 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء استمارة جديدة</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Auto-Draft Recovery Banner */}
      {!isCreating && savedDraftPrompt && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-black text-amber-950">
                توجد مسودة عمل محفوظة تلقائياً ({savedDraftPrompt.formTitle || 'استمارة بدون عنوان'})
              </p>
              <p className="text-[11px] text-amber-800 font-medium font-mono tabular-nums">
                {savedDraftPrompt.questions.length} أسئلة · آخر حفظ:{' '}
                {new Date(savedDraftPrompt.savedAt).toLocaleString('ar-MA', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={handleDiscardSavedDraft}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer"
            >
              تجاهل وحذف
            </button>
            <button
              type="button"
              onClick={() => handleResumeDraft(savedDraftPrompt)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer"
            >
              استئناف المسودة
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-500 text-xs font-bold">جاري تحميل بنك الاستمارات...</p>
        </div>
      ) : isCreating ? (
        /* ============================ FORM STUDIO BUILDER ============================ */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans"
        >
          {/* Main Studio Canvas (2 cols on desktop) */}
          <div className="lg:col-span-2 bg-white p-5 sm:p-8 rounded-[28px] border border-slate-200 shadow-sm space-y-6">
            {/* Top Builder Header + Edit/Simulate Switch */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-slate-100 pb-4 gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400">
                  <span className="text-indigo-600 font-black">استوديو التصميم البيداغوجي</span>
                  {lastAutoSavedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-mono tabular-nums">
                        تم الحفظ التلقائي محلياً ({new Date(lastAutoSavedAt).toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    </>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  <span>{editFormId ? 'تعديل استمارة تشخيصية' : 'تصميم استمارة تشخيصية جديدة'}</span>
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openBuilderInSimulatorModal}
                  className="min-h-[40px] py-1.5 px-3.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-black rounded-xl text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                  title="فتح نافذة محاكاة التلميذ للاستمارة الحالية"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة (محاكاة التلميذ)</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportFormAsJsonFile({
                      title: formTitle,
                      description: formDesc,
                      level: metaLevel,
                      stream: metaStream,
                      classNumber: metaClassNumber,
                      lessonTopic: metaLessonTopic,
                      pedagogicalGoal: metaPedagogicalGoal,
                      questions,
                    })
                  }
                  className="min-h-[40px] py-1.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                  title="تصدير المسودة كملف JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="min-h-[40px] py-1.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                  title="استيراد ملف JSON"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>استيراد JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="min-h-[40px] py-1.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-extrabold rounded-xl text-xs transition inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة للبنك</span>
                </button>
              </div>
            </div>

            {/* Primary Mode Toggle: Build/Edit vs Interactive Student Simulator */}
            <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-2xl border border-slate-200 gap-1">
              <button
                type="button"
                onClick={() => setBuilderMode('edit')}
                className={`py-2.5 min-h-[44px] rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                  builderMode === 'edit'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                <span>بناء وتحرير الأسئلة</span>
              </button>
              <button
                type="button"
                onClick={() => setBuilderMode('simulate')}
                className={`py-2.5 min-h-[44px] rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                  builderMode === 'simulate'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>محاكاة تجربة التلميذ ({questions.length})</span>
              </button>
            </div>

            {builderMode === 'simulate' ? (
              <StudentSimulator
                mode="embedded"
                title={formTitle.trim() || 'استمارة تشخيصية قيد التصميم'}
                description={formDesc}
                questions={questions}
                sessionMeta={{
                  level: metaLevel,
                  stream: metaStream,
                  classNumber: metaClassNumber,
                  lessonTopic: metaLessonTopic,
                }}
                initialAnswers={simAnswers}
                onAnswersChange={setSimAnswers}
                showPedagogicalMetaByDefault={true}
                returnLabel="إغلاق والعودة إلى لوحة تحرير الاستمارة"
                onClose={() => setBuilderMode('edit')}
              />
            ) : (
              /* -------------------- EDIT / BUILDER SUB-TABS -------------------- */
              <>
                <div className="flex flex-col sm:flex-row bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
                  <button
                    type="button"
                    onClick={() => setCreatorTab('visual')}
                    className={`flex-1 py-2.5 min-h-[44px] text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      creatorTab === 'visual'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ListPlus className="w-4 h-4" />
                    <span>المنشئ البصري</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatorTab('ai')}
                    className={`flex-1 py-2.5 min-h-[44px] text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      creatorTab === 'ai'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Wand2 className="w-4 h-4 text-indigo-600" />
                    <span>توليد بالذكاء الاصطناعي</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatorTab('code')}
                    className={`flex-1 py-2.5 min-h-[44px] text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      creatorTab === 'code'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Code className="w-4 h-4 text-blue-600" />
                    <span>محرر JSON / HTML</span>
                  </button>
                </div>

                {/* Tab 1: Visual Form Builder */}
                {creatorTab === 'visual' && (
                  <div className="space-y-6">
                    {/* Form Title & Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 block">
                          عنوان الاستمارة الكاشفة:
                        </label>
                        <input
                          type="text"
                          placeholder="مثال: تشخيص مستوى التفكير الحجاجي في مستهل البكالوريا"
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 block">
                          حالة الاستمارة في البنك:
                        </label>
                        <select
                          value={formStatus}
                          onChange={(e) => setFormStatus(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                        >
                          <option value="saved">مسودة حفظ (قيد التعديل)</option>
                          <option value="published">منشورة ونشطة للتلاميذ</option>
                          <option value="ready">جاهزة ومعتمدة للإطلاق</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-700 block">
                        وصف الاستمارة أو التوجيه التربوي للتلميذ:
                      </label>
                      <textarea
                        rows={2}
                        placeholder="وصف تربوي موجز يظهر للتلميذ أعلى الاستمارة..."
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-medium"
                      />
                    </div>

                    {/* Pedagogical Balance Bar */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                          <Scale className="w-4 h-4 text-indigo-600" />
                          <span>التوازن البيداغوجي للمحاور والأوزان</span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 font-mono tabular-nums">
                          {questions.length} بنود · {balanceStats.requiredCount} إلزامي · مجموع الأوزان:{' '}
                          {balanceStats.totalWeight}
                        </span>
                      </div>

                      {balanceStats.byDim.length > 0 && (
                        <>
                          <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
                            {balanceStats.byDim.map((item) => (
                              <div
                                key={item.dimension}
                                style={{ width: `${Math.max(item.pct, 4)}%` }}
                                className={`${DIMENSION_COLORS[item.dimension]} h-full transition-all`}
                                title={`${item.dimension}: ${item.count} أسئلة (${item.pct}%)`}
                              />
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-600">
                            {balanceStats.byDim.map((item) => (
                              <div key={item.dimension} className="inline-flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${DIMENSION_COLORS[item.dimension]}`} />
                                <span>{item.dimension}</span>
                                <span className="font-mono tabular-nums text-slate-400">
                                  ({item.count} · {item.pct}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Questions Workbench List */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-700">
                          بنود الأسئلة ({questions.length}):
                        </label>
                        <span className="text-[11px] text-slate-400 font-semibold">
                          يمكنك الترتيب، التكرار، التعديل المباشر، أو التحسين بالذكاء الاصطناعي
                        </span>
                      </div>

                      {questions.length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed bg-slate-50 rounded-2xl text-slate-400 text-xs font-semibold">
                          لا توجد أي بنود مضافة بعد. استخدم أداة الإضافة أدناه لبناء أسئلة الاستمارة.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {questions.map((q, idx) => {
                            const isEditing = editingQuestionId === q.id;
                            const isRefining = refiningQuestionId === q.id;
                            const suggestion = aiSuggestionByQid[q.id];
                            const dim = normalizeDimension(q.dimension);
                            const weight = normalizeWeight(q.weight);
                            const isReq = q.required !== false;

                            return (
                              <div
                                key={q.id}
                                className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 transition hover:border-slate-300"
                              >
                                {/* Question Card Header */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                  <div className="flex-1 space-y-1.5 text-right min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                                      <span className="bg-slate-900 text-white px-2 py-0.5 rounded-md font-mono tabular-nums">
                                        {idx + 1}
                                      </span>
                                      <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md">
                                        {QUESTION_TYPE_LABELS[q.type]}
                                      </span>
                                      <span
                                        className={`px-2 py-0.5 rounded-md border ${DIMENSION_BADGE_STYLES[dim]}`}
                                      >
                                        {dim}
                                      </span>
                                      <span className="text-slate-500 font-mono tabular-nums">
                                        · الوزن {weight}/5
                                      </span>
                                      <span aria-hidden="true" className="text-slate-300">
                                        ·
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => toggleQuestionRequired(q.id)}
                                        className={`cursor-pointer font-extrabold ${
                                          isReq ? 'text-red-600' : 'text-slate-400'
                                        }`}
                                        title="انقر لتبديل الإلزامية"
                                      >
                                        {isReq ? 'إلزامي *' : 'اختياري'}
                                      </button>
                                    </div>

                                    <p className="text-xs sm:text-sm font-extrabold text-slate-800 leading-relaxed">
                                      {q.label}
                                    </p>

                                    {q.hint && (
                                      <p className="text-[11px] text-slate-500 font-medium">
                                        توجيه للتلميذ: {q.hint}
                                      </p>
                                    )}

                                    {q.options && q.options.length > 0 && (
                                      <p className="text-[11px] text-slate-400 font-semibold">
                                        {q.type === 'grid' ? 'صفوف الشبكة:' : 'العناصر / الخيارات:'}{' '}
                                        {q.options.join(' · ')}
                                      </p>
                                    )}
                                    {q.type === 'grid' && q.gridColumns && q.gridColumns.length > 0 && (
                                      <p className="text-[11px] text-slate-400 font-semibold">
                                        الأعمدة: {q.gridColumns.join(' · ')}
                                      </p>
                                    )}
                                  </div>

                                  {/* Action Toolbar */}
                                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => moveQuestion(idx, -1)}
                                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer flex items-center justify-center"
                                      title="نقل لأعلى"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === questions.length - 1}
                                      onClick={() => moveQuestion(idx, 1)}
                                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-35 cursor-pointer flex items-center justify-center"
                                      title="نقل لأسفل"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => duplicateQuestion(idx)}
                                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer flex items-center justify-center"
                                      title="تكرار السؤال"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingQuestionId(isEditing ? null : q.id)
                                      }
                                      className={`min-h-[36px] px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer inline-flex items-center gap-1 ${
                                        isEditing
                                          ? 'bg-slate-900 border-slate-900 text-white'
                                          : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                                      }`}
                                      title="تعديل مباشر"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>{isEditing ? 'إغلاق' : 'تعديل'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isRefining}
                                      onClick={() => handleRefineQuestionAI(q)}
                                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                                      title="تحسين الصياغة والمؤشرات بالذكاء الاصطناعي"
                                    >
                                      <Wand2 className="w-3.5 h-3.5" />
                                      <span>{isRefining ? 'جاري التحسين...' : 'تحسين AI'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeQuestion(q.id)}
                                      className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 cursor-pointer flex items-center justify-center"
                                      title="حذف السؤال"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Inline Question Editor Panel */}
                                {isEditing && (
                                  <div className="pt-3 border-t border-slate-100 bg-slate-50 rounded-xl p-4 space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 block">
                                          نوع السؤال:
                                        </label>
                                        <select
                                          value={q.type}
                                          onChange={(e) =>
                                            updateQuestionField(q.id, {
                                              type: e.target.value as QuestionType,
                                            })
                                          }
                                          className="w-full bg-white border border-slate-200 rounded-xl p-2 min-h-[40px] text-xs font-bold"
                                        >
                                          {ALLOWED_QUESTION_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                              {QUESTION_TYPE_LABELS[t]}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 block">
                                          المحور الفلسفي:
                                        </label>
                                        <select
                                          value={dim}
                                          onChange={(e) =>
                                            updateQuestionField(q.id, {
                                              dimension: e.target.value as PhilosophicalDimension,
                                            })
                                          }
                                          className="w-full bg-white border border-slate-200 rounded-xl p-2 min-h-[40px] text-xs font-bold"
                                        >
                                          {PHILOSOPHICAL_DIMENSIONS.map((d) => (
                                            <option key={d} value={d}>
                                              {d}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-slate-500 block">
                                            الوزن (1-5):
                                          </label>
                                          <select
                                            value={weight}
                                            onChange={(e) =>
                                              updateQuestionField(q.id, {
                                                weight: Number(e.target.value),
                                              })
                                            }
                                            className="w-full bg-white border border-slate-200 rounded-xl p-2 min-h-[40px] text-xs font-mono font-bold"
                                          >
                                            {[1, 2, 3, 4, 5].map((w) => (
                                              <option key={w} value={w}>
                                                {w} / 5
                                              </option>
                                            ))}
                                          </select>
                                        </div>

                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-slate-500 block">
                                            أسلوب التحسين:
                                          </label>
                                          <select
                                            value={refineModes[q.id] || 'clarity'}
                                            onChange={(e) =>
                                              setRefineModes((prev) => ({
                                                ...prev,
                                                [q.id]: e.target.value as 'clarity' | 'critical' | 'options',
                                              }))
                                            }
                                            className="w-full bg-white border border-slate-200 rounded-xl p-2 min-h-[40px] text-[11px] font-bold"
                                          >
                                            <option value="clarity">توضيح الصياغة</option>
                                            <option value="critical">تعميق نقدي</option>
                                            <option value="options">تحسين الخيارات</option>
                                          </select>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-500 block">
                                        نص السؤال:
                                      </label>
                                      <textarea
                                        rows={2}
                                        value={q.label}
                                        onChange={(e) =>
                                          updateQuestionField(q.id, { label: e.target.value })
                                        }
                                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold"
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-500 block">
                                        تلميح إرشادي للتلميذ (اختياري):
                                      </label>
                                      <input
                                        type="text"
                                        value={q.hint || ''}
                                        onChange={(e) =>
                                          updateQuestionField(q.id, { hint: e.target.value })
                                        }
                                        placeholder="مثال: قدّم مثالاً ملموساً لتدعيم رأيك..."
                                        className="w-full bg-white border border-slate-200 rounded-xl p-2.5 min-h-[40px] text-xs font-semibold"
                                      />
                                    </div>

                                    {['single', 'multi', 'order', 'grid'].includes(q.type) && (
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 block">
                                          {q.type === 'grid'
                                            ? 'صفوف / معايير الشبكة (افصل بفواصل):'
                                            : 'الخيارات أو عناصر الترتيب (افصل بفواصل):'}
                                        </label>
                                        <input
                                          type="text"
                                          value={(q.options || []).join(', ')}
                                          onChange={(e) =>
                                            updateQuestionField(q.id, {
                                              options: e.target.value
                                                .split(/[,،]+/)
                                                .map((s) => s.trim())
                                                .filter(Boolean),
                                            })
                                          }
                                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 min-h-[40px] text-xs font-semibold"
                                        />
                                      </div>
                                    )}

                                    {q.type === 'grid' && (
                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 block">
                                          أعمدة التقييم (افصل بفواصل):
                                        </label>
                                        <input
                                          type="text"
                                          value={(q.gridColumns || DEFAULT_GRID_COLUMNS).join(', ')}
                                          onChange={(e) =>
                                            updateQuestionField(q.id, {
                                              gridColumns: e.target.value
                                                .split(/[,،]+/)
                                                .map((s) => s.trim())
                                                .filter(Boolean),
                                            })
                                          }
                                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 min-h-[40px] text-xs font-semibold"
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Per-question AI Suggestion Diff Panel */}
                                {suggestion && (
                                  <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5 text-right">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-indigo-600" />
                                        <span>اقتراح الذكاء الاصطناعي لهذا السؤال</span>
                                      </span>
                                      <span className="text-[11px] font-bold text-indigo-700">
                                        {suggestion.dimension} · الوزن {suggestion.weight}/5
                                      </span>
                                    </div>
                                    <p className="text-xs font-extrabold text-slate-900 bg-white border border-indigo-100 rounded-lg p-2.5">
                                      {suggestion.label}
                                    </p>
                                    {suggestion.hint && (
                                      <p className="text-[11px] text-indigo-900 font-semibold">
                                        التلميح المقترح: {suggestion.hint}
                                      </p>
                                    )}
                                    {suggestion.options && suggestion.options.length > 0 && (
                                      <p className="text-[11px] text-slate-600 font-semibold">
                                        الخيارات المقترحة: {suggestion.options.join(' · ')}
                                      </p>
                                    )}
                                    <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
                                      التعليل البيداغوجي: {suggestion.rationale}
                                    </p>
                                    <div className="flex items-center justify-end gap-2 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => dismissAiSuggestion(q.id)}
                                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold cursor-pointer"
                                      >
                                        تجاهل
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => applyAiSuggestionToQuestion(q.id)}
                                        className="min-h-[38px] px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black cursor-pointer"
                                      >
                                        اعتماد التحسين
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* In-Line Field Adder (10 question types + dimension + weight + hint + required) */}
                    <div className="bg-slate-50/70 p-4 sm:p-5 rounded-3xl border border-slate-200 space-y-4">
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <Plus className="w-4 h-4 text-indigo-600" />
                        <span>إضافة سؤال جديد (يدعم 10 أنماط تفاعلية):</span>
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500">نمط السؤال:</label>
                          <select
                            value={newQuestionType}
                            onChange={(e) => handleNewTypeChange(e.target.value as QuestionType)}
                            className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-bold"
                          >
                            <option value="short">نص قصير (Short Text)</option>
                            <option value="long">نص طويل حجاجي (Long Text)</option>
                            <option value="single">اختيار واحد (Single Selection)</option>
                            <option value="multi">اختيار متعدد (Multiple Selection)</option>
                            <option value="scale">مقياس تقييم 1-5 (Evaluation Scale)</option>
                            <option value="boolean">صح وخطأ (True / False)</option>
                            <option value="order">ترتيب عناصر (Ranking)</option>
                            <option value="grid">شبكة تقييم مصفوفة (Grid Matrix)</option>
                            <option value="file">رفع ملف / وثيقة (File Upload)</option>
                            <option value="open">سؤال مفتوح (Open Question)</option>
                          </select>
                        </div>

                        <div className="md:col-span-2 space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500">نص السؤال:</label>
                          <input
                            type="text"
                            placeholder="مثال: كيف تقيم تماسك حجج القائلين بإن الشخص حر حرية مطلقة؟"
                            value={newQuestionLabel}
                            onChange={(e) => setNewQuestionLabel(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500">المحور الفلسفي:</label>
                          <select
                            value={newQuestionDimension}
                            onChange={(e) =>
                              setNewQuestionDimension(e.target.value as PhilosophicalDimension)
                            }
                            className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-bold"
                          >
                            {PHILOSOPHICAL_DIMENSIONS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500">وزن التنقيط (1-5):</label>
                          <select
                            value={newQuestionWeight}
                            onChange={(e) => setNewQuestionWeight(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-mono font-bold"
                          >
                            {[1, 2, 3, 4, 5].map((w) => (
                              <option key={w} value={w}>
                                {w} / 5
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end">
                          <label className="w-full min-h-[44px] px-3 py-2 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-2 cursor-pointer">
                            <span className="text-xs font-bold text-slate-700">سؤال إلزامي</span>
                            <input
                              type="checkbox"
                              checked={newQuestionRequired}
                              onChange={(e) => setNewQuestionRequired(e.target.checked)}
                              className="w-4 h-4 accent-indigo-600 cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500">
                          تلميح إرشادي للتلميذ (اختياري):
                        </label>
                        <input
                          type="text"
                          placeholder="توجيه قصير لمساعدة التلميذ على فهم المطلوب..."
                          value={newQuestionHint}
                          onChange={(e) => setNewQuestionHint(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                        />
                      </div>

                      {['single', 'multi', 'order', 'grid'].includes(newQuestionType) && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 block">
                            {newQuestionType === 'grid'
                              ? 'صفوف / معايير الشبكة (افصل بينها بفواصل):'
                              : newQuestionType === 'order'
                              ? 'العناصر المراد ترتيبها (افصل بينها بفواصل):'
                              : 'البدائل المقترحة (افصل بينها بفواصل):'}
                          </label>
                          <input
                            type="text"
                            value={newQuestionOptions}
                            onChange={(e) => setNewQuestionOptions(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                          />
                        </div>
                      )}

                      {newQuestionType === 'grid' && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 block">
                            أعمدة التقييم في الشبكة (افصل بينها بفواصل):
                          </label>
                          <input
                            type="text"
                            value={newQuestionGridColumns}
                            onChange={(e) => setNewQuestionGridColumns(e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                          />
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addQuestion}
                          className="w-full sm:w-auto py-2.5 px-6 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs transition cursor-pointer"
                        >
                          إدراج السؤال بالاستمارة
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: AI Form Generator */}
                {creatorTab === 'ai' && (
                  <div className="space-y-5">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex gap-3 text-right">
                      <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-black text-indigo-950">
                          مولد الاستمارات الذكي المتكامل (Gemini)
                        </h4>
                        <p className="text-[11px] text-indigo-800 font-medium leading-relaxed">
                          أدخل موضوع الدرس والهدف التربوي ليقوم الذكاء الاصطناعي ببناء استمارة متعددة الأنماط وموزعة تلقائياً على المحاور الفلسفية والأوزان.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 block">
                          موضوع الدرس أو المفهوم الفلسفي:
                        </label>
                        <input
                          type="text"
                          placeholder="مثال: مفهوم الغير والوعي بحدود الأنا"
                          value={aiTopic}
                          onChange={(e) => setAiTopic(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 min-h-[44px] outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-xs font-black text-slate-700 block">
                            المستوى الدراسي:
                          </label>
                          <select
                            value={aiLevel}
                            onChange={(e) => setAiLevel(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 min-h-[44px] outline-none font-bold"
                          >
                            <option value="جذع مشترك">جذع مشترك</option>
                            <option value="أولى باك">أولى باك</option>
                            <option value="ثانية باك">ثانية باك</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-black text-slate-700 block">
                            الشعبة الدراسية:
                          </label>
                          <input
                            type="text"
                            placeholder="شعبة العلوم الفيزيائية أو الآداب"
                            value={aiStream}
                            onChange={(e) => setAiStream(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 min-h-[44px] outline-none font-bold"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-black text-slate-700 block">
                            عدد الأسئلة المطلوبة:
                          </label>
                          <select
                            value={aiQuestionCount}
                            onChange={(e) => setAiQuestionCount(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 min-h-[44px] outline-none font-mono font-bold"
                          >
                            {[4, 5, 6, 7, 8].map((n) => (
                              <option key={n} value={n}>
                                {n} أسئلة
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 block">
                          الغاية البيداغوجية من الاستمارة:
                        </label>
                        <textarea
                          rows={2}
                          placeholder="مثال: كشف عوائق الوعي المعرفي بمفهوم الغير وتحديد مستويات الدافعية..."
                          value={aiGoal}
                          onChange={(e) => setAiGoal(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-3 outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-semibold"
                        />
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          disabled={isGeneratingAI || !aiTopic.trim()}
                          onClick={generateFormAI}
                          className="w-full sm:w-auto justify-center py-3 px-6 min-h-[46px] bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-black text-xs rounded-2xl transition flex items-center gap-2 shadow-md cursor-pointer"
                        >
                          {isGeneratingAI ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>{aiLoadingMessage}</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4" />
                              <span>توليد الاستمارة بالذكاء الاصطناعي</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Code-Based Builder (JSON / HTML) */}
                {creatorTab === 'code' && (
                  <div className="space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-slate-50 p-4 border border-slate-200 rounded-2xl gap-3">
                      <div className="grid grid-cols-2 sm:flex bg-white p-1 rounded-xl border border-slate-200 w-full sm:w-fit gap-1">
                        <button
                          type="button"
                          onClick={() => setCodeType('json')}
                          className={`px-3 sm:px-4 py-2 min-h-[40px] text-xs font-black rounded-lg transition cursor-pointer ${
                            codeType === 'json' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          محرر JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => setCodeType('html')}
                          className={`px-3 sm:px-4 py-2 min-h-[40px] text-xs font-black rounded-lg transition cursor-pointer ${
                            codeType === 'html' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          استخراج من HTML
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={syncVisualToJsonEditor}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        مزامنة من المنشئ البصري
                      </button>
                    </div>

                    {codeType === 'json' && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-black text-blue-950">نماذج JSON سريعة:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          {JSON_PRESETS.map((preset, pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => {
                                setRawCodeText(JSON.stringify(preset.code, null, 2));
                                triggerToast(`تم تحميل نموذج: ${preset.name}`, 'success');
                              }}
                              className="text-right p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-xl transition flex flex-col gap-1 cursor-pointer"
                            >
                              <span className="font-black text-slate-800 text-xs line-clamp-1">
                                {preset.name}
                              </span>
                              <span className="text-[10px] text-slate-400 line-clamp-2">
                                {preset.description}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-xs font-black text-slate-700">محرر الشيفرة:</label>
                        <div className="flex items-center gap-2">
                          {codeType === 'json' && (
                            <button
                              type="button"
                              onClick={formatJSONCode}
                              className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 border text-slate-700 text-[10px] font-black rounded-lg cursor-pointer"
                            >
                              تنسيق JSON
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setRawCodeText('');
                              setParsedCodeQuestions([]);
                              setCodeValidationError(null);
                            }}
                            className="py-1 px-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-[10px] font-black rounded-lg cursor-pointer"
                          >
                            مسح المحرر
                          </button>
                        </div>
                      </div>

                      <div className="flex bg-slate-950 rounded-[18px] overflow-hidden border border-slate-800 font-mono text-sm leading-5">
                        <div className="bg-slate-900/60 text-slate-500 py-4 px-3 text-right select-none border-l border-slate-800 text-[10px] flex flex-col items-end min-w-[2.5rem]">
                          {Array.from({ length: Math.max(rawCodeText.split('\n').length, 1) }).map((_, idx) => (
                            <div key={idx} className="h-5 leading-5 tabular-nums">
                              {idx + 1}
                            </div>
                          ))}
                        </div>
                        <textarea
                          rows={11}
                          dir="ltr"
                          value={rawCodeText}
                          onChange={(e) => setRawCodeText(e.target.value)}
                          className="w-full bg-transparent text-emerald-400 text-xs p-4 focus:outline-none resize-y font-mono leading-5 min-h-[220px]"
                        />
                      </div>
                    </div>

                    {codeType === 'json' && rawCodeText.trim().length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-xs font-bold">
                            {jsonValidation.isValid ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                            )}
                            <span>صحة بنية JSON</span>
                          </div>
                          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-xs font-bold">
                            {jsonValidation.hasTitle &&
                            jsonValidation.hasQuestions &&
                            jsonValidation.hasValidTypes &&
                            jsonValidation.hasValidOptions ? (
                              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <span>صحة العنوان والأسئلة والخيارات</span>
                          </div>
                        </div>

                        {jsonValidation.errors.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                            {jsonValidation.errors.map((errText, idx) => (
                              <li key={idx}>{errText}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {codeValidationError && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs font-bold text-red-800">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span>{codeValidationError}</span>
                      </div>
                    )}

                    {parsedCodeQuestions.length > 0 && !codeValidationError && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>تم استيراد {parsedCodeQuestions.length} بنود بنجاح إلى المسودة.</span>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={validateAndImportCode}
                        disabled={codeType === 'json' && jsonValidation.errors.length > 0}
                        className={`min-h-[44px] py-2.5 px-6 font-black text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
                          codeType === 'json' && jsonValidation.errors.length > 0
                            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        <FileCode className="w-4 h-4" />
                        <span>تحليل واستيراد الكود إلى الاستمارة</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom Metadata Fields */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-slate-500" />
                    <span>بيانات السند البيداغوجي والصف:</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500">المستوى الدراسي:</label>
                      <select
                        value={metaLevel}
                        onChange={(e) => setMetaLevel(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-bold"
                      >
                        <option value="جذع مشترك">جذع مشترك</option>
                        <option value="أولى باك">أولى باك</option>
                        <option value="ثانية باك">ثانية باك</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500">الشعبة والمسلك:</label>
                      <input
                        type="text"
                        value={metaStream}
                        onChange={(e) => setMetaStream(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500">القسم / الفوج:</label>
                      <input
                        type="text"
                        value={metaClassNumber}
                        onChange={(e) => setMetaClassNumber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500">موضوع الدرس / المفهوم:</label>
                      <input
                        type="text"
                        value={metaLessonTopic}
                        onChange={(e) => setMetaLessonTopic(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500">الهدف البيداغوجي:</label>
                    <input
                      type="text"
                      value={metaPedagogicalGoal}
                      onChange={(e) => setMetaPedagogicalGoal(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base sm:text-xs rounded-xl p-2.5 min-h-[44px] outline-none font-semibold"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Final Save Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-t border-slate-100 pt-5">
              <span className="text-[11px] text-slate-400 font-semibold">
                تحفظ الاستمارة في الخادم المحلي والسحابة وتصبح جاهزة للإطلاق الفوري.
              </span>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={openBuilderInSimulatorModal}
                  className="w-full sm:w-auto py-3 px-5 min-h-[46px] bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 font-black text-xs rounded-2xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>معاينة (محاكاة التلميذ)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveForm}
                  className="w-full sm:w-auto py-3 px-6 min-h-[46px] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-2xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editFormId ? 'حفظ التعديلات في البنك' : 'حفظ الاستمارة في البنك'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Side Guidelines & Diagnostics Summary Column */}
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-[28px] border border-slate-200 space-y-4">
              <h4 className="font-extrabold text-slate-800 text-xs border-b border-slate-200 pb-2.5 flex items-center gap-1.5">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                <span>إرشادات صياغة الاستمارة الفلسفية</span>
              </h4>
              <ul className="space-y-3 text-xs text-slate-600 leading-relaxed font-medium text-right">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600 font-black">•</span>
                  <span>
                    <strong>توزيع المحاور:</strong> وازن بين التصور الأولي والتفكير النقدي والاستدلال الحجاجي لرفع دقة التقرير الفردي.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600 font-black">•</span>
                  <span>
                    <strong>الأسئلة التفاعلية:</strong> استخدم نوع <em>ترتيب عناصر</em> و<em>شبكة التقييم</em> لقياس الأولويات ومستويات التمكن بدقة.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-600 font-black">•</span>
                  <span>
                    <strong>محاكاة التلميذ:</strong> جرّب الاستمارة عبر تبويب المحاكاة وتأكد من اشتغال الشروط الإلزامية قبل إطلاق الجلسة.
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-900 p-6 rounded-[28px] text-white border border-slate-800 space-y-3 shadow-md">
              <Sparkles className="w-6 h-6 text-amber-400" />
              <h4 className="font-black text-sm">تكامل مباشر مع الميزان التشخيصي</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
                يرتبط كل سؤال بمحوره ووزنه عند إرسال التلميذ لإجاباته، ليظهر في لوحة الأستاذ تحليل دقيق لكل بند وكشف للتناقضات وخطط دعم فردية.
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        /* ============================ FORMS BANK INDEX ============================ */
        <div className="space-y-6">
          {/* Honest KPI Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-black text-slate-400 block">إجمالي الاستمارات بالبنك</span>
                <span className="text-2xl font-black font-mono tabular-nums text-slate-900 block">
                  {totalInBank}
                </span>
                <span className="text-[11px] text-slate-500 font-bold block font-mono tabular-nums">
                  {templatesCount} قوالب مرجعية · {customCount} مخصصة
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Layers className="w-6 h-6 text-slate-700" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[11px] font-black text-blue-600 block">مجموع البنود التشخيصية</span>
                <span className="text-2xl font-black font-mono tabular-nums text-blue-700 block">
                  {totalDiagnosticQuestions}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold block">
                  عبر جميع القوالب والاستمارات المتاحة
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex items-center justify-between gap-4 sm:col-span-2 lg:col-span-1">
              <div className="space-y-1">
                <span className="text-[11px] font-black text-emerald-700 block">جاهزية الإطلاق الصفي</span>
                <span className="text-2xl font-black font-mono tabular-nums text-emerald-700 block">
                  {publishedOrReadyCount}
                </span>
                <span className="text-[11px] text-slate-500 font-semibold block font-mono tabular-nums">
                  جاهز أو منشور · {savedDraftsCount} مسودة محفوظة
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex flex-col sm:flex-row flex-wrap bg-slate-100 p-1.5 rounded-2xl border border-slate-200 gap-1.5 w-full lg:w-auto">
                {[
                  { id: 'all', label: 'الكل', icon: Layers },
                  { id: 'saved', label: 'مسودات الأستاذ', icon: Clock },
                  { id: 'published', label: 'المنشورة', icon: Share2 },
                  { id: 'ready', label: 'القوالب الجاهزة', icon: CheckCircle },
                ].map((tab) => {
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveFilter(tab.id as any)}
                      className={`px-3 py-2.5 sm:py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer justify-center flex-1 sm:flex-initial ${
                        activeFilter === tab.id
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/40'
                      }`}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="hidden md:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-end lg:self-auto">
                <button
                  type="button"
                  onClick={() => setCustomViewMode('table')}
                  className={`p-1.5 px-2.5 rounded-lg transition flex items-center gap-1 text-xs font-black cursor-pointer ${
                    customViewMode === 'table'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <TableIcon className="w-4 h-4" />
                  <span>جدول</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomViewMode('cards')}
                  className={`p-1.5 px-2.5 rounded-lg transition flex items-center gap-1 text-xs font-black cursor-pointer ${
                    customViewMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>بطاقات</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="ابحث بالعنوان أو الوصف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 text-slate-800 py-2.5 pl-3 pr-9 min-h-[44px] rounded-xl text-base sm:text-xs outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 font-bold"
                />
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>

              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 text-slate-800 py-2.5 px-3 min-h-[44px] rounded-xl text-base sm:text-xs outline-none font-black cursor-pointer"
              >
                <option value="all">جميع المستويات الدراسية</option>
                <option value="جذع مشترك">جذع مشترك</option>
                <option value="أولى باك">أولى باك</option>
                <option value="ثانية باك">ثانية باك</option>
              </select>

              <select
                value={selectedAiStatus}
                onChange={(e) => setSelectedAiStatus(e.target.value)}
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 text-slate-800 py-2.5 px-3 min-h-[44px] rounded-xl text-base sm:text-xs outline-none font-black cursor-pointer"
              >
                <option value="all">جميع الحالات</option>
                <option value="analyzed">جاهز للإطلاق المباشر</option>
                <option value="processing">مسودة قيد التطوير</option>
              </select>

              <select
                value={sortByDate}
                onChange={(e) => setSortByDate(e.target.value as any)}
                className="w-full bg-slate-50 focus:bg-white border border-slate-200 text-slate-800 py-2.5 px-3 min-h-[44px] rounded-xl text-base sm:text-xs outline-none font-black cursor-pointer"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم أولاً</option>
              </select>
            </div>
          </div>

          {/* Forms Listing */}
          {sortedForms.length === 0 ? (
            <div className="py-20 bg-white border border-dashed text-center rounded-[28px] space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-sm font-black text-slate-700">لا توجد استمارات تطابق معايير البحث الحالية</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                جرّب إعادة ضبط الفلاتر أو إنشاء استمارة تشخيصية جديدة.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div
                className={`hidden ${
                  customViewMode === 'table' ? 'md:block' : ''
                } bg-white rounded-[24px] border border-slate-200 shadow-xs overflow-hidden`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse" dir="rtl">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black h-11">
                        <th className="px-5 text-right">الاستمارة المعرفية</th>
                        <th className="px-4 text-right">المستوى</th>
                        <th className="px-4 text-center">البنود</th>
                        <th className="px-4 text-right">الحالة</th>
                        <th className="px-5 text-left">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedForms.map((form) => {
                        const isSystem = form.teacherId === 'system_admin' || form.isTemplate;
                        const formLevel = form.level || getFallbackLevel(form.formId);

                        return (
                          <tr
                            key={form.formId}
                            className="border-b border-slate-100 hover:bg-slate-50/60 transition"
                          >
                            <td className="px-5 py-4 max-w-sm">
                              <div className="space-y-1">
                                <h4 className="font-extrabold text-slate-800 text-xs leading-relaxed">
                                  {form.title}
                                </h4>
                                <p className="text-[11px] text-slate-400 truncate max-w-xs">
                                  {form.description}
                                </p>
                              </div>
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-xs font-bold text-slate-700">{formLevel}</div>
                              {form.stream && (
                                <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                  {form.stream}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-4 text-center whitespace-nowrap font-mono tabular-nums font-bold text-slate-600">
                              {form.questions.length}
                            </td>

                            <td className="px-4 py-4 whitespace-nowrap text-right">
                              <span
                                className={`inline-flex py-0.5 px-2.5 rounded-md font-extrabold text-[10px] border ${
                                  form.status === 'published'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : form.status === 'ready'
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {form.status === 'published'
                                  ? 'منشورة'
                                  : form.status === 'ready'
                                  ? 'قالب معتمد'
                                  : 'مسودة'}
                              </span>
                            </td>

                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openFormInSimulatorModal(form)}
                                  className="px-2.5 py-1.5 border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-800 rounded-lg text-[11px] font-black cursor-pointer inline-flex items-center gap-1"
                                  title="معاينة (محاكاة التلميذ)"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>معاينة (محاكاة التلميذ)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewModalTab('structure');
                                    setPreviewAnswers({});
                                    setPreviewForm(form);
                                  }}
                                  className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                                  title="معاينة البنية والمؤشرات"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>البنية</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCopyAsDraft(form)}
                                  className="px-2.5 py-1.5 border border-indigo-200 bg-indigo-50/40 hover:bg-indigo-50 text-indigo-700 rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                                  title="نسخ وتخصيص"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>نسخ</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => exportFormAsJsonFile(form)}
                                  className="p-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg cursor-pointer"
                                  title="تنزيل JSON"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>

                                {!isSystem && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleEditForm(form)}
                                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>تعديل</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteForm(form.formId)}
                                      className="p-1.5 border border-red-100 hover:bg-red-50 text-red-500 rounded-lg cursor-pointer"
                                      title="حذف"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleInitTransfer(form)}
                                  className="px-3 py-1.5 bg-[#0277b6] hover:bg-[#026aa3] text-white rounded-lg text-[11px] font-black cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Rocket className="w-3.5 h-3.5" />
                                  <span>إطلاق جلسة</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile / Cards View */}
              <div
                className={`${
                  customViewMode === 'table' ? 'md:hidden' : ''
                } grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5`}
              >
                {sortedForms.map((form) => {
                  const isSystem = form.teacherId === 'system_admin' || form.isTemplate;
                  const formLevel = form.level || getFallbackLevel(form.formId);

                  return (
                    <div
                      key={form.formId}
                      className={`rounded-2xl p-5 border shadow-xs flex flex-col justify-between transition w-full ${
                        isSystem
                          ? 'border-indigo-200 bg-indigo-50/15'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="space-y-2.5 mb-4">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-md border ${
                              form.status === 'published'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : form.status === 'ready'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {form.status === 'published'
                              ? 'منشورة'
                              : form.status === 'ready'
                              ? 'قالب معتمد'
                              : 'مسودة'}
                          </span>
                          <span className="text-slate-500 font-mono tabular-nums">
                            {formLevel} · {form.questions.length} بنود
                          </span>
                        </div>

                        <h4 className="font-extrabold text-slate-900 text-sm leading-snug">
                          {form.title}
                        </h4>

                        <p className="text-xs leading-relaxed text-slate-500 line-clamp-2">
                          {form.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center gap-1.5 w-full">
                          <button
                            type="button"
                            onClick={() => openFormInSimulatorModal(form)}
                            className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition flex items-center justify-center gap-1.5 text-xs font-black cursor-pointer min-h-[44px]"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>معاينة (محاكاة التلميذ)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPreviewModalTab('structure');
                              setPreviewAnswers({});
                              setPreviewForm(form);
                            }}
                            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] shrink-0"
                            title="معاينة البنية والمؤشرات"
                          >
                            <Eye className="w-4 h-4 text-slate-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyAsDraft(form)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] shrink-0"
                            title="نسخ وتخصيص"
                          >
                            <Copy className="w-4 h-4 text-slate-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => exportFormAsJsonFile(form)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] shrink-0"
                            title="تنزيل JSON"
                          >
                            <Download className="w-4 h-4 text-slate-700" />
                          </button>

                          {!isSystem && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditForm(form)}
                                className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] shrink-0"
                                title="تعديل"
                              >
                                <Edit3 className="w-4 h-4 text-emerald-400" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteForm(form.formId)}
                                className="p-2 border border-red-100 hover:bg-red-50 text-red-500 rounded-xl flex items-center justify-center cursor-pointer min-h-[44px] min-w-[44px] shrink-0"
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleInitTransfer(form)}
                          className="w-full py-2 px-4 bg-[#0277b6] hover:bg-[#026aa3] text-white font-black rounded-xl transition flex items-center justify-center gap-1.5 text-xs cursor-pointer min-h-[44px]"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          <span>إطلاق جلسة فورية للتلاميذ</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================ MODALS ============================ */}
      <AnimatePresence>
        {/* 1. Preview Questionnaire Modal (with Interactive Simulator tab) */}
        {previewForm && (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto"
            dir="rtl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className={`bg-white rounded-[28px] border border-slate-200 p-5 sm:p-7 w-full max-h-[92vh] overflow-y-auto text-right shadow-2xl space-y-5 my-auto transition-all ${
                previewModalTab === 'interactive' ? 'max-w-4xl' : 'max-w-2xl'
              }`}
            >
              <div className="border-b border-slate-100 pb-4 flex justify-between items-center gap-4">
                <div className="space-y-1">
                  <span className="text-indigo-600 text-[11px] font-black block">
                    معاينة الاستمارة
                  </span>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">
                    {previewForm.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewForm(null)}
                  className="py-2 px-3.5 min-h-[40px] border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-extrabold text-xs cursor-pointer shrink-0"
                >
                  إغلاق ×
                </button>
              </div>

              <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewModalTab('structure')}
                  className={`py-2 min-h-[40px] rounded-lg text-xs font-black cursor-pointer ${
                    previewModalTab === 'structure'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  البنية والمؤشرات
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalTab('interactive')}
                  className={`py-2 min-h-[40px] rounded-lg text-xs font-black cursor-pointer ${
                    previewModalTab === 'interactive'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  محاكاة تفاعلية (منظور التلميذ)
                </button>
              </div>

              <div className="space-y-4 max-h-[62vh] overflow-y-auto pr-1">
                {previewModalTab === 'interactive' ? (
                  <StudentSimulator
                    mode="embedded"
                    title={previewForm.title}
                    description={previewForm.description}
                    questions={previewForm.questions}
                    sessionMeta={{
                      level: previewForm.level,
                      stream: previewForm.stream,
                      classNumber: previewForm.classNumber,
                      lessonTopic: previewForm.lessonTopic,
                    }}
                    initialAnswers={previewAnswers}
                    onAnswersChange={setPreviewAnswers}
                    returnLabel="إغلاق المعاينة"
                    onClose={() => setPreviewForm(null)}
                  />
                ) : (
                  <>
                    {previewForm.aim && (
                      <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs space-y-2">
                        <p className="text-indigo-950 font-black">هدف الاستمارة:</p>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {previewForm.aim}
                        </p>
                        {previewForm.measuredIndicators && (
                          <p className="text-[11px] text-indigo-800 font-bold pt-1">
                            المؤشرات: {previewForm.measuredIndicators.join(' · ')}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200 leading-relaxed">
                      {previewForm.description}
                    </p>

                    <div className="space-y-3">
                      {previewForm.questions.map((field, idx) => (
                        <div
                          key={field.id || idx}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                            <span className="font-mono tabular-nums">
                              {idx + 1} · {QUESTION_TYPE_LABELS[field.type]}
                            </span>
                            <span>
                              {field.dimension || 'تقييم عام'} · الوزن {field.weight || 3}/5
                            </span>
                          </div>
                          <p className="font-extrabold text-slate-800 leading-relaxed">
                            {field.label}
                          </p>
                          {field.options && field.options.length > 0 && (
                            <p className="text-[11px] text-slate-500 font-medium">
                              {field.options.join(' · ')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => exportFormAsJsonFile(previewForm)}
                  className="min-h-[42px] py-2 px-3.5 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل JSON</span>
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = previewForm;
                      setPreviewForm(null);
                      openFormInSimulatorModal(target);
                    }}
                    className="min-h-[42px] py-2 px-4 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-black rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة (محاكاة التلميذ)</span>
                  </button>

                  {previewForm.isTemplate ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = previewForm;
                        setPreviewForm(null);
                        handleCopyAsDraft(target);
                      }}
                      className="min-h-[42px] py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ وتخصيص</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const target = previewForm;
                        setPreviewForm(null);
                        handleEditForm(target);
                      }}
                      className="min-h-[42px] py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>تعديل</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const target = previewForm;
                      setPreviewForm(null);
                      handleInitTransfer(target);
                    }}
                    className="min-h-[42px] py-2 px-4 bg-[#0277b6] hover:bg-[#026aa3] text-white text-xs font-black rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>إطلاق جلسة</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* 2. Instant Session Launch & QR/Link Share Modal */}
        {transferForm && (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[100] overflow-y-auto"
            dir="rtl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-[28px] border border-slate-200 p-5 sm:p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto text-right shadow-2xl space-y-5 my-auto"
            >
              {launchedSession ? (
                /* ---- Step 2: Instant Share Screen (Session Code + QR + Copy Link) ---- */
                <div className="space-y-5">
                  <div className="border-b border-slate-100 pb-4 flex justify-between items-center gap-4">
                    <div className="space-y-1">
                      <span className="text-emerald-700 text-[11px] font-black flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>تم إطلاق الجلسة بنجاح</span>
                      </span>
                      <h3 className="text-lg font-black text-slate-900">
                        {launchedSession.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTransferForm(null);
                        setLaunchedSession(null);
                      }}
                      className="py-2 px-3.5 min-h-[40px] border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-extrabold text-xs cursor-pointer"
                    >
                      إغلاق ×
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-center">
                    {/* QR Code Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-center">
                      {!qrImageError && launchedQrUrl ? (
                        <img
                          src={launchedQrUrl}
                          alt={`رمز QR للجلسة ${launchedSession.sessionId}`}
                          onError={() => setQrImageError(true)}
                          className="w-44 h-44 rounded-xl bg-white p-2 border border-slate-200 object-contain"
                        />
                      ) : (
                        <div className="w-44 h-44 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center gap-2 p-4">
                          <QrCode className="w-10 h-10 text-slate-400" />
                          <span className="text-[11px] font-bold text-slate-500">
                            شارك الرمز أو الرابط المباشر مع التلاميذ
                          </span>
                        </div>
                      )}
                      <span className="text-[11px] font-bold text-slate-500">
                        يمسح التلميذ الرمز بكاميرا الهاتف للدخول المباشر
                      </span>
                    </div>

                    {/* Session Code + Direct Link Controls */}
                    <div className="space-y-4">
                      <div className="bg-slate-950 text-white rounded-2xl p-4 space-y-2">
                        <span className="text-[11px] text-slate-400 font-bold block">
                          رمز ولوج الجلسة:
                        </span>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-2xl font-black font-mono tabular-nums tracking-wider text-emerald-400">
                            {launchedSession.sessionId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(launchedSession.sessionId, 'code')}
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedField === 'code' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedField === 'code' ? 'تم النسخ' : 'نسخ الرمز'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                        <span className="text-[11px] font-bold text-slate-600 block">
                          الرابط المباشر للتلميذ:
                        </span>
                        <p
                          dir="ltr"
                          className="text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded-xl p-2.5 break-all"
                        >
                          {launchedShareUrl}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(launchedShareUrl, 'link')}
                          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {copiedField === 'link' ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                          <span>
                            {copiedField === 'link' ? 'تم نسخ الرابط بنجاح' : 'نسخ الرابط المباشر'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setTransferForm(null);
                        setLaunchedSession(null);
                      }}
                      className="min-h-[44px] px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black cursor-pointer"
                    >
                      إغلاق والعودة للبنك
                    </button>
                  </div>
                </div>
              ) : (
                /* ---- Step 1: Configure & Launch Session ---- */
                <>
                  <div className="border-b border-slate-100 pb-4 flex justify-between items-center gap-4">
                    <div className="space-y-1">
                      <span className="text-emerald-700 text-[11px] font-black block">
                        بوابة إطلاق جلسة تشخيصية فورية
                      </span>
                      <h3 className="text-base sm:text-lg font-black text-slate-900">
                        إعداد الجلسة من: {transferForm.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTransferForm(null)}
                      className="py-2 px-3.5 min-h-[40px] border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-extrabold text-xs cursor-pointer shrink-0"
                    >
                      إلغاء ×
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700">
                          عنوان الجلسة التشخيصية:
                        </label>
                        <input
                          type="text"
                          value={transferSessionForm.title}
                          onChange={(e) =>
                            setTransferSessionForm({ ...transferSessionForm, title: e.target.value })
                          }
                          className="w-full p-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-xs font-bold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700">
                          المؤسسة التعليمية:
                        </label>
                        <input
                          type="text"
                          value={transferSessionForm.institution}
                          onChange={(e) =>
                            setTransferSessionForm({
                              ...transferSessionForm,
                              institution: e.target.value,
                            })
                          }
                          placeholder="اسم الثانوية التأهيلية..."
                          className="w-full p-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-xs font-bold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700">
                          المديرية / الإقليم:
                        </label>
                        <input
                          type="text"
                          value={transferSessionForm.province}
                          onChange={(e) =>
                            setTransferSessionForm({
                              ...transferSessionForm,
                              province: e.target.value,
                            })
                          }
                          placeholder="اسم الإقليم..."
                          className="w-full p-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-xs font-bold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700">
                          المستوى الدراسي:
                        </label>
                        <select
                          value={transferSessionForm.level}
                          onChange={(e) =>
                            setTransferSessionForm({ ...transferSessionForm, level: e.target.value })
                          }
                          className="w-full p-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-xs font-bold cursor-pointer"
                        >
                          <option value="جذع مشترك">جذع مشترك</option>
                          <option value="أولى باك">أولى باك</option>
                          <option value="ثانية باك">ثانية باك</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700">
                          الشعبة / المسلك:
                        </label>
                        <select
                          value={transferSessionForm.stream}
                          onChange={(e) =>
                            setTransferSessionForm({ ...transferSessionForm, stream: e.target.value })
                          }
                          className="w-full p-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-xs font-bold cursor-pointer"
                        >
                          <option value="العلوم">العلوم التجريبية والتكنولوجية والرياضية</option>
                          <option value="شعبة الآداب والعلوم الإنسانية">شعبة الآداب والعلوم الإنسانية</option>
                          <option value="التعليم الأصيل">التعليم الأصيل</option>
                          <option value="مسلك العلوم الاقتصادية والتدبير">مسلك العلوم الاقتصادية والتدبير</option>
                          <option value="المهني">المهني والمسالك الدولية</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-extrabold text-slate-700">
                          القسم / الفوج:
                        </label>
                        <input
                          type="text"
                          value={transferSessionForm.classNumber}
                          onChange={(e) =>
                            setTransferSessionForm({
                              ...transferSessionForm,
                              classNumber: e.target.value,
                            })
                          }
                          placeholder="مثال: فوج 1"
                          className="w-full p-3 min-h-[44px] bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-xs font-bold focus:bg-white focus:border-indigo-500 outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-3 bg-slate-50 p-3 border rounded-2xl border-slate-200 min-h-[48px] sm:mt-6">
                        <input
                          type="checkbox"
                          id="transferSupervised"
                          checked={transferSessionForm.supervisedMode}
                          onChange={(e) =>
                            setTransferSessionForm({
                              ...transferSessionForm,
                              supervisedMode: e.target.checked,
                            })
                          }
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer shrink-0"
                        />
                        <label
                          htmlFor="transferSupervised"
                          className="text-xs font-black text-slate-700 cursor-pointer select-none"
                        >
                          تفعيل المراقبة ومنع اللصق
                        </label>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70">
                      <button
                        type="button"
                        onClick={() => setQuestionsPreviewOpen(!questionsPreviewOpen)}
                        className="w-full flex justify-between items-center font-black text-slate-700 text-xs cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-4 h-4 text-indigo-600" />
                          <span>مراجعة الأسئلة ({transferForm.questions.length} بنود)</span>
                        </span>
                        <span className="text-[11px] text-indigo-600 font-bold">
                          {questionsPreviewOpen ? 'إخفاء' : 'عرض البنود'}
                        </span>
                      </button>

                      {questionsPreviewOpen && (
                        <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
                          {transferForm.questions.map((q, qidx) => (
                            <div
                              key={q.id || qidx}
                              className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1"
                            >
                              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                                <span className="font-mono tabular-nums">السؤال {qidx + 1}</span>
                                <span>{QUESTION_TYPE_LABELS[q.type]}</span>
                              </div>
                              <p className="font-bold text-slate-800">{q.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
                    {transferForm.isTemplate ? (
                      <button
                        type="button"
                        onClick={() => {
                          const target = transferForm;
                          setTransferForm(null);
                          handleCopyAsDraft(target);
                        }}
                        className="min-h-[44px] py-2.5 px-4 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 text-xs font-black rounded-xl cursor-pointer inline-flex items-center justify-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ وتخصيص قبل الإطلاق</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const target = transferForm;
                          setTransferForm(null);
                          handleEditForm(target);
                        }}
                        className="min-h-[44px] py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-black rounded-xl cursor-pointer inline-flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل البنود</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={transferLoading}
                      onClick={handleConfirmTransfer}
                      className="min-h-[46px] py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl cursor-pointer disabled:opacity-50 text-xs inline-flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Rocket className="w-4 h-4" />
                      <span>
                        {transferLoading ? 'جاري إطلاق الجلسة...' : 'إطلاق الجلسة وتوليد QR'}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}

        {/* 3. Confirm Delete Modal */}
        {confirmDeleteFormId && (
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-[110]"
            dir="rtl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[28px] border border-slate-200 p-5 sm:p-6 max-w-md w-full text-right shadow-2xl space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">تأكيد حذف الاستمارة</h4>
                  <p className="text-xs text-slate-500 font-bold mt-0.5">
                    هل أنت متأكد من حذف هذه الاستمارة من بنكك؟ (تبقى الجلسات السابقة محفوظة)
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteFormId(null)}
                  className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={executeDeleteForm}
                  className="min-h-[44px] px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black cursor-pointer"
                >
                  نعم، حذف نهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Standalone Modal Student Simulator */}
      <StudentSimulator
        isOpen={Boolean(simulatorModalData)}
        mode="modal"
        title={simulatorModalData?.title || 'معاينة الاستمارة'}
        description={simulatorModalData?.description}
        questions={simulatorModalData?.questions || []}
        sessionMeta={simulatorModalData?.sessionMeta}
        initialAnswers={simulatorModalData?.initialAnswers}
        onAnswersChange={
          simulatorModalData?.syncWithBuilder ? setSimAnswers : undefined
        }
        showPedagogicalMetaByDefault={
          simulatorModalData?.showPedagogicalMetaByDefault ?? true
        }
        returnLabel={
          simulatorModalData?.returnLabel || 'إغلاق والعودة إلى لوحة تحرير الاستمارة'
        }
        onClose={() => setSimulatorModalData(null)}
      />
    </div>
  );
}
