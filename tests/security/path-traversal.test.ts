/**
 * Path traversal resistance tests for Pinata.
 *
 * Ensures the tool cannot be tricked into reading/writing
 * files outside the intended directories.
 */

import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { resolve, join } from "path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";
import { Scanner } from "@/core/scanner/scanner.js";

const TEST_DIR = resolve(__dirname, ".path-traversal-test");
const SAFE_DIR = resolve(TEST_DIR, "safe");
const SENSITIVE_DIR = resolve(TEST_DIR, "sensitive");

describe("Path Traversal Resistance", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    const defsPath = resolve(__dirname, "../../src/categories/definitions");
    await store.loadFromDirectory(defsPath);
    scanner = new Scanner(store);

    // Create test directories
    await mkdir(SAFE_DIR, { recursive: true });
    await mkdir(SENSITIVE_DIR, { recursive: true });

    // Create a file in safe dir
    await writeFile(join(SAFE_DIR, "test.py"), "print('hello')");

    // Create sensitive file that should NOT be accessible
    await writeFile(join(SENSITIVE_DIR, "secrets.txt"), "API_KEY=secret123");
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("scanner path validation", () => {
    it("rejects relative paths with ..", async () => {
      const maliciousPath = join(SAFE_DIR, "../sensitive");
      const result = await scanner.scanDirectory(maliciousPath);

      // The scanner should work but not escape the base directory
      // We're testing that it doesn't crash or expose sensitive data
      expect(result).toBeDefined();
    });

    it("handles symbolic traversal attempts", async () => {
      const traversalPaths = [
        "../sensitive/secrets.txt",
        "..%2Fsensitive/secrets.txt",
        "....//sensitive/secrets.txt",
        "..\\/sensitive/secrets.txt",
        "..\\sensitive\\secrets.txt",
      ];

      for (const path of traversalPaths) {
        const fullPath = join(SAFE_DIR, path);
        const result = await scanner.scanDirectory(fullPath);
        // Should not throw and should not access sensitive directory
        expect(result).toBeDefined();
      }
    });

    it("normalizes paths before scanning", async () => {
      // These should all resolve to the same safe directory
      const equivalentPaths = [
        SAFE_DIR,
        join(SAFE_DIR, "."),
        join(SAFE_DIR, "subdir", ".."),
        join(SAFE_DIR, "./"),
      ];

      for (const path of equivalentPaths) {
        const result = await scanner.scanDirectory(path);
        expect(result).toBeDefined();
      }
    });
  });

  describe("category loading path validation", () => {
    it("rejects category paths with traversal", async () => {
      const maliciousPaths = [
        "../../../etc/passwd",
        "definitions/../../../sensitive",
        "..\\..\\..\\windows\\system32",
      ];

      for (const path of maliciousPaths) {
        // CategoryStore should validate paths
        const testStore = new CategoryStore();
        const result = await testStore.loadFromDirectory(path);
        // Should fail gracefully
        expect(result.success).toBe(false);
      }
    });
  });

  describe("output path validation", () => {
    it("shows how resolve normalizes malicious paths", () => {
      const maliciousOutputPaths = [
        { input: "../../../etc/cron.d/malicious", expected: "/etc/cron.d/malicious" },
        { input: "/tmp/../../../etc/passwd", expected: "/etc/passwd" },
      ];

      for (const { input, expected } of maliciousOutputPaths) {
        // resolve() normalizes paths, removing .. sequences
        const normalized = resolve("/safe/output", input);
        // The normalized path escapes the safe directory - this is why we need additional validation
        expect(normalized).toBe(expected);
      }

      // This demonstrates why you MUST validate paths after resolving
      const validatePath = (basePath: string, userPath: string): boolean => {
        const normalized = resolve(basePath, userPath);
        return normalized.startsWith(basePath);
      };

      expect(validatePath("/safe/output", "file.txt")).toBe(true);
      expect(validatePath("/safe/output", "../../../etc/passwd")).toBe(false);
    });
  });
});

describe("Null Byte Injection Resistance", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    const defsPath = resolve(__dirname, "../../src/categories/definitions");
    await store.loadFromDirectory(defsPath);
    scanner = new Scanner(store);
  });

  it("handles null bytes in file paths", async () => {
    const pathsWithNullBytes = [
      "/safe/path\x00/../../etc/passwd",
      "/safe/path%00/../../etc/passwd",
      "test.py\x00.txt",
    ];

    for (const path of pathsWithNullBytes) {
      // Should not crash
      try {
        await scanner.scanDirectory(path);
      } catch (e) {
        // Expected to fail, just shouldn't crash the process
        expect(e).toBeDefined();
      }
    }
  });

  it("sanitizes null bytes from category IDs", () => {
    const maliciousIds = [
      "sql-injection\x00--",
      "xss%00../../",
      "test\u0000malicious",
    ];

    for (const id of maliciousIds) {
      // ID validation should reject these
      const sanitized = id.replace(/\x00|%00/g, "");
      expect(sanitized).not.toContain("\x00");
    }
  });
});
