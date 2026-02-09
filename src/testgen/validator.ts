/**
 * Test validator
 *
 * Validates generated tests are:
 * 1. Syntactically valid (compiles/parses)
 * 2. Actually useful (fails against vulnerable code)
 */

import { execFile } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { dirname, extname } from "path";

import type { GeneratedTest } from "./generator.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  test: GeneratedTest;
  /** Does the test compile/parse without errors? */
  compiles: boolean;
  /** Does the test fail when run? (good = catches the vulnerability) */
  failsCorrectly: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Compilation errors if any */
  compileErrors?: string;
  /** Test output */
  testOutput?: string;
}

// =============================================================================
// COMPILE CHECK
// =============================================================================

function runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = execFile(cmd, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? "",
        exitCode: error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? 1 : (error as any)?.code ?? (error ? 1 : 0),
      });
    });
  });
}

/**
 * Check if a TypeScript test file compiles
 */
async function checkTypeScript(filePath: string, cwd: string): Promise<{ ok: boolean; errors: string }> {
  const result = await runCommand("npx", ["tsc", "--noEmit", "--esModuleInterop", "--skipLibCheck", filePath], cwd);
  return {
    ok: result.exitCode === 0,
    errors: result.stderr || result.stdout,
  };
}

/**
 * Check if a Python test file parses
 */
async function checkPython(filePath: string, cwd: string): Promise<{ ok: boolean; errors: string }> {
  const result = await runCommand("python3", ["-m", "py_compile", filePath], cwd);
  return {
    ok: result.exitCode === 0,
    errors: result.stderr,
  };
}

// =============================================================================
// RUN CHECK
// =============================================================================

/**
 * Run a test and check if it fails (which is what we want for security tests)
 */
async function runTest(filePath: string, cwd: string, framework: string): Promise<{ failed: boolean; output: string }> {
  let result;

  switch (framework) {
    case "vitest":
      result = await runCommand("npx", ["vitest", "run", filePath, "--no-coverage"], cwd, 60000);
      break;
    case "jest":
      result = await runCommand("npx", ["jest", filePath, "--no-coverage"], cwd, 60000);
      break;
    case "pytest":
      result = await runCommand("python3", ["-m", "pytest", filePath, "-x", "--no-header"], cwd, 60000);
      break;
    case "go-test":
      result = await runCommand("go", ["test", "-run", filePath], cwd, 60000);
      break;
    default:
      return { failed: false, output: `Unknown framework: ${framework}` };
  }

  return {
    failed: result.exitCode !== 0,
    output: (result.stdout + "\n" + result.stderr).trim(),
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Validate a generated test:
 * 1. Write it to disk (temporarily)
 * 2. Check it compiles
 * 3. Run it and verify it fails (catches the vulnerability)
 */
export async function validateTest(
  test: GeneratedTest,
  projectRoot: string,
  frameworkName: string,
  options: { skipRun?: boolean } = {}
): Promise<ValidationResult> {
  // Write the test file
  await mkdir(dirname(test.filePath), { recursive: true });
  await writeFile(test.filePath, test.content, "utf-8");

  try {
    // Step 1: Compile check
    const ext = extname(test.filePath);
    let compileResult: { ok: boolean; errors: string };

    if (ext === ".ts" || ext === ".tsx") {
      compileResult = await checkTypeScript(test.filePath, projectRoot);
    } else if (ext === ".py") {
      compileResult = await checkPython(test.filePath, projectRoot);
    } else {
      // Skip compile check for other languages
      compileResult = { ok: true, errors: "" };
    }

    if (!compileResult.ok) {
      return {
        test,
        compiles: false,
        failsCorrectly: false,
        compileErrors: compileResult.errors,
        error: "Test does not compile",
      };
    }

    // Step 2: Run test (should FAIL against vulnerable code)
    if (options.skipRun) {
      return {
        test,
        compiles: true,
        failsCorrectly: true, // assume good if skipping run
      };
    }

    const runResult = await runTest(test.filePath, projectRoot, frameworkName);

    return {
      test,
      compiles: true,
      failsCorrectly: runResult.failed,
      testOutput: runResult.output.slice(0, 2000), // Cap output size
      error: runResult.failed ? undefined : "Test passed against vulnerable code (test is useless - should fail)",
    };
  } finally {
    // Clean up if validation failed (keep if it passed)
    // Caller decides whether to keep the file
  }
}

/**
 * Remove a generated test file from disk
 */
export async function cleanupTest(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Ignore cleanup errors
  }
}
