import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Concurrency Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "concurrency"));

    if (!result.success) {
      console.error("Failed to load concurrency categories:", result.error);
    }
  });

  describe("loads all concurrency categories", () => {
    it("loads race-condition category", () => {
      expect(store.has("race-condition")).toBe(true);
    });

    it("loads deadlock category", () => {
      expect(store.has("deadlock")).toBe(true);
    });

    it("loads thread-safety category", () => {
      expect(store.has("thread-safety")).toBe(true);
    });

    it("loads exactly 3 concurrency categories", () => {
      const categories = store.byDomain("concurrency");
      expect(categories).toHaveLength(3);
    });
  });

  describe("race-condition category", () => {
    it("has correct metadata", () => {
      const result = store.get("race-condition");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("concurrency");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for TOCTOU", () => {
      const result = store.get("race-condition");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("toctou"))).toBe(true);
      }
    });

    it("has CVE references", () => {
      const result = store.get("race-condition");
      if (result.success) {
        expect(result.data.cves).toBeDefined();
        expect(result.data.cves?.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("race-condition");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("deadlock category", () => {
    it("has correct metadata", () => {
      const result = store.get("deadlock");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("concurrency");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for nested locks", () => {
      const result = store.get("deadlock");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("nested") || p.id.includes("lock"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("deadlock");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("thread-safety category", () => {
    it("has correct metadata", () => {
      const result = store.get("thread-safety");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("concurrency");
        expect(result.data.level).toBe("unit");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for mutable defaults", () => {
      const result = store.get("thread-safety");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("mutable") || p.id.includes("singleton"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("thread-safety");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("search functionality", () => {
    it("finds race-condition by searching 'toctou'", () => {
      const results = store.search({ query: "toctou" });
      expect(results.some((r) => r.category.id === "race-condition")).toBe(true);
    });

    it("finds deadlock by searching 'lock ordering'", () => {
      const results = store.search({ query: "lock ordering" });
      expect(results.some((r) => r.category.id === "deadlock")).toBe(true);
    });

    it("finds thread-safety by searching 'singleton'", () => {
      const results = store.search({ query: "singleton" });
      expect(results.some((r) => r.category.id === "thread-safety")).toBe(true);
    });
  });
});
