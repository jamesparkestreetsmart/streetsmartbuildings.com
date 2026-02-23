/**
 * Unified weather service — single source of truth for all weather data.
 * Drives: site page display, exterior lighting lux decisions,
 * Smart Start HVAC pre-conditioning, thermostat state enrichment.
 */

import { calculateSunTimes } from "./sun-calc";

// ─── Types ─────────────────────────────────────────────────────────────

export interface WeatherData {
  temperature: number; // °F
  feels_like: number; // °F
  humidity: number; // %
  cloud_cover: number; // 0-100%
  precipitation: number; // mm
  uv_index: number;
  wind_speed: number; // mph
  wind_direction: number; // degrees
  condition: string; // 'clear', 'cloudy', 'rain', etc.
  lux_estimate: number; // estimated ambient lux
  sun_elevation: number; // degrees above horizon
  visibility: number; // meters
  forecast: any; // raw hourly forecast data
}

// ─── Fetch from Open-Meteo ─────────────────────────────────────────────

export async function fetchWeather(
  lat: number,
  lng: number
): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
    `cloud_cover,precipitation,uv_index,wind_speed_10m,wind_direction_10m,` +
    `visibility,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph` +
    `&forecast_days=1&hourly=temperature_2m,cloud_cover,uv_index`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API HTTP ${res.status}`);
  const data = await res.json();
  const c = data.current;

  const sunElev = calculateSunElevation(lat, lng);
  const luxEst = estimateLux(c.cloud_cover, c.uv_index || 0, sunElev);

  return {
    temperature: c.temperature_2m,
    feels_like: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    cloud_cover: c.cloud_cover,
    precipitation: c.precipitation,
    uv_index: c.uv_index || 0,
    wind_speed: c.wind_speed_10m,
    wind_direction: c.wind_direction_10m,
    condition: weatherCodeToCondition(c.weather_code),
    lux_estimate: luxEst,
    sun_elevation: sunElev,
    visibility: c.visibility || 10000,
    forecast: data.hourly || null,
  };
}

// ─── Lux Estimation ────────────────────────────────────────────────────
// Combines sun position, cloud cover, and UV index to estimate ambient lux

export function estimateLux(
  cloudCover: number, // 0-100
  uvIndex: number, // 0-11+
  sunElevation: number // degrees, negative = below horizon
): number {
  // Below horizon -> very low lux
  if (sunElevation < -6) return 0; // astronomical twilight
  if (sunElevation < -0.833) {
    // Civil twilight zone (-6 to -0.833)
    // Interpolate 0 -> 400 lux
    const t = (sunElevation + 6) / 5.167; // 0 at -6deg, 1 at -0.833deg
    return Math.round(t * 400);
  }

  // Sun above horizon
  // Base lux from sun elevation (clear sky)
  let baseLux: number;
  if (sunElevation < 10) {
    baseLux = 400 + (sunElevation / 10) * 9600; // 400 -> 10,000
  } else if (sunElevation < 30) {
    baseLux = 10000 + ((sunElevation - 10) / 20) * 40000; // 10k -> 50k
  } else {
    baseLux = 50000 + ((sunElevation - 30) / 60) * 70000; // 50k -> 120k
  }

  // Cloud cover modifier: 0% clouds = 1.0x, 50% = 0.55x, 100% = 0.1x
  const cloudFactor = 1.0 - (cloudCover / 100) * 0.9;

  // UV correlation — validates our estimate
  // UV 0 in daytime suggests very heavy overcast
  if (sunElevation > 5 && uvIndex === 0) {
    return Math.round(baseLux * 0.05); // extremely overcast
  }

  return Math.round(baseLux * cloudFactor);
}

// ─── Sun Elevation ─────────────────────────────────────────────────────
// Current sun angle above horizon

export function calculateSunElevation(lat: number, lng: number): number {
  const now = new Date();
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
  );

  const declination = toRad(
    -23.45 * Math.cos(toRad((360 / 365) * (dayOfYear + 10)))
  );

  // Hour angle
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const solarTime = utcHours + lng / 15;
  const hourAngle = toRad((solarTime - 12) * 15);

  const latRad = toRad(lat);
  const elevation = toDeg(
    Math.asin(
      Math.sin(latRad) * Math.sin(declination) +
        Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle)
    )
  );

  return Math.round(elevation * 10) / 10;
}

// ─── Weather Code -> Condition ──────────────────────────────────────────

function weatherCodeToCondition(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "partly_cloudy";
  if (code <= 49) return "foggy";
  if (code <= 59) return "drizzle";
  if (code <= 69) return "rain";
  if (code <= 79) return "snow";
  if (code <= 82) return "rain_heavy";
  if (code <= 86) return "snow_heavy";
  if (code <= 99) return "thunderstorm";
  return "unknown";
}

// ─── Persist to log_weathers ───────────────────────────────────────────

export async function persistWeather(
  supabase: any,
  siteId: string,
  orgId: string,
  data: WeatherData
) {
  return supabase.from("log_weathers").insert({
    site_id: siteId,
    org_id: orgId,
    temperature: data.temperature,
    feels_like: data.feels_like,
    humidity: data.humidity,
    cloud_cover: data.cloud_cover,
    precipitation: data.precipitation,
    uv_index: data.uv_index,
    wind_speed: data.wind_speed,
    wind_direction: data.wind_direction,
    condition: data.condition,
    lux_estimate: data.lux_estimate,
    sun_elevation: data.sun_elevation,
    visibility: data.visibility,
    forecast: data.forecast,
    source: "open-meteo",
    recorded_at: new Date().toISOString(),
  });
}

// ─── Get latest weather for a site ─────────────────────────────────────

export async function getLatestWeather(supabase: any, siteId: string) {
  const { data } = await supabase
    .from("log_weathers")
    .select("*")
    .eq("site_id", siteId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ─── Check if weather data is stale ────────────────────────────────────

export function isWeatherStale(
  recordedAt: string | null,
  maxAgeMinutes: number = 30
): boolean {
  if (!recordedAt) return true;
  const age = Date.now() - new Date(recordedAt).getTime();
  return age > maxAgeMinutes * 60 * 1000;
}
