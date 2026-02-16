// app/api/manifest/push/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { site_id, date } = body;

    if (!site_id) {
      return NextResponse.json({ error: "site_id required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // Call the push-daily-manifest edge function
    const res = await fetch(`${supabaseUrl}/functions/v1/push-daily-manifest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ site_id, date }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Manifest push failed:", data);
      return NextResponse.json(
        { error: data.error || "Manifest push failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Manifest push route error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}