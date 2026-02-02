import path from "path";
import { fileURLToPath } from "url";

import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Resource Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "resource"));

    if (!result.success) {
      console.error("Failed to load resource categories:", result.error);
    }
  });

  describe("loads all resource categories", () => {
    it("loads memory-leak category", () => {
      expect(store.has("memory-leak")).toBe(true);
    });

    it("loads file-handle-leak category", () => {
      expect(store.has("file-handle-leak")).toBe(true);
    });

    it("loads connection-pool-exhaustion category", () => {
      expect(store.has("connection-pool-exhaustion")).toBe(true);
    });

    it("loads exactly 3 resource categories", () => {
      const categories = store.byDomain("resource");
      expect(categories).toHaveLength(3);
    });
  });

  describe("memory-leak category", () => {
    it("has correct metadata", () => {
      const result = store.get("memory-leak");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("resource");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for cache and listeners", () => {
      const result = store.get("memory-leak");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("cache") || p.id.includes("listener"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("memory-leak");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("file-handle-leak category", () => {
    it("has correct metadata", () => {
      const result = store.get("file-handle-leak");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("resource");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for open without close", () => {
      const result = store.get("file-handle-leak");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("open") || p.id.includes("close"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("file-handle-leak");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("connection-pool-exhaustion category", () => {
    it("has correct metadata", () => {
      const result = store.get("connection-pool-exhaustion");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("resource");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for connection release", () => {
      const result = store.get("connection-pool-exhaustion");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("release") || p.id.includes("close") || p.id.includes("pool"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("connection-pool-exhaustion");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("detection patterns", () => {
    it("memory-leak has Python and TypeScript patterns", () => {
      const result = store.get("memory-leak");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("file-handle-leak has Python and TypeScript patterns", () => {
      const result = store.get("file-handle-leak");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("connection-pool-exhaustion has Python and TypeScript patterns", () => {
      const result = store.get("connection-pool-exhaustion");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });
  });

  describe("test templates", () => {
    it("each category has pytest and jest templates", () => {
      const categories = ["memory-leak", "file-handle-leak", "connection-pool-exhaustion"];

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

  describe("search functionality", () => {
    it("finds memory-leak by searching 'garbage collection'", () => {
      const results = store.search({ query: "memory" });
      expect(results.some((r) => r.category.id === "memory-leak")).toBe(true);
    });

    it("finds file-handle-leak by searching 'file descriptor'", () => {
      const results = store.search({ query: "file" });
      expect(results.some((r) => r.category.id === "file-handle-leak")).toBe(true);
    });

    it("finds connection-pool-exhaustion by searching 'pool'", () => {
      const results = store.search({ query: "pool" });
      expect(results.some((r) => r.category.id === "connection-pool-exhaustion")).toBe(true);
    });

    it("finds connection-pool-exhaustion by searching 'database'", () => {
      const results = store.search({ query: "database" });
      expect(results.some((r) => r.category.id === "connection-pool-exhaustion")).toBe(true);
    });
  });
});
