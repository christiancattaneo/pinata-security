/**
 * AI Template Variable Filler
 *
 * Uses AI to intelligently fill template variables based on context.
 */

import { createAIService } from "./service.js";

import type { AIConfig, AIResponse, VariableSuggestion } from "./types.js";
import type { TemplateVariable } from "../categories/schema/index.js";
import type { Gap } from "../core/scanner/types.js";

const SYSTEM_PROMPT = `You are an expert at analyzing code and extracting meaningful variable values for test generation.
Given a code snippet and a list of template variables, suggest appropriate values for each variable.

For each variable, analyze:
1. The code snippet to extract relevant information (class names, function names, etc.)
2. The variable description to understand what's needed
3. The variable type to ensure correct formatting

Always respond with valid JSON matching this structure:
{
  "suggestions": [
    {
      "name": "variableName",
      "value": "suggested value",
      "reasoning": "why this value was chosen",
      "confidence": 0.0-1.0
    }
  ]
}

For arrays, use: "value": ["item1", "item2"]
For booleans, use: "value": true or "value": false
For numbers, use: "value": 42`;

export interface VariableFillRequest {
  /** Code snippet for context */
  codeSnippet: string;
  /** File path for additional context */
  filePath: string;
  /** Template variables to fill */
  variables: TemplateVariable[];
  /** Optional gap information */
  gap?: Gap;
  /** Any pre-filled values to exclude */
  existingValues?: Record<string, unknown>;
}

export interface VariableFillResult {
  /** Suggested values for each variable */
  suggestions: Map<string, VariableSuggestion>;
  /** Variables that couldn't be filled */
  unfilled: string[];
  /** Merged values (suggestions + existing) */
  values: Record<string, unknown>;
}

/**
 * Suggest variable values for a template
 */
export async function suggestVariables(
  request: VariableFillRequest,
  config?: Partial<AIConfig>
): Promise<AIResponse<VariableFillResult>> {
  const ai = createAIService(config);

  if (!ai.isConfigured()) {
    // Fall back to rule-based extraction
    return {
      success: true,
      data: extractVariablesFromCode(request),
      durationMs: 0,
    };
  }

  const prompt = buildVariablePrompt(request);
  const startTime = Date.now();

  const response = await ai.completeJSON<{ suggestions: VariableSuggestion[] }>({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1024,
    temperature: 0.2,
  });

  if (!response.success || !response.data) {
    // Fall back to rule-based extraction
    return {
      success: true,
      data: extractVariablesFromCode(request),
      durationMs: Date.now() - startTime,
    };
  }

  // Process AI suggestions
  const suggestions = new Map<string, VariableSuggestion>();
  const unfilled: string[] = [];
  const values: Record<string, unknown> = { ...request.existingValues };

  const suggestionsList = response.data.suggestions ?? [];
  for (const suggestion of suggestionsList) {
    suggestions.set(suggestion.name, suggestion);
    if (!(suggestion.name in values)) {
      values[suggestion.name] = suggestion.value;
    }
  }

  // Check for unfilled variables
  for (const variable of request.variables) {
    if (!suggestions.has(variable.name) && !(variable.name in values)) {
      if (variable.defaultValue !== undefined) {
        values[variable.name] = variable.defaultValue;
      } else {
        unfilled.push(variable.name);
      }
    }
  }

  const result: AIResponse<VariableFillResult> = {
    success: true,
    data: { suggestions, unfilled, values },
    durationMs: response.durationMs,
  };

  if (response.usage) {
    result.usage = response.usage;
  }

  return result;
}

/**
 * Build the prompt for variable suggestion
 */
