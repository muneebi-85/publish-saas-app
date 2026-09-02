'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, UploadCloud, Palette, Type, ImageIcon, Volume2, Ban, Check, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { type Kit } from '@/lib/brand-kit';

const HEADING_FONTS = ['Inter', 'General Sans', 'Söhne', 'Poppins', 'Space Grotesk'];
const BODY_FONTS = ['Inter', 'Söhne', 'Georgia', 'System UI', 'IBM Plex Sans'];
const TONE_OPTIONS = ['Friendly', 'Expert', 'Bold', 'Playful', 'Calm'];

/** Mirrors the `logo` slot allowlist in /api/upload/presign. SVG is excluded there. */
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export const BrandKitClient: React.FC<{ initialKit: Kit }> = ({ initialKit }) => {
  const [colors, setColors] = useState(initialKit.colors);
  const [headingFont, setHeadingFont] = useState(initialKit.headingFont);
  const [bodyFont, setBodyFont] = useState(initialKit.bodyFont);
  const [tones, setTones] = useState<string[]>(initialKit.tones);
  const [description, setDescription] = useState(initialKit.description);
  const [banned, setBanned] = useState<string[]>(initialKit.banned);
  const [bannedDraft, setBannedDraft] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(initialKit.logoUrl);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are revoked on replace/unmount so a long editing session cannot
  // leak one blob per preview. The "Saved" flash timer is likewise cleared on
  // unmount so it cannot fire a setState on a dead component.
  const previewRef = useRef<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const setPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setLogoPreview(url);
  };

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

  /**
   * Logo upload: presign → PUT to storage → keep the returned public URL.
   * The URL is only held in state here; it is persisted by "Save changes"
   * along with the rest of the kit, so one Save covers the whole page.
   */
  const onLogoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so re-picking the same file fires change again.
    e.target.value = '';
    if (!file) return;

    setLogoError(null);

    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError('Logo must be a PNG, JPG, or WebP file.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo must be 5 MB or smaller.');
      return;
    }

    setPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: 'logo',
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const presign = await presignRes.json().catch(() => null);
      if (!presignRes.ok) {
        throw new Error(presign?.error ?? 'Could not prepare the upload.');
      }
      if (!presign?.publicUrl) {
        // Without a public read origin there is no URL we could render later,
        // so surface that rather than storing a key that resolves to nothing.
        throw new Error(
          'This deployment has no public storage URL configured, so logos cannot be displayed yet.',
        );
      }
      if (!presign?.signedUrl || !presign?.fields) {
        throw new Error('Could not prepare the upload.');
      }

      // Presigned POST: the policy fields go in the form, file appended last.
      const form = new FormData();
      for (const [k, v] of Object.entries(presign.fields as Record<string, string>)) {
        form.append(k, v);
      }
      form.append('file', file, file.name);
      const put = await fetch(presign.signedUrl, { method: 'POST', body: form });
      if (!put.ok) throw new Error(`Storage rejected the upload (${put.status}).`);

      setLogoUrl(presign.publicUrl);
      setPreview(null);
    } catch (err) {
      setPreview(null);
      setLogoError(err instanceof Error ? err.message : 'Could not upload the logo.');
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = () => {
    setPreview(null);
    setLogoUrl(null);
    setLogoError(null);
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
          brandKit: { colors, headingFont, bodyFont, tones, description, banned, logoUrl },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not save your brand kit.');
      }
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your brand kit.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-surface-panel border border-ink-300 rounded-lg h-9 px-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors';

  return (
    <div className="animate-enter">
      <PageHeader
        title="Brand Kit"
        subtitle="Keep your voice, colors, and identity consistent across every video."
        showUtility
        actions={
          <div className="flex items-center gap-2">
            {error && <span className="text-[12px] text-crimson-700">{error}</span>}
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-grass-700">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <Button leftIcon={saving ? undefined : <Check className="w-4 h-4" />} onClick={save} isLoading={saving}>
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
            desc="Your saved palette, kept in one place so hex codes are here when you build a thumbnail."
          />
          {colors.length === 0 && (
            <p className="text-[13px] leading-relaxed text-ink-600 mb-4">
              No colors yet. Add the ones you actually use and their hex codes stay
              with your kit.
            </p>
          )}
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
                    className="absolute top-2 right-2 w-6 h-6 rounded-md bg-scrim-strong border border-ink-200 text-ink-600 flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600"
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
            desc="The pairing you use for titles and body copy, previewed below."
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
              <p className="font-display text-[24px] leading-[1.25] font-semibold tracking-[-0.02em] text-ink-900 mt-3">
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
            desc="Stored with your kit so it is one click away when you need it."
          />
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-stretch">
            <div className="relative w-full sm:w-40 h-40 rounded-xl border border-ink-200 bg-surface-canvas flex flex-col items-center justify-center gap-2 text-ink-500 overflow-hidden">
              {logoPreview || logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded asset on an
                      arbitrary storage origin; next/image would need every deployment's CDN in
                      remotePatterns, and this renders at a fixed 160px box. */}
                  <img
                    src={logoPreview ?? logoUrl ?? ''}
                    alt="Your brand logo"
                    className="max-w-[80%] max-h-[70%] object-contain"
                  />
                  <span className="text-[12px] font-medium">
                    {logoUploading ? 'Uploading…' : 'Current logo'}
                  </span>
                  {!logoUploading && (
                    <button
                      type="button"
                      onClick={removeLogo}
                      aria-label="Remove logo"
                      className="absolute top-2 right-2 w-6 h-6 rounded-md bg-scrim-strong border border-ink-200 text-ink-600 flex items-center justify-center hover:text-ink-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:ring-brand-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {logoUploading && (
                    <div className="absolute inset-0 bg-scrim flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl border border-dashed border-ink-300 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-ink-400" />
                  </div>
                  <span className="text-[12px] font-medium text-ink-500">No logo yet</span>
                </>
              )}
            </div>
            <label
              className={`rounded-xl border border-dashed border-ink-300 flex flex-col items-center justify-center gap-2 p-6 text-center transition-colors focus-within:border-brand-600 ${
                logoUploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:border-brand-600'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-ink-100 flex items-center justify-center text-ink-600">
                {logoUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
              </div>
              <div className="text-[13px] font-medium text-ink-900">
                {logoUrl ? 'Replace your logo' : 'Upload a logo'}
              </div>
              <div className="text-[13px] leading-relaxed text-ink-600">PNG, JPG, or WebP with a transparent background, up to 5MB.</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={logoUploading}
                onChange={onLogoSelected}
              />
              <span className="text-[12px] font-semibold text-brand-600 mt-1">
                {logoUploading ? 'Uploading…' : 'Browse files'}
              </span>
            </label>
          </div>
          {logoError && (
            <p role="alert" className="text-[12px] text-crimson-700 mt-3">{logoError}</p>
          )}
          {logoUrl && !logoError && (
            <p className="text-[12px] text-ink-500 mt-3">
              Uploaded. Choose <span className="font-medium text-ink-700">Save changes</span> to keep it on your kit.
            </p>
          )}
        </Card>

        {/* Tone of voice */}
        <Card>
          <SectionHead
            icon={<Volume2 className="w-4 h-4" />}
            title="Tone of voice"
            desc="Selected tones and your brand description steer the AI when it rewrites scripts for you."
          />
          <div className="flex flex-wrap gap-1.5 mb-5">
            {TONE_OPTIONS.map((tone) => {
              const active = tones.includes(tone);
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => toggleTone(tone)}
                  aria-pressed={active}
                  className={`px-3 h-8 rounded-lg text-[13px] font-medium border transition-colors ${
                    active
                      ? 'bg-ink-900 border-ink-900 text-white'
                      : 'bg-surface-panel border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                  }`}
                >
                  {tone}
                </button>
              );
            })}
          </div>
          {tones.length === 0 && (
            <p className="text-[13px] leading-relaxed text-ink-600 mb-5 -mt-2">
              No tone selected. Until you pick one, rewrites follow the script&apos;s
              own voice rather than a brand tone.
            </p>
          )}
          <div>
            <label htmlFor="brand-description" className="text-[13px] font-medium text-ink-700 block mb-1.5">
              Brand description
            </label>
            <textarea
              id="brand-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-panel border border-ink-300 rounded-lg px-3 py-2.5 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 transition-colors resize-none"
              placeholder="Describe who you are and how you want to sound."
            />
          </div>
        </Card>

        {/* Banned words */}
        <Card>
          <SectionHead
            icon={<Ban className="w-4 h-4" />}
            title="Banned words / do-not-say"
            desc="Script rewrites are told to avoid these, then checked — anything that slips through is flagged on the result."
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
            <p className="text-[13px] leading-relaxed text-ink-600">No banned words yet. Add a few to keep the AI on-brand.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {banned.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-md bg-ink-100 text-[12px] font-medium text-ink-700"
                >
                  {word}
                  <button
                    type="button"
                    onClick={() => removeBanned(word)}
                    aria-label={`Remove ${word}`}
                    className="w-5 h-5 rounded-md flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-200 transition-colors"
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
    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div>
      <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">{title}</h2>
      <p className="text-[13px] leading-relaxed text-ink-600 mt-1">{desc}</p>
    </div>
  </div>
);
