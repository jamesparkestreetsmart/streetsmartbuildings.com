import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  // await the promised params — Next.js 16 requirement
  const { slug } = await context.params;

  try {
    const body = await request.json();

    const { data, error } = await supabase
      .from("webhook_logs")
      .insert({
        site_slug: slug, 
        payload: body,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
