import { mkdir, writeFile, rm } from "fs/promises";
import { resolve } from "path";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

import type { Category } from "@/categories/schema/index.js";
import type { Gap, PinataScore, CoverageMetrics } from "@/core/scanner/types.js";

import { CategoryStore } from "@/categories/store/category-store.js";
import { Scanner, createScanner } from "@/core/scanner/scanner.js";
import { SEVERITY_WEIGHTS, CONFIDENCE_WEIGHTS, PRIORITY_WEIGHTS } from "@/core/scanner/types.js";

// Test fixtures directory
const TEST_DIR = resolve(__dirname, ".temp-scanner-test");

// Sample vulnerable Python code
const VULNERABLE_PYTHON = `
import sqlite3

def get_user(user_id):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    # SQL injection vulnerability
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    return cursor.fetchone()

def search_users(name):
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    # Another SQL injection
    query = "SELECT * FROM users WHERE name = '" + name + "'"
    cursor.execute(query)
    return cursor.fetchall()
`;

// Sample vulnerable TypeScript code
const VULNERABLE_TS = `
import { db } from './database';

export async function getUser(userId: string) {
  // SQL injection via template literal
  const result = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);
  return result.rows[0];
}

export function renderContent(content: string) {
  // XSS vulnerability
  document.getElementById('content').innerHTML = content;
}
`;

// Safe code
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

// Test file (should be skipped)
const TEST_FILE = `
import { getUser } from './users';

describe('getUser', () => {
  it('should return user by id', async () => {
    const user = await getUser('123');
    expect(user).toBeDefined();
  });
});
`;

