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

import { logger } from "../lib/index.js";
import { VERSION } from "../core/index.js";
import { createCategoryStore } from "../categories/store/index.js";
import {
  RISK_DOMAINS,
  TEST_LEVELS,
  type RiskDomain,
  type TestLevel,
  type Priority,
} from "../categories/schema/index.js";
import {
  formatCategories,
  formatError,
  isValidOutputFormat,
  type OutputFormat,
} from "./formatters.js";

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
  .option("-s, --severity <level>", "Minimum severity: critical, high, medium, low", "medium")
  .option("--fail-on <level>", "Exit non-zero if gaps at level: critical, high, medium")
  .option("-v, --verbose", "Verbose output")
  .option("-q, --quiet", "Quiet mode (errors only)")
  .action(async (path: string | undefined, options: Record<string, unknown>) => {
    if (options["quiet"]) {
      logger.configure({ level: "error" });
    } else if (options["verbose"]) {
      logger.configure({ level: "debug" });
    }

    logger.info(`Analyzing ${path ?? process.cwd()}...`);
    logger.warn("Analysis not yet implemented. See Phase 3 of gameplan.");
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
