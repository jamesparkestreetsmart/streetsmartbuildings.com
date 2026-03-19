const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  try {
    const { site_id, dry_run } = await req.json();

    if (!site_id) {
      return json({ error: "site_id is required" }, 400);
    }

    // 1. Look up HA credentials from a_sites
    const siteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/a_sites?site_id=eq.${site_id}&select=ha_url,ha_token&limit=1`,
      { headers }
    );
    if (!siteRes.ok) {
      return json({ error: "Failed to query a_sites", detail: await siteRes.text() }, 500);
    }
    const sites = await siteRes.json();
    if (!sites.length) {
      return json({ error: `No site found for site_id=${site_id}` }, 404);
    }

    const { ha_url, ha_token } = sites[0];
    if (!ha_url || !ha_token) {
      return json({ error: "Site is missing ha_url or ha_token" }, 422);
    }

    // 2. Ping HA to verify connectivity
    const haHeaders = { Authorization: `Bearer ${ha_token}` };
    const pingRes = await fetch(`${ha_url}/api/`, { headers: haHeaders });
    if (!pingRes.ok) {
      return json(
        { error: "Cannot reach Home Assistant", status: pingRes.status, detail: await pingRes.text() },
        502
      );
    }

    // 3. Fetch all states from HA and filter for automation entities
    const statesRes = await fetch(`${ha_url}/api/states`, {
      headers: haHeaders,
    });
    if (!statesRes.ok) {
      return json(
        { error: "Failed to fetch HA states", status: statesRes.status, detail: await statesRes.text() },
        502
      );
    }
    const allStates: Record<string, unknown>[] = await statesRes.json();
    const automations = allStates.filter(
      (s) => typeof s.entity_id === "string" && (s.entity_id as string).startsWith("automation.")
    );

    // 4. Return results (dry_run) or persist
    if (dry_run) {
      return json({
        success: true,
        dry_run: true,
        site_id,
        ha_url,
        automation_count: automations.length,
        automations: automations.map((a: Record<string, unknown>) => ({
          entity_id: a.entity_id,
          state: a.state,
          friendly_name: (a.attributes as Record<string, unknown>)?.friendly_name,
          last_triggered: (a.attributes as Record<string, unknown>)?.last_triggered,
        })),
      });
    }

    // Non-dry-run: upsert automations into c_ha_automation_imports
    const attrs = (a: Record<string, unknown>) =>
      (a.attributes || {}) as Record<string, unknown>;
    const imports = automations.map((a: Record<string, unknown>) => ({
      site_id,
      ha_automation_id: (a.entity_id as string).replace("automation.", ""),
      alias: attrs(a).friendly_name || null,
      description: null,
      raw_config: a,
      imported_at: new Date().toISOString(),
    }));

    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/c_ha_automation_imports`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(imports),
      }
    );

    if (!upsertRes.ok) {
      return json(
        { error: "Failed to upsert imports", detail: await upsertRes.text() },
        500
      );
    }

    const saved = await upsertRes.json();
    return json({
      success: true,
      dry_run: false,
      site_id,
      automation_count: automations.length,
      saved_count: saved.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
