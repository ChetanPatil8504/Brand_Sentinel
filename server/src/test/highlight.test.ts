import assert from 'assert';

interface Finding {
  id: string;
  problematic_text: string;
  start_index: number;
  end_index: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  explanation: string;
}

interface HighlightSpan {
  start: number;
  end: number;
  finding: Finding;
}

function computeHighlightSpans(text: string, findings: Finding[]): HighlightSpan[] {
  if (!text || !findings || findings.length === 0) return [];

  const rawSpans: HighlightSpan[] = [];
  const lowerText = text.toLowerCase();

  for (const finding of findings) {
    if (!finding.problematic_text) continue;

    const term = finding.problematic_text.trim();
    if (!term) continue;

    const termLower = term.toLowerCase();

    // 1. Check if provided start_index and end_index are accurate
    const hasValidOffsets =
      typeof finding.start_index === 'number' &&
      typeof finding.end_index === 'number' &&
      finding.start_index >= 0 &&
      finding.end_index <= text.length &&
      finding.end_index > finding.start_index &&
      text.substring(finding.start_index, finding.end_index).toLowerCase() === termLower;

    if (hasValidOffsets) {
      rawSpans.push({
        start: finding.start_index,
        end: finding.end_index,
        finding
      });
    } else {
      // 2. Fallback: Search all occurrences in text
      let searchPos = 0;
      while (searchPos < lowerText.length) {
        const foundIdx = lowerText.indexOf(termLower, searchPos);
        if (foundIdx === -1) break;

        rawSpans.push({
          start: foundIdx,
          end: foundIdx + term.length,
          finding
        });

        searchPos = foundIdx + term.length;
      }
    }
  }

  const severityRank = (sev: string): number => {
    switch (sev) {
      case 'CRITICAL':
        return 4;
      case 'HIGH':
        return 3;
      case 'MEDIUM':
        return 2;
      case 'LOW':
        return 1;
      default:
        return 0;
    }
  };

  rawSpans.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return severityRank(b.finding.severity) - severityRank(a.finding.severity);
  });

  const nonOverlapping: HighlightSpan[] = [];
  for (const span of rawSpans) {
    if (nonOverlapping.length === 0) {
      nonOverlapping.push(span);
      continue;
    }

    const last = nonOverlapping[nonOverlapping.length - 1];

    if (span.start >= last.end) {
      nonOverlapping.push(span);
    } else {
      const lastRank = severityRank(last.finding.severity);
      const spanRank = severityRank(span.finding.severity);

      if (spanRank > lastRank || (spanRank === lastRank && span.end - span.start > last.end - last.start)) {
        nonOverlapping[nonOverlapping.length - 1] = span;
      }
    }
  }

  return nonOverlapping;
}

export function runHighlightTests() {
  console.log('\n--- TESTING MULTI-WORD INLINE HIGHLIGHTING ---');

  const sampleText = 'VajraAI delivers a guaranteed 100% uptime. Our code is unhackable and trusted by over 10,000 enterprise customers.';

  const mockFindings: Finding[] = [
    {
      id: 'f1',
      problematic_text: 'VajraAI',
      start_index: 0,
      end_index: 7,
      severity: 'HIGH',
      category: 'TERMINOLOGY',
      explanation: 'Use Vajra Sentinel'
    },
    {
      id: 'f2',
      problematic_text: 'guaranteed 100% uptime',
      start_index: 19,
      end_index: 41,
      severity: 'CRITICAL',
      category: 'UNSUPPORTED_CLAIM',
      explanation: 'Absolute SLA claim'
    },
    {
      id: 'f3',
      problematic_text: 'unhackable',
      start_index: 55,
      end_index: 65,
      severity: 'CRITICAL',
      category: 'TERMINOLOGY',
      explanation: 'Prohibited security claim'
    },
    {
      id: 'f4',
      problematic_text: 'over 10,000 enterprise customers',
      start_index: 81,
      end_index: 113,
      severity: 'CRITICAL',
      category: 'UNSUPPORTED_CLAIM',
      explanation: 'Customer count discrepancy'
    }
  ];

  const spans = computeHighlightSpans(sampleText, mockFindings);

  // Assertions
  assert.strictEqual(spans.length, 4, 'Should compute exactly 4 non-overlapping spans');

  // Verify multi-word extraction
  const uptimeSpan = spans.find(s => s.finding.problematic_text === 'guaranteed 100% uptime');
  assert.ok(uptimeSpan, 'Multi-word phrase "guaranteed 100% uptime" must be identified');
  assert.strictEqual(sampleText.substring(uptimeSpan.start, uptimeSpan.end), 'guaranteed 100% uptime');

  const customerSpan = spans.find(s => s.finding.problematic_text === 'over 10,000 enterprise customers');
  assert.ok(customerSpan, 'Multi-word phrase "over 10,000 enterprise customers" must be identified');
  assert.strictEqual(sampleText.substring(customerSpan.start, customerSpan.end), 'over 10,000 enterprise customers');

  const unhackableSpan = spans.find(s => s.finding.problematic_text === 'unhackable');
  assert.ok(unhackableSpan, 'Single-word "unhackable" must be identified');

  // Test fallback when offsets are stale or 0
  const staleOffsetsFindings: Finding[] = [
    {
      id: 'f5',
      problematic_text: 'guaranteed 100% uptime',
      start_index: 0,
      end_index: 0,
      severity: 'CRITICAL',
      category: 'UNSUPPORTED_CLAIM',
      explanation: 'Fallback search'
    }
  ];
  const fallbackSpans = computeHighlightSpans(sampleText, staleOffsetsFindings);
  assert.strictEqual(fallbackSpans.length, 1);
  assert.strictEqual(sampleText.substring(fallbackSpans[0].start, fallbackSpans[0].end), 'guaranteed 100% uptime');

  console.log('✓ Multi-word highlight verification: PASSED ("guaranteed 100% uptime", "over 10,000 enterprise customers", "unhackable")');
}

if (process.argv[1]?.includes('highlight.test')) {
  runHighlightTests();
}

