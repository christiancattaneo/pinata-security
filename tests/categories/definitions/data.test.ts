import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Data Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "data"));

    if (!result.success) {
      console.error("Failed to load data categories:", result.error);
    }
  });

  describe("loads all data categories", () => {
    it("loads data-truncation category", () => {
      expect(store.has("data-truncation")).toBe(true);
    });

    it("loads null-handling category", () => {
      expect(store.has("null-handling")).toBe(true);
    });

    it("loads encoding-mismatch category", () => {
      expect(store.has("encoding-mismatch")).toBe(true);
    });

    it("loads precision-loss category", () => {
      expect(store.has("precision-loss")).toBe(true);
    });

    it("loads data-race category", () => {
      expect(store.has("data-race")).toBe(true);
    });

    it("loads schema-migration category", () => {
      expect(store.has("schema-migration")).toBe(true);
    });

    it("loads bulk-operation category", () => {
      expect(store.has("bulk-operation")).toBe(true);
    });

    it("loads data-validation category", () => {
      expect(store.has("data-validation")).toBe(true);
    });

    it("loads exactly 8 data categories", () => {
      const dataCategories = store.byDomain("data");
      expect(dataCategories).toHaveLength(8);
    });
  });

  describe("data-truncation category", () => {
    it("has correct metadata", () => {
      const result = store.get("data-truncation");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for overflow", () => {
      const result = store.get("data-truncation");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("data-truncation");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("null-handling category", () => {
    it("has correct metadata", () => {
      const result = store.get("null-handling");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.level).toBe("unit");
      }
    });
  });

  describe("encoding-mismatch category", () => {
    it("has correct metadata", () => {
      const result = store.get("encoding-mismatch");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.name).toContain("Encoding");
      }
    });
  });

  describe("precision-loss category", () => {
    it("has correct metadata", () => {
      const result = store.get("precision-loss");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.priority).toBe("P0");
      }
    });
  });

  describe("data-race category", () => {
    it("has correct metadata", () => {
      const result = store.get("data-race");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.severity).toBe("critical");
      }
    });
  });

  describe("schema-migration category", () => {
    it("has correct metadata", () => {
      const result = store.get("schema-migration");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.level).toBe("system");
      }
    });
  });

  describe("bulk-operation category", () => {
    it("has correct metadata", () => {
      const result = store.get("bulk-operation");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.level).toBe("integration");
      }
    });
  });

  describe("data-validation category", () => {
    it("has correct metadata", () => {
      const result = store.get("data-validation");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("data");
        expect(result.data.priority).toBe("P0");
      }
    });

    it("has CVE references", () => {
      const result = store.get("data-validation");
      if (result.success) {
        expect(result.data.cves).toBeDefined();
        expect(result.data.cves?.length).toBeGreaterThan(0);
      }
    });
  });

  describe("search functionality", () => {
    it("finds data-truncation by searching 'overflow'", () => {
      const results = store.search({ query: "overflow" });
      expect(results.some((r) => r.category.id === "data-truncation")).toBe(true);
    });

    it("finds null-handling by searching 'null'", () => {
      const results = store.search({ query: "null" });
      expect(results.some((r) => r.category.id === "null-handling")).toBe(true);
    });

    it("finds encoding-mismatch by searching 'utf'", () => {
      const results = store.search({ query: "utf" });
      expect(results.some((r) => r.category.id === "encoding-mismatch")).toBe(true);
    });

    it("finds precision-loss by searching 'float'", () => {
      const results = store.search({ query: "float" });
      expect(results.some((r) => r.category.id === "precision-loss")).toBe(true);
    });

    it("finds data-race by searching 'concurrent'", () => {
      const results = store.search({ query: "concurrent" });
      expect(results.some((r) => r.category.id === "data-race")).toBe(true);
    });

    it("finds data-validation by searching 'regex'", () => {
      const results = store.search({ query: "regex" });
      expect(results.some((r) => r.category.id === "data-validation")).toBe(true);
    });
  });
});
