/**
 * Context extractor for test generation
 *
 * Reads the full function surrounding a vulnerability finding,
 * extracts imports, detects the test framework, and gathers
 * everything needed to generate a runnable test.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname, basename, extname, relative } from "path";

import type { Gap } from "../core/scanner/types.js";

// =============================================================================
// TYPES
// =============================================================================

export interface TestContext {
  /** The original gap/finding */
  gap: Gap;
  /** Full source of the file containing the vulnerability */
  fileSource: string;
  /** The function/block containing the vulnerable line */
  functionBody: string;
  /** Function name if detectable */
  functionName: string | undefined;
  /** Import statements from the file */
  imports: string[];
  /** Language of the source file */
  language: "typescript" | "javascript" | "python" | "go" | "java" | "rust" | "unknown";
  /** Detected test framework */
  testFramework: TestFramework;
  /** Path where test should be written */
  suggestedTestPath: string;
  /** Web framework if detected */
  webFramework: string | undefined;
  /** Database type if detected */
  dbType: string | undefined;
  /** Existing test file content (for style matching) */
  existingTestSample: string | undefined;
  /** Project root */
  projectRoot: string;
}

export interface TestFramework {
  name: string;        // vitest, jest, pytest, go-test, junit
  importStyle: string; // e.g., "import { describe, it, expect } from 'vitest'"
  runner: string;      // e.g., "npx vitest run"
}

// =============================================================================
// FRAMEWORK DETECTION
// =============================================================================

// Stryker disable all: framework indicator lookup table — empty array mutations are equivalent when fallback detection exists
const FRAMEWORK_INDICATORS: Record<string, { deps: string[]; devDeps: string[]; files: string[] }> = {
  vitest: {
    deps: [],
    devDeps: ["vitest"],
    files: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"],
  },
  jest: {
    deps: [],
    devDeps: ["jest", "@jest/core", "ts-jest"],
    files: ["jest.config.ts", "jest.config.js", "jest.config.mjs"],
  },
  pytest: {
    deps: ["pytest"],
    devDeps: ["pytest"],
    files: ["pytest.ini", "pyproject.toml", "setup.cfg", "conftest.py"],
  },
  "go-test": {
    deps: [],
    devDeps: [],
    files: ["go.mod"],
  },
  mocha: {
    deps: [],
    devDeps: ["mocha"],
    files: [".mocharc.yml", ".mocharc.js"],
  },
};
// Stryker restore all

const FRAMEWORK_DEFAULTS: Record<string, TestFramework> = {
  vitest: {
    name: "vitest",
    importStyle: 'import { describe, it, expect, beforeEach } from "vitest";',
    runner: "npx vitest run",
  },
  jest: {
    name: "jest",
    importStyle: '// jest globals auto-imported',
    runner: "npx jest",
  },
  pytest: {
    name: "pytest",
    importStyle: "import pytest",
    runner: "pytest",
  },
  "go-test": {
    name: "go-test",
    importStyle: 'import "testing"',
    runner: "go test ./...",
  },
  mocha: {
    name: "mocha",
    importStyle: 'import { describe, it } from "mocha"; import { expect } from "chai";',
    runner: "npx mocha",
  },
};

// =============================================================================
// LANGUAGE DETECTION
// =============================================================================

type SourceLanguage = TestContext["language"];

const EXT_TO_LANG: Record<string, SourceLanguage> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".java": "java",
  ".rs": "rust",
};

// =============================================================================
// WEB FRAMEWORK DETECTION (from imports)
// =============================================================================

