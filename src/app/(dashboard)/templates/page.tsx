'use client';

import { useMemo, useState } from 'react';
import {
  Type, Zap, Image as ImageIcon, AlignLeft, ListVideo, Search,
  Copy, Check, LayoutTemplate,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/dashboard/PageHeader';

type Category = 'Titles' | 'Hooks' | 'Thumbnails' | 'Descriptions' | 'Video structure';

interface Template {
  name: string;
  category: Category;
  example: string;
  why: string;
}

const CATEGORY_META: Record<Category, { icon: typeof Type; badge: 'success' | 'warning' | 'danger' | 'ink' | 'default' }> = {
  Titles:            { icon: Type,        badge: 'success' },
  Hooks:             { icon: Zap,         badge: 'warning' },
  Thumbnails:        { icon: ImageIcon,   badge: 'ink' },
  Descriptions:      { icon: AlignLeft,   badge: 'default' },
  'Video structure': { icon: ListVideo,   badge: 'success' },
};

const TABS: ('All' | Category)[] = ['All', 'Titles', 'Hooks', 'Thumbnails', 'Descriptions', 'Video structure'];

const TEMPLATES: Template[] = [
  {
    name: 'Result + timeframe',
    category: 'Titles',
    example: 'How I [achieved result] in [timeframe] (without [common pain])',
    why: 'Pairs a concrete outcome with a time box and removes the usual objection.',
  },
  {
    name: 'Curiosity gap',
    category: 'Titles',
    example: 'The [topic] mistake that’s costing you [specific loss]',
    why: 'Names a hidden cost the viewer suspects they might be making.',
  },
  {
    name: 'Number + promise',
    category: 'Titles',
    example: '[N] [tools/habits/tricks] that actually [deliver benefit]',
    why: 'Lists scan well and the word “actually” signals filtered, no-fluff picks.',
  },
  {
    name: 'Contrarian take',
    category: 'Titles',
    example: 'Stop doing [common advice] — do this instead',
    why: 'A confident reversal of accepted wisdom earns the click and the debate.',
  },
  {
    name: 'Cold-open stakes',
    category: 'Hooks',
    example: '“In the next [duration] I’ll show you exactly how to [outcome] — even if [objection].”',
    why: 'Sets a clear payoff and dissolves the top objection in the first 5 seconds.',
  },
  {
    name: 'Pattern interrupt',
    category: 'Hooks',
    example: '“Most [audience] get this completely backwards. Here’s the proof…”',
    why: 'Challenges the viewer’s assumption so they stay to see if they’re wrong.',
  },
  {
    name: 'Before / after tease',
    category: 'Hooks',
    example: '“This went from [bad state] to [great state] in [timeframe] — let me rewind.”',
    why: 'Shows the transformation first, then earns the how with a retention loop.',
  },
  {
    name: 'Bold face + 3 words',
    category: 'Thumbnails',
    example: 'Close-up expression + 3-word overlay: “[EMOTION] [NUMBER] [NOUN]”',
    why: 'A readable face and ≤ 3 large words stay legible at feed size.',
  },
  {
    name: 'Object in hand',
    category: 'Thumbnails',
    example: 'Hold the [subject] toward camera, single high-contrast background color',
    why: 'A clear focal object plus color separation reads instantly on mobile.',
  },
  {
    name: 'Value-stacked description',
    category: 'Descriptions',
    example: 'Line 1 hook → what you’ll learn → timestamps → resources → CTA',
    why: 'Front-loads the payoff, then structures the rest for search and skimming.',
  },
  {
    name: 'Timestamp chapters',
    category: 'Descriptions',
    example: '00:00 [Hook] · 00:45 [Setup] · 02:10 [Payoff] · […]',
    why: 'Chapters improve watch-time distribution and surface key moments in search.',
  },
  {
    name: 'Problem → payoff arc',
    category: 'Video structure',
    example: 'Hook → stakes → attempt → obstacle → turn → payoff → CTA',
    why: 'A tension-and-release arc keeps retention climbing toward the reveal.',
  },
  {
    name: 'Loop & callback',
    category: 'Video structure',
    example: 'Open a question in the hook, resolve it only at the [final section]',
    why: 'An unresolved open loop pulls viewers through the middle of the video.',
  },
];

export default function TemplatesPage() {
  const [active, setActive] = useState<'All' | Category>('All');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      const matchesTab = active === 'All' || t.category === active;
      const matchesQuery =
        q === '' ||
        t.name.toLowerCase().includes(q) ||
        t.example.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [active, query]);

  return (
    <div className="animate-enter">
      <PageHeader
        title="Templates"
        subtitle="Proven formulas for titles, hooks, thumbnails, and descriptions."
        showUtility
      />

      {/* Search */}
      <div className="relative mb-5 max-w-md">
        <Search className="w-4 h-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates and formulas"
          aria-label="Search templates"
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl h-11 pl-10 pr-3.5 text-[14px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((tab) => {
          const isActive = active === tab;
          return (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={
                isActive
                  ? 'h-9 px-4 rounded-xl text-[13px] font-semibold bg-brand-600 text-[#060606] transition-colors'
                  : 'h-9 px-4 rounded-xl text-[13px] font-medium bg-white/[0.03] text-ink-600 border border-white/[0.08] hover:bg-white/[0.06] hover:text-white transition-colors'
              }
              aria-pressed={isActive}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <NoMatches onClear={() => { setQuery(''); setActive('All'); }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard key={t.name} template={t} />
          ))}
        </div>
      )}

      <p className="text-[12px] text-ink-400 mt-6 max-w-2xl">
        Templates are starting points, not guarantees. Adapt each formula to your voice and audience —
        results vary by niche, and any impact is an estimate.
      </p>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const [copied, setCopied] = useState(false);
  const meta = CATEGORY_META[template.category];
  const Icon = meta.icon;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.example);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <Card hover className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <Icon className="w-[18px] h-[18px]" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-tight text-ink-900 truncate">
            {template.name}
          </h3>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 w-8 h-8 rounded-lg border border-white/[0.06] bg-surface-panel flex items-center justify-center text-ink-500 hover:bg-white/[0.06] hover:text-ink-900 transition-colors"
          aria-label={`Copy the ${template.name} formula`}
        >
          {copied ? <Check className="w-4 h-4 text-brand-600" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-surface-canvas border border-ink-100 px-3.5 py-3">
        <p className="text-[13.5px] leading-relaxed text-ink-800">{template.example}</p>
      </div>

      <p className="text-[12.5px] text-ink-500 mt-3 leading-relaxed flex-1">{template.why}</p>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-ink-100">
        <Badge variant={meta.badge} dot>{template.category}</Badge>
        <Button variant="secondary" size="sm" onClick={handleCopy} leftIcon={copied ? <Check className="w-3.5 h-3.5 text-brand-600" /> : <Copy className="w-3.5 h-3.5" />}>
          {copied ? 'Copied' : 'Use template'}
        </Button>
      </div>
    </Card>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <Card className="text-center py-16">
      <div className="w-14 h-14 rounded-full bg-white/[0.08] flex items-center justify-center mx-auto mb-5">
        <LayoutTemplate className="w-6 h-6 text-ink-500" />
      </div>
      <h3 className="font-display text-lg font-bold tracking-tight text-ink-900">No templates match</h3>
      <p className="text-[13px] text-ink-600 mt-2 max-w-md mx-auto">
        Try a different category or clear your search to see every formula in the library.
      </p>
      <div className="mt-6">
        <Button variant="secondary" onClick={onClear}>Clear filters</Button>
      </div>
    </Card>
  );
}
