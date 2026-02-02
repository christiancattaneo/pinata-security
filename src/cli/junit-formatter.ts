/**
 * JUnit XML output formatter.
 *
 * Generates JUnit-compatible XML for CI/CD integration.
 * Each gap is represented as a test failure.
 */

import type { ScanResult, Gap } from "../core/scanner/types.js";

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a test case for a gap
 */
function generateTestCase(gap: Gap): string {
  const className = `pinata.${gap.domain}.${gap.categoryId}`;
  const name = `${gap.filePath}:${gap.lineStart}`;
  const time = "0.001"; // Nominal time

  const failureMessage = `${gap.categoryName}: ${gap.confidence} confidence ${gap.severity} issue`;
  const failureDetails = [
    `Category: ${gap.categoryName} (${gap.categoryId})`,
    `Domain: ${gap.domain}`,
    `Severity: ${gap.severity}`,
    `Priority: ${gap.priority}`,
    `Confidence: ${gap.confidence}`,
    `File: ${gap.filePath}`,
    `Line: ${gap.lineStart}${gap.lineEnd && gap.lineEnd !== gap.lineStart ? `-${gap.lineEnd}` : ""}`,
    gap.codeSnippet ? `\nCode:\n${gap.codeSnippet}` : "",
  ].join("\n");

  return `    <testcase classname="${escapeXml(className)}" name="${escapeXml(name)}" time="${time}">
      <failure message="${escapeXml(failureMessage)}" type="${escapeXml(gap.severity)}">
${escapeXml(failureDetails)}
      </failure>
    </testcase>`;
}

/**
 * Generate test suite for a domain
 */
function generateTestSuite(
  domain: string,
  gaps: Gap[],
  totalTime: number
): string {
  const tests = gaps.length;
  const failures = gaps.length;
  const errors = 0;
  const skipped = 0;
  const time = (totalTime / 1000).toFixed(3);

  const testCases = gaps.map(generateTestCase).join("\n");

  return `  <testsuite name="pinata.${escapeXml(domain)}" tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${time}">
${testCases}
  </testsuite>`;
}

/**
 * Format scan results as JUnit XML
 */
export function formatJunit(result: ScanResult): string {
  const timestamp = new Date().toISOString();

  // Group gaps by domain
  const gapsByDomain = new Map<string, Gap[]>();
  for (const gap of result.gaps) {
    const existing = gapsByDomain.get(gap.domain) ?? [];
    existing.push(gap);
    gapsByDomain.set(gap.domain, existing);
  }

  // Calculate totals
  const totalTests = result.gaps.length || 1; // At least 1 for schema validity
  const totalFailures = result.gaps.length;
  const totalErrors = 0;
  const totalTime = (result.durationMs / 1000).toFixed(3);

  // Generate test suites
  const testSuites = Array.from(gapsByDomain.entries())
    .map(([domain, gaps]) => generateTestSuite(domain, gaps, result.durationMs / gapsByDomain.size))
    .join("\n");

  // If no gaps, add a passing test suite
  const content = result.gaps.length === 0
    ? `  <testsuite name="pinata.all" tests="1" failures="0" errors="0" skipped="0" time="${totalTime}">
    <testcase classname="pinata.scan" name="no-gaps-detected" time="${totalTime}">
    </testcase>
  </testsuite>`
    : testSuites;

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Pinata Scan Results" tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" time="${totalTime}" timestamp="${timestamp}">
${content}
</testsuites>`;
}

/**
 * Validate JUnit XML output (basic validation)
 */
export function validateJunit(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic XML structure validation
  if (!xml.startsWith('<?xml version="1.0"')) {
    errors.push("Missing or invalid XML declaration");
  }

  if (!xml.includes("<testsuites")) {
    errors.push("Missing testsuites element");
  }

  if (!xml.includes("<testsuite")) {
    errors.push("Missing testsuite element");
  }

  // Check for balanced tags
  const openSuites = (xml.match(/<testsuite[\s>]/g) || []).length;
  const closeSuites = (xml.match(/<\/testsuite>/g) || []).length;
  if (openSuites !== closeSuites) {
    errors.push(`Unbalanced testsuite tags: ${openSuites} open, ${closeSuites} close`);
  }

  const openCases = (xml.match(/<testcase[\s>]/g) || []).length;
  const closeCases = (xml.match(/<\/testcase>|\/>/g) || []).length - openSuites; // Subtract self-closing
  // This is a rough check; proper XML validation would use a parser

  // Check required attributes
  if (!xml.includes('name="')) {
    errors.push("Missing name attribute");
  }

  if (!xml.includes('tests="')) {
    errors.push("Missing tests attribute");
  }

  return { valid: errors.length === 0, errors };
}
