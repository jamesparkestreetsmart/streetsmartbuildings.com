import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (_req) => {
  try {
    // 1. Fetch pending emails that are due
    const { data: pendingEmails, error: fetchError } = await supabase
      .from("z_scheduled_emails")
      .select(`
        id,
        lead_id,
        email_type,
        send_at,
        z_marketing_leads!inner (
          email,
          first_name
        )
      `)
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (fetchError) {
      console.error("Error fetching pending emails:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
      });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ message: "No pending emails to send", sent: 0, failed: 0 }), {
        status: 200,
      });
    }

    // 2. Fetch email template from config
    const { data: configRows, error: configError } = await supabase
      .from("z_marketing_config")
      .select("key, value")
      .in("key", ["welcome_email_subject", "welcome_email_body"]);

    if (configError || !configRows) {
      console.error("Error fetching config:", configError);
      return new Response(JSON.stringify({ error: "Failed to load email config" }), {
        status: 500,
      });
    }

    const config: Record<string, string> = {};
    for (const row of configRows) {
      config[row.key] = row.value;
    }

    const subjectTemplate = config["welcome_email_subject"] || "Thanks for your interest in Eagle Eyes Building Solutions";
    const bodyTemplate = config["welcome_email_body"] || "Hi {{first_name}},\n\nThanks for your interest!";

    // 3. Process each pending email
    let sent = 0;
    let failed = 0;
    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const scheduled of pendingEmails) {
      const lead = (scheduled as any).z_marketing_leads;
      const recipientEmail = lead.email;
      const firstName = lead.first_name || "there";

      // Replace tokens
      const subject = subjectTemplate.replace(/\{\{first_name\}\}/g, firstName);
      const bodyText = bodyTemplate.replace(/\{\{first_name\}\}/g, firstName);

      // Convert plain text body to simple HTML (preserve line breaks)
      const bodyHtml = bodyText
        .split("\n\n")
        .map((paragraph: string) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
        .join("");

      try {
        // 4. Send via Resend
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "James Parke <james.parke@streetsmartbuildings.com>",
            to: [recipientEmail],
            subject: subject,
            text: bodyText,
            html: bodyHtml,
          }),
        });

        const resendData = await resendResponse.json();

        if (resendResponse.ok && resendData.id) {
          // Success — mark as sent
          await supabase
            .from("z_scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              error: null,
            })
            .eq("id", scheduled.id);

          sent++;
          results.push({ id: scheduled.id, status: "sent" });
        } else {
          // Resend returned an error
          const errorMsg = resendData.message || JSON.stringify(resendData);
          await supabase
            .from("z_scheduled_emails")
            .update({
              status: "failed",
              error: errorMsg,
            })
            .eq("id", scheduled.id);

          failed++;
          results.push({ id: scheduled.id, status: "failed", error: errorMsg });
        }
      } catch (sendError: any) {
        // Network or unexpected error
        const errorMsg = sendError.message || "Unknown send error";
        await supabase
          .from("z_scheduled_emails")
          .update({
            status: "failed",
            error: errorMsg,
          })
          .eq("id", scheduled.id);

        failed++;
        results.push({ id: scheduled.id, status: "failed", error: errorMsg });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${pendingEmails.length} emails`,
        sent,
        failed,
        results,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});
