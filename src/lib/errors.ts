/**
 * Base error class for all Pinata errors
 */
export class PinataError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PinataError";
    // Maintains proper stack trace for where error was thrown (V8 only)
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Serialize error for logging or API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Error for schema validation failures
 */
export class ValidationError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", context);
    this.name = "ValidationError";
  }
}

/**
 * Error for file/code parsing failures
 */
export class ParseError extends PinataError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly line?: number,
    context?: Record<string, unknown>
  ) {
    super(message, "PARSE_ERROR", { ...context, filePath, line });
    this.name = "ParseError";
  }
}

/**
 * Error for configuration issues
 */
export class ConfigError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "CONFIG_ERROR", context);
    this.name = "ConfigError";
  }
}

/**
 * Error during codebase analysis
 */
export class AnalysisError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "ANALYSIS_ERROR", context);
    this.name = "AnalysisError";
  }
}

/**
 * Error during test generation
 */
export class GenerationError extends PinataError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "GENERATION_ERROR", context);
    this.name = "GenerationError";
  }
}

/**
 * Error for category not found
 */
export class CategoryNotFoundError extends PinataError {
  constructor(categoryId: string) {
    super(`Category not found: ${categoryId}`, "CATEGORY_NOT_FOUND", { categoryId });
    this.name = "CategoryNotFoundError";
  }
}

/**
 * Error for pattern not found
 */
export class PatternNotFoundError extends PinataError {
  constructor(patternId: string) {
    super(`Pattern not found: ${patternId}`, "PATTERN_NOT_FOUND", { patternId });
    this.name = "PatternNotFoundError";
  }
}
