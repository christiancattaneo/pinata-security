/**
 * Core analysis engine
 *
 * This module contains:
 * - detection/  - Pattern matching against categories
 * - scanner/    - Codebase analysis orchestration
 * - ingestion/  - Code parsing and AST extraction (coming soon)
 * - generation/ - Test code generation (coming soon)
 */

export const VERSION = "0.2.3";

// Detection module
export {
  PatternMatcher,
  createPatternMatcher,
  detectLanguage,
  getSupportedExtensions,
  isExtensionSupported,
  type PatternMatcherOptions,
  type ScanOptions,
  type PatternMatch,
  type FileScanResult,
  type AggregatedResults,
} from "./detection/index.js";

// Scanner module
export {
  Scanner,
  createScanner,
  SEVERITY_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  PRIORITY_WEIGHTS,
  DEFAULT_TEST_PATTERNS,
  type ScannerOptions,
  type ScanResult,
  type Gap,
  type DomainCoverage,
  type CoverageMetrics,
  type FileStats,
  type PinataScore,
  type ScanSummary,
} from "./scanner/index.js";
