#!/usr/bin/env npx ts-node
/**
 * OWASP Benchmark integration for accuracy testing.
 *
 * Usage:
 *   npx ts-node scripts/owasp-benchmark.ts setup     # Clone benchmark repos
 *   npx ts-node scripts/owasp-benchmark.ts run       # Run Pinata against benchmark
 *   npx ts-node scripts/owasp-benchmark.ts score     # Calculate accuracy score
 *
 * This script:
 * 1. Downloads OWASP Benchmark test suites (Java, Python)
 * 2. Runs Pinata scanner against test cases
 * 3. Compares results against expected findings
 * 4. Calculates TPR, FPR, and accuracy score
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const CACHE_DIR = ".pinata/cache/owasp-benchmark";
const RESULTS_DIR = ".pinata/benchmark-results";

const BENCHMARKS = {
  java: {
    repo: "https://github.com/OWASP-Benchmark/BenchmarkJava.git",
    dir: "BenchmarkJava",
    testDir: "src/main/java/org/owasp/benchmark/testcode",
    expectedResults: "expectedresults-1.2.csv",
  },
  python: {
    repo: "https://github.com/OWASP-Benchmark/BenchmarkPython.git",
    dir: "BenchmarkPython",
    testDir: "src/main/python/owasp/benchmark/testcode",
    expectedResults: "expectedresults-0.1.csv",
  },
};

// CWE to Pinata category mapping
const CWE_CATEGORY_MAP: Record<number, string> = {
  22: "path-traversal",
  78: "command-injection",
  79: "xss",
  89: "sql-injection",
  90: "ldap-injection",
  327: "timing-attack", // Weak crypto
  328: "timing-attack", // Weak hash
  330: "timing-attack", // Weak random
  501: "data-validation", // Trust boundary
  614: "auth-failures", // Secure cookie
  643: "xxe", // XPath injection
};

interface ExpectedResult {
  testName: string;
  category: string;
  cwe: number;
  isVulnerable: boolean;
}

interface ScanResult {
  file: string;
  detections: Array<{
    categoryId: string;
    line: number;
  }>;
}

interface BenchmarkScore {
  category: string;
  cwe: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  tpr: number; // True Positive Rate (recall)
  fpr: number; // False Positive Rate
  accuracy: number;
}

function setup(language: "java" | "python"): void {
  const config = BENCHMARKS[language];
  const repoDir = join(CACHE_DIR, config.dir);

  mkdirSync(CACHE_DIR, { recursive: true });

  if (existsSync(repoDir)) {
    console.log(`Updating ${config.dir}...`);
    execSync("git pull --ff-only", { cwd: repoDir, stdio: "inherit" });
  } else {
    console.log(`Cloning ${config.dir}...`);
    execSync(`git clone --depth 1 ${config.repo}`, { cwd: CACHE_DIR, stdio: "inherit" });
  }

  console.log(`\n${language} benchmark ready at ${repoDir}`);
}

function parseExpectedResults(language: "java" | "python"): ExpectedResult[] {
  const config = BENCHMARKS[language];
  const csvPath = join(CACHE_DIR, config.dir, config.expectedResults);

  if (!existsSync(csvPath)) {
    console.error(`Expected results file not found: ${csvPath}`);
    console.log("Try running: npm run owasp:setup");
    process.exit(1);
  }

  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#"));

  const results: ExpectedResult[] = [];

  for (const line of lines.slice(1)) {
    // Skip header
    const parts = line.split(",");
    if (parts.length < 4) continue;

    const testName = parts[0]?.trim() ?? "";
    const category = parts[1]?.trim() ?? "";
    const cwe = parseInt(parts[2]?.trim() ?? "0", 10);
    const isVulnerable = parts[3]?.trim().toLowerCase() === "true";

    results.push({ testName, category, cwe, isVulnerable });
  }

  return results;
}

async function runScan(language: "java" | "python"): Promise<ScanResult[]> {
  const config = BENCHMARKS[language];
  const testDir = join(CACHE_DIR, config.dir, config.testDir);

  if (!existsSync(testDir)) {
    console.error(`Test directory not found: ${testDir}`);
    console.log("Try running: npm run owasp:setup");
    process.exit(1);
  }

  console.log(`Scanning ${testDir}...`);

  // Run Pinata scanner
  const output = execSync(`npx pinata analyze ${testDir} --output json --quiet`, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large output
  });

  const jsonStart = output.indexOf("{");
  const jsonStr = output.slice(jsonStart);

  try {
    const scanResult = JSON.parse(jsonStr);
    return scanResult.gaps?.map((gap: { filePath: string; categoryId: string; lineStart: number }) => ({
      file: basename(gap.filePath),
      detections: [
        {
          categoryId: gap.categoryId,
          line: gap.lineStart,
        },
      ],
    })) ?? [];
  } catch {
    console.error("Failed to parse scan output");
    return [];
  }
}

function calculateScore(
  expected: ExpectedResult[],
  actual: ScanResult[]
): BenchmarkScore[] {
  // Group by CWE
  const byCwe = new Map<number, { expected: ExpectedResult[]; actual: Set<string> }>();

  for (const exp of expected) {
    const existing = byCwe.get(exp.cwe) ?? { expected: [], actual: new Set() };
    existing.expected.push(exp);
    byCwe.set(exp.cwe, existing);
  }

  // Map actual detections to test cases
  for (const result of actual) {
    // Extract test name from filename (e.g., "BenchmarkTest00001.java")
    const match = result.file.match(/BenchmarkTest(\d+)/);
    if (!match) continue;

    const testNum = parseInt(match[1]!, 10);
    const testName = `BenchmarkTest${testNum.toString().padStart(5, "0")}`;

    // Find which CWE this test belongs to
    for (const [cwe, data] of byCwe) {
      const category = CWE_CATEGORY_MAP[cwe];
      if (category && result.detections.some((d) => d.categoryId === category)) {
        data.actual.add(testName);
      }
    }
  }

  // Calculate metrics per CWE
  const scores: BenchmarkScore[] = [];

  for (const [cwe, data] of byCwe) {
    let tp = 0, fp = 0, tn = 0, fn = 0;

    for (const exp of data.expected) {
      const detected = data.actual.has(exp.testName);

      if (exp.isVulnerable && detected) tp++;
      else if (exp.isVulnerable && !detected) fn++;
      else if (!exp.isVulnerable && detected) fp++;
      else if (!exp.isVulnerable && !detected) tn++;
    }

    const tpr = tp + fn > 0 ? tp / (tp + fn) : 0;
    const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;
    const accuracy = tp + fp + tn + fn > 0 ? (tp + tn) / (tp + fp + tn + fn) : 0;

    scores.push({
      category: CWE_CATEGORY_MAP[cwe] ?? `CWE-${cwe}`,
      cwe,
      truePositives: tp,
      falsePositives: fp,
      trueNegatives: tn,
      falseNegatives: fn,
      tpr,
      fpr,
      accuracy,
    });
  }

  return scores.sort((a, b) => b.tpr - a.tpr);
}

function printScorecard(scores: BenchmarkScore[]): void {
  console.log("\n=== OWASP Benchmark Scorecard ===\n");
  console.log("Category                  CWE    TP    FP    TN    FN    TPR     FPR     Accuracy");
  console.log("-".repeat(90));

  let totalTP = 0, totalFP = 0, totalTN = 0, totalFN = 0;

  for (const score of scores) {
    console.log(
      `${score.category.padEnd(25)} ${String(score.cwe).padStart(4)} ` +
      `${String(score.truePositives).padStart(5)} ${String(score.falsePositives).padStart(5)} ` +
      `${String(score.trueNegatives).padStart(5)} ${String(score.falseNegatives).padStart(5)} ` +
      `${(score.tpr * 100).toFixed(1).padStart(6)}% ${(score.fpr * 100).toFixed(1).padStart(6)}% ` +
      `${(score.accuracy * 100).toFixed(1).padStart(8)}%`
    );

    totalTP += score.truePositives;
    totalFP += score.falsePositives;
    totalTN += score.trueNegatives;
    totalFN += score.falseNegatives;
  }

  console.log("-".repeat(90));

  const overallTPR = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
  const overallFPR = totalFP + totalTN > 0 ? totalFP / (totalFP + totalTN) : 0;
  const overallAccuracy = (totalTP + totalTN) / (totalTP + totalFP + totalTN + totalFN);

  console.log(
    `${"OVERALL".padEnd(25)} ${"".padStart(4)} ` +
    `${String(totalTP).padStart(5)} ${String(totalFP).padStart(5)} ` +
    `${String(totalTN).padStart(5)} ${String(totalFN).padStart(5)} ` +
    `${(overallTPR * 100).toFixed(1).padStart(6)}% ${(overallFPR * 100).toFixed(1).padStart(6)}% ` +
    `${(overallAccuracy * 100).toFixed(1).padStart(8)}%`
  );

  // OWASP Benchmark Score = TPR - FPR
  const benchmarkScore = overallTPR - overallFPR;
  console.log(`\nOWASP Benchmark Score: ${(benchmarkScore * 100).toFixed(1)}%`);
  console.log("(Score = TPR - FPR; 100% = perfect, 0% = random guessing, <0% = worse than random)");
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const language = (process.argv[3] as "java" | "python") ?? "python";

  if (!["setup", "run", "score"].includes(command ?? "")) {
    console.log("Usage: npx ts-node scripts/owasp-benchmark.ts <setup|run|score> [java|python]");
    process.exit(1);
  }

  switch (command) {
    case "setup":
      setup(language);
      break;

    case "run": {
      const expected = parseExpectedResults(language);
      const actual = await runScan(language);

      mkdirSync(RESULTS_DIR, { recursive: true });
      writeFileSync(
        join(RESULTS_DIR, `${language}-results.json`),
        JSON.stringify({ expected, actual }, null, 2)
      );

      const scores = calculateScore(expected, actual);
      printScorecard(scores);

      writeFileSync(
        join(RESULTS_DIR, `${language}-scores.json`),
        JSON.stringify(scores, null, 2)
      );
      break;
    }

    case "score": {
      const resultsFile = join(RESULTS_DIR, `${language}-results.json`);
      if (!existsSync(resultsFile)) {
        console.error("No results found. Run 'npx ts-node scripts/owasp-benchmark.ts run' first.");
        process.exit(1);
      }

      const { expected, actual } = JSON.parse(readFileSync(resultsFile, "utf-8"));
      const scores = calculateScore(expected, actual);
      printScorecard(scores);
      break;
    }
  }
}

main().catch(console.error);
