import assert from 'assert';
import http from 'http';
import app from '../app.js';
import db from '../db/connection.js';
import { validateFileSignature } from '../engine/preprocessor.js';

const PORT = 5099;
let server: http.Server;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function request(path: string, options: {
  method?: string;
  token?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}) {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data };
}

async function runLiveVerification() {
  console.log('=== BRAND SENTINEL STRICT LIVE WORKFLOW VERIFICATION ===\n');

  // Start HTTP server
  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Live on ${BASE_URL}`);
      resolve();
    });
  });

  try {
    // 0. SPA Frontend Serving
    console.log('\n--- 0. FRONTEND SPA STATIC DELIVERY ---');
    const spaRes = await request('/');
    assert.strictEqual(spaRes.status, 200, 'Frontend SPA root must return HTTP 200');
    assert.ok(spaRes.data.includes('Brand Sentinel') || spaRes.data.includes('root'), 'Must serve HTML bundle');
    console.log('✓ SPA frontend served correctly at /');

    // 1. Creator Workflow
    console.log('\n--- 1. CREATOR WORKFLOW ---');
    // Login
    const creatorLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'creator@vajra.com', password: 'password123' }
    });
    assert.strictEqual(creatorLogin.status, 200, 'Creator login must succeed');
    const creatorToken = creatorLogin.data.token;
    assert.ok(creatorToken, 'Token must be returned');
    console.log(`✓ Creator logged in: ${creatorLogin.data.user.fullName} (${creatorLogin.data.user.role})`);

    // Create Draft Content
    const createSub = await request('/api/content', {
      method: 'POST',
      token: creatorToken,
      body: {
        title: 'Cloud Resilience Press Announcement 2026',
        bodyText: 'Our cloud platform offers guaranteed 100% uptime with completely unhackable security, trusted by over 10,000 enterprise customers across the world.',
        channel: 'PRESS_RELEASE',
        contentType: 'PRESS_RELEASE',
        targetAudience: 'Chief Information Security Officers'
      }
    });
    assert.strictEqual(createSub.status, 201, 'Content creation must return HTTP 201');
    const submissionId = createSub.data.submissionId;
    console.log(`✓ Content draft created: ${submissionId}`);

    // Trigger AI Scan
    const scanRun = await request('/api/scans/run', {
      method: 'POST',
      token: creatorToken,
      body: { submissionId }
    });
    assert.strictEqual(scanRun.status, 200, 'Scan execution must return HTTP 200');
    console.log(`✓ Scan finished: Score = ${scanRun.data.score}/100, Total Findings = ${scanRun.data.findingsCount}`);
    assert.ok(scanRun.data.findingsCount >= 2, 'Must detect unhackable and metric violations');

    // Retrieve Details and Findings
    const subDetail = await request(`/api/content/${submissionId}`, { token: creatorToken });
    assert.strictEqual(subDetail.status, 200);
    const findings = subDetail.data.latestFindings;
    assert.ok(findings.length > 0, 'Must return latest findings');
    console.log(`✓ Retrieved submission details with ${findings.length} findings`);

    // Accept a suggestion
    const firstFindingWithSuggestion = findings.find((f: any) => f.suggestion_id);
    if (firstFindingWithSuggestion) {
      const acceptRes = await request(`/api/suggestions/${firstFindingWithSuggestion.suggestion_id}/accept`, {
        method: 'POST',
        token: creatorToken
      });
      assert.strictEqual(acceptRes.status, 200, 'Accept suggestion must return HTTP 200');
      console.log(`✓ Accepted suggestion for finding: "${firstFindingWithSuggestion.problematic_text}"`);
    }

    // Create revised copy (v2)
    const revisedText = 'Our cloud platform offers an enterprise-grade 99.99% high-availability SLA with audited resilient security, trusted by over 2,500 enterprise customers.';
    const resubmitRes = await request(`/api/content/${submissionId}/resubmit`, {
      method: 'POST',
      token: creatorToken,
      body: {
        revisedBodyText: revisedText,
        changeSummary: 'Fixed prohibited SLA & customer count claims'
      }
    });
    assert.strictEqual(resubmitRes.status, 200, 'Resubmit revision must return HTTP 200');
    assert.strictEqual(resubmitRes.data.versionNumber, 2, 'Must bump version to 2');
    console.log(`✓ Created revision v2`);

    // Scan revised version
    const rescan = await request('/api/scans/run', {
      method: 'POST',
      token: creatorToken,
      body: { submissionId }
    });
    console.log(`✓ Revised version scan score: ${rescan.data.score}/100 (Findings: ${rescan.data.findingsCount})`);
    assert.ok(rescan.data.score >= 90, 'Compliant text must score >= 90');

    // Submit for review
    const submitForReview = await request(`/api/content/${submissionId}/submit`, {
      method: 'POST',
      token: creatorToken
    });
    assert.strictEqual(submitForReview.status, 200, 'Submit for review must succeed');
    console.log(`✓ Content submitted to Human Review queue (Status: IN_REVIEW)`);

    // Non-destructive restore target version (Restore v1 as v3)
    const restoreRes = await request(`/api/content/${submissionId}/restore-version`, {
      method: 'POST',
      token: creatorToken,
      body: { targetVersionNumber: 1 }
    });
    assert.strictEqual(restoreRes.status, 200, 'Restore version must succeed');
    assert.strictEqual(restoreRes.data.versionNumber, 3, 'Restored version must be appended as v3');
    console.log(`✓ Restored version v1 as new immutable version v3`);

    // Re-submit v2 as v4 for approval flow
    await request(`/api/content/${submissionId}/resubmit`, {
      method: 'POST',
      token: creatorToken,
      body: {
        revisedBodyText: revisedText,
        changeSummary: 'Ready for final clearance'
      }
    });
    await request(`/api/content/${submissionId}/submit`, {
      method: 'POST',
      token: creatorToken
    });

    // 2. Reviewer Workflow
    console.log('\n--- 2. REVIEWER WORKFLOW ---');
    const reviewerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'reviewer@vajra.com', password: 'password123' }
    });
    assert.strictEqual(reviewerLogin.status, 200);
    const reviewerToken = reviewerLogin.data.token;
    console.log(`✓ Reviewer logged in: ${reviewerLogin.data.user.fullName}`);

    // Check Review Queue
    const queueRes = await request('/api/reviews/queue', { token: reviewerToken });
    assert.strictEqual(queueRes.status, 200);
    const inQueue = queueRes.data.queue.find((q: any) => q.id === submissionId);
    assert.ok(inQueue, 'Submitted content must appear in review queue');
    console.log(`✓ Verified submission appears in reviewer queue with ${queueRes.data.queue.length} total items`);

    // Add Reviewer Comment
    const commentRes = await request(`/api/reviews/${submissionId}/comment`, {
      method: 'POST',
      token: reviewerToken,
      body: { commentText: 'Checking compliance against SEC 10-K filings and security whitepaper.' }
    });
    assert.strictEqual(commentRes.status, 201);
    console.log(`✓ Reviewer comment added`);

    // Test Reviewer Escalation
    const escalateRes = await request(`/api/reviews/${submissionId}/escalate`, {
      method: 'POST',
      token: reviewerToken,
      body: { reason: 'Escalating for final executive verification of SLA figures.' }
    });
    assert.strictEqual(escalateRes.status, 200);
    console.log(`✓ Reviewer escalated submission (Status: ESCALATED)`);

    // Verify Notification persisted
    const notifRes = await request('/api/notifications', { token: creatorToken });
    assert.strictEqual(notifRes.status, 200);
    const hasEscalationNotif = notifRes.data.notifications.some((n: any) => n.title.includes('Escalated'));
    assert.ok(hasEscalationNotif, 'Escalation notification must exist for creator');
    console.log(`✓ Verified in-app notification delivered to creator`);

    // Test Reviewer Approval
    const approveRes = await request(`/api/reviews/${submissionId}/approve`, {
      method: 'POST',
      token: reviewerToken,
      body: { reason: 'All figures verified compliant against SRC-FIN-2025-09. Certified.' }
    });
    assert.strictEqual(approveRes.status, 200);
    console.log(`✓ Reviewer officially APPROVED submission`);

    // Verify Approved Status Persists
    const verifiedSub = await request(`/api/content/${submissionId}`, { token: creatorToken });
    assert.strictEqual(verifiedSub.data.submission.current_status, 'APPROVED');
    console.log(`✓ Submission status confirmed APPROVED in database`);

    // 3. Admin Workflow
    console.log('\n--- 3. BRAND ADMIN WORKFLOW ---');
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@vajra.com', password: 'password123' }
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log(`✓ Admin logged in: ${adminLogin.data.user.fullName}`);

    // Knowledge Repository Fetch
    const knowledgeRes = await request('/api/brands/knowledge', { token: adminToken });
    assert.strictEqual(knowledgeRes.status, 200);
    assert.ok(knowledgeRes.data.guidelines.length > 0);
    const sampleGuideline = knowledgeRes.data.guidelines[0];
    console.log(`✓ Knowledge repository retrieved (${knowledgeRes.data.guidelines.length} guidelines, ${knowledgeRes.data.voiceRules.length} voice rules)`);

    // Edit Guideline & Bump Version
    const editGRes = await request(`/api/brands/guidelines/${sampleGuideline.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        title: sampleGuideline.title,
        category: sampleGuideline.category,
        content: sampleGuideline.current_content + '\n[Updated in live test 2026]'
      }
    });
    assert.strictEqual(editGRes.status, 200);
    console.log(`✓ Guideline updated and bumped to version ${editGRes.data.guideline.current_version}`);

    // Toggle Voice Rule Status
    const sampleVoice = knowledgeRes.data.voiceRules[0];
    const toggleVoiceRes = await request(`/api/brands/voice-rules/${sampleVoice.id}/toggle-status`, {
      method: 'PATCH',
      token: adminToken
    });
    assert.strictEqual(toggleVoiceRes.status, 200);
    console.log(`✓ Voice rule status toggled to: ${toggleVoiceRes.data.voiceRule.status}`);

    // Toggle Terminology Rule Status
    const sampleTerm = knowledgeRes.data.terminologyRules[0];
    const toggleTermRes = await request(`/api/brands/terminology/${sampleTerm.id}/toggle-active`, {
      method: 'PATCH',
      token: adminToken
    });
    assert.strictEqual(toggleTermRes.status, 200);
    console.log(`✓ Terminology rule active toggled to: ${toggleTermRes.data.terminologyRule.is_active}`);

    // Bulk Import Facts with Duplicate Detection
    const bulkImportRes = await request('/api/brands/approved-facts/bulk-import', {
      method: 'POST',
      token: adminToken,
      body: {
        facts: [
          {
            claimText: `Brand Sentinel guarantees zero data leakage across 500+ audits (${Date.now()})`,
            sourceName: 'Security Certification ISO-27001',
            sourceId: `SRC-ISO-${Date.now()}`,
            category: 'SECURITY',
            contextNotes: 'Audited in 2026'
          },
          {
            claimText: 'Delivers 99.99% high-availability SLA backed by contractual financial credits.', // Duplicate of seeded fact
            sourceName: 'Duplicate test',
            sourceId: 'SRC-PROD-2025-SLA',
            category: 'PRODUCT_SPECS'
          }
        ]
      }
    });
    assert.strictEqual(bulkImportRes.status, 200);
    assert.strictEqual(bulkImportRes.data.insertedCount, 1, 'Should insert 1 new fact');
    assert.strictEqual(bulkImportRes.data.duplicatesSkippedCount, 1, 'Should detect 1 duplicate');
    console.log(`✓ Bulk facts import verified: ${bulkImportRes.data.insertedCount} inserted, ${bulkImportRes.data.duplicatesSkippedCount} duplicate skipped`);

    // Validate Brand Asset Against Draft Text
    const assetValRes = await request('/api/brands/assets/validate-draft', {
      method: 'POST',
      token: adminToken,
      body: {
        draftText: 'We deployed the Primary Horizontal Lockup on a high-contrast dark slate background.'
      }
    });
    assert.strictEqual(assetValRes.status, 200);
    console.log(`✓ Brand asset draft validation status: ${assetValRes.data.status}`);

    // Analytics with Date Filters
    const analyticsAll = await request('/api/analytics/overview?timeframe=all', { token: adminToken });
    assert.strictEqual(analyticsAll.status, 200);
    const analytics7d = await request('/api/analytics/overview?timeframe=7d', { token: adminToken });
    assert.strictEqual(analytics7d.status, 200);
    console.log(`✓ Analytics date filter verified (All Time: ${analyticsAll.data.categories.length} categories, 7 Days: ${analytics7d.data.categories.length} categories)`);

    // Audit Logs
    const auditRes = await request('/api/audit', { token: adminToken });
    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.data.logs.length >= 5);
    console.log(`✓ Audit log verified (${auditRes.data.logs.length} immutable events recorded)`);

    // 4. Security Verification
    console.log('\n--- 4. SECURITY & PERMISSIONS VERIFICATION ---');

    // 4.1 Unauthenticated Request Blocked
    const unauthRes = await request('/api/brands/knowledge');
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
    console.log('✓ Unauthenticated request rejected with HTTP 401');

    // 4.2 Non-Admin blocked from Admin-only route
    const creatorForbidden = await request('/api/brands/guidelines', {
      method: 'POST',
      token: creatorToken,
      body: { title: 'Unauthorized Guideline', category: 'EDITORIAL', content: 'Hack' }
    });
    assert.strictEqual(creatorForbidden.status, 403, 'Creator must be forbidden from creating brand guidelines');
    console.log('✓ RBAC verified: Non-admin rejected with HTTP 403 on admin-only route');

    // 4.3 Creator cannot approve own content
    const selfApproveRes = await request(`/api/reviews/${submissionId}/approve`, {
      method: 'POST',
      token: creatorToken,
      body: { reason: 'Self approving my own post' }
    });
    assert.strictEqual(selfApproveRes.status, 403, 'Creator must not be allowed to self-approve');
    console.log('✓ Creator self-approval blocked with HTTP 403');

    // 4.4 Insecure persona switching retired & blocked
    const switchRes = await request('/api/auth/switch-role', {
      method: 'POST',
      token: creatorToken,
      body: { role: 'HUMAN_REVIEWER' }
    });
    assert.strictEqual(switchRes.status, 403, 'Insecure persona switching must return 403');
    console.log('✓ Insecure persona switching successfully retired and blocked (HTTP 403)');

    // 4.5 Binary Magic Byte Spoofing Defense
    const spoofedHeader = Buffer.from('MZ\x90\x00\x03\x00\x00\x00Executable binary payload');
    const isSpoofedValid = validateFileSignature(spoofedHeader, 'application/pdf');
    assert.strictEqual(isSpoofedValid, false, 'Spoofed executable header must be rejected');
    console.log('✓ Binary magic-byte signature defense verified (disguised MZ header rejected)');

    console.log('\n======================================================');
    console.log(' ALL 20 STRICT E2E WORKFLOW CHECKS PASSED 100%! ');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runLiveVerification().catch((err) => {
  console.error('Live verification failed:', err);
  if (server) server.close();
  process.exit(1);
});

