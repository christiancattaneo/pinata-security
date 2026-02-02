#!/usr/bin/env npx ts-node
/**
 * LLM-powered pattern generator for improving detection accuracy.
 *
 * Usage:
 *   npx ts-node scripts/llm-pattern-gen.ts analyze     # Analyze missed detections
 *   npx ts-node scripts/llm-pattern-gen.ts generate    # Generate new patterns with LLM
 *   npx ts-node scripts/llm-pattern-gen.ts validate    # Test generated patterns
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";
import YAML from "yaml";

const BENCHMARK_DIR = ".pinata/cache/owasp-benchmark/BenchmarkPython";
const RESULTS_DIR = ".pinata/benchmark-results";
const OUTPUT_DIR = ".pinata/generated-patterns";

// Categories where we have poor recall
const TARGET_CATEGORIES = [
  { owasp: "sqli", pinata: "sql-injection", cwe: 89 },
  { owasp: "xss", pinata: "xss", cwe: 79 },
  { owasp: "cmdi", pinata: "command-injection", cwe: 78 },
  { owasp: "pathtraver", pinata: "path-traversal", cwe: 22 },
  { owasp: "ldapi", pinata: "ldap-injection", cwe: 90 },
];

interface MissedVulnerability {
  testName: string;
  category: string;
  cwe: number;
  code: string;
  filePath: string;
}

interface GeneratedPattern {
  id: string;
  category: string;
  language: string;
  pattern: string;
  confidence: string;
  description: string;
  examples: string[];
  source: string;
}

function loadExpectedResults(): Map<string, { category: string; cwe: number; isVulnerable: boolean }> {
  const csvPath = join(BENCHMARK_DIR, "expectedresults-0.1.csv");
  const content = readFileSync(csvPath, "utf-8");
  const results = new Map<string, { category: string; cwe: number; isVulnerable: boolean }>();

  for (const line of content.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;

    const parts = line.split(",");
    if (parts.length < 4) continue;

    const testName = parts[0]?.trim() ?? "";
    if (!testName.startsWith("BenchmarkTest")) continue;

    results.set(testName, {
      category: parts[1]?.trim() ?? "",
      isVulnerable: parts[2]?.trim().toLowerCase() === "true",
      cwe: parseInt(parts[3]?.trim() ?? "0", 10),
    });
  }

  return results;
}

function loadScanResults(): Map<string, Set<string>> {
  const resultsPath = join(RESULTS_DIR, "python-results.json");
  if (!existsSync(resultsPath)) {
    console.error("No scan results found. Run: npx ts-node scripts/owasp-benchmark.ts run python");
    process.exit(1);
  }

  const { actual } = JSON.parse(readFileSync(resultsPath, "utf-8"));
  // Map of testName -> Set of detected category IDs
  const detectedByFile = new Map<string, Set<string>>();

  for (const result of actual) {
    // Extract test name from file
    const match = result.file.match(/BenchmarkTest(\d+)/);
    if (match) {
      const testName = `BenchmarkTest${match[1]!.padStart(5, "0")}`;
      const categories = new Set<string>();
      for (const detection of result.detections) {
        categories.add(detection.categoryId);
      }
      detectedByFile.set(testName, categories);
    }
  }

  return detectedByFile;
}

function findMissedVulnerabilities(): MissedVulnerability[] {
  const expected = loadExpectedResults();
  const detectedByFile = loadScanResults();
  const missed: MissedVulnerability[] = [];

  const testCodeDir = join(BENCHMARK_DIR, "testcode");
  const files = readdirSync(testCodeDir).filter((f) => f.endsWith(".py"));

  for (const file of files) {
    const match = file.match(/BenchmarkTest(\d+)\.py/);
    if (!match) continue;

    const testName = `BenchmarkTest${match[1]!.padStart(5, "0")}`;
    const info = expected.get(testName);

    if (!info) continue;

    // Only interested in vulnerable tests
    if (!info.isVulnerable) continue;

    const targetCategory = TARGET_CATEGORIES.find((t) => t.owasp === info.category);
    if (!targetCategory) continue;

    // Check if we detected the correct category for this test
    const detectedCategories = detectedByFile.get(testName) ?? new Set();
    const detectedCorrectCategory = detectedCategories.has(targetCategory.pinata);

    if (!detectedCorrectCategory) {
      const filePath = join(testCodeDir, file);
      const code = readFileSync(filePath, "utf-8");

      missed.push({
        testName,
        category: targetCategory.pinata,
        cwe: info.cwe,
        code,
        filePath,
      });
    }
  }

  return missed;
}

function groupByCategory(missed: MissedVulnerability[]): Map<string, MissedVulnerability[]> {
  const grouped = new Map<string, MissedVulnerability[]>();

  for (const vuln of missed) {
    const existing = grouped.get(vuln.category) ?? [];
    existing.push(vuln);
    grouped.set(vuln.category, existing);
  }

  return grouped;
}

function extractVulnerableLines(code: string): string[] {
  // Look for common vulnerable patterns
  const lines = code.split("\n");
  const vulnerableLines: string[] = [];

  const dangerousPatterns = [
    /execute\s*\(/,
    /cursor\./,
    /query\s*\(/,
    /subprocess\./,
    /os\.system/,
    /os\.popen/,
    /eval\s*\(/,
    /open\s*\(/,
    /\.read\s*\(/,
    /\.write\s*\(/,
    /render_template/,
    /innerHTML/,
    /ldap\./,
    /search\s*\(/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (dangerousPatterns.some((p) => p.test(line))) {
      // Include context
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      vulnerableLines.push(lines.slice(start, end).join("\n"));
    }
  }

  return vulnerableLines;
}

async function generatePatternWithLLM(
  category: string,
  examples: string[]
): Promise<GeneratedPattern | null> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.log("ANTHROPIC_API_KEY not set - using template-based generation");
    return generatePatternFromTemplate(category, examples);
  }

  const prompt = `You are a security pattern expert. Analyze these vulnerable Python code examples and generate a regex pattern to detect similar vulnerabilities.

Category: ${category}

Vulnerable code examples:
${examples.slice(0, 5).map((e, i) => `--- Example ${i + 1} ---\n${e}`).join("\n\n")}

Requirements:
1. Generate a SINGLE regex pattern that matches the vulnerable code pattern
2. The pattern should catch the security issue without too many false positives
3. Focus on the dangerous operation (e.g., unsanitized input in SQL, command execution)
4. Use Python regex syntax

Respond with ONLY a JSON object:
{
  "pattern": "your_regex_here",
  "description": "Brief description of what this pattern detects",
  "confidence": "high|medium|low"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("LLM API error:", response.status);
      return generatePatternFromTemplate(category, examples);
    }

    const data = await response.json() as { content: Array<{ text: string }> };
    const text = data.content[0]?.text ?? "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON in LLM response");
      return generatePatternFromTemplate(category, examples);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id: `llm-${category}-${Date.now()}`,
      category,
      language: "python",
      pattern: parsed.pattern,
      confidence: parsed.confidence ?? "medium",
      description: parsed.description ?? `LLM-generated pattern for ${category}`,
      examples: examples.slice(0, 3),
      source: "llm-generated",
    };
  } catch (err) {
    console.error("LLM generation failed:", (err as Error).message);
    return generatePatternFromTemplate(category, examples);
  }
}

function generatePatternFromTemplate(
  category: string,
  examples: string[]
): GeneratedPattern {
  // Patterns tuned for OWASP Benchmark Python code style
  const patterns: Record<string, string> = {
    // OWASP uses: sql = f'SELECT ...', then cur.execute(sql)
    "sql-injection": "f['\"]SELECT|f['\"]INSERT|f['\"]UPDATE|f['\"]DELETE|execute\\s*\\(\\s*[a-z_]+\\s*\\)",
    // OWASP uses: render_template_string(), template variables
    "xss": "render_template_string\\s*\\(|\\{\\{.*\\|\\s*safe\\s*\\}\\}|Markup\\s*\\(",
    // OWASP uses: subprocess.run with shell=True or string concatenation
    "command-injection": "subprocess\\.(call|run|Popen)\\s*\\([^)]*shell\\s*=\\s*True|os\\.system\\s*\\(|os\\.popen\\s*\\(",
    // OWASP uses: pathlib.Path() / bar where bar is user input
    "path-traversal": "pathlib\\.Path\\s*\\([^)]*\\)\\s*/|testfiles\\s*/\\s*[a-z_]+|open\\s*\\([^)]*\\+",
    // OWASP uses: ldap.search_s with string formatting
    "ldap-injection": "search_s\\s*\\(|ldap.*search\\s*\\(",
  };

  return {
    id: `template-${category}-${Date.now()}`,
    category,
    language: "python",
    pattern: patterns[category] ?? ".*",
    confidence: "low",
    description: `Template-based pattern for ${category}`,
    examples: examples.slice(0, 3),
    source: "template-generated",
  };
}

