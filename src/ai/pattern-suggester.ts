/**
 * AI Pattern Suggester
 *
 * Uses AI to suggest new detection patterns based on code samples.
 */

import { createAIService } from "./service.js";

import type { AIConfig, AIResponse, PatternSuggestion } from "./types.js";

const SYSTEM_PROMPT = `You are an expert at creating regex patterns for detecting security vulnerabilities in code.
Given vulnerable code samples, generate regex patterns that will detect similar vulnerabilities.

Your patterns should:
1. Be specific enough to avoid false positives
2. Be general enough to catch variations
3. Use standard regex syntax (no lookbehind for compatibility)
4. Include examples of what matches and what doesn't

Always respond with valid JSON matching this structure:
{
  "suggestions": [
    {
      "id": "pattern-id-kebab-case",
      "pattern": "regex pattern here",
      "description": "What this pattern detects",
      "confidence": "high|medium|low",
      "matchExample": "code that should match",
      "safeExample": "similar code that should NOT match",
      "reasoning": "Why this pattern works"
    }
  ]
}

Important:
- Escape backslashes properly for JSON (use \\\\s not \\s)
- Test your patterns mentally against the examples
- Prefer simpler patterns that are less likely to cause ReDoS`;

export interface PatternSuggestionRequest {
  /** Category to suggest patterns for */
  category: string;
  /** Vulnerable code samples */
  vulnerableCode: string[];
  /** Safe code samples (to avoid matching) */
  safeCode?: string[];
  /** Language of the code */
  language: string;
  /** Existing patterns to avoid duplicating */
  existingPatterns?: string[];
  /** Maximum number of suggestions */
  maxSuggestions?: number;
}

export interface PatternSuggestionResult {
  /** Suggested patterns */
  suggestions: PatternSuggestion[];
  /** Patterns that were tested but had issues */
  rejected: Array<{
    pattern: string;
    reason: string;
  }>;
}

/**
 * Suggest patterns based on code samples
 */
export async function suggestPatterns(
  request: PatternSuggestionRequest,
  config?: Partial<AIConfig>
): Promise<AIResponse<PatternSuggestionResult>> {
  const ai = createAIService(config);

  if (!ai.isConfigured()) {
    return {
      success: false,
      error: "AI service not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
      durationMs: 0,
    };
  }

  const prompt = buildPatternPrompt(request);

  const response = await ai.completeJSON<{ suggestions: PatternSuggestion[] }>({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2048,
    temperature: 0.3,
  });

  if (!response.success || !response.data) {
    return {
      success: false,
      error: response.error ?? "Failed to generate patterns",
      durationMs: response.durationMs,
    };
  }

  // Validate and test each pattern
  const validated = validatePatterns(
    response.data.suggestions ?? [],
    request.vulnerableCode,
    request.safeCode ?? []
  );

  const result: AIResponse<PatternSuggestionResult> = {
    success: true,
    data: validated,
    durationMs: response.durationMs,
  };

  if (response.usage) {
    result.usage = response.usage;
  }

  return result;
}

/**
 * Build the prompt for pattern suggestion
 */
function buildPatternPrompt(request: PatternSuggestionRequest): string {
  const parts: string[] = [];

  parts.push(`Generate regex patterns to detect ${request.category} vulnerabilities in ${request.language} code.\n`);

  parts.push("**Vulnerable code samples (patterns SHOULD match these):**");
  for (let i = 0; i < request.vulnerableCode.length; i++) {
    parts.push(`\nExample ${i + 1}:`);
    parts.push("```");
    parts.push(request.vulnerableCode[i] ?? "");
    parts.push("```");
  }

  if (request.safeCode && request.safeCode.length > 0) {
    parts.push("\n**Safe code samples (patterns should NOT match these):**");
    for (let i = 0; i < request.safeCode.length; i++) {
      parts.push(`\nSafe ${i + 1}:`);
      parts.push("```");
      parts.push(request.safeCode[i] ?? "");
      parts.push("```");
    }
  }

  if (request.existingPatterns && request.existingPatterns.length > 0) {
    parts.push("\n**Existing patterns (avoid duplicating):**");
    for (const pattern of request.existingPatterns) {
      parts.push(`- ${pattern}`);
    }
  }

  parts.push(`\nGenerate up to ${request.maxSuggestions ?? 3} distinct patterns.`);
  parts.push("Focus on patterns that will have high precision (low false positives).");

  return parts.join("\n");
}

