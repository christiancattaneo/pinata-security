/**
 * Pinata - AI-powered test coverage analysis and generation
 *
 * @packageDocumentation
 */

// Categories and schemas
export {
  // Schemas
  CategorySchema,
  CategorySummarySchema,
  RiskDomainSchema,
  TestLevelSchema,
  PrioritySchema,
  SeveritySchema,
  ConfidenceSchema,
  LanguageSchema,
  PatternTypeSchema,
  DetectionPatternSchema,
  TestFrameworkSchema,
  TestTemplateSchema,
  ExampleSchema,
  // Constants
  RISK_DOMAINS,
  TEST_LEVELS,
  LANGUAGES,
  PATTERN_TYPES,
  TEST_FRAMEWORKS,
} from "./categories/index.js";

// Types
export type {
  Category,
  CategorySummary,
  RiskDomain,
  TestLevel,
  Priority,
  Severity,
  Confidence,
  Language,
  PatternType,
  DetectionPattern,
  DetectionResult,
  TestFramework,
  TestTemplate,
  Example,
} from "./categories/index.js";

// Library utilities
export {
  // Errors
  PinataError,
  ValidationError,
  ParseError,
  ConfigError,
  AnalysisError,
  GenerationError,
  CategoryNotFoundError,
  PatternNotFoundError,
  // Result utilities
  ok,
  err,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  all,
  tryCatch,
  tryCatchAsync,
  // Logger
  logger,
} from "./lib/index.js";

export type { Result, LogLevel } from "./lib/index.js";

// Core exports (placeholder)
export { VERSION } from "./core/index.js";
