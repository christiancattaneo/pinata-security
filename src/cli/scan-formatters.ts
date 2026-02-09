/**
 * Formatters for scan results
 *
 * Handles terminal, JSON, markdown, and SARIF output formats
 * for the analyze command results.
 */

import { relative } from "path";

import chalk from "chalk";

import { RISK_DOMAINS } from "../categories/schema/index.js";
import { getProjectTypeDescription } from "../core/detection/project-type.js";

import type { RiskDomain } from "../categories/schema/index.js";
import type {
  ScanResult,
  Gap,
  PinataScore,
  CoverageMetrics,
  ScanSummary,
} from "../core/scanner/types.js";


/**
 * Extended output format including SARIF, HTML, and JUnit
 */
export type ScanOutputFormat = "terminal" | "json" | "markdown" | "sarif" | "html" | "junit-xml";

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
 * Domain colors for terminal output
 */
const DOMAIN_COLORS: Record<RiskDomain, typeof chalk.red> = {
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
 * Grade colors
 */
const GRADE_COLORS: Record<string, typeof chalk.red> = {
  A: chalk.green.bold,
  B: chalk.green,
  C: chalk.yellow,
  D: chalk.red,
  F: chalk.red.bold,
};

/**
 * ASCII art banner
 */
const BANNER = `
${chalk.cyan(" ____  _             _        ")}
${chalk.cyan("|  _ \\(_)_ __   __ _| |_ __ _ ")}
${chalk.cyan("| |_) | | '_ \\ / _\` | __/ _\` |")}
${chalk.cyan("|  __/| | | | | (_| | || (_| |")}
${chalk.cyan("|_|   |_|_| |_|\\__,_|\\__\\__,_|")}
`;

/**
 * Format scan results for terminal output
 */
export function formatScanTerminal(result: ScanResult, basePath: string): string {
  const lines: string[] = [];

  // Banner
  lines.push(BANNER);

  // Analysis target
  lines.push(chalk.gray(`Analyzing: ${result.targetDirectory}`));
  const projectTypeLabel = getProjectTypeDescription(result.projectType.type);
  lines.push(chalk.gray(`Project: ${projectTypeLabel} (${result.projectType.confidence} confidence)`));
  lines.push(chalk.gray(`Files: ${result.fileStats.totalFiles} | Languages: ${formatLanguages(result)}`));
  lines.push("");

  // Pinata Score box
  lines.push(formatScoreBox(result.score));
  lines.push("");

  // Domain coverage
  lines.push(chalk.bold("Domain Coverage:"));
  lines.push(formatDomainCoverage(result.coverage));
  lines.push("");

  // Gaps summary
  if (result.gaps.length > 0) {
    lines.push(formatGapsSummary(result.gaps, basePath));
    lines.push("");
  } else {
    lines.push(chalk.green.bold("No vulnerabilities detected."));
    lines.push("");
  }

  // Footer with suggestions
  if (result.gaps.length > 0) {
    lines.push(chalk.gray("Run `pinata generate --gaps` to create tests for these gaps."));
  }

  // Timing
  lines.push(chalk.gray(`\nScan completed in ${result.durationMs}ms`));

  return lines.join("\n");
}

/**
 * Format the Pinata Score box
 */
function formatScoreBox(score: PinataScore): string {
  const gradeColor = GRADE_COLORS[score.grade] ?? chalk.white;
  const scoreStr = `Pinata Score: ${score.overall}/100 ${gradeColor(`(${score.grade})`)}`;

  const boxWidth = 60;
  const padding = Math.floor((boxWidth - scoreStr.length) / 2);

  const top = chalk.cyan("╔" + "═".repeat(boxWidth) + "╗");
  const middle = chalk.cyan("║") + " ".repeat(padding) + scoreStr + " ".repeat(boxWidth - padding - scoreStr.length) + chalk.cyan("║");
  const bottom = chalk.cyan("╚" + "═".repeat(boxWidth) + "╝");

  return `${top}\n${middle}\n${bottom}`;
}

/**
 * Format domain coverage as progress bars
 */
function formatDomainCoverage(coverage: CoverageMetrics): string {
  const lines: string[] = [];
  const barWidth = 16;

  for (const domain of RISK_DOMAINS) {
    const domainCoverage = coverage.byDomain.get(domain);
    if (!domainCoverage || domainCoverage.categoriesScanned === 0) {
      continue;
    }

    const percent = domainCoverage.coveragePercent;
    const filledWidth = Math.round((percent / 100) * barWidth);
    const bar = chalk.green("█".repeat(filledWidth)) + chalk.gray("░".repeat(barWidth - filledWidth));

    const domainColor = DOMAIN_COLORS[domain] ?? chalk.white;
    const domainName = domain.padEnd(15);
    const stats = `${domainCoverage.categoriesCovered}/${domainCoverage.categoriesScanned} categories`;

    lines.push(`  ${domainColor(domainName)} ${bar} ${percent.toString().padStart(3)}%  (${stats})`);
  }

  if (lines.length === 0) {
    lines.push(chalk.gray("  No domain coverage data available."));
  }

  return lines.join("\n");
}

/**
 * Format gaps summary
 */
function formatGapsSummary(gaps: Gap[], basePath: string): string {
  const lines: string[] = [];

  // Group by severity
  const critical = gaps.filter((g) => g.severity === "critical");
  const high = gaps.filter((g) => g.severity === "high");
  const medium = gaps.filter((g) => g.severity === "medium");
  const low = gaps.filter((g) => g.severity === "low");

  // Critical gaps
  if (critical.length > 0) {
    lines.push(chalk.red.bold(`\nCritical Gaps (${critical.length}):`));
    for (const gap of critical.slice(0, 5)) {
      lines.push(formatGapLine(gap, basePath, "critical"));
    }
    if (critical.length > 5) {
      lines.push(chalk.gray(`  ... and ${critical.length - 5} more critical gaps`));
    }
  }

  // High gaps
  if (high.length > 0) {
    lines.push(chalk.red(`\nHigh Severity Gaps (${high.length}):`));
    for (const gap of high.slice(0, 5)) {
      lines.push(formatGapLine(gap, basePath, "high"));
    }
    if (high.length > 5) {
      lines.push(chalk.gray(`  ... and ${high.length - 5} more high severity gaps`));
    }
  }

  // Medium gaps
  if (medium.length > 0) {
    lines.push(chalk.yellow(`\nMedium Severity Gaps (${medium.length}):`));
    for (const gap of medium.slice(0, 3)) {
      lines.push(formatGapLine(gap, basePath, "medium"));
    }
    if (medium.length > 3) {
      lines.push(chalk.gray(`  ... and ${medium.length - 3} more medium severity gaps`));
    }
  }

  // Low gaps (just count)
  if (low.length > 0) {
    lines.push(chalk.gray(`\nLow Severity: ${low.length} gaps`));
  }

  return lines.join("\n");
}

/**
 * Format a single gap line
 */
function formatGapLine(gap: Gap, basePath: string, severity: string): string {
  const severityColor = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] ?? chalk.white;
  const icon = severity === "critical" ? "⛔" : severity === "high" ? "🔴" : severity === "medium" ? "🟡" : "⚪";
  const relPath = relative(basePath, gap.filePath);
  const location = `${relPath}:${gap.lineStart}`;
  const confidence = gap.confidence.toUpperCase();

  return `  ${icon} ${severityColor(gap.categoryName.padEnd(20))} ${chalk.cyan(location.padEnd(30))} ${chalk.gray(confidence)} confidence`;
}

