/**
 * Scanner - Codebase analysis orchestrator
 *
 * Coordinates pattern matching, gap detection, coverage calculation,
 * and Pinata Score computation for a target codebase.
 *
 * @example
 * ```typescript
 * const scanner = new Scanner(categoryStore);
 *
 * const result = await scanner.scanDirectory('/path/to/project', {
 *   excludeDirs: ['node_modules', 'dist'],
 *   minSeverity: 'medium',
 * });
 *
 * console.log(`Pinata Score: ${result.score.overall}/100`);
 * console.log(`Gaps found: ${result.gaps.length}`);
 * ```
 */

import { readdir, stat, readFile } from "fs/promises";
import { resolve, relative, extname, basename } from "path";

import { minimatch } from "minimatch";

import {
  RISK_DOMAINS,
  TEST_LEVELS,
} from "../../categories/schema/index.js";
import { PinataError, AnalysisError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { ok, err, tryCatchAsync } from "../../lib/result.js";
import { PatternMatcher, detectLanguage } from "../detection/index.js";

import {
  SEVERITY_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  PRIORITY_WEIGHTS,
  DEFAULT_TEST_PATTERNS,
} from "./types.js";

import type {
  ScannerOptions,
  ScanResult,
  Gap,
  DomainCoverage,
  CoverageMetrics,
  FileStats,
  PinataScore,
  ScanSummary,
} from "./types.js";
import type {
  Category,
  RiskDomain,
  TestLevel,
  Language,
  Priority,
  Severity,
  Confidence,
  DetectionResult,
  PatternType,
} from "../../categories/schema/index.js";
import type { CategoryStore } from "../../categories/store/category-store.js";
import type { Result } from "../../lib/result.js";

/**
 * Default scanner options
 */
const DEFAULT_OPTIONS: Required<Omit<ScannerOptions, "targetDirectory">> = {
  excludeDirs: [
    // Package managers
    "node_modules", ".pnpm", "vendor",
    // Build outputs
    "dist", "build", "out", ".next", ".nuxt", ".output",
    // Version control
    ".git", ".svn", ".hg",
    // Python
    "__pycache__", ".venv", "venv", ".tox", ".mypy_cache", ".pytest_cache",
    // Test/coverage
    "coverage", ".nyc_output",
    // IDE/Editor
    ".idea", ".vscode",
    // Scripts (typically not production)
    "scripts",
  ],
  includeExtensions: [".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".java", ".rs"],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxDepth: -1,
  categoryIds: [],
  domains: [],
  minSeverity: "low",
  minConfidence: "low",
  detectTestFiles: true,
  testFilePatterns: [],
};

/**
 * Severity order for filtering
 */
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Confidence order for filtering
 */
const CONFIDENCE_ORDER: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Scanner class - orchestrates codebase analysis
 */
export class Scanner {
  private readonly categoryStore: CategoryStore;
  private readonly patternMatcher: PatternMatcher;
  private readonly log = logger.child("Scanner");

  constructor(categoryStore: CategoryStore) {
    this.categoryStore = categoryStore;
    this.patternMatcher = new PatternMatcher();
  }

  /**
   * Scan a directory for test coverage gaps
   *
   * @param targetDirectory Directory to scan
   * @param options Scan options
   * @returns Scan result with gaps, coverage, and score
   */
  async scanDirectory(
    targetDirectory: string,
    options: Partial<ScannerOptions> = {}
  ): Promise<Result<ScanResult, PinataError>> {
    const startedAt = new Date();
    const opts = this.mergeOptions(targetDirectory, options);

    this.log.info(`Starting scan of ${targetDirectory}`);

    // Validate target directory exists (use stat to avoid TOCTOU race condition)
    try {
      const dirStat = await stat(targetDirectory);
      if (!dirStat.isDirectory()) {
        return err(new AnalysisError(`Not a directory: ${targetDirectory}`));
      }
    } catch {
      return err(new AnalysisError(`Directory not found: ${targetDirectory}`));
    }

    // Get categories to scan
    const categoriesResult = this.getCategoriesToScan(opts);
    if (!categoriesResult.success) {
      return categoriesResult;
    }
    const categories = categoriesResult.data;

    if (categories.length === 0) {
      return err(new AnalysisError("No categories to scan. Load categories first."));
    }

    this.log.info(`Scanning with ${categories.length} categories`);

    // Collect all detection results
    const allDetections: DetectionResult[] = [];
    const warnings: string[] = [];
    const fileStats = this.initFileStats();
    const testFiles = new Set<string>();
    const sourceFiles = new Set<string>();

    // Scan for each category
    for (const category of categories) {
      const scanResult = await this.patternMatcher.scanDirectory(
        targetDirectory,
        category.detectionPatterns,
        {
          categoryId: category.id,
          basePath: targetDirectory,
          excludeDirs: opts.excludeDirs,
          includeExtensions: opts.includeExtensions,
          maxFileSize: opts.maxFileSize,
          maxDepth: opts.maxDepth,
        }
      );

      if (!scanResult.success) {
        warnings.push(`Failed to scan for category ${category.id}: ${scanResult.error.message}`);
        continue;
      }

      // Filter by severity and confidence
      const filtered = scanResult.data.filter((d) => {
        const severityOk = SEVERITY_ORDER[category.severity] >= SEVERITY_ORDER[opts.minSeverity];
        const confidenceOk = CONFIDENCE_ORDER[d.confidence] >= CONFIDENCE_ORDER[opts.minConfidence];
        return severityOk && confidenceOk;
      });

      allDetections.push(...filtered);
    }

    // Detect test files if enabled
    if (opts.detectTestFiles) {
      const testFilesResult = await this.detectTestFiles(targetDirectory, opts);
      if (testFilesResult.success) {
        for (const file of testFilesResult.data) {
          testFiles.add(file);
        }
      }
    }

    // Count files by language
    const filesResult = await this.countFiles(targetDirectory, opts);
    if (filesResult.success) {
      fileStats.totalFiles = filesResult.data.total;
      fileStats.skippedFiles = filesResult.data.skipped;
      for (const [lang, count] of filesResult.data.byLanguage) {
        fileStats.byLanguage.set(lang, count);
      }
    }

    fileStats.testFiles = testFiles.size;
    fileStats.sourceFiles = fileStats.totalFiles - testFiles.size;

    // Convert detections to gaps
    const gaps = this.detectionsToGaps(allDetections, categories, testFiles, opts);

    // Update file stats
    const filesWithGaps = new Set(gaps.map((g) => g.filePath));
    fileStats.filesWithGaps = filesWithGaps.size;

    // Group gaps
    const gapsByCategory = this.groupGapsByCategory(gaps);
    const gapsByFile = this.groupGapsByFile(gaps);

    // Calculate coverage metrics
    const coverage = this.calculateCoverage(categories, gapsByCategory);

    // Calculate Pinata Score
    const score = this.calculateScore(gaps, coverage, categories);

    // Build summary
    const summary = this.buildSummary(gaps, score, coverage, fileStats, categories);

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    this.log.info(`Scan complete: ${gaps.length} gaps found in ${durationMs}ms`);

    return ok({
      targetDirectory,
      startedAt,
      completedAt,
      durationMs,
      gaps,
      gapsByCategory,
      gapsByFile,
      coverage,
      fileStats,
      score,
      warnings,
      categoriesScanned: categories.map((c) => c.id),
      summary,
    });
  }

  /**
   * Aggregate raw detection results into gaps with priority scoring
   */
  aggregateResults(
    detections: DetectionResult[],
    categories: Category[]
  ): Gap[] {
    return this.detectionsToGaps(detections, categories, new Set(), {
      ...DEFAULT_OPTIONS,
      targetDirectory: "",
    });
  }

  /**
   * Calculate Pinata Score from gaps and coverage
   */
  calculateScore(
    gaps: Gap[],
    coverage: CoverageMetrics,
    categories: Category[]
  ): PinataScore {
    // Base score starts at 100
    let baseScore = 100;
    const penalties: PinataScore["penalties"] = [];
    const bonuses: PinataScore["bonuses"] = [];
    const domainScores = new Map<RiskDomain, number>();

    // Initialize domain scores at 100
    for (const domain of RISK_DOMAINS) {
      domainScores.set(domain, 100);
    }

    // Apply penalties for gaps
    for (const gap of gaps) {
      const severityWeight = SEVERITY_WEIGHTS[gap.severity];
      const confidenceWeight = CONFIDENCE_WEIGHTS[gap.confidence];
      const priorityWeight = PRIORITY_WEIGHTS[gap.priority];

      // Calculate penalty: base × severity × confidence × priority factor
      const basePenalty = 2; // Base penalty per gap
      const penalty = basePenalty * severityWeight * confidenceWeight * Math.sqrt(priorityWeight);

      baseScore -= penalty;

      // Apply to domain score
      const currentDomainScore = domainScores.get(gap.domain) ?? 100;
      domainScores.set(gap.domain, Math.max(0, currentDomainScore - penalty * 2));

      // Track significant penalties
      if (penalty >= 5) {
        penalties.push({
          reason: `${gap.severity} ${gap.domain} gap: ${gap.categoryName}`,
          points: Math.round(penalty),
          categoryId: gap.categoryId,
        });
      }
    }

    // Apply bonuses for good coverage
    if (coverage.overallCoverage >= 90) {
      const bonus = 5;
      baseScore += bonus;
      bonuses.push({ reason: "Excellent coverage (90%+)", points: bonus });
    } else if (coverage.overallCoverage >= 75) {
      const bonus = 3;
      baseScore += bonus;
      bonuses.push({ reason: "Good coverage (75%+)", points: bonus });
    }

    // Bonus for no critical gaps
    const criticalGaps = gaps.filter((g) => g.severity === "critical");
    if (criticalGaps.length === 0 && categories.length > 0) {
      const bonus = 5;
      baseScore += bonus;
      bonuses.push({ reason: "No critical gaps", points: bonus });
    }

    // Bonus for no high gaps
    const highGaps = gaps.filter((g) => g.severity === "high");
    if (highGaps.length === 0 && categories.length > 0) {
      const bonus = 3;
      baseScore += bonus;
      bonuses.push({ reason: "No high severity gaps", points: bonus });
    }

    // Clamp score to 0-100
    const overall = Math.max(0, Math.min(100, Math.round(baseScore)));

    // Calculate grade
    const grade = this.scoreToGrade(overall);

    // Calculate severity breakdown scores
    const bySeverity = {
      critical: this.calculateSeverityScore(gaps, "critical"),
      high: this.calculateSeverityScore(gaps, "high"),
      medium: this.calculateSeverityScore(gaps, "medium"),
      low: this.calculateSeverityScore(gaps, "low"),
    };

    return {
      overall,
      grade,
      byDomain: domainScores,
      bySeverity,
      penalties: penalties.slice(0, 10), // Top 10 penalties
      bonuses,
    };
  }

  /**
   * Get the pattern matcher instance
   */
  getPatternMatcher(): PatternMatcher {
    return this.patternMatcher;
  }

  // ============================================================
  // Private methods
  // ============================================================

  /**
   * Merge user options with defaults
   */
  private mergeOptions(
    targetDirectory: string,
    options: Partial<ScannerOptions>
  ): Required<ScannerOptions> {
    // Read .pinataignore if it exists
    const pinataIgnore = this.readPinataIgnore(targetDirectory);
    const baseExcludes = options.excludeDirs ?? DEFAULT_OPTIONS.excludeDirs;
    const mergedExcludes = [...new Set([...baseExcludes, ...pinataIgnore])];

    return {
      targetDirectory,
      excludeDirs: mergedExcludes,
      includeExtensions: options.includeExtensions ?? DEFAULT_OPTIONS.includeExtensions,
      maxFileSize: options.maxFileSize ?? DEFAULT_OPTIONS.maxFileSize,
      maxDepth: options.maxDepth ?? DEFAULT_OPTIONS.maxDepth,
      categoryIds: options.categoryIds ?? DEFAULT_OPTIONS.categoryIds,
      domains: options.domains ?? DEFAULT_OPTIONS.domains,
      minSeverity: options.minSeverity ?? DEFAULT_OPTIONS.minSeverity,
      minConfidence: options.minConfidence ?? DEFAULT_OPTIONS.minConfidence,
      detectTestFiles: options.detectTestFiles ?? DEFAULT_OPTIONS.detectTestFiles,
      testFilePatterns: options.testFilePatterns ?? DEFAULT_OPTIONS.testFilePatterns,
    };
  }

  /**
   * Read .pinataignore file and return directory patterns
   */
  private readPinataIgnore(targetDirectory: string): string[] {
    const ignorePath = resolve(targetDirectory, ".pinataignore");

    // Try to read directly instead of checking existence (avoids TOCTOU)
    try {
      const { readFileSync } = require("node:fs") as typeof import("fs");
      const content = readFileSync(ignorePath, "utf-8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => line.replace(/\/$/, "")); // Remove trailing slashes
    } catch {
      return [];
    }
  }

  /**
   * Get categories to scan based on options
   */
  private getCategoriesToScan(
    options: Required<ScannerOptions>
  ): Result<Category[], PinataError> {
    const allCategories = this.categoryStore.list();
    let filtered = allCategories;

    // Filter by category IDs
    if (options.categoryIds.length > 0) {
      filtered = filtered.filter((c) => options.categoryIds.includes(c.id));
    }

    // Filter by domains
    if (options.domains.length > 0) {
      filtered = filtered.filter((c) => options.domains.includes(c.domain));
    }

    // Get full category objects
    const categories: Category[] = [];
    for (const summary of filtered) {
      const result = this.categoryStore.get(summary.id);
      if (result.success) {
        categories.push(result.data);
      }
    }

    return ok(categories);
  }

  /**
   * Initialize empty file stats
   */
  private initFileStats(): FileStats {
    return {
      totalFiles: 0,
      filesWithGaps: 0,
      byLanguage: new Map(),
      testFiles: 0,
      sourceFiles: 0,
      skippedFiles: 0,
      totalLinesOfCode: 0,
    };
  }

  /**
   * Detect test files in the target directory
   */
  private async detectTestFiles(
    targetDirectory: string,
    options: Required<ScannerOptions>
  ): Promise<Result<string[], PinataError>> {
    const testFiles: string[] = [];

    // Build test patterns
    const patterns: string[] = [...options.testFilePatterns];
    for (const ext of options.includeExtensions) {
      const lang = detectLanguage(`file${ext}`);
      if (lang) {
        const langPatterns = DEFAULT_TEST_PATTERNS[lang];
        if (langPatterns) {
          patterns.push(...langPatterns);
        }
      }
    }

    // Walk directory and match patterns
    const walkResult = await this.walkDirectory(targetDirectory, options, (filePath) => {
      const fileName = basename(filePath);
      const relativePath = relative(targetDirectory, filePath);

      for (const pattern of patterns) {
        if (minimatch(fileName, pattern) || minimatch(relativePath, pattern)) {
          testFiles.push(filePath);
          return true;
        }
      }

      // Common test directory names
      if (relativePath.includes("/test/") || relativePath.includes("/tests/") ||
          relativePath.includes("/__tests__/") || relativePath.startsWith("test/") ||
          relativePath.startsWith("tests/")) {
        testFiles.push(filePath);
        return true;
      }

      return false;
    });

    if (!walkResult.success) {
      return walkResult;
    }

    return ok(testFiles);
  }

  /**
   * Count files by language
   */
  private async countFiles(
    targetDirectory: string,
    options: Required<ScannerOptions>
  ): Promise<Result<{ total: number; skipped: number; byLanguage: Map<Language, number> }, PinataError>> {
    let total = 0;
    let skipped = 0;
    const byLanguage = new Map<Language, number>();

    const walkResult = await this.walkDirectory(targetDirectory, options, (filePath) => {
      const lang = detectLanguage(filePath);
      if (lang) {
        total++;
        byLanguage.set(lang, (byLanguage.get(lang) ?? 0) + 1);
      } else {
        skipped++;
      }
      return true;
    });

    if (!walkResult.success) {
      return walkResult;
    }

    return ok({ total, skipped, byLanguage });
  }

  /**
   * Walk directory and apply callback to each file
   */
  private async walkDirectory(
    dirPath: string,
    options: Required<ScannerOptions>,
    callback: (filePath: string) => boolean,
    depth = 0
  ): Promise<Result<void, PinataError>> {
    if (options.maxDepth >= 0 && depth > options.maxDepth) {
      return ok(undefined);
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = resolve(dirPath, entry.name);

        // Skip excluded directories
        if (entry.isDirectory()) {
          if (options.excludeDirs.includes(entry.name)) {
            continue;
          }
          if (entry.name.startsWith(".") && entry.name !== ".") {
            continue;
          }

          const walkResult = await this.walkDirectory(fullPath, options, callback, depth + 1);
          if (!walkResult.success) {
            return walkResult;
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (options.includeExtensions.includes(ext)) {
            callback(fullPath);
          }
        }
      }

      return ok(undefined);
    } catch (error) {
      return err(new AnalysisError(
        `Failed to read directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
      ));
    }
  }

  /**
   * Convert detection results to gaps
   */
  private detectionsToGaps(
    detections: DetectionResult[],
    categories: Category[],
    testFiles: Set<string>,
    options: Required<ScannerOptions>
  ): Gap[] {
    const categoryMap = new Map<string, Category>();
    for (const cat of categories) {
      categoryMap.set(cat.id, cat);
    }

    // Build pattern type lookup from categories
    const patternTypeMap = new Map<string, PatternType>();
    for (const cat of categories) {
      for (const pattern of cat.detectionPatterns) {
        patternTypeMap.set(pattern.id, pattern.type);
      }
    }

    const gaps: Gap[] = [];

    for (const detection of detections) {
      // Skip detections in test files
      if (testFiles.has(detection.filePath)) {
        continue;
      }

      const category = categoryMap.get(detection.categoryId);
      if (!category) {
        continue;
      }

      // Calculate priority score
      const priorityScore = this.calculatePriorityScore(
        category.severity,
        detection.confidence,
        category.priority
      );

      // Get pattern type from lookup (fallback to regex)
      const patternType = patternTypeMap.get(detection.patternId) ?? "regex";

      // Extract column info from context if available
      const context = detection.context;
      const columnStart = typeof context?.["columnStart"] === "number" ? context["columnStart"] : 0;
      const columnEnd = typeof context?.["columnEnd"] === "number" ? context["columnEnd"] : 0;

      gaps.push({
        categoryId: category.id,
        categoryName: category.name,
        domain: category.domain,
        level: category.level,
        priority: category.priority,
        severity: category.severity,
        confidence: detection.confidence,
        filePath: detection.filePath,
        lineStart: detection.lineStart,
        lineEnd: detection.lineEnd,
        columnStart,
        columnEnd,
        codeSnippet: detection.codeSnippet,
        patternId: detection.patternId,
        patternType,
        priorityScore,
      });
    }

    // Sort by priority score (highest first)
    gaps.sort((a, b) => b.priorityScore - a.priorityScore);

    return gaps;
  }

  /**
   * Calculate priority score for a gap
   */
  private calculatePriorityScore(
    severity: Severity,
    confidence: Confidence,
    priority: Priority
  ): number {
    const severityWeight = SEVERITY_WEIGHTS[severity];
    const confidenceWeight = CONFIDENCE_WEIGHTS[confidence];
    const priorityWeight = PRIORITY_WEIGHTS[priority];

    return severityWeight * confidenceWeight * priorityWeight;
  }

  /**
   * Group gaps by category ID
   */
  private groupGapsByCategory(gaps: Gap[]): Map<string, Gap[]> {
    const grouped = new Map<string, Gap[]>();

    for (const gap of gaps) {
      const existing = grouped.get(gap.categoryId) ?? [];
      existing.push(gap);
      grouped.set(gap.categoryId, existing);
    }

    return grouped;
  }

  /**
   * Group gaps by file path
   */
  private groupGapsByFile(gaps: Gap[]): Map<string, Gap[]> {
    const grouped = new Map<string, Gap[]>();

    for (const gap of gaps) {
      const existing = grouped.get(gap.filePath) ?? [];
      existing.push(gap);
      grouped.set(gap.filePath, existing);
    }

    return grouped;
  }

  /**
   * Calculate coverage metrics
   */
  private calculateCoverage(
    categories: Category[],
    gapsByCategory: Map<string, Gap[]>
  ): CoverageMetrics {
    const byDomain = new Map<RiskDomain, DomainCoverage>();
    const byLevel = new Map<TestLevel, { scanned: number; withGaps: number; covered: number }>();

    // Initialize domain coverage
    for (const domain of RISK_DOMAINS) {
      byDomain.set(domain, {
        domain,
        categoriesScanned: 0,
        categoriesWithGaps: 0,
        categoriesCovered: 0,
        coveragePercent: 100,
        totalGaps: 0,
        criticalGaps: 0,
      });
    }

    // Initialize level coverage
    for (const level of TEST_LEVELS) {
      byLevel.set(level, { scanned: 0, withGaps: 0, covered: 0 });
    }

    // Calculate per-category coverage
    let categoriesWithGaps = 0;
    let categoriesCovered = 0;

    for (const category of categories) {
      const gaps = gapsByCategory.get(category.id) ?? [];
      const hasGaps = gaps.length > 0;

      // Update domain coverage
      const domainCoverage = byDomain.get(category.domain);
      if (domainCoverage) {
        domainCoverage.categoriesScanned++;
        if (hasGaps) {
          domainCoverage.categoriesWithGaps++;
          domainCoverage.totalGaps += gaps.length;
          domainCoverage.criticalGaps += gaps.filter((g) => g.severity === "critical").length;
        } else {
          domainCoverage.categoriesCovered++;
        }
      }

      // Update level coverage
      const levelCoverage = byLevel.get(category.level);
      if (levelCoverage) {
        levelCoverage.scanned++;
        if (hasGaps) {
          levelCoverage.withGaps++;
        } else {
          levelCoverage.covered++;
        }
      }

      if (hasGaps) {
        categoriesWithGaps++;
      } else {
        categoriesCovered++;
      }
    }

    // Calculate percentages
    for (const coverage of byDomain.values()) {
      if (coverage.categoriesScanned > 0) {
        coverage.coveragePercent = Math.round(
          (coverage.categoriesCovered / coverage.categoriesScanned) * 100
        );
      }
    }

    const totalCategories = categories.length;
    const overallCoverage = totalCategories > 0
      ? Math.round((categoriesCovered / totalCategories) * 100)
      : 100;

    return {
      byDomain,
      byLevel,
      overallCoverage,
      totalCategories,
      categoriesWithGaps,
      categoriesCovered,
    };
  }

  /**
   * Convert score to letter grade
   */
  private scoreToGrade(score: number): PinataScore["grade"] {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  /**
   * Calculate score contribution from a severity level
   */
  private calculateSeverityScore(gaps: Gap[], severity: Severity): number {
    const severityGaps = gaps.filter((g) => g.severity === severity);
    if (severityGaps.length === 0) return 100;

    // More gaps = lower score
    const penalty = severityGaps.length * SEVERITY_WEIGHTS[severity] * 5;
    return Math.max(0, Math.round(100 - penalty));
  }

  /**
   * Build scan summary
   */
  private buildSummary(
    gaps: Gap[],
    score: PinataScore,
    coverage: CoverageMetrics,
    fileStats: FileStats,
    categories: Category[]
  ): ScanSummary {
    return {
      totalGaps: gaps.length,
      criticalGaps: gaps.filter((g) => g.severity === "critical").length,
      highGaps: gaps.filter((g) => g.severity === "high").length,
      mediumGaps: gaps.filter((g) => g.severity === "medium").length,
      lowGaps: gaps.filter((g) => g.severity === "low").length,
      score: score.overall,
      grade: score.grade,
      coverage: coverage.overallCoverage,
      filesScanned: fileStats.totalFiles,
      categoriesChecked: categories.length,
      topGaps: gaps.slice(0, 3),
    };
  }
}

/**
 * Create a new Scanner instance
 */
export function createScanner(categoryStore: CategoryStore): Scanner {
  return new Scanner(categoryStore);
}
