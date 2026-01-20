import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { resolve } from "path";
import {
  PatternMatcher,
  createPatternMatcher,
  detectLanguage,
  getSupportedExtensions,
  isExtensionSupported,
} from "../../../src/core/detection/pattern-matcher.js";
import type { DetectionPattern } from "../../../src/categories/schema/index.js";

// Test fixtures directory
const TEST_DIR = resolve(__dirname, ".temp-test-files");

// Sample detection patterns for testing
const SQL_INJECTION_PATTERNS: DetectionPattern[] = [
  {
    id: "python-fstring-execute",
    type: "regex",
    language: "python",
    pattern: "(execute|executemany)\\s*\\(\\s*f[\"']",
    confidence: "high",
    description: "Detects cursor.execute() with f-string interpolation",
  },
  {
    id: "python-concat-execute",
    type: "regex",
    language: "python",
    pattern: "(execute|executemany)\\s*\\(.*\\s*\\+\\s*",
    confidence: "medium",
    description: "Detects cursor.execute() with string concatenation",
  },
  {
    id: "ts-template-literal-query",
    type: "regex",
    language: "typescript",
    pattern: "(query|execute|run)\\s*\\(\\s*`.*\\$\\{",
    confidence: "high",
    description: "Detects database query with template literal interpolation",
  },
];

const XSS_PATTERNS: DetectionPattern[] = [
  {
    id: "ts-innerhtml-assignment",
    type: "regex",
    language: "typescript",
    pattern: "\\.innerHTML\\s*=",
    confidence: "high",
    description: "Detects direct innerHTML assignment",
  },
  {
    id: "python-render-string",
    type: "regex",
    language: "python",
    pattern: "render_template_string\\s*\\(",
    confidence: "medium",
    description: "Detects Flask render_template_string usage",
  },
];

const PATTERN_WITH_NEGATIVE: DetectionPattern[] = [
  {
    id: "pattern-with-filter",
    type: "regex",
    language: "typescript",
    pattern: "dangerouslySetInnerHTML",
    confidence: "high",
    description: "Detects React dangerouslySetInnerHTML",
    negativePattern: "sanitize|DOMPurify|escape",
  },
];

// Sample vulnerable code files
const VULNERABLE_PYTHON = `
import sqlite3

def get_user(user_id):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    
    # Vulnerable: f-string interpolation
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    
    return cursor.fetchone()

def search_users(name):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    
    # Vulnerable: string concatenation
    query = "SELECT * FROM users WHERE name = '" + name + "'"
    cursor.execute(query)
    
    return cursor.fetchall()
`;

const VULNERABLE_TS = `
import { db } from './database';

export async function getUser(userId: string) {
  // Vulnerable: template literal
  const result = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);
  return result.rows[0];
}

export function renderContent(content: string) {
  // Vulnerable: innerHTML
  document.getElementById('content').innerHTML = content;
}
`;

const SAFE_CODE = `
import { db } from './database';

export async function getUser(userId: string) {
  // Safe: parameterized query
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}

export function renderContent(content: string) {
  // Safe: textContent
  document.getElementById('content').textContent = content;
}
`;

const CODE_WITH_SANITIZATION = `
import DOMPurify from 'dompurify';

function renderHTML(content: string) {
  // Has dangerouslySetInnerHTML but also uses DOMPurify (negative pattern)
  const sanitized = DOMPurify.sanitize(content);
  element.dangerouslySetInnerHTML = { __html: sanitized };
}
`;

