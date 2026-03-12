import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data } = await s.from("a_equipments")
    .select("status, equipment_group")
    .eq("org_id", "75d9a833-0359-4042-b760-4e5d587798e6");

  const combos: Record<string, number> = {};
  for (const r of data || []) {
    combos[`${r.status} | ${r.equipment_group}`] = (combos[`${r.status} | ${r.equipment_group}`] || 0) + 1;
  }
  console.log("\nStatus | Group distribution:");
  for (const [k, v] of Object.entries(combos).sort()) {
    console.log(`  ${v}x  ${k}`);
  }
}
run();
