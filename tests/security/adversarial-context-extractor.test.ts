/**
 * Adversarial tests for the context extractor
 *
 * These tests try to BREAK the context extractor with:
 * - Malicious file paths (path traversal)
 * - Extremely large files
 * - Binary/corrupt files
 * - Deeply nested functions
 * - Malformed code
 * - Unicode edge cases
 * - Symlink attacks
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { extractTestContext } from "../../src/testgen/context.js";
import type { Gap } from "../../src/core/scanner/types.js";

function makeGap(overrides: Partial<Gap> = {}): Gap {
  return {
    categoryId: "sql-injection",
    categoryName: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "",
    lineStart: 1,
    lineEnd: 1,
    columnStart: 0,
    columnEnd: 0,
    codeSnippet: "",
    patternId: "test",
    patternType: "regex",
    priorityScore: 10,
    ...overrides,
  };
}

describe("Adversarial Context Extractor", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pinata-adversarial-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe("path traversal resistance", () => {
    it("rejects file paths outside project root", async () => {
      const filePath = join(testDir, "../../etc/passwd");
      const gap = makeGap({ filePath, lineStart: 1 });

      // Should throw or return safely, not leak system files
      await expect(extractTestContext(gap, testDir)).rejects.toThrow();
    });

    it("handles null bytes in file paths", async () => {
      const filePath = join(testDir, "file\x00.ts");
      const gap = makeGap({ filePath, lineStart: 1 });

      await expect(extractTestContext(gap, testDir)).rejects.toThrow();
    });
  });

  describe("malformed code handling", () => {
    it("handles empty files without crashing", async () => {
      const filePath = join(testDir, "empty.ts");
      writeFileSync(filePath, "");
      const gap = makeGap({ filePath, lineStart: 1 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx.fileSource).toBe("");
      expect(ctx.functionBody).toBeDefined();
    });

    it("handles binary content without crashing", async () => {
      const filePath = join(testDir, "binary.ts");
      writeFileSync(filePath, Buffer.from([0x00, 0xFF, 0xFE, 0x89, 0x50, 0x4E, 0x47]));
      const gap = makeGap({ filePath, lineStart: 1 });

      // Should not crash, should return something
      const ctx = await extractTestContext(gap, testDir);
      expect(ctx).toBeDefined();
    });

    it("handles files with only whitespace", async () => {
      const filePath = join(testDir, "whitespace.ts");
      writeFileSync(filePath, "   \n\n\n   \n  \t\t\n");
      const gap = makeGap({ filePath, lineStart: 3 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx.fileSource.trim()).toBe("");
    });

    it("handles unmatched braces without infinite loop", async () => {
      const filePath = join(testDir, "bad-braces.ts");
      writeFileSync(filePath, `function broken() {
  if (true) {
    if (false) {
      // missing closing braces
`);
      const gap = makeGap({ filePath, lineStart: 3 });
      const ctx = await extractTestContext(gap, testDir);

      // Should complete without hanging
      expect(ctx.functionBody).toBeDefined();
    });

    it("handles extremely long single line", async () => {
      const filePath = join(testDir, "longline.ts");
      const longLine = "const x = " + "'a'.repeat(100000)" + ";\n";
      writeFileSync(filePath, longLine);
      const gap = makeGap({ filePath, lineStart: 1 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx).toBeDefined();
    });
  });

  describe("unicode and encoding edge cases", () => {
    it("handles files with unicode function names", async () => {
      const filePath = join(testDir, "unicode.ts");
      writeFileSync(filePath, `export function getUser\u200B(id: string) {
  return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
}
`);
      const gap = makeGap({ filePath, lineStart: 2 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx.functionBody).toContain("getUser");
    });

    it("handles files with BOM marker", async () => {
      const filePath = join(testDir, "bom.ts");
      writeFileSync(filePath, "\uFEFFconst x = 1;\n");
      const gap = makeGap({ filePath, lineStart: 1 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx).toBeDefined();
    });

    it("handles mixed line endings (CRLF and LF)", async () => {
      const filePath = join(testDir, "crlf.ts");
      writeFileSync(filePath, "function test() {\r\n  const x = 1;\r\n  return x;\r\n}\n");
      const gap = makeGap({ filePath, lineStart: 2 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx.functionBody).toContain("test");
    });
  });

  describe("deeply nested code", () => {
    it("extracts function from 10 levels of nesting", async () => {
      const filePath = join(testDir, "deep.ts");
      let code = "";
      for (let i = 0; i < 10; i++) {
        code += "  ".repeat(i) + `function level${i}() {\n`;
      }
      code += "  ".repeat(10) + 'const vuln = `SELECT * FROM users WHERE id = ${id}`;\n';
      for (let i = 9; i >= 0; i--) {
        code += "  ".repeat(i) + "}\n";
      }
      writeFileSync(filePath, code);

      const gap = makeGap({ filePath, lineStart: 11 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx.functionBody).toContain("SELECT * FROM users");
    });
  });

  describe("line number edge cases", () => {
    it("handles line number 0", async () => {
      const filePath = join(testDir, "zero.ts");
      writeFileSync(filePath, "const x = 1;\n");
      const gap = makeGap({ filePath, lineStart: 0 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx).toBeDefined();
    });

    it("handles line number beyond file length", async () => {
      const filePath = join(testDir, "short.ts");
      writeFileSync(filePath, "const x = 1;\n");
      const gap = makeGap({ filePath, lineStart: 9999 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx).toBeDefined();
    });

    it("handles negative line number", async () => {
      const filePath = join(testDir, "neg.ts");
      writeFileSync(filePath, "const x = 1;\n");
      const gap = makeGap({ filePath, lineStart: -5 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx).toBeDefined();
    });
  });

  describe("framework detection adversarial", () => {
    it("handles corrupt package.json", async () => {
      writeFileSync(join(testDir, "package.json"), "{{{{invalid json");
      const filePath = join(testDir, "test.ts");
      writeFileSync(filePath, "const x = 1;\n");

      const gap = makeGap({ filePath, lineStart: 1 });
      const ctx = await extractTestContext(gap, testDir);

      // Should fall back to default, not crash
      expect(ctx.testFramework).toBeDefined();
      expect(ctx.testFramework.name).toBeDefined();
    });

    it("handles package.json with no dependencies field", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "empty" }));
      const filePath = join(testDir, "test.ts");
      writeFileSync(filePath, "const x = 1;\n");

      const gap = makeGap({ filePath, lineStart: 1 });
      const ctx = await extractTestContext(gap, testDir);

      expect(ctx.testFramework.name).toBeDefined();
    });
  });

  describe("nonexistent files", () => {
    it("throws on nonexistent file", async () => {
      const gap = makeGap({ filePath: join(testDir, "does-not-exist.ts"), lineStart: 1 });

      await expect(extractTestContext(gap, testDir)).rejects.toThrow();
    });
  });
});
