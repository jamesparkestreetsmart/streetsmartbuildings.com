// lib/email.ts

import { Resend } from "resend";
import nodemailer from "nodemailer";

const RESEND_FROM = "Eagle Eyes <alerts@streetsmartbuildings.com>";

async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  // Primary: Resend
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const resend = new Resend(resendApiKey);
    const payload: { from: string; to: string; subject: string; html?: string; text?: string } = {
      from: RESEND_FROM,
      to,
      subject,
    };
    if (html) payload.html = html;
    if (text) payload.text = text;
    const { error } = await resend.emails.send(payload as any);
    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
    return;
  }

  // Fallback: Gmail / Nodemailer
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  if (!gmailUser || !gmailPass) {
    throw new Error(
      "No email provider configured (set RESEND_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD)"
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from: `"Eagle Eyes" <${gmailUser}>`,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  });
}

interface SendInviteEmailParams {
  to: string;
  orgName: string;
  orgCode: string;
  invitedByName?: string;
}

export async function sendInviteEmail({
  to,
  orgName,
  orgCode,
  invitedByName,
}: SendInviteEmailParams): Promise<{ success: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const signupUrl = `${appUrl}/signup?org=${encodeURIComponent(orgCode)}&email=${encodeURIComponent(to)}`;

  const invitedByText = invitedByName ? ` by ${invitedByName}` : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #00a859 0%, #d4af37 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Eagle Eyes</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Smart Building Management</p>
      </div>
      
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #333; margin-top: 0;">You've been invited!</h2>
        
        <p>You've been invited${invitedByText} to join <strong>${orgName}</strong> on Eagle Eyes, the smart building management platform.</p>
        
        <p>Click the button below to create your account:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${signupUrl}" style="background: linear-gradient(135deg, #00a859 0%, #d4af37 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Create Your Account
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Your organization code is: <strong style="color: #00a859;">${orgCode}</strong></p>
        
        <p style="color: #666; font-size: 14px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color: #666; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">${signupUrl}</p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; margin-bottom: 0;">
          This email was sent by Eagle Eyes on behalf of ${orgName}.<br>
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
You've been invited${invitedByText} to join ${orgName} on Eagle Eyes!

Create your account here: ${signupUrl}

Your organization code is: ${orgCode}

If you didn't expect this invitation, you can safely ignore this email.
  `.trim();

  try {
    await sendMail({
      to,
      subject: `You've been invited to join ${orgName} on Eagle Eyes`,
      text,
      html,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Failed to send invite email:", error);
    return { success: false, error: error.message };
  }
}

// ─── Feedback Email ──────────────────────────────────────────────────────────

interface SendFeedbackEmailParams {
  userEmail: string;
  orgName: string;
  subject: string;
  body: string;
}

export async function sendFeedbackEmail({
  userEmail,
  orgName,
  subject,
  body,
}: SendFeedbackEmailParams): Promise<{ success: boolean; error?: string }> {
  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const text = `Feedback from: ${userEmail}
Organization: ${orgName}
Date: ${timestamp}

---
${body}
---

Submitted via Eagle Eyes platform feedback.`;

  try {
    await sendMail({
      to: "james.parke@streetsmartbuildings.com",
      subject: `[Eagle Eyes Feedback] ${subject}`,
      text,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Failed to send feedback email:", error);
    return { success: false, error: error.message };
  }
}

// ─── Reminder Email ─────────────────────────────────────────────────────────

interface SendReminderEmailParams {
  to: string;
  orgName: string;
  orgCode: string;
}

export async function sendReminderEmail({
  to,
  orgName,
  orgCode,
}: SendReminderEmailParams): Promise<{ success: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const signupUrl = `${appUrl}/signup?org=${encodeURIComponent(orgCode)}&email=${encodeURIComponent(to)}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #00a859 0%, #d4af37 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Eagle Eyes</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Smart Building Management</p>
      </div>
      
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #333; margin-top: 0;">Reminder: Your invitation is waiting</h2>
        
        <p>You were recently invited to join <strong>${orgName}</strong> on Eagle Eyes, but you haven't created your account yet.</p>
        
        <p>Click the button below to get started:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${signupUrl}" style="background: linear-gradient(135deg, #00a859 0%, #d4af37 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
            Create Your Account
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Your organization code is: <strong style="color: #00a859;">${orgCode}</strong></p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; margin-bottom: 0;">
          This is a reminder email from Eagle Eyes on behalf of ${orgName}.<br>
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
Reminder: Your invitation to join ${orgName} on Eagle Eyes is waiting!

Create your account here: ${signupUrl}

Your organization code is: ${orgCode}

If you didn't expect this invitation, you can safely ignore this email.
  `.trim();

  try {
    await sendMail({
      to,
      subject: `Reminder: Complete your Eagle Eyes signup for ${orgName}`,
      text,
      html,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Failed to send reminder email:", error);
    return { success: false, error: error.message };
  }
}