import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

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

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** POST — generate a signed upload URL for commissioning photo */
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

  const { contentType, fileSizeBytes, filename } = body || {};

  if (!contentType || !fileSizeBytes || !filename) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (fileSizeBytes > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
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

  const ext = filename.split(".").pop() || "jpg";
  const storagePath = `commissioning/${device.org_id || "no-org"}/${device.site_id || "no-site"}/${deviceid}/${randomUUID()}.${ext}`;

  const { data, error } = await svc.storage
    .from("commissioning")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("Signed upload URL error:", error);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    storagePath,
  });
}
