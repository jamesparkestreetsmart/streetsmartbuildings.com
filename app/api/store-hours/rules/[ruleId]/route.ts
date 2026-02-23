import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params;

  if (!ruleId) {
    return NextResponse.json({ error: "Missing ruleId" }, { status: 400 });
  }

  // Get from_date from query params
  const { searchParams } = new URL(req.url);
  const fromDate = searchParams.get("from_date"); // YYYY-MM-DD or null

  // Parse body for created_by (optional)
  let createdBy = "system";
  try {
    const body = await req.json();
    if (body?.created_by) createdBy = body.created_by;
  } catch {
    // No body or invalid JSON — use default
  }

  try {
    // 1. Fetch the rule info (for logging and logic)
    const { data: rule } = await supabase
      .from("b_store_hours_exception_rules")
      .select("name, site_id, event_type, rule_type, effective_from_date, effective_to_date")
      .eq("rule_id", ruleId)
      .single();

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Single-date rules always get fully deleted
    const isSingleDate = rule.rule_type === "single_date";

    if (!fromDate || isSingleDate) {
      // ── FULL DELETE (original behavior) ──
      const { error: eventsError } = await supabase
        .from("b_store_hours_events")
        .delete()
        .eq("rule_id", ruleId);

      if (eventsError) throw eventsError;

      const { error: ruleError } = await supabase
        .from("b_store_hours_exception_rules")
        .update({ retired: true })
        .eq("rule_id", ruleId);

      if (ruleError) throw ruleError;

      await logDeletion(rule, ruleId, "full", createdBy);

      return NextResponse.json({ success: true, mode: "full_delete" });

    } else {
      // ── PARTIAL DELETE (from_date and beyond) ──

      // Delete events on or after from_date
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("b_store_hours_events")
        .delete()
        .eq("rule_id", ruleId)
        .gte("event_date", fromDate)
        .select("event_id");

      if (eventsError) throw eventsError;

      const deletedCount = deletedEvents?.length || 0;

      // Cap the rule's effective_to_date to the day before from_date
      const capDate = subtractOneDay(fromDate);

      const { error: updateError } = await supabase
        .from("b_store_hours_exception_rules")
        .update({ effective_to_date: capDate })
        .eq("rule_id", ruleId);

      if (updateError) throw updateError;

      // Check if any events remain
      const { count } = await supabase
        .from("b_store_hours_events")
        .select("event_id", { count: "exact", head: true })
        .eq("rule_id", ruleId);

      // If no events remain, retire the rule
      if (count === 0) {
        await supabase
          .from("b_store_hours_exception_rules")
          .update({ retired: true })
          .eq("rule_id", ruleId);
      }

      await logDeletion(rule, ruleId, "partial", createdBy, fromDate, deletedCount);

      return NextResponse.json({
        success: true,
        mode: "partial_delete",
        events_removed: deletedCount,
        capped_to: capDate,
      });
    }

  } catch (err: any) {
    console.error("Delete rule failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete rule" },
      { status: 500 }
    );
  }
}

// ── Helper: subtract one day from YYYY-MM-DD ──
function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z"); // noon UTC to avoid timezone edge cases
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Helper: log deletion to b_records_log ──
async function logDeletion(
  rule: any,
  ruleId: string,
  mode: "full" | "partial",
  createdBy: string,
  fromDate?: string,
  deletedCount?: number
) {
  try {
    const { data: site } = await supabase
      .from("a_sites")
      .select("org_id, timezone")
      .eq("site_id", rule.site_id)
      .single();

    const siteTz = site?.timezone || "America/Chicago";
    const localDate = new Date().toLocaleDateString("en-CA", { timeZone: siteTz });

    const message =
      mode === "full"
        ? `Deleted '${rule.name}'`
        : `Deleted '${rule.name}' events from ${fromDate} onward (${deletedCount} removed)`;

    await supabase.from("b_records_log").insert({
      org_id: site?.org_id,
      site_id: rule.site_id,
      event_type: "store_hours_rule_deleted",
      source: "store_hours_ui",
      message,
      metadata: {
        rule_id: ruleId,
        rule_name: rule.name,
        event_type: rule.event_type,
        delete_mode: mode,
        from_date: fromDate || null,
        events_removed: deletedCount || null,
      },
      created_by: createdBy,
      event_date: localDate,
    });
  } catch (err) {
    console.error("Failed to log deletion:", err);
  }
}
