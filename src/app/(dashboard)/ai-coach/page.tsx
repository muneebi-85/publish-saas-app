'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Lightbulb, Loader2, Plus, Trash2, FileText, MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PlanGate } from '@/components/PlanGate';
import { clsx } from 'clsx';

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: React.ReactNode;
}

interface ThreadSummary {
  id: string;
  title: string;
  reportId: string | null;
  updatedAt: string;
}

const SUGGESTED_PROMPTS = [
  'Analyze my first 10s drop-off',
  'Rewrite titles for curiosity gap',
  'Diagnose mid-funnel retention',
  'Fix robotic script pacing',
];

export default function AICoachPage() {
  return (
    <PlanGate
      feature="AI Coach"
      requiredPlan="pro"
      description="Get tailored, transparent guidance on hooks, titles, retention, and scripts. Included on every paid plan."
    >
      <CoachChat />
    </PlanGate>
  );
}

function CoachChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Persistence: active thread + the list + grounding report from ?report=
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);
  const reportIdRef = useRef<string | null>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    // Grounding: /ai-coach?report=<id> from the report page ("Ask the AI Coach
    // about this report") — the server builds its context from that report.
    try {
      const p = new URLSearchParams(window.location.search);
      const r = p.get('report');
      if (r && /^[a-z0-9_-]{8,64}$/i.test(r)) {
        reportIdRef.current = r;
        setReportId(r);
      }
    } catch {
      /* cosmetic */
    }

    void fetch('/api/coach')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.threads) setThreads(data.threads as ThreadSummary[]);
      })
      .catch(() => undefined)
      .finally(() => setLoadingThreads(false));
  }, []);

  const openThread = useCallback(async (threadId: string) => {
    setSending(true);
    try {
      const res = await fetch(`/api/coach/${threadId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const loaded: Message[] = Array.isArray(data.messages)
        ? data.messages.map((m: { role?: string; content?: unknown }, i: number) => ({
            id: `${threadId}-${i}`,
            role: m.role === 'user' ? 'user' : 'assistant',
            content: typeof m.content === 'string' ? m.content : '',
          }))
        : [];
      setMessages(loaded);
      setActiveThread(threadId);
      if (data.reportId) {
        reportIdRef.current = data.reportId;
        setReportId(data.reportId);
      }
    } catch {
      // Keep the current chat if the load fails; the sidebar still works.
    } finally {
      setSending(false);
    }
  }, []);

  const startNew = useCallback(() => {
    setMessages([]);
    setActiveThread(null);
    // Keep grounding if this page was opened from a report; clear otherwise.
    const params = new URLSearchParams(window.location.search);
    const r = params.get('report');
    if (r && /^[a-z0-9_-]{8,64}$/i.test(r)) {
      reportIdRef.current = r;
      setReportId(r);
    } else {
      reportIdRef.current = null;
      setReportId(null);
    }
  }, []);

  const deleteThread = useCallback(async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try {
      const res = await fetch(`/api/coach/${threadId}`, { method: 'DELETE' });
      if (!res.ok) return; // keep the row listed — the server still has it
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThread === threadId) startNew();
    } catch {
      /* network error — nothing to remove locally either */
    }
  }, [activeThread, startNew]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Trim the thread to the last few exchanges for context — the server caps
    // it too, but there is no point sending an unbounded payload.
    const history = messages
      .filter((m) => typeof m.content === 'string')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content as string }));

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          threadId: activeThread ?? undefined,
          reportId: reportIdRef.current ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not reach the coach (${res.status}).`);
      const reply: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'I couldn\'t find a useful angle on that — try rephrasing the question.',
      };
      setMessages((prev) => [...prev, reply]);

      // Keep the thread pointer in sync (first message creates the row) and
      // refresh the sidebar so the new title shows up.
      if (data.threadId && data.threadId !== activeThread) {
        setActiveThread(data.threadId);
      }
      void fetch('/api/coach')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.threads) setThreads(d.threads as ThreadSummary[]);
        })
        .catch(() => undefined);
    } catch {
      const reply: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Something went wrong reaching the coach. Please try again in a moment.',
      };
      setMessages((prev) => [...prev, reply]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeReport = reportId;
  const grounded = Boolean(activeReport);

  return (
    <div className="animate-enter">
      <PageHeader
        title="AI Coach"
        subtitle="Ask anything about your content — get tailored, transparent guidance."
        showUtility
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Thread sidebar */}
        <Card padded={false} className="lg:sticky lg:top-6">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-200">
            <span className="text-[12px] font-semibold text-ink-900">Conversations</span>
            <button
              type="button"
              onClick={startNew}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 text-brand-700 px-2 py-1 text-[11px] font-semibold hover:bg-brand-100 transition-colors"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
          <div className="max-h-[420px] lg:max-h-[560px] overflow-y-auto">
            {loadingThreads ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-ink-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading conversations…
              </div>
            ) : threads.length === 0 ? (
              <p className="px-4 py-6 text-[12px] text-ink-500 leading-relaxed">
                Conversations you start are saved here so you can pick up where you left off.
              </p>
            ) : (
              threads.map((t) => (
                <div
                  key={t.id}
                  className={clsx(
                    'group flex items-start gap-2.5 pl-4 pr-2 py-3 transition-colors border-b border-ink-200 last:border-b-0',
                    activeThread === t.id ? 'bg-ink-100' : 'hover:bg-ink-50',
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-ink-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => openThread(t.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className={clsx('block text-[12px] truncate', activeThread === t.id ? 'text-ink-900 font-semibold' : 'text-ink-700')}>
                      {t.title}
                    </span>
                    <span className="block text-[11px] text-ink-500 mt-0.5">
                      {t.reportId ? 'Grounded in a report' : 'General'} ·{' '}
                      {new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    onClick={(e) => deleteThread(t.id, e)}
                    className="w-6 h-6 -mt-0.5 rounded-md flex items-center justify-center text-ink-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-ink-200 hover:text-crimson-700 transition-opacity shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Chat */}
        <Card padded={false} className="flex flex-col">
          {grounded && (
            <div className="flex items-center gap-2 border-b border-brand-200 bg-brand-50 px-5 py-2.5 text-[12px] text-brand-700">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              This conversation is grounded in your report — the coach references its actual scores and fixes.
            </div>
          )}

          <div className="flex-1 min-h-[500px] max-h-[620px] overflow-y-auto p-5 sm:p-6 space-y-5">
            {messages.length === 0 && !sending && (
              <div className="h-full min-h-[440px] flex flex-col items-center justify-center text-center">
                <div className="w-11 h-11 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center mb-4">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
                  {grounded ? 'Ask about this report' : 'Ask about your content'}
                </h3>
                <p className="text-[13px] leading-relaxed text-ink-600 mt-2 max-w-sm">
                  {grounded
                    ? 'Your report\'s scores and top fixes are loaded — ask why a layer scored the way it did, or what to fix first.'
                    : 'Hooks, titles, retention, scripts — anything pre-publish. Pick a suggested prompt below, or type your own question.'}
                </p>
              </div>
            )}

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-xl rounded-br-md bg-ink-900 text-surface-canvas px-4 py-3 text-[14px] leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex justify-start gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-brand-50 ring-1 ring-inset ring-brand-100 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-brand-600" />
                  </div>
                  <div className="max-w-[80%] rounded-xl rounded-tl-md bg-ink-100 text-ink-700 px-4 py-3 text-[14px] leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              )
            )}

            {sending && (
              <div className="flex justify-start gap-3">
                <div className="w-8 h-8 shrink-0 rounded-full bg-brand-50 ring-1 ring-inset ring-brand-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                </div>
                <div className="max-w-[80%] rounded-xl rounded-tl-md bg-ink-100 text-ink-700 px-4 py-3 text-[14px] leading-relaxed inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                  Thinking…
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Input row */}
          <div className="border-t border-ink-200 p-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your hook, title, retention, or script…"
                aria-label="Message the AI Coach"
                className="w-full bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors"
              />
              <Button
                size="md"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                isLoading={sending}
                leftIcon={<Send className="w-4 h-4" />}
                aria-label="Send message"
              >
                Send
              </Button>
            </div>
            <p className="text-[12px] text-ink-500 mt-2.5">
              Guidance is based on best practices — it doesn&apos;t guarantee monetization or views.
            </p>
          </div>
        </Card>
      </div>

      {/* Suggested prompt chips */}
      <div className="flex flex-wrap items-center gap-1.5 mt-6">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
          <Lightbulb className="w-3.5 h-3.5" />
          Suggested prompts
        </span>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setInput(prompt)}
            className="h-8 rounded-lg border border-ink-200 bg-surface-panel px-2.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
