/**
 * Layer 5: Result Parsing
 * 
 * Parses test execution output to determine if vulnerability was confirmed.
 */

import type { 
  ExecutionResult, 
  ExecutionStatus, 
  ExecutionEvidence,
  TestFramework 
} from "./types.js";
import type { Gap } from "../core/scanner/types.js";

/** Raw execution output */
interface RawOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Parse test execution results
 */
export function parseResults(
  raw: RawOutput,
  gap: Gap,
  framework: TestFramework
): Omit<ExecutionResult, "durationMs"> {
  // Handle timeout
  if (raw.timedOut) {
    return {
      status: "error",
      gap,
      summary: "Execution timed out",
      error: "Test execution exceeded time limit",
      evidence: {
        payload: "",
        expected: "",
        actual: "",
        stdout: raw.stdout,
        stderr: raw.stderr,
        exitCode: raw.exitCode,
      },
    };
  }

  // Parse based on framework
  switch (framework) {
    case "vitest":
    case "jest":
      return parseVitestResults(raw, gap);
    case "pytest":
      return parsePytestResults(raw, gap);
    case "go-test":
      return parseGoTestResults(raw, gap);
    default:
      return parseGenericResults(raw, gap);
  }
}

/**
 * Parse Vitest/Jest JSON output
 */
function parseVitestResults(
  raw: RawOutput,
  gap: Gap
): Omit<ExecutionResult, "durationMs"> {
  const evidence: ExecutionEvidence = {
    payload: extractPayload(raw.stdout) ?? "",
    expected: "",
    actual: "",
    stdout: raw.stdout,
    stderr: raw.stderr,
    exitCode: raw.exitCode,
  };

  // Try to parse JSON output
  try {
    // Find JSON in output (vitest outputs JSON after some text)
    const jsonMatch = raw.stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[0]) as {
        success?: boolean;
        numPassedTests?: number;
        numFailedTests?: number;
        testResults?: Array<{
          assertionResults?: Array<{
            status: string;
            title: string;
            failureMessages?: string[];
          }>;
        }>;
      };

      // Check if exploit tests passed (vulnerability confirmed)
      const exploitPassed = json.testResults?.some((result) =>
        result.assertionResults?.some(
          (a) => a.status === "passed" && a.title.toLowerCase().includes("exploit")
        )
      );

      if (exploitPassed) {
        return {
          status: "confirmed",
          gap,
          summary: "Exploit test passed - vulnerability confirmed",
          evidence,
        };
      }

      // Check for test failures (vulnerability not exploitable)
      if (json.numFailedTests && json.numFailedTests > 0) {
        const failureMsg = json.testResults
          ?.flatMap((r) => r.assertionResults ?? [])
          .find((a) => a.status === "failed")?.failureMessages?.[0];

        return {
          status: "unconfirmed",
          gap,
          summary: `Exploit failed: ${failureMsg ?? "test assertions failed"}`,
          evidence,
        };
      }

      // All tests passed but no explicit exploit test
      if (json.success || (json.numPassedTests ?? 0) > 0) {
        return {
          status: "confirmed",
          gap,
          summary: "All tests passed - vulnerability likely confirmed",
          evidence,
        };
      }
    }
  } catch {
    // JSON parsing failed, fall back to exit code
  }

  // Fall back to exit code interpretation
  // Exit 0 = tests passed = vulnerability confirmed (our tests assert exploitability)
  // Exit 1 = tests failed = vulnerability not exploitable
  if (raw.exitCode === 0) {
    return {
      status: "confirmed",
      gap,
      summary: "Tests passed (exit 0) - vulnerability confirmed",
      evidence,
    };
  }

  return {
    status: "unconfirmed",
    gap,
    summary: `Tests failed (exit ${raw.exitCode}) - could not confirm vulnerability`,
    evidence,
  };
}

/**
 * Parse pytest output
 */
function parsePytestResults(
  raw: RawOutput,
  gap: Gap
): Omit<ExecutionResult, "durationMs"> {
  const evidence: ExecutionEvidence = {
    payload: extractPayload(raw.stdout) ?? "",
    expected: "",
    actual: "",
    stdout: raw.stdout,
    stderr: raw.stderr,
    exitCode: raw.exitCode,
  };

  // Check for passed tests
  const passedMatch = raw.stdout.match(/(\d+) passed/);
  const failedMatch = raw.stdout.match(/(\d+) failed/);

  const passed = passedMatch ? parseInt(passedMatch[1]!, 10) : 0;
  const failed = failedMatch ? parseInt(failedMatch[1]!, 10) : 0;

  if (passed > 0 && failed === 0) {
    return {
      status: "confirmed",
      gap,
      summary: `${passed} exploit tests passed - vulnerability confirmed`,
      evidence,
    };
  }

  if (failed > 0) {
    // Extract failure reason
    const assertionError = raw.stdout.match(/AssertionError: (.+)/);
    return {
      status: "unconfirmed",
      gap,
      summary: assertionError 
        ? `Exploit failed: ${assertionError[1]}`
        : `${failed} tests failed - could not confirm vulnerability`,
      evidence,
    };
  }

  // No clear result
  return {
    status: "error",
    gap,
    summary: "Could not parse test results",
    evidence,
    error: "Unexpected pytest output format",
  };
}

/**
 * Parse go test output
 */
function parseGoTestResults(
  raw: RawOutput,
  gap: Gap
): Omit<ExecutionResult, "durationMs"> {
  const evidence: ExecutionEvidence = {
    payload: extractPayload(raw.stdout) ?? "",
    expected: "",
    actual: "",
    stdout: raw.stdout,
    stderr: raw.stderr,
    exitCode: raw.exitCode,
  };

  // Check for PASS/FAIL in output
  if (raw.stdout.includes("PASS") && !raw.stdout.includes("FAIL")) {
    return {
      status: "confirmed",
      gap,
      summary: "Go tests passed - vulnerability confirmed",
      evidence,
    };
  }

  if (raw.stdout.includes("FAIL")) {
    return {
      status: "unconfirmed",
      gap,
      summary: "Go tests failed - could not confirm vulnerability",
      evidence,
    };
  }

  return parseGenericResults(raw, gap);
}

/**
 * Generic result parsing based on exit code
 */
function parseGenericResults(
  raw: RawOutput,
  gap: Gap
): Omit<ExecutionResult, "durationMs"> {
  const evidence: ExecutionEvidence = {
    payload: extractPayload(raw.stdout) ?? "",
    expected: "",
    actual: "",
    stdout: raw.stdout,
    stderr: raw.stderr,
    exitCode: raw.exitCode,
  };

  if (raw.exitCode === 0) {
    return {
      status: "confirmed",
      gap,
      summary: "Execution succeeded (exit 0) - vulnerability likely confirmed",
      evidence,
    };
  }

  return {
    status: "unconfirmed",
    gap,
    summary: `Execution failed (exit ${raw.exitCode})`,
    evidence,
  };
}

/**
 * Extract payload from test output
 */
function extractPayload(output: string): string | null {
  // Look for common payload markers in output
  const patterns = [
    /payload[:\s]+["']([^"']+)["']/i,
    /injecting[:\s]+["']([^"']+)["']/i,
    /testing[:\s]+["']([^"']+)["']/i,
    /UNION SELECT/i,
    /' OR '1'='1/i,
    /; DROP TABLE/i,
    /<script>/i,
    /\$\(.*\)/,
    /`.*`/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return match[1] ?? match[0];
    }
  }

  return null;
}