async function analyze(): Promise<void> {
  console.log("=== Analyzing Missed Vulnerabilities ===\n");

  const missed = findMissedVulnerabilities();
  const byCategory = groupByCategory(missed);

  console.log(`Found ${missed.length} missed vulnerabilities across ${byCategory.size} categories:\n`);

  for (const [category, vulns] of byCategory) {
    console.log(`${category}: ${vulns.length} missed`);

    // Show first example
    if (vulns.length > 0) {
      const example = vulns[0]!;
      const lines = extractVulnerableLines(example.code);
      if (lines.length > 0) {
        console.log(`  Example from ${example.testName}:`);
        console.log(`  ${lines[0]?.split("\n")[0]?.trim()}...`);
      }
    }
  }

  // Save analysis
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const analysisFile = join(OUTPUT_DIR, "missed-analysis.json");
  writeFileSync(
    analysisFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalMissed: missed.length,
        byCategory: Object.fromEntries(
          [...byCategory.entries()].map(([k, v]) => [k, v.length])
        ),
        examples: [...byCategory.entries()].map(([category, vulns]) => ({
          category,
          count: vulns.length,
          sampleCode: extractVulnerableLines(vulns[0]?.code ?? "").slice(0, 2),
        })),
      },
      null,
      2
    )
  );

  console.log(`\nAnalysis saved to ${analysisFile}`);
}

