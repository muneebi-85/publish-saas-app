/**
 * Video & editing layer.
 *
 * What is under test is the seam between measured and judged. The layer this
 * replaced returned `'Not analyzed — video source not connected'` for every visual
 * field while `editingPacingScore` quietly carried the thumbnail's composition
 * score, so a report could show a confident pace figure for a video nothing had
 * ever looked at. These tests hold the replacement to the split it claims:
 *
 *   • resolution, bitrate, cut density and held frames come only from decoded
 *     frames, and say so
 *   • the cut rate is reported over PROBED seconds, never scaled to the runtime
 *   • a vision failure degrades to the measured half rather than to invention
 *   • `unmeasuredVideo` claims nothing at all, and `measured` is the flag the UI
 *     can trust to tell the two apart
 *
 * `analyzeImage` is mocked: the vision model is the one part of this file that
 * cannot be unit-tested, and every branch that depends on it is a branch about
 * what to do when it fails or returns junk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ analyzeImage: vi.fn() }));
vi.mock('./nvidia', () => ({ analyzeImage: h.analyzeImage }));

import {
  analyzeVideoFrames,
  compressionLabel,
  pacingScore,
  resolutionLabel,
  unmeasuredVideo,
  type VideoFrameInput,
} from './video-engine';

/** A ten-minute 1080p file with 12s of probed footage and 6 cuts in it. */
const SIGNALS: VideoFrameInput = {
  sheetUrl: 'https://cdn.example.com/sheet.jpg',
  hookSheetUrl: 'https://cdn.example.com/hook.jpg',
  width: 1920,
  height: 1080,
  durationSeconds: 600,
  sizeBytes: 700 * 1024 * 1024,
  sheetFrames: 12,
  comparisons: 21,
  cuts: 6,
  staticPairs: 1,
  meanDeltaPermille: 140,
  probedSeconds: 12,
};

const SHEET_JSON = JSON.stringify({
  cameraMovement: 'Locked tripod throughout, no reframes',
  shotVariety: 55,
  onScreenText: 'Burned-in captions in the lower third of every frame',
  aiVisualArtifactRisk: 'Low',
  visualQualityScore: 72,
  recommendations: ['Reframe the static wide at frame 2 to a mid shot for 3 seconds.'],
});

const HOOK_JSON = JSON.stringify({
  visualHookScore: 48,
  verdict: 'Opens on a title card, so the first visible thing is text rather than a subject.',
  recommendations: ['Cut the title card and open on the frame-3 close-up instead.'],
});

beforeEach(() => {
  vi.clearAllMocks();
  h.analyzeImage.mockImplementation((url: string) =>
    Promise.resolve(url.includes('hook') ? HOOK_JSON : SHEET_JSON),
  );
});

describe('resolutionLabel', () => {
  it('labels by the short side so a vertical export is not called 1920p', () => {
    expect(resolutionLabel(1920, 1080)).toBe('1920x1080 (1080p)');
    expect(resolutionLabel(1080, 1920)).toBe('1080x1920 (1080p, vertical)');
  });

  it('names the standard bands', () => {
    expect(resolutionLabel(3840, 2160)).toContain('4K');
    expect(resolutionLabel(2560, 1440)).toContain('1440p');
    expect(resolutionLabel(1280, 720)).toContain('720p');
    expect(resolutionLabel(854, 480)).toContain('480p');
    expect(resolutionLabel(640, 360)).toContain('360p');
    expect(resolutionLabel(1080, 1080)).toContain('square');
  });

  it('says Unknown rather than inventing a resolution from a broken decode', () => {
    expect(resolutionLabel(0, 0)).toBe('Unknown');
    expect(resolutionLabel(1920, 0)).toBe('Unknown');
    expect(resolutionLabel(-1, 720)).toBe('Unknown');
  });
});

describe('compressionLabel', () => {
  it('compares against the published guide for the resolution', () => {
    // 8 Mbps is YouTube's own 1080p SDR figure, so the verdict cites a real
    // standard instead of a threshold invented in this file.
    const good = compressionLabel({
      sizeBytes: 12_000_000 * 10,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
    });
    expect(good).toContain('at or above');
    expect(good).toContain('8 Mbps guide for 1080p');

    const poor = compressionLabel({
      sizeBytes: 15_000_000,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
    });
    expect(poor).toContain('below');
    expect(poor).toContain('1080p');
  });

  it('calls the figure total, because the file includes its audio track', () => {
    expect(
      compressionLabel({ sizeBytes: 60_000_000, durationSeconds: 60, width: 1280, height: 720 }),
    ).toContain('Mbps total');
  });

  it('picks the guide row by the short side', () => {
    // A 1080x1920 vertical export is judged against the 1080p row, not 1440p.
    expect(
      compressionLabel({ sizeBytes: 100_000_000, durationSeconds: 60, width: 1080, height: 1920 }),
    ).toContain('1080p');
  });

  it('says Unknown when there is nothing to divide', () => {
    expect(
      compressionLabel({ sizeBytes: 0, durationSeconds: 60, width: 1920, height: 1080 }),
    ).toBe('Unknown');
    expect(
      compressionLabel({ sizeBytes: 1_000, durationSeconds: 0, width: 1920, height: 1080 }),
    ).toBe('Unknown');
  });
});

