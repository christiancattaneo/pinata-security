/**
 * Tests for test generation context extractor
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { extractTestContext } from "../../src/testgen/context.js";
import type { Gap } from "../../src/core/scanner/types.js";

function makeGap(overrides: Partial<Gap> = {}): Gap {
  return {
    categoryId: "sql-injection",
    categoryName: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "",
    lineStart: 5,
    lineEnd: 5,
    columnStart: 0,
    columnEnd: 0,
    codeSnippet: "",
    patternId: "ts-template-sql-select",
    patternType: "regex",
    priorityScore: 10,
    ...overrides,
  };
}

describe("Context Extractor", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pinata-ctx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("extracts function body surrounding the vulnerable line", async () => {
    const filePath = join(testDir, "users.ts");
    writeFileSync(filePath, `import { db } from "./db";

export async function getUserById(id: string) {
  const query = \`SELECT * FROM users WHERE id = \${id}\`;
  return db.query(query);
}

export function otherFunction() {
  return "safe";
}
`);

    const gap = makeGap({ filePath, lineStart: 4 });
    const ctx = await extractTestContext(gap, testDir);

    expect(ctx.functionBody).toContain("getUserById");
    expect(ctx.functionBody).toContain("SELECT * FROM users");
    expect(ctx.functionName).toBe("getUserById");
  });

  it("extracts imports from the source file", async () => {
    const filePath = join(testDir, "api.ts");
    writeFileSync(filePath, `import { Request, Response } from "express";
import { db } from "../lib/db";

export function handler(req: Request, res: Response) {
  const result = db.query(\`SELECT * FROM users WHERE id = \${req.params.id}\`);
  res.json(result);
}
`);

    const gap = makeGap({ filePath, lineStart: 5 });
    const ctx = await extractTestContext(gap, testDir);

    expect(ctx.imports).toContain('import { Request, Response } from "express";');
    expect(ctx.imports).toContain('import { db } from "../lib/db";');
  });

  it("detects TypeScript language from file extension", async () => {
    const filePath = join(testDir, "test.ts");
    writeFileSync(filePath, "const x = 1;\n");
    const gap = makeGap({ filePath, lineStart: 1 });
    const ctx = await extractTestContext(gap, testDir);
    expect(ctx.language).toBe("typescript");
  });

  it("detects Python language from file extension", async () => {
    const filePath = join(testDir, "test.py");
    writeFileSync(filePath, "x = 1\n");
    const gap = makeGap({ filePath, lineStart: 1 });
    const ctx = await extractTestContext(gap, testDir);
    expect(ctx.language).toBe("python");
  });

  it("detects vitest framework from package.json", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({
      devDependencies: { vitest: "^4.0.0" }
    }));
    const filePath = join(testDir, "test.ts");
    writeFileSync(filePath, "const x = 1;\n");

    const gap = makeGap({ filePath, lineStart: 1 });
    const ctx = await extractTestContext(gap, testDir);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("detects jest framework from package.json", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({
      devDependencies: { jest: "^29.0.0" }
    }));
    const filePath = join(testDir, "test.ts");
    writeFileSync(filePath, "const x = 1;\n");

    const gap = makeGap({ filePath, lineStart: 1 });
    const ctx = await extractTestContext(gap, testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("detects Express web framework from imports", async () => {
    const filePath = join(testDir, "server.ts");
    writeFileSync(filePath, `import express from "express";
const app = express();
app.get("/api/users", (req, res) => {
  res.json({ id: req.params.id });
});
`);

    const gap = makeGap({ filePath, lineStart: 4 });
    const ctx = await extractTestContext(gap, testDir);
    expect(ctx.webFramework).toBe("express");
  });

  it("detects PostgreSQL from imports", async () => {
    const filePath = join(testDir, "db.ts");
    writeFileSync(filePath, `import { Pool } from "pg";
const pool = new Pool();
export async function query(text: string) {
  return pool.query(text);
}
`);

    const gap = makeGap({ filePath, lineStart: 4 });
    const ctx = await extractTestContext(gap, testDir);
    expect(ctx.dbType).toBe("postgres");
  });

  it("generates a suggested test path", async () => {
    const filePath = join(testDir, "users.ts");
    writeFileSync(filePath, "const x = 1;\n");

    const gap = makeGap({ filePath, lineStart: 1, categoryId: "sql-injection" });
    const ctx = await extractTestContext(gap, testDir);

    expect(ctx.suggestedTestPath).toContain("tests/security/");
    expect(ctx.suggestedTestPath).toContain("sql-injection");
    expect(ctx.suggestedTestPath).toContain("users.test.ts");
  });

  it("extracts Python function body with indent-based detection", async () => {
    const filePath = join(testDir, "app.py");
    writeFileSync(filePath, `from flask import Flask, request
import sqlite3

app = Flask(__name__)

@app.route("/users")
def get_user():
    user_id = request.args.get("id")
    conn = sqlite3.connect("db.sqlite")
    cursor = conn.execute(f"SELECT * FROM users WHERE id = {user_id}")
    return cursor.fetchall()

def other():
    return "safe"
`);

    const gap = makeGap({ filePath, lineStart: 10 });
    const ctx = await extractTestContext(gap, testDir);

    expect(ctx.functionBody).toContain("get_user");
    expect(ctx.functionBody).toContain("SELECT * FROM users");
    expect(ctx.functionName).toBe("get_user");
    expect(ctx.webFramework).toBe("flask");
    expect(ctx.dbType).toBe("sqlite");
  });

  it("finds existing test file for style matching", async () => {
    const srcDir = join(testDir, "src");
    mkdirSync(srcDir);

    const filePath = join(srcDir, "users.ts");
    writeFileSync(filePath, "export function getUser() { return 1; }\n");

    const testFile = join(srcDir, "users.test.ts");
    writeFileSync(testFile, `import { describe, it, expect } from "vitest";
import { getUser } from "./users";

describe("getUser", () => {
  it("returns user", () => {
    expect(getUser()).toBe(1);
  });
});
`);

    const gap = makeGap({ filePath, lineStart: 1 });
    const ctx = await extractTestContext(gap, testDir);

    expect(ctx.existingTestSample).toBeDefined();
    expect(ctx.existingTestSample).toContain("describe");
    expect(ctx.existingTestSample).toContain("getUser");
  });
});
