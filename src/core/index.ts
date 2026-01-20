/**
 * Core analysis engine
 *
 * This module contains:
 * - detection/  - Pattern matching against categories
 * - ingestion/  - Code parsing and AST extraction (coming soon)
 * - scoring/    - Gap analysis and Pinata Score calculation (coming soon)
 * - generation/ - Test code generation (coming soon)
 */

export const VERSION = "0.1.0";

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
