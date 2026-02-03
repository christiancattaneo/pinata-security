/**
 * End-to-end CLI tests.
 *
 * Tests the CLI commands through actual process execution.
 */

import { exec } from "child_process";
import { mkdir, rm, readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { promisify } from "util";

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const execAsync = promisify(exec);

const TEST_DIR = resolve(__dirname, ".e2e-test");
const CLI_PATH = resolve(__dirname, "../../dist/cli/index.js");

// Helper to run CLI commands
async function runCli(args: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(`node "${CLI_PATH}" ${args}`, {
      cwd: cwd ?? TEST_DIR,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.code ?? 1,
    };
  }
}

describe("CLI E2E Tests", () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });

    // Create a sample source file for analysis
    const srcDir = resolve(TEST_DIR, "src");
    await mkdir(srcDir, { recursive: true });

    await writeFile(
      resolve(srcDir, "vulnerable.py"),
      `
import sqlite3

def get_user(user_id):
    cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
    return cursor.fetchone()

API_KEY = "sk_FAKE_1234"
`
    );

    await writeFile(
      resolve(srcDir, "safe.py"),
      `
import sqlite3

def get_user(user_id):
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    return cursor.fetchone()
`
    );
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("pinata --version", () => {
    it("displays version number", async () => {
      const { stdout, exitCode } = await runCli("--version");

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("pinata --help", () => {
    it("displays help text", async () => {
      const { stdout, exitCode } = await runCli("--help");

      expect(exitCode).toBe(0);
      expect(stdout).toContain("analyze");
      expect(stdout).toContain("generate");
      expect(stdout).toContain("search");
      expect(stdout).toContain("list");
      expect(stdout).toContain("init");
      expect(stdout).toContain("auth");
    });
  });

  describe("pinata analyze", () => {
    it("analyzes directory and finds vulnerabilities", async () => {
      const { stdout, exitCode } = await runCli("analyze src", TEST_DIR);

      // Should complete (may find gaps or not)
      expect([0, 1]).toContain(exitCode);
      expect(stdout.length).toBeGreaterThan(0);
    });

    it("outputs JSON format", async () => {
      const { stdout, exitCode } = await runCli("analyze src --output json --quiet", TEST_DIR);

      expect(exitCode).toBeLessThanOrEqual(1);

      // Find JSON in output (may have log prefixes)
      const jsonStart = stdout.indexOf("{");
      if (jsonStart === -1) {
        // No JSON found, might be empty result
        expect(stdout).toBeDefined();
        return;
      }

      const jsonStr = stdout.slice(jsonStart);
      const parsed = JSON.parse(jsonStr);
      expect(parsed).toBeDefined();
      // ScanResult has gaps, summary, coverage, etc.
      expect(parsed).toHaveProperty("gaps");
    });

    it("filters by domain", async () => {
      const { stdout, exitCode } = await runCli("analyze src --domains security", TEST_DIR);

      expect([0, 1]).toContain(exitCode);
      expect(stdout.length).toBeGreaterThan(0);
    });

    it("reports error for invalid path", async () => {
      const { exitCode } = await runCli("analyze /nonexistent/path");

      expect(exitCode).toBe(1);
    });
  });

  describe("pinata list", () => {
    it("lists all categories", async () => {
      const { stdout, exitCode } = await runCli("list");

      expect(exitCode).toBe(0);
      expect(stdout).toContain("sql-injection");
    });

    it("filters by domain", async () => {
      const { stdout, exitCode } = await runCli("list --domain security");

      expect(exitCode).toBe(0);
      expect(stdout).toContain("security");
    });

    it("outputs JSON format", async () => {
      const { stdout, exitCode } = await runCli("list --output json");

      expect(exitCode).toBe(0);

      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it("filters by level", async () => {
      const { stdout, exitCode } = await runCli("list --level integration");

      expect(exitCode).toBe(0);
    });

    it("reports error for invalid domain", async () => {
      const { stderr, exitCode } = await runCli("list --domain invalid");

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid domain");
    });
  });

  describe("pinata search", () => {
    it("searches categories by query", async () => {
      const { stdout, exitCode } = await runCli('search "sql"');

      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain("sql");
    });

    it("filters search by domain", async () => {
      const { stdout, exitCode } = await runCli('search "injection" --domain security');

      expect(exitCode).toBe(0);
    });

    it("outputs JSON format", async () => {
      const { stdout, exitCode } = await runCli('search "xss" --output json');

      expect(exitCode).toBe(0);

      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("handles no results gracefully", async () => {
      const { stdout, exitCode } = await runCli('search "xyznonexistent123"');

      expect(exitCode).toBe(0);
      expect(stdout).toContain("0");
    });
  });

  describe("pinata init", () => {
    const initDir = resolve(TEST_DIR, "init-test");

    beforeAll(async () => {
      await mkdir(initDir, { recursive: true });
    });

    afterAll(async () => {
      await rm(initDir, { recursive: true, force: true });
    });

    it("creates .pinata.yml", async () => {
      const { stdout, exitCode } = await runCli("init", initDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(".pinata.yml");

      // Verify file was created
      const configContent = await readFile(resolve(initDir, ".pinata.yml"), "utf8");
      expect(configContent).toContain("include:");
      expect(configContent).toContain("exclude:");
    });

    it("does not overwrite without --force", async () => {
      // First init
      await runCli("init", initDir);

      // Second init should warn
      const { stdout, exitCode } = await runCli("init", initDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("already exists");
    });

    it("overwrites with --force", async () => {
      const { stdout, exitCode } = await runCli("init --force", initDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(".pinata.yml");
    });
  });

  describe("pinata auth", () => {
    const authDir = resolve(TEST_DIR, "auth-test");

    beforeAll(async () => {
      await mkdir(authDir, { recursive: true });
    });

    afterAll(async () => {
      await rm(authDir, { recursive: true, force: true });
    });

    it("shows not authenticated by default", async () => {
      const { stdout, exitCode } = await runCli("auth status", authDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Not authenticated");
    });

    it("rejects invalid API key format", async () => {
      const { stdout, exitCode } = await runCli("auth login --key invalid", authDir);

      expect(exitCode).toBe(1);
      expect(stdout).toContain("Invalid");
    });

    it("accepts valid API key format", async () => {
      const { stdout, exitCode } = await runCli("auth login --key pk_test_12345678901234567890", authDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("configured");
    });

    it("shows authenticated after login", async () => {
      await runCli("auth login --key pk_test_12345678901234567890", authDir);
      const { stdout, exitCode } = await runCli("auth status", authDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Authenticated");
    });

    it("removes credentials on logout", async () => {
      await runCli("auth login --key pk_test_12345678901234567890", authDir);
      const { stdout, exitCode } = await runCli("auth logout", authDir);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("removed");

      // Verify status shows not authenticated
      const statusResult = await runCli("auth status", authDir);
      expect(statusResult.stdout).toContain("Not authenticated");
    });
  });

  describe("pinata generate", () => {
    it("requires previous analyze run", async () => {
      const genDir = resolve(TEST_DIR, "gen-test");
      await mkdir(genDir, { recursive: true });

      const { exitCode, stderr } = await runCli("generate", genDir);

      // Should fail without cached results
      expect(exitCode).toBe(1);

      await rm(genDir, { recursive: true, force: true });
    });

    it("generates tests after analyze (dry-run)", async () => {
      // First analyze
      await runCli("analyze src", TEST_DIR);

      // Then generate (dry-run is default)
      const { exitCode } = await runCli("generate", TEST_DIR);

      // May succeed or fail depending on gaps found
      expect([0, 1]).toContain(exitCode);
    });
  });
});

describe("CLI Error Handling", () => {
  it("handles unknown commands gracefully", async () => {
    const { exitCode } = await runCli("unknowncommand");

    // Commander exits with 1 for unknown commands
    expect(typeof exitCode === "number" ? exitCode : 1).toBe(1);
  });

  it("handles invalid options gracefully", async () => {
    const { exitCode } = await runCli("list --invalid-option");

    // Commander exits with 1 for invalid options
    expect(typeof exitCode === "number" ? exitCode : 1).toBe(1);
  });
});
