/**
 * Exploit Test Generator Tests
 * 
 * Tests that exploit tests are generated correctly for each vulnerability type.
 */

import { describe, it, expect } from "vitest";
import { generateExploitTest } from "@/execution/generator.js";
import type { Gap } from "@/core/scanner/types.js";

// Helper to create a minimal gap
function createGap(overrides: Partial<Gap>): Gap {
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
    codeSnippet: "const result = db.query(`SELECT * FROM users WHERE id = ${userId}`);",
    patternId: "sql-string-concat",
    detectionType: "regex",
    message: "SQL injection vulnerability",
    ...overrides,
  };
}

describe("Exploit Test Generator", () => {
  describe("SQL Injection", () => {
    const gap = createGap({
      categoryId: "sql-injection",
      codeSnippet: "db.query(`SELECT * FROM users WHERE id = ${userId}`)",
    });

    it("generates TypeScript exploit test", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("describe");
      expect(code).toContain("SQL Injection Exploit");
      expect(code).toContain("PAYLOADS");
      expect(code).toContain("' OR '1'='1");
      expect(code).toContain("UNION SELECT");
      expect(code).toContain("boolean blind injection");
    });

    it("generates Python exploit test", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "python");

      expect(code).toContain("class TestSqlInjectionExploit");
      expect(code).toContain("PAYLOADS");
      expect(code).toContain("boolean_blind_injection");
      expect(code).toContain("union_injection");
    });

    it("includes line number in test name", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("42");
    });

    it("escapes template literals in target code", () => {
      const targetCode = "const x = `template with ${var}`;";
      const code = generateExploitTest(gap, targetCode, "typescript");

      // The targetCode variable in the generated test should have escaped content
      // Look for the escaped version in the const targetCode = `...` line
      expect(code).toContain("\\`template with \\${var}\\`");
    });
  });

  describe("XSS", () => {
    const gap = createGap({
      categoryId: "xss",
      codeSnippet: "element.innerHTML = userInput;",
    });

    it("generates XSS exploit test", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("XSS Exploit");
      expect(code).toContain("<script>");
      expect(code).toContain("innerHTML");
      expect(code).toContain("sanitize");
    });

    it("checks for common XSS payloads", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("<script>alert");
      expect(code).toContain("<img src=x onerror");
      expect(code).toContain("<svg onload");
    });
  });

  describe("Command Injection", () => {
    const gap = createGap({
      categoryId: "command-injection",
      codeSnippet: "exec(`ls ${userDir}`);",
    });

    it("generates command injection exploit test", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("Command Injection Exploit");
      expect(code).toContain("; ls -la");
      expect(code).toContain("| cat /etc/passwd");
      expect(code).toContain("`whoami`");
    });

    it("checks for shell metacharacters", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("shell");
      expect(code).toContain("exec");
      expect(code).toContain("spawn");
    });
  });

  describe("Path Traversal", () => {
    const gap = createGap({
      categoryId: "path-traversal",
      codeSnippet: "fs.readFile(userPath);",
    });

    it("generates path traversal exploit test", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("Path Traversal Exploit");
      expect(code).toContain("../../../");
      expect(code).toContain("etc/passwd");
    });

    it("checks for path normalization", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("path.normalize");
      expect(code).toContain("path.resolve");
      expect(code).toContain("realpath");
    });
  });

  describe("Generic/Unknown", () => {
    const gap = createGap({
      categoryId: "unknown-vuln",
      codeSnippet: "someDangerousCode();",
    });

    it("generates generic test for unknown category", () => {
      const code = generateExploitTest(gap, gap.codeSnippet, "typescript");

      expect(code).toContain("Exploit Test");
      expect(code).toContain("unknown-vuln");
    });
  });
});
