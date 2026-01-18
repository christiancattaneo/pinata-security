import { z } from "zod";
import { LanguageSchema } from "./category.schema.js";

/**
 * Supported test frameworks
 */
export const TestFrameworkSchema = z.enum([
  "pytest",
  "unittest",
  "jest",
  "vitest",
  "mocha",
  "go-test",
  "junit",
]);

/**
 * Types for template variables
 */
export const VariableTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "array",
  "object",
]);

/**
 * Regex pattern for valid variable names (camelCase)
 */
const VARIABLE_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

/**
 * Schema for template variables that get substituted during generation
 */
export const TemplateVariableSchema = z.object({
  /** Variable name (used in template as {{name}}) */
  name: z
    .string()
    .regex(VARIABLE_NAME_PATTERN, "Variable name must be camelCase"),

  /** Type of the variable value */
  type: VariableTypeSchema,

  /** Human-readable description */
  description: z.string().min(1, "Description is required"),

  /** Whether this variable must be provided */
  required: z.boolean().default(true),

  /** Default value if not provided */
  defaultValue: z.unknown().optional(),
});

/**
 * Regex pattern for valid IDs (lowercase, alphanumeric with hyphens)
 */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Schema for test templates that generate runnable tests
 */
export const TestTemplateSchema = z.object({
  /** Unique identifier for this template */
  id: z
    .string()
    .regex(ID_PATTERN, "ID must start with lowercase letter and contain only lowercase letters, numbers, and hyphens"),

  /** Target programming language */
  language: LanguageSchema,

  /** Target test framework */
  framework: TestFrameworkSchema,

  /** Template content with {{variable}} placeholders */
  template: z.string().min(50, "Template must be at least 50 characters"),

  /** Variables that can be substituted in the template */
  variables: z.array(TemplateVariableSchema),

  /** Required imports for the generated test */
  imports: z.array(z.string()).optional(),

  /** Required fixtures or setup code */
  fixtures: z.array(z.string()).optional(),

  /** Description of what this template tests */
  description: z.string().optional(),
});

// Inferred types
export type TestFramework = z.infer<typeof TestFrameworkSchema>;
export type VariableType = z.infer<typeof VariableTypeSchema>;
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;
export type TestTemplate = z.infer<typeof TestTemplateSchema>;

/**
 * All available test frameworks
 */
export const TEST_FRAMEWORKS = TestFrameworkSchema.options;
