'use client';

import React, { useState } from 'react';
import { Plus, X, UploadCloud, Palette, Type, ImageIcon, Volume2, Ban, Check } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export const DEFAULT_KIT = {
  colors: [
    { name: 'Brand green', hex: '#16A34A' },
    { name: 'Ink', hex: '#111111' },
    { name: 'Accent amber', hex: '#F59E0B' },
    { name: 'Soft sand', hex: '#F5F1E8' },
  ],
  headingFont: 'General Sans',
  bodyFont: 'Inter',
  tones: ['Friendly', 'Expert'],
  description:
    'We help everyday creators grow with honest, practical advice. We sound like a knowledgeable friend — warm, clear, and never hype-y.',
  banned: ['guaranteed', 'get rich quick', 'literally', 'guys', 'insane'],
};

const HEADING_FONTS = ['Inter', 'General Sans', 'Söhne', 'Poppins', 'Space Grotesk'];
const BODY_FONTS = ['Inter', 'Söhne', 'Georgia', 'System UI', 'IBM Plex Sans'];
const TONE_OPTIONS = ['Friendly', 'Expert', 'Bold', 'Playful', 'Calm'];

interface Kit {
  colors: { name: string; hex: string }[];
  headingFont: string;
  bodyFont: string;
  tones: string[];
  description: string;
  banned: string[];
}

