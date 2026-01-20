/**
 * Formatters for generate command output
 */

import chalk from "chalk";
import { basename, dirname, relative, resolve } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import type { Gap } from "../core/scanner/types.js";
import type { RenderResult } from "../templates/index.js";
import type { TestTemplate, Category } from "../categories/schema/index.js";
import { ok, err } from "../lib/result.js";
import type { Result } from "../lib/result.js";
import { PinataError } from "../lib/errors.js";

/**
 * Generated test with metadata
 */
export interface GeneratedTest {
  /** Gap that this test addresses */
  gap: Gap;
  /** Category the gap belongs to */
  category: Category;
  /** Template used for generation */
  template: TestTemplate;
  /** Rendered test content */
  result: RenderResult;
  /** Suggested file path for the test */
  suggestedPath: string;
}

/**
 * Format generated tests for terminal output (dry run preview)
 */
export function formatGeneratedTerminal(tests: GeneratedTest[], basePath: string): string {
  const lines: string[] = [];

  if (tests.length === 0) {
    lines.push(chalk.yellow("No tests generated."));
    return lines.join("\n");
  }

  lines.push(chalk.bold.cyan(`\nGenerated ${tests.length} test(s):\n`));
  lines.push(chalk.gray("─".repeat(60)));

  for (const test of tests) {
    const relGapPath = relative(basePath, test.gap.filePath);

    // Header
    lines.push("");
    lines.push(chalk.bold.white(`Test for: ${test.gap.categoryName}`));
    lines.push(chalk.gray(`  Gap location: ${relGapPath}:${test.gap.lineStart}`));
    lines.push(chalk.gray(`  Template: ${test.template.id}`));
    lines.push(chalk.gray(`  Output: ${test.suggestedPath}`));
    lines.push("");

    // Code block with syntax highlighting hint
    lines.push(chalk.cyan(`// --- ${test.suggestedPath} ---`));
    lines.push("");

    // Add imports if any
    if (test.result.imports.length > 0) {
      for (const imp of test.result.imports) {
        lines.push(chalk.gray(imp));
      }
      lines.push("");
    }

    // Add the test content
    lines.push(test.result.content);
    lines.push("");
    lines.push(chalk.gray("─".repeat(60)));
  }

  // Summary
  lines.push("");
  lines.push(chalk.bold("Summary:"));
  lines.push(`  Tests generated: ${chalk.green(tests.length.toString())}`);

  const categories = new Set(tests.map((t) => t.category.id));
  lines.push(`  Categories covered: ${chalk.cyan(categories.size.toString())}`);

  if (tests.some((t) => t.result.unresolved.length > 0)) {
    const unresolvedCount = tests.reduce((acc, t) => acc + t.result.unresolved.length, 0);
    lines.push(chalk.yellow(`  Unresolved placeholders: ${unresolvedCount}`));
    lines.push(chalk.gray("  (Some placeholders need manual completion)"));
  }

  lines.push("");
  lines.push(chalk.gray("This is a dry run. Use --write to save files."));

  return lines.join("\n");
}

/**
 * Format generated tests as JSON
 */
export function formatGeneratedJson(tests: GeneratedTest[]): string {
  const output = tests.map((test) => ({
    gap: {
      categoryId: test.gap.categoryId,
      categoryName: test.gap.categoryName,
      filePath: test.gap.filePath,
      lineStart: test.gap.lineStart,
      severity: test.gap.severity,
      confidence: test.gap.confidence,
    },
    template: {
      id: test.template.id,
      framework: test.template.framework,
      language: test.template.language,
    },
    suggestedPath: test.suggestedPath,
    content: test.result.content,
    imports: test.result.imports,
    fixtures: test.result.fixtures,
    substituted: test.result.substituted,
    unresolved: test.result.unresolved,
  }));

  return JSON.stringify(output, null, 2);
}

/**
 * Generate suggested test file path based on source file and template
 */
