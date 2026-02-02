import { z } from "zod";

import { LanguageSchema, SeveritySchema } from "./category.schema.js";

/**
 * Regex pattern for valid IDs (lowercase, alphanumeric with hyphens)
 */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Schema for example vulnerable code and corresponding tests
 */
export const ExampleSchema = z.object({
  /** Unique identifier for this example */
  name: z
    .string()
    .regex(ID_PATTERN, "Name must start with lowercase letter and contain only lowercase letters, numbers, and hyphens"),

  /** Explanation of the vulnerability/edge case concept */
  concept: z.string().min(20, "Concept must be at least 20 characters"),

  /** Example of vulnerable or problematic code */
  vulnerableCode: z.string().min(10, "Vulnerable code must be at least 10 characters"),

  /** Example test code that catches this vulnerability */
  testCode: z.string().min(50, "Test code must be at least 50 characters"),

  /** Programming language of the example */
  language: LanguageSchema,

  /** Severity if this vulnerability is exploited */
  severity: SeveritySchema,

  /** Optional related CVE identifier */
  cve: z.string().optional(),

  /** Optional link to more information */
  reference: z.string().url().optional(),
});

// Inferred types
export type Example = z.infer<typeof ExampleSchema>;
