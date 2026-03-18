/**
 * Temperature trend calculator.
 * Records thermostat temperature readings and computes:
 * - Current trend (°F/min over last 5 min)
 * - Acceleration (change in trend)
 * - Average heating/cooling ramp rates from history (for Smart Start)
 */

// ─── Record temp and calculate trend ──────────────────────────────────

export async function recordTempAndCalcTrend(
  supabase: any,
  siteId: string,
  deviceId: string,
  currentTemp: number,
  currentHumidity: number | null,
  outdoorTemp: number | null
): Promise<{ trend: number | null; accel: number | null }> {
  // 1. Record current reading
  await supabase.from("b_thermostat_temp_history").insert({
    site_id: siteId,
    device_id: deviceId,
    temperature_f: currentTemp,
    humidity: currentHumidity,
    outdoor_temp_f: outdoorTemp,
  });

  // 2. Get reading from ~5 min ago
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: prev } = await supabase
    .from("b_thermostat_temp_history")
    .select("temperature_f, recorded_at")
    .eq("device_id", deviceId)
    .gte("recorded_at", tenMinAgo)
    .lte("recorded_at", fiveMinAgo)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (!prev) return { trend: null, accel: null };

  const elapsedMin =
    (Date.now() - new Date(prev.recorded_at).getTime()) / 60000;
  if (elapsedMin < 0.5) return { trend: null, accel: null };

  const trend = (currentTemp - prev.temperature_f) / elapsedMin; // °F/min

  // 3. Get reading from ~10 min ago for acceleration
  const { data: prevPrev } = await supabase
    .from("b_thermostat_temp_history")
    .select("temperature_f, recorded_at")
    .eq("device_id", deviceId)
    .lte("recorded_at", tenMinAgo)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  let accel = null;
  if (prevPrev) {
    const prevElapsed =
      (new Date(prev.recorded_at).getTime() -
        new Date(prevPrev.recorded_at).getTime()) /
      60000;
    if (prevElapsed > 0.5) {
      const prevTrend =
        (prev.temperature_f - prevPrev.temperature_f) / prevElapsed;
      accel = trend - prevTrend; // °F/min² — positive = accelerating
    }
  }

  // 4. Update thermostat state with trend
  // TODO: This resolver is WRONG and must be fixed before this function
  // is wired up anywhere.
  //
  // a_devices.entity_id is NOT canonical. It is a historical convenience
  // field that happened to be populated on some rows. Do NOT use it as
  // the lookup key for b_thermostat_state.
  //
  // The correct resolver chain is:
  //   a_devices.ha_device_id
  //   → b_entity_sync WHERE entity_id ILIKE 'climate.%'
  //   → use that entity_id to update b_thermostat_state
  //
  // Using a_devices.entity_id bypasses b_entity_sync entirely and will
  // silently fail or update the wrong row if entity mappings change.
  // See entity-sync and ha-push.ts for the correct pattern.
  //
  // If this function is ever activated without fixing this resolver,
  // it WILL produce incorrect data.
  const { data: device } = await supabase
    .from("a_devices")
    .select("entity_id")
    .eq("device_id", deviceId)
    .single();

  if (device?.entity_id) {
    await supabase
      .from("b_thermostat_state")
      .update({
        temp_trend_5min: Math.round(trend * 1000) / 1000,
        temp_accel_5min: accel ? Math.round(accel * 1000) / 1000 : null,
      })
      .eq("site_id", siteId)
      .eq("entity_id", device.entity_id);
  }

  return { trend, accel };
}

// ─── Get average heating/cooling rate from history ─────────────────────

export async function getAvgRampRate(
  supabase: any,
  deviceId: string,
  mode: "heating" | "cooling",
  daysBack: number = 7
): Promise<number | null> {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();

  const { data: readings } = await supabase
    .from("b_thermostat_temp_history")
    .select("temperature_f, recorded_at")
    .eq("device_id", deviceId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  if (!readings || readings.length < 10) return null;

  // Find ramp segments: consecutive readings where temp is
  // increasing (heating) or decreasing (cooling)
  const rates: number[] = [];
  for (let i = 1; i < readings.length; i++) {
    const dt =
      (new Date(readings[i].recorded_at).getTime() -
        new Date(readings[i - 1].recorded_at).getTime()) /
      60000;
    if (dt < 1 || dt > 15) continue; // skip gaps

    const dTemp = readings[i].temperature_f - readings[i - 1].temperature_f;
    const rate = dTemp / dt; // °F/min

    if (mode === "heating" && rate > 0.05) rates.push(rate);
    if (mode === "cooling" && rate < -0.05) rates.push(Math.abs(rate));
  }

  if (rates.length < 5) return null;

  // Trim outliers (10th-90th percentile) and average
  rates.sort((a, b) => a - b);
  const trimmed = rates.slice(
    Math.floor(rates.length * 0.1),
    Math.ceil(rates.length * 0.9)
  );

  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}
