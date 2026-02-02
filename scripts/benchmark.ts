#!/usr/bin/env npx tsx
/**
 * Benchmark runner script.
 *
 * Usage:
 *   npx tsx scripts/benchmark.ts          # Run all benchmarks
 *   npx tsx scripts/benchmark.ts --quick  # Run only 100-file benchmark
 *   npx tsx scripts/benchmark.ts --full   # Include 10k file benchmark
 */

import { spawn } from "child_process";

const args = process.argv.slice(2);
const isQuick = args.includes("--quick");
const isFull = args.includes("--full");

const testPatterns: string[] = [];

if (isQuick) {
  testPatterns.push("100 files");
} else if (isFull) {
  // Run all including the skipped 10k test
  testPatterns.push("benchmarks");
} else {
  // Default: run main benchmarks but skip 10k
  testPatterns.push("benchmarks");
}

console.log("🏃 Running Pinata benchmarks...\n");

const vitestArgs = [
  "test",
  ...testPatterns.map((p) => `tests/${p}`),
  "--reporter=verbose",
];

if (isFull) {
  vitestArgs.push("--no-file-parallelism");
}

const proc = spawn("npm", vitestArgs, {
  stdio: "inherit",
  cwd: process.cwd(),
});

proc.on("close", (code) => {
  if (code === 0) {
    console.log("\n✅ All benchmarks passed!");
  } else {
    console.log(`\n❌ Benchmarks failed with code ${code}`);
  }
  process.exit(code ?? 1);
});
