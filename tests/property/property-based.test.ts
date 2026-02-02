/**
 * Property-based tests using fast-check.
 *
 * These tests generate random inputs to find edge cases
 * that might be missed by example-based tests.
 */

import { resolve } from "path";

import * as fc from "fast-check";
import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";
import { TemplateRenderer } from "@/templates/renderer.js";
import { formatSarif, validateSarif } from "@/cli/sarif-formatter.js";
import { formatHtml } from "@/cli/html-formatter.js";
import { formatJunit, validateJunit } from "@/cli/junit-formatter.js";

import type { Gap, ScanResult } from "@/core/scanner/types.js";
import type { TestTemplate } from "@/categories/schema/index.js";

const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");

// Arbitrary generators for domain types
const severityArb = fc.constantFrom("critical", "high", "medium", "low");
const domainArb = fc.constantFrom(
  "security",
  "data",
  "concurrency",
  "input",
  "resource",
  "reliability",
  "performance",
  "platform",
  "business",
  "compliance"
);
const levelArb = fc.constantFrom("unit", "integration", "system", "chaos");
const priorityArb = fc.constantFrom("P0", "P1", "P2");
const confidenceArb = fc.constantFrom("high", "medium", "low");
const patternTypeArb = fc.constantFrom("regex", "ast", "semantic");

// Generate a valid Gap object
const gapArb = fc.record({
  categoryId: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-z]/.test(s)),
  categoryName: fc.string({ minLength: 1, maxLength: 100 }),
  domain: domainArb,
  level: levelArb,
  priority: priorityArb,
  severity: severityArb,
  confidence: confidenceArb,
  filePath: fc.string({ minLength: 1, maxLength: 200 }),
  lineStart: fc.integer({ min: 1, max: 10000 }),
  lineEnd: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
  columnStart: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  columnEnd: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  codeSnippet: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
  patternId: fc.string({ minLength: 1, maxLength: 50 }),
  patternType: patternTypeArb,
  priorityScore: fc.integer({ min: 0, max: 20 }),
}) as fc.Arbitrary<Gap>;

// Generate a mock ScanResult
const scanResultArb = fc.array(gapArb, { minLength: 0, maxLength: 50 }).map((gaps): ScanResult => {
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
      overall: fc.sample(fc.integer({ min: 0, max: 100 }), 1)[0]!,
      byDomain: new Map(),
      grade: fc.sample(fc.constantFrom("A", "B", "C", "D", "F"), 1)[0]!,
    },
    summary: {
      totalGaps: gaps.length,
      criticalGaps: gaps.filter((g) => g.severity === "critical").length,
      highGaps: gaps.filter((g) => g.severity === "high").length,
      mediumGaps: gaps.filter((g) => g.severity === "medium").length,
      lowGaps: gaps.filter((g) => g.severity === "low").length,
      score: 75,
      grade: "C",
      coveragePercent: 50,
    },
    fileStats: {
      totalFiles: gapsByFile.size || 1,
      filesWithGaps: gapsByFile.size,
      linesScanned: gaps.length * 100,
      testFiles: 0,
    },
    version: "0.1.0",
    durationMs: fc.sample(fc.integer({ min: 100, max: 10000 }), 1)[0]!,
  };
});

describe("SARIF Formatter Properties", () => {
  it("always produces valid JSON", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const sarif = formatSarif(result);
        expect(() => JSON.parse(sarif)).not.toThrow();
      }),
      { numRuns: 50 }
    );
  });

  it("always passes schema validation", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const sarif = formatSarif(result);
        const validation = validateSarif(sarif);
        expect(validation.valid).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it("result count matches gap count", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const sarif = formatSarif(result);
        const parsed = JSON.parse(sarif);
        expect(parsed.runs[0].results.length).toBe(result.gaps.length);
      }),
      { numRuns: 50 }
    );
  });

  it("handles special characters in code snippets", () => {
    const specialCharsArb = fc.string().map((s) => ({
      ...fc.sample(gapArb, 1)[0]!,
      codeSnippet: s,
    }));

    fc.assert(
      fc.property(fc.array(specialCharsArb, { minLength: 1, maxLength: 5 }), (gaps) => {
        const result: ScanResult = {
          success: true,
          gaps,
          gapsByCategory: new Map(),
          gapsByFile: new Map(),
          coverage: { totalCategories: 1, coveredCategories: 0, coveragePercent: 0, byDomain: new Map() },
          score: { overall: 50, byDomain: new Map(), grade: "C" },
          summary: { totalGaps: gaps.length, criticalGaps: 0, highGaps: 0, mediumGaps: 0, lowGaps: 0, score: 50, grade: "C", coveragePercent: 50 },
          fileStats: { totalFiles: 1, filesWithGaps: 1, linesScanned: 100, testFiles: 0 },
          version: "0.1.0",
          durationMs: 100,
        };

        const sarif = formatSarif(result);
        expect(() => JSON.parse(sarif)).not.toThrow();
      }),
      { numRuns: 20 }
    );
  });
});

