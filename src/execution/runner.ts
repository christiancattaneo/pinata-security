/**
 * Layer 5: Test Execution Runner
 * 
 * Orchestrates the execution of generated tests in sandboxed containers.
 */

import { createSandbox, Sandbox } from "./sandbox.js";
import { parseResults } from "./results.js";
import { generateExploitTest } from "./generator.js";

import type {
  ExecutionRequest,
  ExecutionResult,
  ExecutionSummary,
  SandboxConfig,
  ExecutionLanguage,
  TestFramework,
} from "./types.js";
import { isTestable } from "./types.js";
import type { Gap } from "../core/scanner/types.js";

/** Test execution runner */
export class ExecutionRunner {
  private sandbox: Sandbox;
  private dryRun: boolean;

  constructor(config?: Partial<SandboxConfig>, dryRun = false) {
    this.sandbox = createSandbox(config);
    this.dryRun = dryRun;
  }

  /**
   * Initialize the runner (check Docker, build image if needed)
   */
  async initialize(): Promise<{ ready: boolean; error?: string }> {
    // Check Docker availability
    const dockerAvailable = await this.sandbox.isDockerAvailable();
    if (!dockerAvailable) {
      return {
        ready: false,
        error: "Docker not available. Install Docker to use --execute.",
      };
    }

    // Ensure sandbox image exists
    const imageReady = await this.sandbox.ensureImage();
    if (!imageReady) {
      return {
        ready: false,
        error: "Failed to build sandbox image.",
      };
    }

    return { ready: true };
  }

  /**
   * Execute tests for a batch of gaps
   */
  async executeAll(
    gaps: Gap[],
    fileContents: Map<string, string>
  ): Promise<ExecutionSummary> {
    const startTime = Date.now();
    const results: ExecutionResult[] = [];

    // Filter to testable gaps only
    const testableGaps = gaps.filter((gap) => isTestable(gap.categoryId));
    const skippedCount = gaps.length - testableGaps.length;

    console.log(`\nLayer 5: Dynamic Execution`);
    console.log(`  ${testableGaps.length} testable gaps (${skippedCount} skipped)`);

    if (this.dryRun) {
      console.log(`  DRY RUN: Generating tests without execution\n`);
    }

    for (let i = 0; i < testableGaps.length; i++) {
      const gap = testableGaps[i]!;
      const content = fileContents.get(gap.filePath) ?? "";

      console.log(`  [${i + 1}/${testableGaps.length}] ${gap.categoryId} at ${gap.filePath}:${gap.lineStart}`);

      const result = await this.executeOne(gap, content);
      results.push(result);

      // Log result
      const statusIcon = {
        confirmed: "🔴 CONFIRMED",
        unconfirmed: "⚪ unconfirmed",
        error: "❌ error",
        skipped: "⏭️ skipped",
      }[result.status];
      
      console.log(`      ${statusIcon}: ${result.summary}`);
    }

    // Add skipped results for non-testable gaps
    for (const gap of gaps) {
      if (!isTestable(gap.categoryId)) {
        results.push({
          status: "skipped",
          gap,
          summary: `${gap.categoryId} not dynamically testable`,
          durationMs: 0,
        });
      }
    }

    const summary: ExecutionSummary = {
      total: gaps.length,
      confirmed: results.filter((r) => r.status === "confirmed").length,
      unconfirmed: results.filter((r) => r.status === "unconfirmed").length,
      errors: results.filter((r) => r.status === "error").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      results,
      durationMs: Date.now() - startTime,
    };

    this.printSummary(summary);

    return summary;
  }

  /**
   * Execute test for a single gap
   */
  async executeOne(gap: Gap, targetCode: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Generate exploit test
      const language = this.detectLanguage(gap.filePath);
      const framework = this.getFramework(language);
      const testCode = generateExploitTest(gap, targetCode, language);

      if (this.dryRun) {
        return {
          status: "skipped",
          gap,
          summary: "Dry run - test generated but not executed",
          durationMs: Date.now() - startTime,
          evidence: {
            payload: "[dry run]",
            expected: "[dry run]",
            actual: "[dry run]",
            stdout: testCode,
            stderr: "",
            exitCode: 0,
          },
        };
      }

      // Prepare sandbox
      await this.sandbox.prepare(testCode, targetCode, language);

      // Execute test
      const execResult = await this.sandbox.run(framework);

      // Parse results
      const parsed = parseResults(execResult, gap, framework);

      return {
        ...parsed,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: "error",
        gap,
        summary: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.sandbox.cleanup();
    }
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): ExecutionLanguage {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      return "typescript";
    }
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) {
      return "javascript";
    }
    if (filePath.endsWith(".py")) {
      return "python";
    }
    if (filePath.endsWith(".go")) {
      return "go";
    }
    return "typescript"; // Default
  }

  /**
   * Get test framework for language
   */
  private getFramework(language: ExecutionLanguage): TestFramework {
    switch (language) {
      case "typescript":
      case "javascript":
        return "vitest";
      case "python":
        return "pytest";
      case "go":
        return "go-test";
      default:
        return "vitest";
    }
  }

  /**
   * Print execution summary
   */
  private printSummary(summary: ExecutionSummary): void {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`Dynamic Execution Summary`);
    console.log(`${"─".repeat(50)}`);
    console.log(`  Total tested:  ${summary.total}`);
    console.log(`  🔴 Confirmed:  ${summary.confirmed}`);
    console.log(`  ⚪ Unconfirmed: ${summary.unconfirmed}`);
    console.log(`  ❌ Errors:     ${summary.errors}`);
    console.log(`  ⏭️  Skipped:    ${summary.skipped}`);
    console.log(`  Duration:      ${(summary.durationMs / 1000).toFixed(1)}s`);
    console.log(`${"─".repeat(50)}\n`);
  }
}

/**
 * Create a new execution runner
 */
export function createRunner(
  config?: Partial<SandboxConfig>,
  dryRun = false
): ExecutionRunner {
  return new ExecutionRunner(config, dryRun);
}
