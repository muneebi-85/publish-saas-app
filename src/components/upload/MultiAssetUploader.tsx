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
  { key: 'video',     label: 'Video',     accept: 'video/mp4,video/quicktime,video/webm',                    icon: FileVideo, desc: 'MP4, MOV or WebM up to 4 GB', required: false },
  { key: 'thumbnail', label: 'Thumbnail', accept: 'image/png,image/jpeg,image/webp',                          icon: FileImage, desc: 'PNG, JPG or WebP up to 15 MB', required: false },
  // Only formats the text-extraction pass (below) can actually read are
  // accepted. .doc/.docx used to be listed too: the slot showed a green
  // "ready" check, but no text is extracted from binary formats, so the
  // review could run with an empty script while the UI claimed it had one.
  { key: 'script',    label: 'Script',    accept: 'text/plain,.txt',                                        icon: FileText,  desc: 'TXT reads instantly, or paste below', required: false },
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
type FramePhase = 'idle' | 'decoding' | 'uploading' | 'ready' | 'unavailable' | 'upload-blocked';

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

/**
 * POST the presigned form, reporting true byte progress.
 *
 * The presign route returns a signed POST policy (not a PUT URL): `fields`
 * carries the policy + its SigV4 verification, and the provider enforces the
 * pinned Content-Type and size window on the wire. Field order matters — the
 * file must be the LAST part of the form.
 */
