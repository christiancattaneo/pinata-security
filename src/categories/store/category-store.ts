import fs from "fs/promises";
import path from "path";

import YAML from "yaml";

import { ValidationError, CategoryNotFoundError } from "../../lib/errors.js";
import { ok, err, all, tryCatchAsync } from "../../lib/result.js";
import { CategorySchema, CategorySummarySchema } from "../schema/index.js";

import type { Result } from "../../lib/result.js";
import type {
  Category,
  CategorySummary,
  RiskDomain,
  TestLevel,
  Language,
  Priority,
  Severity,
} from "../schema/index.js";

/**
 * Options for filtering categories
 */
export interface CategoryFilter {
  domain?: RiskDomain;
  level?: TestLevel;
  language?: Language;
  priority?: Priority;
  severity?: Severity;
}

/**
 * Options for searching categories
 */
export interface SearchOptions {
  query: string;
  filter?: CategoryFilter;
  limit?: number;
}

/**
 * Search result with relevance score
 */
export interface SearchResult {
  category: CategorySummary;
  score: number;
  matches: string[];
}

/**
 * Store for managing test categories
 *
 * Provides:
 * - CRUD operations for categories
 * - Indexing by domain, level, language
 * - Full-text search
 * - Validation on load
 */
export class CategoryStore {
  /** All loaded categories by ID */
  private categories: Map<string, Category> = new Map();

  /** Index by domain */
  private domainIndex: Map<RiskDomain, Set<string>> = new Map();

  /** Index by level */
  private levelIndex: Map<TestLevel, Set<string>> = new Map();

  /** Index by language */
  private languageIndex: Map<Language, Set<string>> = new Map();

  /** Index by priority */
  private priorityIndex: Map<Priority, Set<string>> = new Map();

  /** Search index: word -> category IDs */
  private searchIndex: Map<string, Set<string>> = new Map();

  /** Version tracking for loaded categories */
  private versions: Map<string, number> = new Map();

  /**
   * Get total number of loaded categories
   */
  get size(): number {
    return this.categories.size;
  }

  /**
   * Load a single category into the store
   */
  add(category: Category): Result<Category, ValidationError> {
    // Validate the category
    const validation = CategorySchema.safeParse(category);
    if (!validation.success) {
      return err(
        new ValidationError("Invalid category", {
          categoryId: category.id,
          issues: validation.error.issues,
        })
      );
    }

    const validated = validation.data;

    // Check for duplicate ID
    const existing = this.categories.get(validated.id);
    if (existing !== undefined) {
      // Allow update if version is higher
      const existingVersion = this.versions.get(validated.id) ?? 0;
      if (validated.version <= existingVersion) {
        return err(
          new ValidationError(`Category ${validated.id} already exists with same or higher version`, {
            categoryId: validated.id,
            existingVersion,
            newVersion: validated.version,
          })
        );
      }
      // Remove old indexes before updating
      this.removeFromIndexes(existing);
    }

    // Store category
    this.categories.set(validated.id, validated);
    this.versions.set(validated.id, validated.version);

    // Update indexes
    this.addToIndexes(validated);

    return ok(validated);
  }

  /**
   * Get a category by ID
   */
  get(id: string): Result<Category, CategoryNotFoundError> {
    const category = this.categories.get(id);
    if (category === undefined) {
      return err(new CategoryNotFoundError(id));
    }
    return ok(category);
  }

  /**
   * Check if a category exists
   */
  has(id: string): boolean {
    return this.categories.has(id);
  }

  /**
   * Remove a category by ID
   */
  remove(id: string): Result<Category, CategoryNotFoundError> {
    const category = this.categories.get(id);
    if (category === undefined) {
      return err(new CategoryNotFoundError(id));
    }

    this.removeFromIndexes(category);
    this.categories.delete(id);
    this.versions.delete(id);

    return ok(category);
  }

  /**
   * List all categories, optionally filtered
   */
  list(filter?: CategoryFilter): CategorySummary[] {
    let ids: Set<string> | undefined;

    // Apply filters by intersecting index sets
    if (filter?.domain !== undefined) {
      const domainIds = this.domainIndex.get(filter.domain);
      if (domainIds === undefined) return []; // No categories in this domain
      ids = this.intersect(ids, domainIds);
    }
    if (filter?.level !== undefined) {
      const levelIds = this.levelIndex.get(filter.level);
      if (levelIds === undefined) return []; // No categories at this level
      ids = this.intersect(ids, levelIds);
    }
    if (filter?.language !== undefined) {
      const langIds = this.languageIndex.get(filter.language);
      if (langIds === undefined) return []; // No categories for this language
      ids = this.intersect(ids, langIds);
    }
    if (filter?.priority !== undefined) {
      const priorityIds = this.priorityIndex.get(filter.priority);
      if (priorityIds === undefined) return []; // No categories at this priority
      ids = this.intersect(ids, priorityIds);
    }

    // Get categories for matching IDs
    const categories: CategorySummary[] = [];
    const targetIds = ids ?? this.categories.keys();

    for (const id of targetIds) {
      const category = this.categories.get(id);
      if (category !== undefined) {
        // Apply severity filter if specified
        if (filter?.severity !== undefined && category.severity !== filter.severity) {
          continue;
        }
        categories.push(this.toSummary(category));
      }
    }

    // Sort by priority, then severity, then name
    return categories.sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2 };
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get all categories in a specific domain
   */
  byDomain(domain: RiskDomain): CategorySummary[] {
    return this.list({ domain });
  }

