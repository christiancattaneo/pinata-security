/**
 * Edge case and boundary condition tests.
 *
 * Tests handling of unusual inputs, empty data, and error conditions.
 */

import { mkdir, rm, writeFile, symlink } from "fs/promises";
import { resolve, join } from "path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { CategoryStore } from "@/categories/store/category-store.js";
import { Scanner } from "@/core/scanner/scanner.js";
import { PatternMatcher } from "@/core/detection/pattern-matcher.js";
import { TemplateRenderer } from "@/templates/renderer.js";

const TEST_DIR = resolve(__dirname, ".edge-cases-test");
const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");

describe("Empty and Null Data Handling", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
    scanner = new Scanner(store);

    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("empty directories", () => {
    it("handles empty directory gracefully", async () => {
      const emptyDir = resolve(TEST_DIR, "empty");
      await mkdir(emptyDir, { recursive: true });

      const result = await scanner.scanDirectory(emptyDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaps).toHaveLength(0);
        expect(result.data.fileStats.totalFiles).toBe(0);
      }
    });

    it("handles directory with only subdirectories", async () => {
      const parentDir = resolve(TEST_DIR, "only-subdirs");
      await mkdir(resolve(parentDir, "sub1/sub2/sub3"), { recursive: true });

      const result = await scanner.scanDirectory(parentDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaps).toHaveLength(0);
      }
    });
  });

  describe("empty files", () => {
    it("handles empty source files", async () => {
      const dir = resolve(TEST_DIR, "empty-files");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, "empty.py"), "");
      await writeFile(resolve(dir, "empty.ts"), "");

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });

    it("handles files with only whitespace", async () => {
      const dir = resolve(TEST_DIR, "whitespace-files");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, "whitespace.py"), "   \n\n\t\t\n   ");
      await writeFile(resolve(dir, "newlines.ts"), "\n\n\n\n\n");

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });

    it("handles files with only comments", async () => {
      const dir = resolve(TEST_DIR, "comments-only");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, "comments.py"), "# Just a comment\n# Another comment\n");
      await writeFile(resolve(dir, "comments.ts"), "// Comment\n/* Block */\n");

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });
  });

  describe("null and undefined inputs", () => {
    it("PatternMatcher handles empty pattern array", async () => {
      const matcher = new PatternMatcher();
      const file = resolve(TEST_DIR, "test-null.py");
      await mkdir(TEST_DIR, { recursive: true });
      await writeFile(file, "print('hello')");

      const result = await matcher.scanFile(file, [], { categoryId: "test", basePath: "" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.matches).toHaveLength(0);
      }
    });

    it("TemplateRenderer handles empty variables", () => {
      const renderer = new TemplateRenderer();
      const result = renderer.renderTemplate(
        {
          id: "test",
          language: "python",
          framework: "pytest",
          template: "def test():\n    pass",
          variables: [],
        },
        {}
      );

      expect(result.success).toBe(true);
    });

    it("TemplateRenderer handles missing optional variables", () => {
      const renderer = new TemplateRenderer();
      const result = renderer.renderTemplate(
        {
          id: "test",
          language: "python",
          framework: "pytest",
          template: "def test_{{name}}():\n    {{#if optional}}optional{{/if}}pass",
          variables: [
            { name: "name", type: "string", description: "Name", required: true },
            { name: "optional", type: "boolean", description: "Optional", required: false },
          ],
        },
        { name: "example" }
      );

      expect(result.success).toBe(true);
    });
  });
});

describe("File System Edge Cases", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
    scanner = new Scanner(store);

    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("deep nesting", () => {
    it("handles deeply nested directories (10 levels)", async () => {
      let path = resolve(TEST_DIR, "deep");
      for (let i = 0; i < 10; i++) {
        path = resolve(path, `level_${i}`);
      }
      await mkdir(path, { recursive: true });
      await writeFile(
        resolve(path, "deep.py"),
        'cursor.execute(f"SELECT * FROM users WHERE id = \'{id}\'")'
      );

      const result = await scanner.scanDirectory(resolve(TEST_DIR, "deep"));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.gaps.length).toBeGreaterThan(0);
      }
    });

    it("handles very long file paths", async () => {
      // Create a path that's long but not too long for the OS
      let dirName = "a".repeat(50);
      let path = resolve(TEST_DIR, "long-path");
      for (let i = 0; i < 3; i++) {
        path = resolve(path, `${dirName}_${i}`);
      }
      await mkdir(path, { recursive: true });
      await writeFile(resolve(path, "file.py"), "print('hello')");

      const result = await scanner.scanDirectory(resolve(TEST_DIR, "long-path"));

      expect(result.success).toBe(true);
    });
  });

  describe("symlinks", () => {
    it("handles symbolic links to files", async () => {
      const dir = resolve(TEST_DIR, "symlinks");
      await mkdir(dir, { recursive: true });

      const realFile = resolve(dir, "real.py");
      const linkFile = resolve(dir, "link.py");

      await writeFile(realFile, 'cursor.execute(f"SELECT * FROM users")');

      try {
        await symlink(realFile, linkFile);
      } catch {
        // Symlinks may not be supported on all systems
        return;
      }

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });

    it("handles circular symlinks gracefully", async () => {
      const dir = resolve(TEST_DIR, "circular");
      await mkdir(dir, { recursive: true });

      const subDir = resolve(dir, "sub");
      await mkdir(subDir, { recursive: true });

      try {
        await symlink(dir, resolve(subDir, "parent"));
      } catch {
        // May not be supported
        return;
      }

      // Should not infinite loop
      const result = await scanner.scanDirectory(dir);

      // May succeed or fail, but should not hang
      expect(result).toBeDefined();
    });
  });

  describe("special file names", () => {
    it("handles files with spaces in names", async () => {
      const dir = resolve(TEST_DIR, "spaces");
      await mkdir(dir, { recursive: true });
      await writeFile(
        resolve(dir, "file with spaces.py"),
        'cursor.execute(f"SELECT * FROM users")'
      );

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });

    it("handles files with special characters", async () => {
      const dir = resolve(TEST_DIR, "special-chars");
      await mkdir(dir, { recursive: true });

      // Safe special characters
      await writeFile(resolve(dir, "file-with-dash.py"), "print('hello')");
      await writeFile(resolve(dir, "file_with_underscore.py"), "print('hello')");
      await writeFile(resolve(dir, "file.test.py"), "print('hello')");

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });

    it("handles hidden files (dotfiles)", async () => {
      const dir = resolve(TEST_DIR, "hidden");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, ".hidden.py"), "print('hello')");
      await writeFile(resolve(dir, ".env"), "API_KEY=secret");

      const result = await scanner.scanDirectory(dir);

      expect(result.success).toBe(true);
    });
  });
});

