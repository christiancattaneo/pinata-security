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

import { existsSync } from "fs";
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
  writeGeneratedTests,
  type GeneratedTest,
} from "./generate-formatters.js";
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
  .option("-o, --output <format>", "Output format: terminal, json, markdown, sarif", "terminal")
  .option("-d, --domains <domains>", "Filter to specific domains (comma-separated)")
  .option("-s, --severity <level>", "Minimum severity: critical, high, medium, low", "low")
  .option("-c, --confidence <level>", "Minimum confidence: high, medium, low", "low")
  .option("--fail-on <level>", "Exit non-zero if gaps at level: critical, high, medium")
  .option("--exclude <dirs>", "Directories to exclude (comma-separated)")
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
    const minConfidence = String(options["confidence"] ?? "low");
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
  .option("-o, --output <format>", "Output format: terminal, json", "terminal")
  .option("-v, --verbose", "Verbose output")
  .option("-q, --quiet", "Quiet mode (errors only)")
  .action(async (options: Record<string, unknown>) => {
    const isQuiet = Boolean(options["quiet"]);
    const isVerbose = Boolean(options["verbose"]);
    const dryRun = !options["write"];
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

          // Extract variables from gap
          const variables = extractVariablesFromGap(gap);

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

// Auth command group
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
