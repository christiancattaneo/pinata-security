import { z } from "zod";

import { Result, ok, err } from "../lib/result.js";
import { PinataError, ValidationError } from "../lib/errors.js";
import {
  TestTemplate,
  TemplateVariable,
  VariableType,
  VariableTypeSchema,
} from "../categories/schema/index.js";

/**
 * Error for template rendering failures
 */
export class TemplateRenderError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "TEMPLATE_RENDER_ERROR", context);
    this.name = "TemplateRenderError";
  }
}

/**
 * Regex for matching {{variable}} placeholders
 * Matches: {{variableName}} or {{variable_name}}
 * Does not match nested: {{outer{{inner}}}}
 */
const PLACEHOLDER_REGEX = /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;

/**
 * Result of parsing template placeholders
 */
export interface ParsedPlaceholder {
  /** Full match including braces: {{variableName}} */
  match: string;
  /** Variable name without braces: variableName */
  name: string;
  /** Start index in template */
  startIndex: number;
  /** End index in template */
  endIndex: number;
}

/**
 * Validation result for a single variable
 */
export interface VariableValidationResult {
  name: string;
  valid: boolean;
  errors: string[];
}

/**
 * Complete validation result
 */
export interface ValidationResult {
  valid: boolean;
  results: VariableValidationResult[];
  missingRequired: string[];
  unknownVariables: string[];
  typeErrors: string[];
}

/**
 * Options for rendering a template
 */
export interface RenderOptions {
  /** Strict mode - fail on any validation error */
  strict?: boolean;
  /** Leave unresolved placeholders as-is */
  allowUnresolved?: boolean;
  /** Custom placeholder format (default: {{name}}) */
  placeholderFormat?: "mustache" | "dollar" | "percent";
}

/**
 * Result of rendering a template
 */
export interface RenderResult {
  /** Rendered template content */
  content: string;
  /** Variables that were substituted */
  substituted: string[];
  /** Variables that were left unresolved */
  unresolved: string[];
  /** Imports required for the template */
  imports: string[];
  /** Fixtures required for the template */
  fixtures: string[];
}

/**
 * Renders test templates by substituting variable placeholders
 *
 * @example
 * ```typescript
 * const renderer = new TemplateRenderer();
 *
 * const result = renderer.renderTemplate(template, {
 *   className: "UserService",
 *   functionName: "authenticate",
 *   tableName: "users",
 * });
 *
 * if (result.success) {
 *   console.log(result.data.content);
 * }
 * ```
 */
export class TemplateRenderer {
  private readonly options: Required<RenderOptions>;

  constructor(options: RenderOptions = {}) {
    this.options = {
      strict: options.strict ?? true,
      allowUnresolved: options.allowUnresolved ?? false,
      placeholderFormat: options.placeholderFormat ?? "mustache",
    };
  }

