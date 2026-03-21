import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SSB_ORG_ID = "79fab5fe-5fcf-4d84-ac1f-40348ebc160c";
const GENERIC_PREFIXES = ["info@", "admin@", "support@", "hello@", "contact@", "sales@"];

function isGenericEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return GENERIC_PREFIXES.some((p) => lower.startsWith(p));
}

serve(async (_req) => {
  try {
    // ── Step 1: Reset stale processing rows ──
    await supabase.rpc("execute_sql", {
      query: `
        UPDATE z_scheduled_emails
        SET status = 'pending', processing_started_at = NULL
        WHERE status = 'processing'
        AND processing_started_at < now() - interval '10 minutes'
      `,
    }).catch(() => {
      // Fallback: use direct update if rpc not available
    });

    // Try direct update as fallback
    await supabase
      .from("z_scheduled_emails")
      .update({ status: "pending", processing_started_at: null })
      .eq("status", "processing")
      .lt("processing_started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    // ── Step 2: Atomically claim eligible rows ──
    // Since Supabase JS doesn't support UPDATE...RETURNING with LIMIT natively,
    // we select eligible rows first then update them
    const { data: eligibleRows, error: fetchErr } = await supabase
      .from("z_scheduled_emails")
      .select("id")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .lt("attempts", 3)
      .limit(500);

    if (fetchErr) {
      console.error("Error fetching eligible rows:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }

    if (!eligibleRows || eligibleRows.length === 0) {
      return new Response(JSON.stringify({ message: "No pending emails to send", sent: 0, failed_permanent: 0, failed_transient: 0 }), { status: 200 });
    }

    const claimedIds = eligibleRows.map((r: any) => r.id);

    // Claim them atomically
    await supabase
      .from("z_scheduled_emails")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .in("id", claimedIds)
      .eq("status", "pending"); // Double-check still pending

    // Fetch full rows for processing
    const { data: claimedRows, error: claimErr } = await supabase
      .from("z_scheduled_emails")
      .select("id, lead_id, contact_id, email_type, campaign_name, campaign_subject, campaign_body, attempts")
      .in("id", claimedIds)
      .eq("status", "processing");

    if (claimErr || !claimedRows) {
      console.error("Error fetching claimed rows:", claimErr);
      return new Response(JSON.stringify({ error: "Failed to fetch claimed rows" }), { status: 500 });
    }

    // ── Step 3 & 4 & 5: Process each row ──
    let sent = 0;
    let failedPermanent = 0;
    let failedTransient = 0;

    for (const row of claimedRows) {
      // Step 3: Resolve recipient email
      let recipientEmail: string | null = null;
      let permanentError: string | null = null;

      if (row.lead_id && row.contact_id) {
        permanentError = "invalid_data_both_ids_set";
      } else if (!row.lead_id && !row.contact_id) {
        permanentError = "invalid_data_no_recipient";
      } else if (row.lead_id) {
        const { data: lead } = await supabase
          .from("z_marketing_leads")
          .select("email")
          .eq("id", row.lead_id)
          .single();
        recipientEmail = lead?.email || null;
      } else if (row.contact_id) {
        const { data: contact } = await supabase
          .from("zz_contacts")
          .select("email")
          .eq("id", row.contact_id)
          .single();
        recipientEmail = contact?.email || null;
      }

      if (!permanentError && (!recipientEmail || recipientEmail.trim() === "")) {
        permanentError = "no_email_address";
      }

      if (!permanentError && recipientEmail && isGenericEmail(recipientEmail)) {
        permanentError = "generic_inbox_blocked";
      }

      // Handle permanent failure from validation
      if (permanentError) {
        await supabase
          .from("z_scheduled_emails")
          .update({
            status: "failed",
            failure_type: "permanent",
            error: permanentError,
            processing_started_at: null,
          })
          .eq("id", row.id);

        failedPermanent++;

        // Log permanent failure
        await supabase.from("b_records_log").insert({
          org_id: SSB_ORG_ID,
          event_type: "campaign_email_failed",
          source: "cron",
          message: `Permanent failure for scheduled_email ${row.id}: ${permanentError}`,
          metadata: { scheduled_email_id: row.id, error: permanentError },
          created_by: "system",
          event_date: new Date().toISOString().split("T")[0],
        });

        continue;
      }

      // Step 4: Send via Resend using frozen snapshot
      const subject = row.campaign_subject || "Message from Street Smart Buildings";
      const bodyText = row.campaign_body || "";
      const bodyHtml = bodyText
        .split("\n\n")
        .map((paragraph: string) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
        .join("");

      try {
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "James Parke <james.parke@streetsmartbuildings.com>",
            to: [recipientEmail],
            subject,
            text: bodyText,
            html: bodyHtml,
          }),
        });

        const resendData = await resendResponse.json();

        // Step 5: Handle result
        if (resendResponse.ok && resendData.id) {
          // Success
          await supabase
            .from("z_scheduled_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              provider_message_id: resendData.id,
              error: null,
              processing_started_at: null,
            })
            .eq("id", row.id);

          sent++;
        } else if (resendResponse.status === 429 || resendResponse.status >= 500) {
          // Transient failure (rate limit or server error)
          const newAttempts = (row.attempts || 0) + 1;
          await supabase
            .from("z_scheduled_emails")
            .update({
              status: newAttempts >= 3 ? "failed" : "pending",
              attempts: newAttempts,
              failure_type: "transient",
              error: resendData.message || `HTTP ${resendResponse.status}`,
              processing_started_at: null,
            })
            .eq("id", row.id);

          if (newAttempts >= 3) {
            failedPermanent++;
            await supabase.from("b_records_log").insert({
              org_id: SSB_ORG_ID,
              event_type: "campaign_email_failed",
              source: "cron",
              message: `Permanent failure for scheduled_email ${row.id}: max retries exceeded`,
              metadata: { scheduled_email_id: row.id, error: "max_retries_exceeded", attempts: newAttempts },
              created_by: "system",
              event_date: new Date().toISOString().split("T")[0],
            });
          } else {
            failedTransient++;
          }
        } else {
          // Permanent failure (4xx other than 429)
          const errorMsg = resendData.message || `HTTP ${resendResponse.status}`;
          await supabase
            .from("z_scheduled_emails")
            .update({
              status: "failed",
              failure_type: "permanent",
              error: errorMsg,
              processing_started_at: null,
            })
            .eq("id", row.id);

          failedPermanent++;

          await supabase.from("b_records_log").insert({
            org_id: SSB_ORG_ID,
            event_type: "campaign_email_failed",
            source: "cron",
            message: `Permanent failure for scheduled_email ${row.id}: ${errorMsg}`,
            metadata: { scheduled_email_id: row.id, error: errorMsg },
            created_by: "system",
            event_date: new Date().toISOString().split("T")[0],
          });
        }
      } catch (sendError: any) {
        // Network / unexpected error → transient
        const errorMsg = sendError.message || "Unknown send error";
        const newAttempts = (row.attempts || 0) + 1;
        await supabase
          .from("z_scheduled_emails")
          .update({
            status: newAttempts >= 3 ? "failed" : "pending",
            attempts: newAttempts,
            failure_type: "transient",
            error: errorMsg,
            processing_started_at: null,
          })
          .eq("id", row.id);

        if (newAttempts >= 3) {
          failedPermanent++;
          await supabase.from("b_records_log").insert({
            org_id: SSB_ORG_ID,
            event_type: "campaign_email_failed",
            source: "cron",
            message: `Permanent failure for scheduled_email ${row.id}: max retries exceeded`,
            metadata: { scheduled_email_id: row.id, error: "max_retries_exceeded", attempts: newAttempts },
            created_by: "system",
            event_date: new Date().toISOString().split("T")[0],
          });
        } else {
          failedTransient++;
        }
      }
    }

    // ── Batch summary log ──
    await supabase.from("b_records_log").insert({
      org_id: SSB_ORG_ID,
      event_type: "campaign_send_batch",
      source: "cron",
      message: `Campaign email batch: ${sent} sent, ${failedPermanent} failed permanent, ${failedTransient} transient retry`,
      metadata: { sent, failed_permanent: failedPermanent, failed_transient: failedTransient, total_claimed: claimedRows.length },
      created_by: "system",
      event_date: new Date().toISOString().split("T")[0],
    });

    return new Response(
      JSON.stringify({
        message: `Processed ${claimedRows.length} emails`,
        sent,
        failed_permanent: failedPermanent,
        failed_transient: failedTransient,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
