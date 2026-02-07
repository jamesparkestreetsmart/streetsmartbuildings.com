import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/marketing/scheduled-emails — fetch recent scheduled emails
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("z_scheduled_emails")
      .select(`
        id,
        email_type,
        send_at,
        status,
        sent_at,
        error,
        created_at,
        z_marketing_leads (
          email,
          first_name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ emails: data });
  } catch (err: any) {
    console.error("Failed to fetch scheduled emails:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch scheduled emails" },
      { status: 500 }
    );
  }
}
