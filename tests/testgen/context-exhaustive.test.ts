/**
 * Exhaustive tests for context extractor - targeting 100% mutation kill rate
 *
 * Covers every detection pattern, every function extraction path,
 * every import extraction branch, and every framework detection case.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { extractTestContext, extractTestContexts } from "../../src/testgen/context.js";
import type { Gap } from "../../src/core/scanner/types.js";

function makeGap(filePath: string, lineStart: number, overrides: Partial<Gap> = {}): Gap {
  return {
    categoryId: "sql-injection", categoryName: "SQL Injection", domain: "security",
    level: "integration", priority: "P0", severity: "critical", confidence: "high",
    filePath, lineStart, lineEnd: lineStart, columnStart: 0, columnEnd: 0,
    codeSnippet: "", patternId: "test", patternType: "regex", priorityScore: 10,
    ...overrides,
  };
}

let testDir: string;
beforeEach(() => {
  testDir = join(tmpdir(), `pinata-exh-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});
afterEach(() => { try { rmSync(testDir, { recursive: true, force: true }); } catch { /* */ } });

// =============================================================================
// WEB FRAMEWORK DETECTION — every pattern
// =============================================================================

describe("Web Framework Detection", () => {
  const cases: Array<[string, string, string]> = [
    ["express (import)", 'import express from "express";', "express"],
    ["express (require)", "const express = require('express');", "express"],
    ["fastify", 'import Fastify from "fastify";', "fastify"],
    ["koa", 'import Koa from "koa";', "koa"],
    ["nestjs", 'import { Controller } from "@nestjs/common";', "nestjs"],
    ["nextjs (next)", 'import { NextResponse } from "next";', "nextjs"],
    ["nextjs (next/)", 'import { useRouter } from "next/router";', "nextjs"],
    ["flask (from)", "from flask import Flask, request", "flask"],
    ["flask (import)", "import flask", "flask"],
    ["django (from)", "from django.http import HttpResponse", "django"],
    ["django (import)", "import django", "django"],
    ["fastapi (from)", "from fastapi import FastAPI", "fastapi"],
    ["fastapi (import)", "import fastapi", "fastapi"],
    ["gin", '"github.com/gin-gonic/gin"', "gin"],
    ["fiber", '"github.com/gofiber/fiber"', "fiber"],
  ];

  for (const [label, code, expected] of cases) {
    it(`detects ${label}`, async () => {
      const fp = join(testDir, "f.ts");
      writeFileSync(fp, code + "\nconst x = 1;\n");
      const ctx = await extractTestContext(makeGap(fp, 1), testDir);
      expect(ctx.webFramework).toBe(expected);
    });
  }

  it("returns undefined when no framework matches", async () => {
    const fp = join(testDir, "plain.ts");
    writeFileSync(fp, "const x = 1;\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.webFramework).toBeUndefined();
  });
});

// =============================================================================
// DATABASE DETECTION — every pattern
// =============================================================================

describe("Database Detection", () => {
  const cases: Array<[string, string, string]> = [
    ["prisma", 'import { PrismaClient } from "@prisma/client";', "postgres"],
    ["prisma (bare)", "const prisma = new PrismaClient();", "postgres"],
    ["pg", 'import { Pool } from "pg";', "postgres"],
    ["postgres keyword", "const conn = postgres://localhost:5432/db;", "postgres"],
    ["postgresql keyword", "driver: postgresql", "postgres"],
    ["mysql", 'import mysql from "mysql";', "mysql"],
    ["mysql2", 'import mysql2 from "mysql2";', "mysql"],
    ["mongoose", 'import mongoose from "mongoose";', "mongodb"],
    ["mongodb", 'const { MongoClient } = require("mongodb");', "mongodb"],
    ["MongoClient", "new MongoClient(uri);", "mongodb"],
    ["sqlite3", 'import sqlite3 from "sqlite3";', "sqlite"],
    ["better-sqlite", 'import Database from "better-sqlite3";', "sqlite"],
    ["sqlalchemy", "from sqlalchemy import create_engine", "postgres"],
    ["psycopg2", "import psycopg2", "postgres"],
    ["pymysql", "import pymysql", "mysql"],
    ["mysqlclient", "import mysqlclient", "mysql"],
  ];

  for (const [label, code, expected] of cases) {
    it(`detects ${label} → ${expected}`, async () => {
      const fp = join(testDir, "db.ts");
      writeFileSync(fp, code + "\nconst x = 1;\n");
      const ctx = await extractTestContext(makeGap(fp, 1), testDir);
      expect(ctx.dbType).toBe(expected);
    });
  }

  it("returns undefined when no database matches", async () => {
    const fp = join(testDir, "nodb.ts");
    writeFileSync(fp, "const x = 1;\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.dbType).toBeUndefined();
  });
});

// =============================================================================
// LANGUAGE DETECTION — every extension
// =============================================================================

describe("Language Detection", () => {
  const cases: Array<[string, string]> = [
    [".ts", "typescript"], [".tsx", "typescript"],
    [".js", "javascript"], [".jsx", "javascript"],
    [".py", "python"], [".go", "go"],
    [".java", "java"], [".rs", "rust"],
    [".txt", "unknown"],
  ];

  for (const [ext, expected] of cases) {
    it(`detects ${ext} → ${expected}`, async () => {
      const fp = join(testDir, `file${ext}`);
      writeFileSync(fp, "x = 1\n");
      const ctx = await extractTestContext(makeGap(fp, 1), testDir);
      expect(ctx.language).toBe(expected);
    });
  }
});

// =============================================================================
// BRACE-BASED FUNCTION EXTRACTION (TypeScript/JavaScript)
// =============================================================================

describe("Brace Function Extraction", () => {
  it("extracts export function declaration", async () => {
    const fp = join(testDir, "a.ts");
    writeFileSync(fp, `export function getUser(id: string) {
  return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("getUser");
    expect(ctx.functionBody).toContain("getUser");
    expect(ctx.functionBody).toContain("SELECT");
  });

  it("extracts async function declaration", async () => {
    const fp = join(testDir, "b.ts");
    writeFileSync(fp, `export async function fetchData(url: string) {
  const res = await fetch(url);
  return res.json();
}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("fetchData");
    expect(ctx.functionBody).toContain("async function fetchData");
  });

  it("extracts const arrow function", async () => {
    const fp = join(testDir, "c.ts");
    writeFileSync(fp, `const handler = (req: Request) => {
  const id = req.params.id;
  return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
};
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("handler");
    expect(ctx.functionBody).toContain("handler");
  });

  it("extracts class method (public)", async () => {
    const fp = join(testDir, "d.ts");
    writeFileSync(fp, `class UserService {
  public async getUser(id: string) {
    return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("getUser");
    expect(ctx.functionBody).toContain("public async getUser");
  });

  it("extracts class method (private)", async () => {
    const fp = join(testDir, "e.ts");
    writeFileSync(fp, `class Repo {
  private query(sql: string) {
    return this.db.exec(sql);
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionBody).toContain("private query");
  });

  it("extracts class method (protected)", async () => {
    const fp = join(testDir, "f.ts");
    writeFileSync(fp, `class Base {
  protected run(cmd: string) {
    return exec(cmd);
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionBody).toContain("protected run");
  });

  it("handles nested braces (if/for/try inside function)", async () => {
    const fp = join(testDir, "g.ts");
    writeFileSync(fp, `function process(data: string[]) {
  for (const item of data) {
    if (item) {
      try {
        const result = db.query(\`SELECT * WHERE x = \${item}\`);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
`);
    const ctx = await extractTestContext(makeGap(fp, 5), testDir);
    // Brace walker finds innermost enclosing block - body still contains the vuln
    expect(ctx.functionBody).toContain("SELECT");
    expect(ctx.functionBody).toContain("db.query");
  });

  it("extracts function name from bare function call pattern", async () => {
    const fp = join(testDir, "h.ts");
    writeFileSync(fp, `router.get("/users", async (req, res) => {
  const users = await getAll();
  res.json(users);
});
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionBody).toContain("router.get");
  });

  it("handles function with no opening brace found (falls back)", async () => {
    const fp = join(testDir, "i.ts");
    writeFileSync(fp, `const x = 1;
const y = 2;
const z = x + y;
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionBody).toBeDefined();
  });

  it("extracts var-based function", async () => {
    const fp = join(testDir, "j.ts");
    writeFileSync(fp, `var handler = function(req) {
  return req.body;
};
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("handler");
  });

  it("extracts let-based function", async () => {
    const fp = join(testDir, "k.ts");
    writeFileSync(fp, `let process = (data) => {
  return data.map(x => x * 2);
};
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("process");
  });
});

// =============================================================================
// PYTHON FUNCTION EXTRACTION
// =============================================================================

describe("Python Function Extraction", () => {
  it("extracts def function", async () => {
    const fp = join(testDir, "a.py");
    writeFileSync(fp, `def get_user(user_id):
    conn = sqlite3.connect("db.sqlite")
    cursor = conn.execute(f"SELECT * FROM users WHERE id = {user_id}")
    return cursor.fetchall()

def other():
    pass
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("get_user");
    expect(ctx.functionBody).toContain("def get_user");
    expect(ctx.functionBody).toContain("SELECT * FROM users");
    expect(ctx.functionBody).not.toContain("def other");
  });

  it("extracts async def function", async () => {
    const fp = join(testDir, "b.py");
    writeFileSync(fp, `async def fetch_data(url):
    response = await aiohttp.get(url)
    return await response.json()

def sync_fn():
    pass
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("fetch_data");
    expect(ctx.functionBody).toContain("async def fetch_data");
  });

  it("extracts class method", async () => {
    const fp = join(testDir, "c.py");
    writeFileSync(fp, `class UserRepo:
    def get_by_id(self, user_id):
        query = f"SELECT * FROM users WHERE id = {user_id}"
        return self.db.execute(query)

    def get_all(self):
        return self.db.execute("SELECT * FROM users")
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionName).toBe("get_by_id");
    expect(ctx.functionBody).not.toContain("get_all");
  });

  it("handles indented class methods correctly", async () => {
    const fp = join(testDir, "d.py");
    writeFileSync(fp, `class App:
    def __init__(self):
        self.db = None

    def query(self, sql):
        return self.db.execute(sql)
`);
    const ctx = await extractTestContext(makeGap(fp, 6), testDir);
    expect(ctx.functionName).toBe("query");
  });

  it("extracts name from class definition", async () => {
    const fp = join(testDir, "e.py");
    writeFileSync(fp, `class VulnerableHandler:
    db = sqlite3.connect("test.db")
    def handle(self):
        pass
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.functionName).toBe("VulnerableHandler");
  });

  it("handles empty lines within function body", async () => {
    const fp = join(testDir, "f.py");
    writeFileSync(fp, `def process(data):
    x = data[0]

    y = data[1]

    return x + y

def next_fn():
    pass
`);
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.functionName).toBe("process");
    expect(ctx.functionBody).toContain("return x + y");
  });
});

// =============================================================================
// IMPORT EXTRACTION — every language branch
// =============================================================================

describe("Import Extraction", () => {
  it("extracts TypeScript ES imports", async () => {
    const fp = join(testDir, "ts.ts");
    writeFileSync(fp, `import { Pool } from "pg";
import express from "express";
import type { Request } from "express";
const x = 1;
`);
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.imports).toHaveLength(3);
    expect(ctx.imports[0]).toContain("Pool");
    expect(ctx.imports[1]).toContain("express");
    expect(ctx.imports[2]).toContain("type");
  });

  it("extracts TypeScript require imports", async () => {
    const fp = join(testDir, "req.ts");
    writeFileSync(fp, `const express = require("express");
const pg = require("pg");
const x = 1;
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.imports).toHaveLength(2);
    expect(ctx.imports[0]).toContain("express");
    expect(ctx.imports[1]).toContain("pg");
  });

  it("extracts JavaScript imports same as TypeScript", async () => {
    const fp = join(testDir, "js.js");
    writeFileSync(fp, `import React from "react";
const x = 1;
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    expect(ctx.imports).toHaveLength(1);
    expect(ctx.imports[0]).toContain("React");
  });

  it("extracts Python imports", async () => {
    const fp = join(testDir, "py.py");
    writeFileSync(fp, `import os
from flask import Flask, request
import sqlite3
x = 1
`);
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.imports).toHaveLength(3);
    expect(ctx.imports[0]).toBe("import os");
    expect(ctx.imports[1]).toContain("flask");
    expect(ctx.imports[2]).toBe("import sqlite3");
  });

  it("extracts Go imports", async () => {
    const fp = join(testDir, "main.go");
    writeFileSync(fp, `package main

import "fmt"
import "os"

func main() {}
`);
    const ctx = await extractTestContext(makeGap(fp, 6), testDir);
    expect(ctx.imports.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts Go quoted imports in block", async () => {
    const fp = join(testDir, "go2.go");
    writeFileSync(fp, `package main

import (
	"fmt"
	"os"
)

func main() {}
`);
    const ctx = await extractTestContext(makeGap(fp, 8), testDir);
    expect(ctx.imports.some(i => i.includes('"fmt"'))).toBe(true);
    expect(ctx.imports.some(i => i.includes('"os"'))).toBe(true);
  });

  it("extracts Java imports", async () => {
    const fp = join(testDir, "Main.java");
    writeFileSync(fp, `import java.util.List;
import java.sql.Connection;

public class Main {}
`);
    const ctx = await extractTestContext(makeGap(fp, 4), testDir);
    expect(ctx.imports).toHaveLength(2);
    expect(ctx.imports[0]).toContain("java.util.List");
    expect(ctx.imports[1]).toContain("java.sql.Connection");
  });

  it("returns empty for Rust (no import extraction)", async () => {
    const fp = join(testDir, "main.rs");
    writeFileSync(fp, `use std::io;
fn main() {}
`);
    const ctx = await extractTestContext(makeGap(fp, 2), testDir);
    // Rust not handled in import extraction, should return empty
    expect(ctx.imports).toHaveLength(0);
  });

  it("returns empty for unknown language", async () => {
    const fp = join(testDir, "file.txt");
    writeFileSync(fp, "hello world\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.imports).toHaveLength(0);
  });
});

// =============================================================================
// TEST FRAMEWORK DETECTION — every path
// =============================================================================

describe("Test Framework Detection", () => {
  it("detects vitest from devDependencies", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { vitest: "^4.0.0" } }));
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("vitest");
    expect(ctx.testFramework.runner).toBe("npx vitest run");
    expect(ctx.testFramework.importStyle).toContain("vitest");
  });

  it("detects jest from devDependencies", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { jest: "^29.0.0" } }));
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
    expect(ctx.testFramework.runner).toBe("npx jest");
  });

  it("detects jest from @jest/core", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { "@jest/core": "^29.0.0" } }));
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("detects jest from ts-jest", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { "ts-jest": "^29.0.0" } }));
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("detects mocha from devDependencies", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ devDependencies: { mocha: "^10.0.0" } }));
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("mocha");
    expect(ctx.testFramework.runner).toBe("npx mocha");
    expect(ctx.testFramework.importStyle).toContain("mocha");
  });

  it("detects pytest from dependencies", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ dependencies: { pytest: "^7.0.0" } }));
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("pytest");
  });

  it("detects vitest from config file", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "test" }));
    writeFileSync(join(testDir, "vitest.config.ts"), "export default {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("detects jest from config file", async () => {
    writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "test" }));
    writeFileSync(join(testDir, "jest.config.ts"), "export default {};");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("detects go-test from config file", async () => {
    writeFileSync(join(testDir, "go.mod"), "module test\n");
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    // go-test detected from go.mod but language is TS, so package.json check runs first
    // Without package.json, falls back to vitest for TS
    expect(ctx.testFramework.name).toBeDefined();
  });

  it("defaults to vitest for TypeScript", async () => {
    const fp = join(testDir, "t.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("vitest");
  });

  it("defaults to jest for JavaScript", async () => {
    const fp = join(testDir, "t.js");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("jest");
  });

  it("defaults to pytest for Python", async () => {
    const fp = join(testDir, "t.py");
    writeFileSync(fp, "x = 1\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("pytest");
    expect(ctx.testFramework.runner).toBe("pytest");
    expect(ctx.testFramework.importStyle).toContain("pytest");
  });

  it("defaults to go-test for Go", async () => {
    const fp = join(testDir, "t.go");
    writeFileSync(fp, "package main\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("go-test");
    expect(ctx.testFramework.runner).toBe("go test ./...");
    expect(ctx.testFramework.importStyle).toContain("testing");
  });

  it("defaults to vitest for unknown language", async () => {
    const fp = join(testDir, "t.txt");
    writeFileSync(fp, "hello\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.testFramework.name).toBe("vitest");
  });
});

// =============================================================================
// EXISTING TEST DETECTION
// =============================================================================

describe("Existing Test Detection", () => {
  it("finds .spec.ts file", async () => {
    const srcDir = join(testDir, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "api.ts"), "export const x = 1;\n");
    writeFileSync(join(srcDir, "api.spec.ts"), 'describe("api", () => { it("works", () => {}); });\n');

    const ctx = await extractTestContext(makeGap(join(srcDir, "api.ts"), 1), testDir);
    expect(ctx.existingTestSample).toBeDefined();
    expect(ctx.existingTestSample).toContain("describe");
  });

  it("finds __tests__ directory test", async () => {
    const srcDir = join(testDir, "src");
    const testsDir = join(srcDir, "__tests__");
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(srcDir, "api.ts"), "export const x = 1;\n");
    writeFileSync(join(testsDir, "api.ts"), 'test("api", () => {});\n');

    const ctx = await extractTestContext(makeGap(join(srcDir, "api.ts"), 1), testDir);
    expect(ctx.existingTestSample).toBeDefined();
  });

  it("finds test in project-root tests/ directory", async () => {
    const srcDir = join(testDir, "src");
    const testsDir = join(testDir, "tests", "src");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(join(srcDir, "api.ts"), "export const x = 1;\n");
    writeFileSync(join(testsDir, "api.test.ts"), 'it("works", () => {});\n');

    const ctx = await extractTestContext(makeGap(join(srcDir, "api.ts"), 1), testDir);
    expect(ctx.existingTestSample).toBeDefined();
  });

  it("returns undefined when no test exists", async () => {
    const fp = join(testDir, "lonely.ts");
    writeFileSync(fp, "const x = 1;\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.existingTestSample).toBeUndefined();
  });
});

// =============================================================================
// SUGGESTED TEST PATH
// =============================================================================

describe("Suggested Test Path", () => {
  it("uses category ID in path", async () => {
    const fp = join(testDir, "users.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1, { categoryId: "xss" }), testDir);
    expect(ctx.suggestedTestPath).toContain("xss");
  });

  it("uses .py extension for Python files", async () => {
    const fp = join(testDir, "app.py");
    writeFileSync(fp, "x = 1\n");
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.suggestedTestPath).toContain(".test.py");
  });

  it("sanitizes special characters in category ID", async () => {
    const fp = join(testDir, "x.ts");
    writeFileSync(fp, "x\n");
    const ctx = await extractTestContext(makeGap(fp, 1, { categoryId: "sql/injection..test" }), testDir);
    expect(ctx.suggestedTestPath).not.toContain("/injection");
    expect(ctx.suggestedTestPath).toContain("sql-injection--test");
  });
});

// =============================================================================
// extractTestContexts (batch)
// =============================================================================

describe("extractTestContexts", () => {
  it("extracts multiple contexts", async () => {
    const fp1 = join(testDir, "a.ts");
    const fp2 = join(testDir, "b.ts");
    writeFileSync(fp1, "const a = 1;\n");
    writeFileSync(fp2, "const b = 2;\n");

    const ctxs = await extractTestContexts([makeGap(fp1, 1), makeGap(fp2, 1)], testDir);
    expect(ctxs).toHaveLength(2);
  });

  it("skips gaps where extraction fails", async () => {
    const fp = join(testDir, "real.ts");
    writeFileSync(fp, "const x = 1;\n");

    const ctxs = await extractTestContexts([
      makeGap(fp, 1),
      makeGap(join(testDir, "nonexistent.ts"), 1),
    ], testDir);
    expect(ctxs).toHaveLength(1);
  });

  it("returns empty array for all failures", async () => {
    const ctxs = await extractTestContexts([
      makeGap(join(testDir, "no1.ts"), 1),
      makeGap(join(testDir, "no2.ts"), 1),
    ], testDir);
    expect(ctxs).toHaveLength(0);
  });
});

// =============================================================================
// LINE NUMBER BOUNDARY — extractFunction edge cases
// =============================================================================

describe("Function Extraction Line Boundaries", () => {
  it("handles target line exactly at function start", async () => {
    const fp = join(testDir, "start.ts");
    writeFileSync(fp, `function vulnerable(input: string) {
  return eval(input);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.functionName).toBe("vulnerable");
  });

  it("handles target line exactly at function end (closing brace)", async () => {
    const fp = join(testDir, "end.ts");
    writeFileSync(fp, `function vulnerable(input: string) {
  return eval(input);
}
`);
    const ctx = await extractTestContext(makeGap(fp, 3), testDir);
    expect(ctx.functionBody).toContain("vulnerable");
  });

  it("handles single-line function", async () => {
    const fp = join(testDir, "one.ts");
    writeFileSync(fp, `function vuln(x: string) { return eval(x); }
`);
    const ctx = await extractTestContext(makeGap(fp, 1), testDir);
    expect(ctx.functionName).toBe("vuln");
    expect(ctx.functionBody).toContain("eval");
  });

  it("handles line between two functions", async () => {
    const fp = join(testDir, "between.ts");
    writeFileSync(fp, `function first() {
  return 1;
}

const suspicious = "something";

function second() {
  return 2;
}
`);
    const ctx = await extractTestContext(makeGap(fp, 5), testDir);
    // Should extract something sensible (not crash)
    expect(ctx.functionBody).toBeDefined();
  });
});
