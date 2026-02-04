/**
 * Tests for project type detection
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  detectProjectType,
  shouldSkipCategory,
  getCategoryWeight,
  getProjectTypeDescription,
  SCORING_ADJUSTMENTS,
} from "../../../src/core/detection/project-type.js";

describe("Project Type Detection", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `pinata-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("detectProjectType", () => {
    it("detects CLI projects by bin field in package.json", async () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "my-cli", bin: { "my-cli": "./dist/cli.js" } })
      );

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("cli");
      expect(result.confidence).toBe("high");
      expect(result.evidence).toContain('package.json has "bin" field');
    });

    it("detects web server projects by express dependency", async () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "my-server", dependencies: { express: "^4.0.0" } })
      );

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("web-server");
      expect(result.confidence).toBe("high");
      expect(result.evidence).toContain("Uses express");
    });

    it("detects SSR framework projects by Next.js config", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "my-app" }));
      writeFileSync(join(testDir, "next.config.js"), "module.exports = {};");

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("ssr-framework");
      expect(result.confidence).toBe("high");
      expect(result.evidence).toContain("Has next.config.js");
    });

    it("detects monorepo projects by workspaces field", async () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "my-monorepo", workspaces: ["packages/*"] })
      );

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("monorepo");
      expect(result.confidence).toBe("high");
      expect(result.evidence).toContain('package.json has "workspaces" field');
    });

    it("detects desktop projects by Electron dependency", async () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "my-app", dependencies: { electron: "^28.0.0" } })
      );

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("desktop");
      expect(result.confidence).toBe("high");
      expect(result.frameworks).toContain("electron");
    });

    it("detects mobile projects by React Native dependency", async () => {
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({ name: "my-app", dependencies: { "react-native": "^0.72.0" } })
      );

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("mobile");
      expect(result.confidence).toBe("high");
    });

    it("detects serverless projects by serverless.yml", async () => {
      writeFileSync(join(testDir, "serverless.yml"), "service: my-service");

      const result = await detectProjectType(testDir);

      expect(result.type).toBe("serverless");
      expect(result.confidence).toBe("high");
    });

    it("returns unknown with low confidence for empty directory", async () => {
      const result = await detectProjectType(testDir);

      expect(result.type).toBe("unknown");
      expect(result.confidence).toBe("low");
    });

    it("detects languages from config files", async () => {
      writeFileSync(join(testDir, "package.json"), JSON.stringify({ name: "test" }));
      writeFileSync(join(testDir, "tsconfig.json"), "{}");

      const result = await detectProjectType(testDir);

      expect(result.languages).toContain("typescript");
      expect(result.languages).toContain("javascript");
    });

    it("prioritizes higher-weight patterns", async () => {
      // Both CLI (bin field = 10 weight) and web-server (express = 10 weight)
      // CLI wins if both present because bin is checked first
      writeFileSync(
        join(testDir, "package.json"),
        JSON.stringify({
          name: "hybrid",
          bin: { cli: "./cli.js" },
          dependencies: { express: "^4.0.0" },
        })
      );

      const result = await detectProjectType(testDir);

      // With equal weights, the first matched type wins
      expect(["cli", "web-server"]).toContain(result.type);
      expect(result.confidence).toBe("high");
    });
  });

  describe("shouldSkipCategory", () => {
    it("skips blocking-io for CLI projects", () => {
      expect(shouldSkipCategory("blocking-io", "cli")).toBe(true);
    });

    it("skips blocking-io for script projects", () => {
      expect(shouldSkipCategory("blocking-io", "script")).toBe(true);
    });

    it("does not skip blocking-io for web-server projects", () => {
      expect(shouldSkipCategory("blocking-io", "web-server")).toBe(false);
    });

    it("skips sql-injection for frontend-spa projects", () => {
      expect(shouldSkipCategory("sql-injection", "frontend-spa")).toBe(true);
    });

    it("does not skip sql-injection for web-server projects", () => {
      expect(shouldSkipCategory("sql-injection", "web-server")).toBe(false);
    });

    it("skips ssrf for CLI projects", () => {
      expect(shouldSkipCategory("ssrf", "cli")).toBe(true);
    });

    it("skips csrf for API projects", () => {
      expect(shouldSkipCategory("csrf", "api")).toBe(true);
    });

    it("returns false for unknown categories", () => {
      expect(shouldSkipCategory("nonexistent-category", "cli")).toBe(false);
    });
  });

  describe("getCategoryWeight", () => {
    it("returns 0 for skipped categories", () => {
      expect(getCategoryWeight("blocking-io", "cli")).toBe(0);
    });

    it("returns 1.5 for higher-weight categories", () => {
      expect(getCategoryWeight("sql-injection", "web-server")).toBe(1.5);
      expect(getCategoryWeight("ssrf", "api")).toBe(1.5);
    });

    it("returns 0.5 for lower-weight categories", () => {
      expect(getCategoryWeight("command-injection", "cli")).toBe(0.5);
      expect(getCategoryWeight("xss", "api")).toBe(0.5);
    });

    it("returns 1.0 for categories with no adjustment", () => {
      expect(getCategoryWeight("nonexistent-category", "cli")).toBe(1.0);
    });

    it("returns 1.0 for project types not in adjustment", () => {
      expect(getCategoryWeight("sql-injection", "library")).toBe(1.0);
    });
  });

  describe("getProjectTypeDescription", () => {
    it("returns description for CLI", () => {
      expect(getProjectTypeDescription("cli")).toBe("Command-line tool");
    });

    it("returns description for web-server", () => {
      expect(getProjectTypeDescription("web-server")).toBe("Web server (Express, Fastify, etc.)");
    });

    it("returns description for unknown", () => {
      expect(getProjectTypeDescription("unknown")).toBe("Unknown project type");
    });
  });

  describe("SCORING_ADJUSTMENTS", () => {
    it("has adjustments for multiple categories", () => {
      expect(SCORING_ADJUSTMENTS.length).toBeGreaterThan(5);
    });

    it("includes blocking-io adjustment", () => {
      const blockingIo = SCORING_ADJUSTMENTS.find((a) => a.categoryId === "blocking-io");
      expect(blockingIo).toBeDefined();
      expect(blockingIo?.skip).toContain("cli");
      expect(blockingIo?.skip).toContain("script");
    });

    it("includes sql-injection adjustment", () => {
      const sqlInjection = SCORING_ADJUSTMENTS.find((a) => a.categoryId === "sql-injection");
      expect(sqlInjection).toBeDefined();
      expect(sqlInjection?.skip).toContain("frontend-spa");
      expect(sqlInjection?.higherWeight).toContain("web-server");
    });
  });
});
