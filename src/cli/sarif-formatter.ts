/**
 * SARIF (Static Analysis Results Interchange Format) output formatter.
 *
 * Generates SARIF 2.1.0 compliant output for integration with
 * GitHub Code Scanning, Azure DevOps, and other SARIF-compatible tools.
 *
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import { VERSION } from "../core/index.js";

import type { ScanResult, Gap } from "../core/scanner/types.js";
import type { Category } from "../categories/schema/index.js";

/** SARIF 2.1.0 Schema Version */
const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA = "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json";

/** SARIF severity levels */
type SarifLevel = "none" | "note" | "warning" | "error";

/** SARIF result kind */
type SarifKind = "notApplicable" | "pass" | "fail" | "review" | "open" | "informational";

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
      uriBaseId?: string;
    };
    region?: {
      startLine: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
      snippet?: {
        text: string;
      };
    };
  };
}

interface SarifResult {
  ruleId: string;
  ruleIndex?: number;
  level: SarifLevel;
  kind?: SarifKind;
  message: {
    text: string;
    markdown?: string;
  };
  locations?: SarifLocation[];
  fingerprints?: Record<string, string>;
  partialFingerprints?: Record<string, string>;
  properties?: Record<string, unknown>;
}

interface SarifRule {
  id: string;
  name?: string;
  shortDescription: {
    text: string;
  };
  fullDescription?: {
    text: string;
    markdown?: string;
  };
  helpUri?: string;
  help?: {
    text: string;
    markdown?: string;
  };
  properties?: {
    tags?: string[];
    precision?: "very-high" | "high" | "medium" | "low" | "very-low";
    "problem.severity"?: "error" | "warning" | "recommendation";
    "security-severity"?: string;
  };
  defaultConfiguration?: {
    level: SarifLevel;
    enabled?: boolean;
  };
}

interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri?: string;
      rules?: SarifRule[];
      organization?: string;
      semanticVersion?: string;
    };
  };
  invocations?: Array<{
    executionSuccessful: boolean;
    endTimeUtc?: string;
    workingDirectory?: {
      uri: string;
    };
  }>;
  results: SarifResult[];
  artifacts?: Array<{
    location: {
      uri: string;
    };
    mimeType?: string;
    length?: number;
  }>;
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

/**
 * Convert Pinata severity to SARIF level
 */
function severityToSarifLevel(severity: string): SarifLevel {
  switch (severity) {
    case "critical":
      return "error";
    case "high":
      return "error";
    case "medium":
      return "warning";
    case "low":
      return "note";
    default:
      return "note";
  }
}

/**
 * Convert severity to security-severity score (0.0-10.0)
 */
function severityToScore(severity: string): string {
  switch (severity) {
    case "critical":
      return "9.0";
    case "high":
      return "7.0";
    case "medium":
      return "5.0";
    case "low":
      return "3.0";
    default:
      return "0.0";
  }
}

/**
 * Generate a fingerprint for deduplication
 */
function generateFingerprint(gap: Gap): string {
  const parts = [
    gap.categoryId,
    gap.patternId,
    gap.filePath,
    gap.lineStart.toString(),
  ];
  return Buffer.from(parts.join(":")).toString("base64").slice(0, 32);
}

/**
 * Create SARIF rules from categories
 */
function createRules(
  gaps: Gap[],
  categories: Map<string, Category>
): SarifRule[] {
  const rulesMap = new Map<string, SarifRule>();

  for (const gap of gaps) {
    if (rulesMap.has(gap.categoryId)) continue;

    const category = categories.get(gap.categoryId);
    const rule: SarifRule = {
      id: gap.categoryId,
      name: gap.categoryName,
      shortDescription: {
        text: gap.categoryName,
      },
      ...(category
        ? {
            fullDescription: {
              text: category.description,
              markdown: category.description,
            },
          }
        : {}),
      properties: {
        tags: [gap.domain, gap.level],
        precision: gap.confidence === "high" ? "high" : gap.confidence === "medium" ? "medium" : "low",
        "problem.severity": gap.severity === "critical" || gap.severity === "high" ? "error" : "warning",
        "security-severity": severityToScore(gap.severity),
      },
      defaultConfiguration: {
        level: severityToSarifLevel(gap.severity),
        enabled: true,
      },
    };

    rulesMap.set(gap.categoryId, rule);
  }

  return Array.from(rulesMap.values());
}

