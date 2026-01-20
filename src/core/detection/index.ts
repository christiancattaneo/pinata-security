/**
 * Detection module - Pattern matching against source files
 *
 * This module provides:
 * - PatternMatcher: Core pattern detection engine
 * - Regex pattern matching (AST support coming later)
 * - File and directory scanning
 * - Result aggregation and analysis
 */

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
} from "./pattern-matcher.js";
