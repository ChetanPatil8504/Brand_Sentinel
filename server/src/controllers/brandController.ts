import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/audit.js';

// Get Full Brand Workspace Knowledge Base
export function getBrandKnowledge(req: AuthRequest, res: Response): void {
  const brand = db.prepare(`SELECT * FROM brands LIMIT 1`).get() as any;
  if (!brand) {
    res.status(404).json({ error: 'No brand configured' });
    return;
  }

  const guidelines = db.prepare(`
    SELECT g.*, u.full_name as owner_name, v.content as current_content
    FROM brand_guidelines g
    LEFT JOIN users u ON g.owner_id = u.id
    LEFT JOIN guideline_versions v ON g.id = v.guideline_id AND g.current_version = v.version
    WHERE g.brand_id = ?
    ORDER BY g.created_at DESC
  `).all(brand.id);

  const voiceRules = db.prepare(`
    SELECT * FROM voice_tone_rules WHERE brand_id = ? ORDER BY created_at DESC
  `).all(brand.id);

  const terminologyRules = db.prepare(`
    SELECT * FROM terminology_rules WHERE brand_id = ? ORDER BY created_at DESC
  `).all(brand.id);

  const approvedFacts = db.prepare(`
    SELECT * FROM approved_facts WHERE brand_id = ? ORDER BY created_at DESC
  `).all(brand.id);

  const approvedClaims = db.prepare(`
    SELECT * FROM approved_claims WHERE brand_id = ? ORDER BY created_at DESC
  `).all(brand.id);

  const brandAssets = db.prepare(`
    SELECT * FROM brand_assets WHERE brand_id = ? ORDER BY created_at DESC
  `).all(brand.id);

  const campaigns = db.prepare(`
    SELECT * FROM campaigns WHERE brand_id = ? ORDER BY created_at DESC
  `).all(brand.id);

  res.json({
    brand,
    guidelines,
    voiceRules,
    terminologyRules,
    approvedFacts,
    approvedClaims,
    brandAssets,
    campaigns
  });
}

// Create or Update Guideline (Admin only)
export function createGuideline(req: AuthRequest, res: Response): void {
  const { title, category, content, version, effectiveDate, expiryDate } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  if (!title || !category || !content) {
    res.status(400).json({ error: 'Title, category, and content are required' });
    return;
  }

  const guidelineId = 'gd_' + uuidv4().slice(0, 16);
  const v = version || '1.0';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO brand_guidelines (id, brand_id, title, category, status, current_version, effective_date, expiry_date, owner_id)
      VALUES (?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?)
    `).run(guidelineId, brand.id, title, category, v, effectiveDate || new Date().toISOString().split('T')[0], expiryDate || null, req.user?.id);

    db.prepare(`
      INSERT INTO guideline_versions (id, guideline_id, version, content, changelog, created_by)
      VALUES (?, ?, ?, ?, 'Initial version created', ?)
    `).run(uuidv4(), guidelineId, v, content, req.user?.id);
  });

  tx();

  recordAuditLog({
    userId: req.user?.id,
    action: 'GUIDELINE_CREATED',
    metadata: { guidelineId, title, version: v }
  });

  res.status(201).json({ message: 'Guideline created successfully', guidelineId });
}

// Add or Update Terminology Rule
export function addTerminologyRule(req: AuthRequest, res: Response): void {
  const { prohibitedTerm, preferredTerm, contextExplanation, category, severity } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  if (!prohibitedTerm || !contextExplanation) {
    res.status(400).json({ error: 'Prohibited term and context explanation are required' });
    return;
  }

  const id = 'trm_' + uuidv4().slice(0, 16);
  db.prepare(`
    INSERT INTO terminology_rules (id, brand_id, prohibited_term, preferred_term, context_explanation, category, severity, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id,
    brand.id,
    prohibitedTerm,
    preferredTerm || null,
    contextExplanation,
    category || 'BRAND_IDENTITY',
    severity || 'HIGH'
  );

  recordAuditLog({
    userId: req.user?.id,
    action: 'TERMINOLOGY_RULE_ADDED',
    metadata: { prohibitedTerm, preferredTerm }
  });

  res.status(201).json({ message: 'Terminology rule registered', id });
}

