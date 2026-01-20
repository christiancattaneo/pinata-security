import chalk from "chalk";
import type { CategorySummary } from "../categories/schema/index.js";

/**
 * Output format types
 */
export type OutputFormat = "terminal" | "json" | "markdown";

/**
 * Severity colors for terminal output
 */
const SEVERITY_COLORS = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.gray,
};

/**
 * Priority colors for terminal output
 */
const PRIORITY_COLORS = {
  P0: chalk.red.bold,
  P1: chalk.yellow,
  P2: chalk.gray,
};

/**
 * Domain colors for terminal output
 */
const DOMAIN_COLORS: Record<string, typeof chalk> = {
  security: chalk.red,
  data: chalk.blue,
  concurrency: chalk.magenta,
  input: chalk.cyan,
  resource: chalk.yellow,
  reliability: chalk.green,
  performance: chalk.yellowBright,
  platform: chalk.gray,
  business: chalk.white,
  compliance: chalk.blueBright,
};

/**
 * Format category list for terminal output with colors
 */
export function formatTerminal(categories: CategorySummary[]): string {
  if (categories.length === 0) {
    return chalk.yellow("No categories found matching the filters.");
  }

  const lines: string[] = [];

  // Header
  lines.push(chalk.bold.underline(`Found ${categories.length} categories:\n`));

  // Group by domain for better organization
  const byDomain = new Map<string, CategorySummary[]>();
  for (const cat of categories) {
    const domain = cat.domain;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain)!.push(cat);
  }

  // Output each domain group
  for (const [domain, domainCategories] of byDomain) {
    const domainColor = DOMAIN_COLORS[domain] ?? chalk.white;
    lines.push(domainColor.bold(`\n${domain.toUpperCase()} (${domainCategories.length})`));
    lines.push(chalk.gray("─".repeat(40)));

    for (const cat of domainCategories) {
      const priorityColor = PRIORITY_COLORS[cat.priority];
      const severityColor = SEVERITY_COLORS[cat.severity];

      const priority = priorityColor(`[${cat.priority}]`);
      const severity = severityColor(`${cat.severity}`);
      const level = chalk.cyan(`${cat.level}`);
      const name = chalk.white.bold(cat.name);
      const id = chalk.gray(`(${cat.id})`);

      lines.push(`  ${priority} ${name} ${id}`);
      lines.push(`     ${severity} | ${level}`);

      // Truncate description
      const desc = cat.description.length > 80
        ? cat.description.slice(0, 77) + "..."
        : cat.description;
      lines.push(chalk.gray(`     ${desc}`));
      lines.push("");
    }
  }

  // Summary footer
  lines.push(chalk.gray("─".repeat(40)));
  lines.push(formatStats(categories));

  return lines.join("\n");
}

/**
 * Format statistics summary
 */
function formatStats(categories: CategorySummary[]): string {
  const stats = {
    P0: 0,
    P1: 0,
    P2: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const cat of categories) {
    stats[cat.priority]++;
    stats[cat.severity]++;
  }

  const parts: string[] = [];

  if (stats.P0 > 0) parts.push(PRIORITY_COLORS.P0(`${stats.P0} P0`));
  if (stats.P1 > 0) parts.push(PRIORITY_COLORS.P1(`${stats.P1} P1`));
  if (stats.P2 > 0) parts.push(PRIORITY_COLORS.P2(`${stats.P2} P2`));

  parts.push(chalk.gray("|"));

  if (stats.critical > 0) parts.push(SEVERITY_COLORS.critical(`${stats.critical} critical`));
  if (stats.high > 0) parts.push(SEVERITY_COLORS.high(`${stats.high} high`));
  if (stats.medium > 0) parts.push(SEVERITY_COLORS.medium(`${stats.medium} medium`));
  if (stats.low > 0) parts.push(SEVERITY_COLORS.low(`${stats.low} low`));

  return parts.join(" ");
}

/**
 * Format category list as JSON
 */
export function formatJson(categories: CategorySummary[]): string {
  return JSON.stringify(categories, null, 2);
}

/**
 * Format category list as Markdown
 */
export function formatMarkdown(categories: CategorySummary[]): string {
  if (categories.length === 0) {
    return "_No categories found matching the filters._";
  }

  const lines: string[] = [];

  lines.push(`# Categories (${categories.length})\n`);

  // Group by domain
  const byDomain = new Map<string, CategorySummary[]>();
  for (const cat of categories) {
    const domain = cat.domain;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain)!.push(cat);
  }

  // Output each domain group
  for (const [domain, domainCategories] of byDomain) {
    lines.push(`\n## ${domain.charAt(0).toUpperCase() + domain.slice(1)} (${domainCategories.length})\n`);

    for (const cat of domainCategories) {
      lines.push(`### ${cat.name}`);
      lines.push(`- **ID**: \`${cat.id}\``);
      lines.push(`- **Priority**: ${cat.priority}`);
      lines.push(`- **Severity**: ${cat.severity}`);
      lines.push(`- **Level**: ${cat.level}`);
      lines.push(`\n${cat.description}\n`);
    }
  }

  return lines.join("\n");
}

/**
 * Format categories in the specified output format
 */
export function formatCategories(categories: CategorySummary[], format: OutputFormat): string {
  switch (format) {
    case "json":
      return formatJson(categories);
    case "markdown":
      return formatMarkdown(categories);
    case "terminal":
    default:
      return formatTerminal(categories);
  }
}

/**
 * Validate output format string
 */
export function isValidOutputFormat(format: string): format is OutputFormat {
  return ["terminal", "json", "markdown"].includes(format);
}

/**
 * Format an error for terminal output
 */
export function formatError(error: Error): string {
  return chalk.red(`Error: ${error.message}`);
}

/**
 * Format a warning for terminal output
 */
export function formatWarning(message: string): string {
  return chalk.yellow(`Warning: ${message}`);
}

/**
 * Format a success message for terminal output
 */
export function formatSuccess(message: string): string {
  return chalk.green(`✓ ${message}`);
}
