export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view");
    const siteId = searchParams.get("site_id");

    if (view === "templates") {
      const { data, error } = await supabase
        .from("c_ha_automation_templates")
        .select(
          "automation_template_id, automation_key, scope_level, org_id, site_id, label, enabled, is_active, version, checksum, created_at, updated_at, parent_template_id, notes, yaml_rendered"
        )
        .eq("is_active", true)
        .order("automation_key")
        .order("scope_level");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ templates: data });
    }

    if (view === "template_history") {
      const key = searchParams.get("automation_key");
      const scope = searchParams.get("scope_level");
      if (!key || !scope) {
        return NextResponse.json({ error: "automation_key and scope_level required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("c_ha_automation_templates")
        .select(
          "automation_template_id, automation_key, scope_level, version, checksum, enabled, is_active, created_at, updated_at, notes"
        )
        .eq("automation_key", key)
        .eq("scope_level", scope)
        .eq("is_active", false)
        .order("version", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ history: data });
    }

    if (view === "deployments" && siteId) {
      const { data, error } = await supabase
        .from("c_ha_automation_deployments")
        .select(
          `deployment_id, automation_key, desired_enabled, desired_version,
           desired_checksum, installed_enabled, installed_version,
           installed_checksum, drift_status, last_status,
           last_pushed_at, last_success_at, ha_automation_ref,
           last_error, resolved_template_id`
        )
        .eq("site_id", siteId)
        .order("automation_key");

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Fetch template labels + scope for each resolved_template_id
      const templateIds = (data || [])
        .map((d: { resolved_template_id: string }) => d.resolved_template_id)
        .filter(Boolean);

      let templateMap: Record<string, { scope_level: string; label: string }> = {};
      if (templateIds.length > 0) {
        const { data: templates } = await supabase
          .from("c_ha_automation_templates")
          .select("automation_template_id, scope_level, label")
          .in("automation_template_id", templateIds);
        for (const t of templates || []) {
          templateMap[t.automation_template_id] = {
            scope_level: t.scope_level,
            label: t.label,
          };
        }
      }

      const enriched = (data || []).map((d: Record<string, unknown>) => ({
        ...d,
        scope_level: templateMap[d.resolved_template_id as string]?.scope_level || null,
        label: templateMap[d.resolved_template_id as string]?.label || null,
      }));

      return NextResponse.json({ deployments: enriched });
    }

    if (view === "deployment_log" && siteId) {
      const { data, error } = await supabase
        .from("c_ha_automation_deployment_log")
        .select(
          "deployment_log_id, automation_key, result, attempted_at, completed_at, desired_version, desired_checksum, error_text, manifest_revision, response_payload"
        )
        .eq("site_id", siteId)
        .order("attempted_at", { ascending: false })
        .limit(50);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ logs: data });
    }

    if (view === "sites") {
      const { data: sitesData, error: sitesErr } = await supabase
        .from("a_sites")
        .select("site_id, site_slug, site_name, org_id")
        .neq("status", "inventory")
        .order("site_slug");

      if (sitesErr) return NextResponse.json({ error: sitesErr.message }, { status: 500 });

      // Fetch orgs
      const orgIds = [...new Set((sitesData || []).map((s: { org_id: string }) => s.org_id).filter(Boolean))];
      let orgLookup: Record<string, { org_name: string; org_identifier: string }> = {};
      if (orgIds.length > 0) {
        const { data: orgsData } = await supabase
          .from("a_organizations")
          .select("org_id, org_name, org_identifier")
          .in("org_id", orgIds);
        for (const o of orgsData || []) {
          orgLookup[o.org_id] = { org_name: o.org_name, org_identifier: o.org_identifier };
        }
      }

      // Group by org
      const orgMap: Record<string, { org_name: string; org_identifier: string; sites: { site_id: string; site_slug: string; site_name: string }[] }> = {};
      for (const s of sitesData || []) {
        const org = orgLookup[s.org_id] || { org_name: "Unknown", org_identifier: "?" };
        const key = s.org_id || "none";
        if (!orgMap[key]) {
          orgMap[key] = { org_name: org.org_name, org_identifier: org.org_identifier, sites: [] };
        }
        orgMap[key].sites.push({ site_id: s.site_id, site_slug: s.site_slug, site_name: s.site_name });
      }

      const groups = Object.values(orgMap).sort((a, b) => a.org_name.localeCompare(b.org_name));
      return NextResponse.json({ site_groups: groups });
    }

    return NextResponse.json({ error: "Invalid view parameter" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, site_id } = body;

    if (!action || !site_id) {
      return NextResponse.json({ error: "action and site_id required" }, { status: 400 });
    }

    const fnHeaders = {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    if (action === "audit") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/audit-ha-automations`, {
        method: "POST",
        headers: fnHeaders,
        body: JSON.stringify({ site_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error || "Audit failed" }, { status: res.status });
      }
      return NextResponse.json({ result: data });
    }

    if (action === "reconcile") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/reconcile-ha-automations`, {
        method: "POST",
        headers: fnHeaders,
        body: JSON.stringify({ site_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error || "Reconcile failed" }, { status: res.status });
      }
      return NextResponse.json({ result: data });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