// Add Approved Fact
export function addApprovedFact(req: AuthRequest, res: Response): void {
  const { category, claimText, contextNotes, sourceName, sourceId, sourceVersion, effectiveDate } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  if (!claimText || !sourceName || !sourceId) {
    res.status(400).json({ error: 'Claim text, source name, and source ID are required' });
    return;
  }

  const id = 'fct_' + uuidv4().slice(0, 16);
  db.prepare(`
    INSERT INTO approved_facts (id, brand_id, category, claim_text, context_notes, source_name, source_id, source_version, effective_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
  `).run(
    id,
    brand.id,
    category || 'PRODUCT_SPECS',
    claimText,
    contextNotes || null,
    sourceName,
    sourceId,
    sourceVersion || '1.0',
    effectiveDate || new Date().toISOString().split('T')[0]
  );

  recordAuditLog({
    userId: req.user?.id,
    action: 'APPROVED_FACT_ADDED',
    metadata: { sourceId, sourceName }
  });

  res.status(201).json({ message: 'Approved fact registered', id });
}

// Add Voice & Tone Rule
export function addVoiceRule(req: AuthRequest, res: Response): void {
  const { traitName, doGuideline, dontGuideline, exampleGood, exampleBad, severity } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  if (!traitName || !doGuideline || !dontGuideline) {
    res.status(400).json({ error: 'Trait name, DO and DONT guidelines are required' });
    return;
  }

  const id = 'vcr_' + uuidv4().slice(0, 16);
  db.prepare(`
    INSERT INTO voice_tone_rules (id, brand_id, trait_name, do_guideline, dont_guideline, example_good, example_bad, severity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
  `).run(
    id,
    brand.id,
    traitName,
    doGuideline,
    dontGuideline,
    exampleGood || null,
    exampleBad || null,
    severity || 'HIGH'
  );

  recordAuditLog({
    userId: req.user?.id,
    action: 'VOICE_RULE_ADDED',
    metadata: { traitName }
  });

  res.status(201).json({ message: 'Voice rule registered', id });
}

// Add Brand Asset
export function addBrandAsset(req: AuthRequest, res: Response): void {
  const { assetName, assetType, fileUrl, usageGuidelines, restrictions } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  if (!assetName || !assetType || !usageGuidelines) {
    res.status(400).json({ error: 'Asset name, type, and usage guidelines are required' });
    return;
  }

  const id = 'ast_' + uuidv4().slice(0, 16);
  db.prepare(`
    INSERT INTO brand_assets (id, brand_id, asset_name, asset_type, file_url, usage_guidelines, restrictions, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED')
  `).run(
    id,
    brand.id,
    assetName,
    assetType,
    fileUrl || null,
    usageGuidelines,
    restrictions || 'Use only as specified'
  );

  res.status(201).json({ message: 'Brand asset registered', id });
}

// 5.1 Edit Existing Brand Guideline (with Version Increment & History Preservation)
export function updateGuideline(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const { title, category, content, changelog, effectiveDate, expiryDate } = req.body;

  if (!title || !category || !content) {
    res.status(400).json({ error: 'Title, category, and content are required' });
    return;
  }

  const existing = db.prepare(`SELECT * FROM brand_guidelines WHERE id = ?`).get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Guideline not found' });
    return;
  }

  // Increment version (e.g. 1.0 -> 1.1, 2.1 -> 2.2)
  const currentVerNum = parseFloat(existing.current_version) || 1.0;
  const nextVer = (currentVerNum + 0.1).toFixed(1);

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE brand_guidelines
      SET title = ?, category = ?, current_version = ?, effective_date = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, category, nextVer, effectiveDate || existing.effective_date, expiryDate || null, id);

    db.prepare(`
      INSERT INTO guideline_versions (id, guideline_id, version, content, changelog, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, nextVer, content, changelog || `Updated to version ${nextVer}`, req.user?.id);
  });

  tx();

  recordAuditLog({
    userId: req.user?.id,
    action: 'GUIDELINE_UPDATED',
    metadata: { guidelineId: id, title, previousVersion: existing.current_version, newVersion: nextVer, changelog }
  });

  res.json({
    message: `Guideline updated to version ${nextVer}`,
    guidelineId: id,
    version: nextVer,
    guideline: { id, title, category, current_version: nextVer }
  });
}

// 5.2 Edit Existing Voice & Tone Rule
export function updateVoiceRule(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const { traitName, doGuideline, dontGuideline, exampleGood, exampleBad, severity } = req.body;

  if (!traitName || !doGuideline || !dontGuideline) {
    res.status(400).json({ error: 'Trait name, DO and DONT guidelines are required' });
    return;
  }

  const existing = db.prepare(`SELECT * FROM voice_tone_rules WHERE id = ?`).get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Voice rule not found' });
    return;
  }

  db.prepare(`
    UPDATE voice_tone_rules
    SET trait_name = ?, do_guideline = ?, dont_guideline = ?, example_good = ?, example_bad = ?, severity = ?
    WHERE id = ?
  `).run(traitName, doGuideline, dontGuideline, exampleGood || null, exampleBad || null, severity || 'HIGH', id);

  recordAuditLog({
    userId: req.user?.id,
    action: 'VOICE_RULE_UPDATED',
    metadata: { ruleId: id, traitName, previousSeverity: existing.severity, newSeverity: severity }
  });

  res.json({ message: 'Voice rule updated successfully', id });
}

// 5.2 Toggle Voice Rule Status (APPROVED <-> RETIRED)
export function toggleVoiceRuleStatus(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM voice_tone_rules WHERE id = ?`).get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Voice rule not found' });
    return;
  }

  const nextStatus = existing.status === 'APPROVED' ? 'RETIRED' : 'APPROVED';
  db.prepare(`UPDATE voice_tone_rules SET status = ? WHERE id = ?`).run(nextStatus, id);

  recordAuditLog({
    userId: req.user?.id,
    action: 'VOICE_RULE_STATUS_TOGGLED',
    metadata: { ruleId: id, traitName: existing.trait_name, previousStatus: existing.status, newStatus: nextStatus }
  });

  res.json({
    message: `Voice rule status set to ${nextStatus}`,
    id,
    status: nextStatus,
    voiceRule: { id, status: nextStatus }
  });
}

