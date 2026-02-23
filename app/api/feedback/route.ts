import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sendFeedbackEmail } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCallerInfo(): Promise<{
  email: string;
  userId: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );
    const {
      data: { user },
    } = await authClient.auth.getUser();
    return { email: user?.email || "system", userId: user?.id || null };
  } catch {
    return { email: "system", userId: null };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email: userEmail, userId } = await getCallerInfo();

    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { subject, body: feedbackBody, org_id, org_name } = body;

    if (!subject?.trim() || !feedbackBody?.trim()) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      );
    }

    // Send email
    const emailResult = await sendFeedbackEmail({
      userEmail,
      orgName: org_name || "Unknown",
      subject: subject.trim(),
      body: feedbackBody.trim(),
    });

    if (!emailResult.success) {
      console.error("[feedback] Email send failed:", emailResult.error);
      return NextResponse.json(
        { error: "Failed to send feedback email" },
        { status: 500 }
      );
    }

    // Log to b_records_log
    try {
      await supabase.from("b_records_log").insert({
        org_id: org_id || null,
        site_id: null,
        event_type: "platform_feedback",
        event_date: new Date().toLocaleDateString("en-CA"),
        message: `Feedback: ${subject.trim()}`,
        source: "feedback",
        created_by: userEmail,
      });
    } catch (logErr) {
      console.error("[feedback] Failed to log to b_records_log:", logErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[feedback] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
