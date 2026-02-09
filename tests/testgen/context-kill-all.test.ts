/**
 * Kill every remaining non-regex mutant.
 *
 * Strategy: each test creates conditions where ONLY the original code
 * passes and the mutated code fails. The key is creating inputs where
 * the mutation produces a *different observable outcome*.
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
beforeEach(() => { d = join(tmpdir(), `ka-${Date.now()}-${Math.random().toString(36).slice(2)}`); mkdirSync(d, { recursive: true }); });
afterEach(() => { try { rmSync(d, { recursive: true, force: true }); } catch {} });

// =============================================================================
// L173: Math.min → Math.max
// Need: idx+10 > lines.length, so min clamps but max doesn't
// File: 5 lines. lineStart=100 → idx=99. min(6,109)=6. max(6,109)=109.
// slice(89,6)=empty vs slice(89,109)=some content. But 89>6 so both empty.
// Better: file 25 lines. lineStart=30 → idx=29 >=26. Fallback.
// start=max(0,29-10)=19. end_orig=min(26,39)=26. end_mut=max(26,39)=39.
// slice(19,26) has 7 lines. slice(19,39) has 7 lines too (clamped by array).
// The difference: with max, slice doesn't crash but returns same thing.
// Actually: lines.slice(19, 39) just returns everything from 19 to end.
// So the body would be the same. This mutant may be equivalent.
// BUT: we can test with a file where idx+10 < lines.length
// file 100 lines. lineStart=20 → idx=19. In bounds, no fallback.
// We need idx OUT of bounds with idx+10 < lines.length
// file 100 lines. lineStart=105 → idx=104 >= 101. Fallback.
// start=max(0,94)=94. end_orig=min(101,114)=101. end_mut=max(101,114)=114.
// slice(94,101) = lines 95-101 (7 lines)
// slice(94,114) = lines 95-101 (same, array clamps)
// These are equivalent! The mutant IS equivalent for this function.
// Mark as equivalent and move on.
// =============================================================================

// =============================================================================
// L192: line.length + 1 (instead of -1) and j > 0 (instead of >= 0)
// line.length + 1: j starts past the string, first iteration j-- = length,
// then accesses line[length] which is undefined. Undefined !== "{" so it 
// just skips that char. The loop still works, just wastes one iteration.
// j > 0: skips position 0. If only brace is at position 0, it's missed.
// =============================================================================

describe("L192: j>=0 boundary — brace at col 0", () => {
  it("finds { at column 0 when it's the only brace on the line", async () => {
    const fp = join(d, "a.ts");
    // Line 2 has { at position 0 and nothing else
    writeFileSync(fp, "function f()\n{\n  return eval('x');\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // If j > 0 instead of j >= 0, the { at position 0 is missed
    // and the backward walk fails to find the function start
    expect(ctx.functionBody).toContain("function f");
    // More specific: the body must START with or contain "function f"
    // not just be the inner block
    const hasSignature = ctx.functionBody.includes("function f()");
    expect(hasSignature).toBe(true);
  });
});

// =============================================================================
// L209: lines[i]!.trim() → lines[i]! (no trim)
// Signature matching uses ^ anchors. Without trim, indented signatures fail.
// Need: a function declaration with LEADING WHITESPACE where the signature
// regex uses ^ anchor. "  function foo()" trimmed = "function foo()" matches.
// Untrimmed = "  function foo()" which does NOT match ^function.
// =============================================================================

describe("L209: trim on signature search", () => {
  it("matches indented 'function' by trimming before regex test", async () => {
    const fp = join(d, "a.ts");
    // 4-space indented function. Without trim, ^function doesn't match "    function"
    writeFileSync(fp, "class C {\n    function method() {\n        return eval('x');\n    }\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // The signature must be found despite indentation
    expect(ctx.functionName).toBe("method");
  });

  it("matches indented 'const' by trimming before regex test", async () => {
    const fp = join(d, "b.ts");
    writeFileSync(fp, "class C {\n    const handler = () => {\n        return eval('x');\n    };\n}\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    expect(ctx.functionName).toBe("handler");
  });
});

// =============================================================================
// L226: started && braceDepth === 0 → true / braceDepth !== 0
// true: endIdx set on EVERY line → body is just first line after sigStart
// !== 0: endIdx NEVER set → body extends to end of file
// =============================================================================

describe("L226: stop condition specificity", () => {
  it("body includes lines BETWEEN braces (not just first line)", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "function f() {\n  const a = 1;\n  const b = 2;\n  return a + b;\n}\nconst after = 99;\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // If ConditionalExpression:true → endIdx=sigStart on first iteration → body is "function f() {"
    expect(ctx.functionBody).toContain("const a = 1");
    expect(ctx.functionBody).toContain("const b = 2");
    expect(ctx.functionBody).toContain("return a + b");
    // If braceDepth !== 0 → never stops → includes "after"
    expect(ctx.functionBody).not.toContain("const after");
  });
});

// =============================================================================
// L237: lines[sigStart]?.trim() → lines[sigStart] / lines[sigStart].trim
// MethodExpression: returns the line WITHOUT trim (has spaces)
// OptionalChaining: crashes if lines[sigStart] is undefined
// The test needs sigStart to reference a line with leading spaces
// AND the name regex to depend on trimmed content
// =============================================================================

describe("L237: sigLine trim and optional chain", () => {
  it("extracts name from indented signature (trim required for regex)", async () => {
    const fp = join(d, "a.ts");
    writeFileSync(fp, "  function indentedFn() {\n    return 1;\n  }\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    // name regex: /function\s+(\w+)/ matches "function indentedFn"
    // Without trim: "  function indentedFn" — regex has no ^ so still matches
    // But the match position changes. Let's verify name is correct regardless.
    expect(ctx.functionName).toBe("indentedFn");
  });
});

// =============================================================================
// L259: if (line.trim() === "") continue
// false: never skip → blank lines treated as code → function body cut short
// MethodExpression (line): "  " !== "" is true → blank line NOT skipped
// StringLiteral ("Stryker was here!"): line.trim() === "Stryker..." → never matches → never skip
// All three: blank lines within Python function body must be skipped
// =============================================================================

describe("L259: Python blank line skip — all three mutations", () => {
  it("body extends past blank lines with spaces", async () => {
    const fp = join(d, "a.py");
    // Line 3: "    " (spaces only). trim() === "" → skip.
    // Without skip: indent 4 <= 0 → function ends. Body = just line 2.
    writeFileSync(fp, "def f():\n    first = 1\n    \n    second = 2\n    return first + second\n\nmodule = 1\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("second = 2");
    expect(ctx.functionBody).toContain("return first + second");
    expect(ctx.functionBody).not.toContain("module = 1");
  });

  it("body extends past completely empty lines", async () => {
    const fp = join(d, "b.py");
    // Line 3: "" (truly empty). trim() === "" → skip.
    writeFileSync(fp, "def g():\n    a = 1\n\n    b = 2\n    return b\n\nx = 3\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("return b");
    expect(ctx.functionBody).not.toContain("x = 3");
  });

  it("body extends past multiple consecutive blank lines", async () => {
    const fp = join(d, "c.py");
    writeFileSync(fp, "def h():\n    x = 1\n\n\n\n    y = 2\n    return x + y\n\nz = 3\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("y = 2");
    expect(ctx.functionBody).toContain("return x + y");
  });
});

// =============================================================================
// L261: if (lineIndent <= indent && line.trim() !== "") 
// true: always breaks → body is empty (just the def line)
// MethodExpression (line instead of line.trim()): "  " !== "" is true
//   but it's a blank line with indent, should have been skipped by L259
// StringLiteral ("Stryker was here!"): line.trim() !== "Stryker..." always true → always breaks
// =============================================================================

describe("L261: indent boundary — all three mutations", () => {
  it("does NOT stop when inner code is more indented", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, "def f():\n    if True:\n        deep = eval('x')\n    return deep\n\ntop = 1\n");
    const ctx = await extractTestContext(g(fp, 3), d);
    // If ConditionalExpression:true → stops at line 2 (indent 4 <= 0)
    expect(ctx.functionBody).toContain("return deep");
  });

  it("stops exactly when indent decreases to function level", async () => {
    const fp = join(d, "b.py");
    writeFileSync(fp, "def first():\n    a = 1\n    return a\ndef second():\n    pass\n");
    const ctx = await extractTestContext(g(fp, 2), d);
    expect(ctx.functionBody).toContain("return a");
    expect(ctx.functionBody).not.toContain("second");
  });
});

// =============================================================================
// L293: language === "go" → true
// If true: Go import rules run for Python/TS/Java files
// Go captures lines starting with " — a Python file with a quoted string
// at line start would be incorrectly captured as an import
// =============================================================================

describe("L293: Go branch guard", () => {
  it("Python file: quoted string at line start is NOT captured as import", async () => {
    const fp = join(d, "a.py");
    writeFileSync(fp, '"docstring"\nimport os\nx = 1\n');
    const ctx = await extractTestContext(g(fp, 3), d);
    // Python import rules: capture 'import os'. NOT the docstring.
    // If Go branch runs: '"docstring"' starts with " → captured as import
    expect(ctx.imports).toContain("import os");
    expect(ctx.imports).not.toContain('"docstring"');
  });

  it("TypeScript file: string on its own line is NOT Go import", async () => {
    const fp = join(d, "b.ts");
    writeFileSync(fp, '"use strict";\nimport { x } from "y";\n');
    const ctx = await extractTestContext(g(fp, 2), d);
    // TS rules: "use strict" doesn't start with 'import' → not captured
    // Go rules would capture it (starts with ")
    expect(ctx.imports).toHaveLength(1);
    expect(ctx.imports[0]).toContain("import { x }");
  });
});

// =============================================================================
// L297: language === "java" → true
// If true: Java import rules run for Go/Python/TS files
// Java captures "import " lines — but TS also captures "import " lines
// so this is only distinguishable for Go files where import has different meaning
// =============================================================================

describe("L297: Java branch guard", () => {
  it("Go file: 'import' line handled by Go rules (not Java)", async () => {
    const fp = join(d, "a.go");
    writeFileSync(fp, 'package main\nimport "fmt"\nfunc main() {}\n');
    const ctx = await extractTestContext(g(fp, 3), d);
    // Both Go and Java rules capture 'import "fmt"' — hard to distinguish
    // But Go ALSO captures quoted lines. If Java runs instead, those are missed.
    expect(ctx.imports.some(i => i.includes("import"))).toBe(true);
  });
});

// =============================================================================
// L294: trimmed.startsWith('"') → trimmed.endsWith('"')
// Go import: `"fmt"` starts AND ends with ". Mutation is equivalent for this input.
// But: `import "fmt"` starts with 'i', not '"'. And '"fmt"' starts AND ends with ".
// To kill endsWith mutation: need a Go line that starts with " but doesn't end with "
// =============================================================================

describe("L294: startsWith vs endsWith", () => {
  it("Go: captures line starting with quote even if not ending with quote", async () => {
    const fp = join(d, "a.go");
    // import with alias: no closing quote at end (comment after)
    writeFileSync(fp, 'package main\nimport (\n\t"fmt" // standard library\n)\nfunc main() {}\n');
    const ctx = await extractTestContext(g(fp, 5), d);
    // The trimmed line is: `"fmt" // standard library` — starts with " but doesn't end with "
    // startsWith('"') → true (captured). endsWith('"') → false (not captured).
    expect(ctx.imports.some(i => i.includes("fmt"))).toBe(true);
  });
});

// =============================================================================
// L315: if (existsSync(pkgPath)) → true
// If true: always tries to read package.json → crashes on nonexistent
// We need a test where package.json does NOT exist and verify no crash
// =============================================================================

describe("L315: existsSync package.json guard", () => {
  it("gracefully handles missing package.json (does not crash)", async () => {
    // Ensure NO package.json in test dir
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    // If existsSync → true: readFile throws → catch handles it
    // Actually the catch {} swallows. So it won't crash either way.
    // The difference: if true + file missing → JSON.parse fails → catch → continue
    // vs existsSync false → skip entirely → continue
    // Both paths reach the same outcome. This mutant may be equivalent.
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework).toBeDefined();
  });
});

// =============================================================================
// L374: if (existsSync(candidate)) → true
// If true: tries to read every candidate path → readFile throws → catch → continue
// Same pattern: the catch makes it equivalent. But we can verify that when
// a file exists, it IS read.
// =============================================================================

describe("L374: existsSync test file guard", () => {
  it("reads existing test file (existsSync true path works)", async () => {
    writeFileSync(join(d, "x.ts"), "export const x = 1;\n");
    writeFileSync(join(d, "x.test.ts"), "describe('x', () => {});\n");
    const ctx = await extractTestContext(g(join(d, "x.ts"), 1), d);
    expect(ctx.existingTestSample).toContain("describe");
  });

  it("returns undefined when no test file exists (false path works)", async () => {
    writeFileSync(join(d, "lonely.ts"), "x\n");
    const ctx = await extractTestContext(g(join(d, "lonely.ts"), 1), d);
    expect(ctx.existingTestSample).toBeUndefined();
  });
});

// =============================================================================
// L393: language === "python" ? ".py" : extname(gap.filePath)
// false: always uses extname → Python gets ".py" from extname anyway!
// "": empty extension → test path becomes "...test" with no extension
// =============================================================================

describe("L393: Python extension ternary", () => {
  it("Python test path ends with .test.py (not empty)", async () => {
    const fp = join(d, "app.py"); writeFileSync(fp, "x=1\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // If false: extname("app.py") = ".py" → same result! Equivalent for .py files.
    // If "": extension is "" → path ends ".test" 
    expect(ctx.suggestedTestPath).toMatch(/\.test\.py$/);
    expect(ctx.suggestedTestPath).not.toMatch(/\.test$/);
  });

  it("non-Python uses source extension (not .py)", async () => {
    const fp = join(d, "app.tsx"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // If false: extname("app.tsx") = ".tsx" → correct for non-Python
    // The ConditionalExpression:false is actually equivalent here too
    // because extname returns the right thing for both Python and non-Python
    expect(ctx.suggestedTestPath).toMatch(/\.test\.tsx$/);
  });
});

// =============================================================================
// L59/60/68/69: Array/String mutations in FRAMEWORK_INDICATORS
// These survive because our tests detect vitest from devDeps AND from
// config files. If devDeps array is emptied, config file fallback kicks in.
// To kill: test where ONLY devDeps works (no config files present).
// =============================================================================

describe("Framework arrays: devDeps-only detection", () => {
  it("vitest detected from devDeps when no config file exists", async () => {
    // Only devDeps, no vitest.config.* files
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { vitest: "4.0.0" } }));
    const fp = join(d, "t.ts"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // If devDeps: ["vitest"] → [] (emptied), vitest not found from deps
    // No config files → falls to default (vitest for TS). Same result!
    // This IS equivalent for TS. For JS, default is jest.
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("vitest detected from devDeps for JS file (not jest default)", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { vitest: "4.0.0" } }));
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // JS default is jest. If vitest devDeps array emptied → falls to default → jest (WRONG)
    // With vitest in devDeps → vitest (CORRECT)
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("pytest detected from deps for JS file (not jest default)", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { pytest: "7" } }));
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // JS default is jest. If pytest deps emptied → jest. With pytest → pytest.
    expect(ctx.testFramework.name).toBe("pytest");
  });

  it("pytest detected from devDeps for JS file", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { pytest: "7" } }));
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("pytest");
  });

  it("vitest config file detection works when no deps match", async () => {
    writeFileSync(join(d, "package.json"), JSON.stringify({ name: "test" }));
    writeFileSync(join(d, "vitest.config.ts"), "export default {};");
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    // If files array emptied → no config detection → falls to jest default
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("vitest string must be exactly 'vitest' (not empty)", async () => {
    // If string mutated to "": dep check looks for "" in allDeps
    // JSON keys can't be empty string in normal packages, so "" won't match
    writeFileSync(join(d, "package.json"), JSON.stringify({ devDependencies: { vitest: "4" } }));
    const fp = join(d, "t.js"); writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(g(fp, 1), d);
    expect(ctx.testFramework.name).toBe("vitest");
  });
});
