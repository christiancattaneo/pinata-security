/**
 * AI Service Module
 *
 * Provides AI-powered capabilities for:
 * - Smart template variable filling
 * - Natural language explanations of findings
 * - Custom pattern suggestions
 */

export { AIService, createAIService } from "./service.js";
export { explainGap, explainGaps, generateFallbackExplanation } from "./explainer.js";
export { suggestVariables } from "./template-filler.js";
export { suggestPatterns, formatPatternAsYaml } from "./pattern-suggester.js";
export type { AIConfig, AIProvider, AIResponse } from "./types.js";
