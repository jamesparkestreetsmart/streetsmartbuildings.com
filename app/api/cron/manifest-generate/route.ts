import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Dev mode — no secret required
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  const startMs = Date.now();

  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all active (non-inventory) sites
    const { data: sites, error: sitesErr } = await supabase
      .from("a_sites")
      .select("site_id, timezone")
      .neq("status", "inventory");

    if (sitesErr) {
      console.error("[cron/manifest-generate] Sites query error:", sitesErr.message);
      return NextResponse.json({ error: sitesErr.message }, { status: 500 });
    }

    if (!sites || sites.length === 0) {
      return NextResponse.json({ sites_checked: 0, generated: 0, skipped: 0, errors: [], duration_ms: Date.now() - startMs });
    }

    // For each site, check if today (in their timezone) already has a manifest
    let generated = 0;
    let skipped = 0;
    const errors: { site_id: string; error: string }[] = [];

    for (const site of sites) {
      const tz = site.timezone || "America/Chicago";
      const localToday = new Date().toLocaleDateString("en-CA", { timeZone: tz });

      try {
        // Check if manifest already exists for today
        const { data: existing } = await supabase
          .from("b_store_hours_manifests")
          .select("manifest_date")
          .eq("site_id", site.site_id)
          .eq("manifest_date", localToday)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        // No manifest for today — generate one via internal POST
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";

        const res = await fetch(`${baseUrl}/api/manifest/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ site_id: site.site_id, date: localToday }),
        });

        if (res.ok) {
          generated++;
          console.log(`[cron/manifest-generate] Generated manifest for ${site.site_id} (${localToday})`);
        } else {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }
      } catch (err: any) {
        console.error(`[cron/manifest-generate] Failed for ${site.site_id}:`, err.message);
        errors.push({ site_id: site.site_id, error: err.message });
      }
    }

    return NextResponse.json({
      sites_checked: sites.length,
      generated,
      skipped,
      errors,
      duration_ms: Date.now() - startMs,
    });
  } catch (err: any) {
    console.error("[cron/manifest-generate] Uncaught error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
