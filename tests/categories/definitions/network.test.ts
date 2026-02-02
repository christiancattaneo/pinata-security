import path from "path";
import { fileURLToPath } from "url";

import { describe, it, expect, beforeAll } from "vitest";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFINITIONS_PATH = path.resolve(__dirname, "../../../src/categories/definitions");

describe("Network Category Definitions", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = createCategoryStore();
    const result = await store.loadFromDirectory(path.join(DEFINITIONS_PATH, "network"));

    if (!result.success) {
      console.error("Failed to load network categories:", result.error);
    }
  });

  describe("loads all network categories", () => {
    it("loads network-timeout category", () => {
      expect(store.has("network-timeout")).toBe(true);
    });

    it("loads connection-failure category", () => {
      expect(store.has("connection-failure")).toBe(true);
    });

    it("loads packet-loss category", () => {
      expect(store.has("packet-loss")).toBe(true);
    });

    it("loads network-partition category", () => {
      expect(store.has("network-partition")).toBe(true);
    });

    it("loads thundering-herd category", () => {
      expect(store.has("thundering-herd")).toBe(true);
    });

    it("loads high-latency category", () => {
      expect(store.has("high-latency")).toBe(true);
    });

    it("loads exactly 6 network/reliability categories", () => {
      const categories = store.byDomain("reliability");
      expect(categories).toHaveLength(6);
    });
  });

  describe("network-timeout category", () => {
    it("has correct metadata", () => {
      const result = store.get("network-timeout");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("reliability");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for timeout configuration", () => {
      const result = store.get("network-timeout");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("timeout") || p.id.includes("requests"))).toBe(true);
      }
    });

    it("has Python and TypeScript patterns", () => {
      const result = store.get("network-timeout");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("network-timeout");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("connection-failure category", () => {
    it("has correct metadata", () => {
      const result = store.get("connection-failure");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("reliability");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for error handling", () => {
      const result = store.get("connection-failure");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("except") || p.id.includes("catch") || p.id.includes("error"))).toBe(true);
      }
    });

    it("has Python and TypeScript patterns", () => {
      const result = store.get("connection-failure");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("connection-failure");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("packet-loss category", () => {
    it("has correct metadata", () => {
      const result = store.get("packet-loss");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("reliability");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for retry and resilience", () => {
      const result = store.get("packet-loss");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("retry") || p.id.includes("socket") || p.id.includes("websocket"))).toBe(true);
      }
    });

    it("has Python and TypeScript patterns", () => {
      const result = store.get("packet-loss");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        const pythonPatterns = patterns.filter((p) => p.language === "python");
        const tsPatterns = patterns.filter((p) => p.language === "typescript");

        expect(pythonPatterns.length).toBeGreaterThan(0);
        expect(tsPatterns.length).toBeGreaterThan(0);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("packet-loss");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("network-partition category", () => {
    it("has correct metadata", () => {
      const result = store.get("network-partition");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("reliability");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for quorum and leader", () => {
      const result = store.get("network-partition");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("quorum") || p.id.includes("leader") || p.id.includes("lock"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("network-partition");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("thundering-herd category", () => {
    it("has correct metadata", () => {
      const result = store.get("thundering-herd");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("reliability");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("critical");
      }
    });

    it("has detection patterns for cache and retry", () => {
      const result = store.get("thundering-herd");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("cache") || p.id.includes("retry") || p.id.includes("jitter"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("thundering-herd");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("high-latency category", () => {
    it("has correct metadata", () => {
      const result = store.get("high-latency");
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.domain).toBe("reliability");
        expect(result.data.priority).toBe("P0");
        expect(result.data.severity).toBe("high");
      }
    });

    it("has detection patterns for sync calls and caching", () => {
      const result = store.get("high-latency");
      if (result.success) {
        const patterns = result.data.detectionPatterns;
        expect(patterns.some((p) => p.id.includes("sync") || p.id.includes("await") || p.id.includes("cache"))).toBe(true);
      }
    });

    it("has 3+ examples", () => {
      const result = store.get("high-latency");
      if (result.success) {
        expect(result.data.examples.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("test templates", () => {
    it("each category has pytest and jest templates", () => {
      const categories = ["network-timeout", "connection-failure", "packet-loss", "network-partition", "thundering-herd", "high-latency"];

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
      const categories = ["network-timeout", "connection-failure", "packet-loss", "network-partition", "thundering-herd", "high-latency"];

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
    it("finds network-timeout by searching 'timeout'", () => {
      const results = store.search({ query: "timeout" });
      expect(results.some((r) => r.category.id === "network-timeout")).toBe(true);
    });

    it("finds connection-failure by searching 'connection'", () => {
      const results = store.search({ query: "connection" });
      expect(results.some((r) => r.category.id === "connection-failure")).toBe(true);
    });

    it("finds packet-loss by searching 'retry'", () => {
      const results = store.search({ query: "retry" });
      expect(results.some((r) => r.category.id === "packet-loss")).toBe(true);
    });

    it("finds connection-failure by searching 'DNS'", () => {
      const results = store.search({ query: "DNS" });
      expect(results.some((r) => r.category.id === "connection-failure")).toBe(true);
    });

    it("finds packet-loss by searching 'packet'", () => {
      const results = store.search({ query: "packet" });
      expect(results.some((r) => r.category.id === "packet-loss")).toBe(true);
    });

    it("finds network-partition by searching 'partition'", () => {
      const results = store.search({ query: "partition" });
      expect(results.some((r) => r.category.id === "network-partition")).toBe(true);
    });

    it("finds thundering-herd by searching 'stampede'", () => {
      const results = store.search({ query: "stampede" });
      expect(results.some((r) => r.category.id === "thundering-herd")).toBe(true);
    });

    it("finds high-latency by searching 'latency'", () => {
      const results = store.search({ query: "latency" });
      expect(results.some((r) => r.category.id === "high-latency")).toBe(true);
    });
  });
});