/**
 * Format languages detected
 */
function formatLanguages(result: ScanResult): string {
  const languages: string[] = [];
  for (const [lang, count] of result.fileStats.byLanguage) {
    if (count > 0) {
      languages.push(lang.charAt(0).toUpperCase() + lang.slice(1));
    }
  }
  return languages.join(", ") || "None detected";
}

/**
 * Format scan results as JSON
 */
export function formatScanJson(result: ScanResult): string {
  // Convert Maps to plain objects for JSON serialization
  const serializable = {
    targetDirectory: result.targetDirectory,
    projectType: {
      type: result.projectType.type,
      confidence: result.projectType.confidence,
      evidence: result.projectType.evidence,
      frameworks: result.projectType.frameworks,
      languages: result.projectType.languages,
      ...(result.projectType.secondaryTypes && { secondaryTypes: result.projectType.secondaryTypes }),
    },
    startedAt: result.startedAt.toISOString(),
    completedAt: result.completedAt.toISOString(),
    durationMs: result.durationMs,
    score: {
      overall: result.score.overall,
      grade: result.score.grade,
      byDomain: Object.fromEntries(result.score.byDomain),
      bySeverity: result.score.bySeverity,
      penalties: result.score.penalties,
      bonuses: result.score.bonuses,
    },
    coverage: {
      overallCoverage: result.coverage.overallCoverage,
      totalCategories: result.coverage.totalCategories,
      categoriesWithGaps: result.coverage.categoriesWithGaps,
      categoriesCovered: result.coverage.categoriesCovered,
      byDomain: Object.fromEntries(result.coverage.byDomain),
      byLevel: Object.fromEntries(result.coverage.byLevel),
    },
    fileStats: {
      ...result.fileStats,
      byLanguage: Object.fromEntries(result.fileStats.byLanguage),
    },
    gaps: result.gaps,
    summary: result.summary,
    warnings: result.warnings,
    categoriesScanned: result.categoriesScanned,
  };

  return JSON.stringify(serializable, null, 2);
}

/**
 * Format scan results as Markdown
 */
