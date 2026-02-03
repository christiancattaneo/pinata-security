/**
 * Synthetic corpus generator for benchmark testing.
 * Generates configurable numbers of source files with realistic patterns.
 */

import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";

export interface CorpusOptions {
  /** Total number of files to generate */
  fileCount: number;
  /** Language distribution (must sum to 1.0) */
  languages: {
    python: number;
    typescript: number;
    javascript: number;
  };
  /** Ratio of files containing detectable vulnerabilities (0.0-1.0) */
  vulnerableRatio: number;
  /** Average lines per file */
  avgLinesPerFile: number;
  /** Maximum directory nesting depth */
  maxNestingDepth: number;
  /** Random seed for reproducibility */
  seed?: number;
}

export interface CorpusStats {
  totalFiles: number;
  vulnerableFiles: number;
  safeFiles: number;
  byLanguage: Record<string, number>;
  totalLines: number;
  directories: number;
}

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

// Vulnerable code patterns by language
const VULNERABLE_PATTERNS = {
  python: [
    // SQL Injection
    `def get_user(user_id):
    conn = sqlite3.connect('db.sqlite')
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    return cursor.fetchone()`,

    // Command Injection
    `def run_command(cmd):
    import os
    os.system("ls " + cmd)
    return True`,

    // Path Traversal
    `def read_file(filename):
    with open("/data/" + filename, "r") as f:
        return f.read()`,

    // XSS (Flask)
    `@app.route('/render')
def render_page():
    content = request.args.get('content')
    return render_template_string(content)`,

    // Deserialization
    `def load_data(data):
    import pickle
    return pickle.loads(data)`,

    // Hardcoded Secret
    `API_KEY = "sk_FAKE_key_1234"
AWS_SECRET = "AKIAIOSFODNN7EXAMPLE"`,
  ],

  typescript: [
    // SQL Injection
    `async function getUser(userId: string) {
  const result = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);
  return result.rows[0];
}`,

    // XSS
    `function renderContent(content: string) {
  document.getElementById('app').innerHTML = content;
}`,

    // Command Injection
    `import { exec } from 'child_process';
function runCommand(cmd: string) {
  exec('ls ' + cmd, (err, stdout) => console.log(stdout));
}`,

    // Path Traversal
    `import { readFileSync } from 'fs';
function loadFile(name: string) {
  return readFileSync('/uploads/' + name, 'utf8');
}`,

    // SSRF
    `async function fetchUrl(url: string) {
  const response = await fetch(url);
  return response.json();
}`,

    // Hardcoded Secret
    `const API_KEY = "sk_FAKE_key_5678";
const JWT_SECRET = "super-secret-key-12345";`,
  ],

  javascript: [
    // SQL Injection
    `function getUser(userId) {
  return db.query("SELECT * FROM users WHERE id = '" + userId + "'");
}`,

    // XSS
    `function render(html) {
  element.innerHTML = html;
}`,

    // Eval
    `function calculate(expr) {
  return eval(expr);
}`,

    // Path Traversal
    `const fs = require('fs');
function readConfig(name) {
  return fs.readFileSync('./config/' + name);
}`,

    // Prototype Pollution
    `function merge(target, source) {
  for (const key in source) {
    target[key] = source[key];
  }
}`,
  ],
};

// Safe code patterns by language
const SAFE_PATTERNS = {
  python: [
    `def get_user(user_id: int) -> dict:
    """Fetch user by ID using parameterized query."""
    conn = sqlite3.connect('db.sqlite')
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    return cursor.fetchone()`,

    `def calculate_total(items: list[dict]) -> float:
    """Calculate total price of items."""
    return sum(item.get('price', 0) * item.get('quantity', 0) for item in items)`,

    `class UserService:
    def __init__(self, db):
        self.db = db
    
    def find_by_email(self, email: str):
        return self.db.query(User).filter_by(email=email).first()`,

    `def validate_input(data: dict) -> bool:
    required_fields = ['name', 'email', 'age']
    return all(field in data for field in required_fields)`,

    `async def fetch_data(url: str) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=30) as response:
            return await response.json()`,
  ],

  typescript: [
    `async function getUser(userId: number): Promise<User> {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return result.rows[0];
}`,

    `function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m] || m);
}`,

    `interface UserInput {
  name: string;
  email: string;
  age: number;
}

function validateUser(input: unknown): input is UserInput {
  if (typeof input !== 'object' || input === null) return false;
  const obj = input as Record<string, unknown>;
  return typeof obj.name === 'string' && typeof obj.email === 'string';
}`,

    `class OrderService {
  private readonly db: Database;
  
  constructor(db: Database) {
    this.db = db;
  }
  
  async createOrder(items: OrderItem[]): Promise<Order> {
    return this.db.transaction(async (tx) => {
      const order = await tx.orders.create({ items });
      return order;
    });
  }
}`,

    `export function calculateDiscount(price: number, percentage: number): number {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Invalid percentage');
  }
  return price * (1 - percentage / 100);
}`,
  ],

  javascript: [
    `function getUser(userId) {
  return db.query('SELECT * FROM users WHERE id = $1', [userId]);
}`,

    `function sanitize(input) {
  return DOMPurify.sanitize(input);
}`,

    `const validateEmail = (email) => {
  const re = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return re.test(email);
};`,

    `class Cache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  get(key) {
    return this.cache.get(key);
  }
  
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}`,

    `async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}`,
  ],
};

