import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCallerUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// GET ?org_id=X — returns org templates + global templates (globals first)
// GET ?org_id=X&scope=all — SSB only: returns ALL templates across all orgs
export async function GET(req: NextRequest) {
  try {
    const orgId = req.nextUrl.searchParams.get("org_id");
    const scope = req.nextUrl.searchParams.get("scope");
    if (!orgId) return NextResponse.json({ error: "org_id required" }, { status: 400 });

    // scope=all: SSB org can browse ALL templates across all orgs
    if (scope === "all") {
      const { data: callerOrg } = await supabase
        .from("a_organizations")
        .select("parent_org_id")
        .eq("org_id", orgId)
        .single();

      if (!callerOrg || callerOrg.parent_org_id !== null) {
        return NextResponse.json({ error: "scope=all is only available for SSB org" }, { status: 403 });
      }

      const { data, error } = await supabase
        .from("b_store_hours_templates")
        .select("*, a_organizations!inner(org_name)")
        .order("is_global", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const templates = (data || []).map((t: any) => ({
        ...t,
        org_name: t.a_organizations?.org_name || null,
        a_organizations: undefined,
      }));

      return NextResponse.json({ templates });
    }

    // Default: org's own templates + globals
    const { data, error } = await supabase
      .from("b_store_hours_templates")
      .select("*")
      .or(`org_id.eq.${orgId},is_global.eq.true`)
      .order("is_global", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ templates: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — creates template
export async function POST(req: NextRequest) {
  try {
    const userId = await getCallerUserId();
    const body = await req.json();
    const { org_id, template_name } = body;

    if (!org_id || !template_name?.trim()) {
      return NextResponse.json({ error: "org_id and template_name required" }, { status: 400 });
    }

    // Check if caller is SSB org (parent_org_id IS NULL) to allow is_global
    let isGlobal = false;
    if (body.is_global === true) {
      const { data: callerOrg } = await supabase
        .from("a_organizations")
        .select("parent_org_id")
        .eq("org_id", org_id)
        .single();
      if (callerOrg && callerOrg.parent_org_id === null) {
        isGlobal = true;
      }
    }

    const row: Record<string, any> = {
      org_id,
      template_name: template_name.trim(),
      is_global: isGlobal,
      created_by: userId,
    };

    for (const day of DAY_KEYS) {
      row[`${day}_open`] = body[`${day}_open`] ?? null;
      row[`${day}_close`] = body[`${day}_close`] ?? null;
      row[`${day}_closed`] = body[`${day}_closed`] ?? false;
    }

    const { data, error } = await supabase
      .from("b_store_hours_templates")
      .insert(row)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ template: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE ?template_id=X&org_id=Y — non-global only, 403 for globals
export async function DELETE(req: NextRequest) {
  try {
    const templateId = req.nextUrl.searchParams.get("template_id");
    const orgId = req.nextUrl.searchParams.get("org_id");

    if (!templateId || !orgId) {
      return NextResponse.json({ error: "template_id and org_id required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("b_store_hours_templates")
      .select("is_global, org_id")
      .eq("template_id", templateId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    if (existing.is_global) {
      return NextResponse.json({ error: "Cannot delete a global template" }, { status: 403 });
    }

    if (existing.org_id !== orgId) {
      return NextResponse.json({ error: "Template does not belong to this organization" }, { status: 403 });
    }

    const { error } = await supabase
      .from("b_store_hours_templates")
      .delete()
      .eq("template_id", templateId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
