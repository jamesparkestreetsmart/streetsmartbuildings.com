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

interface AckResult {
  automation_key: string;
  installed_version: number;
  installed_checksum: string;
  installed_enabled: boolean | null;
  success: boolean;
  error: string | null;
}

interface AckPayload {
  site_id: string;
  acknowledged_at: string;
  bundle_version_applied: string;
  results: AckResult[];
}

Deno.serve(async (req: Request) => {
  try {
    const body: AckPayload = await req.json();
    const { site_id, acknowledged_at, bundle_version_applied, results } = body;

    if (!site_id || !results?.length) {
      return json({ error: "site_id and results[] required" }, 400);
    }

    const ackTime = acknowledged_at || new Date().toISOString();
    const processed: Array<{ automation_key: string; drift_status: string; error?: string }> = [];

    for (const result of results) {
      // Fetch existing deployment
      const depRes = await fetch(
        `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?site_id=eq.${site_id}&automation_key=eq.${encodeURIComponent(result.automation_key)}&select=deployment_id,desired_checksum,desired_enabled,desired_version,org_id,resolved_template_id&limit=1`,
        { headers }
      );
      const depRows = depRes.ok ? await depRes.json() : [];
      const dep = depRows[0] || null;

      if (!dep) {
        processed.push({
          automation_key: result.automation_key,
          drift_status: "unknown",
          error: depRes.ok ? "deployment row not found" : await depRes.text(),
        });
        continue;
      }

      let driftStatus: string;
      if (!result.success) {
        driftStatus = "failed";
      } else if (
        dep.desired_checksum === result.installed_checksum &&
        dep.desired_enabled === result.installed_enabled
      ) {
        driftStatus = "in_sync";
      } else {
        driftStatus = "out_of_sync";
      }

      const lastStatus = result.success ? "acknowledged" : "failed";

      const updatePayload: Record<string, unknown> = {
        installed_version: result.installed_version,
        installed_checksum: result.installed_checksum,
        installed_enabled: result.installed_enabled,
        last_pushed_at: ackTime,
        last_status: lastStatus,
        last_error: result.error || null,
        drift_status: driftStatus,
      };
      if (result.success) {
        updatePayload.last_success_at = ackTime;
      }

      // Update deployment
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/c_ha_automation_deployments?deployment_id=eq.${dep.deployment_id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateRes.ok) {
        processed.push({
          automation_key: result.automation_key,
          drift_status: driftStatus,
          error: await updateRes.text(),
        });
        continue;
      }

      // Insert deployment log
      await fetch(
        `${SUPABASE_URL}/rest/v1/c_ha_automation_deployment_log`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            deployment_id: dep.deployment_id,
            resolved_template_id: dep.resolved_template_id,
            org_id: dep.org_id,
            site_id,
            automation_key: result.automation_key,
            desired_version: dep.desired_version,
            desired_checksum: dep.desired_checksum,
            attempted_at: ackTime,
            completed_at: ackTime,
            result: result.success ? "success" : "failed",
            error_text: result.error || null,
            response_payload: result,
            manifest_revision: bundle_version_applied,
          }),
        }
      );

      processed.push({ automation_key: result.automation_key, drift_status: driftStatus });
    }

    return json({ success: true, processed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
