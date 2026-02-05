/**
 * Generate command - Generate tests for identified gaps
 */

import chalk from "chalk";
import ora from "ora";

import type { Command } from "commander";
import type { RiskDomain } from "../../categories/schema/index.js";

import { RISK_DOMAINS } from "../../categories/schema/index.js";
import { createCategoryStore } from "../../categories/store/index.js";
import { logger } from "../../lib/index.js";
import { createRenderer } from "../../templates/index.js";
import { formatError } from "../formatters.js";
import {
  formatGeneratedTerminal,
  formatGeneratedJson,
  formatWriteSummary,
  suggestTestPath,
  extractVariablesFromGap,
  extractVariablesWithAI,
  writeGeneratedTests,
  type GeneratedTest,
} from "../generate-formatters.js";
import { loadScanResults } from "../results-cache.js";
import { getDefinitionsPath } from "../shared.js";

export function registerGenerateCommand(program: Command): void {
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
        console.error(formatError(new Error(`Invalid domain: ${domainFilter}. Valid domains: ${RISK_DOMAINS.join(", ")}`)));
        process.exit(1);
      }

      const validSeverities = ["critical", "high", "medium", "low"];
      const minSeverity = String(options["severity"] ?? "medium");
      if (!validSeverities.includes(minSeverity)) {
        console.error(formatError(new Error(`Invalid severity: ${minSeverity}. Use: critical, high, medium, low`)));
        process.exit(1);
      }
      const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

      const showSpinner = outputFormat === "terminal" && !isQuiet;
      const spinner = showSpinner ? ora("Loading cached scan results...").start() : null;

      try {
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

        if (spinner) { spinner.text = `Loaded ${gaps.length} gaps from cache. Filtering...`; }

        if (categoryId) { gaps = gaps.filter((g) => g.categoryId === categoryId); }
        if (domainFilter) { gaps = gaps.filter((g) => g.domain === domainFilter); }
        gaps = gaps.filter((g) => (severityOrder[g.severity] ?? 0) >= (severityOrder[minSeverity] ?? 0));

        if (gaps.length === 0) {
          spinner?.succeed("No gaps match the filters");
          console.log(chalk.yellow("\nNo gaps found matching the specified filters."));
          process.exit(0);
        }

        if (spinner) { spinner.text = `Found ${gaps.length} gaps. Loading categories...`; }

        const store = createCategoryStore();
        const definitionsPath = getDefinitionsPath();
        const loadResult = await store.loadFromDirectory(definitionsPath);

        if (!loadResult.success) {
          spinner?.fail("Failed to load categories");
          console.error(formatError(loadResult.error));
          process.exit(1);
        }

        if (spinner) { spinner.text = `Generating tests for ${gaps.length} gaps...`; }

        const renderer = createRenderer({ strict: false, allowUnresolved: true });
        const generatedTests: GeneratedTest[] = [];
        const errors: string[] = [];

        const gapsByCategory = new Map<string, typeof gaps>();
        for (const gap of gaps) {
          const existing = gapsByCategory.get(gap.categoryId) ?? [];
          existing.push(gap);
          gapsByCategory.set(gap.categoryId, existing);
        }

        for (const [catId, categoryGaps] of gapsByCategory) {
          const categoryResult = store.get(catId);
          if (!categoryResult.success) { errors.push(`Category not found: ${catId}`); continue; }
          const category = categoryResult.data;

          for (const gap of categoryGaps) {
            const gapExt = gap.filePath.split(".").pop() ?? "";
            const langMap: Record<string, string> = { py: "python", ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", go: "go", java: "java", rs: "rust" };
            const gapLang = langMap[gapExt];

            let template = category.testTemplates.find((t) => t.language === gapLang);
            if (!template) { template = category.testTemplates[0]; }
            if (!template) { errors.push(`No templates available for ${catId}`); continue; }

            let variables: Record<string, unknown>;
            if (useAI) {
              variables = await extractVariablesWithAI(gap, template.variables, { provider: aiProvider });
            } else {
              variables = extractVariablesFromGap(gap);
            }

            const renderResult = renderer.renderTemplate(template, variables);
            if (!renderResult.success) { errors.push(`Failed to render ${catId}: ${renderResult.error.message}`); continue; }

            const suggestedPath = suggestTestPath(gap.filePath, template, cached.targetDirectory);
            generatedTests.push({ gap, category, template, result: renderResult.data, suggestedPath });
          }
        }

        spinner?.stop();

        if (outputFormat === "json") {
          console.log(formatGeneratedJson(generatedTests));
        } else {
          console.log(formatGeneratedTerminal(generatedTests, cached.targetDirectory));
        }

        if (isVerbose && errors.length > 0) {
          console.error(chalk.yellow("\nWarnings:"));
          for (const error of errors) { console.error(chalk.gray(`  - ${error}`)); }
        }

        if (!dryRun) {
          const outputDirOption = options["outputDir"] as string | undefined;
          const writeResult = await writeGeneratedTests(generatedTests, cached.targetDirectory, outputDirOption);
          if (!writeResult.success) { console.error(formatError(writeResult.error)); process.exit(1); }
          console.log(formatWriteSummary(writeResult.data, cached.targetDirectory));
          if (writeResult.data.failed.length > 0) { process.exit(1); }
        }

        process.exit(0);
      } catch (error) {
        spinner?.fail("Generation failed");
        console.error(formatError(error instanceof Error ? error : new Error(String(error))));
        process.exit(1);
      }
    });
}
