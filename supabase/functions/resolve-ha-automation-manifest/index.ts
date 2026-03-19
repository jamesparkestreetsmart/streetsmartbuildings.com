import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { site_id } = body;

    if (!site_id) {
      return new Response(JSON.stringify({ error: "site_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: siteRow, error: siteErr } = await supabase
      .from("a_sites")
      .select("org_id")
      .eq("site_id", site_id)
      .single();

    if (siteErr || !siteRow) {
      return new Response(JSON.stringify({ error: "Site not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: resolved, error: resolveErr } = await supabase
      .rpc("resolve_effective_automations", { p_site_id: site_id });

    if (resolveErr) {
      return new Response(JSON.stringify({ error: resolveErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = (resolved || []) as Array<{
      automation_key: string;
      resolved_template_id: string;
      desired_enabled: boolean;
      desired_version: number;
      desired_checksum: string;
      desired_yaml: string | null;
    }>;

    rows.sort((a, b) => a.automation_key.localeCompare(b.automation_key));

    const checksumConcat = rows.map((r) => r.desired_checksum).join("");
    const bundleVersion = await sha256(checksumConcat);

    const automations = rows.map((r) => ({
      automation_key: r.automation_key,
      enabled: r.desired_enabled,
      version: r.desired_version,
      checksum: r.desired_checksum,
      payload_format: "yaml",
      yaml: r.desired_enabled ? r.desired_yaml : null,
    }));

    const manifest = {
      manifest_type: "ha_automations",
      site_id,
      org_id: siteRow.org_id,
      generated_at: new Date().toISOString(),
      bundle_version: bundleVersion,
      automations,
    };

    return new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
