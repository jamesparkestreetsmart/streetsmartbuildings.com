/**
 * One-time script: Fix duplicate "Inventory Closet" equipment
 *
 * Run with: npx tsx scripts/fix-duplicate-equipment.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const ORG_ID = "75d9a833-0359-4042-b760-4e5d587798e6";

// Tables that may reference equipment_id
const FK_TABLES = [
  "a_equipment_served_spaces",
  "a_devices",
  "a_sensors",
  "a_hvac_zones",
  "a_spaces",
  "b_compressor_cycles",
  "b_anomaly_events",
  "b_alert_overrides",
  "b_alert_instances",
  "b_zone_setpoint_log",
  "b_records_log",
];

async function main() {
  console.log("=== Duplicate Equipment Fix Script ===\n");

  // ── Step 1: Find duplicate Inventory Closet rows ──
  console.log("Step 1: Finding Inventory Closet rows...");
  const { data: matches, error: matchErr } = await supabase
    .from("a_equipments")
    .select("equipment_id, equipment_name, site_id, equipment_group, equipment_type_id, status, created_at")
    .eq("org_id", ORG_ID)
    .ilike("equipment_name", "%inventory closet%")
    .order("created_at", { ascending: true });

  if (matchErr) {
    console.error("Query error:", matchErr.message);
    process.exit(1);
  }

  console.log(`Found ${matches?.length || 0} rows:\n`);
  for (const row of matches || []) {
    console.log(`  ID: ${row.equipment_id}`);
    console.log(`  Name: ${row.equipment_name}`);
    console.log(`  Site: ${row.site_id}`);
    console.log(`  Group: ${row.equipment_group}`);
    console.log(`  Status: ${row.status}`);
    console.log(`  Created: ${row.created_at}`);
    console.log();
  }

  if (!matches || matches.length < 2) {
    console.log("No duplicates found (need at least 2 rows). Exiting.");
    process.exit(0);
  }

  // Filter to non-retired rows at the same site
  const active = matches.filter((r) => r.status !== "retired");
  const bySite: Record<string, typeof matches> = {};
  for (const row of active) {
    const key = `${row.site_id}::${row.equipment_name.toLowerCase()}`;
    if (!bySite[key]) bySite[key] = [];
    bySite[key].push(row);
  }

  const dupGroups = Object.values(bySite).filter((g) => g.length > 1);
  if (dupGroups.length === 0) {
    console.log("No active duplicates at the same site. Exiting.");
    process.exit(0);
  }

  for (const group of dupGroups) {
    console.log(`\nProcessing duplicate group: "${group[0].equipment_name}" at site ${group[0].site_id}`);
    console.log(`  ${group.length} active rows\n`);

    // ── Step 2: Count FK references for each to identify canonical ──
    console.log("Step 2: Counting FK references...");
    const refCounts: Record<string, Record<string, number>> = {};
    const totalRefs: Record<string, number> = {};

    for (const row of group) {
      refCounts[row.equipment_id] = {};
      totalRefs[row.equipment_id] = 0;

      for (const table of FK_TABLES) {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("equipment_id", row.equipment_id);

        const c = error ? 0 : (count ?? 0);
        refCounts[row.equipment_id][table] = c;
        totalRefs[row.equipment_id] += c;
      }

      console.log(`  ${row.equipment_id} (created ${row.created_at}): ${totalRefs[row.equipment_id]} total refs`);
      for (const [table, c] of Object.entries(refCounts[row.equipment_id])) {
        if (c > 0) console.log(`    ${table}: ${c}`);
      }
    }

    // Canonical = most references, tie-break by oldest
    const sorted = [...group].sort((a, b) => {
      const refDiff = totalRefs[b.equipment_id] - totalRefs[a.equipment_id];
      if (refDiff !== 0) return refDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    console.log(`\n  Canonical: ${canonical.equipment_id} (${totalRefs[canonical.equipment_id]} refs)`);
    for (const dup of duplicates) {
      console.log(`  Duplicate: ${dup.equipment_id} (${totalRefs[dup.equipment_id]} refs)`);
    }

    // ── Step 3: Remap FK references from each duplicate to canonical ──
    for (const dup of duplicates) {
      console.log(`\nStep 3: Remapping refs from ${dup.equipment_id} → ${canonical.equipment_id}...`);

      for (const table of FK_TABLES) {
        const before = refCounts[dup.equipment_id][table];
        if (before === 0) continue;

        const { error: updateErr } = await supabase
          .from(table)
          .update({ equipment_id: canonical.equipment_id })
          .eq("equipment_id", dup.equipment_id);

        if (updateErr) {
          console.error(`  ERROR remapping ${table}: ${updateErr.message}`);
          continue;
        }

        // Verify
        const { count: after } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("equipment_id", dup.equipment_id);

        console.log(`  ${table}: ${before} → ${after ?? "?"} remaining on duplicate`);
      }

      // ── Step 4: Soft-retire the duplicate ──
      console.log(`\nStep 4: Retiring duplicate ${dup.equipment_id}...`);
      const { error: retireErr } = await supabase
        .from("a_equipments")
        .update({ status: "retired" })
        .eq("equipment_id", dup.equipment_id);

      if (retireErr) {
        console.error(`  ERROR retiring: ${retireErr.message}`);
      } else {
        console.log(`  Retired successfully (status → retired).`);
      }
    }
  }

  // ── Step 5: Org-wide duplicate scan ──
  console.log("\n=== Org-Wide Duplicate Scan ===\n");
  const { data: allEquip } = await supabase
    .from("a_equipments")
    .select("equipment_id, equipment_name, site_id")
    .eq("org_id", ORG_ID)
    .neq("status", "retired")
    .order("site_id")
    .order("equipment_name");

  const siteNameGroups: Record<string, string[]> = {};
  for (const eq of allEquip || []) {
    const key = `${eq.site_id}::${eq.equipment_name.toLowerCase()}`;
    if (!siteNameGroups[key]) siteNameGroups[key] = [];
    siteNameGroups[key].push(eq.equipment_id);
  }

  const otherDups = Object.entries(siteNameGroups).filter(([, ids]) => ids.length > 1);
  if (otherDups.length === 0) {
    console.log("No other duplicates found. Clean!");
  } else {
    console.log(`Found ${otherDups.length} other duplicate group(s):`);
    for (const [key, ids] of otherDups) {
      console.log(`  ${key}: ${ids.length} rows (${ids.join(", ")})`);
    }
  }

  // ── Step 6: Unique index instructions ──
  console.log("\n=== Unique Index ===\n");
  console.log("To prevent recurrence, run this SQL in Supabase SQL Editor:");
  console.log(`
  CREATE UNIQUE INDEX IF NOT EXISTS uq_a_equipments_site_name_active
  ON a_equipments (site_id, lower(equipment_name))
  WHERE status != 'retired';
  `);

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
