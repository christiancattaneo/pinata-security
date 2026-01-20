import { z } from "zod";

/**
 * Schema for migration metadata stored in .migrations.json
 */
export const AppliedMigrationSchema = z.object({
  /** Unique migration identifier (e.g., "20240115-add-tags-field") */
  id: z.string().regex(/^[a-z0-9-]+$/, "Migration ID must be lowercase alphanumeric with hyphens"),

  /** ISO timestamp when migration was applied */
  appliedAt: z.string().datetime(),

  /** Checksum of the migration file for integrity verification */
  checksum: z.string(),

  /** Version of the migrator that applied this migration */
  migratorVersion: z.string(),
});

/**
 * Schema for the .migrations.json file
 */
export const MigrationStateSchema = z.object({
  /** Version of this state file format */
  version: z.literal(1),

  /** List of applied migrations in order */
  applied: z.array(AppliedMigrationSchema),

  /** Last time migrations were run */
  lastRun: z.string().datetime().optional(),
});

/**
 * Schema for migration script definition
 */
export const MigrationDefinitionSchema = z.object({
  /** Unique migration identifier */
  id: z.string().regex(/^[a-z0-9-]+$/, "Migration ID must be lowercase alphanumeric with hyphens"),

  /** Human-readable description of what this migration does */
  description: z.string().min(10, "Description must be at least 10 characters"),

  /** Version this migration upgrades FROM (semver) */
  fromVersion: z.string().optional(),

  /** Version this migration upgrades TO (semver) */
  toVersion: z.string().optional(),

  /** Target category IDs this migration applies to (empty = all) */
  targetCategories: z.array(z.string()).optional(),

  /** Target domains this migration applies to (empty = all) */
  targetDomains: z.array(z.string()).optional(),
});

// Inferred types
export type AppliedMigration = z.infer<typeof AppliedMigrationSchema>;
export type MigrationState = z.infer<typeof MigrationStateSchema>;
export type MigrationDefinition = z.infer<typeof MigrationDefinitionSchema>;

/**
 * Migration function signature for transforming category data
 */
export type MigrationFn = (categoryData: unknown) => unknown;

/**
 * Complete migration script with up/down functions
 */
export interface MigrationScript {
  /** Migration metadata */
  definition: MigrationDefinition;

  /**
   * Apply the migration (upgrade)
   * @param categoryData Raw category data to transform
   * @returns Transformed category data
   */
  up: MigrationFn;

  /**
   * Rollback the migration (downgrade)
   * @param categoryData Raw category data to transform
   * @returns Transformed category data (previous version)
   */
  down: MigrationFn;
}

/**
 * Result of running a migration
 */
export interface MigrationResult {
  /** Migration ID */
  id: string;

  /** Whether migration succeeded */
  success: boolean;

  /** Number of categories affected */
  categoriesAffected: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Options for running migrations
 */
export interface MigrateOptions {
  /** Dry run - don't actually apply changes */
  dryRun?: boolean;

  /** Stop on first error */
  stopOnError?: boolean;

  /** Only run migrations up to this ID (inclusive) */
  upTo?: string;

  /** Filter by target categories */
  categories?: string[];

  /** Filter by target domains */
  domains?: string[];
}

/**
 * Options for rollback
 */
export interface RollbackOptions {
  /** Number of migrations to rollback (default: 1) */
  count?: number;

  /** Rollback to specific migration ID (exclusive - that migration stays) */
  toId?: string;

  /** Dry run - don't actually apply changes */
  dryRun?: boolean;
}

/**
 * Current version of the migrator
 */
export const MIGRATOR_VERSION = "1.0.0";

/**
 * Default migrations state file name
 */
export const MIGRATIONS_STATE_FILE = ".migrations.json";
