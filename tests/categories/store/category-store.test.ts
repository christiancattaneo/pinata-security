import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

import { CategoryStore, createCategoryStore } from "@/categories/store/category-store.js";
import { createTestCategory, createTestPattern, createTestTemplate, createTestExample } from "@tests/fixtures/categories.js";

describe("CategoryStore", () => {
  let store: CategoryStore;

  beforeEach(() => {
    store = createCategoryStore();
  });

  describe("add", () => {
    it("adds valid category to store", () => {
      const category = createTestCategory({ id: "test-category" });
      const result = store.add(category);

      expect(result.success).toBe(true);
      expect(store.size).toBe(1);
    });

    it("returns the validated category", () => {
      const category = createTestCategory({ id: "test-category" });
      const result = store.add(category);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("test-category");
        expect(result.data.name).toBe(category.name);
      }
    });

    it("rejects category with invalid ID format", () => {
      const category = createTestCategory({ id: "Invalid_ID" });
      const result = store.add(category);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("rejects duplicate category ID with same version", () => {
      const category1 = createTestCategory({ id: "duplicate", version: 1 });
      const category2 = createTestCategory({ id: "duplicate", version: 1 });

      store.add(category1);
      const result = store.add(category2);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("already exists");
      }
    });

    it("allows update with higher version", () => {
      const category1 = createTestCategory({ id: "versioned", version: 1, name: "Original" });
      const category2 = createTestCategory({ id: "versioned", version: 2, name: "Updated" });

      store.add(category1);
      const result = store.add(category2);

      expect(result.success).toBe(true);
      expect(store.size).toBe(1);

      const retrieved = store.get("versioned");
      if (retrieved.success) {
        expect(retrieved.data.name).toBe("Updated");
      }
    });

    it("rejects update with lower version", () => {
      const category1 = createTestCategory({ id: "versioned", version: 2 });
      const category2 = createTestCategory({ id: "versioned", version: 1 });

      store.add(category1);
      const result = store.add(category2);

      expect(result.success).toBe(false);
    });

    it("rejects category with empty detection patterns", () => {
      const category = createTestCategory({ detectionPatterns: [] });
      const result = store.add(category);

      expect(result.success).toBe(false);
    });

    it("rejects category with empty test templates", () => {
      const category = createTestCategory({ testTemplates: [] });
      const result = store.add(category);

      expect(result.success).toBe(false);
    });
  });

  describe("get", () => {
    it("returns category by ID", () => {
      const category = createTestCategory({ id: "get-test" });
      store.add(category);

      const result = store.get("get-test");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("get-test");
      }
    });

    it("returns error for non-existent category", () => {
      const result = store.get("non-existent");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("CATEGORY_NOT_FOUND");
      }
    });
  });

  describe("has", () => {
    it("returns true for existing category", () => {
      store.add(createTestCategory({ id: "exists" }));
      expect(store.has("exists")).toBe(true);
    });

    it("returns false for non-existent category", () => {
      expect(store.has("does-not-exist")).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes category by ID", () => {
      store.add(createTestCategory({ id: "to-remove" }));
      expect(store.size).toBe(1);

      const result = store.remove("to-remove");

      expect(result.success).toBe(true);
      expect(store.size).toBe(0);
      expect(store.has("to-remove")).toBe(false);
    });

    it("returns the removed category", () => {
      store.add(createTestCategory({ id: "to-remove", name: "Remove Me" }));
      const result = store.remove("to-remove");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Remove Me");
      }
    });

    it("returns error for non-existent category", () => {
      const result = store.remove("non-existent");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("CATEGORY_NOT_FOUND");
      }
    });

    it("removes category from indexes", () => {
      store.add(createTestCategory({ id: "indexed", domain: "security" }));
      store.remove("indexed");

      const securityCategories = store.byDomain("security");
      expect(securityCategories).toHaveLength(0);
    });
  });

  describe("list", () => {
    beforeEach(() => {
      store.add(createTestCategory({ id: "security-1", domain: "security", priority: "P0" }));
      store.add(createTestCategory({ id: "security-2", domain: "security", priority: "P1" }));
      store.add(createTestCategory({ id: "data-1", domain: "data", priority: "P0" }));
      store.add(createTestCategory({ id: "data-2", domain: "data", priority: "P2" }));
    });

    it("returns all categories when no filter", () => {
      const categories = store.list();
      expect(categories).toHaveLength(4);
    });

    it("filters by domain", () => {
      const categories = store.list({ domain: "security" });
      expect(categories).toHaveLength(2);
      expect(categories.every((c) => c.domain === "security")).toBe(true);
    });

    it("filters by priority", () => {
      const categories = store.list({ priority: "P0" });
      expect(categories).toHaveLength(2);
      expect(categories.every((c) => c.priority === "P0")).toBe(true);
    });

    it("filters by multiple criteria", () => {
      const categories = store.list({ domain: "security", priority: "P0" });
      expect(categories).toHaveLength(1);
      expect(categories[0]?.id).toBe("security-1");
    });

    it("returns empty array for no matches", () => {
      const categories = store.list({ domain: "concurrency" });
      expect(categories).toHaveLength(0);
    });

    it("sorts by priority then name", () => {
      const categories = store.list();
      // P0 categories should come first
      expect(categories[0]?.priority).toBe("P0");
      expect(categories[1]?.priority).toBe("P0");
    });
  });

  describe("byDomain", () => {
    it("returns categories in specific domain", () => {
      store.add(createTestCategory({ id: "sec-1", domain: "security" }));
      store.add(createTestCategory({ id: "sec-2", domain: "security" }));
      store.add(createTestCategory({ id: "data-1", domain: "data" }));

      const securityCategories = store.byDomain("security");

      expect(securityCategories).toHaveLength(2);
      expect(securityCategories.every((c) => c.domain === "security")).toBe(true);
    });
  });

  describe("byLevel", () => {
    it("returns categories at specific level", () => {
      store.add(createTestCategory({ id: "unit-1", level: "unit" }));
      store.add(createTestCategory({ id: "int-1", level: "integration" }));
      store.add(createTestCategory({ id: "int-2", level: "integration" }));

      const integrationCategories = store.byLevel("integration");

      expect(integrationCategories).toHaveLength(2);
      expect(integrationCategories.every((c) => c.level === "integration")).toBe(true);
    });
  });

  describe("byLanguage", () => {
    it("returns categories applicable to language", () => {
      store.add(createTestCategory({ id: "py-only", applicableLanguages: ["python"] }));
      store.add(createTestCategory({ id: "py-ts", applicableLanguages: ["python", "typescript"] }));
      store.add(createTestCategory({ id: "ts-only", applicableLanguages: ["typescript"] }));

      const pythonCategories = store.byLanguage("python");

      expect(pythonCategories).toHaveLength(2);
      const ids = pythonCategories.map((c) => c.id);
      expect(ids).toContain("py-only");
      expect(ids).toContain("py-ts");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      store.add(
        createTestCategory({
          id: "sql-injection",
          name: "SQL Injection",
          description: "Detect SQL injection vulnerabilities in database queries",
          domain: "security",
        })
      );
      store.add(
        createTestCategory({
          id: "command-injection",
          name: "Command Injection",
          description: "Detect command injection in shell execution",
          domain: "security",
        })
      );
      store.add(
        createTestCategory({
          id: "race-condition",
          name: "Race Condition",
          description: "Detect race conditions in concurrent code",
          domain: "concurrency",
        })
      );
    });

    it("finds categories by name", () => {
      const results = store.search({ query: "SQL" });

      expect(results).toHaveLength(1);
      expect(results[0]?.category.id).toBe("sql-injection");
    });

    it("finds categories by description", () => {
      const results = store.search({ query: "shell execution" });

      expect(results).toHaveLength(1);
      expect(results[0]?.category.id).toBe("command-injection");
    });

    it("finds categories by ID", () => {
      const results = store.search({ query: "race-condition" });

      expect(results).toHaveLength(1);
      expect(results[0]?.category.id).toBe("race-condition");
    });

    it("finds multiple matching categories", () => {
      const results = store.search({ query: "injection" });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.category.id);
      expect(ids).toContain("sql-injection");
      expect(ids).toContain("command-injection");
    });

    it("returns empty for no matches", () => {
      const results = store.search({ query: "nonexistent" });
      expect(results).toHaveLength(0);
    });

    it("applies domain filter", () => {
      const results = store.search({
        query: "injection",
        filter: { domain: "security" },
      });

      expect(results).toHaveLength(2);
    });

    it("excludes non-matching domain", () => {
      const results = store.search({
        query: "condition",
        filter: { domain: "security" },
      });

      expect(results).toHaveLength(0);
    });

    it("respects limit option", () => {
      const results = store.search({ query: "injection", limit: 1 });
      expect(results).toHaveLength(1);
    });

    it("includes match information", () => {
      const results = store.search({ query: "SQL" });

      expect(results[0]?.matches).toBeDefined();
      expect(results[0]?.matches.length).toBeGreaterThan(0);
    });

    it("handles case insensitivity", () => {
      const results = store.search({ query: "SQL" });
      expect(results).toHaveLength(1);
      expect(results[0]?.category.id).toBe("sql-injection");
    });

    it("handles partial matches (prefix)", () => {
      const results = store.search({ query: "inject" });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("toArray", () => {
    it("returns all categories as array", () => {
      store.add(createTestCategory({ id: "cat-1" }));
      store.add(createTestCategory({ id: "cat-2" }));
      store.add(createTestCategory({ id: "cat-3" }));

      const categories = store.toArray();

      expect(categories).toHaveLength(3);
      expect(categories[0]).toHaveProperty("id");
      expect(categories[0]).toHaveProperty("detectionPatterns");
    });
  });

  describe("clear", () => {
    it("removes all categories", () => {
      store.add(createTestCategory({ id: "cat-1" }));
      store.add(createTestCategory({ id: "cat-2" }));

      store.clear();

      expect(store.size).toBe(0);
      expect(store.has("cat-1")).toBe(false);
    });

    it("clears all indexes", () => {
      store.add(createTestCategory({ id: "cat-1", domain: "security" }));
      store.clear();

      const securityCategories = store.byDomain("security");
      expect(securityCategories).toHaveLength(0);
    });
  });

  describe("stats", () => {
    it("returns statistics about loaded categories", () => {
      store.add(createTestCategory({ id: "sec-1", domain: "security", level: "unit", priority: "P0" }));
      store.add(createTestCategory({ id: "sec-2", domain: "security", level: "integration", priority: "P1" }));
      store.add(createTestCategory({ id: "data-1", domain: "data", level: "integration", priority: "P0" }));

      const stats = store.stats();

      expect(stats.total).toBe(3);
      expect(stats.byDomain["security"]).toBe(2);
      expect(stats.byDomain["data"]).toBe(1);
      expect(stats.byLevel["integration"]).toBe(2);
      expect(stats.byLevel["unit"]).toBe(1);
      expect(stats.byPriority["P0"]).toBe(2);
      expect(stats.byPriority["P1"]).toBe(1);
    });
  });

  describe("loadFromDirectory", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pinata-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("loads categories from YAML files", async () => {
      const category = createTestCategory({ id: "yaml-test" });
      const yamlContent = `
id: yaml-test
version: 1
name: YAML Test Category
description: A test category loaded from YAML file for testing purposes
domain: security
level: integration
priority: P0
severity: critical
applicableLanguages:
  - python
  - typescript
detectionPatterns:
  - id: test-pattern
    type: regex
    language: python
    pattern: "test.*pattern"
    confidence: high
    description: A test pattern for detection testing
testTemplates:
  - id: test-template
    language: python
    framework: pytest
    template: |
      def test_example():
          assert True, "This is a test template for testing purposes"
    variables: []
examples:
  - name: test-example
    concept: A test example showing vulnerable code patterns
    vulnerableCode: "exec(user_input)"
    testCode: |
      def test_example():
          with pytest.raises(ValueError):
              dangerous_function("malicious")
    language: python
    severity: critical
createdAt: 2024-01-01
updatedAt: 2024-01-01
`;

      await fs.writeFile(path.join(tempDir, "test-category.yml"), yamlContent);

      const result = await store.loadFromDirectory(tempDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(1);
      }
      expect(store.has("yaml-test")).toBe(true);
    });

    it("loads categories from nested directories", async () => {
      const subDir = path.join(tempDir, "security");
      await fs.mkdir(subDir);

      const yamlContent = `
id: nested-test
version: 1
name: Nested Test
description: A nested test category for directory loading in subdirectories
domain: security
level: unit
priority: P1
severity: high
applicableLanguages: [python]
detectionPatterns:
  - id: nested-pattern
    type: regex
    language: python
    pattern: "nested"
    confidence: medium
    description: A pattern in a nested directory for testing
testTemplates:
  - id: nested-template
    language: python
    framework: pytest
    template: |
      import pytest
      
      def test_nested_functionality():
          """Test nested category loading from subdirectories"""
          assert True, "Nested test should pass"
    variables: []
examples:
  - name: nested-example
    concept: Testing nested directory loading functionality for YAML files
    vulnerableCode: "dangerous_nested_function(user_input)"
    testCode: |
      import pytest
      
      def test_nested_example():
          """Test that nested examples work correctly"""
          with pytest.raises(ValueError):
              dangerous_nested_function("malicious")
    language: python
    severity: high
createdAt: 2024-01-01
updatedAt: 2024-01-01
`;

      await fs.writeFile(path.join(subDir, "nested.yml"), yamlContent);

      const result = await store.loadFromDirectory(tempDir);

      expect(result.success).toBe(true);
      expect(store.has("nested-test")).toBe(true);
    });

    it("handles empty directory", async () => {
      const result = await store.loadFromDirectory(tempDir);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });

    it("returns error for invalid YAML", async () => {
      await fs.writeFile(path.join(tempDir, "invalid.yml"), "id: missing-fields");

      const result = await store.loadFromDirectory(tempDir);

      expect(result.success).toBe(false);
    });
  });
});

describe("createCategoryStore", () => {
  it("creates a new empty store", () => {
    const store = createCategoryStore();
    expect(store).toBeInstanceOf(CategoryStore);
    expect(store.size).toBe(0);
  });
});
