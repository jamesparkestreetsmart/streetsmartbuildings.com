import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/sop-templates
 * Returns all templates (they're globally readable).
 */
export async function GET() {
  const { data, error } = await supabase
    .from("a_sop_templates")
    .select("*")
    .order("target_kind")
    .order("metric")
    .order("label");

  if (error) {
    console.error("[sop-templates] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data || [] });
}

/**
 * POST /api/sop-templates — Create a new template.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const row = {
    target_kind: body.target_kind,
    label: body.label,
    metric: body.metric,
    unit: body.unit,
    min_value: body.min_value ?? null,
    max_value: body.max_value ?? null,
    evaluation_window: body.evaluation_window || "all_hours",
    notes: body.notes || null,
    created_by: body.created_by || null,
  };

  const { data, error } = await supabase
    .from("a_sop_templates")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("[sop-templates] POST error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}

/**
 * PATCH /api/sop-templates — Update a template.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (fields.label !== undefined) updates.label = fields.label;
  if (fields.metric !== undefined) updates.metric = fields.metric;
  if (fields.unit !== undefined) updates.unit = fields.unit;
  if (fields.target_kind !== undefined) updates.target_kind = fields.target_kind;
  if (fields.min_value !== undefined) updates.min_value = fields.min_value;
  if (fields.max_value !== undefined) updates.max_value = fields.max_value;
  if (fields.evaluation_window !== undefined) updates.evaluation_window = fields.evaluation_window;
  if (fields.notes !== undefined) updates.notes = fields.notes;

  const { data, error } = await supabase
    .from("a_sop_templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[sop-templates] PATCH error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}

/**
 * DELETE /api/sop-templates?id=...
 * Blocked by ON DELETE RESTRICT if assignments reference this template.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase.from("a_sop_templates").delete().eq("id", id);

  if (error) {
    console.error("[sop-templates] DELETE error:", error.message);
    const msg = error.message.includes("violates foreign key")
      ? "Cannot delete template — it has active assignments. Retire them first."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
