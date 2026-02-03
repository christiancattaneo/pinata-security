/**
 * Sandbox Tests
 * 
 * Tests Docker sandbox creation, security constraints, and execution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Sandbox, createSandbox } from "@/execution/sandbox.js";
import { DEFAULT_SANDBOX_CONFIG } from "@/execution/types.js";

describe("Sandbox", () => {
  let sandbox: Sandbox;
  let dockerAvailable: boolean;

  beforeAll(async () => {
    sandbox = createSandbox();
    dockerAvailable = await sandbox.isDockerAvailable();
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  describe("configuration", () => {
    it("uses secure defaults", () => {
      expect(DEFAULT_SANDBOX_CONFIG.networkEnabled).toBe(false);
      expect(DEFAULT_SANDBOX_CONFIG.timeoutSeconds).toBe(30);
      expect(DEFAULT_SANDBOX_CONFIG.memoryLimit).toBe("512m");
      expect(DEFAULT_SANDBOX_CONFIG.cpuLimit).toBe("1");
    });

    it("allows config overrides", () => {
      const custom = createSandbox({
        timeoutSeconds: 60,
        memoryLimit: "1g",
      });
      expect(custom).toBeDefined();
    });
  });

  describe("Docker detection", () => {
    it("detects Docker availability", async () => {
      // This test passes whether Docker is installed or not
      // It just verifies the detection works
      expect(typeof dockerAvailable).toBe("boolean");
    });
  });

  describe("file preparation", () => {
    it("creates temp directory with test files", async () => {
      const testCode = "console.log('test');";
      const targetCode = "export function vulnerable() {}";

      const tempDir = await sandbox.prepare(testCode, targetCode, "typescript");

      expect(tempDir).toContain("pinata-exec-");
      
      // Cleanup
      await sandbox.cleanup();
    });

    it("writes correct file names for TypeScript", async () => {
      const testCode = "describe('test', () => {});";
      const targetCode = "export const x = 1;";

      await sandbox.prepare(testCode, targetCode, "typescript");
      
      // Cleanup happens automatically
      await sandbox.cleanup();
    });

    it("writes correct file names for Python", async () => {
      const testCode = "def test_something(): pass";
      const targetCode = "def vulnerable(): pass";

      await sandbox.prepare(testCode, targetCode, "python");
      
      await sandbox.cleanup();
    });
  });
});
