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

// =============================================================================
// DATABASE DETECTION (from imports/code)
// =============================================================================

const DB_PATTERNS: Array<[RegExp, string]> = [
  [/prisma|@prisma\/client/, "postgres"],
  [/pg\b|postgres|postgresql/, "postgres"],
  [/mysql2?["'\s]|from\s+["']mysql/, "mysql"],
  [/mongoose|mongodb|MongoClient/, "mongodb"],
  [/sqlite3|better-sqlite/, "sqlite"],
  [/sqlalchemy|psycopg2/, "postgres"],
  [/pymysql|mysqlclient/, "mysql"],
];

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
    const start = Math.max(0, idx - 10);
    const end = Math.min(lines.length, idx + 10);
    return { body: lines.slice(start, end).join("\n"), name: undefined };
  }

  if (language === "python") {
    return extractPythonFunction(lines, idx);
  }

  return extractBraceFunction(lines, idx);
}

function extractBraceFunction(lines: string[], targetIdx: number): { body: string; name: string | undefined } {
  // Walk backwards to find function start
  let startIdx = targetIdx;
  let braceDepth = 0;
  let foundOpenBrace = false;

  for (let i = targetIdx; i >= 0; i--) {
    const line = lines[i]!;
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
    const line = lines[i]!.trim();
    if (line.match(/^(export\s+)?(async\s+)?function\s|^(export\s+)?(const|let|var)\s+\w+\s*=|^\w+\s*\(|^(public|private|protected)\s/)) {
      sigStart = i;
      break;
    }
  }

  // Walk forward to find function end
  let endIdx = targetIdx;
  braceDepth = 0;
  let started = false;

  for (let i = sigStart; i < lines.length; i++) {
    const line = lines[i]!;
    for (const ch of line) {
      if (ch === "{") { braceDepth++; started = true; }
      if (ch === "}") braceDepth--;
      if (started && braceDepth === 0) {
        endIdx = i;
        break;
      }
    }
    if (started && braceDepth === 0) break;
  }

  const body = lines.slice(sigStart, endIdx + 1).join("\n");

  // Extract function name
  const sigLine = lines[sigStart]?.trim() ?? "";
  const nameMatch = sigLine.match(/function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=|(\w+)\s*\(/);
  const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3];

  return { body, name };
}

function extractPythonFunction(lines: string[], targetIdx: number): { body: string; name: string | undefined } {
  // Walk backwards to find def/class
  let startIdx = targetIdx;
  for (let i = targetIdx; i >= 0; i--) {
    if (lines[i]!.match(/^(\s*)def\s+\w+|^(\s*)class\s+\w+|^(\s*)async\s+def\s+\w+/)) {
      startIdx = i;
      break;
    }
  }

  // Walk forward to find end of function (next line with same or less indentation)
  const indent = (lines[startIdx]!.match(/^(\s*)/) ?? ["", ""])[1]!.length;
  let endIdx = targetIdx;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const lineIndent = (line.match(/^(\s*)/) ?? ["", ""])[1]!.length;
    if (lineIndent <= indent && line.trim() !== "") {
      endIdx = i - 1;
      break;
    }
    endIdx = i;
  }

  const body = lines.slice(startIdx, endIdx + 1).join("\n");
  const nameMatch = lines[startIdx]!.match(/def\s+(\w+)|class\s+(\w+)/);
  const name = nameMatch?.[1] ?? nameMatch?.[2];

  return { body, name };
}

// =============================================================================
// IMPORT EXTRACTION
// =============================================================================

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
      if (trimmed.startsWith("import ") || trimmed.match(/^const\s+\w+\s*=\s*require\(/)) {
        imports.push(trimmed);
      }
    } else if (language === "go") {
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
    if (existsSync(candidate)) {
      try {
        const content = await readFile(candidate, "utf-8");
        // Return first 50 lines as a style sample
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
