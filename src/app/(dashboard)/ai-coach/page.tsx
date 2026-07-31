'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Lightbulb, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PlanGate } from '@/components/PlanGate';

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: React.ReactNode;
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
      requiredPlan="starter"
      description="Get tailored, transparent guidance on hooks, titles, retention, and scripts. Included on Starter, Pro, and Agency plans."
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

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

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
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not reach the coach (${res.status}).`);
      const reply: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'I couldn\'t find a useful angle on that — try rephrasing the question.',
      };
      setMessages((prev) => [...prev, reply]);
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

  return (
    <div className="animate-enter">
      <PageHeader
        title="AI Coach"
        subtitle="Ask anything about your content — get tailored, transparent guidance."
        showUtility
      />

      {/* Suggested prompt chips */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-600">
          <Lightbulb className="w-3.5 h-3.5" />
          Suggested prompts
        </span>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setInput(prompt)}
            className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-700 hover:border-brand-600 hover:text-brand-700 hover:bg-brand-50 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat thread */}
      <Card padded={false} className="flex flex-col">
        <div className="flex-1 min-h-[500px] max-h-[620px] overflow-y-auto p-5 sm:p-6 space-y-5">
          {messages.length === 0 && !sending && (
            <div className="h-full min-h-[440px] flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">
                Ask about your content
              </h3>
              <p className="text-[13px] text-ink-600 mt-1.5 max-w-sm leading-relaxed">
                Hooks, titles, retention, scripts — anything pre-publish. Pick a suggested prompt
                above or type your own question.
              </p>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === 'user' ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-ink-900 text-white px-4 py-3 text-[14px] leading-relaxed">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex justify-start gap-3">
                <div className="w-8 h-8 shrink-0 rounded-full bg-brand-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                </div>
                <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-ink-50 text-ink-700 px-4 py-3 text-[14px] leading-relaxed">
                  {msg.content}
                </div>
              </div>
            )
          )}

          {sending && (
            <div className="flex justify-start gap-3">
              <div className="w-8 h-8 shrink-0 rounded-full bg-brand-100 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-brand-600" />
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-ink-50 text-ink-700 px-4 py-3 text-[14px] leading-relaxed inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                Thinking…
              </div>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Input row */}
        <div className="border-t border-ink-100 p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your hook, title, retention, or script…"
              aria-label="Message the AI Coach"
              className="w-full bg-white border border-ink-200 rounded-xl h-11 px-3.5 text-[14px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
            />
            <Button
              size="lg"
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
  );
}
