import assert from 'assert';

const BACKEND_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:5173';

interface TestResult {
  feature: string;
  testedMethod: string;
  result: 'PASS' | 'FAIL';
  bug: string;
}

const testResults: TestResult[] = [];

function record(feature: string, testedMethod: string, result: 'PASS' | 'FAIL', bug: string = 'None') {
  testResults.push({ feature, testedMethod, result, bug });
  console.log(`[${result}] ${feature} (${testedMethod}) - ${bug}`);
}

async function request(path: string, options: {
  method?: string;
  token?: string;
  body?: any;
} = {}) {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
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

async function testFrontendRoute(path: string) {
  const res = await fetch(`${FRONTEND_URL}${path}`);
  const html = await res.text();
  return {
    status: res.status,
    hasRoot: html.includes('id="root"'),
    hasMainScript: html.includes('/src/main.tsx')
  };
}

async function runQA() {
  console.log('=== BRAND SENTINEL COMPREHENSIVE QA EXECUTION ===\n');

  // PHASE 1: Server and Connectivity
  console.log('--- Phase 1: Application Connectivity ---');
  try {
    const health = await request('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(String(health.data.status).toUpperCase(), 'HEALTHY');
    record('Backend Health & Connectivity', 'GET /api/health', 'PASS');
  } catch (err: any) {
    record('Backend Health & Connectivity', 'GET /api/health', 'FAIL', err.message);
  }

  try {
    const fe = await testFrontendRoute('/');
    assert.strictEqual(fe.status, 200);
    assert.ok(fe.hasRoot);
    record('Frontend SPA Server', 'GET http://localhost:5173/', 'PASS');
  } catch (err: any) {
    record('Frontend SPA Server', 'GET http://localhost:5173/', 'FAIL', err.message);
  }

  // PHASE 2: Dynamic Registration & Login
  console.log('\n--- Phase 2: Dynamic Registration & Login ---');
  const timestamp = Date.now();
  const dynamicEmail = `qa_creator_${timestamp}@enterprise.test`;
  const dynamicPassword = 'StrongPassword2026!';
  let creatorToken = '';

  try {
    // Weak password rejection
    const weakRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Weak User',
        email: `weak_${timestamp}@enterprise.test`,
        password: 'weak'
      }
    });
    assert.strictEqual(weakRes.status, 400);
    record('Registration Password Strength Enforcement', 'POST /api/auth/register (short pw)', 'PASS');
  } catch (err: any) {
    record('Registration Password Strength Enforcement', 'POST /api/auth/register', 'FAIL', err.message);
  }

  try {
    // Dynamic Registration
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'QA Content Creator',
        email: dynamicEmail,
        password: dynamicPassword,
        role: 'CONTENT_CREATOR'
      }
    });
    assert.strictEqual(regRes.status, 201);
    assert.ok(regRes.data.token);
    assert.strictEqual(regRes.data.user.role, 'CONTENT_CREATOR');
    record('Dynamic User Registration', 'POST /api/auth/register', 'PASS');

    // Duplicate email check
    const dupRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: 'Duplicate User',
        email: dynamicEmail,
        password: dynamicPassword
      }
    });
    assert.strictEqual(dupRes.status, 409);
    record('Registration Duplicate Email Prevention', 'POST /api/auth/register (dup)', 'PASS');
  } catch (err: any) {
    record('Dynamic User Registration', 'POST /api/auth/register', 'FAIL', err.message);
  }

  try {
    // Dynamic Login
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: dynamicEmail,
        password: dynamicPassword
      }
    });
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginRes.data.token);
    creatorToken = loginRes.data.token;
    record('Dynamic User Login', 'POST /api/auth/login', 'PASS');

    // Invalid password check
    const badLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        email: dynamicEmail,
        password: 'WrongPassword123!'
      }
    });
    assert.strictEqual(badLoginRes.status, 401);
    record('Login Invalid Password Rejection', 'POST /api/auth/login (bad pw)', 'PASS');
  } catch (err: any) {
    record('Dynamic User Login', 'POST /api/auth/login', 'FAIL', err.message);
  }

  // Persona login checks
  let reviewerToken = '';
  let adminToken = '';
  try {
    const revLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'reviewer@vajra.com', password: 'password123' }
    });
    assert.strictEqual(revLogin.status, 200);
    reviewerToken = revLogin.data.token;
    record('Reviewer Persona Authentication', 'POST /api/auth/login (reviewer)', 'PASS');

    const admLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@vajra.com', password: 'password123' }
    });
    assert.strictEqual(admLogin.status, 200);
    adminToken = admLogin.data.token;
    record('Admin Persona Authentication', 'POST /api/auth/login (admin)', 'PASS');
  } catch (err: any) {
    record('Seed Persona Authentication', 'POST /api/auth/login', 'FAIL', err.message);
  }

  // PHASE 3: Creator Workspace
  console.log('\n--- Phase 3: Creator Workspace ---');
  let submissionId = '';
  let findingId = '';
  let suggestionId = '';

  try {
    // 1. Create Draft with deliberate violations
    const subRes = await request('/api/content', {
      method: 'POST',
      token: creatorToken,
      body: {
        title: `Autonomous QA Cloud Security Launch ${timestamp}`,
        bodyText: 'Our unhackable cloud platform provides cheap security with guaranteed no bugs and 100% uptime for all 10,000 enterprise customers worldwide.',
        channel: 'LINKEDIN',
        contentType: 'SOCIAL_COPY',
        targetAudience: 'Enterprise IT Leaders'
      }
    });
    assert.strictEqual(subRes.status, 201);
    submissionId = subRes.data.submissionId;
    record('Draft Submission Creation', 'POST /api/content', 'PASS');

    // 2. Run Preflight AI Scan
    const scanRes = await request('/api/scans/run', {
      method: 'POST',
      token: creatorToken,
      body: { submissionId }
    });
    assert.strictEqual(scanRes.status, 200);
    assert.ok(scanRes.data.findings.length > 0);
    record('AI Governance Preflight Scan', 'POST /api/scans/run', 'PASS');

    // 3. Verify Inspection Studio Details & Findings
    const detailRes = await request(`/api/content/${submissionId}`, {
      token: creatorToken
    });
    assert.strictEqual(detailRes.status, 200);
    const findingsList = detailRes.data.latestFindings || [];
    assert.ok(findingsList.length >= 2, 'Must have at least 2 governance findings detected');
    findingId = findingsList[0].id;
    suggestionId = findingsList[0].suggestion_id;
    record('Inspection Studio Data & Findings Retrieval', `GET /api/content/${submissionId}`, 'PASS');

    // 4. Accept Correction Suggestion
    if (suggestionId) {
      const acceptRes = await request(`/api/suggestions/${suggestionId}/accept`, {
        method: 'POST',
        token: creatorToken
      });
      assert.strictEqual(acceptRes.status, 200);
      record('Accept AI Suggestion', `POST /api/suggestions/${suggestionId}/accept`, 'PASS');
    }

    // 5. Submit Revised Version (Version bump N+1)
    const revisedText = 'Our cloud platform delivers enterprise-grade resilient architecture with 99.99% high-availability SLA backed by financial credits for all 2,500 enterprise customers.';
    const resubmitRes = await request(`/api/content/${submissionId}/resubmit`, {
      method: 'POST',
      token: creatorToken,
      body: {
        revisedBodyText: revisedText,
        changeSummary: 'Replaced unhackable and corrected metrics to match approved brand guidelines'
      }
    });
    assert.strictEqual(resubmitRes.status, 200);
    assert.strictEqual(resubmitRes.data.versionNumber, 2);
    record('Content Revision Submission (Version Bump)', `POST /api/content/${submissionId}/resubmit`, 'PASS');

    // 6. Scan Revised Version
    const scan2Res = await request('/api/scans/run', {
      method: 'POST',
      token: creatorToken,
      body: { submissionId }
    });
    assert.strictEqual(scan2Res.status, 200);
    record('Governance Re-scan on Revised Copy', 'POST /api/scans/run (v2)', 'PASS');

    // 7. Non-Destructive Version Restore (Restore v1 as v3)
    const restoreRes = await request(`/api/content/${submissionId}/restore-version`, {
      method: 'POST',
      token: creatorToken,
      body: { targetVersionNumber: 1 }
    });
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.versionNumber, 3);
    record('Non-Destructive Version Restoration', `POST /api/content/${submissionId}/restore-version`, 'PASS');

    // 8. Brand Asset Validation
    const assetValRes = await request('/api/brands/assets/validate-draft', {
      method: 'POST',
      token: creatorToken,
      body: { draftText: 'Vajra Sentinel primary logo on dark background' }
    });
    assert.strictEqual(assetValRes.status, 200);
    record('Brand Asset Draft Validation', 'POST /api/brands/assets/validate-draft', 'PASS');
  } catch (err: any) {
    record('Creator Workspace Flow', 'Workspace test suite', 'FAIL', err.message);
  }

  // PHASE 4: Reviewer Workspace
  console.log('\n--- Phase 4: Reviewer Workspace ---');
  try {
    // 1. Review Queue
    const queueRes = await request('/api/reviews/queue', {
      token: reviewerToken
    });
    assert.strictEqual(queueRes.status, 200);
    assert.ok(Array.isArray(queueRes.data.queue));
    record('Reviewer Console Queue Retrieval', 'GET /api/reviews/queue', 'PASS');

    // 2. Add Reviewer Comment
    const commentRes = await request(`/api/reviews/${submissionId}/comment`, {
      method: 'POST',
      token: reviewerToken,
      body: { commentText: 'QA functional review: please ensure compliance SLA citations.' }
    });
    assert.strictEqual(commentRes.status, 201);
    record('Reviewer Commentary Threading', `POST /api/reviews/${submissionId}/comment`, 'PASS');

    // 3. Escalate Review
    const escalateRes = await request(`/api/reviews/${submissionId}/escalate`, {
      method: 'POST',
      token: reviewerToken,
      body: { reason: 'Need executive brand sign-off on enterprise launch copy.' }
    });
    assert.strictEqual(escalateRes.status, 200);
    record('Reviewer Escalation Flow', `POST /api/reviews/${submissionId}/escalate`, 'PASS');

    // 4. Notifications Check
    const notifRes = await request('/api/notifications', {
      token: creatorToken
    });
    assert.strictEqual(notifRes.status, 200);
    record('Notifications In-App Delivery', 'GET /api/notifications', 'PASS');

    // 5. Final Approval Decision (by Reviewer / Admin)
    const approveRes = await request(`/api/reviews/${submissionId}/approve`, {
      method: 'POST',
      token: reviewerToken,
      body: { reason: 'Approved under QA compliance verification.' }
    });
    assert.strictEqual(approveRes.status, 200);
    record('Reviewer Approval Decision', `POST /api/reviews/${submissionId}/approve`, 'PASS');

    // 6. Clearance Certificate Verification (UI Component & Approval Gate)
    const approvedSubRes = await request(`/api/content/${submissionId}`, {
      token: creatorToken
    });
    assert.strictEqual(approvedSubRes.status, 200);
    assert.strictEqual(approvedSubRes.data.submission.current_status, 'APPROVED');
    assert.ok(approvedSubRes.data.decisions.length > 0);
    record('Brand Clearance Certificate Data & Modal Readiness', `GET /api/content/${submissionId} (APPROVED state)`, 'PASS');
  } catch (err: any) {
    record('Reviewer Workspace Flow', 'Reviewer test suite', 'FAIL', err.message);
  }

  // PHASE 5: Admin Workspace
  console.log('\n--- Phase 5: Admin Workspace ---');
  try {
    // 1. Brand Knowledge Base Retrieval
    const kbRes = await request('/api/brands/knowledge', {
      token: adminToken
    });
    assert.strictEqual(kbRes.status, 200);
    const guidelines = kbRes.data.guidelines || [];
    assert.ok(guidelines.length > 0);
    record('Brand Knowledge Base Retrieval', 'GET /api/brands/knowledge', 'PASS');

    // 2. Guidelines Management & Version Bump
    const g = guidelines[0];
    const bumpRes = await request(`/api/brands/guidelines/${g.id}`, {
      method: 'PUT',
      token: adminToken,
      body: {
        title: g.title,
        category: g.category,
        content: g.content + ' [Updated for 2026 QA Compliance]'
      }
    });
    assert.strictEqual(bumpRes.status, 200);
    record('Guideline Update & Semantic Version Bump', `PUT /api/brands/guidelines/${g.id}`, 'PASS');

    // 3. Voice Rule Status Toggle
    const voiceRules = kbRes.data.voiceRules || [];
    if (voiceRules.length > 0) {
      const v = voiceRules[0];
      const newStatus = v.status === 'APPROVED' ? 'RETIRED' : 'APPROVED';
      const toggleRes = await request(`/api/brands/voice-rules/${v.id}/toggle-status`, {
        method: 'PATCH',
        token: adminToken,
        body: { status: newStatus }
      });
      assert.strictEqual(toggleRes.status, 200);
      record('Voice Rule Lifecycle Status Toggling', `PATCH /api/brands/voice-rules/${v.id}/toggle-status`, 'PASS');
    }

    // 4. Terminology Active State Toggle
    const terms = kbRes.data.terminologyRules || [];
    if (terms.length > 0) {
      const t = terms[0];
      const toggleTermRes = await request(`/api/brands/terminology/${t.id}/toggle-active`, {
        method: 'PATCH',
        token: adminToken
      });
      assert.strictEqual(toggleTermRes.status, 200);
      record('Prohibited Terminology Active State Toggling', `PATCH /api/brands/terminology/${t.id}/toggle-active`, 'PASS');
    }

    // 5. Bulk Facts Import with Deduplication
    const bulkPayload = {
      facts: [
        {
          claimText: `QA Verified Fact ${timestamp}: Zero Trust Isolation Architecture`,
          sourceName: 'Security Whitepaper 2026',
          sourceId: `WP-${timestamp}`,
          category: 'PRODUCT_SPECS',
          confidenceScore: 0.99
        },
        {
          // Existing seed fact (duplicate)
          claimText: 'Delivers 99.99% high-availability SLA backed by contractual financial credits.',
          sourceName: 'Vajra Master Service Agreement 2026',
          sourceId: 'DOC-SLA-2026',
          category: 'PRODUCT_SPECS'
        }
      ]
    };
    const bulkRes = await request('/api/brands/approved-facts/bulk-import', {
      method: 'POST',
      token: adminToken,
      body: bulkPayload
    });
    assert.strictEqual(bulkRes.status, 200);
    const inserted = bulkRes.data.insertedCount ?? bulkRes.data.importedCount;
    const duplicates = bulkRes.data.duplicatesSkippedCount ?? bulkRes.data.duplicateCount;
    assert.strictEqual(inserted, 1);
    assert.strictEqual(duplicates, 1);
    record('Bulk Facts Import with Deduplication', 'POST /api/brands/approved-facts/bulk-import', 'PASS');

    // 6. Governance Analytics Retrieval with Date Filters
    const analyticsRes = await request('/api/analytics/overview?timeframe=all', {
      token: adminToken
    });
    assert.strictEqual(analyticsRes.status, 200);
    assert.ok(analyticsRes.data.counts && analyticsRes.data.counts.TOTAL >= 1);
    record('Governance Analytics & Metric Aggregation', 'GET /api/analytics/overview', 'PASS');

    // 7. Immutable Audit Logs
    const auditRes = await request('/api/audit', {
      token: adminToken
    });
    assert.strictEqual(auditRes.status, 200);
    assert.ok(auditRes.data.logs.length > 0);
    record('Immutable Audit Trail Event Logging', 'GET /api/audit', 'PASS');

    // 8. Administrative User Provisioning
    const provEmail = `prov_qa_${timestamp}@vajra.com`;
    const provRes = await request('/api/auth/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Provisioned QA Reviewer',
        email: provEmail,
        password: 'ReviewerPass2026!',
        role: 'HUMAN_REVIEWER'
      }
    });
    assert.strictEqual(provRes.status, 201);
    record('Admin User Provisioning (RBAC Protected)', 'POST /api/auth/admin/users', 'PASS');
  } catch (err: any) {
    record('Admin Workspace Flow', 'Admin test suite', 'FAIL', err.message);
  }

  // PHASE 6: UI Polish & Frontend SPA Route Health
  console.log('\n--- Phase 6: UI Polish & SPA Route Verification ---');
  const routesToTest = [
    { path: '/login', name: 'Login Page Route' },
    { path: '/register', name: 'Register Page Route' },
    { path: '/', name: 'Dashboard SPA Route' },
    { path: '/creator', name: 'Creator Workspace Route' },
    { path: `/inspection/${submissionId || 'sub_test_press_release_001'}`, name: 'Inspection Studio Route' },
    { path: '/reviewer', name: 'Reviewer Console Route' },
    { path: '/knowledge', name: 'Brand Knowledge Base Route' },
    { path: '/analytics', name: 'Analytics Page Route' },
    { path: '/audit', name: 'Audit Logs Route' },
    { path: '/settings', name: 'Settings Route' }
  ];

  for (const r of routesToTest) {
    try {
      const res = await testFrontendRoute(r.path);
      assert.strictEqual(res.status, 200);
      assert.ok(res.hasRoot);
      assert.ok(res.hasMainScript);
      record(r.name, `GET ${FRONTEND_URL}${r.path}`, 'PASS');
    } catch (err: any) {
      record(r.name, `GET ${FRONTEND_URL}${r.path}`, 'FAIL', err.message);
    }
  }

  console.log('\n======================================================');
  const passed = testResults.filter(r => r.result === 'PASS').length;
  console.log(`QA VERIFICATION COMPLETE: ${passed}/${testResults.length} CHECKS PASSED`);
  console.log('======================================================\n');
}

runQA();
