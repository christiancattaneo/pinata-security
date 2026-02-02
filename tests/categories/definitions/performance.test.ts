import path from "path";
import { fileURLToPath } from "url";

import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Performance Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "performance"));

    if (!result.success) {
      console.error("Failed to load performance categories:", result.error);
    }
  });

  describe("loads all performance categories", () => {
    it("loads memory-bloat category", () => {
      expect(store.has("memory-bloat")).toBe(true);
    });

    it("loads cpu-spin category", () => {
      expect(store.has("cpu-spin")).toBe(true);
    });

    it("loads blocking-io category", () => {
      expect(store.has("blocking-io")).toBe(true);
    });

    it("loads exactly 3 performance categories", () => {
      const categories = store.byDomain("performance");
      expect(categories).toHaveLength(3);
    });
  });

  describe("memory-bloat category", () => {
    it("has correct metadata", () => {
      const result = store.get("memory-bloat");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("performance");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for accumulation and memory", () => {
      const result = store.get("memory-bloat");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => 
          p.id.includes("accumulate") || p.id.includes("concat") || p.id.includes("readlines")
        )).toBe(true);
      }
    });

    it("has Python and TypeScript patterns", () => {
      const result = store.get("memory-bloat");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("memory-bloat");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("cpu-spin category", () => {
    it("has correct metadata", () => {
      const result = store.get("cpu-spin");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("performance");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for loops and polling", () => {
      const result = store.get("cpu-spin");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => 
          p.id.includes("while") || p.id.includes("poll") || p.id.includes("spin")
        )).toBe(true);
      }
    });

    it("has Python and TypeScript patterns", () => {
      const result = store.get("cpu-spin");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("cpu-spin");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("blocking-io category", () => {
    it("has correct metadata", () => {
      const result = store.get("blocking-io");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("performance");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for sync operations", () => {
      const result = store.get("blocking-io");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => 
          p.id.includes("sync") || p.id.includes("blocking")
        )).toBe(true);
      }
    });

    it("has Python and TypeScript patterns", () => {
      const result = store.get("blocking-io");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("blocking-io");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("test templates", () => {
    it("each category has pytest and jest templates", () => {
      const categories = ["memory-bloat", "cpu-spin", "blocking-io"];

      for (const id of categories) {
        const result = store.get(id);
        expect(result.success).toBe(true);
        if (result.success) {
          const templates = result.data.testTemplates;
          expect(templates.length).toBeGreaterThanOrEqual(2);

          const pytestTemplates = templates.filter((t) => t.framework === "pytest");
          const jestTemplates = templates.filter((t) => t.framework === "jest");

          expect(pytestTemplates.length).toBeGreaterThan(0);
          expect(jestTemplates.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("examples have required content", () => {
    it("examples have vulnerable code and test code", () => {
      const categories = ["memory-bloat", "cpu-spin", "blocking-io"];

      for (const id of categories) {
        const result = store.get(id);
        expect(result.success).toBe(true);
        if (result.success) {
          for (const example of result.data.examples) {
            expect(example.vulnerableCode.length).toBeGreaterThan(0);
            expect(example.testCode.length).toBeGreaterThan(0);
            expect(example.concept.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe("search functionality", () => {
    it("finds memory-bloat by searching 'memory'", () => {
      const results = store.search({ query: "memory" });
      expect(results.some((r) => r.category.id === "memory-bloat")).toBe(true);
    });

    it("finds cpu-spin by searching 'busy'", () => {
      const results = store.search({ query: "busy" });
      expect(results.some((r) => r.category.id === "cpu-spin")).toBe(true);
    });

    it("finds blocking-io by searching 'blocking'", () => {
      const results = store.search({ query: "blocking" });
      expect(results.some((r) => r.category.id === "blocking-io")).toBe(true);
    });

    it("finds blocking-io by searching 'async'", () => {
      const results = store.search({ query: "async" });
      expect(results.some((r) => r.category.id === "blocking-io")).toBe(true);
    });

    it("finds cpu-spin by searching 'loop'", () => {
      const results = store.search({ query: "loop" });
      expect(results.some((r) => r.category.id === "cpu-spin")).toBe(true);
    });
  });
});
