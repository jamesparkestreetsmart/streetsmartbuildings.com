/**
 * One-time cleanup script: Deduplicate restored thermostat profiles
 *
 * Usage:
 *   DRY_RUN=true  npx tsx scripts/cleanup-duplicate-restored-profiles.ts   (default, preview only)
 *   DRY_RUN=false npx tsx scripts/cleanup-duplicate-restored-profiles.ts   (live run, writes to DB)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROFILE_FIELDS = [
  "occupied_heat_f", "occupied_cool_f", "occupied_fan_mode", "occupied_hvac_mode",
  "unoccupied_heat_f", "unoccupied_cool_f", "unoccupied_fan_mode", "unoccupied_hvac_mode",
  "guardrail_min_f", "guardrail_max_f",
  "manager_offset_up_f", "manager_offset_down_f", "manager_override_reset_minutes",
] as const;

function isRestoredName(name: string): boolean {
  return name.startsWith("Restored \u2014") || name.startsWith("Snapshot \u2014") || name.includes("(Restored ");
}

function fieldsMatch(a: any, b: any): boolean {
  for (const field of PROFILE_FIELDS) {
    const va = a[field];
    const vb = b[field];
    if (va == null && vb == null) continue;
    if (va == null || vb == null) return false;
    if (Number(va) !== Number(vb) && String(va) !== String(vb)) return false;
  }
  return true;
}

function fieldKey(profile: any): string {
  return PROFILE_FIELDS.map((f) => String(profile[f] ?? "null")).join("|");
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESTORED PROFILE DEDUP — ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE RUN"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Find candidate profiles
  console.log("Filter path: name-pattern only (no created_by/metadata columns available)");

  const { data: allSiteProfiles, error: fetchErr } = await supabase
    .from("b_thermostat_profiles")
    .select("*")
    .eq("scope", "site");

  if (fetchErr) {
    console.error("Failed to fetch profiles:", fetchErr.message);
    process.exit(1);
  }

  const candidates = (allSiteProfiles || []).filter((p: any) => isRestoredName(p.name));
  const skippedUserProfiles = (allSiteProfiles || []).filter((p: any) => !isRestoredName(p.name));

  console.log(`Total SITE profiles: ${allSiteProfiles?.length || 0}`);
  console.log(`Candidates (restored naming pattern): ${candidates.length}`);
  console.log(`Skipped (user-created): ${skippedUserProfiles.length}`);
  skippedUserProfiles.forEach((p: any) => console.log(`  SKIP: "${p.name}" (${p.profile_id})`));

  if (candidates.length === 0) {
    console.log("\nNo candidates found. Nothing to clean up.");
    return;
  }

  // Step 2: Group by org_id + field values (since site_id may be null)
  const groups: Record<string, any[]> = {};
  for (const p of candidates) {
    const key = `${p.org_id}::${fieldKey(p)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const dupeGroups = Object.entries(groups).filter(([, g]) => g.length > 1);
  console.log(`\nDuplicate groups found: ${dupeGroups.length}`);

  if (dupeGroups.length === 0) {
    console.log("No duplicates. Done.");
    return;
  }

  // Fetch all zone assignments for candidates
  const candidateIds = candidates.map((p: any) => p.profile_id);
  const { data: zoneAssignments } = await supabase
    .from("a_hvac_zones")
    .select("hvac_zone_id, profile_id, site_id")
    .in("profile_id", candidateIds);

  const zonesByProfile: Record<string, any[]> = {};
  for (const z of zoneAssignments || []) {
    if (!zonesByProfile[z.profile_id]) zonesByProfile[z.profile_id] = [];
    zonesByProfile[z.profile_id].push(z);
  }

  let totalDeleted = 0;
  let totalReassigned = 0;
  let totalSkipped = 0;

  for (const [groupKey, group] of dupeGroups) {
    console.log(`\n--- Group: ${groupKey.split("::")[0]} ---`);
    console.log(`  Profiles in group: ${group.length}`);
    group.forEach((p: any) => {
      const zones = zonesByProfile[p.profile_id] || [];
      console.log(`    ${p.profile_id} "${p.name}" — ${zones.length} zone(s) — created ${p.created_at}`);
    });

    // Step 3: Select survivor
    const sorted = [...group].sort((a, b) => {
      const aZones = (zonesByProfile[a.profile_id] || []).length;
      const bZones = (zonesByProfile[b.profile_id] || []).length;
      if (aZones !== bZones) return bZones - aZones; // most zone assignments first
      // Tie-break: most recent created_at
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const survivor = sorted[0];
    const nonSurvivors = sorted.slice(1);

    // Step 4: Rename survivor to most recent name
    const mostRecentByDate = [...group].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0];
    const newName = mostRecentByDate.name;

    console.log(`  SURVIVOR: ${survivor.profile_id} "${survivor.name}" (${(zonesByProfile[survivor.profile_id] || []).length} zones)`);
    if (survivor.name !== newName) {
      console.log(`  RENAME: "${survivor.name}" → "${newName}"`);
    }

    for (const ns of nonSurvivors) {
      const nsZones = zonesByProfile[ns.profile_id] || [];
      console.log(`  DELETE: ${ns.profile_id} "${ns.name}" (${nsZones.length} zones to reassign)`);
    }

    if (DRY_RUN) {
      totalDeleted += nonSurvivors.length;
      for (const ns of nonSurvivors) {
        totalReassigned += (zonesByProfile[ns.profile_id] || []).length;
      }
      continue;
    }

    // LIVE: Step 4 — Rename survivor
    if (survivor.name !== newName) {
      const { error: renameErr } = await supabase
        .from("b_thermostat_profiles")
        .update({ name: newName })
        .eq("profile_id", survivor.profile_id);
      if (renameErr) {
        console.error(`  ERROR renaming survivor: ${renameErr.message}`);
      }
    }

    // LIVE: Step 5 — Reassign zones
    for (const ns of nonSurvivors) {
      const nsZones = zonesByProfile[ns.profile_id] || [];
      for (const z of nsZones) {
        const { error: reassignErr } = await supabase
          .from("a_hvac_zones")
          .update({ profile_id: survivor.profile_id })
          .eq("hvac_zone_id", z.hvac_zone_id);
        if (reassignErr) {
          console.error(`  ERROR reassigning zone ${z.hvac_zone_id}: ${reassignErr.message}`);
          totalSkipped++;
          continue;
        }
        totalReassigned++;
        console.log(`  REASSIGNED zone ${z.hvac_zone_id} → survivor`);
      }
    }

    // LIVE: Step 6 — Delete non-survivors
    for (const ns of nonSurvivors) {
      // Pre-deletion verify: zero zone assignments remaining
      const { count } = await supabase
        .from("a_hvac_zones")
        .select("hvac_zone_id", { count: "exact", head: true })
        .eq("profile_id", ns.profile_id);

      if ((count || 0) > 0) {
        console.error(`  SKIP DELETE ${ns.profile_id} — still has ${count} zone assignments`);
        totalSkipped++;
        continue;
      }

      if (ns.scope !== "site") {
        console.error(`  SKIP DELETE ${ns.profile_id} — scope is "${ns.scope}", not "site"`);
        totalSkipped++;
        continue;
      }

      if (!isRestoredName(ns.name)) {
        console.error(`  SKIP DELETE ${ns.profile_id} — name "${ns.name}" does not match restored pattern`);
        totalSkipped++;
        continue;
      }

      const { error: delErr } = await supabase
        .from("b_thermostat_profiles")
        .delete()
        .eq("profile_id", ns.profile_id);

      if (delErr) {
        console.error(`  ERROR deleting ${ns.profile_id}: ${delErr.message}`);
        totalSkipped++;
      } else {
        totalDeleted++;
        console.log(`  DELETED ${ns.profile_id}`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY — ${DRY_RUN ? "DRY RUN" : "LIVE RUN"}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Duplicate groups: ${dupeGroups.length}`);
  console.log(`Profiles deleted: ${totalDeleted}`);
  console.log(`Zones reassigned: ${totalReassigned}`);
  console.log(`Profiles skipped: ${totalSkipped}`);
  console.log();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