// File header templates
const HEADERS = {
  python: `#!/usr/bin/env python3
"""
Auto-generated benchmark file.
Module: {{module}}
"""

import sqlite3
import os
from typing import Optional, Dict, List

`,
  typescript: `/**
 * Auto-generated benchmark file.
 * Module: {{module}}
 */

import { Database } from './database';

`,
  javascript: `/**
 * Auto-generated benchmark file.
 * Module: {{module}}
 */

'use strict';

const db = require('./database');

`,
};

const EXTENSIONS = {
  python: ".py",
  typescript: ".ts",
  javascript: ".js",
};

/**
 * Generate a synthetic test corpus.
 */
export async function generateCorpus(
  targetDir: string,
  options: CorpusOptions
): Promise<CorpusStats> {
  const rng = new SeededRandom(options.seed ?? Date.now());

  // Validate language distribution
  const langSum =
    options.languages.python +
    options.languages.typescript +
    options.languages.javascript;
  if (Math.abs(langSum - 1.0) > 0.01) {
    throw new Error(`Language distribution must sum to 1.0, got ${langSum}`);
  }

  // Clean and create target directory
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });

  const stats: CorpusStats = {
    totalFiles: 0,
    vulnerableFiles: 0,
    safeFiles: 0,
    byLanguage: { python: 0, typescript: 0, javascript: 0 },
    totalLines: 0,
    directories: 1,
  };

  // Generate directory structure
  const dirs: string[] = [targetDir];
  const dirNames = ["src", "lib", "utils", "services", "handlers", "models", "api", "core"];

  for (let depth = 1; depth <= options.maxNestingDepth; depth++) {
    const parentCount = Math.min(dirs.length, 3);
    for (let i = 0; i < parentCount; i++) {
      const parent = rng.choice(dirs);
      const dirName = rng.choice(dirNames);
      const newDir = join(parent, `${dirName}_${depth}_${i}`);
      await mkdir(newDir, { recursive: true });
      dirs.push(newDir);
      stats.directories++;
    }
  }

  // Generate files
  for (let i = 0; i < options.fileCount; i++) {
    // Select language based on distribution
    const langRoll = rng.next();
    let language: "python" | "typescript" | "javascript";
    if (langRoll < options.languages.python) {
      language = "python";
    } else if (langRoll < options.languages.python + options.languages.typescript) {
      language = "typescript";
    } else {
      language = "javascript";
    }

    // Decide if vulnerable
    const isVulnerable = rng.next() < options.vulnerableRatio;

    // Select directory
    const dir = rng.choice(dirs);

    // Generate file name
    const fileNames = ["user", "order", "auth", "payment", "product", "cart", "account", "config"];
    const fileName = `${rng.choice(fileNames)}_${i}${EXTENSIONS[language]}`;
    const filePath = join(dir, fileName);

    // Generate content
    const moduleName = fileName.replace(/\.[^.]+$/, "");
    let content = HEADERS[language].replace("{{module}}", moduleName);

    // Add lines to reach target
    const targetLines = rng.int(
      Math.floor(options.avgLinesPerFile * 0.5),
      Math.floor(options.avgLinesPerFile * 1.5)
    );

    // Add patterns
    const patterns = isVulnerable
      ? VULNERABLE_PATTERNS[language]
      : SAFE_PATTERNS[language];

    // Add 2-4 code blocks
    const blockCount = rng.int(2, 4);
    for (let b = 0; b < blockCount; b++) {
      content += "\n" + rng.choice(patterns) + "\n";
    }

    // Pad with comments to reach target lines
    const currentLines = content.split("\n").length;
    if (currentLines < targetLines) {
      content += "\n# Additional code follows\n".repeat(
        Math.floor((targetLines - currentLines) / 2)
      );
    }

    await writeFile(filePath, content, "utf8");

    stats.totalFiles++;
    stats.byLanguage[language]++;
    stats.totalLines += content.split("\n").length;

    if (isVulnerable) {
      stats.vulnerableFiles++;
    } else {
      stats.safeFiles++;
    }
  }

  return stats;
}

/**
 * Generate a small corpus for quick tests.
 */
export async function generateSmallCorpus(targetDir: string): Promise<CorpusStats> {
  return generateCorpus(targetDir, {
    fileCount: 100,
    languages: { python: 0.4, typescript: 0.4, javascript: 0.2 },
    vulnerableRatio: 0.3,
    avgLinesPerFile: 50,
    maxNestingDepth: 2,
    seed: 12345,
  });
}

/**
 * Generate a medium corpus for standard benchmarks.
 */
export async function generateMediumCorpus(targetDir: string): Promise<CorpusStats> {
  return generateCorpus(targetDir, {
    fileCount: 1000,
    languages: { python: 0.35, typescript: 0.45, javascript: 0.2 },
    vulnerableRatio: 0.25,
    avgLinesPerFile: 80,
    maxNestingDepth: 4,
    seed: 54321,
  });
}

/**
 * Generate a large corpus for stress testing.
 */
export async function generateLargeCorpus(targetDir: string): Promise<CorpusStats> {
  return generateCorpus(targetDir, {
    fileCount: 10000,
    languages: { python: 0.3, typescript: 0.5, javascript: 0.2 },
    vulnerableRatio: 0.2,
    avgLinesPerFile: 100,
    maxNestingDepth: 6,
    seed: 98765,
  });
}
