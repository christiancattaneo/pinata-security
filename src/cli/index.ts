#!/usr/bin/env node
/**
 * Pinata CLI entry point
 *
 * Commands:
 * - analyze  - Scan codebase for test coverage gaps
 * - generate - Generate tests for identified gaps
 * - search   - Search category taxonomy
 * - list     - List all categories with filters
 * - init     - Initialize Pinata config in project
 * - auth     - Manage API key authentication
 */

import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import {
  RISK_DOMAINS,
  TEST_LEVELS,
  type RiskDomain,
  type TestLevel,
  type Priority,
  type Severity,
} from "../categories/schema/index.js";
import { createCategoryStore } from "../categories/store/index.js";
import { VERSION, createScanner } from "../core/index.js";
import { logger } from "../lib/index.js";
import { createRenderer } from "../templates/index.js";

import {
  formatCategories,
  formatError,
  isValidOutputFormat,
  type OutputFormat,
} from "./formatters.js";
import {
  formatGeneratedTerminal,
  formatGeneratedJson,
  formatWriteSummary,
  suggestTestPath,
  extractVariablesFromGap,
  extractVariablesWithAI,
  writeGeneratedTests,
  type GeneratedTest,
} from "./generate-formatters.js";
import {
  explainGap,
  explainGaps,
  generateFallbackExplanation,
  suggestPatterns,
  createAIService,
} from "../ai/index.js";
import type { AIConfig, GapExplanation } from "../ai/types.js";
import {
  saveScanResults,
  loadScanResults,
} from "./results-cache.js";
import {
  formatScanResult,
  isValidScanOutputFormat,
  type ScanOutputFormat,
} from "./scan-formatters.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to built-in category definitions
 * Tries multiple locations to support both development and production
 */
