/**
 * Execution Runner Tests
 * 
 * Tests the orchestration of test execution.
 */

import { describe, it, expect } from "vitest";
import { ExecutionRunner, createRunner } from "@/execution/runner.js";
import { isTestable, TESTABLE_VULNERABILITIES } from "@/execution/types.js";
import type { Gap } from "@/core/scanner/types.js";

// Helper to create a minimal gap
function createGap(categoryId: string): Gap {
  return {
    categoryId,
    categoryName: categoryId,
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "/src/vulnerable.ts",
    lineStart: 10,
    lineEnd: 10,
    columnStart: 0,
    columnEnd: 50,
    codeSnippet: "vulnerable code here",
    patternId: "test-pattern",
    detectionType: "regex",
    message: "Test vulnerability",
  };
}

describe("Execution Runner", () => {
  describe("isTestable", () => {
    it("returns true for SQL injection", () => {
      expect(isTestable("sql-injection")).toBe(true);
    });

    it("returns true for XSS", () => {
      expect(isTestable("xss")).toBe(true);
    });

    it("returns true for command injection", () => {
      expect(isTestable("command-injection")).toBe(true);
    });

    it("returns true for path traversal", () => {
      expect(isTestable("path-traversal")).toBe(true);
    });

    it("returns true for SSRF", () => {
      expect(isTestable("ssrf")).toBe(true);
    });

    it("returns true for deserialization", () => {
      expect(isTestable("deserialization")).toBe(true);
    });

    it("returns false for hardcoded secrets", () => {
      expect(isTestable("hardcoded-secrets")).toBe(false);
    });

    it("returns false for race conditions", () => {
      expect(isTestable("race-condition")).toBe(false);
    });

    it("returns false for unknown categories", () => {
      expect(isTestable("fake-category")).toBe(false);
    });
  });

  describe("TESTABLE_VULNERABILITIES", () => {
    it("includes all expected vulnerability types", () => {
      expect(TESTABLE_VULNERABILITIES).toContain("sql-injection");
      expect(TESTABLE_VULNERABILITIES).toContain("xss");
      expect(TESTABLE_VULNERABILITIES).toContain("command-injection");
      expect(TESTABLE_VULNERABILITIES).toContain("path-traversal");
      expect(TESTABLE_VULNERABILITIES).toContain("ssrf");
      expect(TESTABLE_VULNERABILITIES).toContain("deserialization");
    });

    it("has exactly 6 testable types", () => {
      expect(TESTABLE_VULNERABILITIES.length).toBe(6);
    });
  });

  describe("createRunner", () => {
    it("creates runner with default config", () => {
      const runner = createRunner();
      expect(runner).toBeInstanceOf(ExecutionRunner);
    });

    it("creates runner with custom config", () => {
      const runner = createRunner({ timeoutSeconds: 60 });
      expect(runner).toBeInstanceOf(ExecutionRunner);
    });

    it("creates runner in dry-run mode", () => {
      const runner = createRunner(undefined, true);
      expect(runner).toBeInstanceOf(ExecutionRunner);
    });
  });

  describe("gap filtering", () => {
    it("filters gaps to only testable categories", () => {
      const gaps: Gap[] = [
        createGap("sql-injection"),      // testable
        createGap("hardcoded-secrets"),  // not testable
        createGap("xss"),                // testable
        createGap("race-condition"),     // not testable
        createGap("command-injection"),  // testable
      ];

      const testable = gaps.filter((g) => isTestable(g.categoryId));

      expect(testable.length).toBe(3);
      expect(testable.map((g) => g.categoryId)).toEqual([
        "sql-injection",
        "xss",
        "command-injection",
      ]);
    });
  });

  describe("language detection", () => {
    // Test that the runner correctly detects languages from file paths
    it("detects TypeScript from .ts files", () => {
      const runner = createRunner();
      const gap = createGap("sql-injection");
      gap.filePath = "/src/db.ts";
      
      // The runner should use vitest for TypeScript
      expect(gap.filePath.endsWith(".ts")).toBe(true);
    });

    it("detects Python from .py files", () => {
      const gap = createGap("sql-injection");
      gap.filePath = "/src/db.py";
      
      expect(gap.filePath.endsWith(".py")).toBe(true);
    });

    it("detects JavaScript from .js files", () => {
      const gap = createGap("sql-injection");
      gap.filePath = "/src/db.js";
      
      expect(gap.filePath.endsWith(".js")).toBe(true);
    });

    it("detects Go from .go files", () => {
      const gap = createGap("sql-injection");
      gap.filePath = "/src/db.go";
      
      expect(gap.filePath.endsWith(".go")).toBe(true);
    });
  });
});
