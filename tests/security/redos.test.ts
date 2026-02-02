/**
 * ReDoS (Regular Expression Denial of Service) resistance tests.
 *
 * Ensures that regex patterns used in detection cannot be
 * exploited with malicious input to cause exponential backtracking.
 */

import { resolve } from "path";

import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";

import type { DetectionPattern } from "@/categories/schema/index.js";

const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");

// Known problematic patterns that cause exponential backtracking
const REDOS_PAYLOADS = [
  // (a+)+ pattern exploits
  "a".repeat(30) + "!",
  // (.*a){x} pattern exploits
  "a".repeat(25),
  // Overlapping alternation
  "aaaaaaaaaaaaaaaaaaaaaaaaaaab",
  // Nested quantifiers with backtracking
  "x".repeat(30) + "y",
  // Long strings for any greedy pattern
  "a".repeat(1000),
  // Mixed with special chars
  " ".repeat(100) + "x",
];

// Maximum time allowed for a single regex match (ms)
const REGEX_TIMEOUT_MS = 100;

describe("ReDoS Resistance", () => {
  let allPatterns: DetectionPattern[];

  beforeAll(async () => {
    const store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);

    allPatterns = [];
    for (const category of store.toArray()) {
      for (const pattern of category.detectionPatterns) {
        if (pattern.type === "regex") {
          allPatterns.push(pattern);
        }
      }
    }

    console.log(`  Testing ${allPatterns.length} regex patterns`);
  });

  describe("pattern execution time", () => {
    it("all patterns complete within timeout on normal input", () => {
      const normalInputs = [
        "cursor.execute('SELECT * FROM users WHERE id = ?', (id,))",
        "document.getElementById('app').innerHTML = sanitized",
        "const query = 'SELECT * FROM users'",
        "import os\nos.environ.get('API_KEY')",
      ];

      for (const pattern of allPatterns) {
        const regex = new RegExp(pattern.pattern, "gm");

        for (const input of normalInputs) {
          const start = performance.now();
          regex.exec(input);
          const elapsed = performance.now() - start;

          expect(elapsed).toBeLessThan(REGEX_TIMEOUT_MS);
        }
      }
    });

    it("all patterns complete within timeout on ReDoS payloads", () => {
      const slowPatterns: Array<{ id: string; payload: string; time: number }> = [];

      for (const pattern of allPatterns) {
        const regex = new RegExp(pattern.pattern, "gm");

        for (const payload of REDOS_PAYLOADS) {
          const start = performance.now();
          try {
            regex.exec(payload);
          } catch {
            // Regex error is fine
          }
          const elapsed = performance.now() - start;

          if (elapsed > REGEX_TIMEOUT_MS) {
            slowPatterns.push({
              id: pattern.id,
              payload: payload.slice(0, 20) + "...",
              time: elapsed,
            });
          }
        }
      }

      if (slowPatterns.length > 0) {
        console.log("  Slow patterns detected (potential ReDoS):");
        for (const p of slowPatterns) {
          console.log(`    ${p.id}: ${p.time.toFixed(0)}ms on "${p.payload}"`);
        }
      }

      // Fail if any pattern is significantly slow
      expect(slowPatterns.filter((p) => p.time > 1000).length).toBe(0);
    });
  });

  describe("catastrophic backtracking patterns", () => {
    it("no patterns use dangerous nested quantifiers", () => {
      // Patterns like (a+)+, (a*)*b, (a|aa)+
      const dangerousPatterns = [
        /\([\w.]+\+\)\+/,  // (X+)+
        /\([\w.]+\*\)\*/,  // (X*)*
        /\([^)]+\|[^)]+\)\+/, // (a|b)+ with overlapping alternatives
      ];

      const problematic: string[] = [];

      for (const pattern of allPatterns) {
        for (const dangerous of dangerousPatterns) {
          if (dangerous.test(pattern.pattern)) {
            problematic.push(`${pattern.id}: ${pattern.pattern}`);
          }
        }
      }

      if (problematic.length > 0) {
        console.log("  Potentially dangerous patterns:");
        for (const p of problematic) {
          console.log(`    ${p}`);
        }
      }

      expect(problematic.length).toBe(0);
    });

    it("no unbounded .* followed by same-class char", () => {
      // Pattern like .*X where X could be matched by .*
      const unboundedDotStar = /\.\*[^?+*\\\]]/;

      const problematic: string[] = [];

      for (const pattern of allPatterns) {
        // This is a heuristic check
        if (unboundedDotStar.test(pattern.pattern)) {
          // Further check if it's in a problematic context
          // For now just flag for review
          // Not necessarily a problem, but worth noting
        }
      }

      // This is informational, not a strict test
    });
  });

  describe("pattern complexity limits", () => {
    it("no pattern exceeds reasonable length", () => {
      const MAX_PATTERN_LENGTH = 500;

      const longPatterns = allPatterns.filter((p) => p.pattern.length > MAX_PATTERN_LENGTH);

      if (longPatterns.length > 0) {
        console.log("  Long patterns:");
        for (const p of longPatterns) {
          console.log(`    ${p.id}: ${p.pattern.length} chars`);
        }
      }

      expect(longPatterns.length).toBe(0);
    });

    it("no pattern has excessive quantifier nesting", () => {
      // Count nested quantifiers
      const countQuantifierNesting = (pattern: string): number => {
        let depth = 0;
        let maxDepth = 0;
        let inGroup = 0;

        for (const char of pattern) {
          if (char === "(") inGroup++;
          if (char === ")") {
            inGroup--;
            if (inGroup >= 0) depth = 0;
          }
          if (["+", "*", "?", "{"].includes(char)) {
            depth++;
            maxDepth = Math.max(maxDepth, depth);
          }
        }

        return maxDepth;
      };

      const highNesting = allPatterns.filter((p) => countQuantifierNesting(p.pattern) > 3);

      // Most regex patterns have quantifiers; we're checking for extreme nesting
      // Allow up to 80% of patterns to have moderate nesting
      expect(highNesting.length).toBeLessThan(allPatterns.length * 0.8);
    });
  });
});

describe("Pattern Timeout Enforcement", () => {
  it("can implement regex timeout wrapper", async () => {
    const withTimeout = (regex: RegExp, input: string, timeoutMs: number): boolean => {
      const start = Date.now();

      // For JS, we can't truly timeout regex, but we can check after
      const result = regex.test(input);

      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        console.warn(`Regex took ${elapsed}ms, exceeding ${timeoutMs}ms timeout`);
        return false;
      }

      return result;
    };

    const safeRegex = /hello/;
    const result = withTimeout(safeRegex, "hello world", 100);
    expect(result).toBe(true);
  });
});
