import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchWeather, persistWeather } from "@/lib/weather";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { site_id } = await req.json();

    if (!site_id) {
      return NextResponse.json(
        { error: "site_id required" },
        { status: 400 }
      );
    }

    // Get site lat/lng
    const { data: site, error: siteErr } = await supabase
      .from("a_sites")
      .select("latitude, longitude, org_id, timezone")
      .eq("site_id", site_id)
      .single();

    if (siteErr || !site) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
    }

    if (!site.latitude || !site.longitude) {
      return NextResponse.json(
        { error: "Site missing lat/lng" },
        { status: 400 }
      );
    }

    // Fetch & persist weather
    const weather = await fetchWeather(site.latitude, site.longitude);
    const { error: insertErr } = await persistWeather(
      supabase,
      site_id,
      site.org_id,
      weather
    );

    if (insertErr) {
      console.error("[weather/sync] Persist failed:", insertErr);
      // Don't fail the request — the data was still fetched successfully
    }

    // Update thermostat state with outdoor temp (best effort)
    await supabase
      .from("b_thermostat_state")
      .update({
        outdoor_temp_f: weather.temperature,
        feels_like_outdoor_f: weather.feels_like,
      })
      .eq("site_id", site_id);

    return NextResponse.json({
      success: true,
      weather: {
        temp: weather.temperature,
        feels_like: weather.feels_like,
        humidity: weather.humidity,
        lux: weather.lux_estimate,
        sun_elevation: weather.sun_elevation,
        condition: weather.condition,
        cloud_cover: weather.cloud_cover,
        wind_speed: weather.wind_speed,
      },
    });
  } catch (err: any) {
    console.error("[weather/sync] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
