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

import { Command } from "commander";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { existsSync } from "fs";
import ora from "ora";

import { logger } from "../lib/index.js";
import { VERSION, createScanner } from "../core/index.js";
import { createCategoryStore } from "../categories/store/index.js";
import {
  RISK_DOMAINS,
  TEST_LEVELS,
  type RiskDomain,
  type TestLevel,
  type Priority,
  type Severity,
} from "../categories/schema/index.js";
import {
  formatCategories,
  formatError,
  isValidOutputFormat,
  type OutputFormat,
} from "./formatters.js";
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

      // Format and output results
      const output = formatScanResult(scanResult.data, outputFormat as ScanOutputFormat, targetDirectory);
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
  .option("--output-dir <dir>", "Directory for generated test files")
  .option("--dry-run", "Preview without writing files")
  .action(async (options: Record<string, unknown>) => {
    logger.info("Generating tests...");
    logger.warn("Generation not yet implemented. See Phase 2 of gameplan.");
  });

program
  .command("search <query>")
  .description("Search category taxonomy")
  .option("-d, --domain <domain>", "Filter by risk domain")
  .option("-l, --level <level>", "Filter by test level")
  .option("--language <lang>", "Filter by language")
  .option("-o, --output <format>", "Output format: terminal, json, markdown", "terminal")
  .action(async (query: string, options: Record<string, unknown>) => {
    logger.info(`Searching for: ${query}`);
    logger.warn("Search not yet implemented. See Phase 1 of gameplan.");
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
      const output = formatCategories(categories, outputFormat as OutputFormat);
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
  .description("Initialize Pinata config in project")
  .action(async () => {
    logger.info("Initializing .pinata.yml...");
    logger.warn("Init not yet implemented.");
  });

program.parse();
