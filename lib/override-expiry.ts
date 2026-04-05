export interface OverrideExpiryResult {
  isExpired: boolean;
  elapsedMinutes: number;
}

export function checkOverrideExpiry(
  overrideActive: boolean,
  startedAt: string | null,
  resetMinutes: number,
  nowMs: number = Date.now()
): OverrideExpiryResult {
  if (!overrideActive || !startedAt) {
    return { isExpired: true, elapsedMinutes: Infinity };
  }

  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) {
    return { isExpired: true, elapsedMinutes: Infinity };
  }

  const elapsedMinutes = (nowMs - startedMs) / 60_000;

  return {
    isExpired: elapsedMinutes >= resetMinutes,
    elapsedMinutes,
  };
}
