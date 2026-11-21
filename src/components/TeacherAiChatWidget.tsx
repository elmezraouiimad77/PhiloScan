import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Sparkles, AlertCircle, RefreshCw, GraduationCap, MinusCircle, CornerDownLeft } from 'lucide-react';
import { StudentSubmission } from '../types';
import PhiloScanLogo from './PhiloScanLogo';

interface TeacherAiChatWidgetProps {
  submissions: StudentSubmission[];
  selectedSessionId: string;
  sessions: any[];
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export const TeacherAiChatWidget: React.FC<TeacherAiChatWidgetProps> = ({
  submissions,
  selectedSessionId,
  sessions
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Find currently selected session details
  const currentSession = sessions.find(s => s.sessionId === selectedSessionId);
  const currentSubmissions = selectedSessionId === 'all' 
    ? submissions 
    : submissions.filter(sub => sub.session_id === selectedSessionId || sub.sessionId === selectedSessionId);

  // Compute stats of current session to pass as context
  const getSessionInfo = () => {
    if (currentSubmissions.length === 0) {
      return {
        title: currentSession?.title || 'جميع الأقسام',
        level: currentSession?.level || 'مشترك',
        stream: currentSession?.stream || 'عام',
        totalStudents: 0,
        avgMetrics: { cognitiveFear: 0, cognitiveCuriosity: 0, shallowThinking: 0, criticalThinking: 0 },
        distribution: { cognitiveFear: 0, cognitiveCuriosity: 0, shallowThinking: 0, criticalThinking: 0 }
      };
    }

    const total = currentSubmissions.length;
    let fearSum = 0, curiositySum = 0, shallowSum = 0, criticalSum = 0;
    let fearCount = 0, curiosityCount = 0, shallowCount = 0, criticalCount = 0;

    currentSubmissions.forEach(sub => {
      const m = sub.analysis?.metrics || { cognitiveFear: 0, cognitiveCuriosity: 0, shallowThinking: 0, criticalThinking: 0 };
      fearSum += m.cognitiveFear;
      curiositySum += m.cognitiveCuriosity;
      shallowSum += m.shallowThinking;
      criticalSum += m.criticalThinking;

      const classification = sub.analysis?.classification || '';
      if (classification.includes('خوف') || classification.includes('fear')) fearCount++;
      else if (classification.includes('فضول') || classification.includes('curiosity')) curiosityCount++;
      else if (classification.includes('سطحي') || classification.includes('shallow')) shallowCount++;
      else if (classification.includes('نقدي') || classification.includes('critical')) criticalCount++;
    });

    return {
      title: currentSession?.title || 'جميع الأقسام المشخصة',
      level: currentSession?.level || 'متعدد',
      stream: currentSession?.stream || 'متعدد',
      totalStudents: total,
      avgMetrics: {
        cognitiveFear: Math.round(fearSum / total),
        cognitiveCuriosity: Math.round(curiositySum / total),
        shallowThinking: Math.round(shallowSum / total),
        criticalThinking: Math.round(criticalSum / total)
      },
      distribution: {
        cognitiveFear: fearCount,
        cognitiveCuriosity: curiosityCount,
        shallowThinking: shallowCount,
        criticalThinking: criticalCount
      }
    };
  };

  const sessionInfo = getSessionInfo();

  // Load welcome message when chat opens or changes session
  useEffect(() => {
    if (messages.length === 0 && sessionInfo) {
      setMessages([
        {
          id: 'welcome',
          sender: 'assistant',
          text: `مرحباً بك يا ذ. الموقر في المساعد البيداغوجي الذكي! 🌸\n\nلقد قمت بتحليل نتائج التشخيص لقسمك **"${sessionInfo.title}"** ذي المستوى **"${sessionInfo.level} - ${sessionInfo.stream}"** (${sessionInfo.totalStudents} تلميذ(ة)).\n\nمن خلال قراءتي الأولية، يمتلك قسمك مؤشر **تفكير نقدي جماعي يبلغ ${sessionInfo.avgMetrics.criticalThinking}%** ومؤشر **خوف معرفي جماعي يبلغ ${sessionInfo.avgMetrics.cognitiveFear}%**.\n\nكيف يمكنني مساعدتك اليوم في تكييف درس الفلسفة، أو تفكيك التمثلات، أو التخطيط لأنشطة معالجة بيداغوجية مخصصة؟`,
          timestamp: new Date()
        }
      ]);
    }
  }, [selectedSessionId]);

  // Scroll to bottom on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const activeMessages = [...messages, userMsg].map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const res = await fetch('/api/ai/teacher-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: activeMessages,
          sessionInfo: sessionInfo
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشلت معالجة الطلب الذكي للأسف.');
      }

      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: 'assistant',
          text: data.response,
          timestamp: new Date()
        }
      ]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setErrorMsg(err.message || 'فشل الاتصال بمحرك الذكاء الاصطناعي. يرجى التحقق من إعدادات المفاتيح.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'assistant',
        text: `أهلاً بك مجدداً. تم إعادة تهيئة المحادثة بنجاح مع بيانات القسم الحالي **"${sessionInfo.title}"**.\n\nاطرح أي سؤال بيداغوجي لمساعدتك في صياغة أنشطة ديدكتيكية، أو معالجة عوائق التمثلات الفكرية لدى متعلميك.`,
        timestamp: new Date()
      }
    ]);
    setErrorMsg(null);
  };

  // Predefined pedagogical prompt suggestions based on class diagnostics
  const systemSuggestions = [
    {
      label: '💡 خطة لعلاج الخوف المعرفي',
      prompt: 'اقترح علي خطة بيداغوجية عملية مصغرة لعلاج ظاهرة الخوف المعرفي من الفلسفة وصعوبة الامتحانات لدى بعض متعلمي قسمي.'
    },
    {
      label: '🧩 وضعية مشكلة للتفكير السطحي',
      prompt: 'بالنظر لمعطيات قسمي، صغ لي وضعية مشكّلة ممتعة ومحفزة من الواقع اليومي تساعد التلاميذ الذين يملكون تفكيراً سطحياً على إدراك أهمية التفكير الفلسفي المستقل.'
    },
    {
      label: '🚀 تعزيز مهارات التفلسف النقدي',
      prompt: 'كيف يمكنني استثمار طاقة التلاميذ المتميزين بالتفكير النقدي في قسمي لقيادة تلامذة الخوف المعرفي دون التسبب في احتقان أو إحباط؟'
    },
    {
      label: '📝 فكرة بطاقة بيداغوجية تدريبية',
      prompt: 'اعطني بطاقة ديدكتيكية تدريبية مصغرة لتعليم التلاميذ كيفية صياغة حجة متماسكة وتجنب السجال الحواري العقيم.'
    }
  ];

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        id="teacher-ai-chat-btn"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-20 md:bottom-6 left-4 sm:left-6 z-[9999] p-3 min-h-[48px] min-w-[48px] bg-white text-slate-800 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center gap-2 group border border-slate-200/80 ${
          isOpen ? 'ring-4 ring-indigo-300/40' : 'animate-bounce'
        }`}
        style={{ animationDuration: '3s' }}
        title="اسأل المساعد البيداغوجي الذكي"
      >
        <div className="relative flex items-center justify-center">
          {isOpen ? (
            <X className="w-6 h-6 text-slate-600 transition duration-300" />
          ) : (
            <>
              <PhiloScanLogo size={26} theme="light" className="transition-transform duration-300 group-hover:scale-110" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </>
          )}
        </div>
        {!isOpen && (
          <span className="hidden sm:inline-block max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap text-xs font-black tracking-tight font-sans pl-1 text-slate-800" dir="rtl">
            المساعد البيداغوجي الذكي ✨
          </span>
        )}
      </button>

      {/* Expanded Chat Window */}
      {isOpen && (
        <div
          id="teacher-ai-chat-window"
          className="fixed bottom-[8.5rem] md:bottom-24 left-3 right-3 sm:right-auto sm:left-6 z-[9999] sm:w-[440px] h-[min(70vh,560px)] sm:h-[600px] bg-slate-900 border border-slate-700/80 rounded-2xl flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100 animate-in fade-in slide-in-from-bottom-5 duration-300"
          dir="rtl"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-4 border-b border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-yellow-400">
                <GraduationCap className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100 flex items-center gap-1.5">
                  فِيلوسكان التربوي
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono">
                    AI ASSISTANT
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                  المساعد الديدكتيكي والتربوي الفوري
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                title="إعادة تهيئة المحادثة"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                title="إغلاق"
              >
                <MinusCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Current Connected Session Banner */}
          <div className="bg-slate-950/70 border-b border-indigo-950/50 px-4 py-2 text-xs flex items-center justify-between text-indigo-200">
            <span className="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <strong className="text-slate-300 select-none">متصل بالقسم الحالي:</strong>
              <span className="text-slate-400 font-bold overflow-hidden text-ellipsis whitespace-nowrap">{sessionInfo.title}</span>
            </span>
            <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-amber-400 text-[10px] shrink-0">
              {sessionInfo.totalStudents} تشخيصات
            </span>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/40 custom-scrollbar">
            {messages.map((m) => {
              const isAi = m.sender === 'assistant';
              return (
                <div
                  key={m.id}
                  className={`flex gap-2.5 ${isAi ? 'justify-start' : 'justify-end'}`}
                >
                  {isAi && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-900/30 border border-indigo-700/40 flex items-center justify-center text-indigo-400 shrink-0 select-none">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed transition duration-300 font-sans ${
                      isAi
                        ? 'bg-slate-950/80 text-slate-200 border border-slate-800/80 rounded-tr-none shadow-sm'
                        : 'bg-indigo-600 text-white rounded-tl-none shadow-md'
                    }`}
                  >
                    {/* Preserve line breaks for elegant formatting */}
                    <p className="whitespace-pre-line">
                      {m.text}
                    </p>
                    <span className="block text-[8px] text-slate-500 text-left mt-1.5 select-none font-mono">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-8 h-8 rounded-lg bg-indigo-900/30 border border-indigo-700/40 flex items-center justify-center text-indigo-400 shrink-0 select-none animate-spin">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl rounded-tr-none p-3.5 flex items-center gap-1.5 shadow-sm text-xs text-indigo-300">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                  <span className="mr-1">الخبير التربوي يقوم بتحليل وتنسيق الرد...</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-950/40 border border-red-900/40 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">عثرة تقنية بالخدمة:</p>
                  <p>{errorMsg}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Prompt suggestions shown if no interactive chat messages are heavy yet */}
          {messages.length < 3 && (
            <div className="px-4 pb-3 pt-1 border-t border-slate-800/50 bg-slate-950/20">
              <span className="text-[10px] text-slate-500 font-bold block mb-2 select-none">
                💡 تساؤلات بيداغوجية مقترحة بناءً على معطيات القسم:
              </span>
              <div className="flex flex-col gap-1.5">
                {systemSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(s.prompt)}
                    disabled={isLoading}
                    className="text-right w-full py-1.5 px-3 bg-slate-950/50 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100 rounded-lg text-[11px] font-bold text-ellipsis overflow-hidden whitespace-nowrap transition-all duration-150 cursor-pointer disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form input messaging */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="p-3 border-t border-slate-800 bg-slate-950/50 flex gap-2 items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب تساؤلك البيداغوجي هنا..."
              maxLength={1000}
              disabled={isLoading}
              className="flex-1 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 min-h-[44px] text-base sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 transition"
              dir="rtl"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2.5 min-h-[44px] min-w-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-40 disabled:hover:bg-indigo-600 transition flex items-center justify-center shrink-0"
              title="إرسال"
            >
              <Send className="w-4 h-4 transform rotate-180" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
