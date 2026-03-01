// app/api/thermostat/profiles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

// DB column is "name", but UI/API contract uses "profile_name"
function mapProfileOut(p: any) {
  const { name, ...rest } = p;
  return { ...rest, profile_name: name };
}

export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");
    const scope = req.nextUrl.searchParams.get("scope");
    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    // scope=all: SSB org can browse ALL profiles across all orgs
    if (scope === "all") {
      const { data: callerOrg } = await supabase
        .from("a_organizations")
        .select("parent_org_id")
        .eq("org_id", orgId)
        .single();

      if (!callerOrg || callerOrg.parent_org_id !== null) {
        return NextResponse.json({ error: "scope=all is only available for SSB org" }, { status: 403 });
      }

      const { data: allProfiles, error: allErr } = await supabase
        .from("b_thermostat_profiles")
        .select("*, a_organizations!inner(org_name)")
        .order("name");

      if (allErr) {
        console.error("[thermostat/profiles] GET scope=all error:", allErr);
        return NextResponse.json({ error: allErr.message }, { status: 500 });
      }

      const result = (allProfiles || []).map((p: any) => ({
        ...mapProfileOut(p),
        org_name: p.a_organizations?.org_name || null,
        a_organizations: undefined,
        zone_count: 0,
        site_count: 0,
      }));

      return NextResponse.json(result);
    }

    // Default: org's own profiles + globals (is_global = true)
    const { data: profiles, error } = await supabase
      .from("b_thermostat_profiles")
      .select("*")
      .or(`org_id.eq.${orgId},is_global.eq.true`)
      .order("name");

    if (error) {
      console.error("[thermostat/profiles] GET profiles error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get zone/site counts per profile (skip if no profiles)
    const profileIds = (profiles || []).map((p: any) => p.profile_id);
    let counts: any[] = [];

    if (profileIds.length > 0) {
      const { data: countData, error: countErr } = await supabase
        .from("a_hvac_zones")
        .select("profile_id, site_id, hvac_zone_id")
        .in("profile_id", profileIds);

      if (countErr) {
        console.error("[thermostat/profiles] GET counts error:", countErr);
      } else {
        counts = countData || [];
      }
    }

    const countMap: Record<string, { zone_count: number; site_count: number }> = {};
    for (const row of counts) {
      if (!row.profile_id) continue;
      if (!countMap[row.profile_id]) {
        countMap[row.profile_id] = { zone_count: 0, site_count: 0 };
      }
      countMap[row.profile_id].zone_count++;
    }
    for (const profileId of Object.keys(countMap)) {
      const sites = new Set(
        counts
          .filter((r: any) => r.profile_id === profileId)
          .map((r: any) => r.site_id)
      );
      countMap[profileId].site_count = sites.size;
    }

    const result = (profiles || []).map((p: any) => ({
      ...mapProfileOut(p),
      zone_count: countMap[p.profile_id]?.zone_count || 0,
      site_count: countMap[p.profile_id]?.site_count || 0,
    }));

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[thermostat/profiles] GET uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { org_id, profile_name, ...fields } = body;

    if (!org_id || !profile_name) {
      return NextResponse.json(
        { error: "org_id and profile_name required" },
        { status: 400 }
      );
    }

    // Check if caller is SSB org (parent_org_id IS NULL) to allow is_global
    let isGlobal = false;
    if (fields.is_global === true) {
      const { data: callerOrg } = await supabase
        .from("a_organizations")
        .select("parent_org_id")
        .eq("org_id", org_id)
        .single();
      if (callerOrg && callerOrg.parent_org_id === null) {
        isGlobal = true;
      }
    }

    const { data, error } = await supabase
      .from("b_thermostat_profiles")
      .insert({
        org_id,
        name: profile_name,
        is_global: isGlobal,
        scope: fields.scope ?? "org",
        occupied_heat_f: fields.occupied_heat_f ?? 68,
        occupied_cool_f: fields.occupied_cool_f ?? 76,
        unoccupied_heat_f: fields.unoccupied_heat_f ?? 55,
        unoccupied_cool_f: fields.unoccupied_cool_f ?? 85,
        occupied_fan_mode: fields.occupied_fan_mode ?? "auto",
        occupied_hvac_mode: fields.occupied_hvac_mode ?? "auto",
        unoccupied_fan_mode: fields.unoccupied_fan_mode ?? "auto",
        unoccupied_hvac_mode: fields.unoccupied_hvac_mode ?? "auto",
        guardrail_min_f: fields.guardrail_min_f ?? 45,
        guardrail_max_f: fields.guardrail_max_f ?? 95,
        manager_offset_up_f: fields.manager_offset_up_f ?? 4,
        manager_offset_down_f: fields.manager_offset_down_f ?? 4,
        manager_override_reset_minutes: fields.manager_override_reset_minutes ?? 120,
      })
      .select()
      .single();

    if (error) {
      console.error("[thermostat/profiles] POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log profile creation
    try {
      await supabase.from("b_records_log").insert({
        org_id,
        site_id: null,
        event_type: "profile_created",
        event_date: new Date().toISOString().split("T")[0],
        message: `Created profile "${profile_name}" (${fields.occupied_hvac_mode || "auto"}, occupied: ${fields.occupied_heat_f ?? 68}°–${fields.occupied_cool_f ?? 76}°F, unoccupied: ${fields.unoccupied_heat_f ?? 55}°–${fields.unoccupied_cool_f ?? 85}°F)`,
        source: "thermostat_profiles",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[thermostat/profiles] POST log error:", logErr);
    }

    return NextResponse.json(mapProfileOut(data));
  } catch (err: any) {
    console.error("[thermostat/profiles] POST uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { profile_id, profile_name, ...otherFields } = body;

    if (!profile_id) {
      return NextResponse.json({ error: "profile_id required" }, { status: 400 });
    }

    // Map profile_name -> name for DB
    const dbFields: Record<string, any> = { ...otherFields };
    if (profile_name !== undefined) {
      dbFields.name = profile_name;
    }

    // Fetch current profile before update (for change detection)
    const { data: before } = await supabase
      .from("b_thermostat_profiles")
      .select("*")
      .eq("profile_id", profile_id)
      .single();

    const { data, error } = await supabase
      .from("b_thermostat_profiles")
      .update(dbFields)
      .eq("profile_id", profile_id)
      .select()
      .single();

    if (error) {
      console.error("[thermostat/profiles] PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log profile update with changed fields
    try {
      const changedFields: string[] = [];
      const trackFields = [
        "occupied_heat_f", "occupied_cool_f", "unoccupied_heat_f", "unoccupied_cool_f",
        "occupied_fan_mode", "occupied_hvac_mode", "unoccupied_fan_mode", "unoccupied_hvac_mode",
        "guardrail_min_f", "guardrail_max_f", "manager_offset_up_f", "manager_offset_down_f",
        "manager_override_reset_minutes",
      ];
      for (const f of trackFields) {
        if (dbFields[f] !== undefined && before && dbFields[f] !== before[f]) {
          changedFields.push(`${f}: ${before[f]} → ${dbFields[f]}`);
        }
      }
      if (dbFields.name !== undefined && before && dbFields.name !== before.name) {
        changedFields.push(`name: "${before.name}" → "${dbFields.name}"`);
      }

      await supabase.from("b_records_log").insert({
        org_id: data.org_id,
        site_id: null,
        event_type: "profile_updated",
        event_date: new Date().toISOString().split("T")[0],
        message: `Updated profile "${data.name}"${changedFields.length > 0 ? `: ${changedFields.join(", ")}` : ""}`,
        source: "thermostat_profiles",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[thermostat/profiles] PATCH log error:", logErr);
    }

    return NextResponse.json(mapProfileOut(data));
  } catch (err: any) {
    console.error("[thermostat/profiles] PATCH uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const profileId = req.nextUrl.searchParams.get("profile_id");
    if (!profileId) {
      return NextResponse.json(
        { error: "profile_id required" },
        { status: 400 }
      );
    }

    // Block deletion of global profiles
    const { data: profileCheck } = await supabase
      .from("b_thermostat_profiles")
      .select("is_global")
      .eq("profile_id", profileId)
      .single();

    if (profileCheck?.is_global) {
      return NextResponse.json({ error: "Cannot delete a global profile" }, { status: 403 });
    }

    // Check if any zones reference this profile
    const { data: zones } = await supabase
      .from("a_hvac_zones")
      .select("hvac_zone_id, name, site_id")
      .eq("profile_id", profileId);

    if (zones && zones.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: ${zones.length} zone(s) still reference this profile`,
          zones: zones.map((z: any) => ({ name: z.name, site_id: z.site_id })),
        },
        { status: 400 }
      );
    }

    // Fetch profile info before deletion for logging
    const { data: profile } = await supabase
      .from("b_thermostat_profiles")
      .select("name, org_id")
      .eq("profile_id", profileId)
      .single();

    const { error } = await supabase
      .from("b_thermostat_profiles")
      .delete()
      .eq("profile_id", profileId);

    if (error) {
      console.error("[thermostat/profiles] DELETE error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log profile deletion
    try {
      await supabase.from("b_records_log").insert({
        org_id: profile?.org_id || null,
        site_id: null,
        event_type: "profile_deleted",
        event_date: new Date().toISOString().split("T")[0],
        message: `Deleted profile "${profile?.name || profileId}"`,
        source: "thermostat_profiles",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[thermostat/profiles] DELETE log error:", logErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[thermostat/profiles] DELETE uncaught:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