function postWithProgress(
  url: string,
  fields: Record<string, string>,
  // Blob, not File: the contact sheets are canvas output with no name and no
  // path. `File extends Blob`, so every existing caller is unaffected.
  file: Blob,
  filename: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('file', file, filename);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : // 403 = the policy rejected the upload (wrong type/size/key); S3
          // answers EntityTooLarge with 400. Both mean the object was NOT stored.
          reject(
            xhr.status === 403
              ? new Error('Storage rejected the upload policy (type or size not allowed).')
              : new Error(`Storage rejected the upload (${xhr.status}).`),
          );
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));

    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
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
    let queuedTitle = '';
    let queuedScript = '';
    let queuedPlatform: typeof PLATFORMS[number] = 'YouTube';
    try {
      const params = new URLSearchParams(window.location.search);
      const title = params.get('title');
      const script = params.get('script');
      const platform = params.get('platform');
      if (title) { queuedTitle = title.slice(0, 200); setTitle(queuedTitle); }
      if (script) { queuedScript = script.slice(0, 20_000); setScriptText(queuedScript); }
      if (platform && (PLATFORMS as readonly string[]).includes(platform)) {
        queuedPlatform = platform as typeof PLATFORMS[number];
        setPlatform(queuedPlatform);
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
        // Snapshot what the boxes hold once the sync prefill above has run.
        // The challenge data arrives async — applying it over fields the
        // creator has ALREADY edited in the meantime (a pasted rewrite of the
        // script, a different title) silently discards their work. Only fields
        // they have not touched are prefillable.
        const beforeFetch = { title: queuedTitle, script: queuedScript, platform: queuedPlatform };
        void fetch(`/api/share/${challenge}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!mounted.current || !data) return;
            if (data.title) {
              setTitle((prev) => (prev === beforeFetch.title ? String(data.title).slice(0, 200) : prev));
            }
            if (typeof data.scriptText === 'string' && data.scriptText) {
              setScriptText((prev) =>
                prev === beforeFetch.script ? data.scriptText.slice(0, 20_000) : prev,
              );
            }
            if (data.targetPlatform && (PLATFORMS as readonly string[]).includes(data.targetPlatform)) {
              setPlatform((prev) =>
                prev === beforeFetch.platform
                  ? (data.targetPlatform as typeof PLATFORMS[number])
                  : prev,
              );
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

  /** Upload one contact sheet and return the URL the vision model can fetch it from. */
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
      if (!res.ok || !presign?.signedUrl || !presign?.fields || !presign?.publicUrl) return null;
      await postWithProgress(
        presign.signedUrl,
        presign.fields,
        blob,
        filename,
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
      // The controller's signal retires the decode early when the video is
      // removed or the component unmounts mid-decode; without it the loop
      // keeps burning CPU for up to the full 30s deadline.
      const signals = await extractFrameSignals(f, (fraction) => {
        if (current()) setFrameProgress(Math.min(99, Math.round(fraction * 100)));
      }, controller.signal);
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
        // The decode SUCCEEDED — the sheet upload was refused (typically the
        // storage 503 on deployments without S3 configured). Saying "could not
        // decode" here would assert a failure that did not happen.
        setFramePhase('upload-blocked');
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
      if (!presign?.signedUrl || !presign?.fields) {
        throw new Error('Could not prepare the upload.');
      }

      await postWithProgress(
        presign.signedUrl,
        presign.fields,
        f,
        f.name,
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
    const f = list[0];
    setError(null);

    // Validate against the slot's contract BEFORE any network round trip, so
    // a file dropped on the wrong slot gets a plain-language answer instead
    // of the storage provider's "rejected the upload policy" jargon. A file
    // whose type matches a DIFFERENT slot names that slot in the message.
    const slot = SLOTS.find((s) => s.key === key)!;
    const wanted = slot.accept.split(',').map((t) => t.trim().toLowerCase());
    const typeOk = wanted.some(
      (t) =>
        (t.startsWith('.') && f.name.toLowerCase().endsWith(t)) ||
        f.type === t ||
        f.type === '',
    );
    if (!typeOk) {
      const betterSlot = SLOTS.find((s) =>
        s.accept.split(',').map((t) => t.trim().toLowerCase()).includes(f.type),
      );
      setFiles((prev) => ({
        ...prev,
        [key]: {
          name: f.name, type: f.type, size: f.size, progress: 0, ready: false,
          error: betterSlot
            ? `That's a ${betterSlot.label.toLowerCase()} file — drop it in the ${betterSlot.label} slot instead.`
            : `That file type doesn't fit the ${slot.label} slot. ${slot.desc}.`,
        },
      }));
      return;
    }

    void upload(key, f);
    if (key === 'video') void analyzeFrames(f);
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

  // A review needs something to review: a title plus a script, an uploaded
  // asset, or a voiceover track. The analyze route accepts an empty script
  // when audioUrl is set (the voice layer transcribes it), so a voiceover
  // alone is a valid review — excluding it here disabled "Run full review"
  // while the voiceover slot said "ready".
  //
  // A media slot only counts while its public URL exists: with no public read
  // origin configured (S3_PUBLIC_URL unset) the upload lands in a private
  // bucket, the server-side engines cannot fetch it, and a media-only run
  // would send an empty payload and spend the audit on a report that measured
  // nothing. A script is readable by construction and needs no origin.
  const effectiveTitle = title.trim();
  const readableMedia =
    (!!files.video?.ready && !!files.video.publicUrl) ||
    (!!files.thumbnail?.ready && !!files.thumbnail.publicUrl) ||
    (!!files.voiceover?.ready && !!files.voiceover.publicUrl);
  const hasSubstance = scriptText.trim().length > 0 || readableMedia;
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
      setError('The review is taking longer than expected. It will appear under Analyses when it finishes.');
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
    <div className="space-y-5">
      {/* Platform */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-900">Target platform</div>
            <div className="text-[12px] leading-relaxed text-ink-500 mt-1 max-w-md">
              Review rules and policy differ per platform. Pick the primary destination first — you can re-run on others in one click.
            </div>
          </div>
          <div className="flex flex-wrap gap-0.5 rounded-lg p-0.5 bg-ink-100 shrink-0">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                onClick={() => setPlatform(p)}
                className={clsx(
                  'px-2.5 h-7 rounded-md text-[12px] font-medium transition-colors',
                  platform === p
                    ? 'bg-surface-panel text-ink-900 shadow-xs'
                    : 'text-ink-500 hover:text-ink-900',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {storageOff && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-amber-900 flex items-start gap-2">
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
            <h2 className="font-display text-[16px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink-900">
              Drop your assets
            </h2>
            <div className="text-[12px] leading-relaxed text-ink-500 mt-0.5 max-w-lg">
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
                // The empty slot is a button in spirit, so it carries the
                // button role + keyboard activation — a mouse-only drop zone
                // locks keyboard and screen-reader users out of the upload.
                role={!file ? 'button' : undefined}
                tabIndex={!file ? 0 : undefined}
                aria-label={!file ? `Add ${slot.label} — ${slot.desc}` : undefined}
                onKeyDown={(e) => {
                  if (!file && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    fileRefs.current[slot.key]?.click();
                  }
                }}
                className={clsx(
                  'relative rounded-xl p-4 transition-colors',
                  !file && 'cursor-pointer border border-dashed',
                  file && 'border shadow-xs',
                  file?.error
                    ? 'border-crimson-200 bg-crimson-50'
                    : file
                      ? 'border-ink-200 bg-surface-panel'
                      : isDragOver
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-ink-300 bg-ink-50 hover:border-ink-400 hover:bg-ink-100',
                )}
              >
                <input
                  ref={(el) => { fileRefs.current[slot.key] = el; }}
                  type="file"
                  accept={slot.accept}
                  onChange={(e) => {
                    handleFile(slot.key, e.target.files);
                    // Reset so re-picking the SAME file after a remove/retry
                    // fires change again (the input keeps the stale value and
                    // swallows the duplicate pick otherwise).
                    e.target.value = '';
                  }}
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
                            ? 'bg-grass-50 border-grass-200 text-grass-700'
                            : 'bg-ink-100 border-ink-200 text-ink-700',
                      )}>
                        {file.error
                          ? <AlertTriangle className="w-4 h-4" />
                          : file.ready
                            ? <CheckCircle2 className="w-4 h-4" />
                            : <Icon className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink-900 truncate">{file.name}</div>
                        <div className="text-[12px] text-ink-500 mt-0.5">
                          {slot.label} · {formatSize(file.size)}
                          {file.ready && ' · ready'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(slot.key); }}
                        className="text-ink-400 hover:text-ink-900 transition-colors shrink-0"
                        aria-label={`Remove ${slot.label}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {file.error && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-[12px] text-crimson-700">{file.error}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); fileRefs.current[slot.key]?.click(); }}
                          className="text-[12px] font-medium text-ink-900 underline shrink-0"
                        >
                          Try again
                        </button>
                      </div>
                    )}

                    {!file.ready && !file.error && (
                      <div className="mt-3">
                        <div
                          className="h-1 w-full bg-ink-100 rounded-full overflow-hidden"
                          role="progressbar"
                          aria-valuenow={file.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${slot.label} upload progress`}
                        >
                          <div
                            className="h-full bg-brand-600 rounded-full transition-all duration-150"
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] text-ink-500 inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                          </span>
                          <span className="text-[11px] tabular-nums text-ink-500">{file.progress}%</span>
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
                        {framePhase === 'upload-blocked' && (
                          <>
                            <Info className="w-3 h-3 text-ink-400 shrink-0 mt-0.5" />
                            <span>
                              The video decoded, but this deployment has no file storage
                              configured, so the measured frames cannot reach the visual
                              layer. Every other layer still runs; the visual one will say
                              it was not measured.
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <div className={clsx(
                      'w-8 h-8 rounded-lg mx-auto mb-2.5 flex items-center justify-center transition-colors',
                      isDragOver ? 'bg-brand-600 text-on-brand' : 'bg-surface-panel text-ink-400 border border-ink-200',
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-[13px] font-medium text-ink-900">
                      {slot.label}
                    </div>
                    <div className="text-[12px] text-ink-500 mt-1">{slot.desc}</div>
                    <div className="text-[11px] text-ink-500 mt-2">
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
            <h3 className="text-[13px] font-semibold text-ink-900">Script &amp; metadata</h3>
            <div className="text-[12px] text-ink-500 mt-0.5">
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
              className="w-full bg-surface-panel border border-ink-300 rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
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
              className="w-full bg-surface-panel border border-ink-300 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-ink-500">
                {scriptText.trim() ? `${scriptText.trim().split(/\s+/).length} words` : 'No script yet'}
              </span>
              <span className="text-[11px] text-ink-500 tabular-nums">{scriptText.length} / 20,000</span>
            </div>
          </Field>

          <Field label="Description" htmlFor="up-desc">
            <input
              id="up-desc"
              value={description}
              maxLength={5000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="The description that will appear under the video"
              className="w-full bg-surface-panel border border-ink-300 rounded-lg px-3 h-9 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
            />
          </Field>

          <Field label="Music source" htmlFor="up-music">
            <select
              id="up-music"
              value={musicSource}
              onChange={(e) => setMusicSource(e.target.value)}
              className="w-full bg-surface-panel border border-ink-300 rounded-lg px-3 h-9 text-[13px] focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15"
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
                className="mt-0.5 w-4 h-4 rounded border-ink-300 bg-surface-panel text-brand-600 focus:ring-2 focus:ring-brand-600/15"
              />
              <span className="text-[12px] text-ink-700">
                This upload contains AI-generated voice or visuals.
                <span className="block text-[12px] text-ink-500 mt-0.5">
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
          <div className="mb-2.5 rounded-xl bg-crimson-50 border border-crimson-200 p-4 text-[13px] text-crimson-800 flex items-start justify-between gap-3">
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
        <div className="rounded-xl border border-ink-200 bg-surface-panel/95 backdrop-blur-md p-3 pl-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-float">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              canRun || analyzing
                ? 'bg-grass-50 text-grass-700 ring-1 ring-inset ring-grass-200'
                : 'bg-ink-100 text-ink-400',
            )}>
              {analyzing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : canRun ? <CheckCircle2 className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-[13px] font-semibold text-ink-900">
                {analyzing
                  ? statusLine ?? 'Running review…'
                  : canRun
                    ? 'Ready to review'
                    : effectiveTitle.length < 3
                      ? 'Add a title to continue'
                      : framePending
                        ? 'Measuring your video…'
                        : addedCount > 0 && scriptText.trim().length === 0
                          // Uploads exist but none the server can read (no public
                          // origin) — the script is the only reviewable substance.
                          ? 'Paste your script to continue — this deployment cannot read uploaded files'
                          : 'Add a script or an asset to continue'}
              </div>
              <div className="text-[12px] text-ink-500 mt-0.5">
                {platform} policy set · {analyzing ? 'this stays live while it runs' : 'runs every layer your assets support'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" disabled={analyzing} onClick={() => window.history.back()}>
              Back
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
    <label htmlFor={htmlFor} className="text-[12px] font-medium text-ink-700 block mb-1.5">
      {label}
    </label>
    {children}
  </div>
);
