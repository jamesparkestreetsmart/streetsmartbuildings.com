import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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
  } catch { return null; }
}

/** POST — delete a commissioning asset (storage + DB) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceid: string }> }
) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { deviceid } = await params;

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { assetId } = body || {};
  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get asset to find storage path
  const { data: asset } = await svc
    .from("b_device_commissioning_assets")
    .select("id, storage_path, device_id")
    .eq("id", assetId)
    .eq("device_id", deviceid)
    .single();

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Delete from storage
  await svc.storage
    .from("commissioning")
    .remove([asset.storage_path]);

  // Delete from DB
  const { error } = await svc
    .from("b_device_commissioning_assets")
    .delete()
    .eq("id", assetId);

  if (error) {
    console.error("Asset delete error:", error);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
