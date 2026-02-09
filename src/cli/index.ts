#!/usr/bin/env node
/**
 * Pinata CLI entry point
 *
 * Commands:
 * - analyze  - Scan codebase for security vulnerabilities
 * - generate - Generate tests for identified gaps
 * - explain  - AI explanations for gaps
 * - suggest-patterns - AI pattern suggestions
 * - search   - Search category taxonomy
 * - list     - List all categories with filters
 * - init     - Initialize Pinata config in project
 * - audit-deps - Check npm dependencies
 * - feedback - View pattern performance
 * - config   - Manage AI provider configuration
 * - auth     - Manage API key authentication
 * - dashboard - Interactive TUI
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";

import {
  RISK_DOMAINS,
  TEST_LEVELS,
  type RiskDomain,
  type TestLevel,
  type Priority,
} from "../categories/schema/index.js";
import { createCategoryStore } from "../categories/store/index.js";
import { VERSION } from "../core/index.js";
import { logger } from "../lib/index.js";
import { createRenderer } from "../templates/index.js";

import {
  formatCategories,
  formatError,
  isValidOutputFormat,
} from "./formatters.js";
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
import { getDefinitionsPath } from "./shared.js";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerGenerateCommand } from "./commands/generate.js";

const program = new Command();

program
  .name("pinata")
  .description("AI-powered security vulnerability detection")
  .version(VERSION);

// =============================================================================
// Major commands (extracted to separate files)
// =============================================================================

registerAnalyzeCommand(program);
registerGenerateCommand(program);

// =============================================================================
// Explain command
// =============================================================================

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
    const topN = parseInt(String(options["top"] ?? "5"), 10);
    const categoryFilter = options["category"] as string | undefined;
    const domainFilter = options["domain"] as string | undefined;
    const useAI = Boolean(options["ai"]);
    const aiProvider = String(options["aiProvider"] ?? "anthropic") as "anthropic" | "openai";
    const outputFormat = String(options["output"] ?? "terminal");

    if (isQuiet) { logger.configure({ level: "error" }); }
    else if (isVerbose) { logger.configure({ level: "debug" }); }

    // Validate output format
    if (!["terminal", "json", "markdown"].includes(outputFormat)) {
      console.error(formatError(new Error(`Invalid format: ${outputFormat}. Use: terminal, json, markdown`)));
      process.exit(1);
    }

    // Load cached scan results
    const projectRoot = process.cwd();
    const cacheResult = await loadScanResults(projectRoot);

    if (!cacheResult.success) {
      console.error(formatError(cacheResult.error));
      console.error(chalk.yellow("\nRun `pinata analyze` first to scan for gaps."));
      process.exit(1);
    }

    const cached = cacheResult.data;
    let gaps = cached.gaps;

    // Apply filters
    if (categoryFilter) {
      gaps = gaps.filter((g) => g.categoryId === categoryFilter);
    }
    if (domainFilter) {
      if (!RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
        console.error(formatError(new Error(`Invalid domain: ${domainFilter}`)));
        process.exit(1);
      }
      gaps = gaps.filter((g) => g.domain === domainFilter);
    }

    // Take top N
    gaps = gaps.slice(0, topN);

    if (gaps.length === 0) {
      console.log(chalk.yellow("No gaps to explain."));
      process.exit(0);
    }

    // Generate explanations
    let explanations: GapExplanation[];

    if (useAI) {
      const spinner = ora("Generating AI explanations...").start();
      try {
        const aiConfig: AIConfig = { provider: aiProvider };

        const { hasApiKey, getApiKey } = await import("./config.js");
        if (hasApiKey(aiProvider)) {
          const key = getApiKey(aiProvider);
          if (key) { aiConfig.apiKey = key; }
        }

        const resultMap = await explainGaps(gaps, undefined, aiConfig);
        explanations = gaps.map((g) => {
          const key = `${g.categoryId}:${g.filePath}:${g.lineStart}`;
          const result = resultMap.get(key);
          if (result?.success && result.data) { return result.data; }
          return generateFallbackExplanation(g);
        });
        spinner.succeed(`Generated ${explanations.length} explanations`);
      } catch (error) {
        spinner.fail("AI explanation failed");
        console.error(chalk.yellow(`\nSet ${aiProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} for AI explanations.\n`));
        explanations = gaps.map((g) => generateFallbackExplanation(g));
      }
    } else {
      explanations = gaps.map((g) => generateFallbackExplanation(g));
    }

    // Output with gap context for labeling
    if (outputFormat === "json") {
      const output = gaps.map((g, i) => ({ gap: { categoryId: g.categoryId, severity: g.severity, filePath: g.filePath, lineStart: g.lineStart }, ...explanations[i]! }));
      console.log(JSON.stringify(output, null, 2));
    } else if (outputFormat === "markdown") {
      console.log("# Gap Explanations\n");
      for (let i = 0; i < explanations.length; i++) {
        const exp = explanations[i]!;
        const gap = gaps[i]!;
        console.log(`## ${exp.summary}\n`);
        console.log(`**Severity**: ${gap.severity} | **Category**: ${gap.categoryId}\n`);
        console.log(exp.explanation);
        if (exp.remediation) { console.log(`\n**Remediation**: ${exp.remediation}\n`); }
        console.log("---\n");
      }
    } else {
      console.log();
      for (let i = 0; i < explanations.length; i++) {
        const exp = explanations[i]!;
        const gap = gaps[i]!;
        const severityColor = gap.severity === "critical" ? chalk.red : gap.severity === "high" ? chalk.yellow : chalk.blue;
        console.log(`${severityColor.bold(`[${gap.severity.toUpperCase()}]`)} ${chalk.bold(exp.summary)}`);
        console.log(chalk.gray(`  Category: ${gap.categoryId} | ${gap.filePath}:${gap.lineStart}`));
        console.log();
        for (const line of exp.explanation.split("\n")) { console.log(`  ${line}`); }
        if (exp.remediation) { console.log(); console.log(chalk.green(`  Fix: ${exp.remediation}`)); }
        console.log();
      }
    }
  });

// =============================================================================
// Suggest Patterns command
// =============================================================================

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
    const filePath = options["file"] as string | undefined;
    const codeSnippets = (options["code"] as string[] | undefined) ?? [];

    // Collect code samples
    const samples: string[] = [...codeSnippets];
    if (filePath) {
      const { readFile } = await import("fs/promises");
      try {
        const content = await readFile(resolve(filePath), "utf-8");
        samples.push(...content.split("\n---\n").filter((s) => s.trim()));
      } catch (error) {
        console.error(formatError(new Error(`Failed to read file: ${filePath}`)));
        process.exit(1);
      }
    }

    if (samples.length === 0) {
      console.error(formatError(new Error("Provide code samples via --code or --file")));
      process.exit(1);
    }

    const spinner = ora("Generating pattern suggestions with AI...").start();

    try {
      const aiConfig: AIConfig = { provider: aiProvider };
      const { hasApiKey, getApiKey } = await import("./config.js");
      if (hasApiKey(aiProvider)) {
        const key = getApiKey(aiProvider);
        if (key) { aiConfig.apiKey = key; }
      }

      const result = await suggestPatterns(
        { category: categoryId, vulnerableCode: samples, language },
        aiConfig
      );

      if (!result.success || !result.data) {
        spinner.fail("Pattern suggestion failed");
        console.error(chalk.red(result.error ?? "Unknown error"));
        process.exit(1);
      }

      const suggestions = result.data.suggestions;
      spinner.succeed(`Generated ${suggestions.length} pattern suggestions`);

      if (outputFormat === "json") {
        console.log(JSON.stringify(suggestions, null, 2));
      } else if (outputFormat === "yaml") {
        for (const s of suggestions) {
          console.log("---");
          console.log(`id: ${s.id}`);
          console.log(`pattern: "${s.pattern}"`);
          console.log(`confidence: ${s.confidence}`);
          console.log(`description: "${s.description}"`);
          console.log(`matchExample: "${s.matchExample}"`);
          console.log(`safeExample: "${s.safeExample}"`);
          console.log();
        }
      } else {
        console.log();
        console.log(chalk.bold(`Suggested Patterns for ${categoryId}`));
        console.log();

        for (const s of suggestions) {
          const confColor =
            s.confidence === "high" ? chalk.green :
            s.confidence === "medium" ? chalk.yellow :
            chalk.red;

          console.log(`  ${chalk.cyan(s.id)} [${confColor(s.confidence)}]`);
          console.log(`    Pattern: ${chalk.gray(s.pattern)}`);
          console.log(`    ${s.description}`);
          console.log(`    Match:  ${chalk.gray(s.matchExample.slice(0, 80))}`);
          console.log(`    Safe:   ${chalk.gray(s.safeExample.slice(0, 80))}`);
          console.log();
        }
      }
    } catch (error) {
      spinner.fail("Pattern suggestion failed");
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// =============================================================================
// Dashboard command
// =============================================================================

program
  .command("dashboard")
  .description("Interactive TUI dashboard for viewing scan results")
  .action(async () => {
    try {
      const { runDashboard } = await import("./tui/index.js");
      await runDashboard();
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// =============================================================================
// Search command
// =============================================================================

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

      const outputFormat = String(options["output"] ?? "terminal");
      if (!isValidOutputFormat(outputFormat)) {
        console.error(formatError(new Error(`Invalid output format: ${outputFormat}`)));
        process.exit(1);
      }

      const allCategories = store.toArray();
      const queryLower = query.toLowerCase();

      let results = allCategories.filter((cat) => {
        const matchesText =
          cat.id.toLowerCase().includes(queryLower) ||
          cat.name.toLowerCase().includes(queryLower) ||
          cat.description.toLowerCase().includes(queryLower);
        const matchesPattern = cat.detectionPatterns.some(
          (p) => p.description.toLowerCase().includes(queryLower) || p.pattern.includes(query)
        );
        return matchesText || matchesPattern;
      });

      const domainFilter = options["domain"] as string | undefined;
      if (domainFilter) {
        if (!RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
          console.error(formatError(new Error(`Invalid domain: ${domainFilter}`)));
          process.exit(1);
        }
        results = results.filter((cat) => cat.domain === domainFilter);
      }

      const levelFilter = options["level"] as string | undefined;
      if (levelFilter) {
        if (!TEST_LEVELS.includes(levelFilter as TestLevel)) {
          console.error(formatError(new Error(`Invalid level: ${levelFilter}`)));
          process.exit(1);
        }
        results = results.filter((cat) => cat.level === levelFilter);
      }

      const langFilter = options["language"] as string | undefined;
      if (langFilter) {
        results = results.filter((cat) => cat.applicableLanguages.includes(langFilter as never));
      }

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
        console.log();
        console.log(chalk.bold(`Search Results for "${query}"`));
        console.log(chalk.gray(`Found ${results.length} matching categories.`));
        console.log();
        if (results.length === 0) {
          console.log(chalk.yellow("No categories match your search."));
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

// =============================================================================
// List command
// =============================================================================

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
      if (options["quiet"]) { logger.configure({ level: "error" }); }
      else if (options["verbose"]) { logger.configure({ level: "debug" }); }

      const outputFormat = String(options["output"] ?? "terminal");
      if (!isValidOutputFormat(outputFormat)) {
        console.error(formatError(new Error(`Invalid output format: ${outputFormat}. Use: terminal, json, markdown`)));
        process.exit(1);
      }

      const domainFilter = options["domain"] as string | undefined;
      if (domainFilter !== undefined && !RISK_DOMAINS.includes(domainFilter as RiskDomain)) {
        console.error(formatError(new Error(`Invalid domain: ${domainFilter}. Valid domains: ${RISK_DOMAINS.join(", ")}`)));
        process.exit(1);
      }

      const levelFilter = options["level"] as string | undefined;
      if (levelFilter !== undefined && !TEST_LEVELS.includes(levelFilter as TestLevel)) {
        console.error(formatError(new Error(`Invalid level: ${levelFilter}. Valid levels: ${TEST_LEVELS.join(", ")}`)));
        process.exit(1);
      }

      const priorityFilter = options["priority"] as string | undefined;
      if (priorityFilter !== undefined && !["P0", "P1", "P2"].includes(priorityFilter)) {
        console.error(formatError(new Error(`Invalid priority: ${priorityFilter}. Use: P0, P1, P2`)));
        process.exit(1);
      }

      const store = createCategoryStore();
      const definitionsPath = getDefinitionsPath();
      const loadResult = await store.loadFromDirectory(definitionsPath);

      if (!loadResult.success) {
        console.error(formatError(loadResult.error));
        process.exit(1);
      }

      const filter: { domain?: RiskDomain; level?: TestLevel; priority?: Priority } = {};
      if (domainFilter) { filter.domain = domainFilter as RiskDomain; }
      if (levelFilter) { filter.level = levelFilter as TestLevel; }
      if (priorityFilter) { filter.priority = priorityFilter as Priority; }

      const categories = store.list(filter);
      const output = formatCategories(categories, outputFormat);
      console.log(output);
      process.exit(0);
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// =============================================================================
// Init command
// =============================================================================

program
  .command("init")
  .description("Initialize Pinata configuration in project")
  .option("-f, --force", "Overwrite existing configuration")
  .option("--no-interactive", "Skip interactive prompts")
  .action(async (options: Record<string, unknown>) => {
    const configPath = resolve(process.cwd(), ".pinata.yml");
    const cacheDir = resolve(process.cwd(), ".pinata");

    if (existsSync(configPath) && !options["force"]) {
      console.log(chalk.yellow("Configuration file already exists at .pinata.yml"));
      console.log(chalk.gray("Use --force to overwrite."));
      process.exit(0);
    }

    const defaultConfig = `# Pinata Configuration
# https://github.com/pinata/pinata

include:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "src/**/*.py"
  - "src/**/*.js"

