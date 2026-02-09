/**
 * Targeted mutation-killing tests for context.ts
 * 
 * Each test targets specific surviving mutants identified by Stryker.
 * Goal: kill every mutant in brace extraction, python extraction,
 * regex detection tables, and import extraction.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { extractTestContext } from "../../src/testgen/context.js";
import type { Gap } from "../../src/core/scanner/types.js";

function makeGap(filePath: string, lineStart: number, overrides: Partial<Gap> = {}): Gap {
  return {
    categoryId: "sql-injection", categoryName: "SQL Injection", domain: "security",
    level: "integration", priority: "P0", severity: "critical", confidence: "high",
    filePath, lineStart, lineEnd: lineStart, columnStart: 0, columnEnd: 0,
    codeSnippet: "", patternId: "test", patternType: "regex", priorityScore: 10,
    ...overrides,
  };
}

let testDir: string;
beforeEach(() => {
  testDir = join(tmpdir(), `pinata-mk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});
afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch {} });

// =============================================================================
// LINE 210: Function signature regex — every branch
// =============================================================================

describe("Function signature detection (line 210)", () => {
  it("matches 'export function' signature", async () => {
    const fp = join(testDir, "a.ts");
    writeFileSync(fp, `const preamble = 1;
export function getUserById(id: string) {
  return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("getUserById");
    expect(ctx.functionBody).toContain("export function getUserById");
  });

  it("matches 'export async function' signature", async () => {
    const fp = join(testDir, "b.ts");
    writeFileSync(fp, `export async function fetchUser(id: string) {
  return await db.get(id);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("fetchUser");
  });

  it("matches 'async function' (no export)", async () => {
    const fp = join(testDir, "c.ts");
    writeFileSync(fp, `async function internal(x: string) {
  return eval(x);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("internal");
  });

  it("matches 'export const' assignment", async () => {
    const fp = join(testDir, "d.ts");
    writeFileSync(fp, `export const handler = (req: Request) => {
  return eval(req.body);
};
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("handler");
  });

  it("matches bare 'const' assignment", async () => {
    const fp = join(testDir, "e.ts");
    writeFileSync(fp, `const process = (data: string) => {
  return eval(data);
};
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("process");
  });

  it("matches 'let' assignment", async () => {
    const fp = join(testDir, "f.ts");
    writeFileSync(fp, `let fn = function(x: string) {
  return eval(x);
};
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("fn");
  });

  it("matches 'var' assignment", async () => {
    const fp = join(testDir, "g.ts");
    writeFileSync(fp, `var legacy = function(x: string) {
  return eval(x);
};
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("legacy");
  });

  it("matches 'public' class method", async () => {
    const fp = join(testDir, "h.ts");
    writeFileSync(fp, `class Svc {
  public exec(cmd: string) {
    return require('child_process').execSync(cmd);
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionBody).toContain("public exec");
  });

  it("matches 'private' class method", async () => {
    const fp = join(testDir, "i.ts");
    writeFileSync(fp, `class Svc {
  private dangerous(x: string) {
    return eval(x);
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionBody).toContain("private dangerous");
  });

  it("matches 'protected' class method", async () => {
    const fp = join(testDir, "j.ts");
    writeFileSync(fp, `class Base {
  protected run(x: string) {
    return eval(x);
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionBody).toContain("protected run");
  });

  it("matches bare function call pattern (name followed by open paren)", async () => {
    const fp = join(testDir, "k.ts");
    writeFileSync(fp, `middleware(async (req, res) => {
  return eval(req.body);
});
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionBody).toContain("middleware");
  });
});

// =============================================================================
// LINE 238: Function name extraction regex
// =============================================================================

describe("Function name regex (line 238)", () => {
  it("extracts name from 'function NAME'", async () => {
    const fp = join(testDir, "a.ts");
    writeFileSync(fp, "function alpha() {\n  return 1;\n}\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("alpha");
  });

  it("extracts name from 'const NAME ='", async () => {
    const fp = join(testDir, "b.ts");
    writeFileSync(fp, "const beta = () => {\n  return 1;\n};\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("beta");
  });

  it("extracts name from 'let NAME ='", async () => {
    const fp = join(testDir, "c.ts");
    writeFileSync(fp, "let gamma = () => {\n  return 1;\n};\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("gamma");
  });

  it("extracts name from 'var NAME ='", async () => {
    const fp = join(testDir, "d.ts");
    writeFileSync(fp, "var delta = () => {\n  return 1;\n};\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("delta");
  });

  it("extracts name from 'NAME(' call pattern", async () => {
    const fp = join(testDir, "e.ts");
    writeFileSync(fp, "router(function() {\n  return 1;\n});\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("router");
  });
});

// =============================================================================
// LINES 190-232: Brace walking logic
// =============================================================================

describe("Brace walking correctness", () => {
  it("walks backward through } to find enclosing {", async () => {
    const fp = join(testDir, "a.ts");
    writeFileSync(fp, `function outer() {
  if (true) {
    console.log("inner");
  }
  const vuln = eval("x");
}
`);
    const ctx = await extractTestContext(makeGap(fp, 5), testDir);
    expect(ctx.functionBody).toContain("function outer");
    expect(ctx.functionBody).toContain("eval");
  });

  it("correctly counts brace depth with multiple blocks", async () => {
    const fp = join(testDir, "b.ts");
    writeFileSync(fp, `function test() {
  if (a) { x(); }
  if (b) { y(); }
  return eval("z");
}
`);
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.functionBody).toContain("function test");
  });

  it("finds end of function by walking forward with brace depth", async () => {
    const fp = join(testDir, "c.ts");
    writeFileSync(fp, `function first() {
  return eval("a");
}

function second() {
  return "safe";
}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionBody).toContain("function first");
    expect(ctx.functionBody).not.toContain("function second");
  });

  it("handles { and } on the same line", async () => {
    const fp = join(testDir, "d.ts");
    writeFileSync(fp, `function compact() { if (true) { return eval("x"); } }
`);
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.functionName).toBe("compact");
  });

  it("handles code with no braces at all", async () => {
    const fp = join(testDir, "e.ts");
    writeFileSync(fp, `const x = eval("danger");
const y = 2;
`);
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    // Should not crash, returns something
    expect(ctx.functionBody).toBeDefined();
    expect(ctx.functionBody.length).toBeGreaterThan(0);
  });

  it("signature search looks up to 5 lines before opening brace", async () => {
    const fp = join(testDir, "f.ts");
    // Signature must be within 5 lines of the brace for detection
    writeFileSync(fp, `export async function shortSig(arg: string) {
  return eval(arg);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionBody).toContain("shortSig");
    expect(ctx.functionName).toBe("shortSig");
  });
});

// =============================================================================
// LINE 248: Python def/class regex + indent logic
// =============================================================================

describe("Python extraction (line 248+)", () => {
  it("matches 'def name' at start of line", async () => {
    const fp = join(testDir, "a.py");
    writeFileSync(fp, "def vuln(x):\n    return eval(x)\n\ndef safe():\n    pass\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("vuln");
    expect(ctx.functionBody).not.toContain("safe");
  });

  it("matches 'class Name' at start of line", async () => {
    const fp = join(testDir, "b.py");
    writeFileSync(fp, "class Vuln:\n    x = eval('1')\n\nclass Safe:\n    pass\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("Vuln");
    expect(ctx.functionBody).not.toContain("Safe");
  });

  it("matches 'async def name'", async () => {
    const fp = join(testDir, "c.py");
    writeFileSync(fp, "async def fetch(url):\n    return await get(url)\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("fetch");
  });

  it("matches indented def (class method)", async () => {
    const fp = join(testDir, "d.py");
    writeFileSync(fp, "class Svc:\n    def method(self):\n        return eval('x')\n\n    def other(self):\n        pass\n");
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("method");
    expect(ctx.functionBody).not.toContain("other");
  });

  it("stops at next function with same indentation", async () => {
    const fp = join(testDir, "e.py");
    writeFileSync(fp, "def first():\n    x = 1\n    y = 2\n    return x + y\n\ndef second():\n    pass\n");
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("first");
    expect(ctx.functionBody).toContain("return x + y");
    expect(ctx.functionBody).not.toContain("second");
  });

  it("skips empty lines inside function body", async () => {
    const fp = join(testDir, "f.py");
    writeFileSync(fp, "def spaced():\n    a = 1\n\n    b = 2\n\n    return a + b\n\ndef next_fn():\n    pass\n");
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.functionName).toBe("spaced");
    expect(ctx.functionBody).toContain("return a + b");
  });

  it("handles deeply indented code", async () => {
    const fp = join(testDir, "g.py");
    writeFileSync(fp, "class A:\n    class B:\n        def deep(self):\n            return eval('x')\n");
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.functionName).toBe("deep");
  });
});

// =============================================================================
// LINES 279-305: Import extraction — every conditional branch
// =============================================================================

describe("Import extraction branches", () => {
  it("python: captures 'import x' but not 'x = import_thing'", async () => {
    const fp = join(testDir, "a.py");
    writeFileSync(fp, "import os\nx = import_thing\nfrom sys import path\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.imports).toContain("import os");
    expect(ctx.imports).toContain("from sys import path");
    expect(ctx.imports).not.toContain("x = import_thing");
  });

  it("typescript: captures 'import' but not 'const x = importThing'", async () => {
    const fp = join(testDir, "a.ts");
    writeFileSync(fp, 'import { x } from "y";\nconst z = importThing();\n');
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.imports).toHaveLength(1);
    expect(ctx.imports[0]).toContain("import");
  });

  it("go: captures 'import' keyword lines", async () => {
    const fp = join(testDir, "a.go");
    writeFileSync(fp, 'import "fmt"\npackage main\n');
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.imports.some(i => i.includes("fmt"))).toBe(true);
  });

  it("go: captures quoted imports inside import block", async () => {
    const fp = join(testDir, "b.go");
    writeFileSync(fp, 'package main\n\nimport (\n\t"fmt"\n\t"os"\n)\n\nfunc main() {}\n');
    const ctx = await extractTestContext(makeGap(fp, 8), testDir);
    expect(ctx.imports.some(i => i.includes('"fmt"'))).toBe(true);
  });

  it("java: captures 'import' statements", async () => {
    const fp = join(testDir, "A.java");
    writeFileSync(fp, 'import java.util.List;\npublic class A {}\n');
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.imports).toHaveLength(1);
    expect(ctx.imports[0]).toContain("java.util.List");
  });

  it("does not extract imports for rust (no handler)", async () => {
    const fp = join(testDir, "a.rs");
    writeFileSync(fp, 'use std::io;\nfn main() {}\n');
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.imports).toHaveLength(0);
  });
});

// =============================================================================
// REGEX DETECTION TABLES — remaining survivors
// =============================================================================

describe("Regex pattern survivors", () => {
  // Line 132: express require pattern
  it("detects express via require()", async () => {
    const fp = join(testDir, "a.ts");
    writeFileSync(fp, `const app = require("express");\nconst x = 1;\n`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.webFramework).toBe("express");
  });

  // Line 136-139: nextjs, flask, django, fastapi patterns
  it("detects nextjs from next/ import", async () => {
    const fp = join(testDir, "b.ts");
    writeFileSync(fp, `import Link from "next/link";\nconst x = 1;\n`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.webFramework).toBe("nextjs");
  });

  it("detects flask from 'import flask'", async () => {
    const fp = join(testDir, "c.py");
    writeFileSync(fp, "import flask\nx = 1\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.webFramework).toBe("flask");
  });

  it("detects django from 'import django'", async () => {
    const fp = join(testDir, "d.py");
    writeFileSync(fp, "import django\nx = 1\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.webFramework).toBe("django");
  });

  it("detects fastapi from 'import fastapi'", async () => {
    const fp = join(testDir, "e.py");
    writeFileSync(fp, "import fastapi\nx = 1\n");
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.webFramework).toBe("fastapi");
  });

  // Line 151: mysql pattern
  it("detects mysql from 'import mysql'", async () => {
    const fp = join(testDir, "f.ts");
    writeFileSync(fp, `import mysql from "mysql";\nconst x = 1;\n`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.dbType).toBe("mysql");
  });

  it("detects mysql2", async () => {
    const fp = join(testDir, "g.ts");
    writeFileSync(fp, `import mysql2 from "mysql2";\n`);
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.dbType).toBe("mysql");
  });
});

// =============================================================================
// FRAMEWORK INDICATOR ARRAYS — kill ArrayDeclaration mutants
// =============================================================================

describe("Framework indicator arrays", () => {
  it("detects vitest from vitest.config.js (not just .ts)", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(testDir, "vitest.config.js"), "export default {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("detects vitest from vitest.config.mts", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(testDir, "vitest.config.mts"), "export default {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("detects jest from jest.config.js", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(testDir, "jest.config.js"), "module.exports = {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("detects jest from jest.config.mjs", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(testDir, "jest.config.mjs"), "export default {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("detects pytest from conftest.py", async () => {
    writeFileSync(join(testDir, "conftest.py"), "# conftest");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("pytest");
  });

  it("detects mocha from .mocharc.yml", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(testDir, ".mocharc.yml"), "spec: test");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("mocha");
  });

  it("detects mocha from .mocharc.js", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "t" }));
    writeFileSync(join(testDir, ".mocharc.js"), "module.exports = {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("mocha");
  });
});

// =============================================================================
// EXISTING TEST: spec file and test/ directory (line 359-384)
// =============================================================================

describe("Existing test file locations", () => {
  it("finds .test.ts in same directory", async () => {
    writeFileSync(join(testDir, "api.ts"), "export const x = 1;\n");
    writeFileSync(join(testDir, "api.test.ts"), "test('x', () => {});\n");
    const ctx = await extractTestContext(makeGap(join(testDir, "api.ts"), 1), testDir);
    expect(ctx.existingTestSample).toBeDefined();
  });

  it("finds test in test/ directory (not tests/)", async () => {
    const srcDir = join(testDir, "src");
    const testDirPath = join(testDir, "test", "src");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testDirPath, { recursive: true });
    writeFileSync(join(srcDir, "api.ts"), "export const x = 1;\n");
    writeFileSync(join(testDirPath, "api.test.ts"), "test('x', () => {});\n");
    const ctx = await extractTestContext(makeGap(join(srcDir, "api.ts"), 1), testDir);
    expect(ctx.existingTestSample).toBeDefined();
  });

  it("returns first 50 lines of existing test", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `// line ${i + 1}`).join("\n");
    writeFileSync(join(testDir, "big.ts"), "export const x = 1;\n");
    writeFileSync(join(testDir, "big.test.ts"), lines);
    const ctx = await extractTestContext(makeGap(join(testDir, "big.ts"), 1), testDir);
    expect(ctx.existingTestSample).toContain("line 50");
    expect(ctx.existingTestSample).not.toContain("line 51");
  });
});

// =============================================================================
// FALLBACK LINE RANGE (line 170-174)
// =============================================================================

describe("Out-of-bounds line fallback", () => {
  it("returns surrounding lines for line beyond file end", async () => {
    const fp = join(testDir, "short.ts");
    writeFileSync(fp, "const a = 1;\nconst b = 2;\nconst c = 3;\n");
    const ctx = await extractTestContext(makeGap(fp, 100), testDir);
    expect(ctx.functionName).toBeUndefined();
    // Body is a best-effort slice, should exist
    expect(ctx.functionBody).toBeDefined();
  });

  it("returns surrounding lines for negative line", async () => {
    const fp = join(testDir, "neg.ts");
    writeFileSync(fp, "const a = 1;\n");
    const ctx = await extractTestContext(makeGap(fp, -10), testDir);
    expect(ctx.functionName).toBeUndefined();
  });
});
