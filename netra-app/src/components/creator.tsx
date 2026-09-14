import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Copy, Sparkles, RefreshCw, BarChart3, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import Mascot from './mascot';

interface Survey {
  id: string;
  title: string;
  topic: string;
  description: string;
  goals: string[];
  persona: string;
  responseCount: number;
}

interface Session {
  id: string;
  surveyId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  extractedPoints: Record<string, string>;
  completed: boolean;
  createdAt: string;
}

export default function CreatorDashboard() {
  const [activeTab, setActiveTab] = useState<'create' | 'analytics'>('create');
  
  // Create state
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSurvey, setGeneratedSurvey] = useState<Survey | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analytics state
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Load surveys on mount
  useEffect(() => {
    fetchSurveys();
  }, []);

  // Fetch sessions when selected survey changes
  useEffect(() => {
    if (selectedSurveyId) {
      fetchSessions(selectedSurveyId);
    }
  }, [selectedSurveyId]);

  const fetchSurveys = async () => {
    try {
      const res = await fetch('/api/survey/list');
      const data = await res.json();
      if (data.surveys) {
        setSurveys(data.surveys);
        if (data.surveys.length > 0 && !selectedSurveyId) {
          setSelectedSurveyId(data.surveys[0].id);
        }
      }
    } catch (e) {
      console.error("Error loading surveys:", e);
    }
  };

  const fetchSessions = async (surveyId: string) => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/survey/list?surveyId=${surveyId}`);
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.error("Error loading sessions:", e);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !description.trim() || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/survey/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, description }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setGeneratedSurvey(data);
        setTopic('');
        setDescription('');
        fetchSurveys(); // Refresh list
      } else {
        setError(data.error || "Failed to generate survey blueprint.");
      }
    } catch (err: any) {
      console.error("Generation failed:", err);
      setError("Connection failure. Please verify your Vercel deployment logs.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (id: string) => {
    const link = `${window.location.origin}/?surveyId=${id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedSurvey = surveys.find(s => s.id === selectedSurveyId);

  // Compute coverage data for charts
  const getGoalStats = () => {
    if (!selectedSurvey || sessions.length === 0) return [];
    
    return selectedSurvey.goals.map((goal) => {
      let answeredCount = 0;
      sessions.forEach(session => {
        const point = session.extractedPoints[goal];
        if (point && !point.toLowerCase().includes("not discussed")) {
          answeredCount++;
        }
      });
      const percentage = sessions.length > 0 ? Math.round((answeredCount / sessions.length) * 100) : 0;
      return {
        goal,
        answeredCount,
        percentage,
      };
    });
  };

  const goalStats = getGoalStats();

  return (
    <div className="max-w-5xl mx-auto w-full p-4 md:p-8">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">
            Creator Studio
          </h1>
          <p className="text-sm text-on_surface_variant mt-1">Design intent-aware adaptive surveys & analyze insights</p>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-2 p-1 glass-panel self-start">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
              activeTab === 'create'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-on_surface_variant hover:text-on_surface'
            }`}
          >
            <Plus className="w-4 h-4 inline-block mr-2" />
            Design Survey
          </button>
          <button
            onClick={() => {
              setActiveTab('analytics');
              fetchSurveys();
            }}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-all ${
              activeTab === 'analytics'
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-on_surface_variant hover:text-on_surface'
            }`}
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Analytics Portal
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === 'create' ? (
          <motion.div
            key="create-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid md:grid-cols-2 gap-8"
          >
            {/* Design Form */}
            <div className="glass-panel p-6 flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-tertiary" />
                  Define Research Goal
                </h2>
                <p className="text-sm text-on_surface_variant mt-1">
                  Describe what you want to learn. Gemini will design custom information goals and an interviewer persona.
                </p>
              </div>

              <form onSubmit={handleCreateSurvey} className="flex flex-col gap-4">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl leading-relaxed"
                    >
                      ⚠️ {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-on_surface_variant">Research Topic</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Taste Satisfaction of Pizza Delivery App"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={isGenerating}
                    className="glass-input p-3 text-on_surface placeholder:text-on_surface_variant/40"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-on_surface_variant">Description & Background</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="e.g. We launched a pizza delivery app last month. We want to interview users who ordered thin crust to know if they liked the crunchiness, what they felt about delivery speed, and app ease of use."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isGenerating}
                    className="glass-input p-3 text-on_surface placeholder:text-on_surface_variant/40 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGenerating || !topic.trim() || !description.trim()}
                  className="mt-2 w-full py-4 bg-primary/20 text-primary border border-primary/30 rounded-xl hover:bg-primary/30 transition-all font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Designing Survey...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Survey Blueprint
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Generated Blueprint / Instructions */}
            <div className="flex flex-col justify-between gap-6">
              <AnimatePresence mode="wait">
                {generatedSurvey ? (
                  <motion.div
                    key="blueprint-result"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-panel-elevated p-6 border-primary/30 bg-primary/5 flex flex-col gap-6 scanning-card relative overflow-hidden"
                  >
                    <div>
                      <div className="text-xs font-bold text-tertiary tracking-wider uppercase flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 animate-pulse text-tertiary" />
                        Active Blueprint Generated
                      </div>
                      <h2 className="text-2xl font-bold text-on_surface mt-1">{generatedSurvey.title}</h2>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="text-sm font-semibold text-primary">Target Information Goals</div>
                      <ul className="flex flex-col gap-2">
                        {generatedSurvey.goals.map((goal, idx) => (
                          <li key={idx} className="text-sm text-on_surface_variant flex items-start gap-2">
                            <CheckCircle2 className="w-4.5 h-4.5 text-primary mt-0.5 shrink-0" />
                            <span>{goal}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-tertiary/10 border border-tertiary/20 rounded-xl">
                      <div className="text-xs font-semibold text-tertiary">AI Interviewer Persona</div>
                      <div className="text-sm text-on_surface_variant mt-1 italic">"{generatedSurvey.persona}"</div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border-subtle flex flex-col gap-3">
                      <div className="text-xs text-on_surface_variant">Respondent Sharing Link:</div>
                      <div className="flex items-center gap-2 p-2 bg-background border border-border-subtle rounded-lg">
                        <span className="text-xs text-primary truncate flex-1 select-all">
                          {window.location.origin}/?surveyId={generatedSurvey.id}
                        </span>
                        <button
                          onClick={() => copyToClipboard(generatedSurvey.id)}
                          className="p-2 rounded hover:bg-surface-bright text-on_surface_variant hover:text-primary transition-all shrink-0"
                          title="Copy sharing link"
                        >
                          {copied ? <span className="text-xs text-primary font-bold">Copied!</span> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <a
                        href={`/?surveyId=${generatedSurvey.id}`}
                        target="_blank"
                        className="mt-2 text-center text-sm font-semibold text-primary flex items-center justify-center gap-2 hover:underline"
                      >
                        Launch Preview Survey
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="blueprint-placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="glass-panel p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px] text-on_surface_variant gap-4 group"
                  >
                    <Mascot />
                    <div>
                      <h3 className="text-lg font-bold text-on_surface font-display">Hello! I am GlaBot, your AI Assistant</h3>
                      <p className="text-sm mt-1 max-w-[320px] mx-auto leading-relaxed">
                        Input your research topic and description on the left. I will automatically design custom information goals and launch our adaptive conversational interviewer!
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="analytics-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-8"
          >
            {/* Survey Selector */}
            <div className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-on_surface_variant">Select Active Survey:</span>
                <select
                  value={selectedSurveyId}
                  onChange={(e) => setSelectedSurveyId(e.target.value)}
                  className="p-2 bg-background border border-border-subtle rounded-lg text-on_surface font-semibold text-sm outline-none cursor-pointer focus:border-primary"
                >
                  {surveys.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.responseCount} responses)
                    </option>
                  ))}
                  {surveys.length === 0 && <option>No surveys created yet</option>}
                </select>
              </div>

              {selectedSurvey && (
                <button
                  onClick={() => copyToClipboard(selectedSurvey.id)}
                  className="px-4 py-2 border border-border-subtle rounded-lg hover:border-primary text-xs font-semibold text-on_surface_variant hover:text-primary transition-all flex items-center gap-2 self-start"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "Link Copied!" : "Copy Survey Link"}
                </button>
              )}
            </div>

            {selectedSurvey ? (
              <div className="grid md:grid-cols-3 gap-8">
                {/* Stats & Extracted Insights */}
                <div className="md:col-span-2 flex flex-col gap-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-panel p-6 flex flex-col justify-center">
                      <div className="text-xs font-semibold text-on_surface_variant uppercase">Total Interviews</div>
                      <div className="text-4xl font-extrabold text-primary mt-2 drop-shadow-[0_0_15px_rgba(125,211,252,0.3)]">
                        {sessions.length}
                      </div>
                    </div>
                    <div className="glass-panel p-6 flex flex-col justify-center">
                      <div className="text-xs font-semibold text-on_surface_variant uppercase">Completion Rate</div>
                      <div className="text-4xl font-extrabold text-tertiary mt-2 drop-shadow-[0_0_15px_rgba(200,160,240,0.3)]">
                        {sessions.length > 0 ? "100%" : "0%"}
                      </div>
                    </div>
                  </div>

                  {/* Fact Extraction Summary */}
                  <div className="glass-panel p-6 flex flex-col gap-4">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <FileText className="w-5 h-5 text-tertiary" />
                      Dynamic AI Respondent Insights
                    </h3>
                    <p className="text-xs text-on_surface_variant">
                      Fact-extraction showing key qualitative findings compiled dynamically per goal.
                    </p>

                    {isLoadingAnalytics ? (
                      <div className="flex items-center justify-center p-12">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="text-center p-12 text-sm text-on_surface_variant">
                        No responses received yet. Share the survey link to gather feedback!
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 mt-2 max-h-[400px] overflow-y-auto pr-2">
                        {selectedSurvey.goals.map((goal, idx) => {
                          const answers = sessions
                            .map(s => s.extractedPoints[goal])
                            .filter(a => a && !a.toLowerCase().includes("not discussed"));

                          return (
                            <div key={idx} className="p-4 bg-background border border-border-subtle rounded-xl flex flex-col gap-2">
                              <div className="text-xs font-bold text-primary">{goal}</div>
                              <ul className="flex flex-col gap-2 pl-2 border-l border-tertiary/20">
                                {answers.length > 0 ? (
                                  answers.map((answer, aidx) => (
                                    <li key={aidx} className="text-sm text-on_surface_variant leading-relaxed">
                                      • "{answer}"
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-xs italic text-on_surface_variant/50">Goal not yet covered in completed interviews.</li>
                                )}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* GRAPHICAL CHARTS COLUMN */}
                <div className="glass-panel p-6 flex flex-col gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-tertiary" />
                      Graphical Analytics
                    </h3>
                    <p className="text-xs text-on_surface_variant mt-1">Goal coverage rate across completed interviews.</p>
                  </div>

                  {isLoadingAnalytics ? (
                    <div className="flex items-center justify-center p-12 flex-1">
                      <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center p-12 text-xs text-on_surface_variant flex-1 flex items-center justify-center">
                      Waiting for survey submissions to render charts...
                    </div>
                  ) : (
                    <div className="flex flex-col gap-8 flex-1 justify-center">
                      {/* DONUT CHART */}
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                          {/* Background Circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="transparent"
                            stroke="var(--color-border-subtle)"
                            strokeWidth="10"
                          />
                          {/* Progress Circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="transparent"
                            stroke="url(#neon-gradient)"
                            strokeWidth="10"
                            strokeDasharray="251.2"
                            strokeDashoffset="0" // 100% full since we show 100% completion in sessions
                            className="transition-all duration-1000 ease-out"
                          />
                          <defs>
                            <linearGradient id="neon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--color-primary)" />
                              <stop offset="100%" stopColor="var(--color-tertiary)" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="text-center mt-2">
                          <div className="text-sm font-semibold text-on_surface">Interviews Completed</div>
                          <div className="text-xs text-on_surface_variant">100% Session Completion Rate</div>
                        </div>
                      </div>

                      {/* SVG DYNAMIC BAR CHART */}
                      <div className="flex flex-col gap-4 mt-2">
                        <div className="text-xs font-semibold text-on_surface_variant tracking-wider uppercase">
                          Goal Feedback Coverage (%):
                        </div>
                        <div className="flex flex-col gap-4">
                          {goalStats.map((stat, idx) => (
                            <div key={idx} className="flex flex-col gap-1.5">
                              <div className="flex justify-between items-center text-xs font-semibold">
                                <span className="text-on_surface_variant truncate max-w-[80%]" title={stat.goal}>
                                  {stat.goal}
                                </span>
                                <span className="text-primary">{stat.percentage}%</span>
                              </div>
                              {/* Horizontal SVG bar with anim on load */}
                              <svg className="w-full h-3 rounded-full bg-border-subtle" viewBox="0 0 100 12" preserveAspectRatio="none">
                                <rect
                                  x="0"
                                  y="0"
                                  width={stat.percentage}
                                  height="12"
                                  rx="6"
                                  fill="url(#bar-gradient)"
                                  className="transition-all duration-1000 ease-out"
                                />
                                <defs>
                                  <linearGradient id="bar-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="var(--color-primary)" />
                                    <stop offset="100%" stopColor="var(--color-tertiary)" />
                                  </linearGradient>
                                </defs>
                              </svg>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="glass-panel p-12 text-center text-sm text-on_surface_variant">
                Create a survey under the "Design Survey" tab to get started!
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
