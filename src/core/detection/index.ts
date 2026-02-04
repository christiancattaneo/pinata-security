/**
 * Detection module - Pattern matching against source files
 *
 * This module provides:
 * - PatternMatcher: Core pattern detection engine
 * - Regex pattern matching
 * - AST pattern matching via tree-sitter
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

export {
  AstPatternMatcher,
  createAstMatcher,
  parseSource,
  executeQuery,
  checkTreeSitterSetup,
  COMMON_AST_PATTERNS,
  type AstMatch,
} from "./ast-parser.js";

export {
  detectProjectType,
  shouldSkipCategory,
  getCategoryWeight,
  getProjectTypeDescription,
  SCORING_ADJUSTMENTS,
  type ProjectType,
  type ProjectTypeResult,
  type ScoringAdjustment,
} from "./project-type.js";
