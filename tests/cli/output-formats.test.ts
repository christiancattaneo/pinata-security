/**
 * Tests for output format implementations.
 */

import { resolve } from "path";

import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";
import { Scanner } from "@/core/scanner/scanner.js";
import { formatSarif, validateSarif } from "@/cli/sarif-formatter.js";
import { formatHtml } from "@/cli/html-formatter.js";
import { formatJunit, validateJunit } from "@/cli/junit-formatter.js";

import type { ScanResult, Gap } from "@/core/scanner/types.js";

const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");

// Create a mock scan result for testing
function createMockScanResult(gaps: Gap[]): ScanResult {
  const gapsByCategory = new Map<string, Gap[]>();
  const gapsByFile = new Map<string, Gap[]>();

  for (const gap of gaps) {
    const catGaps = gapsByCategory.get(gap.categoryId) ?? [];
    catGaps.push(gap);
    gapsByCategory.set(gap.categoryId, catGaps);

    const fileGaps = gapsByFile.get(gap.filePath) ?? [];
    fileGaps.push(gap);
    gapsByFile.set(gap.filePath, fileGaps);
  }

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byDomain: Record<string, number> = {};

  for (const gap of gaps) {
    bySeverity[gap.severity as keyof typeof bySeverity]++;
    byDomain[gap.domain] = (byDomain[gap.domain] ?? 0) + 1;
  }

  return {
    success: true,
    gaps,
    gapsByCategory,
    gapsByFile,
    coverage: {
      totalCategories: 45,
      coveredCategories: 0,
      coveragePercent: 0,
      byDomain: new Map(),
    },
    score: {
      overall: 75,
      byDomain: new Map(),
      grade: "C",
    },
    summary: {
      totalGaps: gaps.length,
      bySeverity,
      byDomain,
      byLevel: {},
      topCategories: [],
    },
    fileStats: {
      totalFiles: 10,
      filesWithGaps: gaps.length > 0 ? 3 : 0,
      linesScanned: 1000,
      testFiles: 2,
    },
    version: "0.1.0",
    durationMs: 1234,
  };
}

// Sample gaps for testing
const SAMPLE_GAPS: Gap[] = [
  {
    categoryId: "sql-injection",
    categoryName: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "/src/db/users.py",
    lineStart: 42,
    lineEnd: 44,
    columnStart: 4,
    columnEnd: 60,
    codeSnippet: 'cursor.execute(f"SELECT * FROM users WHERE id = \'{user_id}\'")',
    patternId: "python-fstring-execute",
    patternType: "regex",
    priorityScore: 15,
  },
  {
    categoryId: "xss",
    categoryName: "Cross-Site Scripting",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "high",
    confidence: "medium",
    filePath: "/src/views/render.ts",
    lineStart: 15,
    lineEnd: 15,
    columnStart: 2,
    columnEnd: 45,
    codeSnippet: "element.innerHTML = userInput;",
    patternId: "ts-innerhtml-assignment",
    patternType: "regex",
    priorityScore: 12,
  },
  {
    categoryId: "race-condition",
    categoryName: "Race Condition",
    domain: "concurrency",
    level: "integration",
    priority: "P1",
    severity: "medium",
    confidence: "low",
    filePath: "/src/utils/cache.py",
    lineStart: 88,
    lineEnd: 92,
    columnStart: 0,
    columnEnd: 0,
    codeSnippet: undefined,
    patternId: "python-shared-state",
    patternType: "regex",
    priorityScore: 8,
  },
];

describe("SARIF Formatter", () => {
  it("generates valid SARIF 2.1.0 structure", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);

    const parsed = JSON.parse(sarif);

    expect(parsed.$schema).toContain("sarif-schema-2.1.0");
    expect(parsed.version).toBe("2.1.0");
    expect(Array.isArray(parsed.runs)).toBe(true);
    expect(parsed.runs.length).toBe(1);
  });

  it("includes all gaps as results", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);
    const parsed = JSON.parse(sarif);

    expect(parsed.runs[0].results.length).toBe(SAMPLE_GAPS.length);
  });

  it("maps severities correctly", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);
    const parsed = JSON.parse(sarif);

    const criticalResult = parsed.runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === "sql-injection"
    );
    expect(criticalResult.level).toBe("error");

    const mediumResult = parsed.runs[0].results.find(
      (r: { ruleId: string }) => r.ruleId === "race-condition"
    );
    expect(mediumResult.level).toBe("warning");
  });

  it("includes location information", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);
    const parsed = JSON.parse(sarif);

    const firstResult = parsed.runs[0].results[0];
    expect(firstResult.locations).toBeDefined();
    expect(firstResult.locations[0].physicalLocation.region.startLine).toBe(42);
  });

  it("includes tool information", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);
    const parsed = JSON.parse(sarif);

    expect(parsed.runs[0].tool.driver.name).toBe("pinata");
    expect(parsed.runs[0].tool.driver.version).toBeDefined();
  });

  it("generates rules for each unique category", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);
    const parsed = JSON.parse(sarif);

    const rules = parsed.runs[0].tool.driver.rules;
    const ruleIds = rules.map((r: { id: string }) => r.id);

    expect(ruleIds).toContain("sql-injection");
    expect(ruleIds).toContain("xss");
    expect(ruleIds).toContain("race-condition");
  });

  it("passes SARIF validation", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const sarif = formatSarif(result);

    const validation = validateSarif(sarif);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("handles empty gaps array", () => {
    const result = createMockScanResult([]);
    const sarif = formatSarif(result);
    const parsed = JSON.parse(sarif);

    expect(parsed.runs[0].results).toHaveLength(0);
    expect(validateSarif(sarif).valid).toBe(true);
  });
});

