/**
 * Concurrency and race condition tests.
 *
 * Tests that Pinata handles concurrent operations correctly
 * without data corruption or crashes.
 */

import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { resolve } from "path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";
import { Scanner } from "@/core/scanner/scanner.js";
import { saveScanResults, loadScanResults } from "@/cli/results-cache.js";

import type { ScanResult } from "@/core/scanner/types.js";

const TEST_DIR = resolve(__dirname, ".concurrency-test");
const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");

describe("Concurrent Scanning", () => {
  let store: CategoryStore;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);

    await mkdir(TEST_DIR, { recursive: true });

    // Create test files
    for (let i = 0; i < 10; i++) {
      const dir = resolve(TEST_DIR, `dir_${i}`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        resolve(dir, `file_${i}.py`),
        `def get_user_${i}(id):\n    cursor.execute(f"SELECT * FROM users WHERE id = '{id}'")\n`
      );
    }
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("handles multiple concurrent scans safely", async () => {
    const scanners = Array.from({ length: 5 }, () => new Scanner(store));

    // Run all scans concurrently
    const results = await Promise.all(
      scanners.map((scanner) => scanner.scanDirectory(TEST_DIR))
    );

    // All should succeed
    for (const result of results) {
      expect(result.success).toBe(true);
    }

    // All should find the same number of gaps
    const gapCounts = results
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: ScanResult }).data.gaps.length);

    const firstCount = gapCounts[0];
    for (const count of gapCounts) {
      expect(count).toBe(firstCount);
    }
  });

  it("handles rapid sequential scans without corruption", async () => {
    const scanner = new Scanner(store);
    const results: Array<{ success: boolean }> = [];

    // Rapid sequential scans
    for (let i = 0; i < 10; i++) {
      const result = await scanner.scanDirectory(TEST_DIR);
      results.push(result);
    }

    // All should succeed
    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });

  it("handles interleaved scans of different directories", async () => {
    const scanner = new Scanner(store);

    const dirs = Array.from({ length: 10 }, (_, i) =>
      resolve(TEST_DIR, `dir_${i}`)
    );

    // Scan all directories concurrently
    const results = await Promise.all(
      dirs.map((dir) => scanner.scanDirectory(dir))
    );

    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });
});

describe("Concurrent Cache Access", () => {
  const cacheDir = resolve(TEST_DIR, "cache-test");

  beforeAll(async () => {
    await mkdir(cacheDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("handles concurrent cache writes safely", async () => {
    const mockResult: ScanResult = {
      success: true,
      gaps: [],
      gapsByCategory: new Map(),
      gapsByFile: new Map(),
      coverage: {
        totalCategories: 45,
        coveredCategories: 0,
        coveragePercent: 0,
        byDomain: new Map(),
      },
      score: { overall: 100, byDomain: new Map(), grade: "A" },
      summary: {
        totalGaps: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byDomain: {},
        byLevel: {},
        topCategories: [],
      },
      fileStats: {
        totalFiles: 10,
        filesWithGaps: 0,
        linesScanned: 100,
        testFiles: 0,
      },
      version: "0.1.0",
      durationMs: 100,
    };

    // Attempt concurrent writes
    const writePromises = Array.from({ length: 10 }, (_, i) =>
      saveScanResults({ ...mockResult, durationMs: i * 100 }, cacheDir)
    );

    const results = await Promise.allSettled(writePromises);

    // All should complete without crashing
    const failures = results.filter((r) => r.status === "rejected");
    expect(failures.length).toBe(0);
  });

  it("handles concurrent read/write safely", async () => {
    const mockResult: ScanResult = {
      success: true,
      gaps: [],
      gapsByCategory: new Map(),
      gapsByFile: new Map(),
      coverage: {
        totalCategories: 45,
        coveredCategories: 0,
        coveragePercent: 0,
        byDomain: new Map(),
      },
      score: { overall: 100, byDomain: new Map(), grade: "A" },
      summary: {
        totalGaps: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byDomain: {},
        byLevel: {},
        topCategories: [],
      },
      fileStats: {
        totalFiles: 10,
        filesWithGaps: 0,
        linesScanned: 100,
        testFiles: 0,
      },
      version: "0.1.0",
      durationMs: 100,
    };

    // Initial write
    await saveScanResults(mockResult, cacheDir);

    // Concurrent reads and writes
    const operations = [
      loadScanResults(cacheDir),
      saveScanResults(mockResult, cacheDir),
      loadScanResults(cacheDir),
      saveScanResults(mockResult, cacheDir),
      loadScanResults(cacheDir),
    ];

    const results = await Promise.allSettled(operations);

    // All should complete
    const failures = results.filter((r) => r.status === "rejected");
    expect(failures.length).toBe(0);
  });
});

describe("CategoryStore Thread Safety", () => {
  it("handles concurrent loads safely", async () => {
    const stores = Array.from({ length: 5 }, () => new CategoryStore());

    const loadPromises = stores.map((store) =>
      store.loadFromDirectory(DEFINITIONS_PATH)
    );

    const results = await Promise.all(loadPromises);

    // All should succeed
    for (const result of results) {
      expect(result.success).toBe(true);
    }

    // All should have the same number of categories
    const sizes = stores.map((s) => s.size);
    const firstSize = sizes[0];
    for (const size of sizes) {
      expect(size).toBe(firstSize);
    }
  });

  it("handles concurrent lookups safely", async () => {
    const store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);

    const categoryIds = ["sql-injection", "xss", "command-injection", "csrf"];

    // Many concurrent lookups
    const lookupPromises = Array.from({ length: 100 }, () =>
      Promise.resolve(store.get(categoryIds[Math.floor(Math.random() * categoryIds.length)]!))
    );

    const results = await Promise.all(lookupPromises);

    // All should return valid categories
    for (const result of results) {
      expect(result).toBeDefined();
    }
  });
});
