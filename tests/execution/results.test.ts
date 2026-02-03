/**
 * Result Parser Tests
 * 
 * Tests parsing of test execution output into structured results.
 */

import { describe, it, expect } from "vitest";
import { parseResults } from "@/execution/results.js";
import type { Gap } from "@/core/scanner/types.js";

// Helper to create a minimal gap
function createGap(): Gap {
  return {
    categoryId: "sql-injection",
    categoryName: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "/src/db.ts",
    lineStart: 42,
    lineEnd: 42,
    columnStart: 0,
    columnEnd: 80,
    codeSnippet: "db.query(...)",
    patternId: "sql-string-concat",
    detectionType: "regex",
    message: "SQL injection vulnerability",
  };
}

describe("Result Parser", () => {
  const gap = createGap();

  describe("timeout handling", () => {
    it("returns error status on timeout", () => {
      const result = parseResults(
        {
          stdout: "",
          stderr: "",
          exitCode: 137,
          timedOut: true,
        },
        gap,
        "vitest"
      );

      expect(result.status).toBe("error");
      expect(result.summary).toContain("timed out");
    });
  });

  describe("Vitest parser", () => {
    it("parses successful exploit as confirmed", () => {
      const result = parseResults(
        {
          stdout: "",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.status).toBe("confirmed");
    });

    it("parses failed test as unconfirmed", () => {
      const result = parseResults(
        {
          stdout: "",
          stderr: "AssertionError: expected true to be false",
          exitCode: 1,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.status).toBe("unconfirmed");
    });

    it("parses JSON output with passed exploit test", () => {
      const jsonOutput = JSON.stringify({
        success: true,
        numPassedTests: 1,
        numFailedTests: 0,
        testResults: [
          {
            assertionResults: [
              { status: "passed", title: "exploit: boolean blind injection" },
            ],
          },
        ],
      });

      const result = parseResults(
        {
          stdout: jsonOutput,
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.status).toBe("confirmed");
      expect(result.summary).toContain("confirmed");
    });

    it("parses JSON output with failed test", () => {
      const jsonOutput = JSON.stringify({
        success: false,
        numPassedTests: 0,
        numFailedTests: 1,
        testResults: [
          {
            assertionResults: [
              {
                status: "failed",
                title: "exploit: injection",
                failureMessages: ["Input was sanitized"],
              },
            ],
          },
        ],
      });

      const result = parseResults(
        {
          stdout: jsonOutput,
          stderr: "",
          exitCode: 1,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.status).toBe("unconfirmed");
      expect(result.summary).toContain("sanitized");
    });
  });

  describe("Pytest parser", () => {
    it("parses passed tests as confirmed", () => {
      const result = parseResults(
        {
          stdout: "collected 2 items\n\ntest_exploit.py ..  [100%]\n\n2 passed in 0.05s",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "pytest"
      );

      expect(result.status).toBe("confirmed");
      expect(result.summary).toContain("2");
      expect(result.summary).toContain("passed");
    });

    it("parses failed tests as unconfirmed", () => {
      const result = parseResults(
        {
          stdout: "collected 2 items\n\ntest_exploit.py F.  [100%]\n\n1 failed, 1 passed",
          stderr: "",
          exitCode: 1,
          timedOut: false,
        },
        gap,
        "pytest"
      );

      expect(result.status).toBe("unconfirmed");
    });

    it("extracts assertion error from output", () => {
      const result = parseResults(
        {
          stdout: "collected 1 item\n\ntest_exploit.py F  [100%]\n\n1 failed\n\nFAILED test_exploit.py::test_injection\nAssertionError: Input was properly escaped",
          stderr: "",
          exitCode: 1,
          timedOut: false,
        },
        gap,
        "pytest"
      );

      expect(result.status).toBe("unconfirmed");
      expect(result.summary).toContain("escaped");
    });
  });

  describe("Go test parser", () => {
    it("parses PASS as confirmed", () => {
      const result = parseResults(
        {
          stdout: "=== RUN   TestExploit\n--- PASS: TestExploit (0.00s)\nPASS\nok\tpackage\t0.005s",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "go-test"
      );

      expect(result.status).toBe("confirmed");
    });

    it("parses FAIL as unconfirmed", () => {
      const result = parseResults(
        {
          stdout: "=== RUN   TestExploit\n--- FAIL: TestExploit (0.00s)\nFAIL\nexit status 1",
          stderr: "",
          exitCode: 1,
          timedOut: false,
        },
        gap,
        "go-test"
      );

      expect(result.status).toBe("unconfirmed");
    });
  });

  describe("payload extraction", () => {
    it("extracts SQL injection payloads", () => {
      const result = parseResults(
        {
          stdout: "Testing payload: \"' OR '1'='1\"\nQuery returned 100 rows",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.evidence?.payload).toContain("OR");
    });

    it("extracts UNION SELECT payloads", () => {
      const result = parseResults(
        {
          stdout: "UNION SELECT * FROM admin",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.evidence?.payload).toContain("UNION SELECT");
    });

    it("extracts XSS payloads", () => {
      const result = parseResults(
        {
          stdout: "Injecting: <script>alert('xss')</script>",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.evidence?.payload).toContain("<script>");
    });
  });

  describe("evidence collection", () => {
    it("includes stdout in evidence", () => {
      const result = parseResults(
        {
          stdout: "Detailed test output here",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.evidence?.stdout).toBe("Detailed test output here");
    });

    it("includes stderr in evidence", () => {
      const result = parseResults(
        {
          stdout: "",
          stderr: "Warning: unsafe operation",
          exitCode: 0,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.evidence?.stderr).toBe("Warning: unsafe operation");
    });

    it("includes exit code in evidence", () => {
      const result = parseResults(
        {
          stdout: "",
          stderr: "",
          exitCode: 42,
          timedOut: false,
        },
        gap,
        "vitest"
      );

      expect(result.evidence?.exitCode).toBe(42);
    });
  });
});
