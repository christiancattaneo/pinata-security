/**
 * Scanner types and schemas
 *
 * Defines the data structures for codebase scanning results,
 * gap detection, coverage metrics, and Pinata Score calculation.
 */

import { z } from "zod";

import type {
  RiskDomain,
  TestLevel,
  Language,
  Priority,
  Severity,
  Confidence,
  DetectionResult,
} from "../../categories/schema/index.js";
import type { ProjectTypeResult } from "../detection/project-type.js";

/**
 * Options for scanning a codebase
 */
export interface ScannerOptions {
  /** Base directory to scan */
  targetDirectory: string;
  /** Directories to exclude from scanning */
  excludeDirs?: string[];
  /** File extensions to include */
  includeExtensions?: string[];
  /** Maximum file size to scan in bytes */
  maxFileSize?: number;
  /** Maximum depth for directory traversal (-1 for unlimited) */
  maxDepth?: number;
  /** Category IDs to scan for (empty = all) */
  categoryIds?: string[];
  /** Risk domains to scan for (empty = all) */
  domains?: RiskDomain[];
  /** Minimum severity to report */
  minSeverity?: Severity;
  /** Minimum confidence to report */
  minConfidence?: Confidence;
  /** Whether to detect existing test files */
  detectTestFiles?: boolean;
  /** Custom test file patterns (e.g., ['*.test.ts', 'test_*.py']) */
  testFilePatterns?: string[];
}

/**
 * A detected gap (missing test coverage)
 */
export interface Gap {
  /** Category ID this gap relates to */
  categoryId: string;
  /** Category name for display */
  categoryName: string;
  /** Risk domain */
  domain: RiskDomain;
  /** Test level */
  level: TestLevel;
  /** Priority of addressing this gap */
  priority: Priority;
  /** Severity if exploited */
  severity: Severity;
  /** Detection confidence */
  confidence: Confidence;
  /** File where the gap was detected */
  filePath: string;
  /** Line number in file */
  lineStart: number;
  /** End line number */
  lineEnd: number;
  /** Column start */
  columnStart: number;
  /** Column end */
  columnEnd: number;
  /** Code snippet showing the gap */
  codeSnippet: string;
  /** Pattern ID that detected this */
  patternId: string;
  /** Detection type used */
  patternType: "regex" | "ast" | "semantic";
  /** Weighted score for prioritization (severity × confidence) */
  priorityScore: number;
}

/**
 * Coverage metrics for a single risk domain
 */
export interface DomainCoverage {
  /** Risk domain */
  domain: RiskDomain;
  /** Number of categories scanned */
  categoriesScanned: number;
  /** Number of categories with gaps */
  categoriesWithGaps: number;
  /** Number of categories fully covered */
  categoriesCovered: number;
  /** Coverage percentage (0-100) */
  coveragePercent: number;
  /** Total gaps in this domain */
  totalGaps: number;
  /** Critical gaps in this domain */
  criticalGaps: number;
}

/**
 * Coverage metrics across all domains
 */
export interface CoverageMetrics {
  /** Per-domain coverage */
  byDomain: Map<RiskDomain, DomainCoverage>;
  /** Per-level coverage */
  byLevel: Map<TestLevel, { scanned: number; withGaps: number; covered: number }>;
  /** Overall coverage percentage */
  overallCoverage: number;
  /** Total categories scanned */
  totalCategories: number;
  /** Categories with detected gaps */
  categoriesWithGaps: number;
  /** Categories with no gaps detected */
  categoriesCovered: number;
}

/**
 * File statistics from the scan
 */
export interface FileStats {
  /** Total files scanned */
  totalFiles: number;
  /** Files with detected gaps */
  filesWithGaps: number;
  /** Files by language */
  byLanguage: Map<Language, number>;
  /** Test files detected */
  testFiles: number;
  /** Source files (non-test) */
  sourceFiles: number;
  /** Files skipped (too large, binary, etc.) */
  skippedFiles: number;
  /** Total lines of code scanned */
  totalLinesOfCode: number;
}

/**
 * Pinata Score breakdown
 */
export interface PinataScore {
  /** Overall score (0-100) */
  overall: number;
  /** Letter grade (A-F) */
  grade: "A" | "B" | "C" | "D" | "F";
  /** Score breakdown by domain */
  byDomain: Map<RiskDomain, number>;
  /** Score breakdown by severity */
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** Factors that decreased the score */
  penalties: Array<{
    reason: string;
    points: number;
    categoryId?: string;
  }>;
  /** Factors that increased the score */
  bonuses: Array<{
    reason: string;
    points: number;
  }>;
}

/**
 * Complete scan result
 */
export interface ScanResult {
  /** Target directory that was scanned */
  targetDirectory: string;
  /** Detected project type */
  projectType: ProjectTypeResult;
  /** When the scan started */
  startedAt: Date;
  /** When the scan completed */
  completedAt: Date;
  /** Duration in milliseconds */
  durationMs: number;
  /** All detected gaps, sorted by priority */
  gaps: Gap[];
  /** Gaps grouped by category */
  gapsByCategory: Map<string, Gap[]>;
  /** Gaps grouped by file */
  gapsByFile: Map<string, Gap[]>;
  /** Coverage metrics */
  coverage: CoverageMetrics;
  /** File statistics */
  fileStats: FileStats;
  /** Pinata Score */
  score: PinataScore;
  /** Warnings encountered during scan */
  warnings: string[];
  /** Categories that were scanned */
  categoriesScanned: string[];
  /** Summary for quick display */
  summary: ScanSummary;
}

/**
 * Quick summary of scan results
 */
export interface ScanSummary {
  /** Total gaps found */
  totalGaps: number;
  /** Critical gaps */
  criticalGaps: number;
  /** High severity gaps */
  highGaps: number;
  /** Medium severity gaps */
  mediumGaps: number;
  /** Low severity gaps */
  lowGaps: number;
  /** Pinata Score */
  score: number;
  /** Grade */
  grade: string;
  /** Coverage percentage */
  coverage: number;
  /** Files scanned */
  filesScanned: number;
  /** Categories checked */
  categoriesChecked: number;
  /** Top 3 priority gaps */
  topGaps: Gap[];
}

/**
 * Weight multipliers for severity levels
 */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 4.0,
  high: 3.0,
  medium: 2.0,
  low: 1.0,
};

/**
 * Weight multipliers for confidence levels
 */
export const CONFIDENCE_WEIGHTS: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

/**
 * Weight multipliers for priority levels
 */
export const PRIORITY_WEIGHTS: Record<Priority, number> = {
  P0: 3.0,
  P1: 2.0,
  P2: 1.0,
};

/**
 * Default test file patterns for different languages
 */
export const DEFAULT_TEST_PATTERNS: Record<Language, string[]> = {
  python: ["test_*.py", "*_test.py", "tests/**/*.py", "test/**/*.py"],
  typescript: ["*.test.ts", "*.spec.ts", "__tests__/**/*.ts", "tests/**/*.ts"],
  javascript: ["*.test.js", "*.spec.js", "__tests__/**/*.js", "tests/**/*.js"],
  go: ["*_test.go"],
  java: ["*Test.java", "*Tests.java", "src/test/**/*.java"],
  rust: ["tests/**/*.rs"],
};
