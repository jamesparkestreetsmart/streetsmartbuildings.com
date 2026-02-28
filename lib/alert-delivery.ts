// lib/alert-delivery.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import nodemailer from "nodemailer";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingNotification {
  id: number;
  org_id: string;
  instance_id: number;
  subscription_id: string | null;
  channel: string;
  notification_type: string;
  recipient_user_id: string | null;
  recipient_address: string | null;
  title: string;
  message: string;
  severity: string;
  repeat_number: number;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function processDeliveryQueue(
  supabase: SupabaseClient
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    // Fetch pending SMS and email notifications
    // Process up to 50 per run to avoid timeouts
    const { data: pending, error } = await supabase
      .from("b_alert_notifications")
      .select("*")
      .eq("status", "pending")
      .in("channel", ["sms", "email"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[DELIVERY] Failed to fetch pending notifications:", error);
      return { sent: 0, failed: 0 };
    }

    if (!pending?.length) {
      return { sent: 0, failed: 0 };
    }

    console.log(`[DELIVERY] Processing ${pending.length} pending notifications`);

    for (const notif of pending as PendingNotification[]) {
      try {
        // Resolve recipient address if not already set
        let address = notif.recipient_address;

        if (!address && notif.recipient_user_id) {
          address = await resolveRecipientAddress(
            supabase,
            notif.recipient_user_id,
            notif.channel,
            notif.org_id
          );
        }

        if (!address) {
          await markFailed(supabase, notif.id, `No ${notif.channel} address for user`);
          failed++;
          continue;
        }

        if (notif.channel === "sms") {
          await sendSms(notif, address);
        } else if (notif.channel === "email") {
          await sendEmail(notif, address);
        }

        // Mark as sent
        await supabase
          .from("b_alert_notifications")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            recipient_address: address  // store for audit trail
          })
          .eq("id", notif.id);

        sent++;
        console.log(`[DELIVERY] ${notif.channel.toUpperCase()} sent to ${address}: ${notif.title}`);

      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        await markFailed(supabase, notif.id, errorMsg);
        failed++;
        console.error(`[DELIVERY] ${notif.channel.toUpperCase()} failed for ${notif.recipient_address || notif.recipient_user_id}: ${errorMsg}`);
      }
    }

    console.log(`[DELIVERY] Complete: ${sent} sent, ${failed} failed`);

  } catch (err) {
    console.error("[DELIVERY] Queue processing error:", err);
  }

  return { sent, failed };
}

// ─── SMS via Twilio ──────────────────────────────────────────────────────────

async function sendSms(notif: PendingNotification, phoneNumber: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)");
  }

  if (!messagingServiceSid) {
    throw new Error("TWILIO_MESSAGING_SERVICE_SID not configured");
  }

  // Dynamic import to avoid issues if twilio isn't installed
  const twilio = (await import("twilio")).default;
  const client = twilio(accountSid, authToken);

  // Build SMS body — keep it concise for SMS
  const severityIcon = notif.severity === "critical" ? "\uD83D\uDD34" : notif.severity === "warning" ? "\uD83D\uDFE1" : "\uD83D\uDD35";
  let body = "";

  if (notif.notification_type === "resolved") {
    body = `RESOLVED: ${notif.message}`;
  } else if (notif.notification_type === "repeat") {
    body = `${severityIcon} REPEAT #${notif.repeat_number}: ${notif.message}`;
  } else {
    body = `${severityIcon} ALERT: ${notif.message}`;
  }

  // Prefix with Eagle Eyes
  body = `[Eagle Eyes] ${body}`;

  // Truncate if over SMS limit (160 chars for single SMS, 1600 for concatenated)
  if (body.length > 1500) {
    body = body.substring(0, 1497) + "...";
  }

  await client.messages.create({
    body,
    messagingServiceSid,
    to: phoneNumber,
  });
}

// ─── Email via Resend (primary) or Gmail/Nodemailer (fallback) ───────────────

function buildEmailContent(notif: PendingNotification): { subject: string; html: string } {
  const severityColor = notif.severity === "critical" ? "#dc2626" : notif.severity === "warning" ? "#f59e0b" : "#3b82f6";
  const severityLabel = notif.severity.charAt(0).toUpperCase() + notif.severity.slice(1);

  const isResolved = notif.notification_type === "resolved";
  const isRepeat = notif.notification_type === "repeat";

  const subject = isResolved
    ? `Resolved: ${notif.title.replace("Resolved: ", "")}`
    : isRepeat
    ? `Repeat Alert: ${notif.title}`
    : `${severityLabel} Alert: ${notif.title}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${isResolved ? '#22c55e' : severityColor}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">
          ${isResolved ? 'Alert Resolved' : isRepeat ? 'Repeat Alert (#' + notif.repeat_number + ')' : severityLabel + ' Alert'}
        </h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <h3 style="margin: 0 0 8px 0; color: #111827;">${notif.title}</h3>
        <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 15px;">${notif.message}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
        <p style="margin: 0; color: #9ca3af; font-size: 13px;">
          This alert was sent by Eagle Eyes Building Solutions.
          To change your notification preferences, visit your Eagle Eyes dashboard.
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}

async function sendEmail(notif: PendingNotification, emailAddress: string): Promise<void> {
  const { subject, html } = buildEmailContent(notif);

  // Primary: Resend
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: "Eagle Eyes Alerts <alerts@streetsmartbuildings.com>",
      to: emailAddress,
      subject,
      html,
    });
    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
    return;
  }

  // Fallback: Gmail/Nodemailer
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    throw new Error("No email provider configured (set RESEND_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD)");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  await transporter.sendMail({
    from: `Eagle Eyes Alerts <${gmailUser}>`,
    to: emailAddress,
    subject,
    html,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveRecipientAddress(
  supabase: SupabaseClient,
  userId: string,
  channel: string,
  orgId: string
): Promise<string | null> {
  if (channel === "email") {
    // Get email from auth.users
    const { data: user } = await supabase.auth.admin.getUserById(userId);
    return user?.user?.email || null;
  }

  if (channel === "sms") {
    // Get phone from a_users
    const { data: user } = await supabase
      .from("a_users")
      .select("phone_number")
      .eq("user_id", userId)
      .single();

    return user?.phone_number || null;
  }

  return null;
}

async function markFailed(
  supabase: SupabaseClient,
  notificationId: number,
  reason: string
): Promise<void> {
  await supabase
    .from("b_alert_notifications")
    .update({
      status: "failed",
      failed_reason: reason
    })
    .eq("id", notificationId);
}