/**
 * Validate patterns against test samples
 */
function validatePatterns(
  suggestions: PatternSuggestion[],
  vulnerableCode: string[],
  safeCode: string[]
): PatternSuggestionResult {
  const validated: PatternSuggestion[] = [];
  const rejected: Array<{ pattern: string; reason: string }> = [];

  for (const suggestion of suggestions) {
    try {
      // Test if pattern compiles
      const regex = new RegExp(suggestion.pattern, "gm");

      // Test against vulnerable samples
      let matchCount = 0;
      for (const code of vulnerableCode) {
        regex.lastIndex = 0;
        if (regex.test(code)) {
          matchCount++;
        }
      }

      // Test against safe samples
      let falsePositives = 0;
      for (const code of safeCode) {
        regex.lastIndex = 0;
        if (regex.test(code)) {
          falsePositives++;
        }
      }

      // Check for ReDoS potential (simple heuristic)
      if (hasRedosPotential(suggestion.pattern)) {
        rejected.push({
          pattern: suggestion.pattern,
          reason: "Pattern may be vulnerable to ReDoS",
        });
        continue;
      }

      // Accept if it matches at least some vulnerable code
      if (matchCount > 0) {
        // Adjust confidence based on actual results
        if (falsePositives > 0 && suggestion.confidence === "high") {
          suggestion.confidence = "medium";
        }
        if (matchCount < vulnerableCode.length / 2 && suggestion.confidence === "high") {
          suggestion.confidence = "medium";
        }
        validated.push(suggestion);
      } else {
        rejected.push({
          pattern: suggestion.pattern,
          reason: `Pattern did not match any vulnerable samples (0/${vulnerableCode.length})`,
        });
      }
    } catch (error) {
      rejected.push({
        pattern: suggestion.pattern,
        reason: `Invalid regex: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return { suggestions: validated, rejected };
}

/**
 * Check for potential ReDoS patterns (simple heuristic)
 */
function hasRedosPotential(pattern: string): boolean {
  // Check for nested quantifiers like (a+)+ or (a*)*
  if (/\([^)]*[+*][^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  // Check for overlapping alternations with quantifiers
  if (/\([^)]*\|[^)]*\)[+*]/.test(pattern)) {
    // More specific check for dangerous patterns
    const alternationMatch = pattern.match(/\(([^)]+)\)/g);
    if (alternationMatch) {
      for (const alt of alternationMatch) {
        // Check if alternation branches can match same input
        if (/\w+\|\w*\w/.test(alt) && /[+*]/.test(alt)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Format a pattern suggestion as YAML for adding to category definitions
 */
export function formatPatternAsYaml(suggestion: PatternSuggestion, language: string): string {
  // Escape the pattern for YAML
  const escapedPattern = suggestion.pattern
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  return `  - id: ${suggestion.id}
    type: regex
    language: ${language}
    pattern: "${escapedPattern}"
    confidence: ${suggestion.confidence}
    description: ${suggestion.description}`;
}

/**
 * Suggest patterns from missed vulnerabilities (for improving detection)
 */
export async function suggestPatternsFromMissed(
  category: string,
  missedCode: string[],
  detectedCode: string[],
  language: string,
  config?: Partial<AIConfig>
): Promise<AIResponse<PatternSuggestionResult>> {
  // The missed code is what we WANT to detect
  // The detected code can help understand what patterns we already catch
  return suggestPatterns(
    {
      category,
      vulnerableCode: missedCode,
      safeCode: [], // We don't have safe code in this context
      language,
      maxSuggestions: 5,
    },
    config
  );
}
