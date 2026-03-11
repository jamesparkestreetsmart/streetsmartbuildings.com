import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth/requireAdminRole";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const ISSUES = [
  {
    title: "b_smart_start_log 400 — zone_id column does not exist",
    issue_type: "bug",
    severity: "medium",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "PostgREST 400 on every Smart Start read and write. Code was querying zone_id which was never a column on b_smart_start_log. Fixed by switching to device_id as the lookup key via zone.thermostat_device_id.",
    lessons_learned: "Always verify column names against information_schema before assuming a query is correct. Smart Start writes were silently failing on every cycle.",
  },
  {
    title: "Alert override 400s — phantom columns on b_alert_overrides",
    issue_type: "bug",
    severity: "high",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "b_alert_overrides queries referenced alert_def_id, sustain_override_min, silence_reason, created_by — none of which exist on the table. Evaluator was erroring every cycle. Fixed with Phase 1 stub + Phase 2 canonical alert_type_id architecture.",
    lessons_learned: "Schema drift happens when code references columns that were planned but never migrated. The alert override architecture was redesigned around canonical library_alert_types.alert_type_id values.",
  },
  {
    title: "a_users last_activity_at column missing",
    issue_type: "bug",
    severity: "low",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "ActivityTracker component was writing to last_activity_at every 5 minutes but the column was never created. Fixed by adding the column via ALTER TABLE ADD COLUMN IF NOT EXISTS.",
    lessons_learned: "Component code can be correct while the underlying schema is missing. Always verify columns exist when a PostgREST 400/204 error appears.",
  },
  {
    title: "Admin c_ API routes missing table prefix",
    issue_type: "bug",
    severity: "high",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "All eight admin API routes were querying platform_issues, work_items, learnings, item_comments — missing the c_ prefix. Also .eq(\"id\") instead of the real PK column names. Fixed with global find-and-replace across all route files.",
    lessons_learned: "Table naming conventions must be enforced in code review. The c_ prefix is part of the table name, not just a namespace hint.",
  },
  {
    title: "Organization Activity showing 0 events",
    issue_type: "bug",
    severity: "medium",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "Default activeScopes was [\"org\"] only, filtering out all site/equipment/device level records which is where most real activity lives. Fixed by defaulting to all scopes.",
    lessons_learned: "Scope filters that default too narrowly can make a working feature look broken. Always check filter state before assuming data is missing.",
  },
  {
    title: "My Journey page — two tabs instead of one unified view",
    issue_type: "ux",
    severity: "medium",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "SSB Platform Journey and Org Journey tabs were separate. Collapsed into one unified page. SSB1 nav label now dynamic. Removed Integration Roadmap and marketing content.",
    lessons_learned: "When SSB-specific and customer-facing content live in the same component, they eventually diverge and create confusion. Explicit SSB1 org detection and separate rendering is cleaner.",
  },
  {
    title: "Status filter All does not include resolved/closed items",
    issue_type: "ux",
    severity: "low",
    status: "resolved",
    source: "manual",
    target_sprint: "SSB-Sprint-5",
    latest_note: "Empty string was used for both initial state and All option value, causing default filter to always apply. Fixed with __default__ sentinel for initial load vs true All.",
    lessons_learned: "Using the same value for \"no selection\" and \"all records\" is a classic filter bug. Use a sentinel value for the default state.",
  },
];

