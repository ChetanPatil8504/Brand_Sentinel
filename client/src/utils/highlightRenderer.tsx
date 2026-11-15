import React from 'react';
import { Finding } from '../types';

export interface HighlightSpan {
  start: number;
  end: number;
  finding: Finding;
}

export function computeHighlightSpans(text: string, findings: Finding[]): HighlightSpan[] {
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

  // Severity rank for resolving overlaps: CRITICAL (4) > HIGH (3) > MEDIUM (2) > LOW (1)
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

  // Sort by start index ascending, then by severity descending
  rawSpans.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return severityRank(b.finding.severity) - severityRank(a.finding.severity);
  });

  // Remove / resolve overlaps cleanly
  const nonOverlapping: HighlightSpan[] = [];
  for (const span of rawSpans) {
    if (nonOverlapping.length === 0) {
      nonOverlapping.push(span);
      continue;
    }

    const last = nonOverlapping[nonOverlapping.length - 1];

    if (span.start >= last.end) {
      // Clean non-overlapping span
      nonOverlapping.push(span);
    } else {
      // Overlap detected: keep the one with higher severity or longer span
      const lastRank = severityRank(last.finding.severity);
      const spanRank = severityRank(span.finding.severity);

      if (spanRank > lastRank || (spanRank === lastRank && span.end - span.start > last.end - last.start)) {
        nonOverlapping[nonOverlapping.length - 1] = span;
      }
    }
  }

  return nonOverlapping;
}

export function renderHighlightedText(
  text: string,
  findings: Finding[],
  activeFindingId: string | undefined,
  onSelectFinding: (finding: Finding) => void
): React.ReactNode[] {
  if (!text) return [];
  if (!findings || findings.length === 0) return [text];

  const spans = computeHighlightSpans(text, findings);
  if (spans.length === 0) return [text];

  const nodes: React.ReactNode[] = [];
  let currentIndex = 0;

  spans.forEach((span, i) => {
    // 1. Plain text before highlight
    if (span.start > currentIndex) {
      nodes.push(
        <React.Fragment key={`text-${currentIndex}`}>
          {text.substring(currentIndex, span.start)}
        </React.Fragment>
      );
    }

    // 2. Highlighted text
    const chunk = text.substring(span.start, span.end);
    const isActive = activeFindingId === span.finding.id;

    let highlightClass = 'highlight-medium';
    if (span.finding.severity === 'CRITICAL') highlightClass = 'highlight-critical';
    else if (span.finding.severity === 'HIGH') highlightClass = 'highlight-high';
    else if (span.finding.severity === 'LOW') highlightClass = 'highlight-low';

    nodes.push(
      <span
        key={`hl-${span.finding.id}-${i}-${span.start}`}
        onClick={() => onSelectFinding(span.finding)}
        className={`${highlightClass} ${isActive ? 'highlight-active font-bold' : ''}`}
        title={`${span.finding.category}: ${span.finding.explanation}`}
      >
        {chunk}
      </span>
    );

    currentIndex = span.end;
  });

  // 3. Trailing plain text
  if (currentIndex < text.length) {
    nodes.push(
      <React.Fragment key={`text-tail-${currentIndex}`}>
        {text.substring(currentIndex)}
      </React.Fragment>
    );
  }

  return nodes;
}

