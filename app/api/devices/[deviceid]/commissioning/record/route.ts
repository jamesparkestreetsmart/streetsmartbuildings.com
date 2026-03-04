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

/** POST — record commissioning asset metadata after upload completes */
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

  const { storagePath, notes, assetType } = body || {};
  if (!storagePath) {
    return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get device context
  const { data: device } = await svc
    .from("a_devices")
    .select("device_id, site_id, org_id")
    .eq("device_id", deviceid)
    .single();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  // Insert asset record
  const { error: insertError } = await svc
    .from("b_device_commissioning_assets")
    .insert({
      device_id: deviceid,
      site_id: device.site_id,
      org_id: device.org_id,
      asset_type: assetType || "label_photo",
      storage_path: storagePath,
      notes: notes || null,
      created_by: userId,
    });

  if (insertError) {
    console.error("Commissioning record insert error:", insertError);
    return NextResponse.json({ error: "Failed to record asset" }, { status: 500 });
  }

  // Update device commissioned_at
  await svc
    .from("a_devices")
    .update({
      commissioned_at: new Date().toISOString(),
      commissioned_by: userId,
    })
    .eq("device_id", deviceid);

  return NextResponse.json({ ok: true });
}