// 5.3 Edit Terminology Rule
export function updateTerminologyRule(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const { prohibitedTerm, preferredTerm, contextExplanation, category, severity } = req.body;

  if (!prohibitedTerm || !contextExplanation) {
    res.status(400).json({ error: 'Prohibited term and context explanation are required' });
    return;
  }

  const existing = db.prepare(`SELECT * FROM terminology_rules WHERE id = ?`).get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Terminology rule not found' });
    return;
  }

  db.prepare(`
    UPDATE terminology_rules
    SET prohibited_term = ?, preferred_term = ?, context_explanation = ?, category = ?, severity = ?
    WHERE id = ?
  `).run(
    prohibitedTerm,
    preferredTerm || null,
    contextExplanation,
    category || 'BRAND_IDENTITY',
    severity || 'HIGH',
    id
  );

  recordAuditLog({
    userId: req.user?.id,
    action: 'TERMINOLOGY_RULE_UPDATED',
    metadata: { ruleId: id, prohibitedTerm, preferredTerm }
  });

  res.json({ message: 'Terminology rule updated successfully', id });
}

// 5.3 Toggle Terminology Rule Active Status (Active <-> Inactive)
export function toggleTerminologyStatus(req: AuthRequest, res: Response): void {
  const { id } = req.params;
  const existing = db.prepare(`SELECT * FROM terminology_rules WHERE id = ?`).get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Terminology rule not found' });
    return;
  }

  const nextActive = existing.is_active === 1 ? 0 : 1;
  db.prepare(`UPDATE terminology_rules SET is_active = ? WHERE id = ?`).run(nextActive, id);

  recordAuditLog({
    userId: req.user?.id,
    action: 'TERMINOLOGY_STATUS_TOGGLED',
    metadata: { ruleId: id, prohibitedTerm: existing.prohibited_term, isActive: nextActive === 1 }
  });

  res.json({
    message: `Terminology rule is now ${nextActive === 1 ? 'ACTIVE' : 'DEACTIVATED'}`,
    id,
    isActive: nextActive === 1,
    terminologyRule: { id, is_active: nextActive }
  });
}

