import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthUser() {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    const body = await req.json();
    const { alert_id, zone_id, alert_type, site_id, org_id } = body;

    if (!alert_id) {
      return NextResponse.json({ error: "alert_id required" }, { status: 400 });
    }

    // Fetch current alert
    const { data: alert, error: fetchErr } = await supabase
      .from("b_anomaly_events")
      .select("*")
      .eq("id", alert_id)
      .single();

    if (fetchErr || !alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const previousStatus = alert.ended_at ? "resolved" : "active";
    const now = new Date().toISOString();

    // Compute duration in minutes
    const durationMin = Math.round(
      (new Date(now).getTime() - new Date(alert.started_at).getTime()) / 60000
    );

    // Update the alert — try with resolved_reason first, fall back without it
    const updateFields: Record<string, any> = {
      ended_at: now,
      duration_min: durationMin,
      resolved_reason: "manual_reset",
      updated_at: now,
    };

    let { data: updated, error: updateErr } = await supabase
      .from("b_anomaly_events")
      .update(updateFields)
      .eq("id", alert_id)
      .select()
      .single();

    // If resolved_reason or updated_at columns don't exist, retry without them
    if (updateErr && (updateErr.message?.includes("resolved_reason") || updateErr.message?.includes("updated_at"))) {
      console.warn("[anomaly/reset] Column not found, retrying minimal update:", updateErr.message);
      ({ data: updated, error: updateErr } = await supabase
        .from("b_anomaly_events")
        .update({ ended_at: now, duration_min: durationMin })
        .eq("id", alert_id)
        .select()
        .single());
    }

    if (updateErr) {
      console.error("[anomaly/reset] Update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Log the reset event
    try {
      const userName = user?.email || "unknown";
      await supabase.from("b_records_log").insert({
        org_id: org_id || null,
        site_id: site_id || null,
        event_type: "anomaly_reset",
        event_date: now.split("T")[0],
        message: `${alert_type || alert.anomaly_type} anomaly manually reset by ${userName}`,
        source: "anomaly_events",
        created_by: user?.id || "system",
        metadata: {
          alert_id,
          alert_type: alert_type || alert.anomaly_type,
          zone_id: zone_id || alert.hvac_zone_id,
          previous_status: previousStatus,
          reset_by_user_id: user?.id || null,
          reset_by_name: userName,
        },
      });
    } catch (logErr) {
      console.error("[anomaly/reset] Log insert error:", logErr);
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("[anomaly/reset] Uncaught error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
