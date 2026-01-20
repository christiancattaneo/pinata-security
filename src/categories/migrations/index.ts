/**
 * Category Migrations Module
 *
 * Provides tools for managing category schema migrations:
 * - Loading and applying migration scripts
 * - Tracking migration history
 * - Rollback support
 *
 * @example
 * ```typescript
 * import { createMigrator, type MigrationScript } from "@/categories/migrations";
 *
 * // Create a migrator instance
 * const migrator = await createMigrator({
 *   migrationsDir: "./migrations",
 *   categoriesDir: "./src/categories/definitions",
 * });
 *
 * // Apply pending migrations
 * if (migrator.success) {
 *   const results = await migrator.data.migrate();
 * }
 * ```
 */

// Schema exports
export {
  AppliedMigrationSchema,
  MigrationStateSchema,
  MigrationDefinitionSchema,
  MIGRATOR_VERSION,
  MIGRATIONS_STATE_FILE,
  type AppliedMigration,
  type MigrationState,
  type MigrationDefinition,
  type MigrationFn,
  type MigrationScript,
  type MigrationResult,
  type MigrateOptions,
  type RollbackOptions,
} from "./migration.schema.js";

// Migrator exports
export {
  CategoryMigrator,
  MigrationError,
  createMigrator,
} from "./migrator.js";
