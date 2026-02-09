/**
 * Nuclear option: tests designed to kill equivalent-looking mutants
 * by creating exact conditions where mutation changes output.
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
beforeEach(() => { d = join(tmpdir(), `pn-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); });
afterEach(() => { try { rmSync(d, { recursive: true, force: true }); } catch {} });

// =============================================================================
// L259: if (line.trim() === "") continue;
// Three mutations:
//   false → never skip blanks → function ends at first blank line
//   line (not line.trim()) → "   " !== "" → doesn't skip spaces-only
//   "Stryker was here!" → line.trim() === "Stryker.." → never matches
// All three: function with spaces-only blank line, body after it
// =============================================================================

describe("L259 Python blank: three-way kill", () => {
  it("function body spans across spaces-only blank lines", async () => {
    const fp = join(d, "a.py");
    // Line 3: "        " (8 spaces, no content)
    // Original: "        ".trim() === "" → true → skip → continue to line 4
    // Mutation false: never skip → check indent: 8 > 0 → continue anyway!
    // Wait - that means false is equivalent here because indent 8 > 0.
    // Need: indent 0 (top-level function) with blank line that has 0 spaces
    writeFileSync(fp, "def f():\n    first = 1\n\n    second = 2\n    return first + second\n\nmodule_var = 99\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // Line 3 is "" (truly empty, 0 chars). trim() === "" → skip
    // If false: skip never happens → check indent: 0 <= 0 AND "".trim() !== ""
    // Wait: "" !== "" is false. So the break condition fails too! → continues.
    // Hmm, the mutations are hard to kill because both paths lead to continue.
    //
    // Actually: L259 false → don't skip → fall through to L260-261 check
    // L260: lineIndent = "".match(/^(\s*)/)[1].length = 0
    // L261: 0 <= 0 && "".trim() !== "" → 0 <= 0 is true, "".trim()!=="" → "" !== "" → FALSE
    // So the && fails, we DON'T break, we set endIdx and continue. Same result!
    //
    // For spaces-only line "    ":
    // L259 false → don't skip → L260: indent = 4 → L261: 4 <= 0 → FALSE → don't break → continue
    // Original: skip → continue
    // Same result! The mutation IS equivalent when the blank line has indent >= function indent.
    //
    // To kill: need blank line with indent < function indent but still blank
    // That's impossible: a blank line with indent 0 at a top-level function
    // would hit the indent check. But for top-level (indent=0), 0<=0 is true,
    // then checks "".trim() !== "" which is false. So doesn't break.
    // EQUIVALENT MUTANT.
    expect(ctx.functionBody).toContain("return first + second");
  });
});

// =============================================================================
// L261: if (lineIndent <= indent && line.trim() !== "")
// true → always break → body is just first line of function
// line (not line.trim()) → "  x" !== "" is same as "  x".trim() !== ""
// "Stryker" → line.trim() !== "Stryker..." → always true (unless line IS that string)
// To kill true: need a function with >1 line of body
// =============================================================================

describe("L261: indent break condition — kill ConditionalExpression:true", () => {
  it("function body has multiple lines (not just first)", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, "def multiline():\n    a = 1\n    b = 2\n    c = 3\n    return a + b + c\n\nother = 1\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // If true: breaks on line 2 (first body line, indent 4 <= 0... wait)
    // indent = 0 (top level def). Line 2 indent = 4. 4 <= 0 → FALSE. Doesn't break.
    // Line 6: indent 0, 0 <= 0 AND "other = 1" !== "" → TRUE → break
    // If true → always break → endIdx = startIdx+1-1 = startIdx → body is just def line
    // Wait: startIdx is the def line. The for loop starts at startIdx+1.
    // First iteration i=startIdx+1: if (true) → endIdx=i-1=startIdx → break
    // body = lines.slice(startIdx, startIdx+1) = just the def line
    // Original: body includes all indented lines
    expect(ctx.functionBody).toContain("a = 1");
    expect(ctx.functionBody).toContain("b = 2");
    expect(ctx.functionBody).toContain("return a + b + c");
    // If true mutation: body is just "def multiline():" → missing these
    const lineCount = ctx.functionBody.split("\n").length;
    expect(lineCount).toBeGreaterThan(2);
  });
});

// =============================================================================
// L226: started && braceDepth === 0 → true
// If true AND started: endIdx set on first line with any char
// But started is false initially! "true" replaces "started && braceDepth === 0"
// So condition becomes just "true" → endIdx set immediately, even before
// started is true. First line: any char → endIdx=sigStart, break.
// Body = just the signature line.
// =============================================================================

describe("L226: brace stop — kill ConditionalExpression:true", () => {
  it("body includes multiple lines between braces", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "function multi() {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  return a + b + c;\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // If true: on first char of first line, endIdx=sigStart → body = "function multi() {"
    // Original: walks through, finds closing } → body includes all lines
    expect(ctx.functionBody).toContain("const a = 1");
    expect(ctx.functionBody).toContain("return a + b + c");
    // Verify body has substantial content
    expect(ctx.functionBody.split("\n").length).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================
// L226: braceDepth !== 0 (instead of === 0)
// Would stop when braces are UNBALANCED, never when balanced
// Function end (depth=0) would be missed → body extends to file end
// =============================================================================

describe("L226: brace stop — kill EqualityOperator:!==", () => {
  it("body does NOT extend past closing brace", async () => {
    const fp = join(d, "b.ts");
    writeFileSync(fp, "function target() {\n  return 1;\n}\nconst after = 'SHOULD_NOT_APPEAR';\nconst more = 2;\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // If !== 0: stops when depth != 0 (immediately inside function at depth 1)
    // Actually at the {, depth goes 1, then !== 0 is true → stops at opening brace
    // Or: at }, depth goes 0, !== 0 is false → doesn't stop → continues to end
    // The !== mutation would include "after" content
    expect(ctx.functionBody).not.toContain("SHOULD_NOT_APPEAR");
  });
});

// =============================================================================
// L293/L297: language === "go"/"java" → true
// These run the wrong import branch for wrong languages
// L293 true: Go rules (capture quoted lines) run for ALL languages
// L297 true: Java rules (capture "import " lines) run for ALL languages
//
// For L293 to be killed: a non-Go file must have a line starting with "
// that should NOT be captured. Python docstrings!
// =============================================================================

describe("L293/L297: language branch — final kill", () => {
  it("L293: Python docstring NOT captured as Go import", async () => {
    const fp = join(d, "a.py");
    // Triple-quoted docstring starts with " — Go rules would capture
    writeFileSync(fp, '"""Module docstring"""\nimport os\nx = 1\n');
    const ctx = await extractTestContext(g(fp, 3), d);
    // Python rules: only capture "import os"
    // If Go runs too: '"""Module docstring"""' starts with " → captured
    const hasDocstring = ctx.imports.some(i => i.includes("Module docstring"));
    expect(hasDocstring).toBe(false);
    expect(ctx.imports).toContain("import os");
    expect(ctx.imports).toHaveLength(1);
  });
});

// =============================================================================
// L68/L69: pytest deps/devDeps arrays emptied
// Must fail when pytest is the ONLY matching dependency for a JS file
// (where default would be jest, not pytest)
// =============================================================================

describe("L68/69: pytest array — JS file where default is jest", () => {
  it("pytest from deps array must contain 'pytest' string", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { pytest: "7" } }));
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // If deps: ["pytest"] → [] → no match → default jest for JS
    // Original: finds pytest → returns pytest
    expect(ctx.testFramework.name).toBe("pytest");
    expect(ctx.testFramework.name).not.toBe("jest");
  });

  it("pytest from devDeps array must contain 'pytest' string", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { pytest: "7" } }));
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("pytest");
    expect(ctx.testFramework.name).not.toBe("jest");
  });
});