const WORK_ITEMS = [
  {
    title: "Cron lock winner tracking instrumentation",
    work_type: "feature",
    status: "done",
    priority: "high",
    area: "devops",
    sprint_label: "SSB-Sprint-5",
    owner: "James",
    latest_note: "Added owner_run_id, last_heartbeat_at, last_step to b_cron_locks. Winner writes identity on acquire. Loser logs current owner state on skip. Heartbeats fire-and-forget before each major step.",
    lessons_learned: "Observability should be added before attempting fixes on mysterious recurring failures. The winner tracking is what made the root cause findable.",
  },
  {
    title: "Alert override canonical architecture — Phase 1 + 2",
    work_type: "feature",
    status: "done",
    priority: "high",
    area: "alerts",
    sprint_label: "SSB-Sprint-5",
    owner: "James",
    latest_note: "Phase 1 stubbed fetchOverrides to return []. Phase 2 implemented canonical alert_type_id mapping, shared lib/alert-type-mapping.ts, scoped override fetch, equipment > site > org precedence, CRUD route updated.",
    lessons_learned: "Two-phase implementation (stub to unblock, then architect correctly) prevents new bugs from being introduced while fixing existing ones.",
  },
  {
    title: "SSB1's Journey page redesign",
    work_type: "feature",
    status: "done",
    priority: "medium",
    area: "journey",
    sprint_label: "SSB-Sprint-5",
    owner: "James",
    latest_note: "Collapsed two-tab structure. Dynamic nav label for SSB1 org. Removed marketing content. Fixed Organization Activity scope. Added Global Push controls. Added Platform Issues panel.",
  },
  {
    title: "Admin internal tracking tables — c_platform_issues, c_work_items, c_learnings, c_item_comments",
    work_type: "feature",
    status: "in_progress",
    priority: "high",
    area: "admin",
    sprint_label: "SSB-Sprint-5",
    owner: "James",
    acceptance_criteria: "All four tables live in DB. Admin panels working with add/edit/comment. Activity feeds b_records_log. Status filters working correctly.",
    latest_note: "Tables created, API routes fixed, filter bug fixed. Comments and b_records_log wiring still to verify end to end.",
  },
  {
    title: "Add Global Push and Global Save + Push to customer org My Journey pages",
    work_type: "feature",
    status: "planned",
    priority: "medium",
    area: "journey",
    sprint_label: "SSB-Sprint-6",
    owner: "James",
    latest_note: "Global Push controls were added to SSB1's Journey for SSB Global Profiles. Same functionality needs to be surfaced on standard My Journey pages for customer orgs managing their own org-level thermostat profiles.",
  },
  {
    title: "SMS alert delivery — phone notifications not working",
    work_type: "task",
    status: "open",
    priority: "critical",
    area: "alerts",
    sprint_label: "SSB-Sprint-6",
    owner: "James",
    latest_note: "No SMS alerts are being received on phone. Alert system generates alerts but SMS delivery has not been confirmed working end to end. Need to diagnose provider config, phone number setup, and delivery logs.",
    acceptance_criteria: "Test alert fires and is received as SMS on James's phone within 2 minutes.",
  },
  {
    title: "Security and quality audit — remaining waves",
    work_type: "task",
    status: "planned",
    priority: "high",
    area: "devops",
    sprint_label: "SSB-Sprint-6",
    owner: "James",
    latest_note: "Wave 2 was queued (HA API response validation, cron overlap protection, webhook idempotency, profile 400 error, zone type validation). Need to confirm which waves are complete and which remain outstanding before next audit cycle.",
    acceptance_criteria: "All outstanding audit wave findings resolved and regression tested.",
  },
  {
    title: "Individual anomaly detail page",
    work_type: "feature",
    status: "planned",
    priority: "medium",
    area: "alerts",
    sprint_label: "SSB-Sprint-7",
    owner: "James",
    latest_note: "Each anomaly detection event should have its own drilldown page showing full context — equipment, timestamps, sensor readings, cycle data, alert history, and resolution status. Currently anomalies are only visible in list/table views.",
    acceptance_criteria: "Clicking an anomaly event opens a dedicated page with full event context and linked equipment data.",
  },
  {
    title: "Anomaly threshold tracker reset button",
    work_type: "task",
    status: "planned",
    priority: "medium",
    area: "alerts",
    sprint_label: "SSB-Sprint-7",
    owner: "James",
    latest_note: "The anomaly threshold tracker needs a reset button to clear accumulated state. Current behavior unclear — need to review what the reset should do (clear running averages, reset to profile defaults, or clear override values) before implementing.",
    acceptance_criteria: "Reset behavior defined and documented. Button implemented and tested against PARK org test site.",
  },
  {
    title: "Extract shared alert-type-mapping helper",
    work_type: "tech_debt",
    status: "done",
    priority: "medium",
    area: "alerts",
    sprint_label: "SSB-Sprint-5",
    owner: "James",
    latest_note: "Duplicate mapDefinitionToAlertTypeId extracted from evaluator and AlertRulesManager into lib/alert-type-mapping.ts. Both consumers now import from shared helper.",
  },
  {
    title: "b_cron_locks unique index shape correction",
    work_type: "tech_debt",
    status: "done",
    priority: "medium",
    area: "devops",
    sprint_label: "SSB-Sprint-5",
    owner: "James",
    latest_note: "Previous migration had wrong unique index on alert_type_id alone. Replaced with three partial indexes by scope level: org, site, equipment. Equipment index excludes site_id since equipment_ids are globally unique.",
  },
];