describe("PatternMatcher", () => {
  let matcher: PatternMatcher;

  beforeAll(async () => {
    // Create test directory structure
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(resolve(TEST_DIR, "src"), { recursive: true });
    await mkdir(resolve(TEST_DIR, "node_modules"), { recursive: true });
    await mkdir(resolve(TEST_DIR, ".git"), { recursive: true });

    // Write test files
    await writeFile(resolve(TEST_DIR, "vulnerable.py"), VULNERABLE_PYTHON);
    await writeFile(resolve(TEST_DIR, "vulnerable.ts"), VULNERABLE_TS);
    await writeFile(resolve(TEST_DIR, "safe.ts"), SAFE_CODE);
    await writeFile(resolve(TEST_DIR, "src", "app.ts"), VULNERABLE_TS);
    await writeFile(resolve(TEST_DIR, "sanitized.ts"), CODE_WITH_SANITIZATION);
    await writeFile(resolve(TEST_DIR, "node_modules", "lib.ts"), VULNERABLE_TS); // Should be excluded
    await writeFile(resolve(TEST_DIR, ".git", "config"), "git config");
    await writeFile(resolve(TEST_DIR, "readme.md"), "# Test"); // Non-code file
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    matcher = new PatternMatcher();
  });

  describe("scanFile", () => {
    it("detects SQL injection patterns in Python file", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "vulnerable.py"),
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("python");
        expect(result.data.matches.length).toBeGreaterThanOrEqual(1);

        // Check for f-string pattern match
        const fstringMatch = result.data.matches.find(
          (m) => m.pattern.id === "python-fstring-execute"
        );
        expect(fstringMatch).toBeDefined();
        expect(fstringMatch?.lineStart).toBe(9);
      }
    });

    it("detects SQL injection patterns in TypeScript file", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "vulnerable.ts"),
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("typescript");
        expect(result.data.matches.length).toBeGreaterThanOrEqual(1);

        const templateMatch = result.data.matches.find(
          (m) => m.pattern.id === "ts-template-literal-query"
        );
        expect(templateMatch).toBeDefined();
      }
    });

    it("detects XSS patterns", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "vulnerable.ts"),
        XSS_PATTERNS,
        { categoryId: "xss", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.matches.length).toBeGreaterThanOrEqual(1);

        const innerHTMLMatch = result.data.matches.find(
          (m) => m.pattern.id === "ts-innerhtml-assignment"
        );
        expect(innerHTMLMatch).toBeDefined();
      }
    });

    it("finds no matches in safe code", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "safe.ts"),
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.matches).toHaveLength(0);
      }
    });

    it("returns error for non-existent file", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "nonexistent.ts"),
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("File not found");
      }
    });

    it("includes code snippets with line numbers", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "vulnerable.py"),
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.matches.length > 0) {
        const match = result.data.matches[0];
        expect(match?.codeSnippet).toContain("|");
        expect(match?.codeSnippet).toContain(">");
      }
    });

    it("includes column positions in matches", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "vulnerable.ts"),
        XSS_PATTERNS,
        { categoryId: "xss", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.matches.length > 0) {
        const match = result.data.matches[0];
        expect(match?.columnStart).toBeGreaterThanOrEqual(0);
        expect(match?.columnEnd).toBeGreaterThan(match?.columnStart ?? 0);
      }
    });

    it("applies negative patterns to filter false positives", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "sanitized.ts"),
        PATTERN_WITH_NEGATIVE,
        { categoryId: "xss", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // The match should be filtered out because DOMPurify is in the context
        expect(result.data.matches).toHaveLength(0);
      }
    });

    it("reports scan time", async () => {
      const result = await matcher.scanFile(
        resolve(TEST_DIR, "vulnerable.py"),
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scanTimeMs).toBeGreaterThan(0);
      }
    });
  });

  describe("scanDirectory", () => {
    it("scans all files in directory", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        [...SQL_INJECTION_PATTERNS, ...XSS_PATTERNS],
        { categoryId: "security", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeGreaterThan(0);
      }
    });

    it("excludes node_modules by default", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const nodeModulesMatches = result.data.filter((r) =>
          r.filePath.includes("node_modules")
        );
        expect(nodeModulesMatches).toHaveLength(0);
      }
    });

    it("excludes .git by default", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const gitMatches = result.data.filter((r) => r.filePath.includes(".git"));
        expect(gitMatches).toHaveLength(0);
      }
    });

    it("scans subdirectories recursively", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const srcMatches = result.data.filter((r) => r.filePath.includes("/src/"));
        expect(srcMatches.length).toBeGreaterThan(0);
      }
    });

    it("respects maxDepth option", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "", maxDepth: 0 }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should not include files from subdirectories
        const srcMatches = result.data.filter((r) => r.filePath.includes("/src/"));
        expect(srcMatches).toHaveLength(0);
      }
    });

    it("filters by file extension", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        {
          categoryId: "sql-injection",
          basePath: "",
          includeExtensions: [".py"],
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const tsMatches = result.data.filter((r) => r.filePath.endsWith(".ts"));
        expect(tsMatches).toHaveLength(0);
      }
    });

    it("returns DetectionResult objects with all required fields", async () => {
      const result = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(result.success).toBe(true);
      if (result.success && result.data.length > 0) {
        const detection = result.data[0];
        expect(detection).toHaveProperty("patternId");
        expect(detection).toHaveProperty("categoryId");
        expect(detection).toHaveProperty("filePath");
        expect(detection).toHaveProperty("lineStart");
        expect(detection).toHaveProperty("lineEnd");
        expect(detection).toHaveProperty("codeSnippet");
        expect(detection).toHaveProperty("confidence");
      }
    });
  });

  describe("aggregateResults", () => {
    it("groups results by category", async () => {
      const scanResult = await matcher.scanDirectory(
        TEST_DIR,
        [...SQL_INJECTION_PATTERNS, ...XSS_PATTERNS],
        { categoryId: "security", basePath: "" }
      );

      expect(scanResult.success).toBe(true);
      if (scanResult.success) {
        const aggregated = matcher.aggregateResults(scanResult.data, 100);
        expect(aggregated.byCategory.size).toBeGreaterThan(0);
        expect(aggregated.totalMatches).toBe(scanResult.data.length);
      }
    });

    it("groups results by pattern", async () => {
      const scanResult = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(scanResult.success).toBe(true);
      if (scanResult.success) {
        const aggregated = matcher.aggregateResults(scanResult.data);
        expect(aggregated.byPattern.size).toBeGreaterThan(0);
      }
    });

    it("groups results by file", async () => {
      const scanResult = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(scanResult.success).toBe(true);
      if (scanResult.success) {
        const aggregated = matcher.aggregateResults(scanResult.data);
        expect(aggregated.byFile.size).toBeGreaterThan(0);
        expect(aggregated.filesWithMatches).toBe(aggregated.byFile.size);
      }
    });

    it("groups results by confidence", async () => {
      const scanResult = await matcher.scanDirectory(
        TEST_DIR,
        SQL_INJECTION_PATTERNS,
        { categoryId: "sql-injection", basePath: "" }
      );

      expect(scanResult.success).toBe(true);
      if (scanResult.success) {
        const aggregated = matcher.aggregateResults(scanResult.data);
        expect(aggregated.byConfidence.size).toBeGreaterThan(0);
      }
    });

    it("handles empty results", () => {
      const aggregated = matcher.aggregateResults([]);
      expect(aggregated.totalFiles).toBe(0);
      expect(aggregated.totalMatches).toBe(0);
      expect(aggregated.byCategory.size).toBe(0);
    });

    it("includes scan time", () => {
      const aggregated = matcher.aggregateResults([], 500);
      expect(aggregated.totalScanTimeMs).toBe(500);
    });
  });

  describe("createPatternMatcher", () => {
    it("creates a PatternMatcher instance", () => {
      const m = createPatternMatcher();
      expect(m).toBeInstanceOf(PatternMatcher);
    });

    it("accepts custom options", () => {
      const m = createPatternMatcher({
        maxFileSize: 1024,
        excludeDirs: ["custom_exclude"],
      });
      expect(m).toBeInstanceOf(PatternMatcher);
    });
  });

  describe("detectLanguage", () => {
    it("detects Python", () => {
      expect(detectLanguage("file.py")).toBe("python");
    });

    it("detects TypeScript", () => {
      expect(detectLanguage("file.ts")).toBe("typescript");
      expect(detectLanguage("file.tsx")).toBe("typescript");
    });

    it("detects JavaScript", () => {
      expect(detectLanguage("file.js")).toBe("javascript");
      expect(detectLanguage("file.jsx")).toBe("javascript");
    });

    it("detects Go", () => {
      expect(detectLanguage("file.go")).toBe("go");
    });

    it("detects Java", () => {
      expect(detectLanguage("file.java")).toBe("java");
    });

    it("detects Rust", () => {
      expect(detectLanguage("file.rs")).toBe("rust");
    });

    it("returns null for unknown extensions", () => {
      expect(detectLanguage("file.txt")).toBeNull();
      expect(detectLanguage("file.md")).toBeNull();
      expect(detectLanguage("file")).toBeNull();
    });

    it("handles uppercase extensions", () => {
      expect(detectLanguage("FILE.PY")).toBe("python");
      expect(detectLanguage("FILE.TS")).toBe("typescript");
    });
  });

  describe("getSupportedExtensions", () => {
    it("returns array of supported extensions", () => {
      const extensions = getSupportedExtensions();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions).toContain(".py");
      expect(extensions).toContain(".ts");
      expect(extensions).toContain(".js");
    });
  });

  describe("isExtensionSupported", () => {
    it("returns true for supported extensions", () => {
      expect(isExtensionSupported(".py")).toBe(true);
      expect(isExtensionSupported(".ts")).toBe(true);
      expect(isExtensionSupported(".js")).toBe(true);
    });

    it("returns false for unsupported extensions", () => {
      expect(isExtensionSupported(".txt")).toBe(false);
      expect(isExtensionSupported(".md")).toBe(false);
    });

    it("handles case insensitivity", () => {
      expect(isExtensionSupported(".PY")).toBe(true);
      expect(isExtensionSupported(".Ts")).toBe(true);
    });
  });
});

