/**
 * Layer 5: Dynamic Execution
 * 
 * Execute generated tests in sandboxed containers to confirm vulnerabilities.
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
