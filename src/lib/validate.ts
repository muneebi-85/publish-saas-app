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
  // Only genuine JSON numbers and their string spellings pass. The previous
  // `Number(input)` coercion let `null`, `''`, `true`, `[]` and `['5']` all
  // validate as 0/1/5 — a missing field silently becoming `0` is exactly the
  // wrong direction at the boundary this module exists to guard.
  let n: number;
  if (typeof input === 'number') {
    n = input;
  } else if (typeof input === 'string' && input.trim() !== '' && /^-?\d+$/.test(input.trim())) {
    n = Number(input);
  } else {
    return { ok: false, error: `${field} must be an integer` };
  }
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

/**
 * Hosts that resolve to the local network. Blocked to prevent SSRF.
 *
 * The IPv4 ranges are matched literally. Every bracketed IPv6 literal is
 * blocked wholesale: WHATWG URLs bracket IPv6 hostnames, and covering
 * mapped-loopback (`[::ffff:127.0.0.1]`), link-local (`fe80::`), and
 * unique-local (`fd00::`) one pattern at a time has already missed forms — a
 * legitimate upload/thumbnail URL is always a hostname (S3/R2/CDN), never a
 * bare IPv6 literal, so denying the whole family is the safe default.
 *
 * What this CANNOT catch: a public hostname whose DNS rebinds to a private
 * address at fetch time. Resolution-based blocking is out of reach for a
 * lexical guard; today these URLs are fetched by NVIDIA/Deepgram, not by us,
 * so the guard is defense-in-depth for the day that changes.
 */
const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[|.*\.local|.*\.internal)/i;

/**
 * Numeric IPv4 encodings the dotted-decimal regex cannot see: whole-address
 * decimal (`2130706433` = 127.0.0.1), hex (`0x7f000001`, `0x7f.0.0.1`), and
 * octal parts (`0177.0.0.1`). Fetch stacks accept all of them, and the URL
 * parser normalizes none — `hostname` keeps the literal — so they need their
 * own shape checks. Still lexical (DNS rebinding is documented as out of scope
 * above), but now covering every encoding a localhost-equivalent can arrive in.
 */
function isPrivateHost(hostname: string): boolean {
  if (PRIVATE_HOST.test(hostname)) return true;
  const parts = hostname.split('.');
  // Octal dotted form: any part with a leading zero and a second digit (0177).
  if (parts.every((p) => /^0\d+$|^\d+$/.test(p)) && parts.some((p) => /^0\d+$/.test(p))) {
    return true;
  }
  // Hex dotted form: every part hex (0x7f.0.0.1). Rare but accepted by libc.
  if (parts.length === 4 && parts.every((p) => /^0x[0-9a-f]+$|^0+$|^\d{1,3}$/.test(p)) && parts.some((p) => /^0x/i.test(p))) {
    return true;
  }
  // Whole-address forms: pure decimal integer or 0x hex.
  const whole = /^(\d{8,}|0x[0-9a-f]{7,8})$/i.exec(hostname);
  if (whole) {
    const n = hostname.toLowerCase().startsWith('0x')
      ? parseInt(hostname.slice(2), 16)
      : Number(hostname);
    if (Number.isSafeInteger(n)) {
      // eslint-disable-next-line no-bitwise
      const a = (n >>> 24) & 0xff, b = (n >>> 16) & 0xff;
      if (
        a === 127 || a === 10 || a === 0 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) return true;
    }
  }
  return false;
}

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
  if (isPrivateHost(parsed.hostname)) {
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
  // Measure BYTES, not UTF-16 code units: `raw.length` under-counts astral
  // text (emoji, CJK extensions) by ~half and by up to 4× for the 4-byte
  // sequences — a "200 KB cap" silently admitting up to ~800 KB. The
  // content-length pre-check above already covers honest clients; this is the
  // authoritative bound for everything else, including chunked requests.
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return { ok: false, error: 'Request body is too large' };
  }
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

/**
 * A deliberately permissive email check, normalised for storage.
 *
 * The only address format that can be verified is one that accepts mail, so this
 * rejects what is definitely not an address — no `@`, nothing on either side of
 * it, whitespace, a dot-less or trailing-dot domain — and lets everything else
 * through. Confirmation is what establishes deliverability; a stricter regex here
 * would only turn valid but unusual addresses into a form that refuses to submit.
 *
 * The returned value is trimmed and lower-cased so `A@B.com ` and `a@b.com`
 * resolve to one row behind a unique index.
 */
export function email(input: unknown, field = 'email'): ValidateResult<string> {
  const str = string(input, { min: 3, max: 254, field });
  if (!str.ok) return str;

  const value = str.value.toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) {
    return { ok: false, error: `${field} must look like name@example.com` };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: `${field} cannot contain spaces` };
  }
  const domain = value.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return { ok: false, error: `${field} must look like name@example.com` };
  }
  return { ok: true, value };
}
