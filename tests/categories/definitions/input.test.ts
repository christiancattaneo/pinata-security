import path from "path";
import { fileURLToPath } from "url";

import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Input Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "input"));

    if (!result.success) {
      console.error("Failed to load input categories:", result.error);
    }
  });

  describe("Category Loading", () => {
    it("loads boundary-testing category", () => {
      expect(store.has("boundary-testing")).toBe(true);
    });

    it("loads null-undefined category", () => {
      expect(store.has("null-undefined")).toBe(true);
    });

    it("loads injection-fuzzing category", () => {
      expect(store.has("injection-fuzzing")).toBe(true);
    });

    it("loads exactly 3 input categories", () => {
      const inputCategories = store.list({ domain: "input" });
      expect(inputCategories.length).toBe(3);
    });
  });

  describe("Category Metadata", () => {
    it("boundary-testing has correct domain and level", () => {
      const result = store.get("boundary-testing");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.domain).toBe("input");
        expect(result.data.level).toBe("unit");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("null-undefined has correct domain and level", () => {
      const result = store.get("null-undefined");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.domain).toBe("input");
        expect(result.data.level).toBe("unit");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("injection-fuzzing has correct domain and level", () => {
      const result = store.get("injection-fuzzing");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.domain).toBe("input");
        expect(result.data.level).toBe("integration");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });
  });

  describe("Detection Patterns", () => {
    it("boundary-testing has detection patterns for Python and TypeScript", () => {
      const result = store.get("boundary-testing");
      expect(result.success).toBe(true);
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.length).toBeGreaterThanOrEqual(3);

        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("null-undefined has detection patterns for Python and TypeScript", () => {
      const result = store.get("null-undefined");
      expect(result.success).toBe(true);
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.length).toBeGreaterThanOrEqual(3);

        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("injection-fuzzing has detection patterns for Python and TypeScript", () => {
      const result = store.get("injection-fuzzing");
      expect(result.success).toBe(true);
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.length).toBeGreaterThanOrEqual(3);

        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Test Templates", () => {
    it("each category has pytest and jest templates", () => {
      const categories = ["boundary-testing", "null-undefined", "injection-fuzzing"];

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

  describe("Examples", () => {
    it("each category has at least 3 examples", () => {
      const categories = ["boundary-testing", "null-undefined", "injection-fuzzing"];

      for (const id of categories) {
        const result = store.get(id);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it("examples have vulnerable code and test code", () => {
      const result = store.get("injection-fuzzing");
      expect(result.success).toBe(true);
      if (result.success) {
        for (const example of result.data.examples) {
          expect(example.vulnerableCode.length).toBeGreaterThan(0);
          expect(example.testCode.length).toBeGreaterThan(0);
          expect(example.concept.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Search Functionality", () => {
    it("finds categories by boundary keyword", () => {
      const results = store.search({ query: "boundary" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category.id === "boundary-testing")).toBe(true);
    });

    it("finds categories by null keyword", () => {
      const results = store.search({ query: "null" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category.id === "null-undefined")).toBe(true);
    });

    it("finds categories by fuzzing keyword", () => {
      const results = store.search({ query: "fuzzing" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category.id === "injection-fuzzing")).toBe(true);
    });

    it("finds categories by injection keyword", () => {
      const results = store.search({ query: "injection" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.category.id === "injection-fuzzing")).toBe(true);
    });
  });
});
