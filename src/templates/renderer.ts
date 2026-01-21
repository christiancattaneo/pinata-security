import { z } from "zod";

import { ok, err } from "../lib/result.js";
import type { Result } from "../lib/result.js";
import { PinataError, ValidationError } from "../lib/errors.js";
import { VariableTypeSchema } from "../categories/schema/index.js";
import type {
  TestTemplate,
  TemplateVariable,
  VariableType,
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
 * Error for malformed template syntax
 */
export class TemplateSyntaxError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "TEMPLATE_SYNTAX_ERROR", context);
    this.name = "TemplateSyntaxError";
  }
}

/**
 * Regex for matching {{variable}} placeholders
 * Matches: {{variableName}}, {{variable_name}}, {{user.name}}
 */
const PLACEHOLDER_REGEX = /\{\{([a-zA-Z][a-zA-Z0-9_.]*)\}\}/g;

/**
 * Regex for matching {{#if variable}}...{{/if}} conditionals
 */
const CONDITIONAL_REGEX = /\{\{#if\s+([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}([\s\S]*?)(?:\{\{#else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

/**
 * Regex for matching {{#unless variable}}...{{/unless}} (inverse conditionals)
 */
const UNLESS_REGEX = /\{\{#unless\s+([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g;

/**
 * Regex for matching {{#each items}}...{{/each}} loops
 */
const EACH_REGEX = /\{\{#each\s+([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g;

/**
 * Regex for detecting unclosed blocks
 */
const UNCLOSED_IF_REGEX = /\{\{#if\s+[^}]+\}\}(?![\s\S]*\{\{\/if\}\})/;
const UNCLOSED_EACH_REGEX = /\{\{#each\s+[^}]+\}\}(?![\s\S]*\{\{\/each\}\})/;
const UNCLOSED_UNLESS_REGEX = /\{\{#unless\s+[^}]+\}\}(?![\s\S]*\{\{\/unless\}\})/;

/**
 * Regex for detecting orphaned closing tags
 */
const ORPHAN_ENDIF_REGEX = /\{\{\/if\}\}(?![\s\S]*\{\{#if)/;
const ORPHAN_ENDEACH_REGEX = /\{\{\/each\}\}(?![\s\S]*\{\{#each)/;
const ORPHAN_ENDUNLESS_REGEX = /\{\{\/unless\}\}(?![\s\S]*\{\{#unless)/;

/**
 * Result of parsing template placeholders
 */
export interface ParsedPlaceholder {
  /** Full match including braces: {{variableName}} */
  match: string;
  /** Variable name without braces: variableName or user.name */
  name: string;
  /** Start index in template */
  startIndex: number;
  /** End index in template */
  endIndex: number;
  /** Whether this is a nested path (e.g., user.name) */
  isNestedPath: boolean;
  /** Path segments for nested access */
  pathSegments: string[];
}

/**
 * Parsed conditional block
 */
export interface ParsedConditional {
  /** Full match */
  match: string;
  /** Variable name being tested */
  variable: string;
  /** Content if condition is true */
  trueBranch: string;
  /** Content if condition is false (optional) */
  falseBranch?: string;
  /** Start index */
  startIndex: number;
  /** End index */
  endIndex: number;
}

/**
 * Parsed loop block
 */
export interface ParsedLoop {
  /** Full match */
  match: string;
  /** Variable name of the array */
  variable: string;
  /** Loop body content */
  body: string;
  /** Start index */
  startIndex: number;
  /** End index */
  endIndex: number;
}

/**
 * Template syntax validation result
 */
export interface SyntaxValidationResult {
  valid: boolean;
  errors: TemplateSyntaxError[];
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
 * Supports:
 * - Simple variables: {{variableName}}
 * - Nested access: {{user.name}}
 * - Conditionals: {{#if variable}}...{{#else}}...{{/if}}
 * - Inverse conditionals: {{#unless variable}}...{{/unless}}
 * - Loops: {{#each items}}{{this}}{{/each}}
 *
 * @example
 * ```typescript
 * const renderer = new TemplateRenderer();
 *
 * const result = renderer.renderTemplate(template, {
 *   user: { name: "John", admin: true },
 *   items: ["a", "b", "c"],
 * });
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
   * Validate template syntax for common errors
   *
   * @param template Template string to validate
   * @returns Syntax validation result
   */
  validateSyntax(template: string): SyntaxValidationResult {
    const errors: TemplateSyntaxError[] = [];

    // Check for unclosed blocks
    if (this.hasUnclosedBlock(template, "if")) {
      errors.push(
        new TemplateSyntaxError("Unclosed {{#if}} block", {
          hint: "Every {{#if variable}} must have a matching {{/if}}",
        })
      );
    }

    if (this.hasUnclosedBlock(template, "each")) {
      errors.push(
        new TemplateSyntaxError("Unclosed {{#each}} block", {
          hint: "Every {{#each variable}} must have a matching {{/each}}",
        })
      );
    }

    if (this.hasUnclosedBlock(template, "unless")) {
      errors.push(
        new TemplateSyntaxError("Unclosed {{#unless}} block", {
          hint: "Every {{#unless variable}} must have a matching {{/unless}}",
        })
      );
    }

    // Check for orphaned closing tags
    if (this.hasOrphanedClosingTag(template, "if")) {
      errors.push(
        new TemplateSyntaxError("Orphaned {{/if}} without matching {{#if}}", {
          hint: "Remove the extra {{/if}} or add the opening {{#if variable}}",
        })
      );
    }

    if (this.hasOrphanedClosingTag(template, "each")) {
      errors.push(
        new TemplateSyntaxError("Orphaned {{/each}} without matching {{#each}}", {
          hint: "Remove the extra {{/each}} or add the opening {{#each variable}}",
        })
      );
    }

    if (this.hasOrphanedClosingTag(template, "unless")) {
      errors.push(
        new TemplateSyntaxError("Orphaned {{/unless}} without matching {{#unless}}", {
          hint: "Remove the extra {{/unless}} or add the opening {{#unless variable}}",
        })
      );
    }

    // Check for mismatched blocks
    const mismatchErrors = this.checkBlockNesting(template);
    errors.push(...mismatchErrors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if template has an unclosed block of specified type
   */
  private hasUnclosedBlock(template: string, blockType: string): boolean {
    const openRegex = new RegExp(`\\{\\{#${blockType}\\s+[^}]+\\}\\}`, "g");
    const closeRegex = new RegExp(`\\{\\{/${blockType}\\}\\}`, "g");

    const opens = (template.match(openRegex) || []).length;
    const closes = (template.match(closeRegex) || []).length;

    return opens > closes;
  }

  /**
   * Check if template has orphaned closing tags
   */
  private hasOrphanedClosingTag(template: string, blockType: string): boolean {
    const openRegex = new RegExp(`\\{\\{#${blockType}\\s+[^}]+\\}\\}`, "g");
    const closeRegex = new RegExp(`\\{\\{/${blockType}\\}\\}`, "g");

    const opens = (template.match(openRegex) || []).length;
    const closes = (template.match(closeRegex) || []).length;

    return closes > opens;
  }

  /**
   * Check for improperly nested blocks
   */
  private checkBlockNesting(template: string): TemplateSyntaxError[] {
    const errors: TemplateSyntaxError[] = [];
    const stack: { type: string; index: number }[] = [];

    // Match all block opens and closes
    const blockPattern = /\{\{(#(?:if|each|unless)|\/(?:if|each|unless))\s*[^}]*\}\}/g;
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(template)) !== null) {
      const tag = match[1] ?? "";

      if (tag.startsWith("#")) {
        // Opening tag
        const type = tag.slice(1).split(/\s/)[0] ?? "";
        stack.push({ type, index: match.index });
      } else if (tag.startsWith("/")) {
        // Closing tag
        const type = tag.slice(1);
        const last = stack.pop();

        if (!last) {
          // Orphaned closing tag (already handled)
          continue;
        }

        if (last.type !== type) {
          errors.push(
            new TemplateSyntaxError(`Mismatched block: opened {{#${last.type}}} but closed with {{/${type}}}`, {
              openedAt: last.index,
              closedAt: match.index,
            })
          );
        }
      }
    }

    return errors;
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
      const name = match[1] ?? "";
      const pathSegments = name.split(".");
      placeholders.push({
        match: match[0],
        name,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        isNestedPath: pathSegments.length > 1,
        pathSegments,
      });
    }

    return placeholders;
  }

  /**
   * Parse conditional blocks from template
   *
   * @param template Template string to parse
   * @returns Array of parsed conditionals
   */
  parseConditionals(template: string): ParsedConditional[] {
    const conditionals: ParsedConditional[] = [];
    const regex = new RegExp(CONDITIONAL_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
      const falseBranch = match[3];
      conditionals.push({
        match: match[0],
        variable: match[1] ?? "",
        trueBranch: match[2] ?? "",
        ...(falseBranch !== undefined && { falseBranch }),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return conditionals;
  }

  /**
   * Parse loop blocks from template
   *
   * @param template Template string to parse
   * @returns Array of parsed loops
   */
  parseLoops(template: string): ParsedLoop[] {
    const loops: ParsedLoop[] = [];
    const regex = new RegExp(EACH_REGEX.source, "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(template)) !== null) {
      loops.push({
        match: match[0],
        variable: match[1] ?? "",
        body: match[2] ?? "",
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return loops;
  }

  /**
   * Get unique variable names from template (including nested paths)
   * Excludes loop-internal variables like {{this}}, {{@index}}, and item properties
   *
   * @param template Template string to analyze
   * @param excludeLoopInternal Whether to exclude variables inside loop blocks
   * @returns Unique variable names found in template
   */
  getVariableNames(template: string, excludeLoopInternal = true): string[] {
    let processedTemplate = template;

    // If excluding loop internals, remove loop body content first
    if (excludeLoopInternal) {
      processedTemplate = processedTemplate.replace(EACH_REGEX, (match, variable: string) => {
        // Keep only the loop variable reference
        return `{{${variable}}}`;
      });
    }

    const placeholders = this.parsePlaceholders(processedTemplate);
    const names = new Set<string>();

    // Special loop variables to always exclude
    const loopSpecialVars = new Set(["this", "@index", "@first", "@last"]);

    for (const p of placeholders) {
      // Skip special loop variables
      if (loopSpecialVars.has(p.name)) {
        continue;
      }

      // Add the full path
      names.add(p.name);
      // Also add the root variable for nested paths
      if (p.isNestedPath && p.pathSegments[0]) {
        names.add(p.pathSegments[0]);
      }
    }

    // Also extract variables from conditionals (but not inside loops if excluding)
    const conditionals = this.parseConditionals(processedTemplate);
    for (const c of conditionals) {
      names.add(c.variable);
      const root = c.variable.split(".")[0];
      if (root && root !== c.variable) {
        names.add(root);
      }
    }

    // Extract loop array variables
    const loops = this.parseLoops(template); // Use original template for loop detection
    for (const l of loops) {
      names.add(l.variable);
      const root = l.variable.split(".")[0];
      if (root && root !== l.variable) {
        names.add(root);
      }
    }

    return [...names];
  }

  /**
   * Get value from object using dot notation path
   *
   * @param obj Object to traverse
   * @param path Dot-separated path (e.g., "user.address.city")
   * @returns Value at path or undefined
   */
  getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const segments = path.split(".");
    let current: unknown = obj;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  /**
   * Evaluate if a value is truthy for conditional blocks
   *
   * @param value Value to evaluate
   * @returns True if value is truthy
   */
  isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      return value.length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return Boolean(value);
  }

  /**
   * Process conditional blocks in template
   *
   * @param template Template string
   * @param values Variable values
   * @returns Processed template with conditionals resolved
   */
  processConditionals(template: string, values: Record<string, unknown>): string {
    let result = template;

    // Process {{#if}} blocks
    result = result.replace(CONDITIONAL_REGEX, (match, variable: string, trueBranch: string, falseBranch?: string) => {
      const value = this.getNestedValue(values, variable);
      const condition = this.isTruthy(value);
      return condition ? trueBranch : (falseBranch ?? "");
    });

    // Process {{#unless}} blocks (inverse conditionals)
    result = result.replace(UNLESS_REGEX, (match, variable: string, content: string) => {
      const value = this.getNestedValue(values, variable);
      const condition = this.isTruthy(value);
      return condition ? "" : content;
    });

    return result;
  }

  /**
   * Process loop blocks in template
   *
   * @param template Template string
   * @param values Variable values
   * @returns Processed template with loops expanded
   */
  processLoops(template: string, values: Record<string, unknown>): string {
    let result = template;

    result = result.replace(EACH_REGEX, (match, variable: string, body: string) => {
      const arrayValue = this.getNestedValue(values, variable);

      if (!Array.isArray(arrayValue)) {
        // If not an array, return empty string
        return "";
      }

      // Expand the loop
      const expanded: string[] = [];
      for (let i = 0; i < arrayValue.length; i++) {
        const item = arrayValue[i];
        let iterationBody = body;

        // Replace special loop variables
        // {{this}} - current item (for primitives)
        // {{@index}} - current index
        // {{@first}} - true if first item
        // {{@last}} - true if last item
        iterationBody = iterationBody.replace(/\{\{this\}\}/g, this.stringify(item));
        iterationBody = iterationBody.replace(/\{\{@index\}\}/g, String(i));
        iterationBody = iterationBody.replace(/\{\{@first\}\}/g, String(i === 0));
        iterationBody = iterationBody.replace(/\{\{@last\}\}/g, String(i === arrayValue.length - 1));

        // If item is an object, process conditionals with item context first
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const itemObj = item as Record<string, unknown>;

          // Process conditionals within this iteration using item's properties
          iterationBody = this.processConditionals(iterationBody, itemObj);

          // Then replace any remaining simple property placeholders
          for (const [key, value] of Object.entries(itemObj)) {
            const propRegex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
            iterationBody = iterationBody.replace(propRegex, this.stringify(value));
          }
        }

        expanded.push(iterationBody);
      }

      return expanded.join("");
    });

    return result;
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
        // Check if it's used in template but not defined (include nested paths)
        const isUsed = [...usedInTemplate].some((used) => used === name || used.startsWith(name + "."));

        if (isUsed) {
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
      // For nested paths, check if root variable is provided
      const rootVar = placeholder.split(".")[0] ?? placeholder;
      const hasValue = placeholder in values || rootVar in values;

      if (!hasValue && !defined?.defaultValue) {
        // Check if this is a required defined variable (already handled above)
        // or an undefined placeholder
        if (!defined) {
          // Only add root variables to missing (nested paths are covered by root)
          if (!placeholder.includes(".")) {
            missingRequired.push(placeholder);
          } else if (!(rootVar in values)) {
            missingRequired.push(rootVar);
          }
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
    const resolvedValues = new Map<string, unknown>();

    // Apply defaults first
    if (variableDefs) {
      for (const def of variableDefs) {
        if (def.defaultValue !== undefined) {
          resolvedValues.set(def.name, def.defaultValue);
        }
      }
    }

    // Apply provided values (override defaults)
    // Note: explicitly set undefined/null values to empty string
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === null) {
        resolvedValues.set(key, null); // Mark as explicitly set but empty
      } else {
        resolvedValues.set(key, value);
      }
    }

    // Build combined values object for nested access
    const combinedValues: Record<string, unknown> = {};
    for (const [key, value] of resolvedValues) {
      combinedValues[key] = value;
    }

    // Perform substitution
    const regex = this.getPlaceholderRegex();
    const content = template.replace(regex, (match, name: string) => {
      // Check for nested path
      let value: unknown;
      let hasValue = false;

      if (name.includes(".")) {
        value = this.getNestedValue(combinedValues, name);
        hasValue = value !== undefined;
      } else {
        hasValue = resolvedValues.has(name);
        value = resolvedValues.get(name);
      }

      if (hasValue) {
        substituted.push(name);
        return this.stringify(value);
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
   * Process all template features: conditionals, loops, then variable substitution
   *
   * @param template Template string
   * @param values Variable values
   * @param variableDefs Optional variable definitions
   * @returns Processed content with all features applied
   */
  processTemplate(
    template: string,
    values: Record<string, unknown>,
    variableDefs?: TemplateVariable[]
  ): Result<{ content: string; substituted: string[]; unresolved: string[] }, PinataError> {
    // First, validate syntax
    const syntaxResult = this.validateSyntax(template);
    if (!syntaxResult.valid && this.options.strict) {
      return err(syntaxResult.errors[0] ?? new TemplateSyntaxError("Unknown syntax error"));
    }

    // Build combined values with defaults
    const combinedValues: Record<string, unknown> = {};
    if (variableDefs) {
      for (const def of variableDefs) {
        if (def.defaultValue !== undefined) {
          combinedValues[def.name] = def.defaultValue;
        }
      }
    }
    for (const [key, value] of Object.entries(values)) {
      combinedValues[key] = value;
    }

    // Process in order: loops first, then conditionals, then simple substitution
    let processed = template;

    // Process loops (may create new content with placeholders)
    processed = this.processLoops(processed, combinedValues);

    // Process conditionals
    processed = this.processConditionals(processed, combinedValues);

    // Finally, substitute remaining variables
    const result = this.substituteVariables(processed, combinedValues, variableDefs);

    return ok(result);
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

    // First validate syntax
    const syntaxResult = this.validateSyntax(template.template);
    if (!syntaxResult.valid && mergedOptions.strict) {
      return err(syntaxResult.errors[0] ?? new TemplateSyntaxError("Unknown syntax error"));
    }

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

    // Process the template with all features
    const processResult = this.processTemplate(template.template, values, template.variables);
    if (!processResult.success) {
      return processResult;
    }

    const { content, substituted, unresolved } = processResult.data;

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
        // ${variableName} or ${user.name}
        return /\$\{([a-zA-Z][a-zA-Z0-9_.]*)\}/g;
      case "percent":
        // %(variableName)s
        return /%\(([a-zA-Z][a-zA-Z0-9_.]*)\)s/g;
      case "mustache":
      default:
        // {{variableName}} or {{user.name}}
        return /\{\{([a-zA-Z][a-zA-Z0-9_.]*)\}\}/g;
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
