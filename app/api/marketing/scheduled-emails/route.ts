import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/marketing/scheduled-emails — fetch leads, video counts, org names
export async function GET() {
  try {
    const { data: leads, error: leadsError } = await supabase
      .from("view_admin_leads")
      .select(
        "id, email, first_name, organization_name, projected_sites, welcome_email_status, welcome_email_sent_at, welcome_email_error, created_at, org_id, profile_complete"
      )
      .order("profile_complete", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(100);

    if (leadsError) throw leadsError;

    const stats = {
      total: leads?.length || 0,
      pending: leads?.filter((l) => l.welcome_email_status === "pending").length || 0,
      sent: leads?.filter((l) => l.welcome_email_status === "sent").length || 0,
      failed: leads?.filter((l) => l.welcome_email_status === "failed").length || 0,
    };

    // Fetch video counts per lead
    const videoCounts: Record<string, number> = {};
    const { data: videos } = await supabase
      .from("z_marketing_lead_videos")
      .select("lead_id");

    if (videos) {
      for (const v of videos) {
        if (v.lead_id) {
          videoCounts[v.lead_id] = (videoCounts[v.lead_id] || 0) + 1;
        }
      }
    }

    // Fetch known org names for fuzzy duplicate cues
    const { data: orgs } = await supabase
      .from("a_organizations")
      .select("org_name");

    const orgNames = (orgs || []).map((o) => o.org_name);

    return NextResponse.json({ leads: leads || [], stats, videoCounts, orgNames });
  } catch (err: any) {
    console.error("Failed to fetch marketing data:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch marketing data" },
      { status: 500 }
    );
  }
}