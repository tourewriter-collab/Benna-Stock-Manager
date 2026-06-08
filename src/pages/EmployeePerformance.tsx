import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Send, CheckCircle2, User, BookOpen, Clock, Users, ArrowLeft, MessageSquare, ShieldAlert } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface PerformanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_department: string;
  employee_role: string;
  month: string;
  task_score: number;
  boss_review_score: number;
  attendance_score: number;
  peer_feedback_score: number;
  skill_dev_score: number;
  overtime_score: number;
  composite_score: number;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

const RadialGauge: React.FC<{ score: number }> = ({ score }) => {
  const radius = 60;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {/* Glossy radial gradient background */}
      <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-slate-900/50 to-indigo-950/20 backdrop-blur-md border border-white/5 shadow-2xl flex items-center justify-center"></div>
      
      <svg className="w-full h-full transform -rotate-90 relative z-10">
        <circle
          cx="96"
          cy="96"
          r={radius}
          className="stroke-slate-200 dark:stroke-slate-800"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx="96"
          cy="96"
          r={radius}
          className="stroke-indigo-500 transition-all duration-1000 ease-out"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      
      <div className="absolute text-center z-20">
        <span className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight">{score}</span>
        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block uppercase mt-0.5">Score</span>
      </div>
    </div>
  );
};

// Component props to support viewing from admin/other context
interface EmployeePerformanceProps {
  overrideEmployeeId?: string;
  onBack?: () => void;
}