function buildVariablePrompt(request: VariableFillRequest): string {
  const parts: string[] = [];

  parts.push("Analyze this code and suggest values for the template variables:\n");

  parts.push("**Code:**");
  parts.push("```");
  parts.push(request.codeSnippet);
  parts.push("```\n");

  parts.push(`**File:** ${request.filePath}\n`);

  if (request.gap) {
    parts.push(`**Category:** ${request.gap.categoryName}`);
    parts.push(`**Line:** ${request.gap.lineStart}\n`);
  }

  parts.push("**Variables to fill:**");
  for (const variable of request.variables) {
    const required = variable.required ? " (required)" : " (optional)";
    const defaultVal = variable.defaultValue !== undefined
      ? ` [default: ${JSON.stringify(variable.defaultValue)}]`
      : "";
    parts.push(`- ${variable.name} (${variable.type})${required}${defaultVal}: ${variable.description}`);
  }

  if (request.existingValues && Object.keys(request.existingValues).length > 0) {
    parts.push("\n**Already provided:**");
    for (const [name, value] of Object.entries(request.existingValues)) {
      parts.push(`- ${name}: ${JSON.stringify(value)}`);
    }
  }

  parts.push("\nExtract appropriate values from the code context.");

  return parts.join("\n");
}

/**
 * Rule-based variable extraction (fallback when AI is not available)
 */
function extractVariablesFromCode(request: VariableFillRequest): VariableFillResult {
  const suggestions = new Map<string, VariableSuggestion>();
  const unfilled: string[] = [];
  const values: Record<string, unknown> = { ...request.existingValues };

  const code = request.codeSnippet;
  const filePath = request.filePath;

  for (const variable of request.variables) {
    if (variable.name in values) continue;

    let value: unknown = undefined;
    let reasoning = "";
    let confidence = 0;

    switch (variable.name.toLowerCase()) {
      case "classname":
      case "class_name": {
        // Extract class name from code or file
        const classMatch = code.match(/class\s+(\w+)/);
        if (classMatch) {
          value = classMatch[1];
          reasoning = "Extracted from class definition in code";
          confidence = 0.9;
        } else {
          // Try to infer from file name
          const fileName = filePath.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
          value = toPascalCase(fileName);
          reasoning = "Inferred from file name";
          confidence = 0.6;
        }
        break;
      }

      case "functionname":
      case "function_name":
      case "methodname": {
        // Extract function name from code
        const funcMatch = code.match(/(?:def|function|async function)\s+(\w+)/);
        if (funcMatch) {
          value = funcMatch[1];
          reasoning = "Extracted from function definition";
          confidence = 0.9;
        }
        break;
      }

      case "modulepath":
      case "module_path": {
        // Convert file path to module path
        value = filePath
          .replace(/\.[jt]sx?$/, "")
          .replace(/\.py$/, "")
          .replace(/\//g, ".")
          .replace(/^\.+/, "");
        reasoning = "Derived from file path";
        confidence = 0.7;
        break;
      }

      case "tablename":
      case "table_name": {
        // Look for table name in SQL
        const tableMatch = code.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
        if (tableMatch) {
          value = tableMatch[1];
          reasoning = "Extracted from SQL statement";
          confidence = 0.8;
        } else {
          value = "users";
          reasoning = "Default table name";
          confidence = 0.3;
        }
        break;
      }

      case "exceptionclass":
      case "exception_class": {
        value = "ValueError";
        reasoning = "Common exception for input validation";
        confidence = 0.5;
        break;
      }

      case "dbclient":
      case "db_client": {
        // Look for database client variable
        const clientMatch = code.match(/(db|conn|connection|client|cursor)\s*[=.]/i);
        if (clientMatch) {
          value = clientMatch[1];
          reasoning = "Extracted from code";
          confidence = 0.7;
        } else {
          value = "db";
          reasoning = "Default database client name";
          confidence = 0.4;
        }
        break;
      }

      case "functioncall":
      case "function_call": {
        const funcName = values["functionName"] ?? values["function_name"];
        if (typeof funcName === "string" && funcName.length > 0) {
          value = `${funcName}(user_input)`;
          reasoning = "Constructed from function name";
          confidence = 0.6;
        }
        break;
      }

      case "fixtures": {
        value = "db_session";
        reasoning = "Common pytest fixture";
        confidence = 0.5;
        break;
      }

      default:
        // Use default value if available
        if (variable.defaultValue !== undefined) {
          value = variable.defaultValue;
          reasoning = "Using default value";
          confidence = 1.0;
        }
    }

    if (value !== undefined) {
      suggestions.set(variable.name, {
        name: variable.name,
        value: value as string | number | boolean | string[],
        reasoning,
        confidence,
      });
      values[variable.name] = value;
    } else if (variable.required) {
      unfilled.push(variable.name);
    }
  }

  return { suggestions, unfilled, values };
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
