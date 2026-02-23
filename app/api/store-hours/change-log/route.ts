import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const site_id = req.nextUrl.searchParams.get("site_id");

  if (!site_id) {
    return NextResponse.json(
      { error: "Missing site_id" },
      { status: 400 }
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
      },
    }
  );

  // 1. Fetch base hours changes
  const { data: baseChanges, error: baseErr } = await supabase
    .from("b_store_hours_change_log")
    .select("*")
    .eq("site_id", site_id)
    .order("changed_at", { ascending: false })
    .limit(50);

  // 2. Fetch exception rule changes from records log
  const { data: ruleChanges, error: ruleErr } = await supabase
    .from("b_records_log")
    .select("*")
    .eq("site_id", site_id)
    .in("event_type", [
      "store_hours_rule_created",
      "store_hours_rule_edited",
      "store_hours_rule_deleted",
      "store_hours_event_comment",
    ])
    .order("created_at", { ascending: false })
    .limit(50);

  if (baseErr || ruleErr) {
    return NextResponse.json(
      { error: baseErr?.message || ruleErr?.message },
      { status: 500 }
    );
  }

  // 3. Resolve changed_by UUIDs to user names
  const userIds = [
    ...new Set(
      (baseChanges || [])
        .map((c: any) => c.changed_by)
        .filter(Boolean)
    ),
  ];

  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("a_users")
      .select("user_id, first_name, last_name, email")
      .in("user_id", userIds);

    if (users) {
      for (const u of users) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
        const displayName = name ? `${name} (${u.email})` : u.email;
        userMap.set(u.user_id, displayName);
      }
    }
  }

  // 4. Normalize both into a common format
  const entries: any[] = [];

  // Base hours → entries
  for (const c of baseChanges || []) {
    let message = "";
    const day =
      c.day_of_week.charAt(0).toUpperCase() + c.day_of_week.slice(1);

    if (c.action === "update") {
      if (c.is_closed_old !== c.is_closed_new) {
        message = c.is_closed_new
          ? `${day} set to Closed`
          : `${day} opened: ${formatTime(c.open_time_new)}–${formatTime(c.close_time_new)}`;
      } else if (!c.is_closed_new) {
        const parts = [];
        if (c.open_time_old !== c.open_time_new) {
          parts.push(
            `open ${formatTime(c.open_time_old)} → ${formatTime(c.open_time_new)}`
          );
        }
        if (c.close_time_old !== c.close_time_new) {
          parts.push(
            `close ${formatTime(c.close_time_old)} → ${formatTime(c.close_time_new)}`
          );
        }
        message =
          parts.length > 0
            ? `${day} hours updated: ${parts.join(", ")}`
            : `${day} updated`;
      } else {
        message = `${day} updated`;
      }
    } else if (c.action === "insert") {
      message = c.is_closed_new
        ? `${day} base hours set to Closed`
        : `${day} base hours set: ${formatTime(c.open_time_new)}–${formatTime(c.close_time_new)}`;
    } else if (c.action === "delete") {
      message = `${day} base hours removed`;
    }

    entries.push({
      id: c.log_id,
      timestamp: c.changed_at,
      message,
      source: "base_hours",
      action: c.action,
      changed_by: userMap.get(c.changed_by) || c.changed_by || "unknown",
      metadata: {
        day_of_week: c.day_of_week,
        open_time_old: c.open_time_old,
        open_time_new: c.open_time_new,
        close_time_old: c.close_time_old,
        close_time_new: c.close_time_new,
      },
    });
  }

  // Resolve emails from rule changes to names
  const ruleEmails = [
    ...new Set(
      (ruleChanges || [])
        .map((r: any) => r.created_by)
        .filter((e: any) => e && e !== "system")
    ),
  ];

  const emailMap = new Map<string, string>();
  if (ruleEmails.length > 0) {
    const { data: emailUsers } = await supabase
      .from("a_users")
      .select("email, first_name, last_name")
      .in("email", ruleEmails);

    if (emailUsers) {
      for (const u of emailUsers) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
        emailMap.set(u.email, name ? `${name} (${u.email})` : u.email);
      }
    }
  }

  // Rule changes + comments → entries
  for (const r of ruleChanges || []) {
    const rawBy = r.created_by || "system";
    const displayBy = emailMap.get(rawBy) || rawBy;
    const isComment = r.event_type === "store_hours_event_comment";

    const action = isComment
      ? "comment"
      : r.event_type.replace("store_hours_rule_", "");

    entries.push({
      id: String(r.id),
      timestamp: r.created_at,
      message: isComment
        ? `\u{1F4AC} ${r.event_date}: ${r.message}`
        : r.message,
      source: isComment ? "comment" : "exception_rule",
      action,
      changed_by: displayBy,
      metadata: r.metadata || {},
    });
  }

  // 5. Sort merged list by timestamp descending
  entries.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // 6. Cap at 100 entries
  return NextResponse.json({ entries: entries.slice(0, 100) });
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}
