import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  CategoryMigrator,
  MigrationError,
  createMigrator,
  type MigrationScript,
} from "@/categories/migrations/index.js";

describe("CategoryMigrator", () => {
  let testDir: string;
  let migrationsDir: string;
  let categoriesDir: string;
  let migrator: CategoryMigrator;

  // Sample category data for testing
  const sampleCategory = {
    id: "test-category",
    version: "1.0.0",
    name: "Test Category",
    description: "A test category for migration testing purposes",
    domain: "security",
    level: "unit",
    priority: "P1",
    severity: "high",
    applicableLanguages: ["python", "typescript"],
    detectionPatterns: [
      {
        id: "test-pattern",
        type: "regex",
        language: "python",
        pattern: "test.*pattern",
        confidence: "high",
        description: "A test detection pattern",
      },
    ],
    testTemplates: [
      {
        id: "test-template",
        language: "python",
        framework: "pytest",
        template: "def test_something():\n    assert True  # placeholder test template for migration testing",
        variables: [],
      },
    ],
    examples: [
      {
        name: "test-example",
        concept: "This is a test example concept for testing",
        vulnerableCode: "vulnerable = True",
        testCode: "def test_example():\n    assert not vulnerable  # Test the vulnerable code",
        language: "python",
        severity: "high",
      },
    ],
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  // Sample migration that adds a "tags" field
  const addTagsMigration: MigrationScript = {
    definition: {
      id: "001-add-tags-field",
      description: "Add tags field to all categories for better searchability",
    },
    up: (data: unknown) => {
      const category = data as Record<string, unknown>;
      return {
        ...category,
        tags: category["tags"] ?? ["default-tag"],
      };
    },
    down: (data: unknown) => {
      const category = data as Record<string, unknown>;
      const { tags, ...rest } = category;
      return rest;
    },
  };

  // Sample migration that renames a field
  const renameFieldMigration: MigrationScript = {
    definition: {
      id: "002-rename-severity-to-riskLevel",
      description: "Rename severity field to riskLevel for consistency",
    },
    up: (data: unknown) => {
      const category = data as Record<string, unknown>;
      const { severity, ...rest } = category;
      return {
        ...rest,
        riskLevel: severity,
      };
    },
    down: (data: unknown) => {
      const category = data as Record<string, unknown>;
      const { riskLevel, ...rest } = category;
      return {
        ...rest,
        severity: riskLevel,
      };
    },
  };

  beforeEach(async () => {
    // Create temporary test directories
    testDir = join(tmpdir(), `pinata-migrator-test-${Date.now()}`);
    migrationsDir = join(testDir, "migrations");
    categoriesDir = join(testDir, "categories");

    await mkdir(migrationsDir, { recursive: true });
    await mkdir(categoriesDir, { recursive: true });

    // Write sample category file
    await writeFile(
      join(categoriesDir, "test-category.yml"),
      dumpYaml(sampleCategory),
      "utf-8"
    );

    // Create migrator instance
    migrator = new CategoryMigrator({
      migrationsDir,
      categoriesDir,
    });
  });

  afterEach(async () => {
    // Clean up test directories
    await rm(testDir, { recursive: true, force: true });
  });

  describe("initialization", () => {
    it("initializes with empty migrations directory", async () => {
      const result = await migrator.initialize();
      if (!result.success) {
        console.error("Initialization failed:", result.error);
      }
      expect(result.success).toBe(true);
      expect(migrator.getAll()).toHaveLength(0);
      expect(migrator.getApplied()).toHaveLength(0);
    });

    it("creates migrations directory if it does not exist", async () => {
      const newMigrationsDir = join(testDir, "new-migrations");
      const newMigrator = new CategoryMigrator({
        migrationsDir: newMigrationsDir,
        categoriesDir,
      });

      const result = await newMigrator.initialize();
      expect(result.success).toBe(true);
    });

    it("loads registered migrations", async () => {
      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);
      migrator.registerMigration(renameFieldMigration);

      expect(migrator.getAll()).toHaveLength(2);
      expect(migrator.getPending()).toHaveLength(2);
    });
  });

  describe("migrate", () => {
    beforeEach(async () => {
      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);
      migrator.registerMigration(renameFieldMigration);
    });

    it("applies pending migrations in order", async () => {
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]?.id).toBe("001-add-tags-field");
        expect(result.data[0]?.success).toBe(true);
        expect(result.data[1]?.id).toBe("002-rename-severity-to-riskLevel");
        expect(result.data[1]?.success).toBe(true);
      }

      // Verify category was transformed
      const categoryContent = await readFile(
        join(categoriesDir, "test-category.yml"),
        "utf-8"
      );
      const category = loadYaml(categoryContent) as Record<string, unknown>;

      expect(category["tags"]).toEqual(["default-tag"]);
      expect(category["riskLevel"]).toBe("high");
      expect(category["severity"]).toBeUndefined();
    });

    it("tracks applied migrations", async () => {
      await migrator.migrate();

      expect(migrator.getApplied()).toHaveLength(2);
      expect(migrator.isApplied("001-add-tags-field")).toBe(true);
      expect(migrator.isApplied("002-rename-severity-to-riskLevel")).toBe(true);
      expect(migrator.getPending()).toHaveLength(0);
    });

    it("persists migration state to file", async () => {
      await migrator.migrate();

      const stateContent = await readFile(
        join(categoriesDir, ".migrations.json"),
        "utf-8"
      );
      const state = JSON.parse(stateContent);

      expect(state.version).toBe(1);
      expect(state.applied).toHaveLength(2);
      expect(state.applied[0].id).toBe("001-add-tags-field");
      expect(state.applied[1].id).toBe("002-rename-severity-to-riskLevel");
    });

    it("supports dry run mode", async () => {
      const result = await migrator.migrate({ dryRun: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }

      // Category should be unchanged
      const categoryContent = await readFile(
        join(categoriesDir, "test-category.yml"),
        "utf-8"
      );
      const category = loadYaml(categoryContent) as Record<string, unknown>;

      expect(category["tags"]).toBeUndefined();
      expect(category["severity"]).toBe("high");

      // No migrations should be recorded
      expect(migrator.getApplied()).toHaveLength(0);
    });

    it("applies migrations up to specified ID", async () => {
      const result = await migrator.migrate({ upTo: "001-add-tags-field" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.id).toBe("001-add-tags-field");
      }

      expect(migrator.getApplied()).toHaveLength(1);
      expect(migrator.getPending()).toHaveLength(1);
    });

    it("returns empty array when no pending migrations", async () => {
      await migrator.migrate();
      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it("reports categories affected count", async () => {
      // Add another category
      await writeFile(
        join(categoriesDir, "another-category.yml"),
        dumpYaml({ ...sampleCategory, id: "another-category" }),
        "utf-8"
      );

      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]?.categoriesAffected).toBe(2);
      }
    });
  });

  describe("rollback", () => {
    beforeEach(async () => {
      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);
      migrator.registerMigration(renameFieldMigration);
      await migrator.migrate();
    });

    it("rolls back the last migration by default", async () => {
      const result = await migrator.rollback();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.id).toBe("002-rename-severity-to-riskLevel");
        expect(result.data[0]?.success).toBe(true);
      }

      // Verify category was partially restored
      const categoryContent = await readFile(
        join(categoriesDir, "test-category.yml"),
        "utf-8"
      );
      const category = loadYaml(categoryContent) as Record<string, unknown>;

      expect(category["tags"]).toEqual(["default-tag"]); // Still has tags
      expect(category["severity"]).toBe("high"); // Restored
      expect(category["riskLevel"]).toBeUndefined(); // Removed

      expect(migrator.getApplied()).toHaveLength(1);
    });

    it("rolls back multiple migrations", async () => {
      const result = await migrator.rollback({ count: 2 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }

      // Verify category was fully restored
      const categoryContent = await readFile(
        join(categoriesDir, "test-category.yml"),
        "utf-8"
      );
      const category = loadYaml(categoryContent) as Record<string, unknown>;

      expect(category["tags"]).toBeUndefined();
      expect(category["severity"]).toBe("high");

      expect(migrator.getApplied()).toHaveLength(0);
    });

    it("rolls back to specific migration ID", async () => {
      const result = await migrator.rollback({ toId: "001-add-tags-field" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.id).toBe("002-rename-severity-to-riskLevel");
      }

      // Migration 001 should still be applied
      expect(migrator.isApplied("001-add-tags-field")).toBe(true);
      expect(migrator.isApplied("002-rename-severity-to-riskLevel")).toBe(false);
    });

    it("supports dry run mode", async () => {
      const result = await migrator.rollback({ dryRun: true });

      expect(result.success).toBe(true);

      // Migrations should still be applied
      expect(migrator.getApplied()).toHaveLength(2);

      // Category should be unchanged
      const categoryContent = await readFile(
        join(categoriesDir, "test-category.yml"),
        "utf-8"
      );
      const category = loadYaml(categoryContent) as Record<string, unknown>;

      expect(category["riskLevel"]).toBe("high");
    });

    it("returns empty array when nothing to rollback", async () => {
      await migrator.rollback({ count: 2 });
      const result = await migrator.rollback();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });
  });

  describe("verify", () => {
    beforeEach(async () => {
      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);
      await migrator.migrate();
    });

    it("returns valid when checksums match", async () => {
      const result = await migrator.verify();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(true);
        expect(result.data.issues).toHaveLength(0);
      }
    });

    it("detects missing migration scripts", async () => {
      migrator.clearMigrations();

      const result = await migrator.verify();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.issues).toContain("Migration script missing: 001-add-tags-field");
      }
    });

    it("detects modified migration scripts", async () => {
      // Replace with a modified version
      const modifiedMigration: MigrationScript = {
        ...addTagsMigration,
        up: (data: unknown) => ({
          ...(data as Record<string, unknown>),
          tags: ["modified-tag"],
        }),
      };
      migrator.clearMigrations();
      migrator.registerMigration(modifiedMigration);

      const result = await migrator.verify();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.valid).toBe(false);
        expect(result.data.issues.some((i) => i.includes("modified since application"))).toBe(true);
      }
    });
  });

  describe("getStatus", () => {
    it("returns correct status summary", async () => {
      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);
      migrator.registerMigration(renameFieldMigration);

      let status = migrator.getStatus();
      expect(status.applied).toBe(0);
      expect(status.pending).toBe(2);
      expect(status.total).toBe(2);

      await migrator.migrate({ upTo: "001-add-tags-field" });

      status = migrator.getStatus();
      expect(status.applied).toBe(1);
      expect(status.pending).toBe(1);
      expect(status.total).toBe(2);
      expect(status.lastRun).toBeDefined();
    });
  });

  describe("createMigrator factory", () => {
    it("creates and initializes migrator", async () => {
      const result = await createMigrator({
        migrationsDir,
        categoriesDir,
      });

      if (!result.success) {
        console.error("createMigrator failed:", result.error);
      }
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeInstanceOf(CategoryMigrator);
      }
    });
  });

  describe("edge cases", () => {
    it("handles categories with subdirectories", async () => {
      // Create subdirectory with category
      const subDir = join(categoriesDir, "security");
      await mkdir(subDir, { recursive: true });
      await writeFile(
        join(subDir, "nested-category.yml"),
        dumpYaml({ ...sampleCategory, id: "nested-category" }),
        "utf-8"
      );

      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);

      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]?.categoriesAffected).toBe(2);
      }

      // Verify nested category was transformed
      const nestedContent = await readFile(
        join(subDir, "nested-category.yml"),
        "utf-8"
      );
      const nested = loadYaml(nestedContent) as Record<string, unknown>;
      expect(nested["tags"]).toEqual(["default-tag"]);
    });

    it("skips categories not matching target filter", async () => {
      const targetedMigration: MigrationScript = {
        definition: {
          id: "003-targeted-migration",
          description: "Only affects specific categories for testing targeted migrations",
          targetCategories: ["test-category"],
        },
        up: (data: unknown) => ({
          ...(data as Record<string, unknown>),
          targeted: true,
        }),
        down: (data: unknown) => {
          const { targeted, ...rest } = data as Record<string, unknown>;
          return rest;
        },
      };

      // Add another category that should NOT be affected
      await writeFile(
        join(categoriesDir, "other-category.yml"),
        dumpYaml({ ...sampleCategory, id: "other-category" }),
        "utf-8"
      );

      await migrator.initialize();
      migrator.registerMigration(targetedMigration);

      await migrator.migrate();

      // Check test-category was affected
      const testContent = await readFile(
        join(categoriesDir, "test-category.yml"),
        "utf-8"
      );
      const testCategory = loadYaml(testContent) as Record<string, unknown>;
      expect(testCategory["targeted"]).toBe(true);

      // Check other-category was NOT affected
      const otherContent = await readFile(
        join(categoriesDir, "other-category.yml"),
        "utf-8"
      );
      const otherCategory = loadYaml(otherContent) as Record<string, unknown>;
      expect(otherCategory["targeted"]).toBeUndefined();
    });

    it("handles migration that makes no changes", async () => {
      const noOpMigration: MigrationScript = {
        definition: {
          id: "004-no-op-migration",
          description: "A migration that does not change anything for testing",
        },
        up: (data: unknown) => data,
        down: (data: unknown) => data,
      };

      await migrator.initialize();
      migrator.registerMigration(noOpMigration);

      const result = await migrator.migrate();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]?.categoriesAffected).toBe(0);
        expect(result.data[0]?.success).toBe(true);
      }
    });

    it("restores state across new migrator instances", async () => {
      await migrator.initialize();
      migrator.registerMigration(addTagsMigration);
      migrator.registerMigration(renameFieldMigration);
      await migrator.migrate({ upTo: "001-add-tags-field" });

      // Create new migrator instance
      const newMigrator = new CategoryMigrator({
        migrationsDir,
        categoriesDir,
      });
      await newMigrator.initialize();
      newMigrator.registerMigration(addTagsMigration);
      newMigrator.registerMigration(renameFieldMigration);

      expect(newMigrator.isApplied("001-add-tags-field")).toBe(true);
      expect(newMigrator.isApplied("002-rename-severity-to-riskLevel")).toBe(false);
      expect(newMigrator.getPending()).toHaveLength(1);
    });
  });
});

describe("MigrationError", () => {
  it("creates error with correct properties", () => {
    const error = new MigrationError("Test error", { key: "value" });

    expect(error.name).toBe("MigrationError");
    expect(error.code).toBe("MIGRATION_ERROR");
    expect(error.message).toBe("Test error");
    expect(error.context).toEqual({ key: "value" });
  });
});
