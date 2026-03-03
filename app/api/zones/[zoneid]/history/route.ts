import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ zoneid: string }> }
) {
  const { zoneid } = await params;
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date");
  const startDate = sp.get("start_date");
  const endDate = sp.get("end_date");
  const includeSummary = sp.get("include_summary") === "true";

  // ── Single day: return all 5-min rows ──
  if (date) {
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;

    const { data: rows, error } = await supabase
      .from("b_zone_setpoint_log")
      .select("*")
      .eq("hvac_zone_id", zoneid)
      .gte("recorded_at", dayStart)
      .lte("recorded_at", dayEnd)
      .order("recorded_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Dedup: keep highest id per timestamp
    const seen = new Map<string, any>();
    for (const r of rows || []) {
      const key = r.recorded_at;
      if (!seen.has(key) || r.id > seen.get(key).id) {
        seen.set(key, r);
      }
    }
    const deduped = Array.from(seen.values());

    let summary = null;
    if (includeSummary && deduped.length > 0) {
      const temps = deduped.filter((r) => r.zone_temp_f != null).map((r) => r.zone_temp_f);
      const avgTemp = temps.length > 0 ? temps.reduce((a: number, b: number) => a + b, 0) / temps.length : null;

      let heatingMins = 0;
      let coolingMins = 0;
      let compCycles = 0;
      let prevComp = false;
      let totalEnergy = 0;
      const effRatios = deduped.filter((r) => r.efficiency_ratio != null).map((r) => r.efficiency_ratio);

      // Process oldest-first for cycle counting
      const sorted = [...deduped].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
      for (const r of sorted) {
        if (r.hvac_action === "heating") heatingMins += 5;
        if (r.hvac_action === "cooling") coolingMins += 5;
        if (r.comp_on && !prevComp) compCycles++;
        prevComp = !!r.comp_on;
        if (r.energy_delta_kwh != null) totalEnergy += r.energy_delta_kwh;
      }

      summary = {
        avg_temp: avgTemp != null ? Math.round(avgTemp * 10) / 10 : null,
        runtime_heating_min: heatingMins,
        runtime_cooling_min: coolingMins,
        compressor_cycles: compCycles,
        avg_efficiency: effRatios.length > 0
          ? Math.round((effRatios.reduce((a: number, b: number) => a + b, 0) / effRatios.length) * 100) / 100
          : null,
        total_energy_kwh: Math.round(totalEnergy * 1000) / 1000,
      };
    }

    return NextResponse.json({ rows: deduped, summary });
  }

  // ── Date range: return daily aggregates ──
  if (startDate && endDate) {
    const rangeStart = `${startDate}T00:00:00`;
    const rangeEnd = `${endDate}T23:59:59`;

    const { data: rows, error } = await supabase
      .from("b_zone_setpoint_log")
      .select(
        "recorded_at, zone_temp_f, zone_humidity, energy_delta_kwh, efficiency_ratio, hvac_action, comp_on"
      )
      .eq("hvac_zone_id", zoneid)
      .gte("recorded_at", rangeStart)
      .lte("recorded_at", rangeEnd)
      .order("recorded_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by day
    const dayMap = new Map<string, any[]>();
    for (const r of rows || []) {
      const day = r.recorded_at.slice(0, 10);
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(r);
    }

    const aggregates = Array.from(dayMap.entries()).map(([day, dayRows]) => {
      const temps = dayRows.filter((r) => r.zone_temp_f != null).map((r) => r.zone_temp_f);
      const humids = dayRows.filter((r) => r.zone_humidity != null).map((r) => r.zone_humidity);
      const effs = dayRows.filter((r) => r.efficiency_ratio != null).map((r) => r.efficiency_ratio);

      let heatMins = 0;
      let coolMins = 0;
      let cycles = 0;
      let prevComp = false;
      let energy = 0;

      for (const r of dayRows) {
        if (r.hvac_action === "heating") heatMins += 5;
        if (r.hvac_action === "cooling") coolMins += 5;
        if (r.comp_on && !prevComp) cycles++;
        prevComp = !!r.comp_on;
        if (r.energy_delta_kwh != null) energy += r.energy_delta_kwh;
      }

      return {
        day,
        avg_temp: temps.length > 0 ? Math.round((temps.reduce((a: number, b: number) => a + b, 0) / temps.length) * 10) / 10 : null,
        avg_humidity: humids.length > 0 ? Math.round((humids.reduce((a: number, b: number) => a + b, 0) / humids.length) * 10) / 10 : null,
        heat_hours: Math.round((heatMins / 60) * 100) / 100,
        cool_hours: Math.round((coolMins / 60) * 100) / 100,
        compressor_cycles: cycles,
        total_energy_kwh: Math.round(energy * 1000) / 1000,
        avg_efficiency: effs.length > 0 ? Math.round((effs.reduce((a: number, b: number) => a + b, 0) / effs.length) * 100) / 100 : null,
      };
    });

    // Sort descending
    aggregates.sort((a, b) => b.day.localeCompare(a.day));

    return NextResponse.json({ aggregates });
  }

  return NextResponse.json({ error: "Provide date or start_date+end_date" }, { status: 400 });
}
