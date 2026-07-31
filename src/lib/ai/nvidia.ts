/**
 * NVIDIA NIM client.
 *
 * Wraps the OpenAI-compatible chat/completions endpoint that NVIDIA hosts at
 * `integrate.api.nvidia.com/v1`. We deliberately avoid pulling in the OpenAI SDK
 * so the dependency surface stays tiny and swappable.
 *
 * Key design choices:
 * - Every call has a hard timeout (default 60s) so the analysis pipeline never hangs.
 * - Structured-JSON calls retry once with a "you produced invalid JSON, fix it" turn.
 * - Transient failures (429 / 5xx / network) retry with backoff before giving up.
 * - A failed call returns `null` rather than throwing. The caller decides how to
 *   degrade — and every engine's fallback is explicitly labelled as unmeasured so
 *   the UI never presents an inferred number as a measured one.
 */

import { env, hasLiveModel } from '../env';
import { NIM_MODELS, NimModelKind } from './models';

// ─── Types ─────────────────────────────────────────────
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatOptions {
  model?: NimModelKind;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeoutMs?: number;
  stream?: false;
  responseFormat?: 'text' | 'json';
}

interface ChatCompletionResponse {
  choices: {
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  usage?: { prompt_tokens: number; total_tokens: number };
}

// ─── Chat completion ───────────────────────────────────
/** Status codes worth retrying: rate limits and transient upstream faults. */
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function backoffMs(attempt: number): number {
  // 400ms, 1200ms — deterministic (no jitter) so behaviour is reproducible.
  return 400 * Math.pow(3, attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string | null> {
  if (!hasLiveModel()) return null;

  const modelKind = opts.model ?? 'reasoning';
  const model = NIM_MODELS[modelKind];
  const timeoutMs = opts.timeoutMs ?? 60_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${env.NVIDIA_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.4,
          top_p: opts.topP ?? 0.95,
          max_tokens: opts.maxTokens ?? 1024,
          stream: false,
          ...(opts.responseFormat === 'json'
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        // Never log the response body verbatim at info level — it can echo the
        // prompt. Truncate, and keep the status/model for triage.
        console.error(
          `[NIM] ${res.status} ${model} (attempt ${attempt}/${MAX_ATTEMPTS}): ${errText.slice(0, 300)}`,
        );
        if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return null;
      }

      const data = (await res.json()) as ChatCompletionResponse;
      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      const isTimeout = (err as Error).name === 'AbortError';
      console.error(
        isTimeout
          ? `[NIM] Timed out after ${timeoutMs}ms on ${model} (attempt ${attempt}/${MAX_ATTEMPTS})`
          : `[NIM] Request failed on ${model} (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error).message}`,
      );
      // A timeout already consumed the budget; retrying would double the wait
      // on a route that has its own deadline. Only retry true network errors.
      if (!isTimeout && attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

// ─── JSON-shaped generation with one auto-repair retry ─
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  opts: Omit<ChatOptions, 'responseFormat'> = {},
): Promise<T | null> {
  const raw = await chat(messages, { ...opts, responseFormat: 'json' });
  if (!raw) return null;

  const parsed = safeParse<T>(raw);
  if (parsed) return parsed;

  // One repair attempt — cheap; catches "```json ... ```" wrappers etc.
  const repair = await chat(
    [
      ...messages,
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          'That response could not be parsed as JSON. Reply with the corrected JSON object only, no code fences, no prose.',
      },
    ],
    { ...opts, responseFormat: 'json', temperature: 0 },
  );

  return repair ? safeParse<T>(repair) : null;
}

function safeParse<T>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Rescue: extract first {...} block.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

// ─── Vision helper: pass an image URL or base64 data URI ─
export async function analyzeImage(
  imageUrl: string,
  prompt: string,
  opts: Omit<ChatOptions, 'model'> = {},
): Promise<string | null> {
  return chat(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    { ...opts, model: 'vision', maxTokens: opts.maxTokens ?? 800 },
  );
}

// ─── Embeddings ────────────────────────────────────────
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!hasLiveModel()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${env.NVIDIA_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NIM_MODELS.embed,
        input: texts,
        input_type: 'query',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[NIM] embeddings ${res.status}`);
      return null;
    }
    const data = (await res.json()) as EmbeddingResponse;
    return data.data.map((d) => d.embedding);
  } catch (err) {
    console.error('[NIM] embeddings failed:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
