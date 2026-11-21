import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  BarChart3,
  PieChart as PieChartIcon,
  Radar as RadarIcon,
  GitCompare,
  Users,
  Eye,
  X,
  Filter,
  Compass,
  Lightbulb,
  Brain,
  Heart,
} from 'lucide-react';
import { DiagnosticSession, StudentSubmission } from '../types';

export type PhilosophicalConceptKey = 'freedom' | 'nature' | 'critical' | 'affective';
export type ChartViewMode = 'bar' | 'pie' | 'radar';

interface ConceptCategoryDefinition {
  key: string;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}

interface StudentStatisticsProps {
  submissions: StudentSubmission[];
  simulationSubmissions: StudentSubmission[];
  sessions: DiagnosticSession[];
  selectedSessionId: string;
  onSessionChange: (sessionId: string) => void;
  useSimulationData: boolean;
  onToggleSimulationData: (enabled: boolean) => void;
  onSelectStudent: (student: StudentSubmission) => void;
  onNavigateToSessions?: () => void;
}

interface ChartBucketItem {
  key: string;
  name: string;
  shortName: string;
  color: string;
  description: string;
  count: number;
  percentage: number;
  simCount: number;
  simPercentage: number;
  delta: number;
  students: StudentSubmission[];
}

const CONCEPT_TABS: {
  id: PhilosophicalConceptKey;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'freedom',
    label: 'مفهوم الحرية',
    subtitle: 'استراتيجيات التلميذ في مقاربة سؤال كنه الحرية والتفكير المستقل',
    icon: Compass,
  },
  {
    id: 'nature',
    label: 'طبيعة الفلسفة',
    subtitle: 'التمثلات الأولية لمعنى الفلسفة ومصادر تشكلها في ذهن التلميذ',
    icon: Lightbulb,
  },
  {
    id: 'critical',
    label: 'التفكير النقدي',
    subtitle: 'توزيع الأنماط الفكرية التشخيصية والقدرة على التساؤل المنهجي',
    icon: Brain,
  },
  {
    id: 'affective',
    label: 'التمثلات العاطفية',
    subtitle: 'المواقف الوجدانية والشعور السائد عند سماع كلمة الفلسفة',
    icon: Heart,
  },
];

