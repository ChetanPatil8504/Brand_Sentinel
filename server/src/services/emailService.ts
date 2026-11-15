import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';

export interface EscalationNotificationParams {
  submissionId: string;
  submissionTitle: string;
  reviewerName: string;
  escalationReason: string;
  recipientEmail?: string;
  recipientUserId?: string;
}

export interface NotificationResult {
  sent: boolean;
  configured: boolean;
  status: 'SENT' | 'SKIPPED_NOT_CONFIGURED' | 'FAILED';
  recipient?: string;
  message: string;
  error?: string;
}

export async function sendEscalationNotification(
  params: EscalationNotificationParams
): Promise<NotificationResult> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const from = process.env.SMTP_FROM || '"Brand Sentinel Governance" <noreply@brandsentinel.internal>';
  const appUrl = process.env.APP_URL || 'http://localhost:5173';

  // 1. In-app persistent notification creation (always recorded in database)
  try {
    const adminUser = db.prepare(`SELECT id, email FROM users WHERE role = 'BRAND_ADMIN' LIMIT 1`).get() as any;
    const userIdsToNotify = new Set<string>();
    if (params.recipientUserId) userIdsToNotify.add(params.recipientUserId);
    if (adminUser?.id) userIdsToNotify.add(adminUser.id);

    for (const uid of userIdsToNotify) {
      db.prepare(`
        INSERT INTO notifications (id, user_id, title, message, link, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `).run(
        'ntf_' + uuidv4().slice(0, 16),
        uid,
        `Escalated Content: ${params.submissionTitle.slice(0, 50)}`,
        `Escalated by ${params.reviewerName}. Reason: ${params.escalationReason}`,
        `/inspection/${params.submissionId}`
      );
    }
  } catch (dbErr) {
    console.error('Failed to record database notification:', dbErr);
  }

  // 2. Check if external SMTP delivery is configured
  if (!host || !user || !pass) {
    return {
      sent: false,
      configured: false,
      status: 'SKIPPED_NOT_CONFIGURED',
      message: 'SMTP credentials not provided in environment; in-app notification recorded.'
    };
  }

  // Target recipient email (admin or compliance director)
  const recipient = params.recipientEmail || process.env.ESCALATION_ALERT_EMAIL || 'governance-lead@vajra.com';

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000
    });

    const mailOptions = {
      from,
      to: recipient,
      subject: `[BRAND SENTINEL URGENT] Content Escalated: ${params.submissionTitle}`,
      text: `A content submission has been escalated for executive review.\n\n` +
        `Title: ${params.submissionTitle}\n` +
        `Escalated by: ${params.reviewerName}\n` +
        `Reason: ${params.escalationReason}\n` +
        `Review Link: ${appUrl}/inspection/${params.submissionId}\n\n` +
        `This is an automated notification from the Brand Sentinel Governance Engine.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0b1528; padding: 20px; color: white;">
            <h2 style="margin: 0; font-size: 18px; color: #60a5fa;">Brand Sentinel Governance Escalation</h2>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p><strong>A content asset has been escalated by the review team and requires brand leadership determination:</strong></p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; background-color: #f8fafc; font-weight: bold; width: 30%;">Title:</td>
                <td style="padding: 8px; background-color: #f8fafc;">${params.submissionTitle}</td>
              </tr>
              <tr>
                <td style="padding: 8px; font-weight: bold;">Reviewer:</td>
                <td style="padding: 8px;">${params.reviewerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px; background-color: #f8fafc; font-weight: bold;">Escalation Reason:</td>
                <td style="padding: 8px; background-color: #f8fafc; color: #dc2626;">${params.escalationReason}</td>
              </tr>
            </table>
            <div style="margin-top: 24px;">
              <a href="${appUrl}/inspection/${params.submissionId}" style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">Open Inspection Studio</a>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    return {
      sent: true,
      configured: true,
      status: 'SENT',
      recipient,
      message: `Escalation alert delivered successfully to ${recipient}`
    };
  } catch (error: any) {
    console.error('SMTP email dispatch error:', error);
    return {
      sent: false,
      configured: true,
      status: 'FAILED',
      recipient,
      message: `Failed to deliver email to ${recipient}`,
      error: error.message
    };
  }
}

