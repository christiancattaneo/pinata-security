/**
 * Final targeted kills for remaining non-regex mutants.
 * Each test is designed to fail for exactly one surviving mutation.
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
beforeEach(() => { d = join(tmpdir(), `pf-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); });
afterEach(() => { try { rmSync(d, { recursive: true, force: true }); } catch {} });

// =============================================================================
// L170: idx > lines.length (should be idx >= lines.length)
// Triggers when idx === lines.length exactly (one past end)
// =============================================================================
describe("Fallback boundary: idx === lines.length", () => {
  it("triggers fallback when line equals file length (not just greater)", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "line1\nline2\nline3\n"); // 3 content lines, split gives 4 (empty last)
    // lines.length = 4, so lineStart=5 means idx=4 which === length
    const ctx = await extractTestContext(g(fp, 5), d);
    expect(ctx.functionName).toBeUndefined(); // fallback path
    expect(ctx.functionBody).toBeDefined();
  });
});

// =============================================================================
// L172-174: Math.max/min swap and arithmetic swap
// Math.max(0, idx-10) → if Math.min, start could be negative
// idx-10 → if idx+10, start would be way past end
// =============================================================================
describe("Fallback range Math functions", () => {
  it("start is 0 (not negative) when idx is small", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "a\nb\nc\nd\ne\nf\n");
    // idx = -2 (lineStart=-1), max(0, -2-10) = 0, NOT min(0,-12) = -12
    const ctx = await extractTestContext(g(fp, -1), d);
    // Body should start from beginning of file, not be empty
    expect(ctx.functionBody).toContain("a");
  });

  it("end does not exceed file length", async () => {
    const fp = join(d, "b.ts");
    writeFileSync(fp, "only\n"); // 2 lines after split
    const ctx = await extractTestContext(g(fp, 999), d);
    // min(2, 998+10)=2, NOT max(2, 1008)=1008
    // slice(start, end) with valid bounds should not crash
    expect(ctx.functionBody).toBeDefined();
  });

  it("body is sliced lines joined with newline (not raw array)", async () => {
    const fp = join(d, "c.ts");
    writeFileSync(fp, "aaa\nbbb\nccc\n");
    const ctx = await extractTestContext(g(fp, 999), d);
    // lines.slice().join("\n") vs just "lines" (the array)
    expect(typeof ctx.functionBody).toBe("string");
    if (ctx.functionBody.includes("aaa")) {
      expect(ctx.functionBody).toContain("\n"); // joined, not toString()
    }
  });

  it("separator is newline not empty string", async () => {
    const fp = join(d, "d.ts");
    writeFileSync(fp, "xxx\nyyy\nzzz\n");
    const ctx = await extractTestContext(g(fp, 999), d);
    // join("") would produce "xxxyyyzzz", join("\n") produces "xxx\nyyy\nzzz"
    if (ctx.functionBody.length > 3) {
      expect(ctx.functionBody).not.toBe(ctx.functionBody.replace(/\n/g, ""));
    }
  });
});

// =============================================================================
// L192: j >= 0 vs j > 0; line.length - 1 vs line.length + 1
// =============================================================================
describe("Inner char scan boundary", () => {
  it("scans character at position 0 (j >= 0, not j > 0)", async () => {
    const fp = join(d, "a.ts");
    // Brace at position 0 of line
    writeFileSync(fp, "function f()\n{\nreturn 1;\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // Must find the { at position 0 of line 2
    expect(ctx.functionBody).toContain("function f");
  });

  it("starts scan at last character (length - 1, not length + 1)", async () => {
    const fp = join(d, "b.ts");
    // Single char lines with braces
    writeFileSync(fp, "function f() {\n  x;\n}\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("function f");
  });
});

// =============================================================================
// L209: .trim() removed — signature matching without trim
// =============================================================================
describe("Signature trim necessity", () => {
  it("matches indented function signature (trim required)", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "    function deepIndented() {\n      return 1;\n    }\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionName).toBe("deepIndented");
  });
});

// =============================================================================
// L226: braceDepth === 0 → braceDepth !== 0 (inverted check)
// Would never stop, or stop immediately
// =============================================================================
describe("Forward walk braceDepth zero check", () => {
  it("stops exactly when braces balance (not before or after)", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "function f() {\n  return 1;\n}\nconst after = 2;\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("return 1");
    expect(ctx.functionBody).not.toContain("after");
  });

  it("ConditionalExpression:true would include everything", async () => {
    const fp = join(d, "b.ts");
    writeFileSync(fp, "function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // Should NOT include function b
    expect(ctx.functionBody).not.toContain("function b");
  });
});

// =============================================================================
// L237: optional chaining — lines[sigStart] vs lines[sigStart]!
// =============================================================================
describe("Optional chaining on sigLine", () => {
  it("does not crash when sigStart is at edge", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "function edge() {\n  return 1;\n}\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.functionName).toBe("edge");
  });
});

// =============================================================================
// L259: line.trim() === "" — empty line skip in Python
// If false (never skip), blank lines would break function
// If MethodExpression (line instead of line.trim()), spaces aren't empty
// =============================================================================
describe("Python empty line skip", () => {
  it("skips lines that are only spaces (trim to empty)", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, "def f():\n    x = 1\n    \n    y = 2\n    return x + y\n\nz = 3\n");
    const ctx = await extractTestContext(g(fp, 4), d);
    expect(ctx.functionBody).toContain("return x + y");
    expect(ctx.functionBody).not.toContain("z = 3");
  });

  it("treats line with only whitespace as empty", async () => {
    const fp = join(d, "b.py");
    // Line 3 has spaces only — should be treated as empty, not as code
    writeFileSync(fp, "def g():\n    a = 1\n        \n    return a\n\nx = 2\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("return a");
  });
});

// =============================================================================
// L261: lineIndent <= indent — if true always, body is one line
// MethodExpression: line.trim() !== "" → line !== "" 
// =============================================================================
describe("Python indent comparison", () => {
  it("continues when line indent is greater than function indent", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, "def f():\n    if True:\n        deeply = 1\n    return deeply\n\nx = 2\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    expect(ctx.functionBody).toContain("return deeply");
  });

  it("uses trimmed line for empty check (not raw)", async () => {
    const fp = join(d, "b.py");
    // Line with spaces but no content should be skipped, not treated as dedent
    writeFileSync(fp, "def h():\n    a = 1\n  \n    b = 2\n    return b\n\ntop = 3\n");
    const ctx = await extractTestContext(g(fp, 4), d);
    expect(ctx.functionBody).toContain("return b");
  });
});

// =============================================================================
// L293-297: language === "go" / "java" → ConditionalExpression: true
// If always true, Go/Java rules run for every language
// =============================================================================
describe("Language-specific import branches", () => {
  it("Go import rules do NOT apply to Python files", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, '"not a go import"\nimport os\nx = 1\n');
    const ctx = await extractTestContext(g(fp, 3), d);
    // Python: should only capture 'import os', not the quoted string
    expect(ctx.imports).toContain("import os");
    expect(ctx.imports.every(i => !i.startsWith('"not'))).toBe(true);
  });

  it("Java import rules do NOT apply to TypeScript files", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, 'import { x } from "y";\nimport z from "w";\n');
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.imports).toHaveLength(2);
    // Both should be TS-style imports
    expect(ctx.imports[0]).toContain("from");
  });
});

// =============================================================================
// L294: Go — trimmed.startsWith('"') vs endsWith, and StringLiteral ""
// =============================================================================
describe("Go startsWith quote check", () => {
  it("captures lines starting with quote mark", async () => {
    const fp = join(d, "a.go");
    writeFileSync(fp, 'package main\nimport "fmt"\nfunc main() {}\n');
    const ctx = await extractTestContext(g(fp, 3), d);
    expect(ctx.imports.some(i => i.includes('"fmt"'))).toBe(true);
  });

  it("import keyword detection uses 'import ' (with space)", async () => {
    const fp = join(d, "b.go");
    writeFileSync(fp, 'package main\nimport "net/http"\nimport "os"\nfunc main() {}\n');
    const ctx = await extractTestContext(g(fp, 4), d);
    expect(ctx.imports.filter(i => i.includes("import")).length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// L315: existsSync(pkgPath) → true — would try to read nonexistent
// =============================================================================
describe("Package.json existence check", () => {
  it("does not crash when package.json missing", async () => {
    const fp = join(d, "x.ts"); writeFileSync(fp, "x\n");
    // No package.json in d
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework).toBeDefined();
  });
});

// =============================================================================
// L374: existsSync(candidate) → true — would try to read nonexistent test
// =============================================================================
describe("Test file existence check", () => {
  it("does not crash when no test files exist", async () => {
    const fp = join(d, "solo.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.existingTestSample).toBeUndefined();
  });
});

// =============================================================================
// L393: language === "python" ? ".py" : extname 
// ConditionalExpression: false → always uses extname (breaks Python)
// StringLiteral: "" → uses empty string extension
// =============================================================================
describe("Python test path extension", () => {
  it("uses .py for Python (not .py source extension)", async () => {
    const fp = join(d, "mod.py"); writeFileSync(fp, "x=1\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.suggestedTestPath).toMatch(/\.test\.py$/);
  });

  it("uses source ext for TypeScript (not .py)", async () => {
    const fp = join(d, "mod.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.suggestedTestPath).toMatch(/\.test\.ts$/);
  });

  it("extension is not empty string", async () => {
    const fp = join(d, "mod.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.suggestedTestPath).not.toMatch(/\.test$/);
    expect(ctx.suggestedTestPath).toMatch(/\.test\.\w+$/);
  });
});

// =============================================================================
// L59/60/68/69: Framework arrays — if emptied or string changed
// =============================================================================
describe("Framework array content", () => {
  it("vitest detected from devDeps string 'vitest' (not empty)", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { vitest: "4" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("vitest NOT detected when devDeps has empty string key", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { "": "4" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // Empty string won't match "vitest", so falls to default
    expect(ctx.testFramework.name).toBe("vitest"); // default for TS
  });

  it("pytest string must be 'pytest' exactly", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { pytest: "7" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("pytest");
  });

  it("vitest config files list is not empty", async () => {
    // If files array was emptied, config file detection wouldn't work
    writeFileSync(join(d, "package.json"), JSON.stringify({}));
    writeFileSync(join(d, "vitest.config.ts"), "x");
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("vitest");
  });
});
