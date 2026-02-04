/**
 * Layer 5: Dynamic Execution
 * 
 * Execute generated tests in sandboxed containers to confirm vulnerabilities.
 * Features:
 * - Comprehensive payload library with mutations
 * - AI-crafted context-aware payloads
 * - Attack chain detection and exploitation
 * - Sandbox execution with evidence collection
 */

// Types
export type {
  SandboxConfig,
  ExecutionRequest,
  ExecutionResult,
  ExecutionSummary,
  ExecutionStatus,
  ExecutionEvidence,
  ExecutionLanguage,
  TestFramework,
  ContainerState,
  TestableVulnerability,
} from "./types.js";

export {
  DEFAULT_SANDBOX_CONFIG,
  TESTABLE_VULNERABILITIES,
  isTestable,
} from "./types.js";

// Sandbox
export { Sandbox, createSandbox } from "./sandbox.js";

// Runner
export { ExecutionRunner, createRunner } from "./runner.js";

// Results
export { parseResults } from "./results.js";

// Generator
export { generateExploitTest } from "./generator.js";

// Payload Library
export {
  SQL_INJECTION_PAYLOADS,
  XSS_PAYLOADS,
  COMMAND_INJECTION_PAYLOADS,
  PATH_TRAVERSAL_PAYLOADS,
  SSRF_PAYLOADS,
  XXE_PAYLOADS,
  AUTH_BYPASS_PAYLOADS,
  IDOR_PAYLOADS,
  OPEN_REDIRECT_PAYLOADS,
  DESERIALIZATION_PAYLOADS,
  MUTATION_STRATEGIES,
  mutatePayload,
  getPayloadsForCategory,
  getPayloadsWithMutations,
} from "./payloads.js";

export type { MutationStrategy } from "./payloads.js";

// AI-Crafted Payloads
export {
  AI_PAYLOAD_SYSTEM_PROMPT,
  generatePayloadPrompt,
  extractTechStack,
  parseAiPayloadResponse,
  combinePayloads,
  getFallbackPayloads,
} from "./ai-payloads.js";

export type {
  AiPayload,
  PayloadContext,
  TechStackHints,
} from "./ai-payloads.js";

// Attack Chains
export {
  KNOWN_CHAIN_PATTERNS,
  identifyChains,
  generateChainExploitTest,
  generateChainReport,
} from "./chains.js";

export type {
  AttackChain,
  ChainStep,
  ChainPattern,
} from "./chains.js";
