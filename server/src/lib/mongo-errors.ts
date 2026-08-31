/**
 * MongoDB signals a unique-index violation with error code 11000 and names the
 * index in `keyPattern`. Matching on the code rather than the message means this
 * keeps working when the driver changes its formatting.
 */
export function isDuplicateKey(err: unknown, field?: string): boolean {
  const e = err as {
    code?: unknown;
    keyPattern?: Record<string, unknown>;
  } | null;
  if (!e || e.code !== 11000) return false;
  return field === undefined || Object.hasOwn(e.keyPattern ?? {}, field);
}