const EmployeePerformance: React.FC<EmployeePerformanceProps> = ({ overrideEmployeeId, onBack }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [records, setRecords] = useState<PerformanceRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [currentRecord, setCurrentRecord] = useState<PerformanceRecord | null>(null);
  const [peerFeedbackEnabled, setPeerFeedbackEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Resolve target employee ID
  const isViewingAsAdmin = user?.role === 'admin' && overrideEmployeeId;
  const targetEmployeeId = overrideEmployeeId || '';

  useEffect(() => {
    fetchPerformanceData();
    fetchSettings();
  }, [overrideEmployeeId]);

  useEffect(() => {
    if (selectedMonth && records.length > 0) {
      const rec = records.find(r => r.month === selectedMonth) || null;
      setCurrentRecord(rec);
    }
  }, [selectedMonth, records]);

  useEffect(() => {
    if (isChatOpen) {
      fetchChatHistory();
    }
  }, [isChatOpen]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  const fetchSettings = async () => {
    try {
      const settings = await fetchApi('/settings');
      setPeerFeedbackEnabled(settings?.peer_feedback_enabled === '1');
    } catch (e) {
      console.error('[Performance] Error fetching settings:', e);
    }
  };

  const fetchPerformanceData = async () => {
    setLoading(true);
    try {
      // If we are admin viewing an employee, fetch `/hr/performance/:id`
      // If employee, fetch `/hr/performance/self` which maps by email inside backend or we fetch by first resolving employee id
      let empId = targetEmployeeId;
      if (!empId) {
        // Resolve own employee profile
        const employees = await fetchApi('/hr/employees');
        const self = employees.find((e: any) => e.email === user?.email);
        if (self) {
          empId = self.id;
        }
      }

      if (empId) {
        const data = await fetchApi(`/hr/performance/${empId}`);
        setRecords(data || []);
        if (data && data.length > 0) {
          setRecords(data);
          setSelectedMonth(data[0].month);
          setCurrentRecord(data[0]);
        }
      }
    } catch (error) {
      console.error('[Performance] Error fetching evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    try {
      let empId = targetEmployeeId;
      if (!empId) {
        const employees = await fetchApi('/hr/employees');
        const self = employees.find((e: any) => e.email === user?.email);
        empId = self?.id || '';
      }
      
      const history = await fetchApi(`/agent/performance-chat/history?employeeId=${empId}`);
      setChatHistory(history || []);
    } catch (e) {
      console.error('[Performance Chat] Failed to load history:', e);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sendingChat) return;

    const userMessage = chatInput;
    setChatInput('');
    setSendingChat(true);

    // Pessimistic local update to avoid lag
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      let empId = targetEmployeeId;
      if (!empId) {
        const employees = await fetchApi('/hr/employees');
        const self = employees.find((e: any) => e.email === user?.email);
        empId = self?.id || '';
      }

      const res = await fetchApi('/agent/performance-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage,
          employeeId: empId
        })
      });

      if (res && res.history) {
        setChatHistory(res.history);
      } else if (res && res.reply) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: res.reply }]);
      }
    } catch (error) {
      console.error('[Performance Chat] Send error:', error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'I apologize, but my strategic memory sync engine failed to process the request.' }]);
    } finally {
      setSendingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-600"></div>
        <p className="text-sm font-semibold text-slate-500">Loading performance record...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition text-slate-600 dark:text-slate-300">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight">
              {isViewingAsAdmin ? `${currentRecord?.employee_name || 'Employee'}'s Performance` : t('my_performance', 'My Performance')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentRecord ? `${currentRecord.employee_role} • ${currentRecord.employee_department}` : 'No evaluation history'}
            </p>
          </div>
        </div>

        {records.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-500">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {records.map(r => (
                <option key={r.id} value={r.month}>{r.month}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm flex flex-col items-center justify-center gap-4">
          <ShieldAlert className="w-12 h-12 text-slate-400" />
          <div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No performance records compiled</h3>
            <p className="text-sm text-slate-400 mt-1">Evaluations will appear here once compiled by the administration.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main score / Gauge block */}
          <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 dark:from-slate-900 dark:to-slate-950 p-6 rounded-3xl text-white shadow-xl flex flex-col items-center justify-between border border-white/5 relative overflow-hidden min-h-[360px]">
            {/* Ambient background blur circles */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl"></div>

            <div className="text-center relative z-10 w-full">
              <span className="text-xs uppercase tracking-widest font-extrabold text-indigo-300/80">Composite Evaluation</span>
              <h3 className="text-lg font-bold text-white/90 mt-0.5">{selectedMonth}</h3>
            </div>

            <div className="my-6 relative z-10">
              <RadialGauge score={currentRecord?.composite_score || 0} />
            </div>

            <button
              onClick={() => setIsChatOpen(true)}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all duration-200 text-white rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 border border-indigo-400/20 relative z-10"
            >
              <Cpu className="w-4 h-4" />
              {t('talk_to_ai_improve', 'Talk to AI on How to Improve')}
            </button>
          </div>

          {/* Core breakdown score cards */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Task score card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Task Accomplishment</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Weight: 30%</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-800 dark:text-white">{currentRecord?.task_score}</span>
                <span className="text-xs text-slate-400 font-bold block mt-0.5">/100</span>
              </div>
            </div>

            {/* Boss review score card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-blue-600 dark:text-blue-400">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Manager Commentary</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Weight: 25%</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-800 dark:text-white">{currentRecord?.boss_review_score}</span>
                <span className="text-xs text-slate-400 font-bold block mt-0.5">/100</span>
              </div>
            </div>

            {/* Attendance score card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl text-amber-600 dark:text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Attendance & Punctuality</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Weight: 15%</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-800 dark:text-white">{currentRecord?.attendance_score}</span>
                <span className="text-xs text-slate-400 font-bold block mt-0.5">/100</span>
              </div>
            </div>

            {/* Peer feedback score card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between relative overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl text-purple-600 dark:text-purple-400">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Peer Feedback</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Weight: {peerFeedbackEnabled ? '10%' : '0% (Disabled)'}</p>
                </div>
              </div>
              <div className="text-right">
                {peerFeedbackEnabled ? (
                  <>
                    <span className="text-xl font-extrabold text-slate-800 dark:text-white">{currentRecord?.peer_feedback_score}</span>
                    <span className="text-xs text-slate-400 font-bold block mt-0.5">/100</span>
                  </>
                ) : (
                  <span className="text-xs bg-slate-100 dark:bg-slate-850 px-2 py-1 rounded text-slate-500 font-extrabold uppercase">Disabled</span>
                )}
              </div>
            </div>

            {/* Skill development score card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl text-violet-600 dark:text-violet-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Skill Development</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Weight: 10%</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-800 dark:text-white">{currentRecord?.skill_dev_score}</span>
                <span className="text-xs text-slate-400 font-bold block mt-0.5">/100</span>
              </div>
            </div>

            {/* Overtime balance score card */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Overtime Balance</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Weight: 10%</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-800 dark:text-white">{currentRecord?.overtime_score}</span>
                <span className="text-xs text-slate-400 font-bold block mt-0.5">/100</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern sliding side panel or modal for AI coaching */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col justify-between relative transform transition-transform duration-300 border-l border-slate-150 dark:border-slate-800">
            {/* Chat header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-850">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center text-white">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-850 dark:text-white text-base">Coaching with IKIKÉ</h4>
                  <p className="text-[10px] font-semibold text-emerald-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Siloed Performance Agent
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Close
              </button>
            </div>

            {/* Chat body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/20">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 p-8">
                  <MessageSquare className="w-8 h-8 text-indigo-400" />
                  <div>
                    <h5 className="font-bold text-slate-700 dark:text-slate-300">Start a Coaching Conversation</h5>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">Ask IKIKÉ for recommendations on how to improve your scores based on your performance history.</p>
                  </div>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-tr-none'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-none border border-slate-150 dark:border-slate-850'
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat footer input */}
            <form onSubmit={handleSendChat} className="p-4 border-t border-slate-100 dark:border-slate-850 bg-white dark:bg-slate-900 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask how to improve specific metrics..."
                disabled={sendingChat}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={sendingChat || !chatInput.trim()}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:scale-100"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePerformance;