describe('pacingScore', () => {
  it('returns null when the cut rate was not measurable', () => {
    // Not a low score. A zero here would read as "badly paced" for a video whose
    // pace was never observed.
    expect(pacingScore(null, 0, false)).toBeNull();
  });

  it('scores a video that barely changes below one that cuts normally', () => {
    expect(pacingScore(0.5, 0, false)!).toBeLessThan(pacingScore(10, 0, false)!);
  });

  it('scores an exhausting cut rate below a normal one', () => {
    expect(pacingScore(120, 0, false)!).toBeLessThan(pacingScore(10, 0, false)!);
  });

  it('judges a Short against a faster target than long-form', () => {
    // 30 cuts a minute is frantic for a talking-head upload and unremarkable in a
    // Short, so the same rate must not produce the same score.
    expect(pacingScore(30, 0, true)).not.toBe(pacingScore(30, 0, false));
  });

  it('penalises frozen footage separately from the cut rate', () => {
    const clean = pacingScore(10, 0, false)!;
    expect(pacingScore(10, 0.3, false)!).toBeLessThan(clean);
    expect(pacingScore(10, 0.5, false)!).toBeLessThan(pacingScore(10, 0.3, false)!);
  });

  it('stays inside 0-100', () => {
    for (const cpm of [0, 1, 5, 20, 60, 500]) {
      for (const ratio of [0, 0.25, 0.9]) {
        const s = pacingScore(cpm, ratio, false)!;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('analyzeVideoFrames', () => {
  it('reports the measured half from the decode and marks the layer measured', async () => {
    const out = await analyzeVideoFrames(SIGNALS, 'YouTube', false);
    expect(out.measured).toBe(true);
    expect(out.resolution).toBe('1920x1080 (1080p)');
    expect(out.compressionQuality).toContain('Mbps total');
    expect(out.frameRepetitionCount).toBe(1);
    expect(out.editingPacingScore).not.toBeNull();
  });

  it('reports the cut rate over probed seconds, never scaled to the runtime', async () => {
    // The whole point of the probe design. 6 cuts in 12s of a 10-minute file is
    // "1 cut every 2.0s across 12s probed" — not 300 cuts inferred for the runtime.
    const out = await analyzeVideoFrames(SIGNALS, 'YouTube', false);
    expect(out.sceneTransitionRate).toBe('1 cut every 2.0s (6 cuts across 12s probed)');
    expect(out.sceneTransitionRate).not.toContain('600');
  });

  it('states what was sampled, and that pace is banded rather than observed', async () => {
    const out = await analyzeVideoFrames(SIGNALS, 'YouTube', false);
    expect(out.basis).toContain('12 frames');
    expect(out.basis).toContain('21 frame pairs');
    expect(out.basis).toContain('banded reading');
  });

  it('says no hard cuts rather than reporting a rate of zero', async () => {
    const out = await analyzeVideoFrames({ ...SIGNALS, cuts: 0 }, 'YouTube', false);
    expect(out.sceneTransitionRate).toBe('No hard cuts in the 12s sampled');
  });

  it('reports cut density as unmeasured when too few pairs decoded', async () => {
    const out = await analyzeVideoFrames(
      { ...SIGNALS, comparisons: 1, cuts: 0, probedSeconds: 0 },
      'YouTube',
      false,
    );
    expect(out.sceneTransitionRate).toContain('Not measured');
    expect(out.editingPacingScore).toBeNull();
    // Resolution came off the file, so it is still real even here.
    expect(out.resolution).toBe('1920x1080 (1080p)');
  });

  it('carries the vision readings through', async () => {
    const out = await analyzeVideoFrames(SIGNALS, 'YouTube', false);
    expect(out.cameraMovementRating).toContain('Locked tripod');
    expect(out.onScreenText).toContain('captions');
    expect(out.visualHookVerdict).toContain('title card');
    expect(out.aiVisualArtifactRisk).toBe('Low');
    expect(out.shotVarietyScore).not.toBeNull();
    expect(out.visualHookScore).not.toBeNull();
    expect(out.recommendations.length).toBeGreaterThan(0);
  });

  it('judges the hook sheet separately from the runtime sheet', async () => {
    // One call cannot answer both questions: folding the opening frames into the
    // spread would get them judged against frames from ten minutes later.
    await analyzeVideoFrames(SIGNALS, 'TikTok', false);
    expect(h.analyzeImage).toHaveBeenCalledTimes(2);
    const urls = h.analyzeImage.mock.calls.map((c) => c[0]);
    expect(urls).toContain(SIGNALS.sheetUrl);
    expect(urls).toContain(SIGNALS.hookSheetUrl);
  });

  it('leaves the hook unrated when no hook sheet was built', async () => {
    const out = await analyzeVideoFrames({ ...SIGNALS, hookSheetUrl: undefined }, 'YouTube', false);
    expect(h.analyzeImage).toHaveBeenCalledTimes(1);
    expect(out.visualHookScore).toBeNull();
    expect(out.visualHookVerdict).toBeNull();
    // The measured half is untouched by a missing hook sheet.
    expect(out.measured).toBe(true);
    expect(out.sceneTransitionRate).toContain('6 cuts');
  });

  it('degrades to the measured half when the vision call fails', async () => {
    // A model outage must not turn into a guess. Everything arithmetic survives;
    // everything judged says it was not judged.
    h.analyzeImage.mockRejectedValue(new Error('502 from the vision endpoint'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await analyzeVideoFrames(SIGNALS, 'YouTube', false);
    spy.mockRestore();

    expect(out.measured).toBe(true);
    expect(out.resolution).toBe('1920x1080 (1080p)');
    expect(out.sceneTransitionRate).toContain('6 cuts');
    expect(out.cameraMovementRating).toContain('did not return a reading');
    expect(out.shotVarietyScore).toBeNull();
    expect(out.onScreenText).toBeNull();
    expect(out.visualHookScore).toBeNull();
    // Still has something true to say, built only from the numbers.
    expect(out.recommendations.length).toBeGreaterThan(0);
  });

  it('survives junk in place of JSON', async () => {
    h.analyzeImage.mockResolvedValue('I am unable to view images.');
    const out = await analyzeVideoFrames(SIGNALS, 'YouTube', false);
    expect(out.measured).toBe(true);
    expect(out.shotVarietyScore).toBeNull();
    expect(out.resolution).toBe('1920x1080 (1080p)');
  });

  it('reads JSON out of a fenced code block', async () => {
    h.analyzeImage.mockResolvedValue('```json\n' + SHEET_JSON + '\n```');
    const out = await analyzeVideoFrames({ ...SIGNALS, hookSheetUrl: undefined }, 'YouTube', false);
    expect(out.cameraMovementRating).toContain('Locked tripod');
  });

  it('does not assume Low risk when the model omits the band', async () => {
    h.analyzeImage.mockResolvedValue(
      JSON.stringify({ cameraMovement: 'Handheld', shotVariety: 60, onScreenText: 'None' }),
    );
    const out = await analyzeVideoFrames({ ...SIGNALS, hookSheetUrl: undefined }, 'YouTube', false);
    expect(out.aiVisualArtifactRisk).toBe('Medium');
  });

  it('speaks to the measured numbers when advice has to come from them', async () => {
    h.analyzeImage.mockRejectedValue(new Error('down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const frozen = await analyzeVideoFrames(
      { ...SIGNALS, cuts: 0, staticPairs: 18, comparisons: 21 },
      'YouTube',
      false,
    );
    spy.mockRestore();
    const text = frozen.recommendations.join(' ');
    expect(text).toContain('18 of 21');
    expect(frozen.frameRepetitionCount).toBe(18);
  });
});

describe('unmeasuredVideo', () => {
  it('claims nothing when no frames were decoded', async () => {
    const out = unmeasuredVideo('YouTube', false, null);
    expect(out.measured).toBe(false);
    expect(out.resolution).toBe('Unknown');
    expect(out.compressionQuality).toBe('Unknown');
    expect(out.frameRepetitionCount).toBeNull();
    expect(out.visualHookScore).toBeNull();
    expect(out.shotVarietyScore).toBeNull();
    expect(out.onScreenText).toBeNull();
    expect(out.visualHookVerdict).toBeNull();
    expect(out.editingPacingScore).toBeNull();
    expect(out.cameraMovementRating).toContain('Not analyzed');
    expect(out.sceneTransitionRate).toContain('Not analyzed');
  });

  it('names the thumbnail stand-in instead of letting it read as editing', async () => {
    // This is the exact substitution that used to be invisible. It is allowed to
    // stay only because `basis` and `measured` say what it is.
    const out = unmeasuredVideo('YouTube', false, 74);
    expect(out.editingPacingScore).toBe(74);
    expect(out.measured).toBe(false);
    expect(out.basis).toContain('thumbnail composition');
    expect(out.basis).toContain('not an editing measurement');
  });

  it('tells the creator how to make the layer real', async () => {
    expect(unmeasuredVideo('YouTube', false, null).recommendations.join(' ')).toContain(
      'not analyzed rather than passed',
    );
    expect(unmeasuredVideo('TikTok', false, null).recommendations.join(' ')).toContain('9:16');
  });

  it('does not rate an AI-flagged upload as low visual-artifact risk', async () => {
    expect(unmeasuredVideo('YouTube', true, null).aiVisualArtifactRisk).toBe('Medium');
    expect(unmeasuredVideo('YouTube', false, null).aiVisualArtifactRisk).toBe('Low');
  });

  it('does not tell an AI-flagged creator their video is AI-generated', async () => {
    // Same line the authenticity layer holds: the flag came from the creator, and
    // the advice is about disclosure, never an accusation.
    const text = unmeasuredVideo('YouTube', true, null).recommendations.join(' ');
    expect(text).toContain('flagged as containing AI-generated visuals');
    expect(text).toContain('disclosure');
  });
});
