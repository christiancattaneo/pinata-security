/**
 * Analyze command - Scan codebase for test coverage gaps
 */

import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";

import chalk from "chalk";
import ora from "ora";

import type { Command } from "commander";
import type { RiskDomain, Severity } from "../../categories/schema/index.js";

import { RISK_DOMAINS } from "../../categories/schema/index.js";
import { createCategoryStore } from "../../categories/store/index.js";
import { createScanner } from "../../core/index.js";
import { logger } from "../../lib/index.js";
import { formatError } from "../formatters.js";
import { saveScanResults } from "../results-cache.js";
import { formatScanResult, isValidScanOutputFormat } from "../scan-formatters.js";
import { getDefinitionsPath } from "../shared.js";

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze [path]")
    .description("Analyze codebase for test coverage gaps")
    .option("-o, --output <format>", "Output format: terminal, json, markdown, sarif, html, junit-xml", "terminal")
    .option("--output-file <path>", "Write output to file (useful for SARIF upload)")
    .option("-d, --domains <domains>", "Filter to specific domains (comma-separated)")
    .option("-s, --severity <level>", "Minimum severity: critical, high, medium, low", "low")
    .option("-c, --confidence <level>", "Minimum confidence: high, medium, low", "high")
    .option("--fail-on <level>", "Exit non-zero if gaps at level: critical, high, medium")
    .option("--exclude <dirs>", "Directories to exclude (comma-separated)")
    .option("--verify", "Use AI to verify each match (reduces false positives)")
    .option("--execute", "Run dynamic tests in Docker sandbox to confirm vulnerabilities")
    .option("--dry-run", "Preview generated tests without executing (use with --execute)")
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

      const targetDirectory = resolve(targetPath ?? process.cwd());

      if (!existsSync(targetDirectory)) {
        console.error(formatError(new Error(`Directory not found: ${targetDirectory}`)));
        process.exit(1);
      }

      const outputFormat = String(options["output"] ?? "terminal");
      if (!isValidScanOutputFormat(outputFormat)) {
        console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json, markdown, sarif`)));
        process.exit(1);
      }

      const validSeverities = ["critical", "high", "medium", "low"];
      const minSeverity = String(options["severity"] ?? "low") as Severity;
      if (!validSeverities.includes(minSeverity)) {
        console.error(formatError(new Error(`Invalid severity: ${minSeverity}. Use: critical, high, medium, low`)));
        process.exit(1);
      }

      const validConfidences = ["high", "medium", "low"];
      const minConfidence = String(options["confidence"] ?? "high");
      if (!validConfidences.includes(minConfidence)) {
        console.error(formatError(new Error(`Invalid confidence: ${minConfidence}. Use: high, medium, low`)));
        process.exit(1);
      }

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

      const excludeStr = options["exclude"] as string | undefined;
      const excludeDirs = excludeStr
        ? excludeStr.split(",").map((d) => d.trim())
        : undefined;

      const failOn = options["failOn"] as string | undefined;
      if (failOn && !["critical", "high", "medium"].includes(failOn)) {
        console.error(formatError(new Error(`Invalid fail-on level: ${failOn}. Use: critical, high, medium`)));
        process.exit(1);
      }

      const showSpinner = outputFormat === "terminal" && !isQuiet;
      const spinner = showSpinner ? ora("Loading categories...").start() : null;

      try {
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

        const scanner = createScanner(store);
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

        // AI verification
        const shouldVerify = Boolean(options["verify"]);
        if (shouldVerify && scanResult.data.gaps.length > 0) {
          const { hasApiKey, setConfigValue, getApiKey } = await import("../config.js");
          const { createInterface } = await import("readline");

          let provider: "anthropic" | "openai" = "anthropic";

          if (!hasApiKey("anthropic") && !hasApiKey("openai")) {
            spinner?.stop();
            console.log(chalk.yellow("\nAI verification requires an API key."));
            console.log(chalk.gray("Get one at: https://console.anthropic.com/settings/keys"));
            console.log(chalk.gray("Or: https://platform.openai.com/api-keys\n"));

            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const askQuestion = (question: string): Promise<string> =>
              new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));

            const apiKey = await askQuestion(chalk.cyan("Enter your Anthropic or OpenAI API key: "));
            rl.close();

            if (!apiKey) {
              console.log(chalk.red("No API key provided. Skipping AI verification."));
            } else {
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

          if (hasApiKey(provider)) {
            const verifySpinner = showSpinner ? ora("Verifying gaps with AI...").start() : null;

            try {
              const { AIVerifier } = await import("../../core/verifier/index.js");
              const { readFile } = await import("fs/promises");

              const apiKey = getApiKey(provider);
              const verifier = new AIVerifier({ provider, ...(apiKey ? { apiKey } : {}) });

              const { verified, dismissed, stats } = await verifier.verifyAll(
                scanResult.data.gaps,
                async (path) => readFile(path, "utf-8")
              );

              scanResult.data.gaps = verified;

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
          }
        }

        // Dynamic execution (Layer 5)
        const shouldExecute = Boolean(options["execute"]);
        const isDryRun = Boolean(options["dryRun"]);

        if (shouldExecute && scanResult.data.gaps.length > 0) {
          const { createRunner, isTestable } = await import("../../execution/index.js");
          const { readFile } = await import("fs/promises");

          const testableGaps = scanResult.data.gaps.filter((g) => isTestable(g.categoryId));

          if (testableGaps.length === 0) {
            console.log(chalk.yellow("\nNo dynamically testable gaps found."));
          } else {
            const runner = createRunner(undefined, isDryRun);
            const initResult = await runner.initialize();
            if (!initResult.ready) {
              console.log(chalk.red(`\nDynamic execution unavailable: ${initResult.error}`));
            } else {
              const fileContents = new Map<string, string>();
              for (const gap of testableGaps) {
                if (!fileContents.has(gap.filePath)) {
                  try {
                    fileContents.set(gap.filePath, await readFile(gap.filePath, "utf-8"));
                  } catch { /* skip */ }
                }
              }

              const executionSummary = await runner.executeAll(testableGaps, fileContents);

              for (const result of executionSummary.results) {
                const gap = scanResult.data.gaps.find(
                  (g) => g.filePath === result.gap.filePath && g.lineStart === result.gap.lineStart
                );
                if (gap && result.status === "confirmed") {
                  (gap as any).confirmed = true;
                  (gap as any).evidence = result.evidence;
                }
              }

              if (executionSummary.confirmed > 0) {
                console.log(chalk.red.bold(`\n⚠️  ${executionSummary.confirmed} CONFIRMED vulnerabilities found!`));
              }
            }
          }
        }

        // Cache results
        const cacheResult = await saveScanResults(process.cwd(), scanResult.data);
        if (!cacheResult.success) {
          logger.debug(`Failed to cache results: ${cacheResult.error.message}`);
        }

        // Format and output
        const output = formatScanResult(scanResult.data, outputFormat, targetDirectory);
        const outputFile = options["outputFile"] as string | undefined;
        if (outputFile) {
          writeFileSync(resolve(outputFile), output, "utf-8");
          logger.info(`Results written to: ${resolve(outputFile)}`);
        } else {
          console.log(output);
        }

        if (isVerbose && scanResult.data.warnings.length > 0) {
          console.error("\nWarnings:");
          for (const warning of scanResult.data.warnings) {
            console.error(`  - ${warning}`);
          }
        }

        if (failOn) {
          const severityOrder: Record<string, number> = { critical: 3, high: 2, medium: 1 };
          const failLevel = severityOrder[failOn] ?? 0;
          const hasFailingGaps = scanResult.data.gaps.some((gap) => (severityOrder[gap.severity] ?? 0) >= failLevel);
          if (hasFailingGaps) {
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
}