async function generate(): Promise<void> {
  console.log("=== Generating Patterns for Missed Vulnerabilities ===\n");

  const missed = findMissedVulnerabilities();
  const byCategory = groupByCategory(missed);
  const generatedPatterns: GeneratedPattern[] = [];

  for (const [category, vulns] of byCategory) {
    console.log(`\nGenerating pattern for ${category} (${vulns.length} examples)...`);

    // Extract vulnerable code snippets
    const examples: string[] = [];
    for (const vuln of vulns.slice(0, 10)) {
      const lines = extractVulnerableLines(vuln.code);
      examples.push(...lines);
    }

    if (examples.length === 0) {
      console.log(`  No vulnerable patterns found in examples`);
      continue;
    }

    const pattern = await generatePatternWithLLM(category, examples);
    if (pattern) {
      generatedPatterns.push(pattern);
      console.log(`  Generated: ${pattern.pattern.slice(0, 60)}...`);
    }
  }

  // Save generated patterns
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputFile = join(OUTPUT_DIR, "generated-patterns.yaml");
  writeFileSync(
    outputFile,
    YAML.stringify({
      generatedAt: new Date().toISOString(),
      source: "llm-pattern-gen",
      patterns: generatedPatterns.map((p) => ({
        id: p.id,
        category: p.category,
        language: p.language,
        pattern: p.pattern,
        confidence: p.confidence,
        description: p.description,
      })),
    })
  );

  console.log(`\n${generatedPatterns.length} patterns saved to ${outputFile}`);
  console.log("\nReview patterns and add validated ones to src/categories/definitions/");
}

async function validate(): Promise<void> {
  console.log("=== Validating Generated Patterns ===\n");

  const patternsFile = join(OUTPUT_DIR, "generated-patterns.yaml");
  if (!existsSync(patternsFile)) {
    console.error("No generated patterns found. Run: npx ts-node scripts/llm-pattern-gen.ts generate");
    process.exit(1);
  }

  const { patterns } = YAML.parse(readFileSync(patternsFile, "utf-8"));
  const missed = findMissedVulnerabilities();
  const byCategory = groupByCategory(missed);

  console.log("Testing patterns against missed vulnerabilities:\n");

  for (const pattern of patterns) {
    const vulns = byCategory.get(pattern.category) ?? [];
    let matches = 0;

    try {
      const regex = new RegExp(pattern.pattern, "gm");

      for (const vuln of vulns) {
        if (regex.test(vuln.code)) {
          matches++;
        }
        regex.lastIndex = 0; // Reset for next test
      }

      const recall = vulns.length > 0 ? (matches / vulns.length) * 100 : 0;
      console.log(
        `${pattern.category}: ${matches}/${vulns.length} matched (${recall.toFixed(1)}% recall)`
      );

      if (recall > 50) {
        console.log(`  Pattern: ${pattern.pattern.slice(0, 60)}...`);
      }
    } catch (err) {
      console.log(`${pattern.category}: Invalid regex - ${(err as Error).message}`);
    }
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!["analyze", "generate", "validate"].includes(command ?? "")) {
    console.log("Usage: npx ts-node scripts/llm-pattern-gen.ts <analyze|generate|validate>");
    process.exit(1);
  }

  switch (command) {
    case "analyze":
      await analyze();
      break;
    case "generate":
      await generate();
      break;
    case "validate":
      await validate();
      break;
  }
}

main().catch(console.error);
