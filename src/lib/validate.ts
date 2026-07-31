/**
 * Zod-free input validation.
 *
 * Kept lightweight to avoid adding a runtime dep. Each helper returns
 * { ok: true, value } or { ok: false, error }. API routes should short-circuit
 * on !ok with a 400.
 */

export type ValidateResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function string(input: unknown, {
  min = 0, max = 20_000, field = 'value', trim = true,
}: { min?: number; max?: number; field?: string; trim?: boolean } = {}): ValidateResult<string> {
  if (typeof input !== 'string') return { ok: false, error: `${field} must be a string` };
  const value = trim ? input.trim() : input;
  if (value.length < min) return { ok: false, error: `${field} is too short (min ${min})` };
  if (value.length > max) return { ok: false, error: `${field} is too long (max ${max})` };
  return { ok: true, value };
}

export function enumOf<T extends string>(
  input: unknown,
  allowed: readonly T[],
  field = 'value',
): ValidateResult<T> {
  if (typeof input !== 'string') return { ok: false, error: `${field} must be a string` };
  if (!allowed.includes(input as T)) {
    return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}` };
  }
  return { ok: true, value: input as T };
}

export function integer(input: unknown, {
  min = 0, max = Number.MAX_SAFE_INTEGER, field = 'value',
}: { min?: number; max?: number; field?: string } = {}): ValidateResult<number> {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${field} must be an integer` };
  }
  if (n < min || n > max) return { ok: false, error: `${field} out of range` };
  return { ok: true, value: n };
}

export function boolean(input: unknown, field = 'value'): ValidateResult<boolean> {
  if (typeof input === 'boolean') return { ok: true, value: input };
  return { ok: false, error: `${field} must be a boolean` };
}

/** Hosts that resolve to the local network. Blocked to prevent SSRF. */
const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|.*\.local|.*\.internal)/i;

/**
 * Public https(s) URL. Rejects non-HTTP schemes (javascript:, data:, file:) and
 * private/loopback/link-local hosts so a user-supplied URL can never be used to
 * make the server fetch internal infrastructure (SSRF).
 */
export function url(input: unknown, {
  field = 'url', max = 2048, allowHttp = false,
}: { field?: string; max?: number; allowHttp?: boolean } = {}): ValidateResult<string> {
  const s = string(input, { field, max, min: 1 });
  if (!s.ok) return s;

  let parsed: URL;
  try {
    parsed = new URL(s.value);
  } catch {
    return { ok: false, error: `${field} must be a valid URL` };
  }

  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'https:' && !(allowHttp && scheme === 'http:')) {
    return { ok: false, error: `${field} must use https` };
  }
  if (PRIVATE_HOST.test(parsed.hostname)) {
    return { ok: false, error: `${field} must be a public address` };
  }
  return { ok: true, value: parsed.toString() };
}

/** Prisma cuid / cuid2 identifier. Guards id params before they reach the DB. */
export function id(input: unknown, field = 'id'): ValidateResult<string> {
  const s = string(input, { field, min: 1, max: 64 });
  if (!s.ok) return s;
  if (!/^[a-z0-9_-]{8,64}$/i.test(s.value)) {
    return { ok: false, error: `${field} is not a valid identifier` };
  }
  return { ok: true, value: s.value };
}

/** Applies an item validator across an array, with a hard length cap. */
export function arrayOf<T>(
  input: unknown,
  item: (value: unknown, index: number) => ValidateResult<T>,
  { max = 50, min = 0, field = 'value' }: { max?: number; min?: number; field?: string } = {},
): ValidateResult<T[]> {
  if (!Array.isArray(input)) return { ok: false, error: `${field} must be an array` };
  if (input.length < min) return { ok: false, error: `${field} needs at least ${min} item(s)` };
  if (input.length > max) return { ok: false, error: `${field} accepts at most ${max} items` };

  const out: T[] = [];
  for (let i = 0; i < input.length; i++) {
    const res = item(input[i], i);
    if (!res.ok) return { ok: false, error: `${field}[${i}]: ${res.error}` };
    out.push(res.value);
  }
  return { ok: true, value: out };
}

/**
 * Parses a JSON request body with a size ceiling. Returns a plain object or an
 * error — never throws, so routes cannot 500 on malformed input.
 */
export async function jsonBody(
  req: Request,
  { maxBytes = 1_000_000 }: { maxBytes?: number } = {},
): Promise<ValidateResult<Record<string, unknown>>> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, error: 'Request body is too large' };
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, error: 'Could not read request body' };
  }
  if (raw.length > maxBytes) return { ok: false, error: 'Request body is too large' };
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Request body must be a JSON object' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Request body must be valid JSON' };
  }
}
