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

/** GET — list commissioning assets with signed download URLs */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ deviceid: string }> }
) {
  const userId = await getCallerUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { deviceid } = await params;

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: assets, error } = await svc
    .from("b_device_commissioning_assets")
    .select("*")
    .eq("device_id", deviceid)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Assets query error:", error);
    return NextResponse.json({ error: "Failed to list assets" }, { status: 500 });
  }

  // Generate signed download URLs
  const withUrls = await Promise.all(
    (assets || []).map(async (asset) => {
      const { data } = await svc.storage
        .from("commissioning")
        .createSignedUrl(asset.storage_path, 3600);

      return {
        ...asset,
        downloadUrl: data?.signedUrl || null,
      };
    })
  );

  return NextResponse.json({ assets: withUrls });
}
