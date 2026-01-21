import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  req: NextRequest,
  { params }: { params: { rule_id: string } }
) {
  const ruleId = params.rule_id;

  if (!ruleId) {
    return NextResponse.json({ error: "Missing rule_id" }, { status: 400 });
  }

  try {
    // 1️⃣ Delete future events first (safety)
    const { error: eventsError } = await supabase
      .from("b_store_hours_events")
      .delete()
      .eq("rule_id", ruleId)
      .gte("event_date", new Date().toISOString().slice(0, 10));

    if (eventsError) throw eventsError;

    // 2️⃣ Retire the rule
    const { error: ruleError } = await supabase
      .from("b_store_hours_exception_rules")
      .update({ retired: true })
      .eq("rule_id", ruleId);

    if (ruleError) throw ruleError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete rule failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete rule" },
      { status: 500 }
    );
  }
}
