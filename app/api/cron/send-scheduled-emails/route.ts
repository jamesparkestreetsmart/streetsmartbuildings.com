import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";

function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Load delay config
    const { data: configRows } = await supabase
      .from("z_marketing_config")
      .select("key, value")
      .in("key", [
        "welcome_email_delay_hours",
        "welcome_email_subject",
        "welcome_email_body",
      ]);

    const config: Record<string, string> = {};
    configRows?.forEach((row) => { config[row.key] = row.value; });

    const delayHours = parseInt(config["welcome_email_delay_hours"] || "8", 10);
    const subjectTemplate = config["welcome_email_subject"] || "Thanks for your interest in Eagle Eyes Building Solutions";
    const bodyTemplate = config["welcome_email_body"] || "Hi {{first_name}}, thanks for your interest!";

    // 2. Find pending leads where enough time has passed since created_at
    const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000).toISOString();

    const { data: leads, error: fetchError } = await supabase
      .from("z_marketing_leads")
      .select("id, email, first_name")
      .eq("welcome_email_status", "pending")
      .lte("created_at", cutoff)
      .limit(20);

    if (fetchError) throw fetchError;
    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: "No emails due", sent: 0 });
    }

    // 3. Fetch PDF attachment
    const { data: pdfData } = supabase.storage
      .from("marketing-assets")
      .getPublicUrl("EagleEyes_Overview_Presentation.pdf");

    let pdfBuffer: Buffer | null = null;
    if (pdfData?.publicUrl) {
      try {
        const pdfRes = await fetch(pdfData.publicUrl);
        if (pdfRes.ok) pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
      } catch (e) {
        console.error("Failed to fetch PDF:", e);
      }
    }

    // 4. Set up transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // 5. Send each email, update z_marketing_leads directly
    let sentCount = 0;
    let failedCount = 0;

    for (const lead of leads) {
      if (!lead.email) {
        await supabase
          .from("z_marketing_leads")
          .update({
            welcome_email_status: "failed",
            welcome_email_error: "No email address",
          })
          .eq("id", lead.id);
        failedCount++;
        continue;
      }

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

      if (pdfBuffer) {
        mailOptions.attachments = [{
          filename: "EagleEyes_Overview_Presentation.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        }];
      }

      try {
        await transporter.sendMail(mailOptions);

        await supabase
          .from("z_marketing_leads")
          .update({
            welcome_email_status: "sent",
            welcome_email_sent_at: new Date().toISOString(),
            welcome_email_error: null,
          })
          .eq("id", lead.id);

        // Audit log
        await supabase.from("b_records_log").insert({
          org_id: SSB_ORG_ID,
          event_type: "welcome_email_sent",
          source: "cron",
          message: `Welcome email sent to ${lead.email}`,
          metadata: { lead_id: lead.id, email: lead.email },
          created_by: "system",
          event_date: new Date().toISOString().split("T")[0],
        });

        sentCount++;
      } catch (sendErr: any) {
        console.error(`Failed to send to ${lead.email}:`, sendErr);

        await supabase
          .from("z_marketing_leads")
          .update({
            welcome_email_status: "failed",
            welcome_email_error: sendErr.message?.slice(0, 500),
          })
          .eq("id", lead.id);

        await supabase.from("b_records_log").insert({
          org_id: SSB_ORG_ID,
          event_type: "welcome_email_failed",
          source: "cron",
          message: `Welcome email failed for ${lead.email}: ${sendErr.message?.slice(0, 200)}`,
          metadata: { lead_id: lead.id, email: lead.email, error: sendErr.message },
          created_by: "system",
          event_date: new Date().toISOString().split("T")[0],
        });

        failedCount++;
      }
    }

    return NextResponse.json({
      message: "Cron complete",
      sent: sentCount,
      failed: failedCount,
      total: leads.length,
    });
  } catch (err: any) {
    console.error("Cron error:", err);
    return NextResponse.json({ error: err.message || "Cron failed" }, { status: 500 });
  }
}