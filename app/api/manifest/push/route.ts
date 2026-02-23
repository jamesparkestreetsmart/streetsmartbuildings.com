// app/api/manifest/push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  calculateSunTimes,
  getExteriorLightTimes,
  minutesToTimeStr,
} from "@/lib/sun-calc";
import {
  fetchWeather,
  persistWeather,
  getLatestWeather,
  isWeatherStale,
} from "@/lib/weather";
import {
  calculateSmartStart,
  persistSmartStartCalc,
} from "@/lib/smart-start";
import { resolveZoneSetpointsSync } from "@/lib/setpoint-resolver";
import { executePushForSite } from "@/lib/ha-push";

async function getCallerEmail(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.email || "system";
  } catch { return "system"; }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function timeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export async function POST(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { site_id, date } = body;

    if (!site_id) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
    }

    console.log("[manifest/push] Starting for site_id:", site_id, "date:", date, "caller:", callerEmail);

    // 1. Get site info including geo and config columns
    let site: any = null;
    {
      const { data: siteFull, error: siteErr } = await supabase
        .from("a_sites")
        .select("timezone, org_id, latitude, longitude, default_lux_sensitivity, employee_pre_open_minutes, customer_pre_open_minutes, post_close_minutes, city")
        .eq("site_id", site_id)
        .single();

      console.log("[manifest/push] Step 1 - site:", siteFull, "error:", siteErr?.message, "details:", siteErr?.details);

      if (siteErr) {
        // New columns may not exist — try with just the original columns
        console.log("[manifest/push] Site query failed — trying without new columns");
        const { data: siteBasic, error: siteBasicErr } = await supabase
          .from("a_sites")
          .select("timezone, org_id, city")
          .eq("site_id", site_id)
          .single();
        console.log("[manifest/push] Site basic query:", siteBasic, "error:", siteBasicErr?.message);
        site = siteBasic;
      } else {
        site = siteFull;
      }
    }

    const tz = site?.timezone || "America/Chicago";
    let siteLat: number | null = site?.latitude ?? null;
    let siteLng: number | null = site?.longitude ?? null;
    const defaultLuxSensitivity: number = site?.default_lux_sensitivity ?? 3;
    const employeePreOpenMinutes: number = site?.employee_pre_open_minutes ?? 30;
    const customerPreOpenMinutes: number = site?.customer_pre_open_minutes ?? 0;
    const postCloseMinutes: number = site?.post_close_minutes ?? 0;

    // 1b. Geocoding fallback if lat/lng missing
    if ((siteLat === null || siteLng === null) && site?.city) {
      try {
        const geoResponse = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            site.city
          )}&count=1&language=en&format=json`
        );
        const geoData = await geoResponse.json();
        const lat = geoData.results?.[0]?.latitude;
        const lon = geoData.results?.[0]?.longitude;
        if (lat && lon) {
          siteLat = lat;
          siteLng = lon;
          // Persist back to a_sites
          await supabase
            .from("a_sites")
            .update({ latitude: lat, longitude: lon })
            .eq("site_id", site_id);
          console.log("[manifest/push] Geocoded lat/lng:", lat, lon);
        }
      } catch (geoErr) {
        console.error("[manifest/push] Geocoding failed:", geoErr);
      }
    }

    const targetDate =
      date ||
      new Date().toLocaleDateString("en-CA", { timeZone: tz });

    // 2. Determine day of week
    const [y, m, d] = targetDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dayOfWeek = DAY_NAMES[dt.getDay()];

    console.log("[manifest/push] Step 2 - targetDate:", targetDate, "dayOfWeek:", dayOfWeek);

    // 3. Get base store hours for this day of week
    const { data: baseHours, error: baseErr } = await supabase
      .from("b_store_hours")
      .select("open_time, close_time, is_closed")
      .eq("site_id", site_id)
      .eq("day_of_week", dayOfWeek)
      .single();

    console.log("[manifest/push] Step 3 - baseHours:", baseHours, "error:", baseErr);

    let openTime: string | null = baseHours?.open_time || null;
    let closeTime: string | null = baseHours?.close_time || null;
    let isClosed: boolean = baseHours?.is_closed || false;

    // 4. Check for exception events on this date (overrides base hours)
    const { data: events, error: eventsErr } = await supabase
      .from("b_store_hours_events")
      .select("event_id, rule_id, event_date")
      .eq("site_id", site_id)
      .eq("event_date", targetDate);

    console.log("[manifest/push] Step 4 - events:", events?.length, "error:", eventsErr);

    if (events && events.length > 0) {
      const ruleId = events[0].rule_id;
      const { data: rule } = await supabase
        .from("b_store_hours_exception_rules")
        .select("*")
        .eq("rule_id", ruleId)
        .single();

      if (rule) {
        if (rule.rule_type === "date_range_daily") {
          if (targetDate === rule.effective_from_date) {
            openTime = rule.start_day_open;
            closeTime = rule.start_day_close;
            isClosed = false;
          } else if (targetDate === rule.effective_to_date) {
            openTime = rule.end_day_open;
            closeTime = rule.end_day_close;
            isClosed = false;
          } else {
            openTime = rule.middle_days_open;
            closeTime = rule.middle_days_close;
            isClosed = rule.middle_days_closed || false;
          }
        } else {
          isClosed = rule.is_closed ?? isClosed;
          openTime = rule.is_closed ? null : (rule.open_time ?? openTime);
          closeTime = rule.is_closed ? null : (rule.close_time ?? closeTime);
        }
      }
    }

    console.log("[manifest/push] Resolved hours - open:", openTime, "close:", closeTime, "closed:", isClosed);

    // 4b. Compute sun times if we have coordinates
    let sunTimesData: {
      sunrise: number | null;
      sunset: number | null;
      civil_dawn: number | null;
      civil_dusk: number | null;
    } | null = null;

    if (siteLat !== null && siteLng !== null) {
      const sunResult = calculateSunTimes(siteLat, siteLng, dt, tz);
      sunTimesData = {
        sunrise: sunResult.sunrise,
        sunset: sunResult.sunset,
        civil_dawn: sunResult.civilDawn,
        civil_dusk: sunResult.civilDusk,
      };
      console.log("[manifest/push] Sun times:", sunTimesData);
    }

    // 5. Build thermostat entries
    let thermostats: any[] = [];
    try {
      thermostats = await buildThermostats(site_id, isClosed, openTime, closeTime);
      console.log("[manifest/push] Step 5 - thermostats:", thermostats.length);
    } catch (e: any) {
      console.error("[manifest/push] Step 5 FAILED:", e.message);
    }

    // 5b. Generate directives for each thermostat
    try {
      const openMins = timeToMinutes(openTime);
      const closeMins = timeToMinutes(closeTime);
      // Determine current time in site timezone
      const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz });
      const nowDate = new Date(nowInTz);
      const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

      const isOccupied = !isClosed && openMins !== null && closeMins !== null && currentMins >= openMins && currentMins < closeMins;

      for (const thermo of thermostats) {
        // Get current thermostat state — try entity_id first, then ha_device_id
        const entityId = thermo.entity_id;
        const haDeviceId = thermo.ha_device_id;
        if (!entityId && !haDeviceId) continue;

        // b_thermostat_state may be keyed by entity_id or ha_device_id — try both
        let thermoState: any = null;
        if (entityId) {
          const { data: s1 } = await supabase
            .from("b_thermostat_state")
            .select("current_temperature_f, ha_device_id, current_setpoint_f, target_temp_f")
            .eq("site_id", site_id)
            .eq("entity_id", entityId)
            .maybeSingle();
          thermoState = s1;
        }
        if (!thermoState && haDeviceId) {
          const { data: s2 } = await supabase
            .from("b_thermostat_state")
            .select("current_temperature_f, ha_device_id, current_setpoint_f, target_temp_f")
            .eq("site_id", site_id)
            .eq("ha_device_id", haDeviceId)
            .maybeSingle();
          thermoState = s2;
        }

        let directive: string;
        const hasZone = !!thermo.hvac_zone_id;
        if (!hasZone) {
          directive = "No zone assigned";
        } else {
          const currentTemp = thermoState?.current_temperature_f;
          const phase = isOccupied ? "occupied" : "unoccupied";
          const heatSp = isOccupied ? thermo.occupied.heat_setpoint : thermo.unoccupied.heat_setpoint;
          const coolSp = isOccupied ? thermo.occupied.cool_setpoint : thermo.unoccupied.cool_setpoint;
          const modeLabel = isOccupied ? "occupied mode" : "unoccupied mode";
          const guardrailMin = thermo.guardrails?.min_f ?? 45;
          const guardrailMax = thermo.guardrails?.max_f ?? 95;
          const mgrOffsetUp = thermo.manager_override?.offset_up_f ?? 4;
          const mgrOffsetDown = thermo.manager_override?.offset_down_f ?? 4;

          // Guardrail checks take priority
          if (currentTemp != null && currentTemp <= guardrailMin) {
            directive = `\u26a0 GUARDRAIL: Force heat ON (pipe protection) \u2014 ${currentTemp}\u00b0F <= ${guardrailMin}\u00b0F`;
          } else if (currentTemp != null && currentTemp >= guardrailMax) {
            directive = `\u26a0 GUARDRAIL: Force cool ON (equipment protection) \u2014 ${currentTemp}\u00b0F >= ${guardrailMax}\u00b0F`;
          } else if (isOccupied && currentTemp != null && thermoState) {
            // Manager override detection (occupied hours only)
            const actualSetpoint = thermoState.current_setpoint_f ?? thermoState.target_temp_f;
            if (actualSetpoint != null) {
              const diffFromHeat = actualSetpoint - heatSp;
              const diffFromCool = actualSetpoint - coolSp;
              // Check if setpoint is outside profile range but within manager offset
              if (actualSetpoint > coolSp && (actualSetpoint - coolSp) <= mgrOffsetUp) {
                directive = `Manager override active: ${actualSetpoint}\u00b0F (profile: ${coolSp}\u00b0F)`;
              } else if (actualSetpoint < heatSp && (heatSp - actualSetpoint) <= mgrOffsetDown) {
                directive = `Manager override active: ${actualSetpoint}\u00b0F (profile: ${heatSp}\u00b0F)`;
              } else if (actualSetpoint > coolSp + mgrOffsetUp) {
                directive = `\u26a0 Override exceeded: push to ${coolSp + mgrOffsetUp}\u00b0F (max allowed)`;
              } else if (actualSetpoint < heatSp - mgrOffsetDown) {
                directive = `\u26a0 Override exceeded: push to ${heatSp - mgrOffsetDown}\u00b0F (min allowed)`;
              } else if (currentTemp < heatSp) {
                directive = `Set heat to ${heatSp}\u00b0F (${modeLabel})`;
              } else if (currentTemp > coolSp) {
                directive = `Set cool to ${coolSp}\u00b0F (${modeLabel})`;
              } else {
                directive = "In range \u2014 no action needed";
              }
            } else if (currentTemp < heatSp) {
              directive = `Set heat to ${heatSp}\u00b0F (${modeLabel})`;
            } else if (currentTemp > coolSp) {
              directive = `Set cool to ${coolSp}\u00b0F (${modeLabel})`;
            } else {
              directive = "In range \u2014 no action needed";
            }
          } else if (currentTemp == null) {
            directive = `Set to ${phase}: ${heatSp}\u00b0\u2013${coolSp}\u00b0F`;
          } else if (currentTemp < heatSp) {
            directive = `Set heat to ${heatSp}\u00b0F (${modeLabel})`;
          } else if (currentTemp > coolSp) {
            directive = `Set cool to ${coolSp}\u00b0F (${modeLabel})`;
          } else {
            directive = "In range \u2014 no action needed";
          }
        }

        thermo.directive = directive;

        // Write directive to b_thermostat_state — but ONLY if the thermostat has a zone.
        // "No zone assigned" should NOT be persisted; it would clobber a valid directive
        // set by a previous manifest push or thermostat push.
        if (hasZone) {
          if (entityId) {
            await supabase
              .from("b_thermostat_state")
              .update({
                eagle_eye_directive: directive,
                directive_generated_at: new Date().toISOString(),
              })
              .eq("entity_id", entityId)
              .eq("site_id", site_id);
          } else if (thermoState?.ha_device_id) {
            await supabase
              .from("b_thermostat_state")
              .update({
                eagle_eye_directive: directive,
                directive_generated_at: new Date().toISOString(),
              })
              .eq("ha_device_id", thermoState.ha_device_id)
              .eq("site_id", site_id);
          }
        }
      }
      console.log("[manifest/push] Directives generated for", thermostats.length, "thermostats");
    } catch (dirErr: any) {
      console.error("[manifest/push] Directive generation error:", dirErr.message);
    }

    // 5c. Trigger HA push if configured (direct call, no HTTP roundtrip)
    let haPushResult: any = null;
    try {
      const haUrl = process.env.HA_URL;
      const haToken = process.env.HA_LONG_LIVED_TOKEN;
      if (haUrl && haToken) {
        haPushResult = await executePushForSite(supabase, site_id, "manifest_push", undefined, callerEmail);
        console.log("[manifest/push] HA push result:", JSON.stringify(haPushResult));
      } else {
        console.log("[manifest/push] HA push skipped — connection not configured");
      }
    } catch (haPushErr: any) {
      console.error("[manifest/push] HA push failed:", haPushErr.message);
      // Don't fail the manifest push if HA push fails
    }

    // 6. Build equipment entries (now split into interior/exterior)
    let interiorLighting: any[] = [];
    let exteriorLighting: any[] = [];
    let equipment: any[] = [];
    try {
      const result = await buildEquipment(
        site_id,
        isClosed,
        openTime,
        closeTime,
        sunTimesData,
        defaultLuxSensitivity,
        employeePreOpenMinutes,
        customerPreOpenMinutes,
        postCloseMinutes
      );
      interiorLighting = result.interior;
      exteriorLighting = result.exterior;
      equipment = result.equipment;
      console.log(
        "[manifest/push] Step 6 - interior:", interiorLighting.length,
        "exterior:", exteriorLighting.length,
        "equipment (compat):", equipment.length
      );
    } catch (e: any) {
      console.error("[manifest/push] Step 6 FAILED:", e.message);
    }

    // 6b. Weather — fetch or use cached
    let weatherData: any = null;
    if (siteLat !== null && siteLng !== null) {
      try {
        const cached = await getLatestWeather(supabase, site_id);
        if (cached && !isWeatherStale(cached.recorded_at, 30)) {
          weatherData = cached;
          console.log("[manifest/push] Using cached weather, lux:", cached.lux_estimate);
        } else {
          const fresh = await fetchWeather(siteLat, siteLng);
          await persistWeather(supabase, site_id, site?.org_id, fresh);
          weatherData = fresh;
          console.log("[manifest/push] Fetched fresh weather, lux:", fresh.lux_estimate);
        }
      } catch (weatherErr: any) {
        console.error("[manifest/push] Weather fetch failed:", weatherErr.message);
      }
    }

    // 6b2. Push outdoor temp to thermostat state BEFORE Smart Start calc
    if (weatherData) {
      const outdoorTemp = weatherData.temperature;
      const feelsLike = weatherData.feels_like;
      if (outdoorTemp !== undefined) {
        await supabase
          .from("b_thermostat_state")
          .update({
            outdoor_temp_f: outdoorTemp,
            feels_like_outdoor_f: feelsLike,
          })
          .eq("site_id", site_id);
        console.log("[manifest/push] Updated b_thermostat_state outdoor_temp_f:", outdoorTemp);
      }
    }

    // 6c. Smart Start — calculate for each enabled thermostat
    const openMinsForSS = timeToMinutes(openTime);
    if (openMinsForSS !== null && !isClosed) {
      for (const thermo of thermostats) {
        if (!thermo.smart_start_enabled) continue;
        try {
          // Look up the device and zone for this thermostat
          const { data: devInfo } = await supabase
            .from("a_devices")
            .select("device_id, equipment_id")
            .eq("site_id", site_id)
            .eq("device_role", "thermostat")
            .ilike("device_name", thermo.device_name)
            .limit(1)
            .single();

          if (!devInfo) continue;

          const { data: zoneInfo } = await supabase
            .from("a_hvac_zones")
            .select("hvac_zone_id")
            .eq("equipment_id", devInfo.equipment_id)
            .limit(1)
            .single();

          const calc = await calculateSmartStart(
            supabase,
            site_id,
            devInfo.device_id,
            zoneInfo?.hvac_zone_id || null,
            openMinsForSS,
            thermo.occupied.heat_setpoint,
            thermo.occupied.cool_setpoint
          );

          // Persist the calculation
          await persistSmartStartCalc(
            supabase,
            site_id,
            devInfo.device_id,
            zoneInfo?.hvac_zone_id || null,
            openTime!,
            calc
          );

          // Attach to thermostat entry in manifest
          thermo.smart_start_calc = calc;
          thermo.smart_start_offset_minutes = calc.final_offset_minutes;

          console.log("[manifest/push] Smart Start calc for", thermo.device_name, ":", calc.final_offset_minutes, "min, confidence:", calc.confidence);
        } catch (ssErr: any) {
          console.error("[manifest/push] Smart Start calc failed for", thermo.device_name, ":", ssErr.message);
        }
      }
    }

    // 7. Assemble manifest
    const manifest: Record<string, any> = {
      generated_at: new Date().toISOString(),
      store_hours: {
        open: openTime,
        close: closeTime,
        is_closed: isClosed,
      },
      thermostats,
      equipment, // backward compat — all non-always-on, non-hvac equipment
      interior_lighting: interiorLighting,
      exterior_lighting: exteriorLighting,
    };

    // Add HA push results to manifest if available
    if (haPushResult) {
      manifest.ha_push = {
        ha_connected: haPushResult.ha_connected,
        trigger: haPushResult.trigger,
        results: haPushResult.results,
      };
    }

    // Add sun times and site config if we have coordinates
    if (sunTimesData) {
      manifest.sun_times = sunTimesData;
    }
    if (siteLat !== null && siteLng !== null) {
      manifest.site_config = {
        default_lux_sensitivity: defaultLuxSensitivity,
        employee_pre_open_minutes: employeePreOpenMinutes,
        customer_pre_open_minutes: customerPreOpenMinutes,
        post_close_minutes: postCloseMinutes,
        lat: siteLat,
        lng: siteLng,
      };
    }

    // Add weather snapshot to manifest
    if (weatherData) {
      manifest.weather = {
        temperature: weatherData.temperature,
        feels_like: weatherData.feels_like,
        humidity: weatherData.humidity,
        cloud_cover: weatherData.cloud_cover,
        condition: weatherData.condition,
        lux_estimate: weatherData.lux_estimate,
        sun_elevation: weatherData.sun_elevation,
        wind_speed: weatherData.wind_speed,
        recorded_at: weatherData.recorded_at || new Date().toISOString(),
      };
    }

    // 8. Upsert into b_store_hours_manifests
    // First check if row exists
    const { data: existing } = await supabase
      .from("b_store_hours_manifests")
      .select("manifest_date")
      .eq("site_id", site_id)
      .eq("manifest_date", targetDate)
      .maybeSingle();

    console.log("[manifest/push] Step 8 - existing row:", !!existing);

    // Build a human-readable manifest name
    const manifestName = `Daily Schedule – ${dt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`;

    let upsertError: any = null;
    if (existing) {
      const { error } = await supabase
        .from("b_store_hours_manifests")
        .update({
          manifest_name: manifestName,
          open_time: openTime,
          close_time: closeTime,
          is_closed: isClosed,
          operations_manifest: manifest,
          manifest_push_status: "pushed",
          manifest_pushed_at: new Date().toISOString(),
        })
        .eq("site_id", site_id)
        .eq("manifest_date", targetDate);
      upsertError = error;
    } else {
      const { error } = await supabase
        .from("b_store_hours_manifests")
        .insert({
          site_id,
          manifest_date: targetDate,
          manifest_name: manifestName,
          open_time: openTime,
          close_time: closeTime,
          is_closed: isClosed,
          operations_manifest: manifest,
          manifest_push_status: "pushed",
          manifest_pushed_at: new Date().toISOString(),
        });
      upsertError = error;
    }

    if (upsertError) {
      console.error("[manifest/push] Step 8 FAILED:", upsertError);
      return NextResponse.json(
        { error: upsertError.message, step: "upsert" },
        { status: 500 }
      );
    }

    console.log("[manifest/push] SUCCESS for", targetDate);

    return NextResponse.json({
      success: true,
      date: targetDate,
      manifest,
    });
  } catch (err: any) {
    console.error("[manifest/push] UNCAUGHT ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── Build thermostat entries ─────────────────────────────────────────────────

async function buildThermostats(
  siteId: string,
  isClosed: boolean,
  openTime: string | null,
  closeTime: string | null
) {
  // Get thermostat devices
  const { data: devices, error: devErr } = await supabase
    .from("a_devices")
    .select(
      "device_id, device_name, ha_device_id, equipment_id, space_id, smart_start_enabled"
    )
    .eq("site_id", siteId)
    .eq("device_role", "thermostat");

  console.log("[buildThermostats] devices query:", {
    count: devices?.length ?? 0,
    error: devErr?.message ?? null,
    devices: devices?.map((d: any) => ({
      device_id: d.device_id,
      device_name: d.device_name,
      smart_start_enabled: d.smart_start_enabled,
      smart_start_enabled_type: typeof d.smart_start_enabled,
    })),
  });

  if (!devices || devices.length === 0) return [];

  // Get HVAC zones for this site (with profile-based setpoint columns)
  let hvacZones: any[] | null = null;
  {
    const { data: fullZones, error: zoneErr } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, zone_type, equipment_id, thermostat_device_id, profile_id, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, occupied_fan_mode, occupied_hvac_mode, unoccupied_fan_mode, unoccupied_hvac_mode, guardrail_min_f, guardrail_max_f, manager_offset_up_f, manager_offset_down_f, manager_override_reset_minutes, fan_mode, hvac_mode, is_override")
      .eq("site_id", siteId);

    if (zoneErr) {
      console.error("[buildThermostats] Full zone query failed:", zoneErr.message);
      // Fallback to basic columns
      const { data: basicZones } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id, name, zone_type, equipment_id, thermostat_device_id, profile_id, occupied_heat_f, occupied_cool_f, unoccupied_heat_f, unoccupied_cool_f, fan_mode, hvac_mode, is_override")
        .eq("site_id", siteId);
      hvacZones = basicZones;
    } else {
      hvacZones = fullZones;
    }
  }

  // Batch-fetch all referenced profiles
  const profileIds = [...new Set((hvacZones || []).filter((z: any) => z.profile_id).map((z: any) => z.profile_id))];
  const profileMap = new Map<string, any>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("b_thermostat_profiles")
      .select("*")
      .in("profile_id", profileIds);
    for (const p of profiles || []) {
      profileMap.set(p.profile_id, p);
    }
  }

  // Get climate entities for these devices
  const haDeviceIds = devices
    .map((d: any) => d.ha_device_id)
    .filter(Boolean);
  const { data: entities } =
    haDeviceIds.length > 0
      ? await supabase
          .from("b_entity_sync")
          .select("entity_id, ha_device_id, friendly_name")
          .eq("site_id", siteId)
          .eq("domain", "climate")
          .in("ha_device_id", haDeviceIds)
      : { data: [] };

  // Get latest smart start offsets
  const deviceIds = devices.map((d: any) => d.device_id);
  console.log("[buildThermostats] querying b_smart_start_log for deviceIds:", deviceIds);
  const { data: smartStartLogs, error: ssErr } =
    deviceIds.length > 0
      ? await supabase
          .from("b_smart_start_log")
          .select("device_id, next_recommended_offset, date")
          .in("device_id", deviceIds)
          .order("date", { ascending: false })
      : { data: [], error: null };

  console.log("[buildThermostats] smartStartLogs:", {
    count: smartStartLogs?.length ?? 0,
    error: ssErr?.message ?? null,
    logs: smartStartLogs?.slice(0, 5),
  });

  // Build one entry per thermostat device
  return devices.map((dev: any) => {
    const entity = (entities || []).find(
      (e: any) => e.ha_device_id === dev.ha_device_id
    );
    // Try thermostat_device_id first, fall back to equipment_id
    // Try thermostat_device_id first, fall back to equipment_id
    const zone = (hvacZones || []).find(
      (z: any) => z.thermostat_device_id === dev.device_id
    ) || (hvacZones || []).find(
      (z: any) => z.equipment_id === dev.equipment_id
    );
    const resolved = zone ? resolveZoneSetpointsSync(zone, profileMap.get(zone.profile_id)) : null;
    // First matching log entry (already sorted desc by date)
    const ssLog = (smartStartLogs || []).find(
      (l: any) => l.device_id === dev.device_id
    );
    const ssOffset = ssLog?.next_recommended_offset || 30;

    console.log("[buildThermostats] device", dev.device_id, {
      smart_start_enabled_raw: dev.smart_start_enabled,
      smart_start_enabled_coerced: dev.smart_start_enabled || false,
      ssLog_found: !!ssLog,
      ssLog_offset: ssLog?.next_recommended_offset,
      ssOffset_resolved: ssOffset,
      final_offset: (dev.smart_start_enabled ? ssOffset : 0),
    });

    const zoneType = zone?.zone_type
      ? zone.zone_type.charAt(0).toUpperCase() + zone.zone_type.slice(1)
      : "Employee";

    return {
      entity_id: entity?.entity_id || dev.ha_device_id || "",
      ha_device_id: dev.ha_device_id || "",
      device_name: dev.device_name || entity?.friendly_name || "",
      zone_name: zone?.name || "",
      zone_type: zoneType,
      hvac_zone_id: zone?.hvac_zone_id || null,
      smart_start_enabled: isClosed ? false : (dev.smart_start_enabled || false),
      smart_start_offset_minutes: isClosed ? 0 : (dev.smart_start_enabled ? ssOffset : 0),
      schedule: {
        on_time: isClosed ? "00:00:00" : openTime,
        off_time: isClosed ? "23:59:00" : closeTime,
      },
      setpoint_source: resolved?.source || "default",
      profile_name: resolved?.profile_name || null,
      occupied: {
        heat_setpoint: resolved?.occupied_heat_f ?? 68,
        cool_setpoint: resolved?.occupied_cool_f ?? 76,
        mode: resolved?.occupied_hvac_mode || "auto",
        fan: resolved?.occupied_fan_mode || "auto",
      },
      unoccupied: {
        heat_setpoint: resolved?.unoccupied_heat_f ?? 55,
        cool_setpoint: resolved?.unoccupied_cool_f ?? 85,
        mode: resolved?.unoccupied_hvac_mode || "auto",
        fan: resolved?.unoccupied_fan_mode || "auto",
      },
      guardrails: {
        min_f: resolved?.guardrail_min_f ?? 45,
        max_f: resolved?.guardrail_max_f ?? 95,
      },
      manager_override: {
        offset_up_f: resolved?.manager_offset_up_f ?? 4,
        offset_down_f: resolved?.manager_offset_down_f ?? 4,
        reset_minutes: resolved?.manager_override_reset_minutes ?? 120,
      },
    };
  });
}

// ─── Build equipment entries ──────────────────────────────────────────────────

// Shared equipment select columns — try with V4 offset columns, fall back without
const EQ_COLS_FULL = "equipment_id, equipment_name, equipment_group, space_id, status, schedule_category, lux_sensitivity, on_offset_minutes, off_offset_minutes";
const EQ_COLS_BASIC = "equipment_id, equipment_name, equipment_group, space_id, status";

async function queryEquipments(siteId: string, filter?: { equipIds?: string[] }): Promise<any[]> {
  const query = filter?.equipIds
    ? supabase.from("a_equipments").select(EQ_COLS_FULL).in("equipment_id", filter.equipIds)
    : supabase.from("a_equipments").select(EQ_COLS_FULL).eq("site_id", siteId).in("status", ["active"]);

  const { data, error } = await query;
  if (error) {
    console.log("[buildEquipment] columns query failed, trying basic:", error.message);
    const q2 = filter?.equipIds
      ? supabase.from("a_equipments").select(EQ_COLS_BASIC).in("equipment_id", filter.equipIds)
      : supabase.from("a_equipments").select(EQ_COLS_BASIC).eq("site_id", siteId).in("status", ["active"]);
    const { data: basic } = await q2;
    return basic || [];
  }
  return data || [];
}

interface SiteDefaults {
  defaultLuxSensitivity: number;
  employeePreOpenMinutes: number;
  customerPreOpenMinutes: number;
  postCloseMinutes: number;
}

function resolveEquipmentTimes(
  eq: any,
  category: string,
  openMins: number | null,
  closeMins: number | null,
  sunTimes: { sunrise: number | null; sunset: number | null } | null,
  defaults: SiteDefaults
) {
  // Exterior lux: dual window (morning + evening)
  if (category === "exterior_lux") {
    const luxLevel = eq.lux_sensitivity || defaults.defaultLuxSensitivity;
    const morningOffMins = sunTimes?.sunrise ?? null;  // Dawn
    const eveningOnMins = sunTimes?.sunset ?? null;    // Dusk

    // Exterior lights use the same store-hour offsets on both open and closed days
    const onOffset = eq.on_offset_minutes ?? -(defaults.employeePreOpenMinutes || 30);
    const morningOnMins = openMins !== null ? openMins + onOffset : null;
    const offOffset = eq.off_offset_minutes ?? (defaults.postCloseMinutes || 0);
    const eveningOffMins = closeMins !== null ? closeMins + offOffset : null;

    return {
      on_time: eveningOnMins !== null ? minutesToTimeStr(eveningOnMins) : null,
      off_time: morningOffMins !== null ? minutesToTimeStr(morningOffMins) : null,
      morning_on_time: morningOnMins !== null ? minutesToTimeStr(morningOnMins) : null,
      morning_on_condition: "lux_below_threshold",
      morning_off_time: morningOffMins !== null ? minutesToTimeStr(morningOffMins) : null,
      morning_off_trigger: "lux",
      evening_on_time: eveningOnMins !== null ? minutesToTimeStr(eveningOnMins) : null,
      evening_on_trigger: "lux",
      evening_off_time: eveningOffMins !== null ? minutesToTimeStr(eveningOffMins) : null,
      on_offset_minutes: onOffset,
      off_offset_minutes: offOffset,
      lux_sensitivity: luxLevel,
      schedule_source: `lux_level_${luxLevel}`,
    };
  }

  // Interior / other equipment: offset-based from store open/close
  let onOffset = eq.on_offset_minutes;
  if (onOffset === null || onOffset === undefined) {
    switch (category) {
      case "employee_hours": onOffset = -(defaults.employeePreOpenMinutes || 30); break;
      case "customer_hours": onOffset = -(defaults.customerPreOpenMinutes || 0); break;
      default: onOffset = 0;
    }
  }

  let offOffset = eq.off_offset_minutes;
  if (offOffset === null || offOffset === undefined) {
    offOffset = defaults.postCloseMinutes || 0;
  }

  let onTime: string | null = null;
  let offTime: string | null = null;

  if (openMins !== null && closeMins !== null) {
    onTime = minutesToTimeStr(openMins + onOffset);
    offTime = minutesToTimeStr(closeMins + offOffset);
  }

  return {
    on_time: onTime,
    off_time: offTime,
    on_offset_minutes: onOffset,
    off_offset_minutes: offOffset,
    lux_sensitivity: null as number | null,
    schedule_source: category || "store_hours",
    // No dual window for non-exterior
    morning_on_time: undefined,
    morning_on_condition: undefined,
    morning_off_time: undefined,
    morning_off_trigger: undefined,
    evening_on_time: undefined,
    evening_on_trigger: undefined,
    evening_off_time: undefined,
  };
}

async function buildEquipment(
  siteId: string,
  isClosed: boolean,
  openTime: string | null,
  closeTime: string | null,
  sunTimes: { sunrise: number | null; sunset: number | null } | null,
  defaultLuxSensitivity: number,
  employeePreOpenMinutes: number,
  customerPreOpenMinutes: number,
  postCloseMinutes: number
): Promise<{ interior: any[]; exterior: any[]; equipment: any[] }> {
  const openMins = timeToMinutes(openTime);
  const closeMins = timeToMinutes(closeTime);
  const defaults: SiteDefaults = {
    defaultLuxSensitivity,
    employeePreOpenMinutes,
    customerPreOpenMinutes,
    postCloseMinutes,
  };

  // Query all active equipment for this site
  const equipments = await queryEquipments(siteId);
  console.log("[buildEquipment] queried equipment:", equipments.length);

  if (equipments.length === 0) {
    return { interior: [], exterior: [], equipment: [] };
  }

  // Build a map of equipment metadata
  const eqMap = new Map<string, any>();
  for (const eq of equipments) {
    eqMap.set(eq.equipment_id, eq);
  }

  // Try view for pre-computed schedules (only used for store_hours category default times)
  const { data: viewData, error: viewError } = await supabase
    .from("view_daily_equipment_schedule")
    .select("*")
    .eq("site_id", siteId);

  console.log("[buildEquipment] view query:", {
    viewRows: viewData?.length ?? 0,
    viewError: viewError?.message ?? null,
  });

  // Build a view lookup for store_hours equipment that uses view schedules
  const viewMap = new Map<string, any>();
  if (!viewError && viewData) {
    for (const v of viewData) {
      if (v.equipment_id) viewMap.set(v.equipment_id, v);
    }
  }

  // Get entity mappings for equipment
  const equipIds = equipments.map((e: any) => e.equipment_id);
  const { data: entityLinks } =
    equipIds.length > 0
      ? await supabase
          .from("b_entity_sync")
          .select("entity_id, equipment_id")
          .eq("site_id", siteId)
          .in("equipment_id", equipIds)
      : { data: [] };

  const entityMap = new Map<string, string>();
  for (const el of entityLinks || []) {
    entityMap.set(el.equipment_id, el.entity_id);
  }

  const interior: any[] = [];
  const exterior: any[] = [];
  const allEquipment: any[] = [];

  // On closed days: no equipment events (HVAC runs unoccupied via thermostats, everything else off)
  if (isClosed) {
    console.log("[buildEquipment] closed day — skipping all equipment");
    return { interior: [], exterior: [], equipment: [] };
  }

  for (const eq of equipments) {
    const category = eq.schedule_category || "store_hours";

    // Skip always_on and hvac_zone
    if (category === "always_on" || category === "hvac_zone") continue;

    const times = resolveEquipmentTimes(eq, category, openMins, closeMins, sunTimes, defaults);

    // For store_hours with no per-equipment offset, use view schedule if available
    if (category === "store_hours" && !eq.on_offset_minutes && !eq.off_offset_minutes) {
      const viewRow = viewMap.get(eq.equipment_id);
      if (viewRow) {
        times.on_time = viewRow.scheduled_on_time || openTime;
        times.off_time = viewRow.scheduled_off_time || closeTime;
        times.schedule_source = viewRow.schedule_source || "store_hours";
      }
    }

    const entry: any = {
      equipment_id: eq.equipment_id,
      name: eq.equipment_name || "",
      group: eq.equipment_group || "Other",
      schedule_category: category,
      lux_sensitivity: times.lux_sensitivity,
      zone_type: null,
      entity_id: entityMap.get(eq.equipment_id) || null,
      on_time: times.on_time,
      off_time: times.off_time,
      on_offset_minutes: times.on_offset_minutes,
      off_offset_minutes: times.off_offset_minutes,
      action_on: "turn_on",
      action_off: "turn_off",
      schedule_source: times.schedule_source,
    };

    // Add dual-window fields for exterior equipment
    if (category === "exterior_lux") {
      entry.morning_on_time = times.morning_on_time;
      entry.morning_on_condition = times.morning_on_condition;
      entry.morning_off_time = times.morning_off_time;
      entry.morning_off_trigger = times.morning_off_trigger;
      entry.evening_on_time = times.evening_on_time;
      entry.evening_on_trigger = times.evening_on_trigger;
      entry.evening_off_time = times.evening_off_time;
      exterior.push(entry);
    } else {
      interior.push(entry);
    }
    allEquipment.push(entry);
  }

  console.log("[buildEquipment] final:", {
    interior: interior.length,
    exterior: exterior.length,
    total: allEquipment.length,
  });

  return { interior, exterior, equipment: allEquipment };
}
