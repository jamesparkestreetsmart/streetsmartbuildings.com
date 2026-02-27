// app/api/cron/deliver-notifications/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processDeliveryQueue } from "@/lib/alert-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handler() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const result = await processDeliveryQueue(supabase);

  return NextResponse.json({
    message: result.sent > 0 || result.failed > 0
      ? `Processed: ${result.sent} sent, ${result.failed} failed`
      : "No pending notifications",
    ...result,
  });
}

export async function GET() { return handler(); }
export async function POST() { return handler(); }
