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

// POST — assign or remove a space from a zone
export async function POST(req: NextRequest) {
  try {
    const callerEmail = await getCallerEmail();
    const body = await req.json();
    const { site_id, space_id, equipment_id } = body;

    if (!site_id || !space_id) {
      return NextResponse.json({ error: "site_id and space_id required" }, { status: 400 });
    }

    // Update space equipment_id (and clear zone_weight when removing)
    const update: Record<string, any> = {
      equipment_id: equipment_id || null,
    };
    if (!equipment_id) {
      update.zone_weight = null;
    }

    let { error } = await supabase
      .from("a_spaces")
      .update(update)
      .eq("space_id", space_id);

    // If zone_weight column doesn't exist yet, retry without it
    if (error && !equipment_id) {
      const retry = await supabase
        .from("a_spaces")
        .update({ equipment_id: null })
        .eq("space_id", space_id);
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    try {
      const { data: siteInfo } = await supabase
        .from("a_sites")
        .select("timezone, org_id")
        .eq("site_id", site_id)
        .single();
      const localDate = new Date().toLocaleDateString("en-CA", {
        timeZone: siteInfo?.timezone || "America/Chicago",
      });

      const { data: spaceInfo } = await supabase
        .from("a_spaces")
        .select("name")
        .eq("space_id", space_id)
        .single();

      const eqName = equipment_id
        ? (await supabase.from("a_equipments").select("equipment_name").eq("equipment_id", equipment_id).single()).data?.equipment_name
        : null;

      const message = equipment_id
        ? `Space "${spaceInfo?.name}" assigned to equipment "${eqName || equipment_id}"`
        : `Space "${spaceInfo?.name}" removed from zone`;

      await supabase.from("b_records_log").insert({
        site_id,
        org_id: siteInfo?.org_id || null,
        equipment_id: equipment_id || null,
        event_type: equipment_id ? "space_assigned" : "space_removed",
        event_date: localDate,
        message,
        source: "zone_config",
        created_by: callerEmail,
      });
    } catch (logErr) {
      console.error("[zone-config/assign-space] log error:", logErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[zone-config/assign-space] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