export function suggestTestPath(
  sourceFile: string,
  template: TestTemplate,
  basePath: string
): string {
  const dir = dirname(sourceFile);
  const name = basename(sourceFile);

  // Remove extension
  const nameWithoutExt = name.replace(/\.[^.]+$/, "");

  // Determine test extension based on template language
  const extMap: Record<string, string> = {
    python: ".py",
    typescript: ".ts",
    javascript: ".js",
    go: "_test.go",
    java: "Test.java",
    rust: ".rs",
  };
  const ext = extMap[template.language] ?? ".test.ts";

  // Determine test naming convention based on language
  let testFileName: string;
  switch (template.language) {
    case "python":
      testFileName = `test_${nameWithoutExt}${ext}`;
      break;
    case "go":
      testFileName = `${nameWithoutExt}${ext}`;
      break;
    case "java":
      testFileName = `${nameWithoutExt}${ext}`;
      break;
    default:
      testFileName = `${nameWithoutExt}.test${ext}`;
  }

  // For now, suggest putting tests next to source files
  // A more sophisticated approach would use project conventions
  const relativeSrc = relative(basePath, dir);
  const testDir = relativeSrc.replace(/^src/, "tests");

  return `${testDir}/${testFileName}`;
}

/**
 * Extract template variables from a gap
 */
export function extractVariablesFromGap(gap: Gap): Record<string, unknown> {
  // Extract useful info from the gap for template substitution
  const fileName = basename(gap.filePath);
  const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, "");

  // Try to extract function/class name from code snippet
  const funcMatch = gap.codeSnippet.match(/(?:def|function|async function|const|let|var)\s+(\w+)/);
  const classMatch = gap.codeSnippet.match(/(?:class)\s+(\w+)/);

  return {
    // File info
    filePath: gap.filePath,
    fileName,
    fileNameWithoutExt,
    lineNumber: gap.lineStart,

    // Category info
    categoryId: gap.categoryId,
    categoryName: gap.categoryName,
    domain: gap.domain,
    level: gap.level,
    severity: gap.severity,
    confidence: gap.confidence,

    // Code context
    codeSnippet: gap.codeSnippet,
    functionName: funcMatch?.[1] ?? "targetFunction",
    className: classMatch?.[1] ?? "TargetClass",

    // Common template variables
    testName: `test_${gap.categoryId.replace(/-/g, "_")}`,
    testDescription: `Test for ${gap.categoryName} in ${fileName}:${gap.lineStart}`,

    // Pattern info
    patternId: gap.patternId,
    patternType: gap.patternType,
  };
}

/**
 * Result of writing a test file
 */
export interface WriteResult {
  /** Path where file was written */
  path: string;
  /** Whether the file was created (vs updated) */
  created: boolean;
  /** Whether content was appended to existing file */
  appended: boolean;
  /** Category ID this test is for */
  categoryId: string;
  /** Gap location */
  gapLocation: string;
}

/**
 * Summary of all written files
 */
export interface WriteSummary {
  /** Files that were created */
  created: WriteResult[];
  /** Files that were updated (appended) */
  updated: WriteResult[];
  /** Files that failed to write */
  failed: Array<{ path: string; error: string }>;
  /** Total tests written */
  totalTests: number;
}

/**
 * Write generated tests to disk
 *
 * @param tests Generated tests to write
 * @param basePath Base path for resolving output paths
 * @param outputDir Optional override for output directory
 * @returns Write summary
 */