describe("HTML Formatter", () => {
  it("generates valid HTML document", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain("<head>");
    expect(html).toContain("<body>");
  });

  it("includes summary statistics", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("Total Gaps");
    expect(html).toContain("Pinata Score");
    expect(html).toContain("Files Scanned");
  });

  it("includes all gaps in table", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("sql-injection");
    expect(html).toContain("xss");
    expect(html).toContain("race-condition");
  });

  it("includes severity badges", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("severity-critical");
    expect(html).toContain("severity-high");
    expect(html).toContain("severity-medium");
  });

  it("includes domain badges", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("domain-security");
    expect(html).toContain("domain-concurrency");
  });

  it("escapes HTML in code snippets", () => {
    const gapWithHtml: Gap = {
      ...SAMPLE_GAPS[0]!,
      codeSnippet: '<script>alert("xss")</script>',
    };
    const result = createMockScanResult([gapWithHtml]);
    const html = formatHtml(result);

    // Should escape the script tag
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("includes embedded CSS", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
    expect(html).toContain("--color-critical");
  });

  it("includes filter JavaScript", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    expect(html).toContain("<script>");
    expect(html).toContain("filterTable");
  });

  it("is standalone (no external dependencies)", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const html = formatHtml(result);

    // Should not have external stylesheet or script links
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});

describe("JUnit XML Formatter", () => {
  it("generates valid XML declaration", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it("includes testsuites root element", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    expect(xml).toContain("<testsuites");
    expect(xml).toContain("</testsuites>");
  });

  it("groups gaps by domain into test suites", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    expect(xml).toContain('name="pinata.security"');
    expect(xml).toContain('name="pinata.concurrency"');
  });

  it("represents gaps as test failures", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    expect(xml).toContain("<failure");
    expect(xml).toContain("</failure>");
  });

  it("includes failure details", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    expect(xml).toContain("SQL Injection");
    expect(xml).toContain("/src/db/users.py");
    expect(xml).toContain("critical");
  });

  it("escapes XML special characters", () => {
    const gapWithXml: Gap = {
      ...SAMPLE_GAPS[0]!,
      codeSnippet: 'cursor.execute("SELECT * FROM users WHERE name = \'" + name + "\'")',
    };
    const result = createMockScanResult([gapWithXml]);
    const xml = formatJunit(result);

    expect(xml).toContain("&quot;");
    expect(xml).toContain("&apos;");
  });

  it("generates valid structure with no gaps", () => {
    const result = createMockScanResult([]);
    const xml = formatJunit(result);

    expect(xml).toContain("<testsuites");
    expect(xml).toContain('failures="0"');
    expect(xml).toContain("no-gaps-detected");
  });

  it("passes JUnit validation", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    const validation = validateJunit(xml);
    expect(validation.valid).toBe(true);
  });

  it("includes test counts in attributes", () => {
    const result = createMockScanResult(SAMPLE_GAPS);
    const xml = formatJunit(result);

    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="3"');
    expect(xml).toContain('errors="0"');
  });
});

describe("Format Integration", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
    scanner = new Scanner(store);
  });

  it("all formats work with real scan results", async () => {
    // Scan a known vulnerable file
    const corpusDir = resolve(__dirname, "../corpus/vulnerable/sql-injection");
    const scanResult = await scanner.scanDirectory(corpusDir);

    expect(scanResult.success).toBe(true);
    if (!scanResult.success) return;

    // Test each format
    const sarif = formatSarif(scanResult.data);
    expect(validateSarif(sarif).valid).toBe(true);

    const html = formatHtml(scanResult.data);
    expect(html).toContain("<!DOCTYPE html>");

    const junit = formatJunit(scanResult.data);
    expect(validateJunit(junit).valid).toBe(true);
  });
});
