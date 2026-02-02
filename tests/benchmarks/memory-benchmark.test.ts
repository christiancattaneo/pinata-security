/**
 * Memory usage benchmarks.
 *
 * Targets (from PRD):
 * - 1,000 files: <500MB
 * - 10,000 files: <2GB
 */

import { rm } from "fs/promises";
import { resolve } from "path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";
import { Scanner } from "@/core/scanner/scanner.js";

import { generateMediumCorpus, type CorpusStats } from "./corpus-generator.js";

const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");
const BENCHMARK_DIR = resolve(__dirname, ".memory-bench");

// Helper to get heap usage in MB
function getHeapUsageMB(): number {
  if (typeof global.gc === "function") {
    global.gc();
  }
  const usage = process.memoryUsage();
  return usage.heapUsed / 1024 / 1024;
}

describe("Memory Benchmarks", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
  });

  describe("baseline memory", () => {
    it("CategoryStore with all categories uses <50MB", () => {
      const heapMB = getHeapUsageMB();
      console.log(`    CategoryStore heap usage: ${heapMB.toFixed(2)}MB`);
      console.log(`    Categories loaded: ${store.size}`);

      expect(heapMB).toBeLessThan(50);
    });

    it("empty Scanner uses <10MB additional", () => {
      const beforeMB = getHeapUsageMB();
      const _scanner = new Scanner(store);
      const afterMB = getHeapUsageMB();

      const deltaMB = afterMB - beforeMB;
      console.log(`    Scanner overhead: ${deltaMB.toFixed(2)}MB`);

      expect(deltaMB).toBeLessThan(10);
    });
  });

  describe("scan memory usage", () => {
    const CORPUS_DIR = resolve(BENCHMARK_DIR, "memory-test");
    let stats: CorpusStats;

    beforeAll(async () => {
      stats = await generateMediumCorpus(CORPUS_DIR);
      console.log(`    Generated ${stats.totalFiles} files for memory test`);
    }, 120000);

    afterAll(async () => {
      await rm(CORPUS_DIR, { recursive: true, force: true });
    });

    it("scanning 1,000 files uses <500MB total", async () => {
      // Force GC before measurement
      if (typeof global.gc === "function") {
        global.gc();
      }

      const beforeMB = getHeapUsageMB();
      console.log(`    Heap before scan: ${beforeMB.toFixed(2)}MB`);

      const scanner = new Scanner(store);
      const result = await scanner.scanDirectory(CORPUS_DIR);

      const afterMB = getHeapUsageMB();
      const deltaMB = afterMB - beforeMB;

      console.log(`    Heap after scan: ${afterMB.toFixed(2)}MB`);
      console.log(`    Memory delta: ${deltaMB.toFixed(2)}MB`);
      console.log(`    Gaps in memory: ${result.success ? result.data.gaps.length : 0}`);

      expect(result.success).toBe(true);
      expect(afterMB).toBeLessThan(500);
    }, 120000);

    it("memory is released after scan result is dropped", async () => {
      if (typeof global.gc !== "function") {
        console.log("    Skipping: GC not exposed (run with --expose-gc)");
        return;
      }

      const beforeMB = getHeapUsageMB();

      // Run scan in scope
      {
        const scanner = new Scanner(store);
        const _result = await scanner.scanDirectory(CORPUS_DIR);
      }

      // Force GC
      global.gc();

      const afterMB = getHeapUsageMB();
      const deltaMB = afterMB - beforeMB;

      console.log(`    Memory after GC: ${afterMB.toFixed(2)}MB`);
      console.log(`    Retained: ${deltaMB.toFixed(2)}MB`);

      // Should not retain more than 50MB after GC
      expect(deltaMB).toBeLessThan(50);
    }, 120000);

    it("multiple scans do not leak memory", async () => {
      if (typeof global.gc !== "function") {
        console.log("    Skipping: GC not exposed (run with --expose-gc)");
        return;
      }

      global.gc();
      const baselineMB = getHeapUsageMB();
      console.log(`    Baseline: ${baselineMB.toFixed(2)}MB`);

      const heapSamples: number[] = [];

      // Run 5 scans
      for (let i = 0; i < 5; i++) {
        const scanner = new Scanner(store);
        await scanner.scanDirectory(CORPUS_DIR);

        global.gc();
        const heapMB = getHeapUsageMB();
        heapSamples.push(heapMB);
        console.log(`    After scan ${i + 1}: ${heapMB.toFixed(2)}MB`);
      }

      // Check for memory growth trend
      const firstHalf = heapSamples.slice(0, 2);
      const secondHalf = heapSamples.slice(3);

      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      const growthRatio = secondAvg / firstAvg;
      console.log(`    Growth ratio: ${growthRatio.toFixed(2)}x`);

      // Should not grow more than 20%
      expect(growthRatio).toBeLessThan(1.2);
    }, 300000);
  });

  describe("gap storage efficiency", () => {
    it("stores 1000 gaps in <10MB", () => {
      const gaps = Array.from({ length: 1000 }, (_, i) => ({
        categoryId: "sql-injection",
        categoryName: "SQL Injection",
        domain: "security" as const,
        level: "integration" as const,
        priority: "P0" as const,
        severity: "critical" as const,
        confidence: "high" as const,
        filePath: `/path/to/file_${i}.py`,
        lineStart: i * 10,
        lineEnd: i * 10 + 5,
        columnStart: 0,
        columnEnd: 50,
        codeSnippet: `cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")`,
        patternId: "python-fstring-execute",
        patternType: "regex" as const,
        priorityScore: 12,
      }));

      const jsonSize = JSON.stringify(gaps).length / 1024 / 1024;
      console.log(`    1000 gaps JSON size: ${jsonSize.toFixed(2)}MB`);

      expect(jsonSize).toBeLessThan(10);
    });
  });
});

describe("Memory Stress Tests", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
  });

  it("handles rapid sequential scans", async () => {
    const tempDir = resolve(BENCHMARK_DIR, "stress-rapid");
    await generateMediumCorpus(tempDir);

    try {
      const startMB = getHeapUsageMB();

      // 10 rapid scans
      for (let i = 0; i < 10; i++) {
        const scanner = new Scanner(store);
        await scanner.scanDirectory(tempDir);
      }

      if (typeof global.gc === "function") {
        global.gc();
      }

      const endMB = getHeapUsageMB();
      const deltaMB = endMB - startMB;

      console.log(`    After 10 rapid scans: ${endMB.toFixed(2)}MB (delta: ${deltaMB.toFixed(2)}MB)`);

      // Should not accumulate more than 100MB
      expect(deltaMB).toBeLessThan(100);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 300000);
});
