import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  let body;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    email,
    filename,
    contentType,
    fileSizeBytes,
    durationSeconds,
  } = body || {};

  if (
    !email ||
    !filename ||
    !contentType ||
    !fileSizeBytes ||
    !durationSeconds
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Server-side safety limits
  if (durationSeconds > 120) {
    return NextResponse.json(
      { error: "Video exceeds 2 minute limit" },
      { status: 400 }
    );
  }

  if (fileSizeBytes > 250 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Video exceeds 250MB limit" },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `temp/${randomUUID()}/${filename}`;

  const { data, error } = await supabase.storage
    .from("lead-videos")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("Signed upload URL error:", error);
    return NextResponse.json(
      { error: "Failed to create upload URL" },
      { status: 500 }
    );
  }

  // Look up lead_id from email
  const { data: lead } = await supabase
    .from("z_marketing_leads")
    .select("id")
    .eq("email", email)
    .limit(1)
    .single();

  const { error: insertError } = await supabase
    .from("z_marketing_lead_videos")
    .insert({
      lead_email: email,
      lead_id: lead?.id || null,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
      file_size_bytes: fileSizeBytes,
      status: "pending",
    });

  if (insertError) {
    console.error("Metadata insert error:", insertError);
    return NextResponse.json(
      { error: "Failed to record video metadata" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    storagePath,
  });
}