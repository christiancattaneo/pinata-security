import { z } from "zod";

/**
 * Risk domains representing different areas of test coverage
 */
export const RiskDomainSchema = z.enum([
  "security",
  "data",
  "concurrency",
  "input",
  "resource",
  "reliability",
  "performance",
  "platform",
  "business",
  "compliance",
]);

/**
 * Test levels from unit to chaos engineering
 */
export const TestLevelSchema = z.enum([
  "unit",
  "integration",
  "system",
  "chaos",
]);

/**
 * Priority levels for categorizing importance
 */
export const PrioritySchema = z.enum(["P0", "P1", "P2"]);

/**
 * Severity levels for gap findings
 */
export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

/**
 * Confidence levels for pattern detection
 */
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

/**
 * Supported programming languages
 */
export const LanguageSchema = z.enum([
  "python",
  "typescript",
  "javascript",
  "go",
  "java",
  "rust",
]);

/**
 * Regex pattern for valid IDs (lowercase, alphanumeric with hyphens)
 */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Base category schema without nested types
 * Full CategorySchema is defined in index.ts to avoid circular imports
 */
export const CategoryBaseSchema = z.object({
  id: z
    .string()
    .regex(ID_PATTERN, "ID must start with lowercase letter and contain only lowercase letters, numbers, and hyphens"),
  version: z.number().int().positive(),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(2000, "Description too long"),
  domain: RiskDomainSchema,
  level: TestLevelSchema,
  priority: PrioritySchema,
  severity: SeveritySchema,
  applicableLanguages: z.array(LanguageSchema).min(1, "At least one language required"),
  cves: z.array(z.string()).optional(),
  references: z.array(z.string().url("Invalid URL")).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// Inferred types
export type RiskDomain = z.infer<typeof RiskDomainSchema>;
export type TestLevel = z.infer<typeof TestLevelSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type CategoryBase = z.infer<typeof CategoryBaseSchema>;

/**
 * All available risk domains
 */
export const RISK_DOMAINS = RiskDomainSchema.options;

/**
 * All available test levels
 */
export const TEST_LEVELS = TestLevelSchema.options;

/**
 * All available languages
 */
export const LANGUAGES = LanguageSchema.options;
