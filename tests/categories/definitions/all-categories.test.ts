import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";
import type { Category } from "@/categories/schema/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

/**
 * Integration test for all category definitions.
 * Validates schema compliance, uniqueness, and completeness.
 */
describe("All Category Definitions Integration", () => {
  let store: CategoryStore;
  let allCategories: Category[];

  // Expected category counts per domain
  // Note: security increased from 10 to 16 with Arcanum Top 10 coverage
  // (added: hardcoded-secrets, auth-failures, rate-limiting, data-exposure, file-upload, dependency-risks)
  const EXPECTED_COUNTS = {
    security: 16,
    data: 8,
    concurrency: 6,
    input: 3,
    resource: 3,
    reliability: 6,
    performance: 3,
  };

  const TOTAL_EXPECTED = Object.values(EXPECTED_COUNTS).reduce((a, b) => a + b, 0);

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(DEFINITIONS_PATH);

    if (!result.success) {
      console.error("Failed to load categories:", result.error);
      throw new Error(`Failed to load categories: ${result.error.message}`);
    }

    allCategories = store.toArray();
  });

  describe("loading", () => {
    it("loads all categories successfully", () => {
      expect(allCategories.length).toBeGreaterThan(0);
    });

    it(`loads expected total count (${TOTAL_EXPECTED} categories)`, () => {
      expect(allCategories.length).toBe(TOTAL_EXPECTED);
    });

    it("loads expected count per domain", () => {
      for (const [domain, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
        const domainCategories = store.byDomain(domain as any);
        expect(domainCategories.length).toBe(expectedCount);
      }
    });
  });

  describe("uniqueness", () => {
    it("has no duplicate category IDs across all domains", () => {
      const ids = allCategories.map((c) => c.id);
      const uniqueIds = new Set(ids);

      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

      expect(duplicates.length).toBe(0);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("has unique detection pattern IDs within each category", () => {
      for (const category of allCategories) {
        const patternIds = category.detectionPatterns.map((p) => p.id);
        const uniquePatternIds = new Set(patternIds);

        expect(uniquePatternIds.size).toBe(patternIds.length);
      }
    });

    it("has unique example names within each category", () => {
      for (const category of allCategories) {
        const exampleNames = category.examples.map((e) => e.name);
        const uniqueNames = new Set(exampleNames);

        expect(uniqueNames.size).toBe(exampleNames.length);
      }
    });
  });

  describe("required fields", () => {
    it("every category has valid ID format", () => {
      const idPattern = /^[a-z][a-z0-9-]*$/;

      for (const category of allCategories) {
        expect(category.id).toMatch(idPattern);
      }
    });

    it("every category has name and description", () => {
      for (const category of allCategories) {
        expect(category.name.length).toBeGreaterThan(0);
        expect(category.description.length).toBeGreaterThan(10);
      }
    });

    it("every category has valid domain", () => {
      const validDomains = [
        "security", "data", "concurrency", "input",
        "resource", "reliability", "performance", "platform",
        "business", "compliance"
      ];

      for (const category of allCategories) {
        expect(validDomains).toContain(category.domain);
      }
    });

    it("every category has valid level", () => {
      const validLevels = ["unit", "integration", "system", "chaos"];

      for (const category of allCategories) {
        expect(validLevels).toContain(category.level);
      }
    });

    it("every category has valid priority", () => {
      const validPriorities = ["P0", "P1", "P2"];

      for (const category of allCategories) {
        expect(validPriorities).toContain(category.priority);
      }
    });

    it("every category has valid severity", () => {
      const validSeverities = ["critical", "high", "medium", "low"];

      for (const category of allCategories) {
        expect(validSeverities).toContain(category.severity);
      }
    });

    it("every category has at least one applicable language", () => {
      for (const category of allCategories) {
        expect(category.applicableLanguages.length).toBeGreaterThan(0);
      }
    });

    it("every category has version number", () => {
      for (const category of allCategories) {
        expect(category.version).toBeGreaterThan(0);
      }
    });
  });

  describe("detection patterns", () => {
    it("every category has at least 3 detection patterns", () => {
      for (const category of allCategories) {
        expect(category.detectionPatterns.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("every detection pattern has valid type", () => {
      const validTypes = ["ast", "regex", "semantic"];

      for (const category of allCategories) {
        for (const pattern of category.detectionPatterns) {
          expect(validTypes).toContain(pattern.type);
        }
      }
    });

    it("every detection pattern has valid confidence", () => {
      const validConfidences = ["high", "medium", "low"];

      for (const category of allCategories) {
        for (const pattern of category.detectionPatterns) {
          expect(validConfidences).toContain(pattern.confidence);
        }
      }
    });

    it("every detection pattern has non-empty pattern string", () => {
      for (const category of allCategories) {
        for (const pattern of category.detectionPatterns) {
          expect(pattern.pattern.length).toBeGreaterThan(0);
        }
      }
    });

    it("every detection pattern has description", () => {
      for (const category of allCategories) {
        for (const pattern of category.detectionPatterns) {
          expect(pattern.description.length).toBeGreaterThan(10);
        }
      }
    });

    it("categories have patterns for multiple languages", () => {
      for (const category of allCategories) {
        const languages = new Set(category.detectionPatterns.map((p) => p.language));
        expect(languages.size).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("test templates", () => {
    it("every category has at least 2 test templates", () => {
      for (const category of allCategories) {
        expect(category.testTemplates.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("every category has pytest template", () => {
      for (const category of allCategories) {
        const hasPytest = category.testTemplates.some((t) => t.framework === "pytest");
        expect(hasPytest).toBe(true);
      }
    });

    it("every category has jest template", () => {
      for (const category of allCategories) {
        const hasJest = category.testTemplates.some((t) => t.framework === "jest");
        expect(hasJest).toBe(true);
      }
    });

    it("every template has non-empty template content", () => {
      for (const category of allCategories) {
        for (const template of category.testTemplates) {
          expect(template.template.length).toBeGreaterThan(50);
        }
      }
    });

    it("every template has variables defined", () => {
      for (const category of allCategories) {
        for (const template of category.testTemplates) {
          expect(template.variables.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("examples", () => {
    it("every category has at least 3 examples", () => {
      for (const category of allCategories) {
        expect(category.examples.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("every example has concept description", () => {
      for (const category of allCategories) {
        for (const example of category.examples) {
          expect(example.concept.length).toBeGreaterThan(20);
        }
      }
    });

    it("every example has vulnerable code", () => {
      for (const category of allCategories) {
        for (const example of category.examples) {
          expect(example.vulnerableCode.length).toBeGreaterThan(10);
        }
      }
    });

    it("every example has test code", () => {
      for (const category of allCategories) {
        for (const example of category.examples) {
          expect(example.testCode.length).toBeGreaterThan(50);
        }
      }
    });

    it("every example has valid severity", () => {
      const validSeverities = ["critical", "high", "medium", "low"];

      for (const category of allCategories) {
        for (const example of category.examples) {
          expect(validSeverities).toContain(example.severity);
        }
      }
    });
  });

  describe("search functionality", () => {
    it("can find categories by domain", () => {
      for (const domain of Object.keys(EXPECTED_COUNTS)) {
        const results = store.byDomain(domain as any);
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it("can search across all categories", () => {
      const results = store.search({ query: "security" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("can filter by priority", () => {
      const p0Categories = store.list({ priority: "P0" });
      expect(p0Categories.length).toBeGreaterThan(0);
      expect(p0Categories.every((c) => c.priority === "P0")).toBe(true);
    });

    it("can filter by severity", () => {
      const criticalCategories = store.list({ severity: "critical" });
      expect(criticalCategories.length).toBeGreaterThan(0);
      expect(criticalCategories.every((c) => c.severity === "critical")).toBe(true);
    });

    it("can filter by language", () => {
      const pythonCategories = store.list({ language: "python" });
      expect(pythonCategories.length).toBeGreaterThan(0);
    });
  });

  describe("statistics", () => {
    it("provides accurate statistics", () => {
      const stats = store.stats();

      expect(stats.total).toBe(TOTAL_EXPECTED);
      expect(Object.keys(stats.byDomain).length).toBeGreaterThan(0);
      expect(Object.keys(stats.byLevel).length).toBeGreaterThan(0);
      expect(Object.keys(stats.byPriority).length).toBeGreaterThan(0);
    });

    it("domain counts in stats match actual", () => {
      const stats = store.stats();

      for (const [domain, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
        expect(stats.byDomain[domain]).toBe(expectedCount);
      }
    });
  });

  describe("data quality", () => {
    it("all P0 categories have critical or high severity", () => {
      const p0Categories = store.list({ priority: "P0" });

      for (const category of p0Categories) {
        expect(["critical", "high"]).toContain(category.severity);
      }
    });

    it("security categories exist and have expected structure", () => {
      const securityCategories = store.byDomain("security");
      
      expect(securityCategories.length).toBe(EXPECTED_COUNTS.security);
      
      // Each security category should have critical or high severity
      for (const category of securityCategories) {
        expect(["critical", "high"]).toContain(category.severity);
      }
    });

    it("all categories have references", () => {
      for (const category of allCategories) {
        expect(category.references?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it("all categories support Python and TypeScript", () => {
      for (const category of allCategories) {
        const languages = category.applicableLanguages;
        expect(languages).toContain("python");
        expect(languages.some((l) => l === "typescript" || l === "javascript")).toBe(true);
      }
    });
  });
});