  /**
   * Get all categories at a specific test level
   */
  byLevel(level: TestLevel): CategorySummary[] {
    return this.list({ level });
  }

  /**
   * Get all categories applicable to a language
   */
  byLanguage(language: Language): CategorySummary[] {
    return this.list({ language });
  }

  /**
   * Full-text search across categories
   */
  search(options: SearchOptions): SearchResult[] {
    const { query, filter, limit = 20 } = options;

    // Tokenize query
    const queryTokens = this.tokenize(query.toLowerCase());
    if (queryTokens.length === 0) {
      return [];
    }

    // Find matching category IDs
    const scores: Map<string, { score: number; matches: string[] }> = new Map();

    for (const token of queryTokens) {
      // Exact match
      const exactMatches = this.searchIndex.get(token);
      if (exactMatches !== undefined) {
        for (const id of exactMatches) {
          const current = scores.get(id) ?? { score: 0, matches: [] };
          current.score += 10; // Exact match weight
          current.matches.push(token);
          scores.set(id, current);
        }
      }

      // Prefix match
      for (const [indexToken, ids] of this.searchIndex) {
        if (indexToken.startsWith(token) && indexToken !== token) {
          for (const id of ids) {
            const current = scores.get(id) ?? { score: 0, matches: [] };
            current.score += 5; // Prefix match weight
            if (!current.matches.includes(token)) {
              current.matches.push(token);
            }
            scores.set(id, current);
          }
        }
      }
    }

    // Build results with category data
    const results: SearchResult[] = [];

    for (const [id, { score, matches }] of scores) {
      const category = this.categories.get(id);
      if (category === undefined) continue;

      // Apply filters
      if (filter !== undefined) {
        if (filter.domain !== undefined && category.domain !== filter.domain) continue;
        if (filter.level !== undefined && category.level !== filter.level) continue;
        if (filter.priority !== undefined && category.priority !== filter.priority) continue;
        if (filter.severity !== undefined && category.severity !== filter.severity) continue;
        if (
          filter.language !== undefined &&
          !category.applicableLanguages.includes(filter.language)
        ) {
          continue;
        }
      }

      results.push({
        category: this.toSummary(category),
        score,
        matches: [...new Set(matches)],
      });
    }

    // Sort by score descending, then by priority
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const priorityOrder = { P0: 0, P1: 1, P2: 2 };
      return priorityOrder[a.category.priority] - priorityOrder[b.category.priority];
    });

    return results.slice(0, limit);
  }

  /**
   * Load categories from a directory of YAML files
   */
  async loadFromDirectory(dirPath: string): Promise<Result<number, ValidationError>> {
    const results = await this.loadYamlFilesRecursive(dirPath);
    const combined = all(results);

    if (!combined.success) {
      return combined;
    }

    return ok(combined.data.length);
  }

  /**
   * Load a single category from a YAML file
   */
  async loadFromFile(filePath: string): Promise<Result<Category, ValidationError>> {
    const result = await tryCatchAsync(async () => {
      const content = await fs.readFile(filePath, "utf-8");
      return YAML.parse(content) as unknown;
    });

    if (!result.success) {
      return err(
        new ValidationError(`Failed to read category file: ${filePath}`, {
          filePath,
          cause: result.error.message,
        })
      );
    }

    const validation = CategorySchema.safeParse(result.data);
    if (!validation.success) {
      return err(
        new ValidationError(`Invalid category in ${filePath}`, {
          filePath,
          issues: validation.error.issues,
        })
      );
    }

    return this.add(validation.data);
  }

  /**
   * Export all categories as an array
   */
  toArray(): Category[] {
    return Array.from(this.categories.values());
  }

  /**
   * Clear all categories and indexes
   */
  clear(): void {
    this.categories.clear();
    this.domainIndex.clear();
    this.levelIndex.clear();
    this.languageIndex.clear();
    this.priorityIndex.clear();
    this.searchIndex.clear();
    this.versions.clear();
  }

  /**
   * Get statistics about loaded categories
   */
  stats(): {
    total: number;
    byDomain: Record<string, number>;
    byLevel: Record<string, number>;
    byPriority: Record<string, number>;
  } {
    const byDomain: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    for (const [domain, ids] of this.domainIndex) {
      byDomain[domain] = ids.size;
    }
    for (const [level, ids] of this.levelIndex) {
      byLevel[level] = ids.size;
    }
    for (const [priority, ids] of this.priorityIndex) {
      byPriority[priority] = ids.size;
    }

    return {
      total: this.categories.size,
      byDomain,
      byLevel,
      byPriority,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add category to all indexes
   */
  private addToIndexes(category: Category): void {
    const id = category.id;

    // Domain index
    this.addToIndex(this.domainIndex, category.domain, id);

    // Level index
    this.addToIndex(this.levelIndex, category.level, id);

    // Language index (multiple)
    for (const lang of category.applicableLanguages) {
      this.addToIndex(this.languageIndex, lang, id);
    }

    // Priority index
    this.addToIndex(this.priorityIndex, category.priority, id);

    // Search index
    this.indexForSearch(category);
  }

  /**
   * Remove category from all indexes
   */
  private removeFromIndexes(category: Category): void {
    const id = category.id;

    this.removeFromIndex(this.domainIndex, category.domain, id);
    this.removeFromIndex(this.levelIndex, category.level, id);
    for (const lang of category.applicableLanguages) {
      this.removeFromIndex(this.languageIndex, lang, id);
    }
    this.removeFromIndex(this.priorityIndex, category.priority, id);
    this.removeFromSearchIndex(id);
  }

  /**
   * Add ID to an index map
   */
  private addToIndex<K>(index: Map<K, Set<string>>, key: K, id: string): void {
    let set = index.get(key);
    if (set === undefined) {
      set = new Set();
      index.set(key, set);
    }
    set.add(id);
  }

  /**
   * Remove ID from an index map
   */
  private removeFromIndex<K>(index: Map<K, Set<string>>, key: K, id: string): void {
    const set = index.get(key);
    if (set !== undefined) {
      set.delete(id);
      if (set.size === 0) {
        index.delete(key);
      }
    }
  }

  /**
   * Index category text for search
   */
  private indexForSearch(category: Category): void {
    const id = category.id;
    const textToIndex = [
      category.id,
      category.name,
      category.description,
      category.domain,
      category.level,
      ...category.applicableLanguages,
      ...(category.cves ?? []),
    ].join(" ");

    const tokens = this.tokenize(textToIndex.toLowerCase());
    for (const token of tokens) {
      this.addToIndex(this.searchIndex, token, id);
    }
  }

  /**
   * Remove category from search index
   */
  private removeFromSearchIndex(id: string): void {
    for (const [token, ids] of this.searchIndex) {
      ids.delete(id);
      if (ids.size === 0) {
        this.searchIndex.delete(token);
      }
    }
  }

  /**
   * Tokenize text for search indexing
   */
  private tokenize(text: string): string[] {
    return text
      .split(/[\s\-_.,;:!?'"()\[\]{}]+/)
      .filter((token) => token.length >= 2)
      .map((token) => token.toLowerCase());
  }

  /**
   * Intersect two sets, handling undefined
   * Returns empty set if either input is empty set (filter found no matches)
   */
  private intersect(a: Set<string> | undefined, b: Set<string> | undefined): Set<string> | undefined {
    if (a === undefined) return b;
    if (b === undefined) return a;
    // If b is empty (filter matched nothing), return empty set
    if (b.size === 0) return new Set();
    return new Set([...a].filter((x) => b.has(x)));
  }

  /**
   * Convert full category to summary
   */
  private toSummary(category: Category): CategorySummary {
    return CategorySummarySchema.parse({
      id: category.id,
      name: category.name,
      domain: category.domain,
      level: category.level,
      priority: category.priority,
      severity: category.severity,
      description: category.description,
    });
  }

  /**
   * Recursively load YAML files from directory
   */
  private async loadYamlFilesRecursive(dirPath: string): Promise<Result<Category, ValidationError>[]> {
    const results: Result<Category, ValidationError>[] = [];

    const loadResult = await tryCatchAsync(async () => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries;
    });

    if (!loadResult.success) {
      return [
        err(
          new ValidationError(`Failed to read directory: ${dirPath}`, {
            dirPath,
            cause: loadResult.error.message,
          })
        ),
      ];
    }

    for (const entry of loadResult.data) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subResults = await this.loadYamlFilesRecursive(fullPath);
        results.push(...subResults);
      } else if (entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))) {
        const result = await this.loadFromFile(fullPath);
        results.push(result);
      }
    }

    return results;
  }
}

/**
 * Create a new CategoryStore instance
 */
export function createCategoryStore(): CategoryStore {
  return new CategoryStore();
}
