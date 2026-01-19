import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Security Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "security"));

    if (!result.success) {
      console.error("Failed to load security categories:", result.error);
    }
  });

  describe("loads all security categories", () => {
    it("loads sql-injection category", () => {
      expect(store.has("sql-injection")).toBe(true);
    });

    it("loads xss category", () => {
      expect(store.has("xss")).toBe(true);
    });

    it("loads path-traversal category", () => {
      expect(store.has("path-traversal")).toBe(true);
    });

    it("loads exactly 3 security categories", () => {
      const securityCategories = store.byDomain("security");
      expect(securityCategories).toHaveLength(3);
    });
  });

  describe("sql-injection category", () => {
    it("has correct metadata", () => {
      const result = store.get("sql-injection");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toBe("SQL Injection");
        expect(category.domain).toBe("security");
        expect(category.level).toBe("integration");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for Python and TypeScript", () => {
      const result = store.get("sql-injection");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has test templates for pytest and jest", () => {
      const result = store.get("sql-injection");
      if (result.success) {
        const templates = result.data.testTemplates;
        const pytestTemplates = templates.filter((t) => t.framework === "pytest");
        const jestTemplates = templates.filter((t) => t.framework === "jest");

        expect(pytestTemplates.length).toBeGreaterThan(0);
        expect(jestTemplates.length).toBeGreaterThan(0);
      }
    });

    it("has real-world examples", () => {
      const result = store.get("sql-injection");
      if (result.success) {
        const examples = result.data.examples;
        expect(examples.length).toBeGreaterThanOrEqual(3);

        // Each example should have vulnerable code and test code
        for (const example of examples) {
          expect(example.vulnerableCode.length).toBeGreaterThan(10);
          expect(example.testCode.length).toBeGreaterThan(10);
        }
      }
    });

    it("has CVE references", () => {
      const result = store.get("sql-injection");
      if (result.success) {
        expect(result.data.cves).toBeDefined();
        expect(result.data.cves?.length).toBeGreaterThan(0);
      }
    });
  });

  describe("xss category", () => {
    it("has correct metadata", () => {
      const result = store.get("xss");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("XSS");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for common XSS vectors", () => {
      const result = store.get("xss");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const patternIds = patterns.map((p) => p.id);

        // Should detect common XSS vectors
        expect(patternIds.some((id) => id.includes("innerhtml"))).toBe(true);
        expect(patternIds.some((id) => id.includes("dangerouslysetinnerhtml"))).toBe(true);
      }
    });
  });

  describe("path-traversal category", () => {
    it("has correct metadata", () => {
      const result = store.get("path-traversal");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("Path Traversal");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for file operations", () => {
      const result = store.get("path-traversal");
      if (result.success) {
        const patterns = result.data.detectionPatterns;

        // Should detect file read/write operations
        expect(patterns.some((p) => p.pattern.includes("open"))).toBe(true);
        expect(patterns.some((p) => p.pattern.includes("readFile"))).toBe(true);
      }
    });
  });

  describe("search functionality", () => {
    it("finds sql-injection by searching 'sql'", () => {
      const results = store.search({ query: "sql" });
      expect(results.some((r) => r.category.id === "sql-injection")).toBe(true);
    });

    it("finds xss by searching 'script'", () => {
      const results = store.search({ query: "script" });
      expect(results.some((r) => r.category.id === "xss")).toBe(true);
    });

    it("finds path-traversal by searching 'directory'", () => {
      const results = store.search({ query: "directory" });
      expect(results.some((r) => r.category.id === "path-traversal")).toBe(true);
    });
  });
});
