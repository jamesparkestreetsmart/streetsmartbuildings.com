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

type TargetType = "site" | "org" | "global" | "stale";

interface PushRequest {
  target_type: TargetType;
  target_id?: string;
  automation_key?: string;
}

Deno.serve(async (req: Request) => {
  try {
    const body: PushRequest = await req.json();
    const { target_type, target_id, automation_key } = body;

    if (!target_type) {
      return json({ error: "target_type required" }, 400);
    }

    let siteIds: string[] = [];

    switch (target_type) {
      case "site": {
        if (!target_id) {
          return json({ error: "target_id required for site target" }, 400);
        }
        siteIds = [target_id];
        break;
      }
      case "org": {
        if (!target_id) {
          return json({ error: "target_id required for org target" }, 400);
        }
        const orgRes = await fetch(
          `${SUPABASE_URL}/rest/v1/a_sites?org_id=eq.${target_id}&select=site_id`,
          { headers }
        );
        const orgSites = orgRes.ok ? await orgRes.json() : [];
        siteIds = orgSites.map((s: { site_id: string }) => s.site_id);
        break;
      }
      case "global": {
        const allRes = await fetch(
          `${SUPABASE_URL}/rest/v1/a_sites?select=site_id`,
          { headers }
        );
        const allSites = allRes.ok ? await allRes.json() : [];
        siteIds = allSites.map((s: { site_id: string }) => s.site_id);
        break;
      }
      case "stale": {
        let url = `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?select=site_id&drift_status=in.(out_of_sync,pending,failed)`;
        if (automation_key) {
          url += `&automation_key=eq.${encodeURIComponent(automation_key)}`;
        }
        const staleRes = await fetch(url, { headers });
        const staleDeps = staleRes.ok ? await staleRes.json() : [];
        const uniqueSites = new Set(staleDeps.map((d: { site_id: string }) => d.site_id));
        siteIds = [...uniqueSites];
        break;
      }
      default:
        return json({ error: `Invalid target_type: ${target_type}` }, 400);
    }

    if (siteIds.length === 0) {
      return json({ success: true, message: "No sites matched", affected: 0 });
    }

    const results: Array<{ site_id: string; deployments_pushed: number; errors: string[] }> = [];

    for (const siteId of siteIds) {
      const siteErrors: string[] = [];

      // Invoke reconcile-ha-automations via edge function
      const reconcileRes = await fetch(
        `${SUPABASE_URL}/functions/v1/reconcile-ha-automations`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ site_id: siteId }),
        }
      );
      if (!reconcileRes.ok) {
        siteErrors.push(`reconcile: ${await reconcileRes.text()}`);
      }

      // Fetch deployments
      let depUrl = `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?site_id=eq.${siteId}&select=deployment_id,automation_key,resolved_template_id,org_id,desired_version,desired_checksum`;
      if (automation_key) {
        depUrl += `&automation_key=eq.${encodeURIComponent(automation_key)}`;
      }
      const depRes = await fetch(depUrl, { headers });
      if (!depRes.ok) {
        siteErrors.push(`fetch deployments: ${await depRes.text()}`);
        results.push({ site_id: siteId, deployments_pushed: 0, errors: siteErrors });
        continue;
      }
      const deployments = await depRes.json();

      let pushed = 0;
      for (const dep of deployments) {
        const now = new Date().toISOString();

        // Update deployment status
        const updateRes = await fetch(
          `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?deployment_id=eq.${dep.deployment_id}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              last_status: "pushed",
              last_pushed_at: now,
              drift_status: "pending",
            }),
          }
        );

        if (!updateRes.ok) {
          siteErrors.push(`update ${dep.automation_key}: ${await updateRes.text()}`);
          continue;
        }

        // Insert deployment log
        const logRes = await fetch(
          `${SUPABASE_URL}/rest/v1/c_ha_automation_deployment_log`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              deployment_id: dep.deployment_id,
              resolved_template_id: dep.resolved_template_id,
              org_id: dep.org_id,
              site_id: siteId,
              automation_key: dep.automation_key,
              desired_version: dep.desired_version,
              desired_checksum: dep.desired_checksum,
              result: "pending",
            }),
          }
        );

        if (!logRes.ok) {
          siteErrors.push(`log ${dep.automation_key}: ${await logRes.text()}`);
        }

        pushed++;
      }

      results.push({ site_id: siteId, deployments_pushed: pushed, errors: siteErrors });
    }

    return json({
      success: true,
      sites_affected: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
