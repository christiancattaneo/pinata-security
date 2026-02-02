#!/usr/bin/env npx ts-node
/**
 * Imports security patterns from Semgrep's open-source rule repository.
 *
 * Usage:
 *   npx ts-node scripts/import-semgrep.ts
 *
 * This script:
 * 1. Clones/updates the semgrep-rules repository
 * 2. Parses relevant YAML rules
 * 3. Converts them to Pinata detection pattern format
 * 4. Outputs patterns that can be added to category definitions
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import YAML from "yaml";

const SEMGREP_REPO = "https://github.com/semgrep/semgrep-rules.git";
const CACHE_DIR = ".pinata/cache/semgrep-rules";
const OUTPUT_DIR = ".pinata/imported-patterns";

// Map Semgrep categories to Pinata categories
const CATEGORY_MAP: Record<string, string> = {
  "sql-injection": "sql-injection",
  "sqli": "sql-injection",
  "xss": "xss",
  "command-injection": "command-injection",
  "path-traversal": "path-traversal",
  "ssrf": "ssrf",
  "xxe": "xxe",
  "deserialization": "deserialization",
  "hardcoded-secret": "hardcoded-secrets",
  "crypto": "timing-attack",
};

// Directories in semgrep-rules that contain security patterns
const SECURITY_PATHS = [
  "python/django/security",
  "python/flask/security",
  "python/lang/security",
  "javascript/lang/security",
  "typescript/lang/security",
  "javascript/express/security",
  "javascript/sequelize/security",
  "typescript/sequelize/security",
];

interface SemgrepRule {
  id: string;
  message: string;
  severity: string;
  languages: string[];
  pattern?: string;
  patterns?: unknown[];
  "pattern-regex"?: string;
  "pattern-either"?: unknown[];
  metadata?: {
    cwe?: string[];
    owasp?: string[];
    category?: string;
    subcategory?: string[];
    confidence?: string;
    likelihood?: string;
    impact?: string;
  };
}

interface PinataPattern {
  id: string;
  type: "regex" | "ast" | "semantic";
  language: string;
  pattern: string;
  confidence: "high" | "medium" | "low";
  description: string;
  source: string;
  cwe?: string;
}

function cloneOrUpdateRepo(): void {
  if (!existsSync(CACHE_DIR)) {
    console.log("Cloning semgrep-rules repository...");
    mkdirSync(CACHE_DIR, { recursive: true });
    execSync(`git clone --depth 1 ${SEMGREP_REPO} ${CACHE_DIR}`, { stdio: "inherit" });
  } else {
    console.log("Updating semgrep-rules repository...");
    execSync("git pull --ff-only", { cwd: CACHE_DIR, stdio: "inherit" });
  }
}

function findYamlFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    if (!existsSync(currentDir)) return;

    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function semgrepPatternToRegex(rule: SemgrepRule): string | null {
  // Direct regex pattern
  if (rule["pattern-regex"]) {
    return rule["pattern-regex"];
  }

  // Simple pattern - convert to regex approximation
  if (rule.pattern && typeof rule.pattern === "string") {
    // This is a simplified conversion - Semgrep patterns are more complex
    let pattern = rule.pattern;

    // Escape regex special chars except our placeholders
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Convert Semgrep metavariables to regex groups
    pattern = pattern.replace(/\\\$[A-Z_]+/g, ".*");

    // Convert ellipsis to match anything
    pattern = pattern.replace(/\.\.\./g, ".*");

    return pattern;
  }

  return null;
}

function mapConfidence(rule: SemgrepRule): "high" | "medium" | "low" {
  const confidence = rule.metadata?.confidence?.toLowerCase();
  const likelihood = rule.metadata?.likelihood?.toLowerCase();

  if (confidence === "high" || likelihood === "high") return "high";
  if (confidence === "low" || likelihood === "low") return "low";
  return "medium";
}

function mapLanguage(languages: string[]): string {
  // Return first supported language
  for (const lang of languages) {
    if (["python", "javascript", "typescript"].includes(lang)) {
      return lang;
    }
  }
  return languages[0] ?? "unknown";
}

function extractCwe(rule: SemgrepRule): string | undefined {
  const cweList = rule.metadata?.cwe;
  if (!cweList || cweList.length === 0) return undefined;

  // Extract CWE number from strings like "CWE-89: SQL Injection"
  const match = cweList[0]?.match(/CWE-(\d+)/);
  return match ? `CWE-${match[1]}` : undefined;
}

function convertRule(rule: SemgrepRule, filePath: string): PinataPattern | null {
  const regex = semgrepPatternToRegex(rule);
  if (!regex) return null;

  return {
    id: `semgrep-${rule.id}`,
    type: "regex",
    language: mapLanguage(rule.languages),
    pattern: regex,
    confidence: mapConfidence(rule),
    description: rule.message.split("\n")[0]?.trim() ?? rule.id,
    source: `semgrep-rules/${filePath.replace(CACHE_DIR + "/", "")}`,
    cwe: extractCwe(rule),
  };
}

function categorizePattern(rule: SemgrepRule, filePath: string): string {
  // Try to determine category from file path
  const pathLower = filePath.toLowerCase();

  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (pathLower.includes(key)) {
      return category;
    }
  }

  // Try metadata category
  const subcategory = rule.metadata?.subcategory?.[0];
  if (subcategory && CATEGORY_MAP[subcategory]) {
    return CATEGORY_MAP[subcategory];
  }

  // Default based on CWE
  const cwe = extractCwe(rule);
  if (cwe === "CWE-89") return "sql-injection";
  if (cwe === "CWE-79") return "xss";
  if (cwe === "CWE-78") return "command-injection";
  if (cwe === "CWE-22") return "path-traversal";

  return "unknown";
}

async function main(): Promise<void> {
  console.log("=== Semgrep Pattern Importer ===\n");

  // Clone or update repo
  cloneOrUpdateRepo();

  // Collect patterns by category
  const patternsByCategory = new Map<string, PinataPattern[]>();
  let totalRules = 0;
  let convertedRules = 0;

  for (const securityPath of SECURITY_PATHS) {
    const fullPath = join(CACHE_DIR, securityPath);
    const yamlFiles = findYamlFiles(fullPath);

    for (const filePath of yamlFiles) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const parsed = YAML.parse(content);

        if (!parsed?.rules) continue;

        for (const rule of parsed.rules as SemgrepRule[]) {
          totalRules++;

          const pattern = convertRule(rule, filePath);
          if (!pattern) continue;

          convertedRules++;

          const category = categorizePattern(rule, filePath);
          const existing = patternsByCategory.get(category) ?? [];
          existing.push(pattern);
          patternsByCategory.set(category, existing);
        }
      } catch (err) {
        // Skip malformed files
        console.warn(`Skipping ${basename(filePath)}: ${(err as Error).message}`);
      }
    }
  }

  // Output results
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nProcessed ${totalRules} rules, converted ${convertedRules} to regex patterns\n`);

  for (const [category, patterns] of patternsByCategory) {
    const outputFile = join(OUTPUT_DIR, `${category}-patterns.yaml`);

    const output = {
      category,
      source: "semgrep-rules",
      importedAt: new Date().toISOString(),
      patterns: patterns.map((p) => ({
        id: p.id,
        type: p.type,
        language: p.language,
        pattern: p.pattern,
        confidence: p.confidence,
        description: p.description,
        cwe: p.cwe,
      })),
    };

    writeFileSync(outputFile, YAML.stringify(output));
    console.log(`  ${category}: ${patterns.length} patterns -> ${outputFile}`);
  }

  console.log("\nDone! Review patterns in", OUTPUT_DIR);
  console.log("Add validated patterns to src/categories/definitions/<category>.yml");
}

main().catch(console.error);