export function formatScanMarkdown(result: ScanResult, basePath: string): string {
  const lines: string[] = [];

  lines.push("# Pinata Analysis Report\n");

  // Summary
  lines.push(`**Target**: ${result.targetDirectory}`);
  lines.push(`**Date**: ${result.completedAt.toISOString()}`);
  lines.push(`**Duration**: ${result.durationMs}ms`);
  lines.push(`**Files Scanned**: ${result.fileStats.totalFiles}`);
  lines.push("");

  // Score
  lines.push(`## Pinata Score: ${result.score.overall}/100 (${result.score.grade})\n`);

  // Coverage
  lines.push("## Coverage by Domain\n");
  for (const domain of RISK_DOMAINS) {
    const cov = result.coverage.byDomain.get(domain);
    if (cov && cov.categoriesScanned > 0) {
      const bar = "█".repeat(Math.round(cov.coveragePercent / 10)) + "░".repeat(10 - Math.round(cov.coveragePercent / 10));
      lines.push(`- **${domain}**: ${bar} ${cov.coveragePercent}% (${cov.categoriesCovered}/${cov.categoriesScanned})`);
    }
  }
  lines.push("");

  // Gaps
  if (result.gaps.length > 0) {
    lines.push("## Detected Gaps\n");

    const bySeverity: Record<string, Gap[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const gap of result.gaps) {
      bySeverity[gap.severity]?.push(gap);
    }

    for (const severity of ["critical", "high", "medium", "low"]) {
      const gaps = bySeverity[severity];
      if (gaps && gaps.length > 0) {
        lines.push(`### ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${gaps.length})\n`);

        for (const gap of gaps.slice(0, 10)) {
          const relPath = relative(basePath, gap.filePath);
          lines.push(`- **${gap.categoryName}** in \`${relPath}:${gap.lineStart}\``);
          lines.push(`  - Confidence: ${gap.confidence}`);
          lines.push(`  - Domain: ${gap.domain}`);
        }

        if (gaps.length > 10) {
          lines.push(`\n_...and ${gaps.length - 10} more ${severity} gaps_\n`);
        }
        lines.push("");
      }
    }
  } else {
    lines.push("## No Gaps Detected\n");
    lines.push("No vulnerabilities detected.\n");
  }

  // Summary stats
  lines.push("## Summary\n");
  lines.push(`- Total Gaps: ${result.summary.totalGaps}`);
  lines.push(`- Critical: ${result.summary.criticalGaps}`);
  lines.push(`- High: ${result.summary.highGaps}`);
  lines.push(`- Medium: ${result.summary.mediumGaps}`);
  lines.push(`- Low: ${result.summary.lowGaps}`);

  return lines.join("\n");
}

/**
 * Format scan results as SARIF (for GitHub Security integration)
 */
export function formatScanSarif(result: ScanResult, basePath: string): string {
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "pinata",
            version: "0.1.0",
            informationUri: "https://github.com/pinata/pinata",
            rules: buildSarifRules(result),
          },
        },
        results: buildSarifResults(result, basePath),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

/**
 * Build SARIF rules from categories
 */
function buildSarifRules(result: ScanResult): object[] {
  const rulesMap = new Map<string, object>();

  for (const gap of result.gaps) {
    if (!rulesMap.has(gap.categoryId)) {
      rulesMap.set(gap.categoryId, {
        id: gap.categoryId,
        name: gap.categoryName,
        shortDescription: {
          text: gap.categoryName,
        },
        defaultConfiguration: {
          level: sarifLevel(gap.severity),
        },
        properties: {
          tags: [gap.domain, gap.level],
          precision: gap.confidence,
        },
      });
    }
  }

  return Array.from(rulesMap.values());
}

/**
 * Build SARIF results from gaps
 */
function buildSarifResults(result: ScanResult, basePath: string): object[] {
  return result.gaps.map((gap) => ({
    ruleId: gap.categoryId,
    level: sarifLevel(gap.severity),
    message: {
      text: `Potential vulnerability: ${gap.categoryName}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: relative(basePath, gap.filePath),
            uriBaseId: "%SRCROOT%",
          },
          region: {
            startLine: gap.lineStart,
            endLine: gap.lineEnd,
            startColumn: gap.columnStart + 1,
            endColumn: gap.columnEnd + 1,
            snippet: {
              text: gap.codeSnippet,
            },
          },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: `${gap.filePath}:${gap.lineStart}:${gap.patternId}`,
    },
  }));
}

/**
 * Convert severity to SARIF level
 */
function sarifLevel(severity: string): string {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
    default:
      return "note";
  }
}

/**
 * Format scan results in the specified format
 */
export function formatScanResult(
  result: ScanResult,
  format: ScanOutputFormat,
  basePath: string
): string {
  switch (format) {
    case "json":
      return formatScanJson(result);
    case "markdown":
      return formatScanMarkdown(result, basePath);
    case "sarif":
      return formatScanSarif(result, basePath);
    case "html": {
      const { formatHtml } = require("./html-formatter.js") as { formatHtml: (result: ScanResult) => string };
      return formatHtml(result);
    }
    case "junit-xml": {
      const { formatJunit } = require("./junit-formatter.js") as { formatJunit: (result: ScanResult) => string };
      return formatJunit(result);
    }
    case "terminal":
    default:
      return formatScanTerminal(result, basePath);
  }
}

/**
 * Validate scan output format
 */
export function isValidScanOutputFormat(format: string): format is ScanOutputFormat {
  return ["terminal", "json", "markdown", "sarif", "html", "junit-xml"].includes(format);
}
