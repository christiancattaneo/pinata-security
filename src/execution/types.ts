/**
 * Layer 5: Dynamic Execution Types
 */

import type { Gap } from "../core/scanner/types.js";

/** Execution environment configuration */
export interface SandboxConfig {
  /** Docker image to use */
  image: string;
  /** CPU limit (e.g., "1") */
  cpuLimit: string;
  /** Memory limit (e.g., "512m") */
  memoryLimit: string;
  /** Execution timeout in seconds */
  timeoutSeconds: number;
  /** Allow network access (dangerous, default false) */
  networkEnabled: boolean;
  /** Working directory inside container */
  workDir: string;
}

/** Default sandbox configuration - secure by default */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  image: "pinata-sandbox:latest",
  cpuLimit: "1",
  memoryLimit: "512m",
  timeoutSeconds: 30,
  networkEnabled: false,
  workDir: "/sandbox",
};

/** Test execution request */
export interface ExecutionRequest {
  /** Gap being tested */
  gap: Gap;
  /** Generated test code */
  testCode: string;
  /** Target file content */
  targetCode: string;
  /** Test framework to use */
  framework: TestFramework;
  /** Language runtime */
  language: ExecutionLanguage;
  /** Optional sandbox config overrides */
  sandboxConfig?: Partial<SandboxConfig>;
}

/** Supported test frameworks */
export type TestFramework = "vitest" | "jest" | "pytest" | "go-test";

/** Supported execution languages */
export type ExecutionLanguage = "typescript" | "javascript" | "python" | "go";

/** Execution result status */
export type ExecutionStatus = 
  | "confirmed"      // Vulnerability exploited successfully
  | "unconfirmed"    // Test ran but exploit failed
  | "error"          // Execution failed (timeout, crash, etc.)
  | "skipped";       // Not applicable for dynamic testing

/** Single test execution result */
export interface ExecutionResult {
  /** Status of the execution */
  status: ExecutionStatus;
  /** Gap that was tested */
  gap: Gap;
  /** Human-readable summary */
  summary: string;
  /** Detailed evidence (stdout, payloads, etc.) */
  evidence?: ExecutionEvidence;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error message if status is "error" */
  error?: string;
}

/** Evidence from successful exploitation */
export interface ExecutionEvidence {
  /** Payload that triggered the vulnerability */
  payload: string;
  /** Expected result (what safe code would do) */
  expected: string;
  /** Actual result (what vulnerable code did) */
  actual: string;
  /** Raw stdout from test execution */
  stdout: string;
  /** Raw stderr from test execution */
  stderr: string;
  /** Exit code */
  exitCode: number;
}

/** Batch execution summary */
export interface ExecutionSummary {
  /** Total gaps tested */
  total: number;
  /** Confirmed vulnerabilities */
  confirmed: number;
  /** Unconfirmed (false positives or bad tests) */
  unconfirmed: number;
  /** Errors during execution */
  errors: number;
  /** Skipped (not testable dynamically) */
  skipped: number;
  /** Individual results */
  results: ExecutionResult[];
  /** Total duration */
  durationMs: number;
}

/** Docker container state */
export interface ContainerState {
  /** Container ID */
  id: string;
  /** Current status */
  status: "created" | "running" | "exited" | "error";
  /** Exit code if exited */
  exitCode?: number;
  /** Start time */
  startedAt?: Date;
  /** End time */
  finishedAt?: Date;
}

/** Vulnerability types that are dynamically testable */
export const TESTABLE_VULNERABILITIES = [
  "sql-injection",
  "xss",
  "command-injection",
  "path-traversal",
  "ssrf",
  "deserialization",
] as const;

export type TestableVulnerability = typeof TESTABLE_VULNERABILITIES[number];

/** Check if a category is dynamically testable */
export function isTestable(categoryId: string): boolean {
  return TESTABLE_VULNERABILITIES.includes(categoryId as TestableVulnerability);
}
