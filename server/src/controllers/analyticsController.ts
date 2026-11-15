import { Response } from 'express';
import db from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';

export function getOverviewAnalytics(req: AuthRequest, res: Response): void {
  const { timeframe = 'all', startDate, endDate } = req.query;

  // Build dynamic SQL date filters
  let subDateFilter = '';
  let findingDateFilter = '';
  let decisionDateFilter = '';
  const subParams: any[] = [];
  const findingParams: any[] = [];
  const decisionParams: any[] = [];

  if (timeframe === '7d') {
    subDateFilter = ` AND s.created_at >= datetime('now', '-7 days')`;
    findingDateFilter = ` AND sj.started_at >= datetime('now', '-7 days')`;
    decisionDateFilter = ` AND rd.decided_at >= datetime('now', '-7 days')`;
  } else if (timeframe === '30d') {
    subDateFilter = ` AND s.created_at >= datetime('now', '-30 days')`;
    findingDateFilter = ` AND sj.started_at >= datetime('now', '-30 days')`;
    decisionDateFilter = ` AND rd.decided_at >= datetime('now', '-30 days')`;
  } else if (timeframe === '90d') {
    subDateFilter = ` AND s.created_at >= datetime('now', '-90 days')`;
    findingDateFilter = ` AND sj.started_at >= datetime('now', '-90 days')`;
    decisionDateFilter = ` AND rd.decided_at >= datetime('now', '-90 days')`;
  } else if (timeframe === 'custom' && startDate) {
    subDateFilter = ` AND s.created_at >= ?`;
    subParams.push(startDate);
    findingDateFilter = ` AND sj.started_at >= ?`;
    findingParams.push(startDate);
    decisionDateFilter = ` AND rd.decided_at >= ?`;
    decisionParams.push(startDate);

    if (endDate) {
      subDateFilter += ` AND s.created_at <= ?`;
      subParams.push(endDate);
      findingDateFilter += ` AND sj.started_at <= ?`;
      findingParams.push(endDate);
      decisionDateFilter += ` AND rd.decided_at <= ?`;
      decisionParams.push(endDate);
    }
  }

  // 1. Overall Status Counts
  const statusCounts = db.prepare(`
    SELECT current_status, COUNT(*) as count
    FROM content_submissions s
    WHERE 1=1 ${subDateFilter}
    GROUP BY current_status
  `).all(...subParams) as Array<{ current_status: string; count: number }>;

  const countsMap: Record<string, number> = {
    TOTAL: 0,
    DRAFT: 0,
    SCANNED: 0,
    IN_REVIEW: 0,
    CHANGES_REQUESTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    ESCALATED: 0
  };

  let total = 0;
  for (const row of statusCounts) {
    countsMap[row.current_status] = row.count;
    total += row.count;
  }
  countsMap.TOTAL = total;

  // 2. Critical Findings Count
  const criticalFindings = db.prepare(`
    SELECT COUNT(*) as count 
    FROM findings f
    JOIN scan_jobs sj ON f.scan_id = sj.id
    WHERE f.severity = 'CRITICAL' AND f.status = 'OPEN' ${findingDateFilter}
  `).get(...findingParams) as { count: number };

  // 3. Violation Category Breakdown
  const categories = db.prepare(`
    SELECT f.category, COUNT(*) as count
    FROM findings f
    JOIN scan_jobs sj ON f.scan_id = sj.id
    WHERE 1=1 ${findingDateFilter}
    GROUP BY f.category
    ORDER BY count DESC
  `).all(...findingParams);

  // 4. Severity Distribution
  const severities = db.prepare(`
    SELECT f.severity, COUNT(*) as count
    FROM findings f
    JOIN scan_jobs sj ON f.scan_id = sj.id
    WHERE 1=1 ${findingDateFilter}
    GROUP BY f.severity
    ORDER BY
      CASE f.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        ELSE 5
      END
  `).all(...findingParams);

  // 5. Repeated Terminology / Prohibited Words Violations
  const repeatedViolations = db.prepare(`
    SELECT f.problematic_text, f.category, f.severity, COUNT(*) as occurrence_count
    FROM findings f
    JOIN scan_jobs sj ON f.scan_id = sj.id
    WHERE 1=1 ${findingDateFilter}
    GROUP BY f.problematic_text, f.category, f.severity
    HAVING occurrence_count > 0
    ORDER BY occurrence_count DESC
    LIMIT 8
  `).all(...findingParams);

  // 6. Creator Revision Frequency (Average versions per submission)
  const revisionStats = db.prepare(`
    SELECT
      AVG(s.current_version) as avg_versions,
      MAX(s.current_version) as max_versions,
      COUNT(CASE WHEN s.current_version > 1 THEN 1 END) as revised_submissions_count
    FROM content_submissions s
    WHERE 1=1 ${subDateFilter}
  `).get(...subParams) as any;

  // 7. Reviewer Decisions Breakdown
  const reviewerActivity = db.prepare(`
    SELECT u.full_name as reviewer_name, rd.decision, COUNT(*) as decision_count
    FROM review_decisions rd
    JOIN users u ON rd.reviewer_id = u.id
    WHERE 1=1 ${decisionDateFilter}
    GROUP BY rd.reviewer_id, rd.decision
  `).all(...decisionParams);

  // 8. Guideline Gaps (Unverified Claims)
  const guidelineGaps = db.prepare(`
    SELECT f.problematic_text, f.explanation, er.confidence_level, COUNT(*) as gap_count
    FROM findings f
    JOIN scan_jobs sj ON f.scan_id = sj.id
    JOIN evidence_references er ON f.id = er.finding_id
    WHERE er.confidence_level = 'UNVERIFIED_GAP' ${findingDateFilter}
    GROUP BY f.problematic_text
  `).all(...findingParams);

  // 9. Recent Submissions
  const recentSubmissions = db.prepare(`
    SELECT s.id, s.title, s.channel, s.current_status, s.current_version, s.updated_at,
           u.full_name as creator_name
    FROM content_submissions s
    LEFT JOIN users u ON s.creator_id = u.id
    WHERE 1=1 ${subDateFilter}
    ORDER BY s.updated_at DESC
    LIMIT 5
  `).all(...subParams);

  res.json({
    timeframe,
    counts: countsMap,
    criticalFindingsCount: criticalFindings.count,
    categories,
    severities,
    repeatedViolations,
    revisionStats: {
      avgVersions: revisionStats?.avg_versions ? Number(revisionStats.avg_versions.toFixed(1)) : 1,
      maxVersions: revisionStats?.max_versions || 1,
      revisedSubmissionsCount: revisionStats?.revised_submissions_count || 0
    },
    reviewerActivity,
    guidelineGaps,
    recentSubmissions
  });
}