// 5.4 Bulk Import Approved Facts (JSON / CSV with Duplicate Detection & Validation)
export function bulkImportApprovedFacts(req: AuthRequest, res: Response): void {
  const { facts, csvContent } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  let rawList: any[] = [];

  if (Array.isArray(facts)) {
    rawList = facts;
  } else if (typeof csvContent === 'string' && csvContent.trim().length > 0) {
    // Parse CSV rows
    const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = values[idx] || '';
        });
        rawList.push({
          category: obj.category || 'PRODUCT_SPECS',
          claimText: obj.claimtext || obj.claim_text || obj.fact || '',
          contextNotes: obj.contextnotes || obj.context_notes || '',
          sourceName: obj.sourcename || obj.source_name || '',
          sourceId: obj.sourceid || obj.source_id || '',
          sourceVersion: obj.sourceversion || obj.source_version || '1.0',
          effectiveDate: obj.effectivedate || obj.effective_date || new Date().toISOString().split('T')[0]
        });
      }
    }
  }

  if (rawList.length === 0) {
    res.status(400).json({ error: 'No facts supplied. Provide a JSON array of facts or a CSV text payload.' });
    return;
  }

  const validCategories = ['PRODUCT_SPECS', 'FINANCIAL', 'SECURITY', 'COMPANY_HISTORY', 'AWARDS', 'ESG'];
  const errors: Array<{ row: number; reason: string }> = [];
  const validFactsToInsert: any[] = [];
  let duplicateCount = 0;

  // Pre-load existing facts for duplicate detection
  const existingFacts = db.prepare(`SELECT claim_text, source_id FROM approved_facts WHERE brand_id = ?`).all(brand.id) as any[];
  const existingTextSet = new Set(existingFacts.map(f => f.claim_text.toLowerCase().trim()));

  rawList.forEach((item, idx) => {
    const rowNum = idx + 1;
    if (!item.claimText || item.claimText.trim().length < 5) {
      errors.push({ row: rowNum, reason: 'Claim text is required (minimum 5 characters).' });
      return;
    }
    if (!item.sourceName || !item.sourceId) {
      errors.push({ row: rowNum, reason: 'Source Name and Source ID are mandatory.' });
      return;
    }

    const normText = item.claimText.toLowerCase().trim();
    if (existingTextSet.has(normText)) {
      duplicateCount++;
      return; // Skip duplicate
    }

    const cat = validCategories.includes(item.category) ? item.category : 'PRODUCT_SPECS';
    validFactsToInsert.push({
      id: 'fct_' + uuidv4().slice(0, 16),
      brandId: brand.id,
      category: cat,
      claimText: item.claimText.trim(),
      contextNotes: item.contextNotes ? item.contextNotes.trim() : null,
      sourceName: item.sourceName.trim(),
      sourceId: item.sourceId.trim(),
      sourceVersion: item.sourceVersion || '1.0',
      effectiveDate: item.effectiveDate || new Date().toISOString().split('T')[0]
    });

    existingTextSet.add(normText);
  });

  // Batch insert valid facts
  if (validFactsToInsert.length > 0) {
    const insertStmt = db.prepare(`
      INSERT INTO approved_facts (id, brand_id, category, claim_text, context_notes, source_name, source_id, source_version, effective_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
    `);

    const insertTx = db.transaction(() => {
      for (const f of validFactsToInsert) {
        insertStmt.run(f.id, f.brandId, f.category, f.claimText, f.contextNotes, f.sourceName, f.sourceId, f.sourceVersion, f.effectiveDate);
      }
    });

    insertTx();

    recordAuditLog({
      userId: req.user?.id,
      action: 'APPROVED_FACTS_BULK_IMPORTED',
      metadata: { totalProvided: rawList.length, inserted: validFactsToInsert.length, duplicatesSkipped: duplicateCount, errorsCount: errors.length }
    });
  }

  res.status(200).json({
    message: `Bulk import completed: ${validFactsToInsert.length} facts imported, ${duplicateCount} duplicates skipped, ${errors.length} rows rejected.`,
    totalProvided: rawList.length,
    importedCount: validFactsToInsert.length,
    insertedCount: validFactsToInsert.length,
    duplicateCount,
    duplicatesSkippedCount: duplicateCount,
    errors
  });
}

// 7.2 Brand Asset Validation Module
export function validateDraftAsset(req: AuthRequest, res: Response): void {
  const { assetName, assetType, draftText, fileUrl, expectedUsage } = req.body;
  const brand = db.prepare(`SELECT id FROM brands LIMIT 1`).get() as any;

  if (!assetName && !draftText) {
    res.status(400).json({ error: 'assetName or draftText is required for asset validation' });
    return;
  }

  const queryType = assetType || 'LOGO';
  const searchTerm = assetName ? `%${assetName.trim()}%` : '%';

  // Find matching approved assets in brand repository
  const approvedMatches = db.prepare(`
    SELECT * FROM brand_assets
    WHERE brand_id = ? AND status = 'APPROVED'
      AND (asset_type = ? OR LOWER(asset_name) LIKE LOWER(?) OR ( ? IS NOT NULL AND INSTR(?, asset_name) > 0 ))
  `).all(brand.id, queryType, searchTerm, draftText || null, draftText || '') as any[];

  if (approvedMatches.length === 0) {
    res.json({
      status: 'UNVERIFIED',
      score: 40,
      matchedAsset: null,
      message: `No approved brand asset matching "${assetName || 'draft text'}". Unverified asset usage warning.`,
      recommendation: 'Register this asset in the Brand Knowledge Management portal before external distribution.'
    });
    return;
  }

  const primaryMatch = approvedMatches[0];

  res.json({
    status: 'VALID',
    score: 95,
    matchedAsset: {
      id: primaryMatch.id,
      asset_name: primaryMatch.asset_name,
      asset_type: primaryMatch.asset_type,
      usage_guidelines: primaryMatch.usage_guidelines,
      restrictions: primaryMatch.restrictions
    },
    message: `Asset "${primaryMatch.asset_name}" verified against approved brand asset repository.`,
    usageGuidelines: primaryMatch.usage_guidelines,
    restrictions: primaryMatch.restrictions
  });
}