const LEARNINGS = [
  {
    title: "Vercel serverless — always release locks before returning response",
    category: "devops",
    summary: "In Vercel serverless functions, the runtime may kill the process after the response is sent, before finally blocks execute. Any critical cleanup (lock release, state writes) must happen before the return statement, not in finally. Keep finally as an idempotent safety net only.",
  },
  {
    title: "PostgREST UPDATE response quirk — never trust .select() for ownership confirmation",
    category: "database",
    summary: "PostgREST .update().eq(...).select() can return an empty array even when the UPDATE succeeded, depending on RLS policies, schema cache state, and filter conditions. Never use the UPDATE response to confirm row ownership. Always read back independently and compare a known field (e.g. owner_run_id) to confirm acquisition.",
  },
  {
    title: "Polymorphic FK tables require a check constraint for exactly one parent",
    category: "database",
    summary: "When a table uses nullable FK columns to reference multiple possible parent tables (polymorphic association), always add a CHECK constraint enforcing exactly one parent is non-null. Without it, rows with zero or multiple parents are valid and will eventually corrupt the system through API bugs, bad payloads, or manual edits.",
  },
  {
    title: "Wave-based spec → peer review → implement workflow",
    category: "process",
    summary: "For AI-driven code changes, always: (1) write a spec, (2) peer review the spec before sending, (3) implement in phases with explicit stop points. This prevents Claude from baking in wrong assumptions, introducing migration churn, or solving the wrong problem. Phase 1 should always unblock first; Phase 2 implements the correct architecture.",
  },
  {
    title: "Schema drift — always verify columns against information_schema before debugging behavior",
    category: "database",
    summary: "When a PostgREST 400 or PGRST204 error appears, the first check should always be information_schema.columns to confirm the queried columns actually exist. Code can be correct while the schema is wrong, and vice versa. Never assume the schema matches the code.",
  },
  {
    title: "Two-phase implementation pattern for risky changes",
    category: "architecture",
    summary: "When a system component is broken and the correct architecture requires significant redesign, always do Phase 1 (stub/unblock with no behavior change) before Phase 2 (correct implementation). This keeps the system running while the real fix is designed, and prevents rushed architecture decisions made under pressure to fix a live error.",
  },
];

// ---------------------------------------------------------------------------
// Helper: insert + log (mirrors POST route logic)
// ---------------------------------------------------------------------------

async function insertAndLog(
  table: string,
  record: Record<string, any>,
  targetType: string,
  idColumn: string,
  email: string
) {
  const { data, error } = await supabase
    .from(table)
    .insert({ ...record, org_id: SSB_ORG_ID })
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message, title: record.title };
  }

  // Log to b_records_log — same pattern as POST routes
  await supabase.from("b_records_log").insert({
    org_id: SSB_ORG_ID,
    event_type: `${targetType}_created`,
    event_date: new Date().toISOString().split("T")[0],
    message: `Created ${targetType.replace(/_/g, " ")}: ${data.title}`,
    source: "admin_tracking",
    created_by: email,
  });

  return { ok: true, id: data[idColumn], title: data.title };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Auth check — must be SSB1 member
  const auth = await getAuthUser();
  if (auth instanceof NextResponse) return auth;
  const { userId, email } = auth;

  const { data: membership } = await supabase
    .from("a_orgs_users_memberships")
    .select("org_id, a_organizations!inner(org_identifier, parent_org_id)")
    .eq("user_id", userId);

  const isSSB = membership?.some(
    (m: any) => m.a_organizations?.org_identifier === "SSB1" && !m.a_organizations?.parent_org_id
  );

  if (!isSSB) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = {
    platform_issues: [] as any[],
    work_items: [] as any[],
    learnings: [] as any[],
  };

  // Insert platform issues
  for (const issue of ISSUES) {
    const r = await insertAndLog("c_platform_issues", issue, "platform_issue", "issue_id", email);
    results.platform_issues.push(r);
  }

  // Insert work items
  for (const item of WORK_ITEMS) {
    const r = await insertAndLog("c_work_items", item, "work_item", "work_item_id", email);
    results.work_items.push(r);
  }

  // Insert learnings
  for (const learning of LEARNINGS) {
    const r = await insertAndLog("c_learnings", learning, "learning", "learning_id", email);
    results.learnings.push(r);
  }

  const issuesOk = results.platform_issues.filter((r) => r.ok).length;
  const workOk = results.work_items.filter((r) => r.ok).length;
  const learningsOk = results.learnings.filter((r) => r.ok).length;

  return NextResponse.json({
    summary: {
      c_platform_issues: `${issuesOk} of ${ISSUES.length}`,
      c_work_items: `${workOk} of ${WORK_ITEMS.length}`,
      c_learnings: `${learningsOk} of ${LEARNINGS.length}`,
    },
    details: results,
  });
}