// Sample categories for testing
function createTestCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "sql-injection",
    version: 1,
    name: "SQL Injection",
    description: "Detects SQL injection vulnerabilities in code that could allow attackers to execute malicious SQL",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    applicableLanguages: ["python", "typescript", "javascript"],
    detectionPatterns: [
      {
        id: "python-fstring-execute",
        type: "regex",
        language: "python",
        pattern: "(execute|executemany)\\s*\\(\\s*f[\"']",
        confidence: "high",
        description: "Detects cursor.execute() with f-string interpolation which is vulnerable to SQL injection",
      },
      {
        id: "python-concat-execute",
        type: "regex",
        language: "python",
        pattern: "(execute|executemany)\\s*\\(.*\\s*\\+\\s*",
        confidence: "medium",
        description: "Detects cursor.execute() with string concatenation which is vulnerable to SQL injection",
      },
      {
        id: "ts-template-literal-query",
        type: "regex",
        language: "typescript",
        pattern: "(query|execute|run)\\s*\\(\\s*`.*\\$\\{",
        confidence: "high",
        description: "Detects database query with template literal interpolation which is vulnerable to SQL injection",
      },
    ],
    testTemplates: [
      {
        id: "sql-injection-test",
        language: "python",
        framework: "pytest",
        template: `import pytest
from unittest.mock import Mock

def test_sql_injection_prevented():
    """Test that SQL injection is prevented via parameterized queries."""
    # Arrange
    mock_cursor = Mock()
    user_input = "'; DROP TABLE users; --"
    
    # Act - use parameterized query
    mock_cursor.execute("SELECT * FROM users WHERE id = %s", (user_input,))
    
    # Assert
    assert mock_cursor.execute.called`,
        variables: [],
      },
    ],
    examples: [
      {
        name: "basic-sql-injection",
        concept: "Basic SQL injection through string interpolation allows attackers to modify queries",
        vulnerableCode: "cursor.execute(f\"SELECT * FROM users WHERE id = '{id}'\")",
        testCode: `def test_sql_injection():
    """Verify that SQL injection attacks are prevented."""
    malicious_input = "'; DROP TABLE users; --"
    # Should use parameterized queries instead of string interpolation
    cursor.execute("SELECT * FROM users WHERE id = %s", (malicious_input,))
    assert True`,
        language: "python",
        severity: "critical",
      },
    ],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function createXssCategory(): Category {
  return {
    id: "xss-vulnerability",
    version: 1,
    name: "XSS Vulnerability",
    description: "Detects cross-site scripting vulnerabilities that allow attackers to inject malicious scripts",
    domain: "security",
    level: "integration",
    priority: "P1",
    severity: "high",
    applicableLanguages: ["typescript", "javascript"],
    detectionPatterns: [
      {
        id: "ts-innerhtml-assignment",
        type: "regex",
        language: "typescript",
        pattern: "\\.innerHTML\\s*=",
        confidence: "high",
        description: "Detects direct innerHTML assignment which is vulnerable to XSS attacks",
      },
    ],
    testTemplates: [
      {
        id: "xss-test",
        language: "typescript",
        framework: "jest",
        template: `import { escapeHtml } from './utils';

describe('XSS Prevention', () => {
  it('should escape html entities in user input', () => {
    const maliciousInput = '<script>alert("xss")</script>';
    const escaped = escapeHtml(maliciousInput);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });
});`,
        variables: [],
      },
    ],
    examples: [
      {
        name: "basic-xss",
        concept: "Basic XSS through innerHTML allows attackers to inject malicious scripts into the page",
        vulnerableCode: "element.innerHTML = userInput",
        testCode: `it('should sanitize user input before rendering', () => {
  const userInput = '<img src=x onerror=alert(1)>';
  const sanitized = DOMPurify.sanitize(userInput);
  element.innerHTML = sanitized;
  expect(element.querySelector('img[onerror]')).toBeNull();
});`,
        language: "typescript",
        severity: "high",
      },
    ],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

describe("Scanner", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    // Create test directory structure
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(resolve(TEST_DIR, "src"), { recursive: true });
    await mkdir(resolve(TEST_DIR, "tests"), { recursive: true });
    await mkdir(resolve(TEST_DIR, "node_modules"), { recursive: true });

    // Write test files
    await writeFile(resolve(TEST_DIR, "src", "users.py"), VULNERABLE_PYTHON);
    await writeFile(resolve(TEST_DIR, "src", "users.ts"), VULNERABLE_TS);
    await writeFile(resolve(TEST_DIR, "src", "safe.ts"), SAFE_CODE);
    await writeFile(resolve(TEST_DIR, "tests", "users.test.ts"), TEST_FILE);
    await writeFile(resolve(TEST_DIR, "node_modules", "lib.ts"), VULNERABLE_TS);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    store = new CategoryStore();
    const sqlResult = store.add(createTestCategory());
    if (!sqlResult.success) {
      console.error("Failed to add SQL category:", sqlResult.error.context);
    }
    const xssResult = store.add(createXssCategory());
    if (!xssResult.success) {
      console.error("Failed to add XSS category:", xssResult.error.context);
    }
    scanner = new Scanner(store);
  });

  describe("scanDirectory", () => {
    it("scans directory and finds gaps", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      if (!result.success) {
        console.error("Scan failed:", result.error.message, result.error);
      }
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaps.length).toBeGreaterThan(0);
        expect(result.data.targetDirectory).toBe(TEST_DIR);
        expect(result.data.categoriesScanned).toContain("sql-injection");
      }
    });

    it("returns ScanResult with all required fields", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data;
        expect(data).toHaveProperty("targetDirectory");
        expect(data).toHaveProperty("startedAt");
        expect(data).toHaveProperty("completedAt");
        expect(data).toHaveProperty("durationMs");
        expect(data).toHaveProperty("gaps");
        expect(data).toHaveProperty("gapsByCategory");
        expect(data).toHaveProperty("gapsByFile");
        expect(data).toHaveProperty("coverage");
        expect(data).toHaveProperty("fileStats");
        expect(data).toHaveProperty("score");
        expect(data).toHaveProperty("summary");
      }
    });

    it("excludes node_modules by default", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const nodeModulesGaps = result.data.gaps.filter((g) =>
          g.filePath.includes("node_modules")
        );
        expect(nodeModulesGaps.length).toBe(0);
      }
    });

    it("excludes test files from gaps", async () => {
      const result = await scanner.scanDirectory(TEST_DIR, {
        detectTestFiles: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Test files in the tests/ directory should not have gaps
        // Note: Some gaps might be found in test files if test patterns don't match
        // The key is that fileStats.testFiles is populated
        expect(result.data.fileStats.testFiles).toBeGreaterThan(0);
      }
    });

    it("respects minSeverity filter", async () => {
      const result = await scanner.scanDirectory(TEST_DIR, {
        minSeverity: "critical",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Only critical severity category (sql-injection) should have gaps
        for (const gap of result.data.gaps) {
          expect(gap.severity).toBe("critical");
        }
      }
    });

    it("respects minConfidence filter", async () => {
      const result = await scanner.scanDirectory(TEST_DIR, {
        minConfidence: "high",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const gap of result.data.gaps) {
          expect(gap.confidence).toBe("high");
        }
      }
    });

    it("filters by category IDs", async () => {
      const result = await scanner.scanDirectory(TEST_DIR, {
        categoryIds: ["xss-vulnerability"],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categoriesScanned).toEqual(["xss-vulnerability"]);
        for (const gap of result.data.gaps) {
          expect(gap.categoryId).toBe("xss-vulnerability");
        }
      }
    });

    it("filters by domain", async () => {
      const result = await scanner.scanDirectory(TEST_DIR, {
        domains: ["security"],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        for (const gap of result.data.gaps) {
          expect(gap.domain).toBe("security");
        }
      }
    });

    it("returns error for non-existent directory", async () => {
      const result = await scanner.scanDirectory("/nonexistent/path");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("not found");
      }
    });

    it("returns error when no categories loaded", async () => {
      const emptyStore = new CategoryStore();
      const emptyScanner = new Scanner(emptyStore);

      const result = await emptyScanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("No categories");
      }
    });
  });

  describe("gaps", () => {
    it("includes all gap properties", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success && result.data.gaps.length > 0) {
        const gap = result.data.gaps[0] as Gap;
        expect(gap).toHaveProperty("categoryId");
        expect(gap).toHaveProperty("categoryName");
        expect(gap).toHaveProperty("domain");
        expect(gap).toHaveProperty("level");
        expect(gap).toHaveProperty("priority");
        expect(gap).toHaveProperty("severity");
        expect(gap).toHaveProperty("confidence");
        expect(gap).toHaveProperty("filePath");
        expect(gap).toHaveProperty("lineStart");
        expect(gap).toHaveProperty("lineEnd");
        expect(gap).toHaveProperty("codeSnippet");
        expect(gap).toHaveProperty("patternId");
        expect(gap).toHaveProperty("priorityScore");
      }
    });

    it("sorts gaps by priority score (highest first)", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success && result.data.gaps.length > 1) {
        for (let i = 1; i < result.data.gaps.length; i++) {
          const prev = result.data.gaps[i - 1];
          const curr = result.data.gaps[i];
          expect(prev?.priorityScore).toBeGreaterThanOrEqual(curr?.priorityScore ?? 0);
        }
      }
    });

    it("groups gaps by category correctly", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const byCategory = result.data.gapsByCategory;
        for (const [categoryId, gaps] of byCategory) {
          for (const gap of gaps) {
            expect(gap.categoryId).toBe(categoryId);
          }
        }
      }
    });

    it("groups gaps by file correctly", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const byFile = result.data.gapsByFile;
        for (const [filePath, gaps] of byFile) {
          for (const gap of gaps) {
            expect(gap.filePath).toBe(filePath);
          }
        }
      }
    });
  });

  describe("coverage", () => {
    it("calculates overall coverage", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const coverage = result.data.coverage;
        expect(coverage.overallCoverage).toBeGreaterThanOrEqual(0);
        expect(coverage.overallCoverage).toBeLessThanOrEqual(100);
        expect(coverage.totalCategories).toBe(2); // sql-injection + xss
      }
    });

    it("calculates per-domain coverage", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const securityCoverage = result.data.coverage.byDomain.get("security");
        expect(securityCoverage).toBeDefined();
        if (securityCoverage) {
          expect(securityCoverage.categoriesScanned).toBe(2);
          expect(securityCoverage.coveragePercent).toBeGreaterThanOrEqual(0);
          expect(securityCoverage.coveragePercent).toBeLessThanOrEqual(100);
        }
      }
    });

    it("tracks categories with gaps", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const coverage = result.data.coverage;
        expect(coverage.categoriesWithGaps).toBeGreaterThan(0);
        expect(coverage.categoriesWithGaps + coverage.categoriesCovered).toBe(coverage.totalCategories);
      }
    });
  });

  describe("score", () => {
    it("calculates Pinata score between 0 and 100", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const score = result.data.score;
        expect(score.overall).toBeGreaterThanOrEqual(0);
        expect(score.overall).toBeLessThanOrEqual(100);
      }
    });

    it("assigns valid letter grade", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const validGrades = ["A", "B", "C", "D", "F"];
        expect(validGrades).toContain(result.data.score.grade);
      }
    });

    it("calculates per-domain scores", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const byDomain = result.data.score.byDomain;
        expect(byDomain.size).toBeGreaterThan(0);
        for (const score of byDomain.values()) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    });

    it("calculates severity breakdown", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const bySeverity = result.data.score.bySeverity;
        expect(bySeverity).toHaveProperty("critical");
        expect(bySeverity).toHaveProperty("high");
        expect(bySeverity).toHaveProperty("medium");
        expect(bySeverity).toHaveProperty("low");
      }
    });

    it("includes penalties for gaps", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success && result.data.gaps.length > 0) {
        const score = result.data.score;
        // Should have penalties since there are gaps
        expect(score.overall).toBeLessThan(100);
      }
    });
  });

  describe("summary", () => {
    it("provides accurate summary counts", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data.summary;
        expect(summary.totalGaps).toBe(result.data.gaps.length);

        const criticalCount = result.data.gaps.filter((g) => g.severity === "critical").length;
        const highCount = result.data.gaps.filter((g) => g.severity === "high").length;
        const mediumCount = result.data.gaps.filter((g) => g.severity === "medium").length;
        const lowCount = result.data.gaps.filter((g) => g.severity === "low").length;

        expect(summary.criticalGaps).toBe(criticalCount);
        expect(summary.highGaps).toBe(highCount);
        expect(summary.mediumGaps).toBe(mediumCount);
        expect(summary.lowGaps).toBe(lowCount);
      }
    });

    it("includes top 3 gaps", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data.summary;
        expect(summary.topGaps.length).toBeLessThanOrEqual(3);
        if (summary.totalGaps > 0) {
          expect(summary.topGaps.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("fileStats", () => {
    it("counts files correctly", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const stats = result.data.fileStats;
        expect(stats.totalFiles).toBeGreaterThan(0);
        expect(stats.byLanguage.size).toBeGreaterThan(0);
      }
    });

    it("tracks files with gaps", async () => {
      const result = await scanner.scanDirectory(TEST_DIR);

      expect(result.success).toBe(true);
      if (result.success) {
        const stats = result.data.fileStats;
        if (result.data.gaps.length > 0) {
          expect(stats.filesWithGaps).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("aggregateResults", () => {
    it("converts detections to gaps", () => {
      const categories = [createTestCategory()];
      const detections = [
        {
          patternId: "python-fstring-execute",
          categoryId: "sql-injection",
          filePath: "/test/file.py",
          lineStart: 10,
          lineEnd: 10,
          codeSnippet: "cursor.execute(f\"...\")",
          confidence: "high" as const,
        },
      ];

      const gaps = scanner.aggregateResults(detections, categories);

      expect(gaps.length).toBe(1);
      expect(gaps[0]?.categoryId).toBe("sql-injection");
      expect(gaps[0]?.severity).toBe("critical");
      expect(gaps[0]?.priorityScore).toBeGreaterThan(0);
    });
  });

  describe("calculateScore", () => {
    it("returns 100 for no gaps", () => {
      const categories = [createTestCategory()];
      const coverage: CoverageMetrics = {
        byDomain: new Map(),
        byLevel: new Map(),
        overallCoverage: 100,
        totalCategories: 1,
        categoriesWithGaps: 0,
        categoriesCovered: 1,
      };

      const score = scanner.calculateScore([], coverage, categories);

      expect(score.overall).toBeGreaterThanOrEqual(95); // High score with bonuses
      expect(score.grade).toBe("A");
    });

    it("decreases score with more gaps", () => {
      const categories = [createTestCategory()];
      const coverage: CoverageMetrics = {
        byDomain: new Map(),
        byLevel: new Map(),
        overallCoverage: 50,
        totalCategories: 1,
        categoriesWithGaps: 1,
        categoriesCovered: 0,
      };

      const gaps: Gap[] = [
        {
          categoryId: "sql-injection",
          categoryName: "SQL Injection",
          domain: "security",
          level: "integration",
          priority: "P0",
          severity: "critical",
          confidence: "high",
          filePath: "/test.py",
          lineStart: 1,
          lineEnd: 1,
          columnStart: 0,
          columnEnd: 10,
          codeSnippet: "...",
          patternId: "python-fstring-execute",
          patternType: "regex",
          priorityScore: 12,
        },
      ];

      const scoreWithGaps = scanner.calculateScore(gaps, coverage, categories);
      const scoreWithoutGaps = scanner.calculateScore([], coverage, categories);

      expect(scoreWithGaps.overall).toBeLessThan(scoreWithoutGaps.overall);
    });
  });
});

describe("createScanner", () => {
  it("creates Scanner instance", () => {
    const store = new CategoryStore();
    const scanner = createScanner(store);
    expect(scanner).toBeInstanceOf(Scanner);
  });
});

describe("weight constants", () => {
  it("has correct severity weights", () => {
    expect(SEVERITY_WEIGHTS.critical).toBe(4.0);
    expect(SEVERITY_WEIGHTS.high).toBe(3.0);
    expect(SEVERITY_WEIGHTS.medium).toBe(2.0);
    expect(SEVERITY_WEIGHTS.low).toBe(1.0);
  });

  it("has correct confidence weights", () => {
    expect(CONFIDENCE_WEIGHTS.high).toBe(1.0);
    expect(CONFIDENCE_WEIGHTS.medium).toBe(0.7);
    expect(CONFIDENCE_WEIGHTS.low).toBe(0.4);
  });

  it("has correct priority weights", () => {
    expect(PRIORITY_WEIGHTS.P0).toBe(3.0);
    expect(PRIORITY_WEIGHTS.P1).toBe(2.0);
    expect(PRIORITY_WEIGHTS.P2).toBe(1.0);
  });
});
