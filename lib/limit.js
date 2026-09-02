/**
 * Parse and clamp limit query param.
 * Rules: default 20, min 1, max 100, invalid -> 20
 */
export function parseLimit(value) {
  const DEFAULT = 20;
  const MIN = 1;
  const MAX = 100;

  if (value === undefined || value === null || value === "") return DEFAULT;

  // allow array (e.g., ?limit=20&limit=30) -> take first
  if (Array.isArray(value)) value = value[0];

  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return DEFAULT;
  if (n < MIN || n > MAX) {
    // invalid above max or below min -> fallback to default per spec
    // spec says invalid values should fall back safely to default
    // values above 100 should also fallback? Requirement: Maximum 100, invalid -> default.
    // We'll treat out-of-range as fallback to default to satisfy "invalid values above 100"
    // Alternatively clamp: but spec says fallback. So we fallback.
    return DEFAULT;
  }
  return n;
}

export const LIMIT_DEFAULT = 20;
export const LIMIT_MIN = 1;
export const LIMIT_MAX = 100;
