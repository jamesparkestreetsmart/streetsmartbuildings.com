/**
 * Sun position calculator and lux tier utilities.
 * Used by the manifest push route to compute exterior lighting schedules.
 */

/**
 * Compute the UTC-to-local offset in minutes for a given IANA timezone.
 * E.g. "America/Chicago" in CST → -360 (UTC is 6 hours ahead of CST).
 */
function getTimezoneOffsetMinutes(tz: string, date: Date): number {
  // Format both UTC and local as parseable strings
  const fmt = (timeZone: string) =>
    date.toLocaleString("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const utcStr = fmt("UTC");
  const localStr = fmt(tz);
  const utcMs = new Date(utcStr).getTime();
  const localMs = new Date(localStr).getTime();
  return Math.round((localMs - utcMs) / 60000);
}

/**
 * Calculate sunrise/sunset and civil twilight times from latitude/longitude.
 * Returns minutes from midnight in the site's local time.
 *
 * @param lat - latitude in degrees (positive north)
 * @param lng - longitude in degrees (positive east)
 * @param date - the date to calculate for
 * @param tz - IANA timezone string (e.g. "America/Chicago"). If omitted, uses
 *             the runtime's local timezone via Date.getTimezoneOffset().
 */
export function calculateSunTimes(
  lat: number,
  lng: number,
  date: Date = new Date(),
  tz?: string
): {
  sunrise: number | null;
  sunset: number | null;
  civilDawn: number | null;
  civilDusk: number | null;
} {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );

  // Solar declination
  const declination = toRad(
    -23.45 * Math.cos(toRad((360 / 365) * (dayOfYear + 10)))
  );

  // Hour angle for a given solar elevation
  function hourAngle(elevation: number): number | null {
    const elRad = toRad(elevation);
    const latRad = toRad(lat);
    const cosH =
      (Math.sin(elRad) - Math.sin(latRad) * Math.sin(declination)) /
      (Math.cos(latRad) * Math.cos(declination));
    if (cosH > 1 || cosH < -1) return null;
    return toDeg(Math.acos(cosH));
  }

  // Solar noon in UTC minutes (720 = noon UTC when lng=0)
  const solarNoonUTC = 720 - 4 * lng;

  // Convert UTC minutes to site-local minutes
  const utcToLocalOffset = tz
    ? getTimezoneOffsetMinutes(tz, date)
    : -date.getTimezoneOffset(); // getTimezoneOffset returns local→UTC, we want UTC→local
  const localNoon = solarNoonUTC + utcToLocalOffset;

  function getTime(elevation: number) {
    const ha = hourAngle(elevation);
    if (ha === null) return null;
    const offset = (ha / 360) * 1440;
    return {
      rise: Math.round(localNoon - offset),
      set: Math.round(localNoon + offset),
    };
  }

  const sunriseSet = getTime(-0.833); // accounts for atmospheric refraction
  const civilTwilight = getTime(-6);

  return {
    sunrise: sunriseSet?.rise ?? null,
    sunset: sunriseSet?.set ?? null,
    civilDawn: civilTwilight?.rise ?? null,
    civilDusk: civilTwilight?.set ?? null,
  };
}

/**
 * Lux sensitivity tiers — maps illuminance thresholds to time offsets.
 * Higher sensitivity = lights turn on earlier before sunset.
 */
export const LUX_TIERS = [
  { level: 1, name: "Very Late", onBelowLux: 50, offAboveLux: 100 },
  { level: 2, name: "Late", onBelowLux: 150, offAboveLux: 300 },
  { level: 3, name: "Default", onBelowLux: 400, offAboveLux: 800 },
  { level: 4, name: "Early", onBelowLux: 1000, offAboveLux: 1500 },
  { level: 5, name: "Very Early", onBelowLux: 2000, offAboveLux: 3000 },
] as const;

/**
 * Minutes offset from sunset (negative = before sunset, positive = after).
 * For sunrise/off, the sign is inverted (negative = after sunrise).
 */
const LUX_TIER_OFFSETS: Record<number, number> = {
  1: 30, // 30 min AFTER sunset
  2: 10, // 10 min after sunset
  3: 0, // At sunset
  4: -20, // 20 min before sunset
  5: -45, // 45 min before sunset
};

/**
 * Get the minutes offset from sunset/sunrise for a given lux tier level.
 */
export function luxTierTimeOffset(level: number): number {
  return LUX_TIER_OFFSETS[level] ?? 0;
}

/**
 * Compute exterior light ON/OFF times from sun times and a lux sensitivity level.
 * ON at sunset + offset, OFF at sunrise - offset.
 */
export function getExteriorLightTimes(
  sunTimes: { sunrise: number | null; sunset: number | null },
  luxSensitivity: number
): { onMins: number | null; offMins: number | null } {
  const offset = LUX_TIER_OFFSETS[luxSensitivity] ?? 0;
  return {
    onMins: sunTimes.sunset !== null ? sunTimes.sunset + offset : null,
    offMins: sunTimes.sunrise !== null ? sunTimes.sunrise - offset : null,
  };
}

/**
 * Convert minutes from midnight to "HH:MM:SS" string for manifest storage.
 */
export function minutesToTimeStr(mins: number): string {
  // Handle wrap-around (negative or > 1440)
  let m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:00`;
}
