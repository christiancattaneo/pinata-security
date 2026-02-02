/**
 * AI Service Types
 */

export type AIProvider = "anthropic" | "openai" | "mock";

export interface AIConfig {
  /** AI provider to use */
  provider: AIProvider;
  /** API key (reads from env if not provided) */
  apiKey?: string;
  /** Model to use (provider-specific) */
  model?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature (0-1) */
  temperature?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

export interface AIResponse<T = string> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Response time in ms */
  durationMs: number;
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CompletionRequest {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * Gap explanation result
 */
export interface GapExplanation {
  /** Short summary (1-2 sentences) */
  summary: string;
  /** Detailed explanation */
  explanation: string;
  /** Why this is a security/quality risk */
  risk: string;
  /** How to fix it */
  remediation: string;
  /** Example of safe code */
  safeExample?: string;
  /** Relevant CVEs or references */
  references?: string[];
}

/**
 * Template variable suggestion
 */
export interface VariableSuggestion {
  /** Variable name */
  name: string;
  /** Suggested value */
  value: string | number | boolean | string[];
  /** Reasoning for the suggestion */
  reasoning: string;
  /** Confidence in the suggestion (0-1) */
  confidence: number;
}

/**
 * Pattern suggestion result
 */
export interface PatternSuggestion {
  /** Suggested pattern ID */
  id: string;
  /** Regex pattern */
  pattern: string;
  /** Description of what it detects */
  description: string;
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Example code that would match */
  matchExample: string;
  /** Example code that should NOT match */
  safeExample: string;
  /** Reasoning for the pattern */
  reasoning: string;
}
