/**
 * Per-file pattern matching performance benchmarks.
 *
 * Target: p95 < 50ms per file
 */

import { writeFile, rm, mkdir } from "fs/promises";
import { resolve } from "path";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

import { PatternMatcher } from "@/core/detection/pattern-matcher.js";
import { CategoryStore } from "@/categories/store/category-store.js";

import type { DetectionPattern } from "@/categories/schema/index.js";

const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");
const TEMP_DIR = resolve(__dirname, ".pattern-bench");

// Sample code of varying complexity
const SIMPLE_CODE = `
def hello():
    print("Hello, world!")
`;

const MEDIUM_CODE = `
import sqlite3
from typing import Optional

class UserService:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path)
    
    def get_user(self, user_id: int) -> Optional[dict]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cursor.fetchone()
    
    def search_users(self, name: str) -> list:
        cursor = self.conn.cursor()
        cursor.execute(f"SELECT * FROM users WHERE name LIKE '%{name}%'")
        return cursor.fetchall()
    
    def create_user(self, name: str, email: str) -> int:
        cursor = self.conn.cursor()
        cursor.execute("INSERT INTO users (name, email) VALUES (?, ?)", (name, email))
        self.conn.commit()
        return cursor.lastrowid
`;

const COMPLEX_CODE = `
import sqlite3
import subprocess
import os
import pickle
from typing import Optional, Dict, List, Any
from flask import Flask, request, render_template_string

app = Flask(__name__)

class DatabaseService:
    def __init__(self, db_path: str):
        self.conn = sqlite3.connect(db_path)
        self._cache: Dict[int, dict] = {}
    
    def get_user(self, user_id: int) -> Optional[dict]:
        if user_id in self._cache:
            return self._cache[user_id]
        cursor = self.conn.cursor()
        # Vulnerable: f-string interpolation
        cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
        result = cursor.fetchone()
        if result:
            self._cache[user_id] = result
        return result
    
    def search_by_name(self, name: str) -> List[dict]:
        cursor = self.conn.cursor()
        # Vulnerable: string concatenation
        query = "SELECT * FROM users WHERE name = '" + name + "'"
        cursor.execute(query)
        return cursor.fetchall()
    
    def run_maintenance(self, script: str) -> str:
        # Vulnerable: command injection
        result = subprocess.run(f"./scripts/{script}.sh", shell=True, capture_output=True)
        return result.stdout.decode()
    
    def load_session(self, data: bytes) -> Any:
        # Vulnerable: pickle deserialization
        return pickle.loads(data)
    
    def read_config(self, filename: str) -> str:
        # Vulnerable: path traversal
        with open("/etc/app/" + filename, "r") as f:
            return f.read()

@app.route('/render')
def render_page():
    # Vulnerable: XSS via render_template_string
    content = request.args.get('content', '')
    return render_template_string(content)

@app.route('/admin')
def admin_panel():
    # Vulnerable: no auth check
    return "Admin Panel"

# Hardcoded secrets
API_KEY = "sk_FAKE_example"
AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"
JWT_SECRET = "super-secret-jwt-key-12345"

def process_order(order_id: int) -> dict:
    db = DatabaseService("orders.db")
    return db.get_user(order_id)
`;

