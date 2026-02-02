import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

import { glob } from "glob";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";

import { PinataError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { ok, err, tryCatchAsync } from "../../lib/result.js";

import {
  MigrationStateSchema,
  MIGRATOR_VERSION,
  MIGRATIONS_STATE_FILE,
} from "./migration.schema.js";

import type {
  MigrationScript,
  MigrationState,
  MigrationResult,
  MigrateOptions,
  RollbackOptions,
  AppliedMigration,
} from "./migration.schema.js";
import type { Result } from "../../lib/result.js";

/**
 * Error for migration-specific failures
 */
export class MigrationError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "MIGRATION_ERROR", context);
    this.name = "MigrationError";
  }
}

/**
 * Manages category schema migrations
 *
 * Handles loading migration scripts, tracking applied migrations,
 * and applying/rolling back changes to category definitions.
 *
 * @example
 * ```typescript
 * const migrator = new CategoryMigrator({
 *   migrationsDir: "./migrations",
 *   categoriesDir: "./src/categories/definitions",
 * });
 *
 * // Check pending migrations
 * const pending = await migrator.getPending();
 *
 * // Apply all pending migrations
 * const results = await migrator.migrate();
 *
 * // Rollback last migration
 * await migrator.rollback({ count: 1 });
 * ```
 */
export class CategoryMigrator {
  private readonly migrationsDir: string;
  private readonly categoriesDir: string;
  private readonly stateFilePath: string;
  private migrations: Map<string, MigrationScript> = new Map();
  private state: MigrationState | null = null;

  constructor(options: {
    migrationsDir: string;
    categoriesDir: string;
    stateFile?: string;
  }) {
    this.migrationsDir = options.migrationsDir;
    this.categoriesDir = options.categoriesDir;
    this.stateFilePath = options.stateFile ?? join(this.categoriesDir, MIGRATIONS_STATE_FILE);
  }

  /**
   * Initialize the migrator by loading migrations and state
   */
  async initialize(): Promise<Result<void, PinataError>> {
    const loadMigrationsResult = await this.loadMigrations();
    if (!loadMigrationsResult.success) {
      return loadMigrationsResult;
    }

    const loadStateResult = await this.loadState();
    if (!loadStateResult.success) {
      return loadStateResult;
    }

    return ok(undefined);
  }