/**
 * Convert a Gap to a SARIF Result
 */
function gapToSarifResult(gap: Gap, ruleIndex: number): SarifResult {
  const result: SarifResult = {
    ruleId: gap.categoryId,
    ruleIndex,
    level: severityToSarifLevel(gap.severity),
    kind: "fail",
    message: {
      text: `${gap.categoryName}: Potential ${gap.domain} issue detected (${gap.confidence} confidence)`,
      markdown: `**${gap.categoryName}**\n\nPotential ${gap.domain} issue detected with ${gap.confidence} confidence.\n\nPriority: ${gap.priority}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: gap.filePath,
            uriBaseId: "%SRCROOT%",
          },
          region: {
            startLine: gap.lineStart,
            startColumn: gap.columnStart ?? 1,
            endLine: gap.lineEnd ?? gap.lineStart,
            ...(gap.columnEnd !== undefined ? { endColumn: gap.columnEnd } : {}),
            ...(gap.codeSnippet
              ? {
                  snippet: {
                    text: gap.codeSnippet,
                  },
                }
              : {}),
          },
        },
      },
    ],
    fingerprints: {
      primary: generateFingerprint(gap),
    },
    partialFingerprints: {
      "primaryLocationLineHash": gap.lineStart.toString(),
    },
    properties: {
      priorityScore: gap.priorityScore,
      patternId: gap.patternId,
      patternType: gap.patternType,
    },
  };

  return result;
}

/**
 * Format scan results as SARIF JSON
 */
export function formatSarif(
  scanResult: ScanResult,
  categories?: Map<string, Category>
): string {
  const rules = createRules(scanResult.gaps, categories ?? new Map());

  // Create rule index map
  const ruleIndexMap = new Map<string, number>();
  rules.forEach((rule, index) => {
    ruleIndexMap.set(rule.id, index);
  });

  // Convert gaps to results
  const results: SarifResult[] = scanResult.gaps.map((gap) => {
    const ruleIndex = ruleIndexMap.get(gap.categoryId) ?? 0;
    return gapToSarifResult(gap, ruleIndex);
  });

  // Create the SARIF log
  const sarifLog: SarifLog = {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: "pinata",
            version: VERSION,
            organization: "Pinata",
            semanticVersion: VERSION,
            informationUri: "https://github.com/pinata/pinata",
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: new Date().toISOString(),
            workingDirectory: {
              uri: process.cwd(),
            },
          },
        ],
        results,
        artifacts: Array.from(scanResult.gapsByFile.keys()).map((filePath) => ({
          location: {
            uri: filePath,
          },
          mimeType: getMimeType(filePath),
        })),
      },
    ],
  };

  return JSON.stringify(sarifLog, null, 2);
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  if (filePath.endsWith(".py")) return "text/x-python";
  if (filePath.endsWith(".ts")) return "text/typescript";
  if (filePath.endsWith(".tsx")) return "text/typescript-jsx";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".jsx")) return "text/javascript-jsx";
  if (filePath.endsWith(".java")) return "text/x-java";
  if (filePath.endsWith(".go")) return "text/x-go";
  if (filePath.endsWith(".rs")) return "text/x-rust";
  return "text/plain";
}

/**
 * Validate SARIF output against schema (basic validation)
 */
export function validateSarif(sarifJson: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const parsed = JSON.parse(sarifJson) as SarifLog;

    // Required fields
    if (!parsed.$schema) errors.push("Missing $schema");
    if (!parsed.version) errors.push("Missing version");
    if (!parsed.runs || !Array.isArray(parsed.runs)) errors.push("Missing or invalid runs");
    if (parsed.version !== SARIF_VERSION) errors.push(`Invalid version: ${parsed.version}`);

    // Validate each run
    for (const run of parsed.runs ?? []) {
      if (!run.tool?.driver?.name) errors.push("Run missing tool.driver.name");
      if (!Array.isArray(run.results)) errors.push("Run missing results array");

      // Validate results
      for (const result of run.results ?? []) {
        if (!result.ruleId) errors.push("Result missing ruleId");
        if (!result.message?.text) errors.push("Result missing message.text");
      }
    }

    return { valid: errors.length === 0, errors };
  } catch (e) {
    return { valid: false, errors: ["Invalid JSON: " + String(e)] };
  }
}
