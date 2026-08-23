'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  UploadCloud, FileVideo, FileImage, FileText, FileAudio,
  X, ArrowRight, CheckCircle2, Loader2, Info, AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { track } from '@/lib/analytics';
import type { VideoFrameInput } from '@/lib/ai/video-engine';

type SlotKey = 'video' | 'thumbnail' | 'script' | 'voiceover';

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  /** Real bytes-sent percentage from the XHR progress event. */
  progress: number;
  ready: boolean;
  /** Set when the upload failed; the slot then offers a retry. */
  error?: string;
  /** Object key returned by the presign route, once the PUT succeeded. */
  key?: string;
  /** Public URL, when the deployment has a read origin configured. */
  publicUrl?: string | null;
  /** For the script slot: the extracted text we send to the review. */
  text?: string;
}

const SLOTS = [
  { key: 'video',     label: 'Video',     accept: 'video/mp4,video/quicktime,video/webm',                    icon: FileVideo, desc: 'MP4, MOV or WebM up to 4 GB', required: true  },
  { key: 'thumbnail', label: 'Thumbnail', accept: 'image/png,image/jpeg,image/webp',                          icon: FileImage, desc: 'PNG, JPG or WebP up to 15 MB', required: false },
  { key: 'script',    label: 'Script',    accept: 'text/plain,.txt,.doc,.docx',                               icon: FileText,  desc: 'TXT reads instantly, or paste below', required: false },
  { key: 'voiceover', label: 'Voiceover', accept: 'audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a',            icon: FileAudio, desc: 'MP3, WAV or M4A up to 300 MB', required: false },
] as const;

/**
 * Where the browser-side frame pass has got to.
 *
 * `unavailable` is a first-class outcome, not an error: a codec this browser
 * cannot decode, or a deployment with no public read origin for the vision model
 * to fetch the sheets from. The review still runs — it reports the video layer as
 * unmeasured, which is what it did before this pass existed. Showing the creator
 * a red failure for a review that is about to succeed would be wrong.
 */
type FramePhase = 'idle' | 'decoding' | 'uploading' | 'ready' | 'unavailable';

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn'] as const;

