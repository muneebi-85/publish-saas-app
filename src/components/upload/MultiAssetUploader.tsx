'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud, FileVideo, FileImage, FileText, FileAudio,
  X, ArrowRight, CheckCircle2, Loader2, Info,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  progress?: number; // 0..100
  ready?: boolean;
}

const SLOTS = [
  { key: 'video',      label: 'Video',      accept: '.mp4,.mov,.webm',  icon: FileVideo,  desc: 'MP4, MOV or WebM up to 4 GB', required: true  },
  { key: 'thumbnail',  label: 'Thumbnail',  accept: '.png,.jpg,.jpeg,.webp', icon: FileImage,  desc: 'PNG, JPG or WebP',       required: false },
  { key: 'script',     label: 'Script',     accept: '.txt,.doc,.docx',  icon: FileText,   desc: 'Text file or paste below',    required: false },
  { key: 'voiceover',  label: 'Voiceover',  accept: '.mp3,.wav,.m4a',   icon: FileAudio,  desc: 'MP3, WAV or M4A',             required: false },
] as const;

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const MultiAssetUploader: React.FC = () => {
  const [files, setFiles] = useState<Record<string, UploadedFile | null>>({
    video: null, thumbnail: null, script: null, voiceover: null,
  });
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('YouTube');
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setFileProgress = useCallback((key: string, patch: Partial<UploadedFile>) => {
    setFiles((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return { ...prev, [key]: { ...current, ...patch } };
    });
  }, []);

  const acceptFile = (key: string, f: File) => {
    setFiles((prev) => ({
      ...prev,
      [key]: { name: f.name, type: f.type, size: f.size, progress: 0, ready: false },
    }));

    // Fake upload progress → the real thing would stream through UploadThing/S3.
    let pct = 0;
    const tick = () => {
      pct = Math.min(100, pct + 6 + Math.random() * 12);
      setFileProgress(key, { progress: pct });
      if (pct < 100) {
        setTimeout(tick, 90 + Math.random() * 90);
      } else {
        setTimeout(() => setFileProgress(key, { ready: true }), 200);
      }
    };
    setTimeout(tick, 120);
  };

  const handleFile = (key: string, list: FileList | null) => {
    if (!list || !list[0]) return;
    acceptFile(key, list[0]);
  };

  const removeFile = (key: string) => setFiles((prev) => ({ ...prev, [key]: null }));

  const hasVideo = !!files.video?.ready;
  const anyReady = Object.values(files).some((f) => f?.ready);
  const anyLoading = Object.values(files).some((f) => f && !f.ready);

  const runAudit = () => {
    setAnalyzing(true);
    setTimeout(() => { window.location.href = '/analysis/proj-001'; }, 1400);
  };

  return (
    <div className="space-y-8">
      {/* Platform */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-ink-900">Target platform</div>
            <div className="text-xs text-ink-500 mt-0.5">
              Review rules and policy differ per platform. Pick the primary destination first — you can re-run on others in one click.
            </div>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 p-1 bg-surface-canvas">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={clsx(
                  'px-2.5 h-8 rounded-md text-[12.5px] font-medium transition-colors',
                  platform === p
                    ? 'bg-ink-900 text-white'
                    : 'text-ink-700 hover:text-ink-900 hover:bg-ink-100',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Upload slots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Drop your assets
            </h2>
            <div className="text-xs text-ink-500 mt-1">
              Only the video is required — every extra asset makes the review sharper.
            </div>
          </div>
          <Badge variant="outline">
            {Object.values(files).filter(Boolean).length} / {SLOTS.length} added
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SLOTS.map((slot) => {
            const Icon = slot.icon;
            const file = files[slot.key];
            const isDragOver = dragOverKey === slot.key;
            return (
              <div
                key={slot.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverKey(slot.key); }}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverKey(null);
                  handleFile(slot.key, e.dataTransfer.files);
                }}
                onClick={() => !file && fileRefs.current[slot.key]?.click()}
                className={clsx(
                  'relative rounded-2xl border-2 border-dashed p-5 transition-colors',
                  !file && 'cursor-pointer',
                  file
                    ? 'border-ink-200 bg-white'
                    : isDragOver
                      ? 'border-ink-900 bg-ink-100/60'
                      : 'border-ink-200 bg-white hover:border-ink-400 hover:bg-ink-50/40',
                )}
              >
                <input
                  ref={(el) => { fileRefs.current[slot.key] = el; }}
                  type="file"
                  accept={slot.accept}
                  onChange={(e) => handleFile(slot.key, e.target.files)}
                  className="hidden"
                />

                {file ? (
                  <div>
                    <div className="flex items-start gap-3">
                      <div className={clsx(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border transition-colors',
                        file.ready
                          ? 'bg-grass-50 border-grass-100 text-grass-700'
                          : 'bg-white border-ink-200 text-ink-700',
                      )}>
                        {file.ready ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-ink-900 truncate">{file.name}</div>
                        <div className="text-[11.5px] text-ink-500 mt-0.5">
                          {slot.label} · {formatSize(file.size)}
                          {file.ready && ' · ready'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(slot.key); }}
                        className="text-ink-400 hover:text-ink-900 transition-colors shrink-0"
                        aria-label="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {!file.ready && (
                      <div className="mt-3">
                        <div className="h-1 w-full bg-ink-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-ink-900 rounded-full transition-all duration-200"
                            style={{ width: `${file.progress || 0}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10.5px] text-ink-500 inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                          </span>
                          <span className="text-[10.5px] tabular-nums text-ink-500">
                            {Math.round(file.progress || 0)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className={clsx(
                      'w-9 h-9 rounded-lg mx-auto mb-3 flex items-center justify-center',
                      isDragOver ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500',
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-[13.5px] font-medium text-ink-900">
                      {slot.label}
                      {slot.required && <span className="text-crimson-500 ml-1">*</span>}
                    </div>
                    <div className="text-[11.5px] text-ink-500 mt-1">{slot.desc}</div>
                    <div className="text-[11px] text-ink-400 mt-2">
                      {isDragOver ? 'Drop to upload' : 'Click, or drag & drop'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Metadata (optional)</h3>
            <div className="text-xs text-ink-500 mt-0.5">
              Helps us match your description against SEO and disclosure rules.
            </div>
          </div>
          <Info className="w-4 h-4 text-ink-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Video title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Why AI voices are getting demonetized"
              className="w-full bg-white border border-ink-200 rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            />
          </Field>
          <Field label="Description">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary that will appear under the video"
              className="w-full bg-white border border-ink-200 rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            />
          </Field>
          <Field label="Tags" className="md:col-span-2">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated: creator economy, AI, monetization"
              className="w-full bg-white border border-ink-200 rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-900/5"
            />
          </Field>
        </div>
      </Card>

      {/* Run bar */}
      <div className="sticky bottom-4 z-10">
        <div className="rounded-2xl border border-ink-200 bg-white/90 backdrop-blur-md p-4 flex items-center justify-between shadow-float">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              hasVideo ? 'bg-grass-50 text-grass-700 border border-grass-100' : 'bg-ink-100 text-ink-500',
            )}>
              {hasVideo ? <CheckCircle2 className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-sm font-medium text-ink-900">
                {analyzing ? 'Running review…' : hasVideo ? 'Ready to review' : 'Add a video to continue'}
              </div>
              <div className="text-[11.5px] text-ink-500">
                Full multi-asset audit · {platform} policy set · ~11 minute turnaround
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => window.history.back()}>Cancel</Button>
            <Button
              size="lg"
              disabled={!hasVideo || anyLoading}
              isLoading={analyzing}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              onClick={runAudit}
            >
              Run full review
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({
  label, className, children,
}) => (
  <div className={className}>
    <label className="text-[11.5px] font-medium text-ink-600 block mb-1.5">{label}</label>
    {children}
  </div>
);