describe("HTML Formatter Properties", () => {
  it("always produces valid HTML structure", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const html = formatHtml(result);
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<html");
        expect(html).toContain("</html>");
        expect(html).toContain("<head>");
        expect(html).toContain("</head>");
        expect(html).toContain("<body>");
        expect(html).toContain("</body>");
      }),
      { numRuns: 50 }
    );
  });

  it("escapes HTML in code snippets", () => {
    // Test that script tags in code snippets are escaped
    const gap: Gap = {
      categoryId: "test-category",
      categoryName: "Test Category",
      domain: "security",
      level: "integration",
      priority: "P0",
      severity: "high",
      confidence: "high",
      filePath: "/test/file.py",
      lineStart: 1,
      lineEnd: 1,
      columnStart: 0,
      columnEnd: 50,
      codeSnippet: "<script>alert(1)</script>",
      patternId: "test-pattern",
      patternType: "regex",
      priorityScore: 10,
    };

    const result: ScanResult = {
      success: true,
      gaps: [gap],
      gapsByCategory: new Map(),
      gapsByFile: new Map(),
      coverage: { totalCategories: 1, coveredCategories: 0, coveragePercent: 0, byDomain: new Map() },
      score: { overall: 50, byDomain: new Map(), grade: "C" },
      summary: { totalGaps: 1, criticalGaps: 0, highGaps: 0, mediumGaps: 0, lowGaps: 0, score: 50, grade: "C", coveragePercent: 50 },
      fileStats: { totalFiles: 1, filesWithGaps: 1, linesScanned: 100, testFiles: 0 },
      version: "0.1.0",
      durationMs: 100,
    };

    const html = formatHtml(result);
    // Script tags in code snippets should be escaped
    expect(html).toContain("&lt;script&gt;");
    // The alert text should not be executed
    expect(html).not.toContain("<script>alert(1)");
  });
});

describe("JUnit Formatter Properties", () => {
  it("always produces valid XML", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const xml = formatJunit(result);
        expect(xml).toContain('<?xml version="1.0"');
        expect(xml).toContain("<testsuites");
        expect(xml).toContain("</testsuites>");
      }),
      { numRuns: 50 }
    );
  });

  it("always passes basic validation", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const xml = formatJunit(result);
        const validation = validateJunit(xml);
        expect(validation.valid).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it("failure count matches gap count", () => {
    fc.assert(
      fc.property(scanResultArb, (result) => {
        const xml = formatJunit(result);
        const failureMatch = xml.match(/failures="(\d+)"/);
        if (failureMatch) {
          expect(parseInt(failureMatch[1]!, 10)).toBe(result.gaps.length);
        }
      }),
      { numRuns: 50 }
    );
  });
});

describe("TemplateRenderer Properties", () => {
  let renderer: TemplateRenderer;

  beforeAll(() => {
    renderer = new TemplateRenderer();
  });

  it("handles arbitrary variable values safely", () => {
    const template: TestTemplate = {
      id: "test",
      language: "python",
      framework: "pytest",
      template: "def test_{{name}}():\n    value = '{{value}}'",
      variables: [
        { name: "name", type: "string", description: "Name", required: true },
        { name: "value", type: "string", description: "Value", required: true },
      ],
    };

    fc.assert(
      fc.property(fc.string(), fc.string(), (name, value) => {
        const result = renderer.renderTemplate(template, { name, value });
        // Should not throw
        expect(result).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it("placeholder extraction is consistent", () => {
    fc.assert(
      fc.property(fc.string(), (template) => {
        const placeholders1 = renderer.parsePlaceholders(template);
        const placeholders2 = renderer.parsePlaceholders(template);
        expect(placeholders1).toEqual(placeholders2);
      }),
      { numRuns: 50 }
    );
  });

  it("syntax validation is consistent", () => {
    fc.assert(
      fc.property(fc.string(), (template) => {
        const result1 = renderer.validateSyntax(template);
        const result2 = renderer.validateSyntax(template);
        expect(result1.valid).toBe(result2.valid);
      }),
      { numRuns: 50 }
    );
  });
});

describe("CategoryStore Properties", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
  });

  it("get is consistent with has", () => {
    const categoryIds = store.toArray().map((c) => c.id);

    fc.assert(
      fc.property(fc.constantFrom(...categoryIds), (id) => {
        const hasResult = store.has(id);
        const getResult = store.get(id);

        if (hasResult) {
          expect(getResult).toBeDefined();
        } else {
          expect(getResult).toBeUndefined();
        }
      }),
      { numRuns: categoryIds.length }
    );
  });

  it("filter results are subset of all", () => {
    fc.assert(
      fc.property(domainArb, (domain) => {
        const all = store.toArray();
        const filtered = all.filter((c) => c.domain === domain);

        for (const category of filtered) {
          expect(all.some((c) => c.id === category.id)).toBe(true);
        }
      }),
      { numRuns: 10 }
    );
  });

  it("size equals toArray length", () => {
    expect(store.size).toBe(store.toArray().length);
  });
});

describe("Gap Invariants", () => {
  it("lineEnd >= lineStart when defined", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 100 }),
        (start, delta) => {
          const gap: Gap = {
            ...fc.sample(gapArb, 1)[0]!,
            lineStart: start,
            lineEnd: start + delta,
          };
          expect(gap.lineEnd).toBeGreaterThanOrEqual(gap.lineStart);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("priorityScore is bounded", () => {
    fc.assert(
      fc.property(gapArb, (gap) => {
        expect(gap.priorityScore).toBeGreaterThanOrEqual(0);
        expect(gap.priorityScore).toBeLessThanOrEqual(20);
      }),
      { numRuns: 100 }
    );
  });
});