const CONCEPT_CATEGORIES: Record<PhilosophicalConceptKey, ConceptCategoryDefinition[]> = {
  freedom: [
    {
      key: 'realistic_examples',
      label: 'أفكر في أمثلة من الواقع',
      shortLabel: 'أمثلة واقعية',
      color: '#059669',
      description: 'ربط مفهوم الحرية بالتجربة المعيشة والتحليل الشخصي المستقل',
    },
    {
      key: 'ready_answer',
      label: 'أبحث عن جواب جاهز',
      shortLabel: 'جواب جاهز',
      color: '#d97706',
      description: 'الاتكال على التعريفات المحفوظة وتجنب المغامرة الفكرية',
    },
    {
      key: 'find_difficult',
      label: 'أعتبره صعباً',
      shortLabel: 'استصعاب السؤال',
      color: '#dc2626',
      description: 'الإحساس بعائق معرفي أمام التجريد المفاهيمي لمسألة الحرية',
    },
    {
      key: 'ask_help',
      label: 'أطلب المساعدة',
      shortLabel: 'طلب التوجيه',
      color: '#2563eb',
      description: 'الانفتاح التواصلي والحاجة إلى تأطير منهجي تدرجي',
    },
    {
      key: 'other_freedom',
      label: 'مقاربات أخرى',
      shortLabel: 'أخرى',
      color: '#64748b',
      description: 'استجابات مفتوحة أو بديلة حول إشكالية الحرية',
    },
  ],
  nature: [
    {
      key: 'rational_inquiry',
      label: 'التفكير والتساؤل العقلاني',
      shortLabel: 'تساؤل عقلاني',
      color: '#0d9488',
      description: 'رؤية الفلسفة كفعل مساءلة نقدية وتحرر بالعقل والشك المنهجي',
    },
    {
      key: 'wisdom_existence',
      label: 'الحكمة والبحث في الوجود',
      shortLabel: 'حكمة ووجود',
      color: '#4f46e5',
      description: 'ربط الفلسفة بمعنى الحياة والبحث في القيم والحقيقة الكونية',
    },
    {
      key: 'dialogue_debate',
      label: 'الحوار وتعدد وجهات النظر',
      shortLabel: 'حوار وتعدد',
      color: '#0284c7',
      description: 'تمثل الفلسفة كفضاء للنقاش الحجاجي واحترام الاختلاف',
    },
    {
      key: 'school_memorization',
      label: 'مادة دراسية وحفظ معلومات',
      shortLabel: 'حفظ ومدرسة',
      color: '#d97706',
      description: 'حصر الفلسفة في المقرر المدرسي والنجاح في الفروض فقط',
    },
    {
      key: 'vague_perception',
      label: 'تصور غامض أو غير محدد',
      shortLabel: 'غير متبلور',
      color: '#64748b',
      description: 'غياب فكرة مسبقة واضحة أو النظر إلى الفلسفة كخطاب معقد',
    },
  ],
  critical: [
    {
      key: 'تفكير نقدي',
      label: 'تفكير نقدي',
      shortLabel: 'تفكير نقدي',
      color: '#059669',
      description: 'تمثل ناضج يوازن بين المساءلة الذاتية وبناء الحجة المنطقية',
    },
    {
      key: 'فضول معرفي',
      label: 'فضول معرفي',
      shortLabel: 'فضول معرفي',
      color: '#2563eb',
      description: 'شغف مرتفع بالاكتشاف والتساؤل مع حاجة لصقل المنهج النقدي',
    },
    {
      key: 'تفكير سطحي',
      label: 'تفكير سطحي',
      shortLabel: 'تفكير سطحي',
      color: '#d97706',
      description: 'اكتفاء بالبديهيات اليومية أو الأجوبة الجاهزة دون فحص عميق',
    },
    {
      key: 'خوف معرفي',
      label: 'خوف معرفي',
      shortLabel: 'خوف معرفي',
      color: '#dc2626',
      description: 'توجس وتردد أمام الأسئلة المفتوحة والنقاش الفلسفي الصفي',
    },
  ],
  affective: [
    {
      key: 'فضول',
      label: 'فضول',
      shortLabel: 'فضول',
      color: '#2563eb',
      description: 'انجذاب معرفي ورغبة فطرية في استكشاف المجهول الفلسفي',
    },
    {
      key: 'إعجاب',
      label: 'إعجاب',
      shortLabel: 'إعجاب',
      color: '#059669',
      description: 'تقدير إيجابي لقيمة التفلسف وحماسة وجدانية للمادة',
    },
    {
      key: 'حياد',
      label: 'حياد',
      shortLabel: 'حياد',
      color: '#64748b',
      description: 'موقف وجداني متوازن ومترقب دون انفعال مسبق',
    },
    {
      key: 'صعوبة',
      label: 'صعوبة',
      shortLabel: 'صعوبة',
      color: '#d97706',
      description: 'شعور بعائق لغوي أو تجريدي يحتاج إلى تبسيط تدريجي',
    },
    {
      key: 'خوف',
      label: 'خوف',
      shortLabel: 'خوف',
      color: '#dc2626',
      description: 'قلق معرفي وتوتر وجداني يحدّ من المبادرة داخل القسم',
    },
  ],
};

function getAnswers(sub: StudentSubmission) {
  return sub.answers || sub.responses || ({} as StudentSubmission['answers']);
}

