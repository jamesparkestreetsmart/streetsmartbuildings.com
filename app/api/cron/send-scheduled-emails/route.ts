import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // If no secret configured, allow (dev mode)
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Find all pending emails that are due
    const now = new Date().toISOString();
    const { data: dueEmails, error: fetchError } = await supabase
      .from("z_scheduled_emails")
      .select(`
        id,
        lead_id,
        email_type,
        z_marketing_leads (
          id,
          email,
          first_name
        )
      `)
      .eq("status", "pending")
      .lte("send_at", now)
      .limit(20); // Process in batches

    if (fetchError) throw fetchError;
    if (!dueEmails || dueEmails.length === 0) {
      return NextResponse.json({ message: "No emails due", sent: 0 });
    }

    // 2. Load email template config
    const { data: configRows, error: configError } = await supabase
      .from("z_marketing_config")
      .select("key, value")
      .in("key", ["welcome_email_subject", "welcome_email_body"]);

    if (configError) throw configError;

    const config: Record<string, string> = {};
    configRows?.forEach((row) => {
      config[row.key] = row.value;
    });

    const subjectTemplate = config["welcome_email_subject"] || "Thanks for your interest in Eagle Eyes Building Solutions";
    const bodyTemplate = config["welcome_email_body"] || "Hi {{first_name}}, thanks for your interest!";

    // 3. Get PDF attachment from Supabase Storage
    const { data: pdfData } = supabase.storage
      .from("marketing-assets")
      .getPublicUrl("EagleEyes_Overview_Presentation.pdf");

    let pdfBuffer: Buffer | null = null;
    if (pdfData?.publicUrl) {
      try {
        const pdfRes = await fetch(pdfData.publicUrl);
        if (pdfRes.ok) {
          const arrayBuffer = await pdfRes.arrayBuffer();
          pdfBuffer = Buffer.from(arrayBuffer);
        }
      } catch (e) {
        console.error("Failed to fetch PDF:", e);
      }
    }

    // 4. Set up email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // 5. Send each email
    let sentCount = 0;
    let failedCount = 0;

    for (const scheduled of dueEmails) {
      const lead = scheduled.z_marketing_leads as any;
      if (!lead?.email) {
        await supabase
          .from("z_scheduled_emails")
          .update({ status: "failed", error: "No email address on lead" })
          .eq("id", scheduled.id);
        failedCount++;
        continue;
      }

      // Replace template tokens
      const firstName = lead.first_name || "there";
      const subject = subjectTemplate.replace(/\{\{first_name\}\}/g, firstName);
      const body = bodyTemplate
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{email\}\}/g, lead.email);

      const mailOptions: any = {
        from: `James <${process.env.GMAIL_USER}>`,
        to: lead.email,
        subject,
        text: body,
      };

      // Attach PDF if available
      if (pdfBuffer) {
        mailOptions.attachments = [
          {
            filename: "EagleEyes_Overview_Presentation.pdf",
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ];
      }

      try {
        await transporter.sendMail(mailOptions);
        await supabase
          .from("z_scheduled_emails")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", scheduled.id);
        sentCount++;
      } catch (sendErr: any) {
        console.error(`Failed to send to ${lead.email}:`, sendErr);
        await supabase
          .from("z_scheduled_emails")
          .update({ status: "failed", error: sendErr.message?.slice(0, 500) })
          .eq("id", scheduled.id);
        failedCount++;
      }
    }

    return NextResponse.json({
      message: "Cron complete",
      sent: sentCount,
      failed: failedCount,
      total: dueEmails.length,
    });
  } catch (err: any) {
    console.error("Cron error:", err);
    return NextResponse.json(
      { error: err.message || "Cron failed" },
      { status: 500 }
    );
  }
}