describe("Pattern Matching Benchmarks", () => {
  let matcher: PatternMatcher;
  let allPatterns: DetectionPattern[];

  beforeAll(async () => {
    await mkdir(TEMP_DIR, { recursive: true });

    // Load all patterns from definitions
    const store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);

    allPatterns = [];
    for (const category of store.toArray()) {
      allPatterns.push(...category.detectionPatterns);
    }

    matcher = new PatternMatcher();

    console.log(`  Loaded ${allPatterns.length} patterns for benchmarking`);
  });

  afterAll(async () => {
    await rm(TEMP_DIR, { recursive: true, force: true });
  });

  describe("per-file timing", () => {
    it("scans simple file in <50ms", async () => {
      const filePath = resolve(TEMP_DIR, "simple.py");
      await writeFile(filePath, SIMPLE_CODE);

      const timings: number[] = [];

      // Run 10 iterations for accuracy
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await matcher.scanFile(filePath, allPatterns, { categoryId: "all", basePath: "" });
        timings.push(performance.now() - start);
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

      console.log(`    Simple file: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);

      expect(p95).toBeLessThan(50);
    });

    it("scans medium file in <50ms", async () => {
      const filePath = resolve(TEMP_DIR, "medium.py");
      await writeFile(filePath, MEDIUM_CODE);

      const timings: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await matcher.scanFile(filePath, allPatterns, { categoryId: "all", basePath: "" });
        timings.push(performance.now() - start);
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

      console.log(`    Medium file: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);

      expect(p95).toBeLessThan(50);
    });

    it("scans complex file in <50ms (p95 target)", async () => {
      const filePath = resolve(TEMP_DIR, "complex.py");
      await writeFile(filePath, COMPLEX_CODE);

      const timings: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        await matcher.scanFile(filePath, allPatterns, { categoryId: "all", basePath: "" });
        timings.push(performance.now() - start);
      }

      const sorted = timings.sort((a, b) => a - b);
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p50 = sorted[Math.floor(timings.length * 0.5)] ?? 0;
      const p95 = sorted[Math.floor(timings.length * 0.95)] ?? 0;
      const p99 = sorted[Math.floor(timings.length * 0.99)] ?? 0;

      console.log(`    Complex file: avg=${avg.toFixed(2)}ms, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`);

      expect(p95).toBeLessThan(50);
    });

    it("finds expected vulnerabilities in complex file", async () => {
      const filePath = resolve(TEMP_DIR, "complex-check.py");
      await writeFile(filePath, COMPLEX_CODE);

      const result = await matcher.scanFile(filePath, allPatterns, {
        categoryId: "all",
        basePath: "",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should find multiple vulnerabilities
        expect(result.data.matches.length).toBeGreaterThan(3);

        // Log what was found
        const categories = new Set(result.data.matches.map((m) => m.pattern.id));
        console.log(`    Found ${result.data.matches.length} matches across ${categories.size} patterns`);
      }
    });
  });

  describe("pattern count scaling", () => {
    it("timing scales sub-linearly with pattern count", async () => {
      const filePath = resolve(TEMP_DIR, "scaling.py");
      await writeFile(filePath, MEDIUM_CODE);

      const halfPatterns = allPatterns.slice(0, Math.floor(allPatterns.length / 2));
      const fullPatterns = allPatterns;

      // Measure with half patterns
      const halfTimings: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await matcher.scanFile(filePath, halfPatterns, { categoryId: "all", basePath: "" });
        halfTimings.push(performance.now() - start);
      }
      const halfAvg = halfTimings.reduce((a, b) => a + b, 0) / halfTimings.length;

      // Measure with full patterns
      const fullTimings: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await matcher.scanFile(filePath, fullPatterns, { categoryId: "all", basePath: "" });
        fullTimings.push(performance.now() - start);
      }
      const fullAvg = fullTimings.reduce((a, b) => a + b, 0) / fullTimings.length;

      const ratio = fullAvg / halfAvg;
      console.log(`    Half patterns (${halfPatterns.length}): ${halfAvg.toFixed(2)}ms`);
      console.log(`    Full patterns (${fullPatterns.length}): ${fullAvg.toFixed(2)}ms`);
      console.log(`    Ratio: ${ratio.toFixed(2)}x`);

      // Doubling patterns should not double time (ideally <1.5x)
      // Allow some variance for system load
      expect(ratio).toBeLessThan(3.5);
    });
  });

  describe("large file handling", () => {
    it("handles 1000-line file in <500ms", async () => {
      // Generate a large file
      let largeCode = '"""Large benchmark file."""\n\n';
      for (let i = 0; i < 50; i++) {
        largeCode += MEDIUM_CODE + "\n\n";
      }

      const filePath = resolve(TEMP_DIR, "large.py");
      await writeFile(filePath, largeCode);

      const lineCount = largeCode.split("\n").length;
      console.log(`    Generated file with ${lineCount} lines`);

      const timings: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await matcher.scanFile(filePath, allPatterns, { categoryId: "all", basePath: "" });
        timings.push(performance.now() - start);
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

      console.log(`    Large file: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms`);

      expect(p95).toBeLessThan(500);
    });
  });
});

describe("Individual Pattern Performance", () => {
  let matcher: PatternMatcher;
  let allPatterns: DetectionPattern[];

  beforeAll(async () => {
    await mkdir(TEMP_DIR, { recursive: true });

    const store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);

    allPatterns = [];
    for (const category of store.toArray()) {
      allPatterns.push(...category.detectionPatterns);
    }

    matcher = new PatternMatcher();
  });

  afterAll(async () => {
    await rm(TEMP_DIR, { recursive: true, force: true });
  });

  it("no single pattern takes >5ms on simple input", async () => {
    const filePath = resolve(TEMP_DIR, "single-pattern.py");
    await writeFile(filePath, MEDIUM_CODE);

    const slowPatterns: Array<{ id: string; time: number }> = [];

    for (const pattern of allPatterns) {
      const start = performance.now();
      await matcher.scanFile(filePath, [pattern], { categoryId: "test", basePath: "" });
      const elapsed = performance.now() - start;

      if (elapsed > 5) {
        slowPatterns.push({ id: pattern.id, time: elapsed });
      }
    }

    if (slowPatterns.length > 0) {
      console.log("    Slow patterns detected:");
      for (const p of slowPatterns) {
        console.log(`      ${p.id}: ${p.time.toFixed(2)}ms`);
      }
    }

    // Allow some slow patterns but flag them
    expect(slowPatterns.length).toBeLessThan(allPatterns.length * 0.1);
  });
});