function getDefinitionsPath(): string {
  // Try multiple possible locations
  const candidates = [
    // When running from dist/cli/index.js
    resolve(__dirname, "../../src/categories/definitions"),
    // When running from project root via npx/npm
    resolve(process.cwd(), "src/categories/definitions"),
    // When bundled in dist (future)
    resolve(__dirname, "../categories/definitions"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback to first candidate (will error with helpful message)
  return candidates[0]!;
}

const program = new Command();

program
  .name("pinata")
  .description("AI-powered test coverage analysis and generation")
  .version(VERSION);

program
  .command("analyze [path]")
  .description("Analyze codebase for test coverage gaps")
  .option("-o, --output <format>", "Output format: terminal, json, markdown, sarif, html, junit-xml", "terminal")
  .option("-d, --domains <domains>", "Filter to specific domains (comma-separated)")
  .option("-s, --severity <level>", "Minimum severity: critical, high, medium, low", "low")
  .option("-c, --confidence <level>", "Minimum confidence: high, medium, low", "high")
  .option("--fail-on <level>", "Exit non-zero if gaps at level: critical, high, medium")
  .option("--exclude <dirs>", "Directories to exclude (comma-separated)")
  .option("--verify", "Use AI to verify each match (reduces false positives)")
  .option("-v, --verbose", "Verbose output")
  .option("-q, --quiet", "Quiet mode (errors only)")
  .action(async (targetPath: string | undefined, options: Record<string, unknown>) => {
    const isQuiet = Boolean(options["quiet"]);
    const isVerbose = Boolean(options["verbose"]);

    if (isQuiet) {
      logger.configure({ level: "error" });
    } else if (isVerbose) {
      logger.configure({ level: "debug" });
    }

    // Resolve target path
    const targetDirectory = resolve(targetPath ?? process.cwd());

    // Validate target exists
    if (!existsSync(targetDirectory)) {
      console.error(formatError(new Error(`Directory not found: ${targetDirectory}`)));
      process.exit(1);
    }

    // Validate output format
    const outputFormat = String(options["output"] ?? "terminal");
    if (!isValidScanOutputFormat(outputFormat)) {
      console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json, markdown, sarif`)));
      process.exit(1);
    }

    // Validate severity
    const validSeverities = ["critical", "high", "medium", "low"];
    const minSeverity = String(options["severity"] ?? "low") as Severity;
    if (!validSeverities.includes(minSeverity)) {
      console.error(formatError(new Error(`Invalid severity: ${minSeverity}. Use: critical, high, medium, low`)));
      process.exit(1);
    }

    // Validate confidence
    const validConfidences = ["high", "medium", "low"];
    const minConfidence = String(options["confidence"] ?? "high");
    if (!validConfidences.includes(minConfidence)) {
      console.error(formatError(new Error(`Invalid confidence: ${minConfidence}. Use: high, medium, low`)));
      process.exit(1);
    }

    // Parse domains filter
    const domainsStr = options["domains"] as string | undefined;
    let domains: RiskDomain[] = [];
    if (domainsStr) {
      const domainList = domainsStr.split(",").map((d) => d.trim());
      for (const domain of domainList) {
        if (!RISK_DOMAINS.includes(domain as RiskDomain)) {
          console.error(formatError(new Error(`Invalid domain: ${domain}. Valid domains: ${RISK_DOMAINS.join(", ")}`)));
          process.exit(1);
        }
      }
      domains = domainList as RiskDomain[];
    }

    // Parse exclude directories
    const excludeStr = options["exclude"] as string | undefined;
    const excludeDirs = excludeStr
      ? excludeStr.split(",").map((d) => d.trim())
      : undefined;

    // Parse fail-on level (Commander converts --fail-on to failOn)
    const failOn = options["failOn"] as string | undefined;
    if (failOn && !["critical", "high", "medium"].includes(failOn)) {
      console.error(formatError(new Error(`Invalid fail-on level: ${failOn}. Use: critical, high, medium`)));
      process.exit(1);
    }

    // Start spinner (only for terminal output and non-quiet mode)
    const showSpinner = outputFormat === "terminal" && !isQuiet;
    const spinner = showSpinner ? ora("Loading categories...").start() : null;

    try {
      // Load categories
      const store = createCategoryStore();
      const definitionsPath = getDefinitionsPath();

      logger.debug(`Loading categories from: ${definitionsPath}`);
      const loadResult = await store.loadFromDirectory(definitionsPath);

      if (!loadResult.success) {
        spinner?.fail("Failed to load categories");
        console.error(formatError(loadResult.error));
        process.exit(1);
      }

      if (spinner) {
        spinner.text = `Loaded ${loadResult.data} categories. Scanning...`;
      }
      logger.debug(`Loaded ${loadResult.data} categories`);

      // Create scanner and run analysis
      const scanner = createScanner(store);

      // Build scan options
      const scanOptions: Parameters<typeof scanner.scanDirectory>[1] = {
        minSeverity,
        minConfidence: minConfidence as "high" | "medium" | "low",
        detectTestFiles: true,
      };
      if (domains.length > 0) {
        scanOptions.domains = domains;
      }
      if (excludeDirs) {
        scanOptions.excludeDirs = excludeDirs;
      }

      const scanResult = await scanner.scanDirectory(targetDirectory, scanOptions);

      if (!scanResult.success) {
        spinner?.fail("Scan failed");
        console.error(formatError(scanResult.error));
        process.exit(1);
      }

      spinner?.stop();

      // AI verification if requested
      const shouldVerify = Boolean(options["verify"]);
      if (shouldVerify && scanResult.data.gaps.length > 0) {
        // Check for API key, prompt if missing
        const { hasApiKey, setConfigValue, getApiKey } = await import("./config.js");
        const { createInterface } = await import("readline");
        
        let provider: "anthropic" | "openai" = "anthropic";
        
        if (!hasApiKey("anthropic") && !hasApiKey("openai")) {
          spinner?.stop();
          console.log(chalk.yellow("\nAI verification requires an API key."));
          console.log(chalk.gray("Get one at: https://console.anthropic.com/settings/keys"));
          console.log(chalk.gray("Or: https://platform.openai.com/api-keys\n"));
          
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          
          const askQuestion = (question: string): Promise<string> => {
            return new Promise((resolve) => {
              rl.question(question, (answer) => resolve(answer.trim()));
            });
          };
          
          const apiKey = await askQuestion(chalk.cyan("Enter your Anthropic or OpenAI API key: "));
          rl.close();
          
          if (!apiKey) {
            console.log(chalk.red("No API key provided. Skipping AI verification."));
          } else {
            // Detect provider from key format
            if (apiKey.startsWith("sk-ant-")) {
              setConfigValue("anthropicApiKey", apiKey);
              provider = "anthropic";
              console.log(chalk.green("Anthropic API key saved to ~/.pinata/config.json\n"));
            } else {
              setConfigValue("openaiApiKey", apiKey);
              provider = "openai";
              console.log(chalk.green("OpenAI API key saved to ~/.pinata/config.json\n"));
            }
          }
        } else if (hasApiKey("openai") && !hasApiKey("anthropic")) {
          provider = "openai";
        }
        
        // Proceed with verification if we have a key
        if (!hasApiKey(provider)) {
          // Skip verification - no key available
        } else {
        const verifySpinner = showSpinner ? ora("Verifying gaps with AI...").start() : null;
        
        try {
          const { AIVerifier } = await import("../core/verifier/index.js");
          const { readFile } = await import("fs/promises");
          
          const apiKey = getApiKey(provider);
          const verifier = new AIVerifier({ provider, ...(apiKey ? { apiKey } : {}) });
          
          const { verified, dismissed, stats } = await verifier.verifyAll(
            scanResult.data.gaps,
            async (path) => readFile(path, "utf-8")
          );
          
          // Update scan result with verified gaps
          scanResult.data.gaps = verified;
          
          // Recalculate score based on verified gaps
          const severityWeights: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1 };
          let deduction = 0;
          for (const gap of verified) {
            deduction += severityWeights[gap.severity] ?? 1;
          }
          const newOverall = Math.max(0, 100 - deduction);
          const newGrade: "A" | "B" | "C" | "D" | "F" = 
            newOverall >= 90 ? "A" :
            newOverall >= 80 ? "B" :
            newOverall >= 70 ? "C" :
            newOverall >= 60 ? "D" : "F";
          
          scanResult.data.score.overall = newOverall;
          scanResult.data.score.grade = newGrade;
          
          verifySpinner?.succeed(
            `AI Verification: ${stats.total} total → ${stats.preFiltered} pre-filtered → ${stats.aiVerified} verified, ${stats.aiDismissed} AI-dismissed`
          );
          
          if (isVerbose && dismissed.length > 0) {
            console.log(chalk.gray("\nDismissed as false positives:"));
            for (const { gap, reason } of dismissed.slice(0, 5)) {
              console.log(chalk.gray(`  - ${gap.categoryName} at ${gap.filePath}:${gap.lineStart}`));
              console.log(chalk.gray(`    Reason: ${reason.slice(0, 100)}...`));
            }
            if (dismissed.length > 5) {
              console.log(chalk.gray(`  ... and ${dismissed.length - 5} more`));
            }
          }
        } catch (error) {
          verifySpinner?.fail("AI verification failed (results unverified)");
          if (isVerbose) {
            console.error(chalk.yellow(`Verification error: ${error instanceof Error ? error.message : String(error)}`));
          }
        }
        } // end else hasApiKey
      }

      // Cache results for generate command (save in current working directory)
      const cacheResult = await saveScanResults(process.cwd(), scanResult.data);
      if (!cacheResult.success) {
        logger.debug(`Failed to cache results: ${cacheResult.error.message}`);
      }

      // Format and output results
      const output = formatScanResult(scanResult.data, outputFormat, targetDirectory);
      console.log(output);

      // Handle warnings
      if (isVerbose && scanResult.data.warnings.length > 0) {
        console.error("\nWarnings:");
        for (const warning of scanResult.data.warnings) {
          console.error(`  - ${warning}`);
        }
      }

      // Handle fail-on exit code
      if (failOn) {
        const severityOrder: Record<string, number> = {
          critical: 3,
          high: 2,
          medium: 1,
        };
        const failLevel = severityOrder[failOn] ?? 0;

        const hasFailingGaps = scanResult.data.gaps.some((gap) => {
          const gapLevel = severityOrder[gap.severity] ?? 0;
          return gapLevel >= failLevel;
        });

        if (hasFailingGaps) {
          const count = scanResult.data.gaps.filter((gap) => {
            const gapLevel = severityOrder[gap.severity] ?? 0;
            return gapLevel >= failLevel;
          }).length;
          logger.debug(`Exiting with code 1 due to ${count} gaps at ${failOn} level or above`);
          process.exit(1);
        }
      }

      process.exit(0);
    } catch (error) {
      spinner?.fail("Analysis failed");
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("generate")
  .description("Generate tests for identified gaps")
  .option("--gaps", "Generate tests for all identified gaps")
  .option("-c, --category <id>", "Generate tests for specific category")
  .option("-d, --domain <domain>", "Generate tests for all categories in domain")
  .option("-s, --severity <level>", "Minimum severity: critical, high, medium, low", "medium")
  .option("--output-dir <dir>", "Directory for generated test files")
  .option("--write", "Write files to disk (default is dry-run)")
  .option("--ai", "Use AI for smarter template variable filling")
  .option("--ai-provider <provider>", "AI provider: anthropic, openai", "anthropic")
  .option("-o, --output <format>", "Output format: terminal, json", "terminal")
  .option("-v, --verbose", "Verbose output")
  .option("-q, --quiet", "Quiet mode (errors only)")
  .action(async (options: Record<string, unknown>) => {
    const isQuiet = Boolean(options["quiet"]);
    const isVerbose = Boolean(options["verbose"]);
    const dryRun = !options["write"];
    const useAI = Boolean(options["ai"]);
    const aiProvider = String(options["aiProvider"] ?? "anthropic") as "anthropic" | "openai";
    const outputFormat = String(options["output"] ?? "terminal");

    if (isQuiet) {
      logger.configure({ level: "error" });
    } else if (isVerbose) {
      logger.configure({ level: "debug" });
    }

    // Validate output format
    if (!["terminal", "json"].includes(outputFormat)) {
      console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json`)));
      process.exit(1);
    }

    // Validate options - at least one filter required
    const hasGaps = Boolean(options["gaps"]);
    const categoryId = options["category"] as string | undefined;
    const domainFilter = options["domain"] as string | undefined;

    if (!hasGaps && !categoryId && !domainFilter) {
      console.error(formatError(new Error(
        "Specify what to generate: --gaps (all gaps), --category <id>, or --domain <domain>"
      )));
      process.exit(1);
    }

    // Validate domain if provided
    if (domainFilter && !RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
      console.error(formatError(new Error(
        `Invalid domain: ${domainFilter}. Valid domains: ${RISK_DOMAINS.join(", ")}`
      )));
      process.exit(1);
    }

    // Validate severity
    const validSeverities = ["critical", "high", "medium", "low"];
    const minSeverity = String(options["severity"] ?? "medium");
    if (!validSeverities.includes(minSeverity)) {
      console.error(formatError(new Error(
        `Invalid severity: ${minSeverity}. Use: critical, high, medium, low`
      )));
      process.exit(1);
    }
    const severityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    // Start spinner
    const showSpinner = outputFormat === "terminal" && !isQuiet;
    const spinner = showSpinner ? ora("Loading cached scan results...").start() : null;

    try {
      // Load cached scan results
      const projectRoot = process.cwd();
      const cacheResult = await loadScanResults(projectRoot);

      if (!cacheResult.success) {
        spinner?.fail("No cached results");
        console.error(formatError(cacheResult.error));
        console.error(chalk.yellow("\nRun `pinata analyze` first to scan for gaps."));
        process.exit(1);
      }

      const cached = cacheResult.data;
      let gaps = cached.gaps;

      if (spinner) {
        spinner.text = `Loaded ${gaps.length} gaps from cache. Filtering...`;
      }

      // Filter gaps
      if (categoryId) {
        gaps = gaps.filter((g) => g.categoryId === categoryId);
      }
      if (domainFilter) {
        gaps = gaps.filter((g) => g.domain === domainFilter);
      }
      gaps = gaps.filter((g) => {
        const gapLevel = severityOrder[g.severity] ?? 0;
        const minLevel = severityOrder[minSeverity] ?? 0;
        return gapLevel >= minLevel;
      });

      if (gaps.length === 0) {
        spinner?.succeed("No gaps match the filters");
        console.log(chalk.yellow("\nNo gaps found matching the specified filters."));
        process.exit(0);
      }

      if (spinner) {
        spinner.text = `Found ${gaps.length} gaps. Loading categories...`;
      }

      // Load categories for template access
      const store = createCategoryStore();
      const definitionsPath = getDefinitionsPath();
      const loadResult = await store.loadFromDirectory(definitionsPath);

      if (!loadResult.success) {
        spinner?.fail("Failed to load categories");
        console.error(formatError(loadResult.error));
        process.exit(1);
      }

      if (spinner) {
        spinner.text = `Generating tests for ${gaps.length} gaps...`;
      }

      // Create template renderer
      const renderer = createRenderer({ strict: false, allowUnresolved: true });

      // Generate tests for each gap
      const generatedTests: GeneratedTest[] = [];
      const errors: string[] = [];

      // Group gaps by category to avoid rendering same template multiple times
      const gapsByCategory = new Map<string, typeof gaps>();
      for (const gap of gaps) {
        const existing = gapsByCategory.get(gap.categoryId) ?? [];
        existing.push(gap);
        gapsByCategory.set(gap.categoryId, existing);
      }

      for (const [catId, categoryGaps] of gapsByCategory) {
        const categoryResult = store.get(catId);
        if (!categoryResult.success) {
          errors.push(`Category not found: ${catId}`);
          continue;
        }
        const category = categoryResult.data;

        // Find best template for each gap (prefer matching language)
        for (const gap of categoryGaps) {
          // Detect gap file language
          const gapExt = gap.filePath.split(".").pop() ?? "";
          const langMap: Record<string, string> = {
            py: "python",
            ts: "typescript",
            tsx: "typescript",
            js: "javascript",
            jsx: "javascript",
            go: "go",
            java: "java",
            rs: "rust",
          };
          const gapLang = langMap[gapExt];

          // Find matching template (prefer same language)
          let template = category.testTemplates.find((t) => t.language === gapLang);
          if (!template) {
            template = category.testTemplates[0]; // Fallback to first template
          }
          if (!template) {
            errors.push(`No templates available for ${catId}`);
            continue;
          }

          // Extract variables from gap (use AI if enabled)
          let variables: Record<string, unknown>;
          if (useAI) {
            variables = await extractVariablesWithAI(gap, template.variables, {
              provider: aiProvider,
            });
          } else {
            variables = extractVariablesFromGap(gap);
          }

          // Render template
          const renderResult = renderer.renderTemplate(template, variables);
          if (!renderResult.success) {
            errors.push(`Failed to render ${catId}: ${renderResult.error.message}`);
            continue;
          }

          // Generate suggested path
          const suggestedPath = suggestTestPath(gap.filePath, template, cached.targetDirectory);

          generatedTests.push({
            gap,
            category,
            template,
            result: renderResult.data,
            suggestedPath,
          });
        }
      }

      spinner?.stop();

      // Format and output results
      if (outputFormat === "json") {
        console.log(formatGeneratedJson(generatedTests));
      } else {
        console.log(formatGeneratedTerminal(generatedTests, cached.targetDirectory));
      }

      // Show errors if verbose
      if (isVerbose && errors.length > 0) {
        console.error(chalk.yellow("\nWarnings:"));
        for (const error of errors) {
          console.error(chalk.gray(`  - ${error}`));
        }
      }

      // Handle write mode
      if (!dryRun) {
        const outputDirOption = options["outputDir"] as string | undefined;
        const writeResult = await writeGeneratedTests(
          generatedTests,
          cached.targetDirectory,
          outputDirOption
        );

        if (!writeResult.success) {
          console.error(formatError(writeResult.error));
          process.exit(1);
        }

        // Show write summary
        console.log(formatWriteSummary(writeResult.data, cached.targetDirectory));

        if (writeResult.data.failed.length > 0) {
          process.exit(1);
        }
      }

      process.exit(0);
    } catch (error) {
      spinner?.fail("Generation failed");
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("explain")
  .description("Get natural language explanations for detected gaps")
  .option("-n, --top <count>", "Explain top N gaps by priority", "5")
  .option("-c, --category <id>", "Explain gaps for specific category")
  .option("-d, --domain <domain>", "Explain gaps for specific domain")
  .option("--ai", "Use AI for detailed explanations (requires API key)")
  .option("--ai-provider <provider>", "AI provider: anthropic, openai", "anthropic")
  .option("-o, --output <format>", "Output format: terminal, json, markdown", "terminal")
  .option("-v, --verbose", "Show more details")
  .option("-q, --quiet", "Quiet mode (errors only)")
  .action(async (options: Record<string, unknown>) => {
    const isQuiet = Boolean(options["quiet"]);
    const isVerbose = Boolean(options["verbose"]);
    const useAI = Boolean(options["ai"]);
    const aiProvider = String(options["aiProvider"] ?? "anthropic") as "anthropic" | "openai";
    const outputFormat = String(options["output"] ?? "terminal");
    const topN = parseInt(String(options["top"] ?? "5"), 10);

    if (isQuiet) {
      logger.configure({ level: "error" });
    } else if (isVerbose) {
      logger.configure({ level: "debug" });
    }

    // Validate output format
    if (!["terminal", "json", "markdown"].includes(outputFormat)) {
      console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json, markdown`)));
      process.exit(1);
    }

    const showSpinner = outputFormat === "terminal" && !isQuiet;
    const spinner = showSpinner ? ora("Loading cached scan results...").start() : null;

    try {
      // Load cached scan results
      const projectRoot = process.cwd();
      const cacheResult = await loadScanResults(projectRoot);

      if (!cacheResult.success) {
        spinner?.fail("No cached results");
        console.error(formatError(cacheResult.error));
        console.error(chalk.yellow("\nRun `pinata analyze` first to scan for gaps."));
        process.exit(1);
      }

      const cached = cacheResult.data;
      let gaps = cached.gaps;

      // Apply filters
      const categoryFilter = options["category"] as string | undefined;
      const domainFilter = options["domain"] as string | undefined;

      if (categoryFilter) {
        gaps = gaps.filter((g) => g.categoryId === categoryFilter);
      }
      if (domainFilter) {
        if (!RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
          spinner?.fail("Invalid domain");
          console.error(formatError(new Error(`Invalid domain: ${domainFilter}. Valid: ${RISK_DOMAINS.join(", ")}`)));
          process.exit(1);
        }
        gaps = gaps.filter((g) => g.domain === domainFilter);
      }

      if (gaps.length === 0) {
        spinner?.succeed("No gaps to explain");
        console.log(chalk.yellow("\nNo gaps found matching the filters."));
        process.exit(0);
      }

      // Sort by priority score and take top N
      gaps = gaps
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, topN);

      if (spinner) {
        spinner.text = `Explaining ${gaps.length} gap(s)...`;
      }

      // Generate explanations
      const explanations: Array<{ gap: typeof gaps[0]; explanation: GapExplanation }> = [];

      if (useAI) {
        // Check if AI is configured
        const ai = createAIService({ provider: aiProvider });
        if (!ai.isConfigured()) {
          spinner?.warn("AI not configured, using fallback explanations");
          console.error(chalk.yellow(`\nSet ${aiProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} for AI explanations.\n`));

          // Use fallback
          for (const gap of gaps) {
            explanations.push({
              gap,
              explanation: generateFallbackExplanation(gap),
            });
          }
        } else {
          // Use AI for explanations
          for (const gap of gaps) {
            const result = await explainGap(gap, undefined, { provider: aiProvider });
            if (result.success && result.data) {
              explanations.push({ gap, explanation: result.data });
            } else {
              explanations.push({
                gap,
                explanation: generateFallbackExplanation(gap),
              });
            }
          }
        }
      } else {
        // Use fallback explanations
        for (const gap of gaps) {
          explanations.push({
            gap,
            explanation: generateFallbackExplanation(gap),
          });
        }
      }

      spinner?.stop();

      // Format and output
      if (outputFormat === "json") {
        console.log(JSON.stringify(explanations.map((e) => ({
          gap: {
            categoryId: e.gap.categoryId,
            categoryName: e.gap.categoryName,
            filePath: e.gap.filePath,
            lineStart: e.gap.lineStart,
            severity: e.gap.severity,
            confidence: e.gap.confidence,
            codeSnippet: e.gap.codeSnippet,
          },
          explanation: e.explanation,
        })), null, 2));
      } else if (outputFormat === "markdown") {
        console.log(`# Gap Explanations\n`);
        console.log(`Generated ${explanations.length} explanation(s).\n`);
        for (const { gap, explanation } of explanations) {
          console.log(`## ${gap.categoryName}\n`);
          console.log(`**File:** \`${gap.filePath}:${gap.lineStart}\`\n`);
          console.log(`**Severity:** ${gap.severity} | **Confidence:** ${gap.confidence}\n`);
          console.log(`### Summary\n${explanation.summary}\n`);
          console.log(`### Explanation\n${explanation.explanation}\n`);
          console.log(`### Risk\n${explanation.risk}\n`);
          console.log(`### How to Fix\n${explanation.remediation}\n`);
          if (explanation.safeExample) {
            console.log(`### Safe Example\n\`\`\`\n${explanation.safeExample}\n\`\`\`\n`);
          }
          console.log("---\n");
        }
      } else {
        // Terminal format
        console.log();
        console.log(chalk.bold.cyan("Gap Explanations"));
        console.log(chalk.gray("─".repeat(60)));

        for (const { gap, explanation } of explanations) {
          console.log();
          console.log(chalk.bold.white(gap.categoryName));
          console.log(chalk.gray(`  ${gap.filePath}:${gap.lineStart}`));

          const severityColor = gap.severity === "critical" ? chalk.red :
            gap.severity === "high" ? chalk.yellow : chalk.blue;
          console.log(`  ${severityColor(gap.severity)} | ${gap.confidence} confidence`);

          console.log();
          console.log(chalk.cyan("  Summary:"));
          console.log(`    ${explanation.summary}`);

          if (isVerbose) {
            console.log();
            console.log(chalk.cyan("  Explanation:"));
            for (const line of explanation.explanation.split("\n")) {
              console.log(`    ${line}`);
            }
          }

          console.log();
          console.log(chalk.red("  Risk:"));
          console.log(`    ${explanation.risk}`);

          console.log();
          console.log(chalk.green("  How to Fix:"));
          for (const line of explanation.remediation.split("\n")) {
            console.log(`    ${line}`);
          }

          if (explanation.safeExample) {
            console.log();
            console.log(chalk.cyan("  Safe Example:"));
            console.log(chalk.gray(`    ${explanation.safeExample}`));
          }

          console.log();
          console.log(chalk.gray("─".repeat(60)));
        }
      }

      process.exit(0);
    } catch (error) {
      spinner?.fail("Explanation failed");
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("suggest-patterns")
  .description("Use AI to suggest new detection patterns based on code samples")
  .requiredOption("-c, --category <id>", "Category to suggest patterns for")
  .requiredOption("-l, --language <lang>", "Language of the code samples")
  .option("-f, --file <path>", "File containing vulnerable code samples (one per line)")
  .option("--code <snippet>", "Vulnerable code snippet (can be specified multiple times)", (v, a: string[]) => [...a, v], [] as string[])
  .option("--ai-provider <provider>", "AI provider: anthropic, openai", "anthropic")
  .option("-o, --output <format>", "Output format: terminal, yaml, json", "terminal")
  .action(async (options: Record<string, unknown>) => {
    const categoryId = String(options["category"]);
    const language = String(options["language"]);
    const aiProvider = String(options["aiProvider"] ?? "anthropic") as "anthropic" | "openai";
    const outputFormat = String(options["output"] ?? "terminal");
    const codeSnippets = options["code"] as string[];
    const filePath = options["file"] as string | undefined;

    // Validate we have some code to analyze
    let vulnerableCode = [...codeSnippets];

    if (filePath) {
      try {
        const { readFile } = await import("fs/promises");
        const content = await readFile(filePath, "utf-8");
        vulnerableCode = [...vulnerableCode, ...content.split("\n---\n").filter(Boolean)];
      } catch (error) {
        console.error(formatError(new Error(`Failed to read file: ${filePath}`)));
        process.exit(1);
      }
    }

    if (vulnerableCode.length === 0) {
      console.error(formatError(new Error("Provide code samples via --code or --file")));
      process.exit(1);
    }

    const spinner = ora("Generating pattern suggestions...").start();

    try {
      const result = await suggestPatterns(
        {
          category: categoryId,
          language,
          vulnerableCode,
          maxSuggestions: 5,
        },
        { provider: aiProvider }
      );

      spinner.stop();

      if (!result.success) {
        console.error(formatError(new Error(result.error ?? "Failed to generate patterns")));
        process.exit(1);
      }

      const { suggestions, rejected } = result.data ?? { suggestions: [], rejected: [] };

      if (outputFormat === "json") {
        console.log(JSON.stringify({ suggestions, rejected }, null, 2));
      } else if (outputFormat === "yaml") {
        console.log(`# Suggested patterns for ${categoryId}\n`);
        console.log(`detectionPatterns:`);
        for (const suggestion of suggestions) {
          const escapedPattern = suggestion.pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          console.log(`  - id: ${suggestion.id}`);
          console.log(`    type: regex`);
          console.log(`    language: ${language}`);
          console.log(`    pattern: "${escapedPattern}"`);
          console.log(`    confidence: ${suggestion.confidence}`);
          console.log(`    description: ${suggestion.description}`);
          console.log();
        }
      } else {
        console.log();
        console.log(chalk.bold.cyan("Pattern Suggestions"));
        console.log(chalk.gray("─".repeat(60)));

        if (suggestions.length === 0) {
          console.log(chalk.yellow("\nNo valid patterns could be generated."));
        } else {
          for (const suggestion of suggestions) {
            console.log();
            console.log(chalk.bold.white(suggestion.id));
            console.log(chalk.gray(`  ${suggestion.description}`));
            console.log();
            console.log(chalk.cyan("  Pattern:"));
            console.log(`    ${suggestion.pattern}`);
            console.log();
            console.log(chalk.cyan("  Confidence:") + ` ${suggestion.confidence}`);
            console.log();
            console.log(chalk.green("  Would match:"));
            console.log(chalk.gray(`    ${suggestion.matchExample}`));
            console.log();
            console.log(chalk.red("  Should NOT match:"));
            console.log(chalk.gray(`    ${suggestion.safeExample}`));
            console.log();
            console.log(chalk.cyan("  Reasoning:"));
            console.log(`    ${suggestion.reasoning}`);
            console.log();
            console.log(chalk.gray("─".repeat(60)));
          }
        }

        if (rejected.length > 0) {
          console.log();
          console.log(chalk.yellow.bold(`Rejected ${rejected.length} pattern(s):`));
          for (const r of rejected) {
            console.log(chalk.gray(`  - ${r.pattern.slice(0, 40)}... : ${r.reason}`));
          }
        }
      }

      process.exit(0);
    } catch (error) {
      spinner.fail("Pattern generation failed");
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("dashboard")
  .description("Interactive TUI dashboard for viewing scan results")
  .action(async () => {
    try {
      // Dynamic import to avoid loading ink unless needed
      const { runDashboard } = await import("./tui/index.js");
      await runDashboard();
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("search <query>")
  .description("Search category taxonomy by name, description, or pattern")
  .option("-d, --domain <domain>", "Filter by risk domain")
  .option("-l, --level <level>", "Filter by test level")
  .option("--language <lang>", "Filter by language")
  .option("-o, --output <format>", "Output format: terminal, json, markdown", "terminal")
  .option("-v, --verbose", "Show more details in results")
  .action(async (query: string, options: Record<string, unknown>) => {
    try {
      const definitionsPath = getDefinitionsPath();
      const store = createCategoryStore();
      const loadResult = await store.loadFromDirectory(definitionsPath);

      if (!loadResult.success) {
        console.error(formatError(loadResult.error));
        process.exit(1);
      }

      // Validate output format
      const outputFormat = String(options["output"] ?? "terminal");
      if (!isValidOutputFormat(outputFormat)) {
        console.error(formatError(new Error(`Invalid output format: ${outputFormat}`)));
        process.exit(1);
      }

      // Get all categories and filter
      const allCategories = store.toArray();
      const queryLower = query.toLowerCase();

      let results = allCategories.filter((cat) => {
        // Search in id, name, description
        const matchesText =
          cat.id.toLowerCase().includes(queryLower) ||
          cat.name.toLowerCase().includes(queryLower) ||
          cat.description.toLowerCase().includes(queryLower);

        // Search in pattern descriptions
        const matchesPattern = cat.detectionPatterns.some(
          (p) => p.description.toLowerCase().includes(queryLower) || p.pattern.includes(query)
        );

        return matchesText || matchesPattern;
      });

      // Apply domain filter
      const domainFilter = options["domain"] as string | undefined;
      if (domainFilter) {
        if (!RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
          console.error(formatError(new Error(`Invalid domain: ${domainFilter}`)));
          process.exit(1);
        }
        results = results.filter((cat) => cat.domain === domainFilter);
      }

      // Apply level filter
      const levelFilter = options["level"] as string | undefined;
      if (levelFilter) {
        if (!TEST_LEVELS.includes(levelFilter as TestLevel)) {
          console.error(formatError(new Error(`Invalid level: ${levelFilter}`)));
          process.exit(1);
        }
        results = results.filter((cat) => cat.level === levelFilter);
      }

      // Apply language filter
      const langFilter = options["language"] as string | undefined;
      if (langFilter) {
        results = results.filter((cat) =>
          cat.applicableLanguages.includes(langFilter as never)
        );
      }

      // Format output
      if (outputFormat === "json") {
        console.log(JSON.stringify(results, null, 2));
      } else if (outputFormat === "markdown") {
        console.log(`# Search Results for "${query}"\n`);
        console.log(`Found ${results.length} matching categories.\n`);
        for (const cat of results) {
          console.log(`## ${cat.name}\n`);
          console.log(`- **ID**: ${cat.id}`);
          console.log(`- **Domain**: ${cat.domain}`);
          console.log(`- **Level**: ${cat.level}`);
          console.log(`- **Priority**: ${cat.priority}`);
          console.log(`\n${cat.description}\n`);
        }
      } else {
        // terminal format
        console.log();
        console.log(chalk.bold(`Search Results for "${query}"`));
        console.log(chalk.gray(`Found ${results.length} matching categories.`));
        console.log();

        if (results.length === 0) {
          console.log(chalk.yellow("No categories match your search."));
          console.log(chalk.gray("Try a different query or broaden your filters."));
        } else {
          for (const cat of results) {
            const domainColor = cat.domain === "security" ? chalk.red : chalk.blue;
            console.log(`  ${chalk.cyan(cat.id)} - ${chalk.bold(cat.name)}`);
            console.log(`    ${domainColor(cat.domain)} | ${cat.level} | ${cat.priority}`);
            if (options["verbose"]) {
              console.log(`    ${chalk.gray(cat.description.slice(0, 100))}${cat.description.length > 100 ? "..." : ""}`);
            }
            console.log();
          }
        }
      }
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List all categories")
  .option("-d, --domain <domain>", `Filter by risk domain (${RISK_DOMAINS.join(", ")})`)
  .option("-l, --level <level>", `Filter by test level (${TEST_LEVELS.join(", ")})`)
  .option("-p, --priority <priority>", "Filter by priority: P0, P1, P2")
  .option("-o, --output <format>", "Output format: terminal, json, markdown", "terminal")
  .option("-v, --verbose", "Verbose output")
  .option("-q, --quiet", "Quiet mode (minimal output)")
  .action(async (options: Record<string, unknown>) => {
    try {
      // Configure logging
      if (options["quiet"]) {
        logger.configure({ level: "error" });
      } else if (options["verbose"]) {
        logger.configure({ level: "debug" });
      }

      // Validate output format
      const outputFormat = String(options["output"] ?? "terminal");
      if (!isValidOutputFormat(outputFormat)) {
        console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json, markdown`)));
        process.exit(1);
      }

      // Validate domain filter
      const domainFilter = options["domain"] as string | undefined;
      if (domainFilter !== undefined && !RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
        console.error(formatError(new Error(`Invalid domain: ${domainFilter}. Valid domains: ${RISK_DOMAINS.join(", ")}`)));
        process.exit(1);
      }

      // Validate level filter
      const levelFilter = options["level"] as string | undefined;
      if (levelFilter !== undefined && !TEST_LEVELS.includes(levelFilter as TestLevel)) {
        console.error(formatError(new Error(`Invalid level: ${levelFilter}. Valid levels: ${TEST_LEVELS.join(", ")}`)));
        process.exit(1);
      }

      // Validate priority filter
      const priorityFilter = options["priority"] as string | undefined;
      const validPriorities = ["P0", "P1", "P2"];
      if (priorityFilter !== undefined && !validPriorities.includes(priorityFilter)) {
        console.error(formatError(new Error(`Invalid priority: ${priorityFilter}. Use: P0, P1, P2`)));
        process.exit(1);
      }

      // Load categories
      logger.debug("Loading categories...");
      const store = createCategoryStore();
      const definitionsPath = getDefinitionsPath();

      logger.debug(`Loading from: ${definitionsPath}`);
      const loadResult = await store.loadFromDirectory(definitionsPath);

      if (!loadResult.success) {
        console.error(formatError(loadResult.error));
        process.exit(1);
      }

      logger.debug(`Loaded ${loadResult.data} categories`);

      // Apply filters
      const filter: {
        domain?: RiskDomain;
        level?: TestLevel;
        priority?: Priority;
      } = {};

      if (domainFilter) {
        filter.domain = domainFilter as RiskDomain;
      }
      if (levelFilter) {
        filter.level = levelFilter as TestLevel;
      }
      if (priorityFilter) {
        filter.priority = priorityFilter as Priority;
      }

      // Get filtered categories
      const categories = store.list(filter);

      // Format and output
      const output = formatCategories(categories, outputFormat);
      console.log(output);

      // Exit with success
      process.exit(0);
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize Pinata configuration in project")
  .option("-f, --force", "Overwrite existing configuration")
  .option("--no-interactive", "Skip interactive prompts")
  .action(async (options: Record<string, unknown>) => {
    const configPath = resolve(process.cwd(), ".pinata.yml");
    const cacheDir = resolve(process.cwd(), ".pinata");

    // Check if config already exists
    if (existsSync(configPath) && !options["force"]) {
      console.log(chalk.yellow("Configuration file already exists at .pinata.yml"));
      console.log(chalk.gray("Use --force to overwrite."));
      process.exit(0);
    }

    // Generate default configuration
    const defaultConfig = `# Pinata Configuration
# https://github.com/pinata/pinata

# Paths to analyze
include:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "src/**/*.py"
  - "src/**/*.js"

# Paths to exclude from analysis
exclude:
  - "node_modules/**"
  - "dist/**"
  - "build/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/test/**"
  - "**/tests/**"
  - "**/__tests__/**"

# Risk domains to analyze
# Options: security, data, concurrency, input, resource, reliability, performance, platform, business, compliance
domains:
  - security
  - data
  - concurrency
  - input

# Minimum severity to report
# Options: critical, high, medium, low
minSeverity: medium

# Output configuration
output:
  format: terminal  # terminal, json, markdown, sarif, html
  color: true

# Test generation settings
generate:
  outputDir: tests/generated
  framework: auto  # auto, pytest, jest, vitest, mocha

# Fail CI if gaps exceed thresholds
thresholds:
  critical: 0
  high: 5
  medium: 20
`;

    const { writeFile: writeFileAsync, mkdir } = await import("fs/promises");

    try {
      // Write config file
      await writeFileAsync(configPath, defaultConfig, "utf8");
      console.log(chalk.green("Created .pinata.yml"));

      // Create cache directory
      await mkdir(cacheDir, { recursive: true });
      console.log(chalk.green("Created .pinata/ directory"));

      // Add to gitignore if it exists
      const gitignorePath = resolve(process.cwd(), ".gitignore");
      if (existsSync(gitignorePath)) {
        const { readFile, appendFile } = await import("fs/promises");
        const gitignore = await readFile(gitignorePath, "utf8");
        if (!gitignore.includes(".pinata/")) {
          await appendFile(gitignorePath, "\n# Pinata cache\n.pinata/\n");
          console.log(chalk.green("Added .pinata/ to .gitignore"));
        }
      }

      console.log();
      console.log(chalk.bold("Pinata initialized successfully!"));
      console.log();
      console.log("Next steps:");
      console.log(chalk.gray("  1. Review and customize .pinata.yml"));
      console.log(chalk.gray("  2. Run: pinata analyze"));
      console.log(chalk.gray("  3. Generate tests: pinata generate"));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// Audit deps command - validates npm dependencies
program
  .command("audit-deps")
  .description("Audit npm dependencies for supply chain risks")
  .option("-p, --path <path>", "Path to package.json", "package.json")
  .option("--check-registry", "Verify packages exist in npm registry")
  .option("--check-downloads", "Flag packages with low download counts")
  .option("--check-age", "Flag packages less than 30 days old")
  .option("--strict", "Fail on any warning (exit code 1)")
  .action(async (options: Record<string, unknown>) => {
    const packagePath = resolve(process.cwd(), String(options["path"] ?? "package.json"));
    const checkRegistry = Boolean(options["checkRegistry"]);
    const checkDownloads = Boolean(options["checkDownloads"]);
    const checkAge = Boolean(options["checkAge"]);
    const strictMode = Boolean(options["strict"]);
    
    // If no specific checks, do all
    const doAllChecks = !checkRegistry && !checkDownloads && !checkAge;
    
    console.log(chalk.bold("\nPinata Dependency Audit\n"));
    
    // Read package.json
    if (!existsSync(packagePath)) {
      console.error(chalk.red(`Error: ${packagePath} not found`));
      process.exit(1);
    }
    
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    
    const packages = Object.keys(allDeps);
    console.log(chalk.gray(`Found ${packages.length} dependencies\n`));
    
    const issues: Array<{ pkg: string; severity: "critical" | "warning"; message: string }> = [];
    
    // Known malware packages (Shai-Hulud, BigSquatRat, etc.)
    const KNOWN_MALWARE = new Set([
      "ngx-bootstrap", "ng2-file-upload", "@ctrl/tinycolor",
      "@acitons/artifact", "huggingface-cli", "react-dom-utils-helper",
      "l0dash", "lodahs", "1odash", "lodassh",
      "expres", "expresss", "3xpress",
      "reqeusts", "requets", "requ3sts",
    ]);
    
    // Check for known malware
    for (const pkg of packages) {
      if (KNOWN_MALWARE.has(pkg)) {
        issues.push({
          pkg,
          severity: "critical",
          message: "Known malicious/compromised package (Shai-Hulud/typosquat)",
        });
      }
    }
    
    // Check for unpinned versions
    for (const [pkg, version] of Object.entries(allDeps)) {
      if (version?.startsWith("^")) {
        issues.push({
          pkg,
          severity: "warning",
          message: `Unpinned version (${version}) - allows minor updates`,
        });
      } else if (version?.startsWith("~")) {
        issues.push({
          pkg,
          severity: "warning",
          message: `Unpinned version (${version}) - allows patch updates`,
        });
      } else if (version === "*" || version === "latest") {
        issues.push({
          pkg,
          severity: "critical",
          message: `Extremely dangerous version (${version}) - allows any version`,
        });
      }
    }
    
    // Check npm registry (optional, makes network requests)
    if (checkRegistry || doAllChecks) {
      const spinner = ora("Checking npm registry...").start();
      
      for (const pkg of packages.slice(0, 50)) { // Limit to 50 to avoid rate limiting
        try {
          const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
          
          if (response.status === 404) {
            issues.push({
              pkg,
              severity: "critical",
              message: "Package NOT FOUND in npm registry (slopsquatting risk)",
            });
          } else if (response.ok) {
            const data = await response.json() as {
              time?: { created?: string };
              "dist-tags"?: { latest?: string };
            };
            
            // Check age
            if ((checkAge || doAllChecks) && data.time?.created) {
              const created = new Date(data.time.created);
              const ageInDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
              
              if (ageInDays < 30) {
                issues.push({
                  pkg,
                  severity: "warning",
                  message: `Very new package (${Math.floor(ageInDays)} days old)`,
                });
              }
            }
          }
        } catch {
          // Network error, skip
        }
      }
      
      spinner.succeed("Registry check complete");
    }
    
    // Print results
    const criticals = issues.filter(i => i.severity === "critical");
    const warnings = issues.filter(i => i.severity === "warning");
    
    if (criticals.length > 0) {
      console.log(chalk.red.bold(`\nCritical Issues (${criticals.length}):`));
      for (const issue of criticals) {
        console.log(chalk.red(`  ✗ ${issue.pkg}: ${issue.message}`));
      }
    }
    
    if (warnings.length > 0) {
      console.log(chalk.yellow.bold(`\nWarnings (${warnings.length}):`));
      for (const issue of warnings.slice(0, 20)) {
        console.log(chalk.yellow(`  ⚠ ${issue.pkg}: ${issue.message}`));
      }
      if (warnings.length > 20) {
        console.log(chalk.gray(`  ... and ${warnings.length - 20} more`));
      }
    }
    
    if (issues.length === 0) {
      console.log(chalk.green("✓ No dependency issues found"));
    }
    
    console.log();
    
    // Exit code
    if (criticals.length > 0 || (strictMode && warnings.length > 0)) {
      process.exit(1);
    }
  });

// Auth command group
// Config command for AI provider keys
const config = program.command("config").description("Manage AI provider configuration");

config
  .command("set <key> <value>")
  .description("Set a configuration value")
  .addHelpText("after", `
Available keys:
  anthropic-api-key   Anthropic API key for Claude models
  openai-api-key      OpenAI API key for GPT models  
  default-provider    Default AI provider (anthropic or openai)

Examples:
  pinata config set anthropic-api-key sk-ant-xxx
  pinata config set default-provider openai
`)
  .action(async (key: string, value: string) => {
    const { setConfigValue, validateApiKey, maskApiKey, getConfigPath } = await import("./config.js");
    
    switch (key) {
      case "anthropic-api-key": {
        const validation = validateApiKey("anthropic", value);
        if (!validation.valid) {
          console.log(chalk.red(`Invalid API key: ${validation.error}`));
          process.exit(1);
        }
        setConfigValue("anthropicApiKey", value);
        console.log(chalk.green(`Anthropic API key set: ${maskApiKey(value)}`));
        break;
      }
      case "openai-api-key": {
        const validation = validateApiKey("openai", value);
        if (!validation.valid) {
          console.log(chalk.red(`Invalid API key: ${validation.error}`));
          process.exit(1);
        }
        setConfigValue("openaiApiKey", value);
        console.log(chalk.green(`OpenAI API key set: ${maskApiKey(value)}`));
        break;
      }
      case "default-provider": {
        if (value !== "anthropic" && value !== "openai") {
          console.log(chalk.red("Provider must be 'anthropic' or 'openai'"));
          process.exit(1);
        }
        setConfigValue("defaultProvider", value);
        console.log(chalk.green(`Default provider set to: ${value}`));
        break;
      }
      default:
        console.log(chalk.red(`Unknown config key: ${key}`));
        console.log(chalk.gray("Run 'pinata config set --help' for available keys"));
        process.exit(1);
    }
    console.log(chalk.gray(`Config stored at: ${getConfigPath()}`));
  });

config
  .command("get <key>")
  .description("Get a configuration value")
  .action(async (key: string) => {
    const { loadConfig, maskApiKey } = await import("./config.js");
    const cfg = loadConfig();
    
    switch (key) {
      case "anthropic-api-key":
        console.log(cfg.anthropicApiKey ? maskApiKey(cfg.anthropicApiKey) : chalk.gray("(not set)"));
        break;
      case "openai-api-key":
        console.log(cfg.openaiApiKey ? maskApiKey(cfg.openaiApiKey) : chalk.gray("(not set)"));
        break;
      case "default-provider":
        console.log(cfg.defaultProvider ?? chalk.gray("anthropic (default)"));
        break;
      default:
        console.log(chalk.red(`Unknown config key: ${key}`));
        process.exit(1);
    }
  });

config
  .command("list")
  .description("List all configuration values")
  .action(async () => {
    const { loadConfig, maskApiKey, getConfigPath, hasApiKey } = await import("./config.js");
    const cfg = loadConfig();
    
    console.log(chalk.bold("Pinata Configuration"));
    console.log(chalk.gray(`Config file: ${getConfigPath()}`));
    console.log();
    
    console.log("AI Providers:");
    const anthropicStatus = hasApiKey("anthropic") ? chalk.green("configured") : chalk.gray("not set");
    const openaiStatus = hasApiKey("openai") ? chalk.green("configured") : chalk.gray("not set");
    console.log(`  Anthropic API key:  ${anthropicStatus} ${cfg.anthropicApiKey ? chalk.gray(`(${maskApiKey(cfg.anthropicApiKey)})`) : ""}`);
    console.log(`  OpenAI API key:     ${openaiStatus} ${cfg.openaiApiKey ? chalk.gray(`(${maskApiKey(cfg.openaiApiKey)})`) : ""}`);
    console.log(`  Default provider:   ${cfg.defaultProvider ?? "anthropic"}`);
    console.log();
    
    if (!hasApiKey("anthropic") && !hasApiKey("openai")) {
      console.log(chalk.yellow("No AI provider configured."));
      console.log(chalk.gray("To use AI features (explain, suggest-patterns, --ai flag):"));
      console.log(chalk.gray("  pinata config set anthropic-api-key sk-ant-xxx"));
      console.log(chalk.gray("  # or"));
      console.log(chalk.gray("  export ANTHROPIC_API_KEY=sk-ant-xxx"));
    }
  });

config
  .command("unset <key>")
  .description("Remove a configuration value")
  .action(async (key: string) => {
    const { deleteConfigValue } = await import("./config.js");
    
    switch (key) {
      case "anthropic-api-key":
        deleteConfigValue("anthropicApiKey");
        console.log(chalk.green("Anthropic API key removed"));
        break;
      case "openai-api-key":
        deleteConfigValue("openaiApiKey");
        console.log(chalk.green("OpenAI API key removed"));
        break;
      case "default-provider":
        deleteConfigValue("defaultProvider");
        console.log(chalk.green("Default provider reset to: anthropic"));
        break;
      default:
        console.log(chalk.red(`Unknown config key: ${key}`));
        process.exit(1);
    }
  });

const auth = program.command("auth").description("Manage API key authentication");

auth
  .command("login")
  .description("Set API key for Pinata Cloud")
  .option("-k, --key <key>", "API key (or set PINATA_API_KEY env var)")
  .action(async (options: Record<string, unknown>) => {
    const apiKey = options["key"] as string | undefined ?? process.env["PINATA_API_KEY"];

    if (!apiKey) {
      console.log(chalk.yellow("No API key provided."));
      console.log();
      console.log("Provide an API key using one of:");
      console.log(chalk.gray("  pinata auth login --key <your-api-key>"));
      console.log(chalk.gray("  PINATA_API_KEY=<your-api-key> pinata auth login"));
      console.log();
      console.log("Get your API key at: https://app.pinata.dev/settings/api");
      process.exit(1);
    }

    // Validate key format (basic validation)
    if (apiKey.length < 20 || !apiKey.startsWith("pk_")) {
      console.log(chalk.red("Invalid API key format."));
      console.log(chalk.gray("Keys should start with 'pk_' and be at least 20 characters."));
      process.exit(1);
    }

    // Store in local config
    const configDir = resolve(process.cwd(), ".pinata");
    const authPath = resolve(configDir, "auth.json");

    const { mkdir, writeFile: writeFileAsync } = await import("fs/promises");

    try {
      await mkdir(configDir, { recursive: true });

      // Store masked key (only store last 8 chars for identification)
      const maskedKey = `****${apiKey.slice(-8)}`;
      const authData = {
        configured: true,
        keyId: maskedKey,
        configuredAt: new Date().toISOString(),
      };

      await writeFileAsync(authPath, JSON.stringify(authData, null, 2), "utf8");

      // Also store full key in a more secure location (env file)
      const envPath = resolve(configDir, ".env");
      await writeFileAsync(envPath, `PINATA_API_KEY=${apiKey}\n`, { mode: 0o600 });

      console.log(chalk.green("API key configured successfully!"));
      console.log(chalk.gray(`Key ID: ${maskedKey}`));
      console.log();
      console.log(chalk.yellow("Important: Add .pinata/.env to your .gitignore"));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

auth
  .command("logout")
  .description("Remove stored API key")
  .action(async () => {
    const configDir = resolve(process.cwd(), ".pinata");
    const authPath = resolve(configDir, "auth.json");
    const envPath = resolve(configDir, ".env");

    const { rm } = await import("fs/promises");

    try {
      let removed = false;

      if (existsSync(authPath)) {
        await rm(authPath);
        removed = true;
      }

      if (existsSync(envPath)) {
        await rm(envPath);
        removed = true;
      }

      if (removed) {
        console.log(chalk.green("API key removed successfully."));
      } else {
        console.log(chalk.yellow("No stored API key found."));
      }
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

auth
  .command("status")
  .description("Check authentication status")
  .action(async () => {
    const authPath = resolve(process.cwd(), ".pinata", "auth.json");

    if (!existsSync(authPath)) {
      console.log(chalk.yellow("Not authenticated."));
      console.log(chalk.gray("Run: pinata auth login --key <your-api-key>"));
      process.exit(0);
    }

    try {
      const { readFile } = await import("fs/promises");
      const authData = JSON.parse(await readFile(authPath, "utf8")) as {
        keyId?: string;
        configuredAt?: string;
      };

      console.log(chalk.green("Authenticated"));
      console.log(chalk.gray(`Key ID: ${authData.keyId ?? "unknown"}`));
      console.log(chalk.gray(`Configured: ${authData.configuredAt ?? "unknown"}`));
    } catch (error) {
      console.log(chalk.yellow("Authentication status unknown."));
      console.log(chalk.gray("Run: pinata auth login to reconfigure."));
    }
  });

program.parse();