  /**
   * Load migration scripts from the migrations directory
   */
  private async loadMigrations(): Promise<Result<void, PinataError>> {
    try {
      // Check if migrations directory exists
      const dirStat = await stat(this.migrationsDir).catch(() => null);
      if (!dirStat?.isDirectory()) {
        // Create migrations directory if it doesn't exist
        await mkdir(this.migrationsDir, { recursive: true });
        logger.debug(`Created migrations directory: ${this.migrationsDir}`);
        return ok(undefined);
      }

      // Find all migration files (.ts or .js)
      const pattern = join(this.migrationsDir, "*.{ts,js}");
      const globResult = await glob(pattern, { absolute: true });
      const files = Array.isArray(globResult) ? globResult : [];
      logger.debug(`Found ${files.length} migration files`);

      const sortedFiles = [...files].sort();
      for (const file of sortedFiles) {
        const result = await this.loadMigrationFile(file);
        if (!result.success) {
          logger.warn(`Failed to load migration from ${file}: ${result.error.message}`);
          continue;
        }

        const migration = result.data;
        if (this.migrations.has(migration.definition.id)) {
          return err(
            new MigrationError(`Duplicate migration ID: ${migration.definition.id}`, {
              file,
            })
          );
        }

        this.migrations.set(migration.definition.id, migration);
        logger.debug(`Loaded migration: ${migration.definition.id}`);
      }

      return ok(undefined);
    } catch (error) {
      return err(
        new MigrationError("Failed to load migrations", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Load a single migration file
   */
  private async loadMigrationFile(filePath: string): Promise<Result<MigrationScript, PinataError>> {
    try {
      // Dynamic import the migration file
      const module = await import(filePath);

      // Expect default export to be a MigrationScript
      const migration: MigrationScript = module.default ?? module;

      // Validate required fields
      if (!migration.definition || !migration.up || !migration.down) {
        return err(
          new ValidationError("Migration must export definition, up, and down", {
            filePath,
            hasDefinition: !!migration.definition,
            hasUp: !!migration.up,
            hasDown: !!migration.down,
          })
        );
      }

      if (!migration.definition.id) {
        return err(
          new ValidationError("Migration definition must have an id", { filePath })
        );
      }

      return ok(migration);
    } catch (error) {
      return err(
        new MigrationError(`Failed to load migration file: ${filePath}`, {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Load the migration state from the state file
   */
  private async loadState(): Promise<Result<void, PinataError>> {
    try {
      const stateContent = await readFile(this.stateFilePath, "utf-8").catch(() => null);

      if (!stateContent) {
        // Initialize empty state
        this.state = {
          version: 1,
          applied: [],
        };
        return ok(undefined);
      }

      const parsed = JSON.parse(stateContent);
      const validated = MigrationStateSchema.safeParse(parsed);

      if (!validated.success) {
        return err(
          new ValidationError("Invalid migration state file", {
            errors: validated.error.errors,
          })
        );
      }

      this.state = validated.data;
      return ok(undefined);
    } catch (error) {
      return err(
        new MigrationError("Failed to load migration state", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Save the migration state to the state file
   */
  private async saveState(): Promise<Result<void, PinataError>> {
    if (!this.state) {
      return err(new MigrationError("No state to save"));
    }

    try {
      this.state.lastRun = new Date().toISOString();
      const content = JSON.stringify(this.state, null, 2);
      await writeFile(this.stateFilePath, content, "utf-8");
      return ok(undefined);
    } catch (error) {
      return err(
        new MigrationError("Failed to save migration state", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Compute checksum for a migration script
   */
  private computeChecksum(migration: MigrationScript): string {
    const content = JSON.stringify({
      id: migration.definition.id,
      description: migration.definition.description,
      up: migration.up.toString(),
      down: migration.down.toString(),
    });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * Get list of applied migrations
   */
  getApplied(): AppliedMigration[] {
    return this.state?.applied ?? [];
  }

  /**
   * Get list of pending migrations (not yet applied)
   */
  getPending(): MigrationScript[] {
    const appliedIds = new Set(this.state?.applied.map((m) => m.id) ?? []);
    return Array.from(this.migrations.values())
      .filter((m) => !appliedIds.has(m.definition.id))
      .sort((a, b) => a.definition.id.localeCompare(b.definition.id));
  }

  /**
   * Get all available migrations
   */
  getAll(): MigrationScript[] {
    return Array.from(this.migrations.values()).sort((a, b) =>
      a.definition.id.localeCompare(b.definition.id)
    );
  }

  /**
   * Check if a specific migration has been applied
   */
  isApplied(migrationId: string): boolean {
    return this.state?.applied.some((m) => m.id === migrationId) ?? false;
  }

  /**
   * Get category files from the categories directory
   */
  private async getCategoryFiles(
    options?: Pick<MigrateOptions, "categories" | "domains">
  ): Promise<Result<string[], PinataError>> {
    try {
      const pattern = join(this.categoriesDir, "**/*.{yml,yaml}");

      if (options?.domains && options.domains.length > 0) {
        // Filter by domain subdirectories
        const domainPatterns = options.domains.map((d) =>
          join(this.categoriesDir, d, "*.{yml,yaml}")
        );
        const files: string[] = [];
        for (const p of domainPatterns) {
          const globResult = await glob(p, { absolute: true });
          const matches = Array.isArray(globResult) ? globResult : [];
          files.push(...matches);
        }
        return ok(files);
      }

      const globResult = await glob(pattern, { absolute: true });
      const files = Array.isArray(globResult) ? globResult : [];

      if (options?.categories && options.categories.length > 0) {
        // Filter by category ID (filename without extension)
        const categorySet = new Set(options.categories);
        const filtered = files.filter((f) => {
          const name = basename(f).replace(/\.(yml|yaml)$/, "");
          return categorySet.has(name);
        });
        return ok(filtered);
      }

      return ok(files);
    } catch (error) {
      return err(
        new MigrationError("Failed to get category files", {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Apply a single migration to a category file
   */
  private async applyMigrationToFile(
    filePath: string,
    migration: MigrationScript,
    direction: "up" | "down",
    dryRun: boolean
  ): Promise<Result<boolean, PinataError>> {
    try {
      const content = await readFile(filePath, "utf-8");
      const categoryData = loadYaml(content);

      // Check if migration applies to this category
      const def = migration.definition;
      if (def.targetCategories && def.targetCategories.length > 0) {
        const categoryId = (categoryData as { id?: string })?.id;
        if (categoryId && !def.targetCategories.includes(categoryId)) {
          return ok(false); // Skip - not a target
        }
      }

      // Apply the migration function
      const transformFn = direction === "up" ? migration.up : migration.down;
      const transformed = transformFn(categoryData);

      // Check if anything changed
      const originalYaml = dumpYaml(categoryData);
      const transformedYaml = dumpYaml(transformed);

      if (originalYaml === transformedYaml) {
        return ok(false); // No changes
      }

      if (!dryRun) {
        await writeFile(filePath, transformedYaml, "utf-8");
        logger.debug(`Applied migration ${migration.definition.id} to ${filePath}`);
      }

      return ok(true);
    } catch (error) {
      return err(
        new MigrationError(`Failed to apply migration to ${filePath}`, {
          migrationId: migration.definition.id,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Run pending migrations
   *
   * @param options Migration options
   * @returns Array of migration results
   */
  async migrate(options: MigrateOptions = {}): Promise<Result<MigrationResult[], PinataError>> {
    const { dryRun = false, stopOnError = true, upTo } = options;

    let pending = this.getPending();

    if (upTo) {
      const upToIndex = pending.findIndex((m) => m.definition.id === upTo);
      if (upToIndex === -1) {
        return err(new MigrationError(`Migration not found: ${upTo}`));
      }
      pending = pending.slice(0, upToIndex + 1);
    }

    if (pending.length === 0) {
      logger.info("No pending migrations");
      return ok([]);
    }

    const filesResult = await this.getCategoryFiles(options);
    if (!filesResult.success) {
      return filesResult;
    }
    const categoryFiles = filesResult.data ?? [];

    logger.info(
      `Running ${pending.length} migration(s) on ${categoryFiles.length} category file(s)${dryRun ? " (dry run)" : ""}`
    );

    const results: MigrationResult[] = [];

    for (const migration of pending) {
      const startTime = Date.now();
      let categoriesAffected = 0;
      let error: string | undefined;

      for (const file of categoryFiles) {
        const applyResult = await this.applyMigrationToFile(file, migration, "up", dryRun);

        if (!applyResult.success) {
          error = applyResult.error.message;
          if (stopOnError) {
            results.push({
              id: migration.definition.id,
              success: false,
              categoriesAffected,
              durationMs: Date.now() - startTime,
              error,
            });
            return ok(results);
          }
          continue;
        }

        if (applyResult.data) {
          categoriesAffected++;
        }
      }

      const result: MigrationResult = {
        id: migration.definition.id,
        success: !error,
        categoriesAffected,
        durationMs: Date.now() - startTime,
        ...(error !== undefined && { error }),
      };

      results.push(result);

      // Record the applied migration
      if (!dryRun && result.success) {
        this.state?.applied.push({
          id: migration.definition.id,
          appliedAt: new Date().toISOString(),
          checksum: this.computeChecksum(migration),
          migratorVersion: MIGRATOR_VERSION,
        });

        const saveResult = await this.saveState();
        if (!saveResult.success) {
          return saveResult;
        }
      }

      logger.info(
        `${dryRun ? "[DRY RUN] " : ""}Migration ${migration.definition.id}: ` +
          `${categoriesAffected} categories affected in ${result.durationMs}ms`
      );
    }

    return ok(results);
  }

  /**
   * Rollback applied migrations
   *
   * @param options Rollback options
   * @returns Array of migration results
   */
  async rollback(options: RollbackOptions = {}): Promise<Result<MigrationResult[], PinataError>> {
    const { count = 1, toId, dryRun = false } = options;

    if (!this.state || this.state.applied.length === 0) {
      logger.info("No migrations to rollback");
      return ok([]);
    }

    let toRollback: AppliedMigration[];

    if (toId) {
      const toIndex = this.state.applied.findIndex((m) => m.id === toId);
      if (toIndex === -1) {
        return err(new MigrationError(`Migration not found in history: ${toId}`));
      }
      // Rollback everything after toId (exclusive)
      toRollback = this.state.applied.slice(toIndex + 1).reverse();
    } else {
      // Rollback the last N migrations
      toRollback = this.state.applied.slice(-count).reverse();
    }

    if (toRollback.length === 0) {
      logger.info("No migrations to rollback");
      return ok([]);
    }

    const filesResult = await this.getCategoryFiles();
    if (!filesResult.success) {
      return filesResult;
    }
    const categoryFiles = filesResult.data;

    logger.info(
      `Rolling back ${toRollback.length} migration(s)${dryRun ? " (dry run)" : ""}`
    );

    const results: MigrationResult[] = [];

    for (const applied of toRollback) {
      const migration = this.migrations.get(applied.id);
      if (!migration) {
        results.push({
          id: applied.id,
          success: false,
          categoriesAffected: 0,
          durationMs: 0,
          error: `Migration script not found: ${applied.id}`,
        });
        continue;
      }

      const startTime = Date.now();
      let categoriesAffected = 0;
      let error: string | undefined;

      for (const file of categoryFiles) {
        const applyResult = await this.applyMigrationToFile(file, migration, "down", dryRun);

        if (!applyResult.success) {
          error = applyResult.error.message;
          break;
        }

        if (applyResult.data) {
          categoriesAffected++;
        }
      }

      const result: MigrationResult = {
        id: migration.definition.id,
        success: !error,
        categoriesAffected,
        durationMs: Date.now() - startTime,
        ...(error !== undefined && { error }),
      };

      results.push(result);

      // Remove from applied migrations
      if (!dryRun && result.success) {
        this.state.applied = this.state.applied.filter((m) => m.id !== applied.id);

        const saveResult = await this.saveState();
        if (!saveResult.success) {
          return saveResult;
        }
      }

      logger.info(
        `${dryRun ? "[DRY RUN] " : ""}Rolled back ${migration.definition.id}: ` +
          `${categoriesAffected} categories affected in ${result.durationMs}ms`
      );
    }

    return ok(results);
  }

  /**
   * Verify integrity of applied migrations
   * Checks that migration scripts haven't changed since they were applied
   */
  async verify(): Promise<Result<{ valid: boolean; issues: string[] }, PinataError>> {
    const issues: string[] = [];

    for (const applied of this.state?.applied ?? []) {
      const migration = this.migrations.get(applied.id);

      if (!migration) {
        issues.push(`Migration script missing: ${applied.id}`);
        continue;
      }

      const currentChecksum = this.computeChecksum(migration);
      if (currentChecksum !== applied.checksum) {
        issues.push(
          `Migration script modified since application: ${applied.id} ` +
            `(expected ${applied.checksum}, got ${currentChecksum})`
        );
      }
    }

    return ok({
      valid: issues.length === 0,
      issues,
    });
  }

  /**
   * Get migration status summary
   */
  getStatus(): {
    applied: number;
    pending: number;
    total: number;
    lastRun?: string;
  } {
    const applied = this.state?.applied.length ?? 0;
    const total = this.migrations.size;

    const lastRun = this.state?.lastRun;
    return {
      applied,
      pending: total - applied,
      total,
      ...(lastRun !== undefined && { lastRun }),
    };
  }

  /**
   * Register a migration programmatically (useful for testing)
   */
  registerMigration(migration: MigrationScript): void {
    this.migrations.set(migration.definition.id, migration);
  }

  /**
   * Clear registered migrations (useful for testing)
   */
  clearMigrations(): void {
    this.migrations.clear();
  }

  /**
   * Reset state (useful for testing)
   */
  resetState(): void {
    this.state = {
      version: 1,
      applied: [],
    };
  }
}

/**
 * Factory function to create and initialize a CategoryMigrator
 */
export async function createMigrator(options: {
  migrationsDir: string;
  categoriesDir: string;
  stateFile?: string;
}): Promise<Result<CategoryMigrator, PinataError>> {
  const migrator = new CategoryMigrator(options);
  const initResult = await migrator.initialize();

  if (!initResult.success) {
    return initResult;
  }

  return ok(migrator);
}