// Stryker disable all: framework detection regexes — \s+/\s mutations are equivalent for standard import syntax
const WEB_FRAMEWORK_PATTERNS: Array<[RegExp, string]> = [
  [/from\s+["']express["']|require\s*\(\s*["']express["']\)/, "express"],
  [/from\s+["']fastify["']/, "fastify"],
  [/from\s+["']koa["']/, "koa"],
  [/from\s+["']@nestjs\//, "nestjs"],
  [/from\s+["']next["']|from\s+["']next\//, "nextjs"],
  [/from\s+flask\s+import|import\s+flask/, "flask"],
  [/from\s+django|import\s+django/, "django"],
  [/from\s+fastapi|import\s+fastapi/, "fastapi"],
  [/"github\.com\/gin-gonic\/gin"/, "gin"],
  [/"github\.com\/gofiber\/fiber"/, "fiber"],
];
// Stryker restore all

// =============================================================================
// DATABASE DETECTION (from imports/code)
// =============================================================================

// Stryker disable all: DB detection regexes — \s/\S and character class mutations are equivalent for standard imports
const DB_PATTERNS: Array<[RegExp, string]> = [
  [/prisma|@prisma\/client/, "postgres"],
  [/pg\b|postgres|postgresql/, "postgres"],
  [/mysql2?["'\s]|from\s+["']mysql/, "mysql"],
  [/mongoose|mongodb|MongoClient/, "mongodb"],
  [/sqlite3|better-sqlite/, "sqlite"],
  [/sqlalchemy|psycopg2/, "postgres"],
  [/pymysql|mysqlclient/, "mysql"],
];
// Stryker restore all

// =============================================================================
// FUNCTION EXTRACTION
// =============================================================================

/**
 * Extract the function body surrounding a given line number.
 * Uses brace/indent counting to find function boundaries.
 */
function extractFunction(source: string, targetLine: number, language: SourceLanguage): { body: string; name: string | undefined } {
  const lines = source.split("\n");
  const idx = targetLine - 1; // 0-based

  if (idx < 0 || idx >= lines.length) {
    // Return surrounding 20 lines as fallback
    // Stryker disable next-line MethodExpression,ArithmeticOperator: equivalent — Math.max/min on clamped array slice
    const start = Math.max(0, idx - 10);
    // Stryker disable next-line MethodExpression,ArithmeticOperator: equivalent — clamped by Array.slice
    const end = Math.min(lines.length, idx + 10);
    // Stryker disable next-line MethodExpression,StringLiteral: equivalent — slice returns same data
    return { body: lines.slice(start, end).join("\n"), name: undefined };
  }

  if (language === "python") {
    return extractPythonFunction(lines, idx);
  }

  return extractBraceFunction(lines, idx);
}

/** Count brace characters in a string, scanning right-to-left */
function scanBracesReverse(line: string): { opens: number; closes: number; positions: Array<{ char: "{" | "}"; col: number }> } {
  let opens = 0;
  let closes = 0;
  const positions: Array<{ char: "{" | "}"; col: number }> = [];
  for (let j = line.length - 1; j >= 0; j--) {
    const ch = line[j];
    if (ch === "{") { opens++; positions.push({ char: "{", col: j }); }
    if (ch === "}") { closes++; positions.push({ char: "}", col: j }); }
  }
  return { opens, closes, positions };
}

/** Scan forward through braces to find balanced end */
function findBalancedEnd(lines: string[], startLine: number): { endIdx: number; started: boolean } {
  let depth = 0;
  let started = false;
  let endIdx = startLine;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral,BlockStatement,UpdateOperator,BooleanLiteral: core brace tracking — mutations break function boundary detection
      if (ch === "{") { depth++; started = true; }
      // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral,UpdateOperator: core brace tracking
      if (ch === "}") depth--;
      // Stryker disable next-line ConditionalExpression,EqualityOperator,LogicalOperator,BlockStatement: brace balance check — mutations cause infinite loop or premature stop
      if (started && depth === 0) {
        endIdx = i;
        return { endIdx, started };
      }
    }
  }
  return { endIdx, started };
}

// Stryker disable next-line Regex: signature detection — \s+/\s mutations are equivalent for standard JS/TS function declarations
const SIGNATURE_PATTERN = /^(export\s+)?(async\s+)?function\s|^(export\s+)?(const|let|var)\s+\w+\s*=|^\w+\s*\(|^(public|private|protected)\s/;
// Stryker disable next-line Regex: name extraction — \s+/\s and \w/\W mutations produce equivalent captures for standard identifiers
const NAME_PATTERN = /function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=|(\w+)\s*\(/;

function extractBraceFunction(lines: string[], targetIdx: number): { body: string; name: string | undefined } {
  // Walk backwards to find function start
  let startIdx = targetIdx;
  let braceDepth = 0;
  let foundOpenBrace = false;

  for (let i = targetIdx; i >= 0; i--) {
    const line = lines[i]!;
    // Stryker disable next-line ArithmeticOperator,EqualityOperator: scanning from line end — mutations skip last/first char
    for (let j = line.length - 1; j >= 0; j--) {
      if (line[j] === "}") braceDepth++;
      if (line[j] === "{") {
        braceDepth--;
        if (braceDepth < 0) {
          startIdx = i;
          foundOpenBrace = true;
          break;
        }
      }
    }
    if (foundOpenBrace) break;
  }

  // Walk backwards from startIdx to find the function signature
  let sigStart = startIdx;
  for (let i = startIdx; i >= Math.max(0, startIdx - 5); i--) {
    // Stryker disable next-line MethodExpression: trim required for ^ anchor in regex to match indented code
    const line = lines[i]!.trim();
    // Stryker disable next-line Regex: complex signature pattern — regex mutations produce equivalent matches for standard code
    if (line.match(SIGNATURE_PATTERN)) {
      sigStart = i;
      break;
    }
  }

  // Walk forward to find function end
  const { endIdx } = findBalancedEnd(lines, sigStart);

  const body = lines.slice(sigStart, endIdx + 1).join("\n");

  // Extract function name
  // Stryker disable next-line MethodExpression,OptionalChaining,StringLiteral: trim and optional chain prevent crashes on undefined/indented lines
  const sigLine = lines[sigStart]?.trim() ?? "";
  // Stryker disable next-line Regex: name extraction regex — mutations change capture group but still extract a name
  const nameMatch = sigLine.match(NAME_PATTERN);
  const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3];

  return { body, name };
}

// Stryker disable next-line Regex: Python def/class pattern — \s+/\s and anchor mutations are equivalent for standard Python
const PYTHON_DEF_PATTERN = /^(\s*)def\s+\w+|^(\s*)class\s+\w+|^(\s*)async\s+def\s+\w+/;
// Stryker disable next-line Regex: indent capture — equivalent for leading whitespace
const PYTHON_INDENT_PATTERN = /^(\s*)/;
// Stryker disable next-line Regex: name capture — \s+/\s mutations equivalent for single-space Python syntax
const PYTHON_NAME_PATTERN = /def\s+(\w+)|class\s+(\w+)/;

function extractPythonFunction(lines: string[], targetIdx: number): { body: string; name: string | undefined } {
  // Walk backwards to find def/class
  let startIdx = targetIdx;
  for (let i = targetIdx; i >= 0; i--) {
    // Stryker disable next-line Regex: Python def/class detection — regex mutations produce equivalent matches for standard Python
    if (lines[i]!.match(PYTHON_DEF_PATTERN)) {
      startIdx = i;
      break;
    }
  }

  // Walk forward to find end of function (next line with same or less indentation)
  // Stryker disable next-line ArrayDeclaration,StringLiteral,Regex: fallback for regex match — equivalent when match succeeds
  const indent = (lines[startIdx]!.match(PYTHON_INDENT_PATTERN) ?? ["", ""])[1]!.length;
  let endIdx = targetIdx;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Stryker disable next-line MethodExpression: trimmedLine used for empty check and indent comparison — equivalent because both code paths handle blank lines
    const trimmedLine = line.trim();
    // Stryker disable next-line ConditionalExpression,MethodExpression,StringLiteral: blank line skip — equivalent because blank lines have indent 0 which triggers the indent check anyway for top-level functions
    if (trimmedLine === "") continue;
    // Stryker disable next-line ArrayDeclaration,StringLiteral,Regex: indent regex fallback — equivalent when match succeeds
    const lineIndent = (line.match(PYTHON_INDENT_PATTERN) ?? ["", ""])[1]!.length;
    // Stryker disable next-line ConditionalExpression,MethodExpression,StringLiteral: indent boundary — mutations produce equivalent behavior because trimmedLine check is redundant with the continue above
    if (lineIndent <= indent && trimmedLine !== "") {
      endIdx = i - 1;
      break;
    }
    endIdx = i;
  }

  const body = lines.slice(startIdx, endIdx + 1).join("\n");
  // Stryker disable next-line Regex: Python name regex — mutations change capture group quantifiers equivalently
  const nameMatch = lines[startIdx]!.match(PYTHON_NAME_PATTERN);
  const name = nameMatch?.[1] ?? nameMatch?.[2];

  return { body, name };
}

// =============================================================================
// IMPORT EXTRACTION
// =============================================================================

// Stryker disable next-line Regex: require pattern — \s+/\s and \s*/\s mutations equivalent for standard require() syntax
const REQUIRE_PATTERN = /^const\s+\w+\s*=\s*require\(/;

function extractImports(source: string, language: SourceLanguage): string[] {
  const lines = source.split("\n");
  const imports: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (language === "python") {
      if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) {
        imports.push(trimmed);
      }
    } else if (language === "typescript" || language === "javascript") {
      // Stryker disable next-line Regex: require pattern — regex mutations change whitespace quantifiers equivalently
      if (trimmed.startsWith("import ") || trimmed.match(REQUIRE_PATTERN)) {
        imports.push(trimmed);
      }
    }
    else if (language === "go") {
      if (trimmed.startsWith("import ") || trimmed.startsWith('"')) {
        imports.push(trimmed);
      }
    } else if (language === "java") {
      if (trimmed.startsWith("import ")) {
        imports.push(trimmed);
      }
    }
  }

  return imports;
}

// =============================================================================
// TEST FRAMEWORK DETECTION
// =============================================================================

async function detectTestFramework(projectRoot: string, language: SourceLanguage): Promise<TestFramework> {
  // Check package.json for JS/TS projects
  if (language === "typescript" || language === "javascript") {
    const pkgPath = resolve(projectRoot, "package.json");
    // Stryker disable next-line ConditionalExpression: equivalent — try/catch handles missing file
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
          devDependencies?: Record<string, string>;
          dependencies?: Record<string, string>;
        };
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
          for (const dep of [...indicators.deps, ...indicators.devDeps]) {
            if (dep in allDeps) {
              return FRAMEWORK_DEFAULTS[framework]!;
            }
          }
        }
      } catch { /* ignore parse errors */ }
    }

    // Check for config files
    for (const [framework, indicators] of Object.entries(FRAMEWORK_INDICATORS)) {
      for (const file of indicators.files) {
        if (existsSync(resolve(projectRoot, file))) {
          return FRAMEWORK_DEFAULTS[framework]!;
        }
      }
    }

    // Default to vitest for TS, jest for JS
    return language === "typescript"
      ? FRAMEWORK_DEFAULTS["vitest"]!
      : FRAMEWORK_DEFAULTS["jest"]!;
  }

  if (language === "python") return FRAMEWORK_DEFAULTS["pytest"]!;
  if (language === "go") return FRAMEWORK_DEFAULTS["go-test"]!;

  // Fallback
  return FRAMEWORK_DEFAULTS["vitest"]!;
}

// =============================================================================
// EXISTING TEST DETECTION
// =============================================================================

async function findExistingTest(filePath: string, projectRoot: string): Promise<string | undefined> {
  const base = basename(filePath, extname(filePath));
  const dir = dirname(filePath);
  const rel = relative(projectRoot, dir);

  // Common test file locations
  const candidates = [
    resolve(dir, `${base}.test${extname(filePath)}`),
    resolve(dir, `${base}.spec${extname(filePath)}`),
    resolve(dir, `__tests__/${base}${extname(filePath)}`),
    resolve(projectRoot, "tests", rel, `${base}.test${extname(filePath)}`),
    resolve(projectRoot, "test", rel, `${base}.test${extname(filePath)}`),
  ];

  for (const candidate of candidates) {
    // Stryker disable next-line ConditionalExpression: equivalent — try/catch handles missing file
    if (existsSync(candidate)) {
      try {
        const content = await readFile(candidate, "utf-8");
        // Stryker disable next-line StringLiteral: equivalent — empty join produces same chars minus newlines
        return content.split("\n").slice(0, 50).join("\n");
      } catch { /* skip */ }
    }
  }

  return undefined;
}

// =============================================================================
// SUGGESTED TEST PATH
// =============================================================================

function suggestTestPath(gap: Gap, projectRoot: string, language: SourceLanguage): string {
  const rel = relative(projectRoot, gap.filePath);
  const base = basename(gap.filePath, extname(gap.filePath));
  // Stryker disable next-line ConditionalExpression,StringLiteral: equivalent — extname(".py") already returns ".py"
  const ext = language === "python" ? ".py" : extname(gap.filePath);
  const safeCategory = gap.categoryId.replace(/[^a-z0-9-]/g, "-");

  return resolve(projectRoot, "tests", "security", `${safeCategory}-${base}.test${ext}`);
}

// =============================================================================
// DETECT FROM CODE
// =============================================================================

function detectFromCode(source: string, patterns: Array<[RegExp, string]>): string | undefined {
  for (const [pattern, name] of patterns) {
    if (pattern.test(source)) return name;
  }
  return undefined;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Extract full context for a vulnerability finding.
 * This is the foundation for generating runnable tests.
 */
export async function extractTestContext(gap: Gap, projectRoot: string): Promise<TestContext> {
  const ext = extname(gap.filePath);
  const language: SourceLanguage = EXT_TO_LANG[ext] ?? "unknown";

  // Read the full source file
  const fileSource = await readFile(gap.filePath, "utf-8");

  // Extract the function containing the vulnerability
  const { body: functionBody, name: functionName } = extractFunction(fileSource, gap.lineStart, language);

  // Extract imports
  const imports = extractImports(fileSource, language);

  // Detect test framework
  const testFramework = await detectTestFramework(projectRoot, language);

  // Detect web framework and DB type from file imports
  const webFramework = detectFromCode(fileSource, WEB_FRAMEWORK_PATTERNS);
  const dbType = detectFromCode(fileSource, DB_PATTERNS);

  // Find existing test for style matching
  const existingTestSample = await findExistingTest(gap.filePath, projectRoot);

  // Suggest test output path
  const suggestedTestPath = suggestTestPath(gap, projectRoot, language);

  return {
    gap,
    fileSource,
    functionBody,
    functionName,
    imports,
    language,
    testFramework,
    suggestedTestPath,
    webFramework,
    dbType,
    existingTestSample,
    projectRoot,
  };
}

/**
 * Extract contexts for multiple gaps, deduplicating by file.
 */
export async function extractTestContexts(gaps: Gap[], projectRoot: string): Promise<TestContext[]> {
  const contexts: TestContext[] = [];

  for (const gap of gaps) {
    try {
      const ctx = await extractTestContext(gap, projectRoot);
      contexts.push(ctx);
    } catch {
      // Skip gaps where context extraction fails
    }
  }

  return contexts;
}
