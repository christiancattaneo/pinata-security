import { z } from "zod";

import {
  CategoryBaseSchema,
  RiskDomainSchema,
  TestLevelSchema,
  PrioritySchema,
  SeveritySchema,
  ConfidenceSchema,
  LanguageSchema,
  RISK_DOMAINS,
  TEST_LEVELS,
  LANGUAGES,
} from "./category.schema.js";
import { ExampleSchema } from "./example.schema.js";
import { DetectionPatternSchema, DetectionResultSchema, PatternTypeSchema, PATTERN_TYPES } from "./pattern.schema.js";
import { TestTemplateSchema, TemplateVariableSchema, TestFrameworkSchema, VariableTypeSchema, TEST_FRAMEWORKS } from "./template.schema.js";

// Re-export all schemas
export {
  // Category schemas
  RiskDomainSchema,
  TestLevelSchema,
  PrioritySchema,
  SeveritySchema,
  ConfidenceSchema,
  LanguageSchema,
  CategoryBaseSchema,
  // Pattern schemas
  PatternTypeSchema,
  DetectionPatternSchema,
  DetectionResultSchema,
  // Template schemas
  TestFrameworkSchema,
  TemplateVariableSchema,
  VariableTypeSchema,
  TestTemplateSchema,
  // Example schema
  ExampleSchema,
  // Constants
  RISK_DOMAINS,
  TEST_LEVELS,
  LANGUAGES,
  PATTERN_TYPES,
  TEST_FRAMEWORKS,
};

// Re-export all types
export type {
  RiskDomain,
  TestLevel,
  Priority,
  Severity,
  Confidence,
  Language,
  CategoryBase,
} from "./category.schema.js";

export type {
  PatternType,
  DetectionPattern,
  DetectionResult,
} from "./pattern.schema.js";

export type {
  TestFramework,
  VariableType,
  TemplateVariable,
  TestTemplate,
} from "./template.schema.js";

export type { Example } from "./example.schema.js";

/**
 * Complete Category schema with all nested types
 */
export const CategorySchema = CategoryBaseSchema.extend({
  detectionPatterns: z.array(DetectionPatternSchema).min(1, "At least one detection pattern required"),
  testTemplates: z.array(TestTemplateSchema).min(1, "At least one test template required"),
  examples: z.array(ExampleSchema).min(1, "At least one example required"),
});

/**
 * Complete Category type
 */
export type Category = z.infer<typeof CategorySchema>;

/**
 * Category without nested arrays (for partial loading)
 */
export const CategorySummarySchema = CategoryBaseSchema.pick({
  id: true,
  name: true,
  domain: true,
  level: true,
  priority: true,
  severity: true,
  description: true,
});

export type CategorySummary = z.infer<typeof CategorySummarySchema>;