export async function writeGeneratedTests(
  tests: GeneratedTest[],
  basePath: string,
  outputDir?: string
): Promise<Result<WriteSummary, PinataError>> {
  const summary: WriteSummary = {
    created: [],
    updated: [],
    failed: [],
    totalTests: 0,
  };

  // Group tests by output file to combine tests for same file
  const testsByFile = new Map<string, GeneratedTest[]>();
  for (const test of tests) {
    // Resolve the actual output path
    let outputPath: string;
    if (outputDir) {
      // Use custom output directory
      outputPath = resolve(basePath, outputDir, test.suggestedPath);
    } else {
      // Use suggested path relative to base
      outputPath = resolve(basePath, test.suggestedPath);
    }

    const existing = testsByFile.get(outputPath) ?? [];
    existing.push(test);
    testsByFile.set(outputPath, existing);
  }

  // Write each file
  for (const [outputPath, fileTests] of testsByFile) {
    try {
      // Ensure directory exists
      const dir = dirname(outputPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      // Check if file already exists
      const fileExists = existsSync(outputPath);
      let existingContent = "";

      if (fileExists) {
        existingContent = await readFile(outputPath, "utf-8");
      }

      // Build content for this file
      const contentParts: string[] = [];

      // Collect all imports from all tests
      const allImports = new Set<string>();
      for (const test of fileTests) {
        for (const imp of test.result.imports) {
          allImports.add(imp);
        }
      }

      // Add imports header if any and file is new
      if (!fileExists && allImports.size > 0) {
        contentParts.push(Array.from(allImports).join("\n"));
        contentParts.push("");
      }

      // Add each test's content
      for (const test of fileTests) {
        // Add a comment header for each test
        contentParts.push(`// Test for ${test.gap.categoryName}`);
        contentParts.push(`// Gap: ${relative(basePath, test.gap.filePath)}:${test.gap.lineStart}`);
        contentParts.push(`// Generated by Pinata`);
        contentParts.push("");
        contentParts.push(test.result.content);
        contentParts.push("");
      }

      const newContent = contentParts.join("\n");

      // Determine how to write
      let finalContent: string;
      let appended = false;

      if (fileExists) {
        // Append to existing file
        finalContent = existingContent.trimEnd() + "\n\n" + newContent;
        appended = true;
      } else {
        // Create new file
        finalContent = newContent;
      }

      // Write the file
      await writeFile(outputPath, finalContent, "utf-8");

      // Record results
      for (const test of fileTests) {
        const result: WriteResult = {
          path: outputPath,
          created: !fileExists,
          appended,
          categoryId: test.gap.categoryId,
          gapLocation: `${relative(basePath, test.gap.filePath)}:${test.gap.lineStart}`,
        };

        if (fileExists) {
          summary.updated.push(result);
        } else {
          summary.created.push(result);
        }
        summary.totalTests++;
      }
    } catch (error) {
      summary.failed.push({
        path: outputPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return ok(summary);
}

/**
 * Format write summary for terminal output
 */
export function formatWriteSummary(summary: WriteSummary, basePath: string): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(chalk.bold.cyan("Write Summary:"));
  lines.push(chalk.gray("─".repeat(60)));

  // Created files
  if (summary.created.length > 0) {
    const uniquePaths = new Set(summary.created.map((r) => r.path));
    lines.push("");
    lines.push(chalk.green.bold(`Created ${uniquePaths.size} file(s):`));
    for (const path of uniquePaths) {
      const relPath = relative(basePath, path);
      const testsInFile = summary.created.filter((r) => r.path === path).length;
      lines.push(chalk.green(`  + ${relPath} (${testsInFile} test(s))`));
    }
  }

  // Updated files
  if (summary.updated.length > 0) {
    const uniquePaths = new Set(summary.updated.map((r) => r.path));
    lines.push("");
    lines.push(chalk.yellow.bold(`Updated ${uniquePaths.size} file(s):`));
    for (const path of uniquePaths) {
      const relPath = relative(basePath, path);
      const testsInFile = summary.updated.filter((r) => r.path === path).length;
      lines.push(chalk.yellow(`  ~ ${relPath} (${testsInFile} test(s) appended)`));
    }
  }

  // Failed files
  if (summary.failed.length > 0) {
    lines.push("");
    lines.push(chalk.red.bold(`Failed to write ${summary.failed.length} file(s):`));
    for (const fail of summary.failed) {
      const relPath = relative(basePath, fail.path);
      lines.push(chalk.red(`  ✗ ${relPath}: ${fail.error}`));
    }
  }

  // Summary
  lines.push("");
  lines.push(chalk.gray("─".repeat(60)));
  lines.push(chalk.bold(`Total: ${summary.totalTests} test(s) written to ${new Set([...summary.created.map((r) => r.path), ...summary.updated.map((r) => r.path)]).size} file(s)`));

  if (summary.failed.length > 0) {
    lines.push(chalk.red(`Failures: ${summary.failed.length}`));
  }

  return lines.join("\n");
}
