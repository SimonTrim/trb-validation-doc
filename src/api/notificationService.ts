// ============================================================================
// NOTIFICATION SERVICE — Email notifications via backend
// ============================================================================

import { apiRequest } from './apiClient';

export interface EmailNotificationPayload {
  to: string | string[];
  subject: string;
  html?: string;
  documentName?: string;
  workflowName?: string;
  reviewerName?: string;
  projectName?: string;
  projectId?: string;
  nodeName?: string;
  initiatorName?: string;
}

export interface EmailNotificationResult {
  sent: boolean;
  id?: string;
  reason?: string;
  error?: string;
}

/**
 * Send an email notification via the backend.
 * Non-blocking: failures are logged but don't throw.
 */
export async function sendEmailNotification(
  payload: EmailNotificationPayload
): Promise<EmailNotificationResult> {
  try {
    const result = await apiRequest<EmailNotificationResult>('/notifications/email', {
      method: 'POST',
      body: payload,
    });
    if (result.sent) {
      console.log('[NotificationService] Email sent to', payload.to);
    } else {
      console.warn('[NotificationService] Email not sent:', result.reason || result.error);
    }
    return result;
  } catch (err) {
    console.warn('[NotificationService] Failed to send email:', err);
    return { sent: false, error: String(err) };
  }
}

/**
 * Send review request emails to all reviewers assigned to a workflow node.
 */
export async function notifyReviewers(params: {
  reviewers: Array<{ id: string; name: string; email: string }>;
  documentName: string;
  workflowName: string;
  projectName?: string;
  projectId?: string;
  nodeName?: string;
  initiatorName?: string;
}): Promise<void> {
  const { reviewers, documentName, workflowName, projectName, projectId, nodeName } = params;

  if (!reviewers || reviewers.length === 0) {
    console.log('[NotificationService] No reviewers to notify');
    return;
  }

  const validReviewers = reviewers.filter((r) => r.email && r.email.includes('@'));

  if (validReviewers.length === 0) {
    console.warn('[NotificationService] No reviewers with valid email addresses');
    return;
  }

  const subject = `📋 Document à vérifier : ${documentName}`;

  // Send emails in parallel (one per reviewer for personalization)
  const promises = validReviewers.map((reviewer) =>
    sendEmailNotification({
      to: reviewer.email,
      subject,
      documentName,
      workflowName,
      reviewerName: reviewer.name || reviewer.email,
      projectName: projectName || '',
      projectId: projectId || '',
      nodeName: nodeName || '',
      initiatorName: params.initiatorName || '',
    })
  );

  const results = await Promise.allSettled(promises);
  const sent = results.filter(
    (r) => r.status === 'fulfilled' && r.value.sent
  ).length;
  console.log(
    `[NotificationService] Sent ${sent}/${validReviewers.length} review notification emails`
  );
}