  /**
   * Parse all placeholders from a template string
   *
   * @param template Template string to parse
   * @returns Array of parsed placeholders
   */
  parsePlaceholders(template: string): ParsedPlaceholder[] {
    const placeholders: ParsedPlaceholder[] = [];
    const regex = this.getPlaceholderRegex();
    let match: RegExpExecArray | null;

    // Reset regex state
    regex.lastIndex = 0;

    while ((match = regex.exec(template)) !== null) {
      placeholders.push({
        match: match[0],
        name: match[1] ?? "",
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return placeholders;
  }

  /**
   * Get unique variable names from template
   *
   * @param template Template string to analyze
   * @returns Unique variable names found in template
   */
  getVariableNames(template: string): string[] {
    const placeholders = this.parsePlaceholders(template);
    return [...new Set(placeholders.map((p) => p.name))];
  }

  /**
   * Validate provided variables against template requirements
   *
   * @param template Test template with variable definitions
   * @param values Provided variable values
   * @returns Validation result
   */
  validateVariables(
    template: TestTemplate,
    values: Record<string, unknown>
  ): ValidationResult {
    const results: VariableValidationResult[] = [];
    const missingRequired: string[] = [];
    const unknownVariables: string[] = [];
    const typeErrors: string[] = [];

    // Get variables used in template content
    const usedInTemplate = new Set(this.getVariableNames(template.template));

    // Create a map of defined variables for quick lookup
    const definedVariables = new Map<string, TemplateVariable>();
    for (const v of template.variables) {
      definedVariables.set(v.name, v);
    }

    // Check each defined variable
    for (const variable of template.variables) {
      const result: VariableValidationResult = {
        name: variable.name,
        valid: true,
        errors: [],
      };

      const value = values[variable.name];
      const hasValue = variable.name in values;

      // Check if required variable is missing
      if (variable.required && !hasValue && variable.defaultValue === undefined) {
        result.valid = false;
        result.errors.push(`Required variable '${variable.name}' is missing`);
        missingRequired.push(variable.name);
      }

      // Type check if value is provided
      if (hasValue && value !== undefined && value !== null) {
        const typeError = this.checkType(variable.name, value, variable.type);
        if (typeError) {
          result.valid = false;
          result.errors.push(typeError);
          typeErrors.push(typeError);
        }
      }

      results.push(result);
    }

    // Check for unknown variables in provided values
    const providedNames = Object.keys(values);
    for (const name of providedNames) {
      if (!definedVariables.has(name)) {
        // Check if it's used in template but not defined
        if (usedInTemplate.has(name)) {
          // It's used but not formally defined - allow it but warn
          results.push({
            name,
            valid: true,
            errors: [`Variable '${name}' is used in template but not formally defined`],
          });
        } else {
          unknownVariables.push(name);
        }
      }
    }

    // Check for placeholders in template that have no value
    for (const placeholder of usedInTemplate) {
      const defined = definedVariables.get(placeholder);
      const hasValue = placeholder in values;

      if (!hasValue && !defined?.defaultValue) {
        // Check if this is a required defined variable (already handled above)
        // or an undefined placeholder
        if (!defined) {
          missingRequired.push(placeholder);
        }
      }
    }

    const valid =
      missingRequired.length === 0 &&
      typeErrors.length === 0 &&
      (unknownVariables.length === 0 || !this.options.strict);

    return {
      valid,
      results,
      missingRequired: [...new Set(missingRequired)],
      unknownVariables,
      typeErrors,
    };
  }

  /**
   * Check if a value matches the expected type
   */
  private checkType(name: string, value: unknown, expectedType: VariableType): string | null {
    const actualType = this.getValueType(value);

    if (actualType !== expectedType) {
      return `Variable '${name}' expected type '${expectedType}' but got '${actualType}'`;
    }

    return null;
  }

  /**
   * Determine the VariableType of a value
   */
  private getValueType(value: unknown): VariableType {
    if (value === null || value === undefined) {
      return "string"; // Treat null/undefined as string for placeholder purposes
    }

    if (Array.isArray(value)) {
      return "array";
    }

    if (typeof value === "object") {
      return "object";
    }

    if (typeof value === "boolean") {
      return "boolean";
    }

    if (typeof value === "number") {
      return "number";
    }

    return "string";
  }

  /**
   * Substitute variables in a template string
   *
   * @param template Template string with placeholders
   * @param values Variable values to substitute
   * @param variableDefs Optional variable definitions for defaults
   * @returns Substitution result
   */
  substituteVariables(
    template: string,
    values: Record<string, unknown>,
    variableDefs?: TemplateVariable[]
  ): { content: string; substituted: string[]; unresolved: string[] } {
    const substituted: string[] = [];
    const unresolved: string[] = [];

    // Build a values map including defaults
    const resolvedValues = new Map<string, string>();

    // Apply defaults first
    if (variableDefs) {
      for (const def of variableDefs) {
        if (def.defaultValue !== undefined) {
          resolvedValues.set(def.name, this.stringify(def.defaultValue));
        }
      }
    }

    // Apply provided values (override defaults)
    for (const [key, value] of Object.entries(values)) {
      resolvedValues.set(key, this.stringify(value));
    }

    // Perform substitution
    const regex = this.getPlaceholderRegex();
    const content = template.replace(regex, (match, name: string) => {
      if (resolvedValues.has(name)) {
        substituted.push(name);
        return resolvedValues.get(name) ?? match;
      }

      if (this.options.allowUnresolved) {
        unresolved.push(name);
        return match;
      }

      unresolved.push(name);
      return match;
    });

    return {
      content,
      substituted: [...new Set(substituted)],
      unresolved: [...new Set(unresolved)],
    };
  }

  /**
   * Convert a value to string for template substitution
   */
  private stringify(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      // Format arrays appropriately for code context
      return JSON.stringify(value);
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Render a complete test template with variable substitution
   *
   * @param template Test template to render
   * @param values Variable values to substitute
   * @param options Optional render options
   * @returns Render result or error
   */
  renderTemplate(
    template: TestTemplate,
    values: Record<string, unknown>,
    options?: RenderOptions
  ): Result<RenderResult, PinataError> {
    const mergedOptions = { ...this.options, ...options };

    // Validate variables
    const validation = this.validateVariables(template, values);

    if (!validation.valid && mergedOptions.strict) {
      const errors: string[] = [];

      if (validation.missingRequired.length > 0) {
        errors.push(`Missing required variables: ${validation.missingRequired.join(", ")}`);
      }

      if (validation.typeErrors.length > 0) {
        errors.push(...validation.typeErrors);
      }

      if (validation.unknownVariables.length > 0) {
        errors.push(`Unknown variables: ${validation.unknownVariables.join(", ")}`);
      }

      return err(
        new TemplateRenderError("Template validation failed", {
          errors,
          validation,
        })
      );
    }

    // Perform substitution
    const { content, substituted, unresolved } = this.substituteVariables(
      template.template,
      values,
      template.variables
    );

    // Check for unresolved if not allowed
    if (unresolved.length > 0 && !mergedOptions.allowUnresolved && mergedOptions.strict) {
      return err(
        new TemplateRenderError("Unresolved template variables", {
          unresolved,
        })
      );
    }

    return ok({
      content,
      substituted,
      unresolved,
      imports: template.imports ?? [],
      fixtures: template.fixtures ?? [],
    });
  }

  /**
   * Render multiple templates at once
   *
   * @param templates Array of templates to render
   * @param values Variable values (applied to all templates)
   * @returns Array of render results
   */
  renderTemplates(
    templates: TestTemplate[],
    values: Record<string, unknown>
  ): Result<RenderResult[], PinataError> {
    const results: RenderResult[] = [];

    for (const template of templates) {
      const result = this.renderTemplate(template, values);
      if (!result.success) {
        return err(
          new TemplateRenderError(`Failed to render template '${template.id}'`, {
            templateId: template.id,
            originalError: result.error.message,
          })
        );
      }
      results.push(result.data);
    }

    return ok(results);
  }

  /**
   * Check if a template string contains nested placeholders
   * (e.g., {{outer{{inner}}}})
   *
   * @param template Template string to check
   * @returns True if nested placeholders detected
   */
  hasNestedPlaceholders(template: string): boolean {
    // Look for patterns like {{...{{...}}...}}
    const nestedPattern = /\{\{[^{}]*\{\{/;
    return nestedPattern.test(template);
  }

  /**
   * Extract all imports from rendered templates
   *
   * @param results Array of render results
   * @returns Deduplicated array of imports
   */
  collectImports(results: RenderResult[]): string[] {
    const imports = new Set<string>();
    for (const result of results) {
      for (const imp of result.imports) {
        imports.add(imp);
      }
    }
    return [...imports];
  }

  /**
   * Extract all fixtures from rendered templates
   *
   * @param results Array of render results
   * @returns Deduplicated array of fixtures
   */
  collectFixtures(results: RenderResult[]): string[] {
    const fixtures = new Set<string>();
    for (const result of results) {
      for (const fix of result.fixtures) {
        fixtures.add(fix);
      }
    }
    return [...fixtures];
  }

  /**
   * Get the appropriate regex for the configured placeholder format
   */
  private getPlaceholderRegex(): RegExp {
    switch (this.options.placeholderFormat) {
      case "dollar":
        // ${variableName}
        return /\$\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
      case "percent":
        // %(variableName)s
        return /%\(([a-zA-Z][a-zA-Z0-9_]*)\)s/g;
      case "mustache":
      default:
        // {{variableName}}
        return /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g;
    }
  }

  /**
   * Create a template from a string with variable definitions
   *
   * @param templateString Template content
   * @param variables Variable definitions
   * @param metadata Additional template metadata
   * @returns TestTemplate object
   */
  static createTemplate(
    templateString: string,
    variables: TemplateVariable[],
    metadata: Partial<Omit<TestTemplate, "template" | "variables">> = {}
  ): TestTemplate {
    return {
      id: metadata.id ?? "custom-template",
      language: metadata.language ?? "typescript",
      framework: metadata.framework ?? "jest",
      template: templateString,
      variables,
      imports: metadata.imports,
      fixtures: metadata.fixtures,
      description: metadata.description,
    };
  }
}

/**
 * Factory function to create a TemplateRenderer with default options
 */
export function createRenderer(options?: RenderOptions): TemplateRenderer {
  return new TemplateRenderer(options);
}
