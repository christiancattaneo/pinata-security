/**
 * Generate command - AI-powered adversarial test generation
 *
 * Generates runnable security test files from vulnerability findings.
 * Uses AI to create complete tests that fail against vulnerable code.
 */

import { writeFile, mkdir } from "fs/promises";
import { dirname, relative } from "path";

import chalk from "chalk";
import ora from "ora";

import type { Command } from "commander";
import type { RiskDomain } from "../../categories/schema/index.js";

import { RISK_DOMAINS } from "../../categories/schema/index.js";
import { logger } from "../../lib/index.js";
import { formatError } from "../formatters.js";
import { loadScanResults } from "../results-cache.js";
import { extractTestContexts } from "../../testgen/context.js";
import { generateTest, generatePropertyTest } from "../../testgen/generator.js";
import type { GeneratedTest } from "../../testgen/generator.js";
import type { Gap } from "../../core/scanner/types.js";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate adversarial security tests for detected vulnerabilities")
    .option("--gaps", "Generate tests for all detected gaps")
    .option("-c, --category <id>", "Generate tests for specific category")
    .option("-d, --domain <domain>", "Generate tests for all categories in domain")
    .option("-s, --severity <level>", "Minimum severity: critical, high, medium, low", "medium")
    .option("--write", "Write test files to disk")
    .option("--property", "Also generate property-based tests (fast-check/hypothesis)")
    .option("--ai-provider <provider>", "AI provider: anthropic, openai", "anthropic")
    .option("-o, --output <format>", "Output format: terminal, json", "terminal")
    .option("-v, --verbose", "Verbose output")
    .option("-q, --quiet", "Quiet mode (errors only)")
    .action(async (options: Record<string, unknown>) => {
      const isQuiet = Boolean(options["quiet"]);
      const isVerbose = Boolean(options["verbose"]);
      const shouldWrite = Boolean(options["write"]);
      const withProperty = Boolean(options["property"]);
      const aiProvider = String(options["aiProvider"] ?? "anthropic") as "anthropic" | "openai";
      const outputFormat = String(options["output"] ?? "terminal");

      if (isQuiet) { logger.configure({ level: "error" }); }
      else if (isVerbose) { logger.configure({ level: "debug" }); }

      if (!["terminal", "json"].includes(outputFormat)) {
        console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json`)));
        process.exit(1);
      }

      const hasGaps = Boolean(options["gaps"]);
      const categoryId = options["category"] as string | undefined;
      const domainFilter = options["domain"] as string | undefined;

      if (!hasGaps && !categoryId && !domainFilter) {
        console.error(formatError(new Error("Specify what to generate: --gaps (all gaps), --category <id>, or --domain <domain>")));
        process.exit(1);
      }

      if (domainFilter && !RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
        console.error(formatError(new Error(`Invalid domain: ${domainFilter}. Valid: ${RISK_DOMAINS.join(", ")}`)));
        process.exit(1);
      }

      const validSeverities = ["critical", "high", "medium", "low"];
      const minSeverity = String(options["severity"] ?? "medium");
      if (!validSeverities.includes(minSeverity)) {
        console.error(formatError(new Error(`Invalid severity: ${minSeverity}`)));
        process.exit(1);
      }
      const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

      const showSpinner = outputFormat === "terminal" && !isQuiet;
      const spinner = showSpinner ? ora("Loading scan results...").start() : null;

      try {
        // Load cached results
        const projectRoot = process.cwd();
        const cacheResult = await loadScanResults(projectRoot);

        if (!cacheResult.success) {
          spinner?.fail("No cached results");
          console.error(formatError(cacheResult.error));
          console.error(chalk.yellow("\nRun `pinata analyze` first."));
          process.exit(1);
        }

        let gaps: Gap[] = cacheResult.data.gaps;

        // Filter
        if (categoryId) { gaps = gaps.filter((g) => g.categoryId === categoryId); }
        if (domainFilter) { gaps = gaps.filter((g) => g.domain === domainFilter); }
        gaps = gaps.filter((g) => (severityOrder[g.severity] ?? 0) >= (severityOrder[minSeverity] ?? 0));

        // Deduplicate by category+file (one test per vulnerable file per category)
        const seen = new Set<string>();
        gaps = gaps.filter((g) => {
          const key = `${g.categoryId}:${g.filePath}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (gaps.length === 0) {
          spinner?.succeed("No gaps match filters");
          console.log(chalk.yellow("\nNo gaps to generate tests for."));
          process.exit(0);
        }

        if (spinner) { spinner.text = `Extracting context for ${gaps.length} findings...`; }

        // Extract context
        const contexts = await extractTestContexts(gaps, projectRoot);

        if (contexts.length === 0) {
          spinner?.fail("Failed to extract context from any finding");
          process.exit(1);
        }

        if (spinner) { spinner.text = `Generating tests for ${contexts.length} findings with AI...`; }

        // Setup AI caller
        const { hasApiKey, getApiKey } = await import("../config.js");
        if (!hasApiKey(aiProvider)) {
          spinner?.fail("No API key configured");
          console.error(chalk.yellow(`\nAI test generation requires an API key.`));
          console.error(chalk.gray(`  pinata config set ${aiProvider === "anthropic" ? "anthropic-api-key" : "openai-api-key"} YOUR_KEY`));
          process.exit(1);
        }

        const apiKey = getApiKey(aiProvider) ?? "";
        const callAI = buildAICaller(aiProvider, apiKey);

        // Generate tests
        const generated: GeneratedTest[] = [];
        const errors: string[] = [];

        for (let i = 0; i < contexts.length; i++) {
          const ctx = contexts[i]!;
          if (spinner) { spinner.text = `Generating test ${i + 1}/${contexts.length}: ${ctx.gap.categoryId} in ${relative(projectRoot, ctx.gap.filePath)}`; }

          try {
            const test = await generateTest(ctx, callAI);
            generated.push(test);

            if (withProperty) {
              try {
                const propTest = await generatePropertyTest(ctx, callAI);
                generated.push(propTest);
              } catch (err) {
                errors.push(`Property test failed for ${ctx.gap.categoryId}: ${err instanceof Error ? err.message : String(err)}`);
              }
            }
          } catch (err) {
            errors.push(`Failed ${ctx.gap.categoryId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        spinner?.stop();

        if (generated.length === 0) {
          console.log(chalk.red("Failed to generate any tests."));
          for (const error of errors) { console.error(chalk.gray(`  ${error}`)); }
          process.exit(1);
        }

        // Output
        if (outputFormat === "json") {
          console.log(JSON.stringify({
            generated: generated.map((t) => ({
              filePath: relative(projectRoot, t.filePath),
              categoryId: t.categoryId,
              description: t.description,
              isPropertyBased: t.isPropertyBased,
              lines: t.content.split("\n").length,
            })),
            errors,
          }, null, 2));
        } else {
          console.log();
          console.log(chalk.bold(`Generated ${generated.length} test file${generated.length === 1 ? "" : "s"}`));
          console.log();
          for (const test of generated) {
            const relPath = relative(projectRoot, test.filePath);
            const badge = test.isPropertyBased ? chalk.magenta(" [property]") : "";
            console.log(`  ${chalk.green("+")} ${relPath}${badge}`);
            console.log(chalk.gray(`    ${test.description}`));
          }
          console.log();
        }

        // Write to disk
        if (shouldWrite) {
          let written = 0;
          for (const test of generated) {
            try {
              await mkdir(dirname(test.filePath), { recursive: true });
              await writeFile(test.filePath, test.content, "utf-8");
              written++;
            } catch (err) {
              errors.push(`Write failed: ${relative(projectRoot, test.filePath)}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          console.log(chalk.green(`Wrote ${written} test file${written === 1 ? "" : "s"}`));
        } else {
          console.log(chalk.gray("Dry run. Use --write to save test files to disk."));
        }

        if (errors.length > 0 && isVerbose) {
          console.error(chalk.yellow("\nWarnings:"));
          for (const error of errors) { console.error(chalk.gray(`  ${error}`)); }
        }

        process.exit(0);
      } catch (error) {
        spinner?.fail("Generation failed");
        console.error(formatError(error instanceof Error ? error : new Error(String(error))));
        process.exit(1);
      }
    });
}

// =============================================================================
// AI Caller factory
// =============================================================================

function buildAICaller(provider: "anthropic" | "openai", apiKey: string): (prompt: string, systemPrompt: string) => Promise<string> {
  return async (prompt: string, systemPrompt: string): Promise<string> => {
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${body}`);
      }

      const data = await response.json() as { content: Array<{ text: string }> };
      return data.content[0]?.text ?? "";
    }

    // OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${body}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "";
  };
}
