import { checkOverrideExpiry } from "../override-expiry";

describe("checkOverrideExpiry", () => {
  const BASE_TIME = new Date("2026-04-05T12:00:00Z").getTime();

  function startedAtMinutesAgo(minutes: number): string {
    return new Date(BASE_TIME - minutes * 60_000).toISOString();
  }

  it("returns expired when overrideActive is false", () => {
    const result = checkOverrideExpiry(false, new Date().toISOString(), 15, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBe(Infinity);
  });

  it("returns expired when startedAt is null", () => {
    const result = checkOverrideExpiry(true, null, 15, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBe(Infinity);
  });

  it("returns expired when startedAt is an invalid date string", () => {
    const result = checkOverrideExpiry(true, "not-a-date", 15, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBe(Infinity);
  });

  it("returns expired when startedAt is 'NaN'", () => {
    const result = checkOverrideExpiry(true, "NaN", 15, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBe(Infinity);
  });

  it("returns not expired at 14.999 minutes elapsed", () => {
    const startedAt = startedAtMinutesAgo(14.999);
    const result = checkOverrideExpiry(true, startedAt, 15, BASE_TIME);
    expect(result.isExpired).toBe(false);
    expect(result.elapsedMinutes).toBeCloseTo(14.999, 2);
  });

  it("returns expired at exactly 15.000 minutes (>= not >)", () => {
    const startedAt = startedAtMinutesAgo(15);
    const result = checkOverrideExpiry(true, startedAt, 15, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBeCloseTo(15, 2);
  });

  it("returns expired at 15.001 minutes", () => {
    const startedAt = startedAtMinutesAgo(15.001);
    const result = checkOverrideExpiry(true, startedAt, 15, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBeCloseTo(15.001, 2);
  });

  it("returns not expired when just set (0 minutes elapsed)", () => {
    const startedAt = new Date(BASE_TIME).toISOString();
    const result = checkOverrideExpiry(true, startedAt, 15, BASE_TIME);
    expect(result.isExpired).toBe(false);
    expect(result.elapsedMinutes).toBeCloseTo(0, 2);
  });

  it("returns expired immediately when resetMinutes is 0", () => {
    const startedAt = new Date(BASE_TIME).toISOString();
    const result = checkOverrideExpiry(true, startedAt, 0, BASE_TIME);
    expect(result.isExpired).toBe(true);
    expect(result.elapsedMinutes).toBeCloseTo(0, 2);
  });
});
