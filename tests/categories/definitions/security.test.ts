import path from "path";
import { fileURLToPath } from "url";

import { describe, it, expect, beforeAll } from "vitest";

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

    it("loads csrf category", () => {
      expect(store.has("csrf")).toBe(true);
    });

    it("loads xxe category", () => {
      expect(store.has("xxe")).toBe(true);
    });

    it("loads command-injection category", () => {
      expect(store.has("command-injection")).toBe(true);
    });

    it("loads deserialization category", () => {
      expect(store.has("deserialization")).toBe(true);
    });

    it("loads ldap-injection category", () => {
      expect(store.has("ldap-injection")).toBe(true);
    });

    it("loads ssrf category", () => {
      expect(store.has("ssrf")).toBe(true);
    });

    it("loads timing-attack category", () => {
      expect(store.has("timing-attack")).toBe(true);
    });

    it("loads all security categories (including Arcanum Top 10 coverage)", () => {
      const securityCategories = store.byDomain("security");
      // Original 10 + 6 new categories for Arcanum Top 10 coverage:
      // hardcoded-secrets, auth-failures, rate-limiting, data-exposure, 
      // file-upload, dependency-risks
      expect(securityCategories.length).toBeGreaterThanOrEqual(15);
    });

    // Verify the new Arcanum Top 10 categories are loaded
    it("loads hardcoded-secrets category", () => {
      expect(store.has("hardcoded-secrets")).toBe(true);
    });

    it("loads auth-failures category", () => {
      expect(store.has("auth-failures")).toBe(true);
    });

    it("loads rate-limiting category", () => {
      expect(store.has("rate-limiting")).toBe(true);
    });

    it("loads data-exposure category", () => {
      expect(store.has("data-exposure")).toBe(true);
    });

    it("loads file-upload category", () => {
      expect(store.has("file-upload")).toBe(true);
    });

    it("loads dependency-risks category", () => {
      expect(store.has("dependency-risks")).toBe(true);
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

  describe("csrf category", () => {
    it("has correct metadata", () => {
      const result = store.get("csrf");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("CSRF");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("high");
      }
    });

    it("has detection patterns for CSRF exempt decorators", () => {
      const result = store.get("csrf");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("csrf-exempt"))).toBe(true);
      }
    });
  });

  describe("xxe category", () => {
    it("has correct metadata", () => {
      const result = store.get("xxe");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("XXE");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for XML parsing", () => {
      const result = store.get("xxe");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.pattern.includes("etree") || p.pattern.includes("xml"))).toBe(true);
      }
    });
  });

  describe("command-injection category", () => {
    it("has correct metadata", () => {
      const result = store.get("command-injection");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("Command Injection");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for os.system and subprocess", () => {
      const result = store.get("command-injection");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.pattern.includes("os\\.system") || p.pattern.includes("subprocess"))).toBe(true);
      }
    });
  });

  describe("deserialization category", () => {
    it("has correct metadata", () => {
      const result = store.get("deserialization");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("Deserialization");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for pickle and yaml", () => {
      const result = store.get("deserialization");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.pattern.includes("pickle"))).toBe(true);
        expect(patterns.some((p) => p.pattern.includes("yaml"))).toBe(true);
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

    it("finds csrf by searching 'token'", () => {
      const results = store.search({ query: "token" });
      expect(results.some((r) => r.category.id === "csrf")).toBe(true);
    });

    it("finds xxe by searching 'xml'", () => {
      const results = store.search({ query: "xml" });
      expect(results.some((r) => r.category.id === "xxe")).toBe(true);
    });

    it("finds command-injection by searching 'shell'", () => {
      const results = store.search({ query: "shell" });
      expect(results.some((r) => r.category.id === "command-injection")).toBe(true);
    });

    it("finds deserialization by searching 'pickle'", () => {
      const results = store.search({ query: "pickle" });
      expect(results.some((r) => r.category.id === "deserialization")).toBe(true);
    });

    it("finds ldap-injection by searching 'ldap'", () => {
      const results = store.search({ query: "ldap" });
      expect(results.some((r) => r.category.id === "ldap-injection")).toBe(true);
    });

    it("finds ssrf by searching 'request forgery'", () => {
      const results = store.search({ query: "request forgery" });
      expect(results.some((r) => r.category.id === "ssrf")).toBe(true);
    });

    it("finds timing-attack by searching 'timing'", () => {
      const results = store.search({ query: "timing" });
      expect(results.some((r) => r.category.id === "timing-attack")).toBe(true);
    });
  });

  describe("ldap-injection category", () => {
    it("has correct metadata", () => {
      const result = store.get("ldap-injection");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("LDAP");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for LDAP queries", () => {
      const result = store.get("ldap-injection");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.pattern.includes("ldap"))).toBe(true);
      }
    });
  });

  describe("ssrf category", () => {
    it("has correct metadata", () => {
      const result = store.get("ssrf");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("SSRF");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P0");
        expect(category.severity).toBe("critical");
      }
    });

    it("has detection patterns for HTTP requests", () => {
      const result = store.get("ssrf");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.pattern.includes("request") || p.pattern.includes("fetch"))).toBe(true);
      }
    });
  });

  describe("timing-attack category", () => {
    it("has correct metadata", () => {
      const result = store.get("timing-attack");
      expect(result.success).toBe(true);

      if (result.success) {
        const category = result.data;
        expect(category.name).toContain("Timing");
        expect(category.domain).toBe("security");
        expect(category.priority).toBe("P1");
        expect(category.severity).toBe("high");
      }
    });

    it("has detection patterns for secret comparison", () => {
      const result = store.get("timing-attack");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.pattern.includes("password") || p.pattern.includes("secret"))).toBe(true);
      }
    });
  });
});
