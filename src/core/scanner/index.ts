/**
 * Scanner module - Codebase analysis orchestration
 *
 * This module provides:
 * - Scanner: Main class for coordinating gap detection
 * - Gap detection and prioritization
 * - Coverage metrics calculation
 * - Pinata Score computation
 */

export { Scanner, createScanner } from "./scanner.js";

export type {
  ScannerOptions,
  ScanResult,
  Gap,
  DomainCoverage,
  CoverageMetrics,
  FileStats,
  PinataScore,
  ScanSummary,
} from "./types.js";

export {
  SEVERITY_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  PRIORITY_WEIGHTS,
  DEFAULT_TEST_PATTERNS,
} from "./types.js";
