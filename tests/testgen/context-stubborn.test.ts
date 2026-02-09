/**
 * Stubborn mutant killers.
 * Each test creates conditions where the mutated and original code
 * produce observably different results.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { extractTestContext } from "../../src/testgen/context.js";
import type { Gap } from "../../src/core/scanner/types.js";

function g(fp: string, ln: number, ov: Partial<Gap> = {}): Gap {
  return { categoryId: "sql-injection", categoryName: "X", domain: "security", level: "integration", priority: "P0", severity: "critical", confidence: "high", filePath: fp, lineStart: ln, lineEnd: ln, columnStart: 0, columnEnd: 0, codeSnippet: "", patternId: "t", patternType: "regex", priorityScore: 10, ...ov };
}

let d: string;
beforeEach(() => { d = join(tmpdir(), `ps-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); });
afterEach(() => { try { rmSync(d, { recursive: true, force: true }); } catch {} });

// =============================================================================
// L172-174: Fallback range — need idx-10 > 0 to distinguish max from min
// File with 30 lines. lineStart=25 → idx=24. max(0,24-10)=14. min(0,14)=0.
// So start should be 14, not 0.
// =============================================================================
describe("Fallback range: positive start offset", () => {
  it("fallback starts ~10 lines before target when idx is positive but out of bounds", async () => {
    const fp = join(d, "a.ts");
    // 20 lines. lineStart=25 → idx=24 >= 21 lines → fallback triggers
    const lines = Array.from({ length: 20 }, (_, i) => `// line ${i + 1}`);
    writeFileSync(fp, lines.join("\n") + "\n");
    // idx=24, max(0, 24-10)=14, min(21, 24+10)=21 → slice(14, 21)
    const ctx = await extractTestContext(g(fp, 25), d);
    expect(ctx.functionBody).toContain("line 15");
    expect(ctx.functionBody).not.toContain("line 5\n");
  });

  it("fallback end clamps to file length", async () => {
    const fp = join(d, "b.ts");
    const lines = Array.from({ length: 20 }, (_, i) => `// L${i + 1}`);
    writeFileSync(fp, lines.join("\n") + "\n");
    const ctx = await extractTestContext(g(fp, 25), d);
    expect(ctx.functionBody).toContain("L20"); // last real line included
  });

  it("fallback body is string joined by newline", async () => {
    const fp = join(d, "c.ts");
    const lines = Array.from({ length: 20 }, (_, i) => `V${i}`);
    writeFileSync(fp, lines.join("\n") + "\n");
    const ctx = await extractTestContext(g(fp, 25), d);
    expect(typeof ctx.functionBody).toBe("string");
    expect(ctx.functionBody).toContain("\n");
    expect(ctx.functionBody).not.toContain(",V"); // not array toString
  });
});

// =============================================================================
// L192: j >= 0 (scan to position 0) and line.length - 1 (start from end)
// Need a line where the only brace is at position 0
// =============================================================================
describe("Char scan: j boundary and length offset", () => {
  it("finds brace at position 0 (j >= 0 must include 0)", async () => {
    const fp = join(d, "a.ts");
    // Line 2: "{" at position 0. If j > 0 (not >=), position 0 is skipped.
    writeFileSync(fp, "function f()\n{\nreturn eval('x');\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    expect(ctx.functionBody).toContain("function f");
  });

  it("scans last char of long line (length-1, not length+1)", async () => {
    const fp = join(d, "b.ts");
    // Long line with brace at end
    writeFileSync(fp, `function longName${"a".repeat(50)}() {\n  return 1;\n}\n`);
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("longName");
  });
});

// =============================================================================
// L209: lines[i]!.trim() → lines[i]! (no trim)
// Need signature with leading spaces to distinguish
// =============================================================================
describe("Signature line trim", () => {
  it("trim removes leading spaces for regex match", async () => {
    const fp = join(d, "a.ts");
    // Indented function — without trim, "    function" wouldn't match "^function"
    writeFileSync(fp, "class C {\n    function method() {\n      return eval('x');\n    }\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // With trim: "function method()" matches. Without: "    function method()" doesn't match ^function
    expect(ctx.functionBody).toContain("method");
  });
});

// =============================================================================
// L226: started && braceDepth === 0
// ConditionalExpression: true → endIdx always set (stops on first line)
// EqualityOperator: !== 0 → never matches (never stops)
// =============================================================================
describe("Brace balance stop condition", () => {
  it("walks past inner balanced braces to find function end", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "function f() {\n  const obj = { a: { b: 1 } };\n  return obj;\n}\nconst x = 1;\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // Must include "return obj" (line 3) — braceDepth goes 1→2→3→2→1→0
    // If braceDepth !== 0 (never stops), body would include "const x"
    // If true (always stops), body would stop at first }
    expect(ctx.functionBody).toContain("return obj");
    expect(ctx.functionBody).not.toContain("const x");
  });
});

// =============================================================================
// L237: optional chaining — lines[sigStart]?.trim() ?? ""
// MethodExpression: lines[sigStart] (no trim/optional chain)
// OptionalChaining: lines[sigStart].trim (crashes on undefined)
// =============================================================================
describe("SigLine optional chain", () => {
  it("does not crash on single-line brace file", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "{ eval('x'); }\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx).toBeDefined();
  });
});

// =============================================================================
// L259/261: Python empty line skip and indent comparison
// These interact: skip blank lines, then check indent of non-blank
// =============================================================================
describe("Python body boundary (L259+261)", () => {
  it("whitespace-only line is treated as empty (not as dedent)", async () => {
    const fp = join(d, "a.py");
    // Line 3 has 4 spaces (whitespace only) — must be skipped
    // Without trim, "    " !== "" so it's treated as code with indent 4
    // With trim, "    ".trim() === "" so it's skipped
    writeFileSync(fp, "def f():\n    a = 1\n    \n    b = 2\n    return b\n\nx = 1\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("b = 2");
    expect(ctx.functionBody).toContain("return b");
    expect(ctx.functionBody).not.toContain("x = 1");
  });

  it("ConditionalExpression:false (never skip) would break on blank line", async () => {
    const fp = join(d, "b.py");
    writeFileSync(fp, "def g():\n    x = 1\n\n    y = 2\n    return y\n\nz = 3\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // Empty line 3 should be skipped. If not skipped, indent=0 <= 0 → function ends early
    expect(ctx.functionBody).toContain("return y");
  });

  it("ConditionalExpression:true (always break) would stop immediately", async () => {
    const fp = join(d, "c.py");
    writeFileSync(fp, "def h():\n    a = 1\n    b = 2\n    return a + b\n\nx = 1\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("return a + b");
  });
});

// =============================================================================
// L293/297: language === "go" / "java" → true
// If always true, Go/Java import rules pollute TS/Python imports
// =============================================================================
describe("Language branch guards (L293/297)", () => {
  it("TS file does not use Go import rules (no quoted-line capture)", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, '"quoted line"\nimport { x } from "y";\n');
    const ctx = await extractTestContext(g(fp, 2), d);
    // If Go branch ran, "quoted line" would be captured as import
    const hasQuotedLine = ctx.imports.some(i => i === '"quoted line"');
    expect(hasQuotedLine).toBe(false);
  });

  it("Python file does not use Java import rules", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, "import os\nx = 1\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.imports).toEqual(["import os"]);
  });
});

// =============================================================================
// L294: Go — startsWith('"') and string literal mutations
// =============================================================================
describe("Go import startsWith check", () => {
  it("captures import keyword lines", async () => {
    const fp = join(d, "a.go");
    writeFileSync(fp, 'package main\nimport "fmt"\nfunc main() {}\n');
    const ctx = await extractTestContext(g(fp, 3), d);
    const fmtImport = ctx.imports.find(i => i.includes("fmt"));
    expect(fmtImport).toBeDefined();
  });

  it("captures quoted lines in import block", async () => {
    const fp = join(d, "b.go");
    writeFileSync(fp, 'package main\nimport (\n\t"net/http"\n)\nfunc main() {}\n');
    const ctx = await extractTestContext(g(fp, 5), d);
    expect(ctx.imports.some(i => i.includes('"net/http"'))).toBe(true);
  });

  it("startsWith checks for double-quote specifically", async () => {
    const fp = join(d, "c.go");
    // Single quote line should NOT be captured by Go rules (starts with ', not ")
    writeFileSync(fp, "package main\nimport \"fmt\"\n'not an import'\nfunc main() {}\n");
    const ctx = await extractTestContext(g(fp, 4), d);
    expect(ctx.imports.some(i => i.includes("not an import"))).toBe(false);
  });
});

// =============================================================================
// L315/374: existsSync → true — would attempt to read nonexistent files
// =============================================================================
describe("existsSync guards", () => {
  it("L315: skips package.json reading when file missing", async () => {
    const fp = join(d, "x.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework).toBeDefined();
  });

  it("L374: skips test file reading when no candidates exist", async () => {
    const fp = join(d, "isolated.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.existingTestSample).toBeUndefined();
  });
});

// =============================================================================
// L393: Python extension ternary
// =============================================================================
describe("Python extension ternary", () => {
  it(".py extension for Python is not empty", async () => {
    const fp = join(d, "x.py"); writeFileSync(fp, "x=1\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.suggestedTestPath).toMatch(/\.test\.py$/);
    expect(ctx.suggestedTestPath).not.toMatch(/\.test\.$/); // not empty ext
  });
});

// =============================================================================
// L59/60/68/69: Framework arrays — emptied or string changed
// =============================================================================
describe("Framework array specific strings", () => {
  it("vitest string 'vitest' must match devDeps key exactly", async () => {
    // If string mutated to "", would match empty-string key
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { vitest: "4" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("vitest files array not empty (config file detection works)", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({}));
    writeFileSync(join(d, "vitest.config.ts"), "x");
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("pytest deps array contains 'pytest' string", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { pytest: "7" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("pytest");
  });

  it("pytest devDeps array contains 'pytest' string", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { pytest: "7" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("pytest");
  });
});