const MUSIC_SOURCES = [
  { value: 'none',     label: 'No music' },
  { value: 'original', label: 'Original / self-made' },
  { value: 'licensed', label: 'Licensed library' },
  { value: 'stock',    label: 'Stock / royalty-free' },
  { value: 'popular',  label: 'Commercial track' },
] as const;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/** PUT to the presigned URL, reporting true byte progress. */
function putWithProgress(
  url: string,
  // Blob, not File: the contact sheets are canvas output with no name and no
  // path. `File extends Blob`, so every existing caller is unaffected.
  file: Blob,
  headers: Record<string, string>,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [k, val] of Object.entries(headers)) xhr.setRequestHeader(k, val);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage rejected the upload (${xhr.status}).`));
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export const MultiAssetUploader: React.FC = () => {
  const [files, setFiles] = useState<Record<SlotKey, UploadedFile | null>>({
    video: null, thumbnail: null, script: null, voiceover: null,
  });
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('YouTube');
  const [analyzing, setAnalyzing] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<SlotKey | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [musicSource, setMusicSource] = useState<string>('none');
  const [aiGenerated, setAiGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageOff, setStorageOff] = useState(false);
  const [framePhase, setFramePhase] = useState<FramePhase>('idle');
  const [frameProgress, setFrameProgress] = useState(0);
  const [videoFrames, setVideoFrames] = useState<VideoFrameInput | null>(null);

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const aborters = useRef<Record<string, AbortController>>({});
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  /** Set when this review is a challenge accept — carried to the analysis page. */
  const challengeRef = useRef<string | null>(null);
  /**
   * Which frame pass is current. Incremented per run so a decode still finishing
   * for a video the creator has since removed or replaced discards its own result
   * instead of attaching another file's measurements to this review.
   */
  const frameRun = useRef(0);

  useEffect(() => {
    mounted.current = true;

    // Captured for the cleanup below. `aborters.current` is the same object for
    // the component's whole life — only its keys are mutated — so holding the
    // reference is safe and satisfies the exhaustive-deps ref-cleanup rule,
    // which cannot prove that on its own.
    const inFlight = aborters.current;

    // Re-run handoff from a report ("Re-run review"): preload title, script,
    // and platform so the follow-up review starts from the same inputs.
    try {
      const params = new URLSearchParams(window.location.search);
      const title = params.get('title');
      const script = params.get('script');
      const platform = params.get('platform');
      if (title) setTitle(title.slice(0, 200));
      if (script) setScriptText(script.slice(0, 20_000));
      if (platform && (PLATFORMS as readonly string[]).includes(platform)) {
        setPlatform(platform as typeof PLATFORMS[number]);
      }
    } catch {
      // Reading the URL is cosmetic; never let it break the uploader.
    }

    // Challenge accept ("I can beat this score"): prefill the SAME script,
    // title, and platform from the shared report so the follow-up review is a
    // genuine head-to-head, and remember the target for the analysis page.
    try {
      const params = new URLSearchParams(window.location.search);
      const challenge = params.get('challenge');
      if (challenge && /^[a-z0-9_-]{8,64}$/i.test(challenge)) {
        challengeRef.current = challenge;
        void fetch(`/api/share/${challenge}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!mounted.current || !data) return;
            if (data.title) setTitle(String(data.title).slice(0, 200));
            if (typeof data.scriptText === 'string' && data.scriptText) {
              setScriptText(data.scriptText.slice(0, 20_000));
            }
            if (data.targetPlatform && (PLATFORMS as readonly string[]).includes(data.targetPlatform)) {
              setPlatform(data.targetPlatform as typeof PLATFORMS[number]);
            }
          })
          .catch(() => {
            // The challenge fetch is prefill-only; never block the review on it.
          });
      }
    } catch {
      // Same rule as above — URL cosmetics must not break the uploader.
    }

    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      Object.values(inFlight).forEach((a) => a.abort());
    };
  }, []);

  const patchFile = useCallback((key: SlotKey, patch: Partial<UploadedFile>) => {
    if (!mounted.current) return;
    setFiles((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return { ...prev, [key]: { ...current, ...patch } };
    });
  }, []);

  /** PUT one contact sheet and return the URL the vision model can fetch it from. */
  const uploadSheet = useCallback(
    async (blob: Blob, filename: string, signal: AbortSignal): Promise<string | null> => {
      const res = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: 'frames',
          filename,
          contentType: 'image/jpeg',
          size: blob.size,
        }),
        signal,
      });
      const presign = await res.json().catch(() => ({}));
      // No public read origin means the sheet exists in the bucket and the model
      // cannot see it. Better to report the layer unmeasured than to send a URL
      // that will 403 and have the vision call fail mid-review.
      if (!res.ok || !presign?.signedUrl || !presign?.publicUrl) return null;
      await putWithProgress(
        presign.signedUrl,
        blob,
        presign.requiredHeaders ?? { 'Content-Type': 'image/jpeg' },
        () => {},
        signal,
      );
      return presign.publicUrl as string;
    },
    [],
  );

  /**
   * Decode the video here, in this browser, and upload what it measured.
   *
   * Runs alongside the video's own upload rather than after it: the decode is
   * local CPU work and the PUT is network, so serialising them would double the
   * wait for no benefit. The extractor is imported dynamically so a creator who
   * only pastes a script never downloads it.
   */
  const analyzeFrames = useCallback(async (f: File) => {
    const run = ++frameRun.current;
    aborters.current.frames?.abort();
    const controller = new AbortController();
    aborters.current.frames = controller;

    const current = () => frameRun.current === run && mounted.current;

    setVideoFrames(null);
    setFrameProgress(0);
    setFramePhase('decoding');

    try {
      const { extractFrameSignals } = await import('@/lib/video/extract-frames');
      const signals = await extractFrameSignals(f, (fraction) => {
        if (current()) setFrameProgress(Math.min(99, Math.round(fraction * 100)));
      });
      if (!current()) return;

      if (!signals) {
        setFramePhase('unavailable');
        return;
      }

      setFramePhase('uploading');
      const stamp = `${Date.now()}`;
      const sheetUrl = await uploadSheet(signals.sheet, `sheet-${stamp}.jpg`, controller.signal);
      if (!current()) return;
      if (!sheetUrl) {
        setFramePhase('unavailable');
        return;
      }

      // The hook sheet is optional — losing it costs the opening-three-seconds
      // reading and nothing else, so a failure here does not sink the pass.
      let hookSheetUrl: string | undefined;
      if (signals.hookSheet) {
        hookSheetUrl =
          (await uploadSheet(signals.hookSheet, `hook-${stamp}.jpg`, controller.signal)) ?? undefined;
        if (!current()) return;
      }

      setVideoFrames({
        sheetUrl,
        hookSheetUrl,
        width: signals.width,
        height: signals.height,
        durationSeconds: signals.durationSeconds,
        sizeBytes: signals.sizeBytes,
        sheetFrames: signals.sheetFrames,
        comparisons: signals.comparisons,
        cuts: signals.cuts,
        staticPairs: signals.staticPairs,
        meanDeltaPermille: signals.meanDeltaPermille,
        probedSeconds: signals.probedSeconds,
      });
      setFrameProgress(100);
      setFramePhase('ready');
      void track('video_frames_measured', {
        cuts: signals.cuts,
        comparisons: signals.comparisons,
        durationSeconds: signals.durationSeconds,
      });
    } catch {
      if (current()) setFramePhase('unavailable');
    }
  }, [uploadSheet]);

  const upload = useCallback(async (key: SlotKey, f: File) => {
    aborters.current[key]?.abort();
    const controller = new AbortController();
    aborters.current[key] = controller;

    setFiles((prev) => ({
      ...prev,
      [key]: { name: f.name, type: f.type, size: f.size, progress: 0, ready: false },
    }));

    // A .txt script is read locally — the review needs the text, not a stored
    // object, so we skip the round trip to storage entirely.
    const isPlainTextScript =
      key === 'script' && (f.type === 'text/plain' || /\.txt$/i.test(f.name));
    if (isPlainTextScript) {
      try {
        const text = await f.text();
        if (!mounted.current) return;
        setScriptText(text.slice(0, 20_000));
        patchFile(key, { progress: 100, ready: true, text: text.slice(0, 20_000) });
      } catch {
        patchFile(key, { error: 'Could not read that file. Paste the script instead.' });
      }
      return;
    }

    try {
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: key,
          filename: f.name,
          contentType: f.type || 'application/octet-stream',
          size: f.size,
        }),
        signal: controller.signal,
      });

      const presign = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) {
        if (presign?.storageUnavailable) setStorageOff(true);
        throw new Error(presign?.error ?? `Could not prepare the upload (${presignRes.status}).`);
      }

      await putWithProgress(
        presign.signedUrl,
        f,
        presign.requiredHeaders ?? { 'Content-Type': f.type },
        (pct) => patchFile(key, { progress: pct }),
        controller.signal,
      );

      patchFile(key, {
        progress: 100,
        ready: true,
        key: presign.key,
        publicUrl: presign.publicUrl ?? null,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      patchFile(key, {
        error: err instanceof Error ? err.message : 'Upload failed.',
        progress: 0,
        ready: false,
      });
    }
  }, [patchFile]);

  const handleFile = (key: SlotKey, list: FileList | null) => {
    if (!list || !list[0]) return;
    setError(null);
    void upload(key, list[0]);
    if (key === 'video') void analyzeFrames(list[0]);
  };

  const removeFile = (key: SlotKey) => {
    aborters.current[key]?.abort();
    if (key === 'script') setScriptText('');
    if (key === 'video') {
      // Retires the in-flight decode by moving the run token past it.
      frameRun.current++;
      aborters.current.frames?.abort();
      setVideoFrames(null);
      setFrameProgress(0);
      setFramePhase('idle');
    }
    setFiles((prev) => ({ ...prev, [key]: null }));
  };

  const anyUploading = (Object.values(files) as (UploadedFile | null)[]).some(
    (f) => f && !f.ready && !f.error,
  );
  const addedCount = (Object.values(files) as (UploadedFile | null)[]).filter(Boolean).length;

  // A review needs something to review: a title plus either a script or an
  // uploaded asset. We do not let the user spend an audit on an empty request.
  const effectiveTitle = title.trim();
  const hasSubstance = scriptText.trim().length > 0 || !!files.video?.ready || !!files.thumbnail?.ready;
  // The frame pass gates the run for the fifteen-odd seconds it takes. Starting
  // the review early would not fail — it would quietly produce a report with the
  // video layer blank, for a video the browser was seconds from having measured.
  const framePending = framePhase === 'decoding' || framePhase === 'uploading';
  const canRun =
    effectiveTitle.length >= 3 && hasSubstance && !anyUploading && !framePending && !analyzing;

  /** Poll the job until it resolves, then navigate to the real report. */
  const pollJob = useCallback((jobId: string, attempt = 0) => {
    // ~5 minutes of polling at 2.5s, matching the worker's own ceiling.
    if (attempt > 120) {
      setError('The review is taking longer than expected. It will appear under Reports when it finishes.');
      setAnalyzing(false);
      setStatusLine(null);
      return;
    }

    pollTimer.current = setTimeout(async () => {
      if (!mounted.current) return;
      try {
        const res = await fetch(`/api/analyze/status/${jobId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Could not read the review status.');
        const job = await res.json();

        if (job.status === 'completed' && job.reportId) {
          setStatusLine('Report ready — opening…');
          window.location.href = challengeRef.current
            ? `/analysis/${job.reportId}?challenge=${challengeRef.current}`
            : `/analysis/${job.reportId}`;
          return;
        }
        if (job.status === 'failed') {
          setError(job.error ?? 'The review failed. Your allowance was refunded.');
          setAnalyzing(false);
          setStatusLine(null);
          return;
        }
        setStatusLine(job.status === 'running' ? 'Analyzing your upload…' : 'Queued…');
        pollJob(jobId, attempt + 1);
      } catch {
        // Transient network blip — keep polling rather than failing the run.
        pollJob(jobId, attempt + 1);
      }
    }, 2500);
  }, []);

  const runAudit = async () => {
    if (!canRun) return;
    setAnalyzing(true);
    setError(null);
    setStatusLine('Starting review…');
    void track('analyze_started', {
      platform,
      challenge: Boolean(challengeRef.current),
      scriptWords: scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0,
      framesMeasured: Boolean(videoFrames),
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: effectiveTitle,
          description: description.trim() || undefined,
          targetPlatform: platform,
          scriptText: scriptText.trim(),
          // Only send a thumbnail URL the server can actually fetch.
          thumbnailUrl: files.thumbnail?.publicUrl ?? undefined,
          // Prefer the voiceover track; fall back to the video when it is the
          // only media (Deepgram extracts the audio from either).
          audioUrl: files.voiceover?.publicUrl ?? files.video?.publicUrl ?? undefined,
          // Present only when this browser actually decoded the video. Absent, the
          // review reports the video layer as unmeasured rather than guessing it.
          videoFrames: videoFrames ?? undefined,
          musicSource,
          aiGenerated,
          folder: 'General',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.upgradeRequired) {
          void track('quota_wall_seen', { plan: data?.plan ?? 'unknown', source: 'analyze' });
          window.location.href = '/pricing';
          return;
        }
        throw new Error(data?.error ?? `Could not start the review (${res.status}).`);
      }
      void track('analyze_accepted', { platform, challenge: Boolean(challengeRef.current) });

      // The inline path returns the report immediately; the queued path gives us
      // a job to poll. Either way we only ever navigate to a real report id.
      if (data.reportId) {
        window.location.href = challengeRef.current
          ? `/analysis/${data.reportId}?challenge=${challengeRef.current}`
          : `/analysis/${data.reportId}`;
        return;
      }
      setStatusLine('Queued…');
      pollJob(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the review.');
      setAnalyzing(false);
      setStatusLine(null);
    }
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
                type="button"
                aria-pressed={platform === p}
                onClick={() => setPlatform(p)}
                className={clsx(
                  'px-2.5 h-8 rounded-md text-[12.5px] font-medium transition-colors',
                  platform === p
                    ? 'bg-brand-600 text-[#060606]'
                    : 'text-ink-700 hover:text-white hover:bg-white/[0.06]',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {storageOff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            File storage isn&apos;t enabled on this deployment, so video, thumbnail, and voiceover
            uploads are unavailable. Paste your script below — the script, hook, SEO, platform-policy,
            and copyright layers all run on text alone.
          </span>
        </div>
      )}

      {/* Upload slots */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Drop your assets
            </h2>
            <div className="text-xs text-ink-500 mt-1">
              Every extra asset unlocks another layer of the review. A script alone already runs five of them.
            </div>
          </div>
          <Badge variant="outline">{addedCount} / {SLOTS.length} added</Badge>
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
                  file?.error
                    ? 'border-crimson-200 bg-crimson-50/40'
                    : file
                      ? 'border-white/[0.08] bg-white/[0.02]'
                      : isDragOver
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]',
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
                        file.error
                          ? 'bg-crimson-50 border-crimson-200 text-crimson-700'
                          : file.ready
                            ? 'bg-grass-50 border-grass-100 text-grass-700'
                            : 'bg-white/[0.04] border-white/[0.08] text-ink-700',
                      )}>
                        {file.error
                          ? <AlertTriangle className="w-4 h-4" />
                          : file.ready
                            ? <CheckCircle2 className="w-4 h-4" />
                            : <Icon className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium text-ink-900 truncate">{file.name}</div>
                        <div className="text-[11.5px] text-ink-500 mt-0.5">
                          {slot.label} · {formatSize(file.size)}
                          {file.ready && ' · ready'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(slot.key); }}
                        className="text-ink-400 hover:text-white transition-colors shrink-0"
                        aria-label={`Remove ${slot.label}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {file.error && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] text-crimson-700">{file.error}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); fileRefs.current[slot.key]?.click(); }}
                          className="text-[11.5px] font-medium text-ink-900 underline shrink-0"
                        >
                          Try again
                        </button>
                      </div>
                    )}

                    {!file.ready && !file.error && (
                      <div className="mt-3">
                        <div
                          className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={file.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${slot.label} upload progress`}
                        >
                          <div
                            className="h-full bg-brand-600 rounded-full transition-all duration-200"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10.5px] text-ink-500 inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                          </span>
                          <span className="text-[10.5px] tabular-nums text-ink-500">{file.progress}%</span>
                        </div>
                      </div>
                    )}
                    {/* The frame pass, reported apart from the upload because the
                        two have separate outcomes: a video can store perfectly and
                        still be undecodable in this browser. */}
                    {slot.key === 'video' && framePhase !== 'idle' && (
                      <div className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-500">
                        {(framePhase === 'decoding' || framePhase === 'uploading') && (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin shrink-0 mt-0.5" />
                            <span>
                              {framePhase === 'decoding'
                                ? `Reading frames · ${frameProgress}%`
                                : 'Sending frames for analysis…'}
                            </span>
                          </>
                        )}
                        {framePhase === 'ready' && videoFrames && (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-grass-700 shrink-0 mt-0.5" />
                            <span>
                              {videoFrames.sheetFrames} frames read at {videoFrames.width}×
                              {videoFrames.height}
                              {videoFrames.comparisons > 0 &&
                                `, ${videoFrames.cuts} cut${videoFrames.cuts === 1 ? '' : 's'} across ${videoFrames.probedSeconds}s sampled`}
                            </span>
                          </>
                        )}
                        {framePhase === 'unavailable' && (
                          <>
                            <Info className="w-3 h-3 text-ink-400 shrink-0 mt-0.5" />
                            <span>
                              This browser could not decode the video. Every other layer still
                              runs, and the visual one will say it was not measured.
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className={clsx(
                      'w-9 h-9 rounded-lg mx-auto mb-3 flex items-center justify-center',
                      isDragOver ? 'bg-brand-600 text-[#060606]' : 'bg-white/[0.08] text-ink-500',
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

      {/* Script + metadata */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Script &amp; metadata</h3>
            <div className="text-xs text-ink-500 mt-0.5">
              The script drives the hook, authenticity, and demonetization-risk layers — it is the single
              highest-value thing to include.
            </div>
          </div>
          <Info className="w-4 h-4 text-ink-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Video title" htmlFor="up-title" className="md:col-span-2">
            <input
              id="up-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The exact title you plan to publish"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </Field>

          <Field label="Script" htmlFor="up-script" className="md:col-span-2">
            <textarea
              id="up-script"
              value={scriptText}
              maxLength={20000}
              rows={8}
              onChange={(e) => setScriptText(e.target.value)}
              placeholder="Paste your full script, or upload a .txt above and it lands here automatically."
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] leading-relaxed placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-ink-400">
                {scriptText.trim() ? `${scriptText.trim().split(/\s+/).length} words` : 'No script yet'}
              </span>
              <span className="text-[11px] text-ink-400 tabular-nums">{scriptText.length} / 20,000</span>
            </div>
          </Field>

          <Field label="Description" htmlFor="up-desc">
            <input
              id="up-desc"
              value={description}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="The description that will appear under the video"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
          </Field>

          <Field label="Music source" htmlFor="up-music">
            <select
              id="up-music"
              value={musicSource}
              onChange={(e) => setMusicSource(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 h-9 text-[13px] focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            >
              {MUSIC_SOURCES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </Field>

          <div className="md:col-span-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={aiGenerated}
                onChange={(e) => setAiGenerated(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-white/[0.20] bg-white/[0.03] text-brand-600 focus:ring-1 focus:ring-brand-600"
              />
              <span className="text-[12.5px] text-ink-700">
                This upload contains AI-generated voice or visuals.
                <span className="block text-[11.5px] text-ink-500 mt-0.5">
                  Used to check whether YouTube&apos;s synthetic-content disclosure applies to your specific case —
                  it does not by itself lower any score.
                </span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Run bar */}
      <div className="sticky bottom-4 z-10">
        {error && (
          <div className="mb-3 rounded-xl bg-crimson-50 border border-crimson-200 px-4 py-3 text-[13px] text-crimson-800 shadow-sm flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-crimson-700 hover:text-crimson-900 shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="rounded-2xl border border-white/[0.06] bg-surface-panel/90 backdrop-blur-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-float">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              canRun || analyzing
                ? 'bg-grass-50 text-grass-700 border border-grass-100'
                : 'bg-white/[0.08] text-ink-500',
            )}>
              {analyzing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : canRun ? <CheckCircle2 className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-sm font-medium text-ink-900">
                {analyzing
                  ? statusLine ?? 'Running review…'
                  : canRun
                    ? 'Ready to review'
                    : effectiveTitle.length < 3
                      ? 'Add a title to continue'
                      : framePending
                        ? 'Measuring your video…'
                        : 'Add a script or an asset to continue'}
              </div>
              <div className="text-[11.5px] text-ink-500">
                {platform} policy set · {analyzing ? 'this stays live while it runs' : 'runs every layer your assets support'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" disabled={analyzing} onClick={() => window.history.back()}>
              Cancel
            </Button>
            <Button
              size="lg"
              disabled={!canRun}
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

const Field: React.FC<{
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, className, children }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="text-[11.5px] font-medium text-ink-600 block mb-1.5">
      {label}
    </label>
    {children}
  </div>
);
