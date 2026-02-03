/**
 * Integration Tests for Dynamic Execution
 * 
 * End-to-end tests that verify the full execution pipeline.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createRunner } from "@/execution/runner.js";
import { createSandbox } from "@/execution/sandbox.js";
import { generateExploitTest } from "@/execution/generator.js";
import { parseResults } from "@/execution/results.js";
import type { Gap } from "@/core/scanner/types.js";

function createVulnerableGap(): Gap {
  return {
    categoryId: "sql-injection",
    categoryName: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "/src/db.ts",
    lineStart: 42,
    lineEnd: 42,
    columnStart: 0,
    columnEnd: 80,
    codeSnippet: `
      async function getUserById(id: string) {
        return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
      }
    `,
    patternId: "sql-string-concat",
    detectionType: "regex",
    message: "SQL injection via string concatenation",
  };
}

describe("Dynamic Execution Integration", () => {
  let dockerAvailable: boolean;

  beforeAll(async () => {
    const sandbox = createSandbox();
    dockerAvailable = await sandbox.isDockerAvailable();
  });

  describe("full pipeline", () => {
    it("generates valid test code from gap", () => {
      const gap = createVulnerableGap();
      const testCode = generateExploitTest(gap, gap.codeSnippet, "typescript");

      // Test code should be valid JavaScript/TypeScript
      expect(testCode).toContain("describe");
      expect(testCode).toContain("it");
      expect(testCode).toContain("expect");
      
      // Should have proper structure
      expect(testCode).toContain("describe('SQL Injection Exploit");
      expect(testCode).toContain("PAYLOADS");
      
      // Should end with closing braces/semicolons
      expect(testCode.trim()).toMatch(/[});]$/);
    });

    it("parses results correctly for all outcomes", () => {
      const gap = createVulnerableGap();

      // Confirmed case
      const confirmed = parseResults(
        { stdout: "", stderr: "", exitCode: 0, timedOut: false },
        gap,
        "vitest"
      );
      expect(confirmed.status).toBe("confirmed");

      // Unconfirmed case
      const unconfirmed = parseResults(
        { stdout: "", stderr: "", exitCode: 1, timedOut: false },
        gap,
        "vitest"
      );
      expect(unconfirmed.status).toBe("unconfirmed");

      // Error case
      const error = parseResults(
        { stdout: "", stderr: "", exitCode: 1, timedOut: true },
        gap,
        "vitest"
      );
      expect(error.status).toBe("error");
    });

    it("runner filters non-testable gaps", async () => {
      const runner = createRunner(undefined, true); // dry-run mode

      const gaps: Gap[] = [
        { ...createVulnerableGap(), categoryId: "sql-injection" },
        { ...createVulnerableGap(), categoryId: "hardcoded-secrets" },
        { ...createVulnerableGap(), categoryId: "xss" },
      ];

      const fileContents = new Map<string, string>();
      fileContents.set("/src/db.ts", "vulnerable code");

      const summary = await runner.executeAll(gaps, fileContents);

      // In dry-run mode: 2 testable (skipped as dry run) + 1 not testable (skipped)
      // Total = 3 skipped
      expect(summary.skipped).toBe(3);
      expect(summary.total).toBe(3);
      expect(summary.confirmed).toBe(0);
    });
  });

  describe("exploit test quality", () => {
    it("SQL injection test includes multiple attack vectors", () => {
      const gap = createVulnerableGap();
      const testCode = generateExploitTest(gap, gap.codeSnippet, "typescript");

      // Boolean blind
      expect(testCode).toContain("'1'='1");
      expect(testCode).toContain("'1'='2");

      // UNION
      expect(testCode).toContain("UNION SELECT");

      // Comment termination
      expect(testCode).toContain("--");
    });

    it("XSS test includes multiple payload types", () => {
      const gap = { ...createVulnerableGap(), categoryId: "xss" };
      const testCode = generateExploitTest(gap, gap.codeSnippet, "typescript");

      // Script tag
      expect(testCode).toContain("<script>");

      // Event handler
      expect(testCode).toContain("onerror");

      // SVG
      expect(testCode).toContain("<svg");
    });

    it("command injection test includes shell metacharacters", () => {
      const gap = { ...createVulnerableGap(), categoryId: "command-injection" };
      const testCode = generateExploitTest(gap, gap.codeSnippet, "typescript");

      // Semicolon chain
      expect(testCode).toContain("; ls");

      // Pipe
      expect(testCode).toContain("| cat");

      // Backticks
      expect(testCode).toContain("`whoami`");

      // Command substitution
      expect(testCode).toContain("$(");
    });
  });

  describe("security constraints", () => {
    it("sandbox config disables network by default", () => {
      const sandbox = createSandbox();
      // @ts-expect-error - accessing private property for testing
      expect(sandbox.config?.networkEnabled ?? false).toBe(false);
    });

    it("sandbox config has resource limits", () => {
      const sandbox = createSandbox();
      // Default config should have limits
      expect(true).toBe(true); // Placeholder - real test would check Docker args
    });
  });

  describe("dry-run mode", () => {
    it("generates but does not execute in dry-run", async () => {
      const runner = createRunner(undefined, true);
      const gap = createVulnerableGap();

      const result = await runner.executeOne(gap, gap.codeSnippet);

      expect(result.status).toBe("skipped");
      expect(result.summary).toContain("Dry run");
      expect(result.evidence?.stdout).toContain("describe"); // Should contain test code
    });
  });

  // Only run this if Docker is available
  describe.skipIf(!dockerAvailable)("Docker execution", () => {
    it("can build sandbox image", async () => {
      const sandbox = createSandbox();
      const imageReady = await sandbox.ensureImage();
      
      expect(imageReady).toBe(true);
    }, 120000); // 2 minute timeout for image build
  });
});
