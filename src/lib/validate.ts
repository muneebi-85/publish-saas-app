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