function classifyStudentByConcept(
  sub: StudentSubmission,
  concept: PhilosophicalConceptKey
): string {
  const answers = getAnswers(sub);

  if (concept === 'freedom') {
    const val = (answers?.reactionToFreedomQuestion || '').trim();
    if (val.includes('أمثلة') || val.includes('الواقع')) return 'realistic_examples';
    if (val.includes('جاهز') || val.includes('جواب')) return 'ready_answer';
    if (val.includes('صعب')) return 'find_difficult';
    if (val.includes('مساعدة') || val.includes('أطلب')) return 'ask_help';
    return 'other_freedom';
  }

  if (concept === 'nature') {
    const meaning = (answers?.philosophyMeaning || '').trim();
    const goal = (answers?.philosophyPrimaryGoal || '').trim();
    const source = (answers?.sourceOfIdea || '').trim();

    if (
      meaning.includes('تساؤل') ||
      meaning.includes('نقد') ||
      meaning.includes('عقل') ||
      meaning.includes('شك') ||
      meaning.includes('تفكير') ||
      goal === 'تعلم التفكير'
    ) {
      return 'rational_inquiry';
    }
    if (
      meaning.includes('حكم') ||
      meaning.includes('حقيق') ||
      meaning.includes('وجود') ||
      meaning.includes('حياة') ||
      meaning.includes('كون') ||
      meaning.includes('معنى')
    ) {
      return 'wisdom_existence';
    }
    if (
      meaning.includes('حوار') ||
      meaning.includes('نقاش') ||
      meaning.includes('رأي') ||
      meaning.includes('اختلاف') ||
      goal === 'النقاش'
    ) {
      return 'dialogue_debate';
    }
    if (
      meaning.includes('حفظ') ||
      meaning.includes('مادة') ||
      meaning.includes('امتحان') ||
      meaning.includes('درس') ||
      goal === 'النجاح الدراسي' ||
      goal === 'حفظ المعلومات'
    ) {
      return 'school_memorization';
    }
    if (source === 'لا فكرة مسبقة' || meaning.length < 8) {
      return 'vague_perception';
    }
    return 'rational_inquiry';
  }

  if (concept === 'critical') {
    const style = sub.overriddenClassification || sub.analysis?.classification || 'تفكير سطحي';
    if (
      style === 'تفكير نقدي' ||
      style === 'فضول معرفي' ||
      style === 'تفكير سطحي' ||
      style === 'خوف معرفي'
    ) {
      return style;
    }
    return 'تفكير سطحي';
  }

  // affective
  const feeling = (answers?.feelingWhenHearing || '').trim();
  if (feeling === 'فضول' || feeling.includes('فضول')) return 'فضول';
  if (feeling === 'إعجاب' || feeling.includes('إعجاب')) return 'إعجاب';
  if (feeling === 'حياد' || feeling.includes('حياد')) return 'حياد';
  if (feeling === 'صعوبة' || feeling.includes('صعوب')) return 'صعوبة';
  if (feeling === 'خوف' || feeling.includes('خوف')) return 'خوف';
  return 'حياد';
}

function getStudentConceptExcerpt(
  sub: StudentSubmission,
  concept: PhilosophicalConceptKey
): { label: string; text: string } {
  const answers = getAnswers(sub);
  if (concept === 'freedom') {
    return {
      label: 'موقفه من سؤال الحرية',
      text: answers?.reactionToFreedomQuestion || 'لم تُسجَّل إجابة محددة',
    };
  }
  if (concept === 'nature') {
    return {
      label: `المصدر: ${answers?.sourceOfIdea || 'غير محدد'}`,
      text: answers?.philosophyMeaning || 'لا يوجد نص مفتوح مسجل',
    };
  }
  if (concept === 'critical') {
    return {
      label: `النقدي ${Math.round(sub.analysis?.metrics?.criticalThinking || 0)}% · الفضول ${Math.round(sub.analysis?.metrics?.cognitiveCuriosity || 0)}%`,
      text: sub.analysis?.explanation || 'ملف تشخيصي مسجل',
    };
  }
  return {
    label: `الشعور: ${answers?.feelingWhenHearing || 'حياد'}`,
    text: answers?.feelingJustification || 'دون تعليل مرفق',
  };
}

