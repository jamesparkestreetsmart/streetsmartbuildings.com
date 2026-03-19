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

interface ResolvedAutomation {
  automation_key: string;
  resolved_template_id: string;
  desired_enabled: boolean;
  desired_version: number;
  desired_checksum: string;
  desired_yaml: string | null;
  org_id: string;
  site_id: string;
}

async function reconcileSite(
  siteId: string
): Promise<{ site_id: string; upserted: number; removed: number; errors: string[] }> {
  const errors: string[] = [];

  // Call RPC: resolve_effective_automations
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_effective_automations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_site_id: siteId }),
  });
  if (!rpcRes.ok) {
    return { site_id: siteId, upserted: 0, removed: 0, errors: [await rpcRes.text()] };
  }
  const resolvedRows: ResolvedAutomation[] = await rpcRes.json();
  const resolvedKeys = resolvedRows.map((r) => r.automation_key);

  let upserted = 0;
  for (const row of resolvedRows) {
    // Fetch existing deployment
    const existRes = await fetch(
      `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?site_id=eq.${siteId}&automation_key=eq.${encodeURIComponent(row.automation_key)}&select=installed_checksum,installed_enabled,last_status&limit=1`,
      { headers }
    );
    const existRows = existRes.ok ? await existRes.json() : [];
    const existing = existRows[0] || null;

    let driftStatus = "pending";
    if (existing) {
      if (
        row.desired_checksum === existing.installed_checksum &&
        row.desired_enabled === existing.installed_enabled
      ) {
        driftStatus = "in_sync";
      } else if (existing.installed_checksum === null) {
        driftStatus = "unknown";
      } else if (existing.last_status === "failed") {
        driftStatus = "failed";
      } else {
        driftStatus = "out_of_sync";
      }
    } else {
      driftStatus = "unknown";
    }

    // Idempotent upsert: PATCH existing row, INSERT only if no row exists
    const payload = {
      org_id: row.org_id,
      site_id: siteId,
      automation_key: row.automation_key,
      resolved_template_id: row.resolved_template_id,
      desired_enabled: row.desired_enabled,
      desired_version: row.desired_version,
      desired_checksum: row.desired_checksum,
      desired_yaml: row.desired_enabled ? row.desired_yaml : null,
      drift_status: driftStatus,
    };

    if (existing) {
      // Row exists — PATCH by composite key
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?site_id=eq.${siteId}&automation_key=eq.${encodeURIComponent(row.automation_key)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        }
      );
      if (!patchRes.ok) {
        errors.push(`patch ${row.automation_key}: ${await patchRes.text()}`);
      } else {
        upserted++;
      }
    } else {
      // No existing row — INSERT
      const insertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        }
      );
      if (!insertRes.ok) {
        errors.push(`insert ${row.automation_key}: ${await insertRes.text()}`);
      } else {
        upserted++;
      }
    }
  }

  // Handle orphans
  let removed = 0;
  const allDepRes = await fetch(
    `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?site_id=eq.${siteId}&select=automation_key,installed_checksum`,
    { headers }
  );
  const allDeployments = allDepRes.ok ? await allDepRes.json() : [];

  const orphanKeys = allDeployments.filter(
    (d: { automation_key: string }) => !resolvedKeys.includes(d.automation_key)
  );

  for (const orphan of orphanKeys) {
    const newDrift = orphan.installed_checksum ? "out_of_sync" : "in_sync";
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?site_id=eq.${siteId}&automation_key=eq.${encodeURIComponent(orphan.automation_key)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          desired_enabled: false,
          desired_yaml: null,
          drift_status: newDrift,
        }),
      }
    );

    if (!updateRes.ok) {
      errors.push(`orphan ${orphan.automation_key}: ${await updateRes.text()}`);
    } else {
      removed++;
    }
  }

  return { site_id: siteId, upserted, removed, errors };
}

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();
    const { site_id } = body;

    let sites: string[];
    if (site_id) {
      sites = [site_id];
    } else {
      const sitesRes = await fetch(
        `${SUPABASE_URL}/rest/v1/a_sites?select=site_id`,
        { headers }
      );
      if (!sitesRes.ok) {
        return json({ error: await sitesRes.text() }, 500);
      }
      const allSites = await sitesRes.json();
      sites = allSites.map((s: { site_id: string }) => s.site_id);
    }

    const results = [];
    for (const sid of sites) {
      const result = await reconcileSite(sid);
      results.push(result);
    }

    return json({
      success: true,
      sites_processed: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
