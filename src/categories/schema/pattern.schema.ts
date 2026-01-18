import { z } from "zod";
import { ConfidenceSchema, LanguageSchema } from "./category.schema.js";

/**
 * Types of detection patterns
 * - ast: Tree-sitter AST queries
 * - regex: Regular expression patterns
 * - semantic: LLM-assisted semantic analysis
 */
export const PatternTypeSchema = z.enum(["ast", "regex", "semantic"]);

/**
 * Regex pattern for valid IDs (lowercase, alphanumeric with hyphens)
 */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Schema for detection patterns that identify code susceptible to a category
 */
export const DetectionPatternSchema = z.object({
  /** Unique identifier for this pattern */
  id: z
    .string()
    .regex(ID_PATTERN, "ID must start with lowercase letter and contain only lowercase letters, numbers, and hyphens"),

  /** Type of pattern matching to use */
  type: PatternTypeSchema,

  /** Target programming language */
  language: LanguageSchema,

  /** The pattern string (AST query, regex, or semantic description) */
  pattern: z.string().min(1, "Pattern is required"),

  /** How confident we are when this pattern matches */
  confidence: ConfidenceSchema,

  /** Human-readable description of what this pattern detects */
  description: z.string().min(10, "Description must be at least 10 characters"),

  /** Optional pattern that indicates code is NOT vulnerable (false positive filter) */
  negativePattern: z.string().optional(),

  /** Optional list of framework contexts where this pattern applies */
  frameworks: z.array(z.string()).optional(),
});

/**
 * Schema for a detection result (pattern match in code)
 */
export const DetectionResultSchema = z.object({
  /** ID of the pattern that matched */
  patternId: z.string(),

  /** Category this detection belongs to */
  categoryId: z.string(),

  /** File path where detection occurred */
  filePath: z.string(),

  /** Starting line number (1-indexed) */
  lineStart: z.number().int().positive(),

  /** Ending line number (1-indexed) */
  lineEnd: z.number().int().positive(),

  /** Code snippet that matched */
  codeSnippet: z.string(),

  /** Confidence of this specific match */
  confidence: ConfidenceSchema,

  /** Optional additional context */
  context: z.record(z.unknown()).optional(),
});

// Inferred types
export type PatternType = z.infer<typeof PatternTypeSchema>;
export type DetectionPattern = z.infer<typeof DetectionPatternSchema>;
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

/**
 * All available pattern types
 */
export const PATTERN_TYPES = PatternTypeSchema.options;
