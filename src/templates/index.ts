/**
 * Template Rendering Module
 *
 * Provides tools for rendering test templates with variable substitution:
 * - Parse {{variable}} placeholders
 * - Validate required variables with type checking
 * - Substitute variables into templates
 * - Collect imports and fixtures
 *
 * @example
 * ```typescript
 * import { TemplateRenderer, createRenderer } from "@/templates";
 *
 * const renderer = createRenderer({ strict: true });
 *
 * const result = renderer.renderTemplate(template, {
 *   className: "UserService",
 *   functionName: "authenticate",
 * });
 *
 * if (result.success) {
 *   console.log(result.data.content);
 * }
 * ```
 */

export {
  TemplateRenderer,
  TemplateRenderError,
  createRenderer,
  type ParsedPlaceholder,
  type VariableValidationResult,
  type ValidationResult,
  type RenderOptions,
  type RenderResult,
} from "./renderer.js";
