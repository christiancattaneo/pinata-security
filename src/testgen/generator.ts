/**
 * AI-powered test generator
 *
 * Takes a TestContext (vulnerability + surrounding code + framework info)
 * and generates a complete, runnable test file using AI.
 * No templates. No placeholders. Real code.
 */

import type { TestContext } from "./context.js";

// =============================================================================
// TYPES
// =============================================================================

export interface GeneratedTest {
  /** Path where the test should be written */
  filePath: string;
  /** Complete test file content (runnable) */
  content: string;
  /** The vulnerability category this test targets */
  categoryId: string;
  /** Brief description of what the test does */
  description: string;
  /** Whether this is a property-based test */
  isPropertyBased: boolean;
}

export interface GenerationResult {
  tests: GeneratedTest[];
  errors: string[];
}

// =============================================================================
// PROMPTS
// =============================================================================

function buildGenerationPrompt(ctx: TestContext): string {
  const parts: string[] = [];

  parts.push(`Generate a complete, runnable ${ctx.testFramework.name} test file for this security vulnerability.`);
  parts.push("");

  parts.push("## Vulnerability");
  parts.push(`Type: ${ctx.gap.categoryId}`);
  parts.push(`Severity: ${ctx.gap.severity}`);
  parts.push(`File: ${ctx.gap.filePath}:${ctx.gap.lineStart}`);
  parts.push(`Pattern: ${ctx.gap.patternId}`);
  parts.push("");

  parts.push("## Vulnerable Code");
  parts.push("```");
  parts.push(ctx.functionBody);
  parts.push("```");
  parts.push("");

  if (ctx.functionName) {
    parts.push(`Function name: ${ctx.functionName}`);
  }

  parts.push("## File Imports");
  parts.push("```");
  parts.push(ctx.imports.join("\n"));
  parts.push("```");
  parts.push("");

  parts.push("## Context");
  parts.push(`Language: ${ctx.language}`);
  parts.push(`Test framework: ${ctx.testFramework.name}`);
  if (ctx.webFramework) parts.push(`Web framework: ${ctx.webFramework}`);
  if (ctx.dbType) parts.push(`Database: ${ctx.dbType}`);
  parts.push("");

  if (ctx.existingTestSample) {
    parts.push("## Existing Test Style (match this style)");
    parts.push("```");
    parts.push(ctx.existingTestSample.slice(0, 1500));
    parts.push("```");
    parts.push("");
  }

  parts.push("## Requirements");
  parts.push("1. Output ONLY the complete test file. No explanations, no markdown fences.");
  parts.push("2. Use real imports that resolve in this project.");
  parts.push("3. The test MUST FAIL when run against the current vulnerable code.");
  parts.push("4. Include at least 5 attack payloads specific to this vulnerability type.");
  parts.push("5. Include at least one boundary/edge case (empty string, null, very long input, unicode).");
  parts.push("6. If testing an HTTP endpoint, use supertest or direct function calls.");
  parts.push("7. Test the specific vulnerable code path, not a generic function.");
  parts.push("8. Each test should have a clear assertion that proves the vulnerability exists or is mitigated.");

  return parts.join("\n");
}