describe("edge cases", () => {
  let matcher: PatternMatcher;
  const EDGE_CASE_DIR = resolve(__dirname, ".edge-case-files");

  beforeAll(async () => {
    await mkdir(EDGE_CASE_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(EDGE_CASE_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    matcher = new PatternMatcher();
  });

  it("handles empty files", async () => {
    await writeFile(resolve(EDGE_CASE_DIR, "empty.py"), "");

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, "empty.py"),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matches).toHaveLength(0);
    }
  });

  it("handles files with only whitespace", async () => {
    await writeFile(resolve(EDGE_CASE_DIR, "whitespace.py"), "   \n\n   \n");

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, "whitespace.py"),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matches).toHaveLength(0);
    }
  });

  it("handles multiline matches", async () => {
    const multilineCode = `
cursor.execute(
  f"SELECT * FROM users WHERE id = '{user_id}'"
)
`;
    await writeFile(resolve(EDGE_CASE_DIR, "multiline.py"), multilineCode);

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, "multiline.py"),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matches.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles files with special characters in name", async () => {
    const fileName = "file-with-dashes_and_underscores.py";
    await writeFile(resolve(EDGE_CASE_DIR, fileName), VULNERABLE_PYTHON);

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, fileName),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matches.length).toBeGreaterThan(0);
    }
  });

  it("handles unicode content", async () => {
    const unicodeCode = `
# 用户认证 (User authentication)
def get_user(user_id):
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
`;
    await writeFile(resolve(EDGE_CASE_DIR, "unicode.py"), unicodeCode);

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, "unicode.py"),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matches.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles invalid regex patterns gracefully", async () => {
    const invalidPattern: DetectionPattern = {
      id: "invalid-regex",
      type: "regex",
      language: "python",
      pattern: "[invalid(regex", // Invalid regex
      confidence: "high",
      description: "This regex is invalid",
    };

    await writeFile(resolve(EDGE_CASE_DIR, "test.py"), VULNERABLE_PYTHON);

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, "test.py"),
      [invalidPattern],
      { categoryId: "test", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // Should not crash, just return no matches for invalid pattern
      expect(Array.isArray(result.data.matches)).toBe(true);
    }
  });

  it("handles multiple matches on same line", async () => {
    const multiMatchCode = `
cursor.execute(f"SELECT * FROM a"); cursor.execute(f"SELECT * FROM b")
`;
    await writeFile(resolve(EDGE_CASE_DIR, "multi-match.py"), multiMatchCode);

    const result = await matcher.scanFile(
      resolve(EDGE_CASE_DIR, "multi-match.py"),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matches.length).toBe(2);
    }
  });
});

describe("language cross-matching", () => {
  let matcher: PatternMatcher;
  const CROSS_MATCH_DIR = resolve(__dirname, ".cross-match-files");

  beforeAll(async () => {
    await mkdir(CROSS_MATCH_DIR, { recursive: true });
    await writeFile(resolve(CROSS_MATCH_DIR, "app.js"), VULNERABLE_TS);
  });

  afterAll(async () => {
    await rm(CROSS_MATCH_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    matcher = new PatternMatcher();
  });

  it("TypeScript patterns apply to JavaScript files", async () => {
    const result = await matcher.scanFile(
      resolve(CROSS_MATCH_DIR, "app.js"),
      SQL_INJECTION_PATTERNS,
      { categoryId: "sql-injection", basePath: "" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe("javascript");
      expect(result.data.matches.length).toBeGreaterThan(0);
    }
  });
});