exclude:
  - "node_modules/**"
  - "dist/**"
  - "build/**"
  - "**/*.test.ts"
  - "**/*.spec.ts"

domains:
  - security
  - data
  - concurrency
  - input

minSeverity: medium

output:
  format: terminal
  color: true

generate:
  outputDir: tests/generated
  framework: auto

thresholds:
  critical: 0
  high: 5
  medium: 20
`;

    const { writeFile: writeFileAsync, mkdir } = await import("fs/promises");

    try {
      await writeFileAsync(configPath, defaultConfig, "utf8");
      console.log(chalk.green("Created .pinata.yml"));

      await mkdir(cacheDir, { recursive: true });
      console.log(chalk.green("Created .pinata/ directory"));

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
      console.log(chalk.gray("  1. Review and customize .pinata.yml"));
      console.log(chalk.gray("  2. Run: pinata analyze"));
      console.log(chalk.gray("  3. Generate tests: pinata generate"));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// =============================================================================
// Audit Deps command
// =============================================================================

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
    const doAllChecks = !checkRegistry && !checkDownloads && !checkAge;

    console.log(chalk.bold("\nPinata Dependency Audit\n"));

    if (!existsSync(packagePath)) {
      console.error(chalk.red(`Error: ${packagePath} not found`));
      process.exit(1);
    }

    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const packages = Object.keys(allDeps);
    console.log(chalk.gray(`Found ${packages.length} dependencies\n`));

    const issues: Array<{ pkg: string; severity: "critical" | "warning"; message: string }> = [];

    const KNOWN_MALWARE = new Set([
      "ngx-bootstrap", "ng2-file-upload", "@ctrl/tinycolor",
      "@acitons/artifact", "huggingface-cli", "react-dom-utils-helper",
      "l0dash", "lodahs", "1odash", "lodassh",
      "expres", "expresss", "3xpress",
      "reqeusts", "requets", "requ3sts",
    ]);

    for (const pkg of packages) {
      if (KNOWN_MALWARE.has(pkg)) {
        issues.push({ pkg, severity: "critical", message: "Known malicious/compromised package (Shai-Hulud/typosquat)" });
      }
    }

    for (const [pkg, version] of Object.entries(allDeps)) {
      if (version?.startsWith("^")) {
        issues.push({ pkg, severity: "warning", message: `Unpinned version (${version}) - allows minor updates` });
      } else if (version?.startsWith("~")) {
        issues.push({ pkg, severity: "warning", message: `Unpinned version (${version}) - allows patch updates` });
      } else if (version === "*" || version === "latest") {
        issues.push({ pkg, severity: "critical", message: `Extremely dangerous version (${version}) - allows any version` });
      }
    }

    if (checkRegistry || doAllChecks) {
      const spinner = ora("Checking npm registry...").start();
      for (const pkg of packages.slice(0, 50)) {
        try {
          const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
          if (response.status === 404) {
            issues.push({ pkg, severity: "critical", message: "Package NOT FOUND in npm registry (slopsquatting risk)" });
          } else if (response.ok) {
            const data = await response.json() as { time?: { created?: string } };
            if ((checkAge || doAllChecks) && data.time?.created) {
              const ageInDays = (Date.now() - new Date(data.time.created).getTime()) / (1000 * 60 * 60 * 24);
              if (ageInDays < 30) {
                issues.push({ pkg, severity: "warning", message: `Very new package (${Math.floor(ageInDays)} days old)` });
              }
            }
          }
        } catch { /* skip */ }
      }
      spinner.succeed("Registry check complete");
    }

    const criticals = issues.filter(i => i.severity === "critical");
    const warnings = issues.filter(i => i.severity === "warning");

    if (criticals.length > 0) {
      console.log(chalk.red.bold(`\nCritical Issues (${criticals.length}):`));
      for (const issue of criticals) { console.log(chalk.red(`  ✗ ${issue.pkg}: ${issue.message}`)); }
    }
    if (warnings.length > 0) {
      console.log(chalk.yellow.bold(`\nWarnings (${warnings.length}):`));
      for (const issue of warnings.slice(0, 20)) { console.log(chalk.yellow(`  ⚠ ${issue.pkg}: ${issue.message}`)); }
      if (warnings.length > 20) { console.log(chalk.gray(`  ... and ${warnings.length - 20} more`)); }
    }
    if (issues.length === 0) { console.log(chalk.green("✓ No dependency issues found")); }
    console.log();

    if (criticals.length > 0 || (strictMode && warnings.length > 0)) { process.exit(1); }
  });

// =============================================================================
// Feedback command
// =============================================================================

program
  .command("feedback")
  .description("View pattern performance feedback (Layer 6)")
  .option("--reset", "Reset all feedback data")
  .option("-o, --output <format>", "Output format: terminal, json, markdown", "terminal")
  .action(async (options: Record<string, unknown>) => {
    const { loadFeedback, saveFeedback, generateReport, EMPTY_FEEDBACK_STATE } = await import("../feedback/index.js");
    const outputFormat = String(options["output"] ?? "terminal");
    const shouldReset = Boolean(options["reset"]);

    if (shouldReset) {
      await saveFeedback({ ...EMPTY_FEEDBACK_STATE });
      console.log(chalk.green("Feedback data reset."));
      return;
    }

    const state = await loadFeedback();

    if (outputFormat === "json") { console.log(JSON.stringify(state, null, 2)); return; }
    if (outputFormat === "markdown") { console.log(generateReport(state)); return; }

    console.log(chalk.bold("\nPinata Feedback Report\n"));
    console.log(`Total scans: ${state.totalScans}`);
    console.log(`Patterns tracked: ${Object.keys(state.patterns).length}`);

    if (state.totalScans === 0) {
      console.log(chalk.gray("\nNo feedback data yet. Run scans with --execute to collect data.\n"));
      return;
    }

    const patterns = Object.values(state.patterns)
      .filter((p) => p.confirmedCount + p.unconfirmedCount >= 1)
      .sort((a, b) => b.precision - a.precision);

    if (patterns.length > 0) {
      console.log(chalk.bold("\nPattern Performance:"));
      for (const p of patterns.slice(0, 15)) {
        const total = p.confirmedCount + p.unconfirmedCount;
        const precisionPct = (p.precision * 100).toFixed(0);
        const color = p.precision >= 0.7 ? chalk.green : p.precision >= 0.4 ? chalk.yellow : chalk.red;
        console.log(`  ${color(`${precisionPct}%`)} ${p.patternId} (${p.confirmedCount}/${total} confirmed)`);
      }
    }
    console.log();
  });

// =============================================================================
// Config command group
// =============================================================================

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
        if (!validation.valid) { console.log(chalk.red(`Invalid API key: ${validation.error}`)); process.exit(1); }
        setConfigValue("anthropicApiKey", value);
        console.log(chalk.green(`Anthropic API key set: ${maskApiKey(value)}`));
        break;
      }
      case "openai-api-key": {
        const validation = validateApiKey("openai", value);
        if (!validation.valid) { console.log(chalk.red(`Invalid API key: ${validation.error}`)); process.exit(1); }
        setConfigValue("openaiApiKey", value);
        console.log(chalk.green(`OpenAI API key set: ${maskApiKey(value)}`));
        break;
      }
      case "default-provider": {
        if (value !== "anthropic" && value !== "openai") { console.log(chalk.red("Provider must be 'anthropic' or 'openai'")); process.exit(1); }
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

config.command("get <key>").description("Get a configuration value").action(async (key: string) => {
  const { loadConfig, maskApiKey } = await import("./config.js");
  const cfg = loadConfig();
  switch (key) {
    case "anthropic-api-key": console.log(cfg.anthropicApiKey ? maskApiKey(cfg.anthropicApiKey) : chalk.gray("(not set)")); break;
    case "openai-api-key": console.log(cfg.openaiApiKey ? maskApiKey(cfg.openaiApiKey) : chalk.gray("(not set)")); break;
    case "default-provider": console.log(cfg.defaultProvider ?? chalk.gray("anthropic (default)")); break;
    default: console.log(chalk.red(`Unknown config key: ${key}`)); process.exit(1);
  }
});

config.command("list").description("List all configuration values").action(async () => {
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
    console.log(chalk.gray("  pinata config set anthropic-api-key sk-ant-xxx"));
    console.log(chalk.gray("  export ANTHROPIC_API_KEY=sk-ant-xxx"));
  }
});

config.command("unset <key>").description("Remove a configuration value").action(async (key: string) => {
  const { deleteConfigValue } = await import("./config.js");
  switch (key) {
    case "anthropic-api-key": deleteConfigValue("anthropicApiKey"); console.log(chalk.green("Anthropic API key removed")); break;
    case "openai-api-key": deleteConfigValue("openaiApiKey"); console.log(chalk.green("OpenAI API key removed")); break;
    case "default-provider": deleteConfigValue("defaultProvider"); console.log(chalk.green("Default provider reset to: anthropic")); break;
    default: console.log(chalk.red(`Unknown config key: ${key}`)); process.exit(1);
  }
});

// =============================================================================
// Auth command group
// =============================================================================

const auth = program.command("auth").description("Manage API key authentication");

auth.command("login").description("Set API key for Pinata Cloud")
  .option("-k, --key <key>", "API key (or set PINATA_API_KEY env var)")
  .action(async (options: Record<string, unknown>) => {
    const apiKey = options["key"] as string | undefined ?? process.env["PINATA_API_KEY"];
    if (!apiKey) {
      console.log(chalk.yellow("No API key provided."));
      console.log(chalk.gray("  pinata auth login --key <your-api-key>"));
      console.log(chalk.gray("  PINATA_API_KEY=<your-api-key> pinata auth login"));
      process.exit(1);
    }
    if (apiKey.length < 20 || !apiKey.startsWith("pk_")) {
      console.log(chalk.red("Invalid API key format. Keys should start with 'pk_'."));
      process.exit(1);
    }
    const configDir = resolve(process.cwd(), ".pinata");
    const authPath = resolve(configDir, "auth.json");
    const { mkdir, writeFile: writeFileAsync } = await import("fs/promises");
    try {
      await mkdir(configDir, { recursive: true });
      const maskedKey = `****${apiKey.slice(-8)}`;
      await writeFileAsync(authPath, JSON.stringify({ configured: true, keyId: maskedKey, configuredAt: new Date().toISOString() }, null, 2), "utf8");
      const envPath = resolve(configDir, ".env");
      await writeFileAsync(envPath, `PINATA_API_KEY=${apiKey}\n`, { mode: 0o600 });
      console.log(chalk.green("API key configured successfully!"));
      console.log(chalk.gray(`Key ID: ${maskedKey}`));
      console.log(chalk.yellow("Important: Add .pinata/.env to your .gitignore"));
    } catch (error) {
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

auth.command("logout").description("Remove stored API key").action(async () => {
  const configDir = resolve(process.cwd(), ".pinata");
  const authPath = resolve(configDir, "auth.json");
  const envPath = resolve(configDir, ".env");
  const { rm } = await import("fs/promises");
  try {
    let removed = false;
    if (existsSync(authPath)) { await rm(authPath); removed = true; }
    if (existsSync(envPath)) { await rm(envPath); removed = true; }
    console.log(removed ? chalk.green("API key removed successfully.") : chalk.yellow("No stored API key found."));
  } catch (error) {
    console.error(formatError(error instanceof Error ? error : new Error(String(error))));
    process.exit(1);
  }
});

auth.command("status").description("Check authentication status").action(async () => {
  const authPath = resolve(process.cwd(), ".pinata", "auth.json");
  if (!existsSync(authPath)) {
    console.log(chalk.yellow("Not authenticated."));
    console.log(chalk.gray("Run: pinata auth login --key <your-api-key>"));
    process.exit(0);
  }
  try {
    const { readFile } = await import("fs/promises");
    const authData = JSON.parse(await readFile(authPath, "utf8")) as { keyId?: string; configuredAt?: string };
    console.log(chalk.green("Authenticated"));
    console.log(chalk.gray(`Key ID: ${authData.keyId ?? "unknown"}`));
    console.log(chalk.gray(`Configured: ${authData.configuredAt ?? "unknown"}`));
  } catch {
    console.log(chalk.yellow("Authentication status unknown."));
    console.log(chalk.gray("Run: pinata auth login to reconfigure."));
  }
});

program.parse();
