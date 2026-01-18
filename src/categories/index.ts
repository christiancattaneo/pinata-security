// Schema exports
export {
  // Category schemas
  CategorySchema,
  CategoryBaseSchema,
  CategorySummarySchema,
  RiskDomainSchema,
  TestLevelSchema,
  PrioritySchema,
  SeveritySchema,
  ConfidenceSchema,
  LanguageSchema,
  // Pattern schemas
  PatternTypeSchema,
  DetectionPatternSchema,
  DetectionResultSchema,
  // Template schemas
  TestFrameworkSchema,
  TemplateVariableSchema,
  TestTemplateSchema,
  // Example schema
  ExampleSchema,
  // Constants
  RISK_DOMAINS,
  TEST_LEVELS,
  LANGUAGES,
  PATTERN_TYPES,
  TEST_FRAMEWORKS,
} from "./schema/index.js";

// Type exports
export type {
  Category,
  CategoryBase,
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
  VariableType,
  TemplateVariable,
  TestTemplate,
  Example,
} from "./schema/index.js";