export const BrandKitClient: React.FC<{ initialKit: Kit }> = ({ initialKit }) => {
  const [colors, setColors] = useState(initialKit.colors);
  const [headingFont, setHeadingFont] = useState(initialKit.headingFont);
  const [bodyFont, setBodyFont] = useState(initialKit.bodyFont);
  const [tones, setTones] = useState<string[]>(initialKit.tones);
  const [description, setDescription] = useState(initialKit.description);
  const [banned, setBanned] = useState<string[]>(initialKit.banned);
  const [bannedDraft, setBannedDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addColor = () => {
    setColors((prev) => [...prev, { name: 'New color', hex: '#22C55E' }]);
  };

  const updateColorHex = (index: number, hex: string) => {
    setColors((prev) => prev.map((c, i) => (i === index ? { ...c, hex } : c)));
  };

  const removeColor = (index: number) => {
    setColors((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleTone = (tone: string) => {
    setTones((prev) => (prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]));
  };

  const addBanned = (e: React.FormEvent) => {
    e.preventDefault();
    const value = bannedDraft.trim();
    if (!value || banned.includes(value.toLowerCase())) {
      setBannedDraft('');
      return;
    }
    setBanned((prev) => [...prev, value.toLowerCase()]);
    setBannedDraft('');
  };

  const removeBanned = (word: string) => {
    setBanned((prev) => prev.filter((w) => w !== word));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/me/brand-kit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandKit: { colors, headingFont, bodyFont, tones, description, banned },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not save your brand kit.');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your brand kit.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-white border border-ink-200 rounded-xl h-11 px-3.5 text-[14px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors';

  return (
    <div className="animate-enter">
      <PageHeader
        title="Brand Kit"
        subtitle="Keep your voice, colors, and identity consistent across every video."
        showUtility
        actions={
          <div className="flex items-center gap-2">
            {error && <span className="text-[12.5px] text-crimson-600">{error}</span>}
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-grass-700">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <Button variant="dark" leftIcon={saving ? undefined : <Check className="w-4 h-4" />} onClick={save} isLoading={saving}>
              Save changes
            </Button>
          </div>
        }
      />

      <div className="space-y-6 max-w-3xl">
        {/* Brand colors */}
        <Card>
          <SectionHead
            icon={<Palette className="w-4 h-4" />}
            title="Brand colors"
            desc="The palette we pull from for thumbnails, captions, and overlays."
          />
          <div className="flex flex-wrap gap-4">
            {colors.map((c, i) => (
              <div key={i} className="group relative w-28">
                <div className="relative rounded-xl border border-ink-200 overflow-hidden">
                  <div className="h-20 w-full" style={{ backgroundColor: c.hex }} />
                  <label className="absolute inset-0 cursor-pointer" aria-label={`Edit ${c.name}`}>
                    <input
                      type="color"
                      value={c.hex}
                      onChange={(e) => updateColorHex(i, e.target.value)}
                      className="sr-only"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeColor(i)}
                    aria-label={`Remove ${c.name}`}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-ink-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-ink-900"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2">
                  <div className="text-[13px] font-medium text-ink-900 truncate">{c.name}</div>
                  <div className="text-[12px] text-ink-500 tabular-nums uppercase">{c.hex}</div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addColor}
              className="w-28 h-20 rounded-xl border border-dashed border-ink-300 flex flex-col items-center justify-center gap-1 text-ink-500 hover:border-brand-600 hover:text-brand-600 transition-colors"
              aria-label="Add color"
            >
              <Plus className="w-5 h-5" />
              <span className="text-[12px] font-medium">Add color</span>
            </button>
          </div>
        </Card>

        {/* Typography */}
        <Card>
          <SectionHead
            icon={<Type className="w-4 h-4" />}
            title="Typography"
            desc="Fonts applied to generated titles and on-screen text."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="heading-font" className="text-[13px] font-medium text-ink-700 block mb-1.5">
                Heading font
              </label>
              <select
                id="heading-font"
                value={headingFont}
                onChange={(e) => setHeadingFont(e.target.value)}
                className={inputClass}
              >
                {HEADING_FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <p className="font-display text-2xl font-bold tracking-tight text-ink-900 mt-3">
                The hook comes first
              </p>
            </div>
            <div>
              <label htmlFor="body-font" className="text-[13px] font-medium text-ink-700 block mb-1.5">
                Body font
              </label>
              <select
                id="body-font"
                value={bodyFont}
                onChange={(e) => setBodyFont(e.target.value)}
                className={inputClass}
              >
                {BODY_FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <p className="text-[14px] text-ink-600 mt-3 leading-relaxed">
                Body copy stays readable across captions and descriptions.
              </p>
            </div>
          </div>
        </Card>

        {/* Logo & watermark */}
        <Card>
          <SectionHead
            icon={<ImageIcon className="w-4 h-4" />}
            title="Logo & watermark"
            desc="Used as an overlay on exported clips and thumbnails."
          />
          <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-4 items-stretch">
            <div className="w-full sm:w-40 h-40 rounded-2xl border border-ink-200 bg-surface-canvas flex flex-col items-center justify-center gap-2 text-ink-500">
              <div className="w-12 h-12 rounded-xl bg-brand-600 text-white flex items-center justify-center font-display font-bold text-xl">
                A
              </div>
              <span className="text-[12px] font-medium">Current logo</span>
            </div>
            <label className="rounded-2xl border border-dashed border-ink-300 flex flex-col items-center justify-center gap-2 p-6 text-center cursor-pointer hover:border-brand-600 transition-colors">
              <div className="w-11 h-11 rounded-full bg-ink-100 flex items-center justify-center text-ink-600">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-[14px] font-semibold text-ink-900">Upload a new logo</div>
              <div className="text-[13px] text-ink-500">PNG or SVG with transparent background, up to 5MB.</div>
              <input type="file" accept="image/png,image/svg+xml" className="sr-only" />
              <span className="text-[12px] font-semibold text-brand-600 mt-1">Browse files</span>
            </label>
          </div>
        </Card>

        {/* Tone of voice */}
        <Card>
          <SectionHead
            icon={<Volume2 className="w-4 h-4" />}
            title="Tone of voice"
            desc="Guides how the AI rewrites hooks, titles, and scripts for you."
          />
          <div className="flex flex-wrap gap-2 mb-5">
            {TONE_OPTIONS.map((tone) => {
              const active = tones.includes(tone);
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => toggleTone(tone)}
                  aria-pressed={active}
                  className={`px-3.5 h-9 rounded-full text-[13px] font-medium border transition-colors ${
                    active
                      ? 'bg-brand-50 border-brand-600 text-brand-700'
                      : 'bg-white border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900'
                  }`}
                >
                  {tone}
                </button>
              );
            })}
          </div>
          <div>
            <label htmlFor="brand-description" className="text-[13px] font-medium text-ink-700 block mb-1.5">
              Brand description
            </label>
            <textarea
              id="brand-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-white border border-ink-200 rounded-xl px-3.5 py-2.5 text-[14px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors resize-none"
              placeholder="Describe who you are and how you want to sound."
            />
          </div>
        </Card>

        {/* Banned words */}
        <Card>
          <SectionHead
            icon={<Ban className="w-4 h-4" />}
            title="Banned words / do-not-say"
            desc="We'll avoid these words and phrases in every generated draft."
          />
          <form onSubmit={addBanned} className="flex gap-2 mb-4">
            <input
              value={bannedDraft}
              onChange={(e) => setBannedDraft(e.target.value)}
              placeholder="Add a word or phrase, then press Enter"
              className={inputClass}
              aria-label="Add banned word"
            />
            <Button type="submit" variant="secondary" leftIcon={<Plus className="w-4 h-4" />}>
              Add
            </Button>
          </form>
          {banned.length === 0 ? (
            <p className="text-[13px] text-ink-500">No banned words yet. Add a few to keep the AI on-brand.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {banned.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 h-8 rounded-full bg-ink-100 text-[13px] font-medium text-ink-700"
                >
                  {word}
                  <button
                    type="button"
                    onClick={() => removeBanned(word)}
                    aria-label={`Remove ${word}`}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-ink-200 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const SectionHead: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div className="flex items-start gap-3 mb-5">
    <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <h2 className="font-display text-lg font-bold tracking-tight text-ink-900">{title}</h2>
      <p className="text-[13px] text-ink-600 mt-0.5">{desc}</p>
    </div>
  </div>
);
