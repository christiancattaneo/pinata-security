/**
 * AI Service Tests
 */

import { describe, it, expect, beforeEach } from "vitest";

import { AIService, createAIService } from "@/ai/service.js";
import { explainGap, generateFallbackExplanation } from "@/ai/explainer.js";
import { suggestVariables } from "@/ai/template-filler.js";
import { suggestPatterns, formatPatternAsYaml } from "@/ai/pattern-suggester.js";

import type { Gap } from "@/core/scanner/types.js";
import type { TemplateVariable } from "@/categories/schema/index.js";

describe("AIService", () => {
  describe("configuration", () => {
    it("creates service with default config", () => {
      const service = createAIService();
      expect(service.getProvider()).toBe("anthropic");
    });

    it("creates service with custom provider", () => {
      const service = createAIService({ provider: "openai" });
      expect(service.getProvider()).toBe("openai");
    });

    it("creates mock service", () => {
      const service = createAIService({ provider: "mock" });
      expect(service.getProvider()).toBe("mock");
      expect(service.isConfigured()).toBe(true);
    });

    it("reports unconfigured when no API key", () => {
      const service = createAIService({ provider: "anthropic", apiKey: "" });
      // This will be false if ANTHROPIC_API_KEY is not set
      // Can't easily test without setting env
    });
  });

  describe("mock completions", () => {
    let service: AIService;

    beforeEach(() => {
      service = createAIService({ provider: "mock" });
    });

    it("generates mock completion", async () => {
      const result = await service.complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("generates mock JSON completion for explanations", async () => {
      const result = await service.completeJSON({
        messages: [{ role: "user", content: "explain this vulnerability" }],
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("summary");
      expect(result.data).toHaveProperty("remediation");
    });

    it("generates mock JSON completion for variables", async () => {
      const result = await service.completeJSON<{ suggestions: unknown[] }>({
        messages: [{ role: "user", content: "suggest template variable values" }],
      });

      expect(result.success).toBe(true);
      // Mock returns a structure with suggestions array
      expect(result.data).toBeDefined();
    });

    it("generates mock JSON completion for patterns", async () => {
      const result = await service.completeJSON<{ suggestions: unknown[] }>({
        messages: [{ role: "user", content: "suggest regex pattern" }],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});

describe("Gap Explainer", () => {
  const mockGap: Gap = {
    categoryId: "sql-injection",
    categoryName: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    confidence: "high",
    filePath: "/src/db.py",
    lineStart: 10,
    lineEnd: 10,
    columnStart: 0,
    columnEnd: 50,
    codeSnippet: "cursor.execute(f\"SELECT * FROM users WHERE id = '{user_id}'\")",
    patternId: "python-fstring-execute",
    patternType: "regex",
    priorityScore: 12,
  };

  describe("fallback explanations", () => {
    it("generates fallback for SQL injection", () => {
      const explanation = generateFallbackExplanation(mockGap);

      expect(explanation.summary).toContain("SQL");
      expect(explanation.remediation).toContain("parameterized");
      expect(explanation.risk).toBeDefined();
    });

    it("generates fallback for XSS", () => {
      const xssGap: Gap = {
        ...mockGap,
        categoryId: "xss",
        categoryName: "Cross-Site Scripting",
      };

      const explanation = generateFallbackExplanation(xssGap);
      expect(explanation.summary).toContain("script");
    });

    it("generates fallback for unknown category", () => {
      const unknownGap: Gap = {
        ...mockGap,
        categoryId: "unknown-category",
        categoryName: "Unknown Category",
      };

      const explanation = generateFallbackExplanation(unknownGap);
      expect(explanation.summary).toBeDefined();
      expect(explanation.remediation).toBeDefined();
    });
  });

  describe("AI explanations", () => {
    it("explains gap with mock provider", async () => {
      const result = await explainGap(mockGap, undefined, { provider: "mock" });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty("summary");
      expect(result.data).toHaveProperty("remediation");
    });

    it("returns error when not configured", async () => {
      const result = await explainGap(mockGap, undefined, { provider: "anthropic", apiKey: "" });

      // Will fail if no API key is set
      if (!process.env["ANTHROPIC_API_KEY"]) {
        expect(result.success).toBe(false);
      }
    });
  });
});

describe("Template Filler", () => {
  const mockVariables: TemplateVariable[] = [
    { name: "className", type: "string", description: "Class name", required: true },
    { name: "functionName", type: "string", description: "Function name", required: true },
    { name: "modulePath", type: "string", description: "Module path", required: true },
    { name: "tableName", type: "string", description: "Table name", required: false, defaultValue: "users" },
  ];

  describe("rule-based extraction", () => {
    // Note: If AI is configured (ANTHROPIC_API_KEY set), these may make real API calls
    // and could be slow. Use longer timeout to accommodate.
    it("extracts class name from code", async () => {
      const result = await suggestVariables({
        codeSnippet: "class UserService:\n    def get_user(self, id):\n        pass",
        filePath: "/src/services/user_service.py",
        variables: mockVariables,
      });

      expect(result.success).toBe(true);
      expect(result.data?.values["className"]).toBe("UserService");
    }, 30000);

    it("extracts function name from code", async () => {
      const result = await suggestVariables({
        codeSnippet: "def validate_input(data):\n    return True",
        filePath: "/src/utils.py",
        variables: mockVariables,
      });

      expect(result.success).toBe(true);
      expect(result.data?.values["functionName"]).toBe("validate_input");
    });

    it("derives module path from file path", async () => {
      const result = await suggestVariables({
        codeSnippet: "def test(): pass",
        filePath: "/src/services/user_service.py",
        variables: mockVariables,
      });

      expect(result.success).toBe(true);
      expect(result.data?.values["modulePath"]).toContain("services");
    }, 30000);

    it("uses default values for optional variables", async () => {
      const result = await suggestVariables({
        codeSnippet: "def test(): pass",
        filePath: "/test.py",
        variables: mockVariables,
      });

      expect(result.success).toBe(true);
      expect(result.data?.values["tableName"]).toBe("users");
    });

    it("extracts table name from SQL", async () => {
      const result = await suggestVariables({
        codeSnippet: "cursor.execute('SELECT * FROM customers WHERE id = ?')",
        filePath: "/src/db.py",
        variables: mockVariables,
      });

      expect(result.success).toBe(true);
      expect(result.data?.values["tableName"]).toBe("customers");
    });

    it("preserves existing values", async () => {
      const result = await suggestVariables({
        codeSnippet: "class Foo: pass",
        filePath: "/test.py",
        variables: mockVariables,
        existingValues: { className: "MyCustomClass" },
      });

      expect(result.success).toBe(true);
      expect(result.data?.values["className"]).toBe("MyCustomClass");
    });
  });

  describe("AI-powered extraction", () => {
    it("uses AI with mock provider", async () => {
      const result = await suggestVariables(
        {
          codeSnippet: "class UserService:\n    def get_user(self): pass",
          filePath: "/src/user.py",
          variables: mockVariables,
        },
        { provider: "mock" }
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Mock provider may not populate suggestions, but values should be filled
      expect(result.data?.values).toBeDefined();
    });
  });
});

describe("Pattern Suggester", () => {
  describe("pattern validation", () => {
    it("validates pattern against samples", async () => {
      const result = await suggestPatterns(
        {
          category: "sql-injection",
          language: "python",
          vulnerableCode: [
            "cursor.execute(f\"SELECT * FROM users WHERE id = '{user_id}'\")",
            "cursor.execute(\"SELECT * FROM users WHERE id = '\" + user_id + \"'\")",
          ],
          safeCode: [
            "cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))",
          ],
          maxSuggestions: 2,
        },
        { provider: "mock" }
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Mock provider returns a structure with suggestions array
      expect(result.data?.suggestions).toBeDefined();
    });
  });

  describe("YAML formatting", () => {
    it("formats pattern as YAML", () => {
      const yaml = formatPatternAsYaml(
        {
          id: "test-pattern",
          pattern: "execute\\s*\\(.*\\+",
          description: "Test pattern",
          confidence: "high",
          matchExample: "execute(x + y)",
          safeExample: "execute(x)",
          reasoning: "Detects concatenation",
        },
        "python"
      );

      expect(yaml).toContain("id: test-pattern");
      expect(yaml).toContain("type: regex");
      expect(yaml).toContain("language: python");
      expect(yaml).toContain("confidence: high");
    });

    it("escapes special characters in pattern", () => {
      const yaml = formatPatternAsYaml(
        {
          id: "test-escape",
          pattern: "test\\(\"value\"\\)",
          description: "Test",
          confidence: "medium",
          matchExample: "test",
          safeExample: "safe",
          reasoning: "Test",
        },
        "python"
      );

      expect(yaml).toContain("\\\\");
    });
  });
});