export const StudentStatistics: React.FC<StudentStatisticsProps> = ({
  submissions,
  simulationSubmissions,
  sessions,
  selectedSessionId,
  onSessionChange,
  useSimulationData,
  onToggleSimulationData,
  onSelectStudent,
  onNavigateToSessions,
}) => {
  const [activeConcept, setActiveConcept] = useState<PhilosophicalConceptKey>('freedom');
  const [chartMode, setChartMode] = useState<ChartViewMode>('bar');
  const [compareWithSimulation, setCompareWithSimulation] = useState<boolean>(true);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);

  const sessionFilteredSubmissions = useMemo(() => {
    if (useSimulationData) return simulationSubmissions;
    if (selectedSessionId === 'all') return submissions;
    return submissions.filter(
      (sub) => sub.session_id === selectedSessionId || sub.sessionId === selectedSessionId
    );
  }, [submissions, simulationSubmissions, selectedSessionId, useSimulationData]);

  const bucketData: ChartBucketItem[] = useMemo(() => {
    const definitions = CONCEPT_CATEGORIES[activeConcept];
    const activeTotal = sessionFilteredSubmissions.length;
    const simTotal = simulationSubmissions.length;

    const activeGroups: Record<string, StudentSubmission[]> = {};
    const simGroups: Record<string, number> = {};

    definitions.forEach((def) => {
      activeGroups[def.key] = [];
      simGroups[def.key] = 0;
    });

    sessionFilteredSubmissions.forEach((sub) => {
      const catKey = classifyStudentByConcept(sub, activeConcept);
      if (!activeGroups[catKey]) activeGroups[catKey] = [];
      activeGroups[catKey].push(sub);
    });

    simulationSubmissions.forEach((sub) => {
      const catKey = classifyStudentByConcept(sub, activeConcept);
      simGroups[catKey] = (simGroups[catKey] || 0) + 1;
    });

    return definitions
      .filter((def) => {
        if (def.key === 'other_freedom') {
          return activeGroups[def.key].length > 0 || (simGroups[def.key] || 0) > 0;
        }
        return true;
      })
      .map((def) => {
        const count = activeGroups[def.key]?.length || 0;
        const simCount = simGroups[def.key] || 0;
        const percentage = activeTotal > 0 ? Math.round((count / activeTotal) * 100) : 0;
        const simPercentage = simTotal > 0 ? Math.round((simCount / simTotal) * 100) : 0;
        return {
          key: def.key,
          name: def.label,
          shortName: def.shortLabel,
          color: def.color,
          description: def.description,
          count,
          percentage,
          simCount,
          simPercentage,
          delta: percentage - simPercentage,
          students: activeGroups[def.key] || [],
        };
      });
  }, [activeConcept, sessionFilteredSubmissions, simulationSubmissions]);

  const activeConceptMeta = CONCEPT_TABS.find((t) => t.id === activeConcept) || CONCEPT_TABS[0];

  const dominantBucket = useMemo(() => {
    if (sessionFilteredSubmissions.length === 0) return null;
    return [...bucketData].sort((a, b) => b.count - a.count)[0] || null;
  }, [bucketData, sessionFilteredSubmissions.length]);

  const activeCategoryBucket = useMemo(() => {
    if (!selectedCategoryKey) return null;
    return bucketData.find((b) => b.key === selectedCategoryKey) || null;
  }, [bucketData, selectedCategoryKey]);

  const pieChartData = useMemo(
    () => bucketData.filter((item) => item.count > 0),
    [bucketData]
  );

  const handleSelectConcept = (concept: PhilosophicalConceptKey) => {
    setActiveConcept(concept);
    setSelectedCategoryKey(null);
  };

  const handleBucketClick = (bucketKey?: string) => {
    if (!bucketKey) return;
    setSelectedCategoryKey((prev) => (prev === bucketKey ? null : bucketKey));
  };

  const activeSessionObj = sessions.find((s) => s.sessionId === selectedSessionId);
  const sampleSize = sessionFilteredSubmissions.length;

  return (
    <section
      className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden text-right"
      dir="rtl"
      aria-label="إحصاءات تمثلات التلاميذ حول المفاهيم الفلسفية"
    >
      {/* Header & Controls Bar */}
      <div className="p-4 sm:p-6 border-b border-slate-200 space-y-4 sm:space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
              إحصاءات تمثلات التلاميذ حول المفاهيم الفلسفية الأساسية
            </h3>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="hidden sm:inline">{activeConceptMeta.subtitle}</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums font-bold text-slate-700">
                العينة: {sampleSize} تلميذ
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-full">
                {useSimulationData
                  ? 'وضع المحاكاة النموذجية'
                  : activeSessionObj
                    ? `${activeSessionObj.title} (${activeSessionObj.level})`
                    : 'جميع الجلسات والفصول'}
              </span>
            </div>
          </div>

          {/* Interactive Controls: Session Filter, Comparison Toggle, Chart Type */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 w-full xl:w-auto">
            {/* Classroom / Session Filter */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 min-h-[44px] w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                aria-label="تصفية الإحصاءات حسب الفصل"
                value={selectedSessionId}
                disabled={useSimulationData}
                onChange={(e) => {
                  setSelectedCategoryKey(null);
                  onSessionChange(e.target.value);
                }}
                className="w-full sm:w-auto flex-1 bg-transparent text-base sm:text-xs font-bold text-slate-800 outline-none cursor-pointer disabled:opacity-60 sm:min-w-[140px] py-2"
              >
                <option value="all">كل الجلسات والفصول</option>
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.title} · {s.level}
                  </option>
                ))}
              </select>
            </div>

            {/* Compare with Simulation Toggle */}
            <button
              type="button"
              onClick={() => setCompareWithSimulation((prev) => !prev)}
              disabled={useSimulationData}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                compareWithSimulation && !useSimulationData
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="مقارنة توزيع تمثلات الفصل الحالي مع متوسط بيانات المحاكاة"
            >
              <GitCompare className="w-4 h-4 shrink-0" />
              <span>مقارنة مع المحاكاة</span>
            </button>

            {/* Chart Type Switcher */}
            <div
              className="grid grid-cols-3 sm:inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1"
              role="group"
              aria-label="نوع الرسم البياني"
            >
              <button
                type="button"
                onClick={() => setChartMode('bar')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartMode === 'bar'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>أعمدة</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('pie')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartMode === 'pie'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5 shrink-0" />
                <span>دائري</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMode('radar')}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  chartMode === 'radar'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RadarIcon className="w-3.5 h-3.5 shrink-0" />
                <span>رادار</span>
              </button>
            </div>
          </div>
        </div>

        {/* Philosophical Concepts Filter Tabs */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-1">
          {CONCEPT_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeConcept === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectConcept(tab.id)}
                className={`inline-flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      {sampleSize === 0 ? (
        <div className="p-6 sm:p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-black text-slate-800">
              لا توجد إجابات مسجلة لهذا الفصل لعرض توزيع التمثلات
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              عندما يرسل التلاميذ استماراتهم في هذا الفصل ستظهر تلقائياً خرائط تمثلاتهم الفلسفية هنا. يمكنك أيضاً تفعيل بيانات المحاكاة لاستكشاف الرسوم البيانية فوراً.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onToggleSimulationData(true)}
              className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              معاينة ببيانات المحاكاة ({simulationSubmissions.length} تلاميذ)
            </button>
            {onNavigateToSessions && (
              <button
                type="button"
                onClick={onNavigateToSessions}
                className="px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                إدارة الجلسات والروابط
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200">
          {/* Chart Canvas (7/12 width on desktop) */}
          <div className="lg:col-span-7 p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Concise Quantitative Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-100 pb-3 sm:pb-4">
              <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
                <span>التمثل السائد حالياً:</span>
                {dominantBucket && (
                  <span className="font-extrabold text-slate-900">
                    {dominantBucket.name} ({dominantBucket.percentage}%)
                  </span>
                )}
              </div>
              <span className="hidden sm:inline text-[11px] text-slate-400">
                انقر على أي عمود أو شريحة لعرض قائمة التلاميذ المرتبطين
              </span>
            </div>

            {/* Recharts Container */}
            <div className="h-[250px] sm:h-[340px] w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'bar' ? (
                  <BarChart
                    data={bucketData}
                    margin={{ top: 10, right: 8, left: -16, bottom: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fill: '#334155', fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload as ChartBucketItem;
                        return (
                          <div
                            className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-xl border border-slate-800 text-right text-xs space-y-1.5 max-w-[260px] sm:max-w-xs"
                            dir="rtl"
                          >
                            <p className="font-black text-amber-300">{item.name}</p>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                              {item.description}
                            </p>
                            <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-4 font-mono tabular-nums">
                              <span className="text-slate-300">الفصل الحالي:</span>
                              <span className="font-bold text-white">
                                {item.percentage}% ({item.count} تلاميذ)
                              </span>
                            </div>
                            {compareWithSimulation && !useSimulationData && (
                              <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
                                <span className="text-slate-400">متوسط المحاكاة:</span>
                                <span className="font-bold text-sky-300">
                                  {item.simPercentage}% ({item.delta >= 0 ? `+${item.delta}%` : `${item.delta}%`})
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {compareWithSimulation && !useSimulationData && (
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={32}
                        formatter={(value) => (
                          <span className="text-xs font-bold text-slate-700 mr-1">{value}</span>
                        )}
                      />
                    )}
                    <Bar
                      dataKey="percentage"
                      name="الفصل الحالي (%)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={48}
                      cursor="pointer"
                      onClick={(_data, index) => handleBucketClick(bucketData[index]?.key)}
                    >
                      {bucketData.map((entry) => {
                        const isSelected = selectedCategoryKey === entry.key;
                        return (
                          <Cell
                            key={`bar-cell-${entry.key}`}
                            fill={entry.color}
                            fillOpacity={
                              selectedCategoryKey && !isSelected ? 0.35 : 1
                            }
                            stroke={isSelected ? '#0f172a' : 'none'}
                            strokeWidth={isSelected ? 2 : 0}
                          />
                        );
                      })}
                    </Bar>
                    {compareWithSimulation && !useSimulationData && (
                      <Bar
                        dataKey="simPercentage"
                        name="بيانات المحاكاة (%)"
                        fill="#cbd5e1"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={36}
                        cursor="pointer"
                        onClick={(_data, index) => handleBucketClick(bucketData[index]?.key)}
                      />
                    )}
                  </BarChart>
                ) : chartMode === 'pie' ? (
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      dataKey="percentage"
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      innerRadius="42%"
                      outerRadius="72%"
                      paddingAngle={3}
                      cursor="pointer"
                      onClick={(_data, index) => handleBucketClick(pieChartData[index]?.key)}
                    >
                      {pieChartData.map((entry) => {
                        const isSelected = selectedCategoryKey === entry.key;
                        return (
                          <Cell
                            key={`pie-cell-${entry.key}`}
                            fill={entry.color}
                            fillOpacity={
                              selectedCategoryKey && !isSelected ? 0.35 : 1
                            }
                            stroke={isSelected ? '#0f172a' : '#ffffff'}
                            strokeWidth={isSelected ? 3 : 2}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload as ChartBucketItem;
                        return (
                          <div
                            className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-xl border border-slate-800 text-right text-xs space-y-1.5 max-w-[260px] sm:max-w-xs"
                            dir="rtl"
                          >
                            <p className="font-black text-amber-300">{item.name}</p>
                            <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
                              <span className="text-slate-300">النسبة:</span>
                              <span className="font-bold">
                                {item.percentage}% ({item.count} تلاميذ)
                              </span>
                            </div>
                            {compareWithSimulation && !useSimulationData && (
                              <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
                                <span className="text-slate-400">المحاكاة:</span>
                                <span className="text-sky-300 font-bold">
                                  {item.simPercentage}% ({item.delta >= 0 ? `+${item.delta}%` : `${item.delta}%`})
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value) => (
                        <span className="text-[11px] sm:text-xs font-bold text-slate-700 mr-1">{value}</span>
                      )}
                    />
                  </PieChart>
                ) : (
                  <RadarChart cx="50%" cy="50%" outerRadius="62%" data={bucketData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis
                      dataKey="shortName"
                      tick={{ fill: '#334155', fontSize: 10, fontWeight: 700 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fill: '#94a3b8', fontSize: 9 }}
                    />
                    <Radar
                      name="الفصل الحالي (%)"
                      dataKey="percentage"
                      stroke="#059669"
                      fill="#10b981"
                      fillOpacity={0.38}
                      strokeWidth={2.5}
                    />
                    {compareWithSimulation && !useSimulationData && (
                      <Radar
                        name="بيانات المحاكاة (%)"
                        dataKey="simPercentage"
                        stroke="#475569"
                        fill="#94a3b8"
                        fillOpacity={0.18}
                        strokeDasharray="4 4"
                        strokeWidth={2}
                      />
                    )}
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = payload[0].payload as ChartBucketItem;
                        return (
                          <div
                            className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-xl border border-slate-800 text-right text-xs space-y-1.5"
                            dir="rtl"
                          >
                            <p className="font-black text-amber-300">{item.name}</p>
                            <p className="font-mono tabular-nums">
                              الفصل الحالي: {item.percentage}% ({item.count} تلاميذ)
                            </p>
                            {compareWithSimulation && !useSimulationData && (
                              <p className="font-mono tabular-nums text-sky-300">
                                المحاكاة: {item.simPercentage}%
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      formatter={(value) => (
                        <span className="text-[11px] sm:text-xs font-bold text-slate-700 mr-1">{value}</span>
                      )}
                    />
                  </RadarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interactive Category Breakdown & Student Drill-Down (5/12 width on desktop) */}
          <div className="lg:col-span-5 p-4 sm:p-6 flex flex-col justify-between space-y-4 bg-slate-50/40">
            {activeCategoryBucket ? (
              <div className="space-y-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: activeCategoryBucket.color }}
                      />
                      <h4 className="text-sm font-black text-slate-900">
                        {activeCategoryBucket.name}
                      </h4>
                    </div>
                    <p className="hidden sm:block text-xs text-slate-500 mt-1">
                      {activeCategoryBucket.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryKey(null)}
                    className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
                    title="العودة إلى قائمة الفئات"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-mono tabular-nums">
                  <span>
                    عدد التلاميذ: {activeCategoryBucket.count} ({activeCategoryBucket.percentage}%)
                  </span>
                  {compareWithSimulation && !useSimulationData && (
                    <span>متوسط المحاكاة: {activeCategoryBucket.simPercentage}%</span>
                  )}
                </div>

                {activeCategoryBucket.students.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    لا يوجد تلاميذ مصنفون ضمن هذه الفئة في العينة الحالية.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 max-h-[280px] overflow-y-auto pr-1">
                    {activeCategoryBucket.students.map((student, idx) => {
                      const excerpt = getStudentConceptExcerpt(student, activeConcept);
                      return (
                        <div
                          key={student.id || `drill-${idx}`}
                          className="py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-xs font-black text-slate-800 truncate">
                              {student.studentName}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                              {excerpt.label}
                            </p>
                            <p className="hidden sm:block text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                              «{excerpt.text}»
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelectStudent(student)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] bg-white hover:bg-slate-900 text-slate-700 hover:text-white border border-slate-200 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض الملف</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span>توزيع الفئات والمقارنة التفصيلية</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">انقر للتفصيل</span>
                </div>

                <div className="divide-y divide-slate-200">
                  {bucketData.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleBucketClick(item.key)}
                      className="w-full py-3 px-2.5 min-h-[48px] text-right hover:bg-white rounded-xl transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs font-extrabold text-slate-800 group-hover:text-emerald-700 transition-colors truncate">
                            {item.name}
                          </span>
                        </div>
                        <p className="hidden sm:block text-[11px] text-slate-500 truncate pr-4">
                          {item.description}
                        </p>
                      </div>

                      <div className="text-left shrink-0 font-mono tabular-nums space-y-0.5">
                        <div className="text-xs font-black text-slate-900">
                          {item.percentage}%
                          <span className="text-[11px] font-semibold text-slate-500 mr-1.5">
                            ({item.count})
                          </span>
                        </div>
                        {compareWithSimulation && !useSimulationData && (
                          <div className="text-[10px] text-slate-500">
                            محاكاة: {item.simPercentage}%{' '}
                            <span
                              className={
                                item.delta > 0
                                  ? 'text-emerald-600 font-bold'
                                  : item.delta < 0
                                    ? 'text-amber-600 font-bold'
                                    : 'text-slate-400'
                              }
                            >
                              ({item.delta > 0 ? `+${item.delta}%` : `${item.delta}%`})
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default StudentStatistics;