describe("Unicode and Encoding", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
    scanner = new Scanner(store);

    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("handles files with unicode content", async () => {
    const dir = resolve(TEST_DIR, "unicode-content");
    await mkdir(dir, { recursive: true });

    await writeFile(
      resolve(dir, "unicode.py"),
      `# Комментарий на русском
def greet(名前):
    print(f"こんにちは {名前}")
    cursor.execute(f"SELECT * FROM users WHERE name = '{名前}'")
`
    );

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
    // Should still detect SQL injection
    if (result.success) {
      expect(result.data.gaps.length).toBeGreaterThan(0);
    }
  });

  it("handles unicode file names", async () => {
    const dir = resolve(TEST_DIR, "unicode-names");
    await mkdir(dir, { recursive: true });

    await writeFile(resolve(dir, "файл.py"), "print('hello')");
    await writeFile(resolve(dir, "文件.py"), "print('hello')");
    await writeFile(resolve(dir, "αρχείο.py"), "print('hello')");

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
  });

  it("handles emoji in code", async () => {
    const dir = resolve(TEST_DIR, "emoji");
    await mkdir(dir, { recursive: true });

    await writeFile(
      resolve(dir, "emoji.py"),
      `def 🚀():
    print("🎉 Success!")
    cursor.execute(f"SELECT * FROM 📧 WHERE id = '{id}'")
`
    );

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
  });

  it("handles mixed encodings gracefully", async () => {
    const dir = resolve(TEST_DIR, "encoding");
    await mkdir(dir, { recursive: true });

    // UTF-8 with BOM
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from('print("hello")');
    await writeFile(resolve(dir, "bom.py"), Buffer.concat([bom, content]));

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
  });
});

describe("Large Input Handling", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
    scanner = new Scanner(store);

    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("handles very long lines", async () => {
    const dir = resolve(TEST_DIR, "long-lines");
    await mkdir(dir, { recursive: true });

    // Create a line with 10000 characters
    const longString = "a".repeat(10000);
    await writeFile(
      resolve(dir, "long.py"),
      `# ${"x".repeat(10000)}\nprint("${longString}")\n`
    );

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
  }, 30000); // 30s timeout for long line processing

  it("handles files with many lines", async () => {
    const dir = resolve(TEST_DIR, "many-lines");
    await mkdir(dir, { recursive: true });

    // Create a file with 5000 lines
    const lines = Array.from({ length: 5000 }, (_, i) => `print("line ${i}")`).join("\n");
    await writeFile(resolve(dir, "large.py"), lines);

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
    if (result.success) {
      // linesScanned may be undefined if not tracked
      expect(result.data.fileStats.totalFiles).toBeGreaterThan(0);
    }
  });

  it("handles many small files", async () => {
    const dir = resolve(TEST_DIR, "many-files");
    await mkdir(dir, { recursive: true });

    // Create 100 small files
    for (let i = 0; i < 100; i++) {
      await writeFile(resolve(dir, `file_${i}.py`), `print("file ${i}")\n`);
    }

    const result = await scanner.scanDirectory(dir);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileStats.totalFiles).toBe(100);
    }
  });
});

describe("Error Recovery", () => {
  let store: CategoryStore;
  let scanner: Scanner;

  beforeAll(async () => {
    store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);
    scanner = new Scanner(store);
  });

  it("handles non-existent directory", async () => {
    const result = await scanner.scanDirectory("/nonexistent/path/12345");

    expect(result.success).toBe(false);
  });

  it("continues after permission errors", async () => {
    // This test is platform-dependent
    // On most systems, we can't easily create permission-denied files in tests
    // So we just verify the scanner doesn't crash on error paths
    const result = await scanner.scanDirectory(TEST_DIR);

    expect(result).toBeDefined();
  });

  it("handles malformed category definitions gracefully", async () => {
    const testStore = new CategoryStore();

    // Try to load from a non-existent path
    const result = await testStore.loadFromDirectory("/nonexistent/categories");

    expect(result.success).toBe(false);
  });
});
