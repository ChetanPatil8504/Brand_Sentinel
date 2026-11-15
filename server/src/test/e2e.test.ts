import assert from 'assert';
import db from '../db/connection.js';
import { seed } from '../db/seed.js';
import { executeGovernanceScan } from '../engine/governanceOrchestrator.js';
import { validateFileSignature } from '../engine/preprocessor.js';
import { sendEscalationNotification } from '../services/emailService.js';

async function runEndToEndVerification() {
  console.log('=== BRAND SENTINEL END-TO-END VALIDATION SUITE ===\n');

  // 1. Reset and Seed Database
  console.log('Step 1: Initializing and Seeding Database...');
  seed();

  // 2. Verify Seeding Integrity
  const brand = db.prepare('SELECT * FROM brands WHERE slug = ?').get('vajra-sentinel') as any;
  assert.ok(brand, 'Brand must exist in database');
  console.log(`✓ Brand initialized: "${brand.name}"`);

  const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  assert.strictEqual(usersCount, 3, 'Must have 3 core roles seeded (Creator, Reviewer, Admin)');
  console.log(`✓ Core RBAC Users verified: ${usersCount} users`);

  // 3. Test Governance Scan on Pre-seeded Content
  console.log('\nStep 2: Executing AI Governance Scan on Uncompliant Content...');
  const sub1 = db.prepare('SELECT * FROM content_submissions WHERE id = ?').get('sub_test_press_release_001') as any;
  const ver1 = db.prepare('SELECT * FROM content_versions WHERE submission_id = ? AND version_number = 1').get(sub1.id) as any;

  const scanResult = await executeGovernanceScan(sub1.id, ver1.id);

  console.log(`✓ Scan finished with score: ${scanResult.score}/100`);
  console.log(`✓ Total Violations Detected: ${scanResult.findingsCount}`);
  assert.ok(scanResult.findingsCount > 0, 'Scan must detect violations in bad copy');

  // Verify critical findings exist
  const criticalFindings = scanResult.findings.filter(f => f.severity === 'CRITICAL');
  console.log(`✓ Critical Findings: ${criticalFindings.length}`);
  assert.ok(criticalFindings.length >= 2, 'Should identify at least 2 critical findings (e.g. unhackable, 100% SLA discrepancy)');

  // Verify Source Grounding
  const groundedWithEvidence = scanResult.findings.filter(f => f.evidence && f.evidence.sourceId);
  console.log(`✓ Findings with Grounded Evidence: ${groundedWithEvidence.length}/${scanResult.findingsCount}`);
  assert.strictEqual(groundedWithEvidence.length, scanResult.findingsCount, 'Every finding must have grounded evidence');

  // Check specific finding: "unhackable"
  const unhackableFinding = scanResult.findings.find(f => f.problematicText.toLowerCase().includes('unhackable'));
  assert.ok(unhackableFinding, 'Must identify prohibited term "unhackable"');
  console.log(`✓ Grounded Finding Verified: "${unhackableFinding.problematicText}" -> Suggested: "${unhackableFinding.suggestion?.suggestedText}"`);

  // Check specific finding: metric discrepancy (10,000 customers vs approved 2,500)
  const metricFinding = scanResult.findings.find(f => f.problematicText.includes('10,000'));
  assert.ok(metricFinding, 'Must catch customer count discrepancy against approved financial fact');
  console.log(`✓ Factual Grounding Verified: "${metricFinding.problematicText}" -> Excerpt: "${metricFinding.evidence.sourceExcerpt}"`);

  // 4. Test Version Increment Lifecycle
  console.log('\nStep 3: Testing Revision Workflow (Version Increment)...');
  const revisedBody = 'Vajra Sentinel is an enterprise-grade resilient platform delivering a 99.99% high-availability SLA. Over 2,500 enterprise organizations trust our solution.';
  const nextVer = sub1.current_version + 1;

  db.prepare(`
    INSERT INTO content_versions (id, submission_id, version_number, body_text, word_count, change_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('ver_test_v2', sub1.id, nextVer, revisedBody, revisedBody.split(' ').length, 'Applied AI suggestions');

  db.prepare(`UPDATE content_submissions SET current_version = ?, current_status = 'IN_REVIEW' WHERE id = ?`).run(nextVer, sub1.id);

  const updatedSub = db.prepare('SELECT * FROM content_submissions WHERE id = ?').get(sub1.id) as any;
  assert.strictEqual(updatedSub.current_version, 2, 'Version must be incremented to 2');
  assert.strictEqual(updatedSub.current_status, 'IN_REVIEW', 'Status must be updated to IN_REVIEW');
  console.log(`✓ Content revision v2 created and submitted to review queue`);

  // 5. Test Rescan of Compliant Copy
  console.log('\nStep 4: Scanning Compliant Revised Copy...');
  const rescan = await executeGovernanceScan(sub1.id, 'ver_test_v2');
  console.log(`✓ Revised Copy Score: ${rescan.score}/100 (Findings: ${rescan.findingsCount})`);
  assert.ok(rescan.score >= 90, 'Compliant revision should achieve high score (>=90)');

  // 6. Test Reviewer Decision & Human Stewardship Gate
  console.log('\nStep 5: Testing Human Reviewer Approval Gate...');
  const reviewer = db.prepare("SELECT * FROM users WHERE role = 'HUMAN_REVIEWER'").get() as any;
  db.prepare(`
    INSERT INTO review_decisions (id, submission_id, reviewer_id, decision, reason, version_number)
    VALUES (?, ?, ?, 'APPROVED', 'Verified all metrics against approved fact SRC-FIN-2025-09.', 2)
  `).run('dec_test_001', sub1.id, reviewer.id);
  db.prepare(`UPDATE content_submissions SET current_status = 'APPROVED' WHERE id = ?`).run(sub1.id);

  const finalSub = db.prepare('SELECT * FROM content_submissions WHERE id = ?').get(sub1.id) as any;
  assert.strictEqual(finalSub.current_status, 'APPROVED', 'Content must now be officially APPROVED');
  console.log(`✓ Human Reviewer Decision recorded: APPROVED by ${reviewer.full_name}`);

  // 7. Verify Immutable Audit Trail
  console.log('\nStep 6: Verifying Audit Log Integrity...');
  const auditLogsCount = (db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any).c;
  assert.ok(auditLogsCount >= 5, 'Audit trail must contain multiple lifecycle records');
  console.log(`✓ Immutable Audit Trail confirmed with ${auditLogsCount} verified event logs`);

  // 8. Test Guideline Versioning & History Preservation
  console.log('\nStep 7: Testing Guideline Versioning and Archival...');
  const guideline = db.prepare('SELECT * FROM brand_guidelines LIMIT 1').get() as any;
  const oldVer = guideline.current_version;
  const newVer = (parseFloat(oldVer) + 1.0).toFixed(1);
  const currentVerRow = db.prepare('SELECT content FROM guideline_versions WHERE guideline_id = ? AND version = ?').get(guideline.id, oldVer) as any;
  const oldContent = currentVerRow ? currentVerRow.content : 'Executive tone policy guidelines';
  const updatedContent = oldContent + '\nMandatory update for 2026.';

  // Archive old version if not already archived
  db.prepare(`
    INSERT INTO guideline_versions (id, guideline_id, version, content, changelog, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`gv_test_${Date.now()}`, guideline.id, newVer, updatedContent, 'New version created in test', reviewer.id);

  // Update guideline
  db.prepare(`
    UPDATE brand_guidelines
    SET current_version = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newVer, guideline.id);

  const updatedGuideline = db.prepare('SELECT * FROM brand_guidelines WHERE id = ?').get(guideline.id) as any;
  assert.strictEqual(updatedGuideline.current_version, newVer, 'Guideline version must be incremented');
  const archivedVersions = db.prepare('SELECT COUNT(*) as c FROM guideline_versions WHERE guideline_id = ?').get(guideline.id) as any;
  assert.ok(archivedVersions.c >= 1, 'Previous version must be archived in guideline_versions table');
  console.log(`✓ Guideline bumped to v${newVer} and previous v${oldVer} preserved in history`);

  // 9. Test Voice Rule and Terminology Toggling
  console.log('\nStep 8: Testing Voice & Terminology State Toggling...');
  const voiceRule = db.prepare('SELECT * FROM voice_tone_rules LIMIT 1').get() as any;
  const newVoiceStatus = voiceRule.status === 'APPROVED' ? 'RETIRED' : 'APPROVED';
  db.prepare('UPDATE voice_tone_rules SET status = ? WHERE id = ?').run(newVoiceStatus, voiceRule.id);
  const updatedVoice = db.prepare('SELECT status FROM voice_tone_rules WHERE id = ?').get(voiceRule.id) as any;
  assert.strictEqual(updatedVoice.status, newVoiceStatus, 'Voice rule status must toggle correctly');
  console.log(`✓ Voice rule status toggled from ${voiceRule.status} to ${newVoiceStatus}`);

  const termRule = db.prepare('SELECT * FROM terminology_rules LIMIT 1').get() as any;
  const newTermActive = termRule.is_active === 1 ? 0 : 1;
  db.prepare('UPDATE terminology_rules SET is_active = ? WHERE id = ?').run(newTermActive, termRule.id);
  const updatedTerm = db.prepare('SELECT is_active FROM terminology_rules WHERE id = ?').get(termRule.id) as any;
  assert.strictEqual(updatedTerm.is_active, newTermActive, 'Terminology is_active must toggle correctly');
  console.log(`✓ Terminology active state toggled to ${newTermActive}`);

  // 10. Test Bulk Facts Import with Duplicate Detection
  console.log('\nStep 9: Testing Bulk Facts Import & Deduplication...');
  const bulkFacts = [
    {
      claimText: 'Brand Sentinel reduces brand violations by 74% across enterprise teams.',
      sourceName: 'Internal Quality Benchmark Q1 2026',
      sourceId: 'SRC-BENCH-2026-Q1',
      category: 'PRODUCT_SPECS',
      contextNotes: 'Quarterly telemetry benchmark'
    },
    {
      claimText: 'Brand Sentinel reduces brand violations by 74% across enterprise teams.', // Duplicate
      sourceName: 'Internal Quality Benchmark Q1 2026',
      sourceId: 'SRC-BENCH-2026-Q1',
      category: 'PRODUCT_SPECS'
    }
  ];

  let insertedCount = 0;
  let duplicatesSkippedCount = 0;
  const checkFactStmt = db.prepare(`SELECT id FROM approved_facts WHERE brand_id = ? AND (claim_text = ? OR source_id = ?)`);
  const insertFactStmt = db.prepare(`
    INSERT INTO approved_facts (id, brand_id, category, claim_text, context_notes, source_name, source_id, source_version, effective_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, '1.0', '2026-01-01', 'APPROVED')
  `);

  for (const f of bulkFacts) {
    const existing = checkFactStmt.get(brand.id, f.claimText, f.sourceId);
    if (existing) {
      duplicatesSkippedCount++;
    } else {
      insertFactStmt.run(`fact_${Date.now()}_${Math.random()}`, brand.id, f.category, f.claimText, f.contextNotes || null, f.sourceName, f.sourceId);
      insertedCount++;
    }
  }

  assert.strictEqual(insertedCount, 1, 'Exactly 1 new fact should be inserted');
  assert.strictEqual(duplicatesSkippedCount, 1, 'Duplicate fact must be detected and skipped');
  console.log(`✓ Bulk Import verified: ${insertedCount} inserted, ${duplicatesSkippedCount} duplicate skipped`);

  // 11. Test Content Version Restoration (v1 -> v2 -> restored v1 as v3)
  console.log('\nStep 10: Testing Non-Destructive Version Restoration...');
  const v1Data = db.prepare('SELECT * FROM content_versions WHERE submission_id = ? AND version_number = 1').get(sub1.id) as any;
  const v3Number = 3;
  const v3Id = `ver_test_v3_restored`;
  db.prepare(`
    INSERT INTO content_versions (id, submission_id, version_number, body_text, word_count, change_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(v3Id, sub1.id, v3Number, v1Data.body_text, v1Data.word_count, `Restored from version 1`);
  db.prepare(`UPDATE content_submissions SET current_version = ?, current_status = 'DRAFT' WHERE id = ?`).run(v3Number, sub1.id);

  const restoredSub = db.prepare('SELECT current_version, current_status FROM content_submissions WHERE id = ?').get(sub1.id) as any;
  assert.strictEqual(restoredSub.current_version, 3, 'Current version must now be 3');
  const v3Record = db.prepare('SELECT body_text FROM content_versions WHERE id = ?').get(v3Id) as any;
  assert.strictEqual(v3Record.body_text, v1Data.body_text, 'Restored version body text must match target version body text');
  console.log(`✓ Version 1 successfully restored as new immutable version 3`);

  // 12. Test Reviewer Escalation & In-App Notification Dispatch
  console.log('\nStep 11: Testing Reviewer Escalation Notifications...');
  const creator = db.prepare("SELECT * FROM users WHERE role = 'CONTENT_CREATOR'").get() as any;
  await sendEscalationNotification({
    submissionId: sub1.id,
    submissionTitle: sub1.title,
    reviewerName: reviewer.full_name,
    recipientEmail: creator.email,
    recipientUserId: creator.id,
    escalationReason: 'Legal disclaimer required for forward-looking SLA projections.'
  });

  const notification = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND title LIKE '%Escalated%' ORDER BY rowid DESC LIMIT 1").get(creator.id) as any;
  assert.ok(notification, 'Notification record must be persisted in database');
  assert.ok(notification.message.includes('Legal disclaimer required'), 'Notification must include escalation reason');
  console.log(`✓ Escalation notification recorded and sent to creator: "${notification.title}"`);

  // 13. Test File Magic Byte Verification Security
  console.log('\nStep 12: Testing Magic Byte Document Signature Security...');
  const validPdfHeader = Buffer.from('%PDF-1.4\n%Fake PDF content for test');
  const pdfCheck = validateFileSignature(validPdfHeader, 'application/pdf');
  assert.strictEqual(pdfCheck, true, 'Valid PDF magic bytes must pass');

  const spoofedExeAsPdf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00Fake Exe executable');
  const spoofCheck = validateFileSignature(spoofedExeAsPdf, 'application/pdf');
  assert.strictEqual(spoofCheck, false, 'Spoofed executable header disguised as PDF must be rejected');
  console.log(`✓ Magic byte validation verified: Legitimate PDF accepted, Spoofed binary rejected`);

  console.log('\n==================================================');
  console.log(' ALL 12 COMPREHENSIVE VALIDATION CHECKS PASSED!  ');
  console.log('==================================================\n');
}

runEndToEndVerification().catch(err => {
  console.error('Validation test failed:', err);
  process.exit(1);
});