function buildPropertyPrompt(ctx: TestContext): string {
  const parts: string[] = [];

  parts.push(`Generate a property-based test using fast-check (TypeScript) or hypothesis (Python) for this security vulnerability.`);
  parts.push("");
  parts.push("## Vulnerability");
  parts.push(`Type: ${ctx.gap.categoryId}`);
  parts.push(`File: ${ctx.gap.filePath}:${ctx.gap.lineStart}`);
  parts.push("");
  parts.push("## Vulnerable Code");
  parts.push("```");
  parts.push(ctx.functionBody);
  parts.push("```");
  parts.push("");
  parts.push("## Requirements");
  parts.push("1. Output ONLY the complete test file. No explanations.");
  parts.push("2. Express a security INVARIANT as a property.");
  parts.push("3. The property should hold for ALL inputs, not just specific payloads.");
  parts.push("4. Use fast-check for TypeScript/JavaScript or hypothesis for Python.");
  parts.push("5. Example invariant: 'for all strings s, the output of sanitize(s) never contains <script>'");
  parts.push(`6. Test framework: ${ctx.testFramework.name}`);

  const invariantHints: Record<string, string> = {
    "sql-injection": "user input should never appear unescaped in the SQL query string",
    "xss": "user input should never appear as raw HTML in the output",
    "command-injection": "user input should never be passed to a shell command unescaped",
    "path-traversal": "resolved file path should always stay within the allowed directory",
    "ssrf": "user-supplied URL should never resolve to a private/internal IP",
    "xxe": "XML parsing should never resolve external entities",
    "deserialization": "deserialized objects should only be of expected types",
    "hardcoded-secrets": "no string matching secret patterns should exist in source",
  };

  const hint = invariantHints[ctx.gap.categoryId];
  if (hint) {
    parts.push(`7. Invariant hint: "${hint}"`);
  }

  return parts.join("\n");
}

// =============================================================================
// AI GENERATION
// =============================================================================

/**
 * Generate a test file from a test context using AI.
 * Returns the raw test file content.
 */
export async function generateTest(
  ctx: TestContext,
  callAI: (prompt: string, systemPrompt: string) => Promise<string>
): Promise<GeneratedTest> {
  const systemPrompt = [
    "You are a senior security engineer writing adversarial tests.",
    "You write tests that BREAK code, not tests that pass.",
    "Your tests must be complete, runnable files with real imports.",
    "Output ONLY code. No markdown fences. No explanations.",
    "The test must FAIL against vulnerable code and PASS after a fix.",
  ].join(" ");

  const prompt = buildGenerationPrompt(ctx);
  const content = await callAI(prompt, systemPrompt);

  // Strip markdown fences if AI included them despite instructions
  const cleaned = stripMarkdownFences(content);

  return {
    filePath: ctx.suggestedTestPath,
    content: cleaned,
    categoryId: ctx.gap.categoryId,
    description: `Security test for ${ctx.gap.categoryId} in ${ctx.functionName ?? "unknown function"} at ${ctx.gap.filePath}:${ctx.gap.lineStart}`,
    isPropertyBased: false,
  };
}

/**
 * Generate a property-based test from a test context.
 */
export async function generatePropertyTest(
  ctx: TestContext,
  callAI: (prompt: string, systemPrompt: string) => Promise<string>
): Promise<GeneratedTest> {
  const systemPrompt = [
    "You are a formal verification expert writing property-based tests.",
    "Express security invariants that must hold for ALL inputs.",
    "Use fast-check for TypeScript/JavaScript or hypothesis for Python.",
    "Output ONLY code. No markdown fences. No explanations.",
  ].join(" ");

  const prompt = buildPropertyPrompt(ctx);
  const content = await callAI(prompt, systemPrompt);
  const cleaned = stripMarkdownFences(content);

  const ext = ctx.language === "python" ? ".py" : ".ts";
  const propPath = ctx.suggestedTestPath.replace(/\.test\.(ts|js|py)$/, `.prop${ext}`);

  return {
    filePath: propPath,
    content: cleaned,
    categoryId: ctx.gap.categoryId,
    description: `Property-based security invariant for ${ctx.gap.categoryId}`,
    isPropertyBased: true,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function stripMarkdownFences(content: string): string {
  let result = content.trim();

  // Remove opening fence (```typescript, ```python, etc.)
  if (result.startsWith("```")) {
    const firstNewline = result.indexOf("\n");
    if (firstNewline !== -1) {
      result = result.slice(firstNewline + 1);
    }
  }

  // Remove closing fence
  if (result.endsWith("```")) {
    result = result.slice(0, -3).trimEnd();
  }

  return result;
}
