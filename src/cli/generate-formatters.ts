/**
 * Formatters for generate command output
 */

import chalk from "chalk";
import { basename, dirname, relative } from "path";
import type { Gap } from "../core/scanner/types.js";
import type { RenderResult } from "../templates/index.js";
import type { TestTemplate, Category } from "../categories/schema/index.js";

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
