import { describe, it, expect, vi, beforeEach } from "vitest";
import { explainGap, explainGaps } from "../../src/ai/explainer.js";

// Mock the AI service
vi.mock("../../src/ai/service.js", () => ({
  createAIService: vi.fn(() => ({
    isConfigured: vi.fn(() => true),
    completeJSON: vi.fn(async () => ({
      success: true,
      data: { 
        summary: "Test explanation",
        explanation: "Detailed test explanation",
        risk: "Test risk",
        remediation: "Test fix",
        safeExample: "safe code",
        references: []
      },
      durationMs: 100
    }))
  }))
}));

describe("AI Explainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  describe("explaining gaps", () => {
    it("should explain a single gap", async () => {
      const gap = {
        filePath: "/src/auth/login.ts",
        description: "Missing authentication test",
        category: "Authentication",
        line: 42,
        column: 10,
        confidence: "high" as const,
        context: "function login(user, pass) { return true; }"
      };

      const result = await explainGap(gap);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary).toContain("explanation");
        expect(result.data.explanation).toBeDefined();
        expect(result.data.risk).toBeDefined();
        expect(result.data.remediation).toBeDefined();
      }
    });

    it("should explain multiple gaps", async () => {
      const gaps = [
        {
          filePath: "db.ts", 
          description: "SQL injection", 
          categoryId: "security-sql-injection",
          categoryName: "SQL Injection",
          lineStart: 1, 
          confidence: "high" as const,
          severity: "high" as const,
          patternId: "sql-injection",
          patternType: "regex" as const,
          codeSnippet: "query = 'SELECT * FROM users WHERE id = ' + userId"
        },
        {
          filePath: "input.ts",
          description: "No input validation",
          categoryId: "input-validation",
          categoryName: "Input Validation",
          lineStart: 2, 
          confidence: "medium" as const,
          severity: "medium" as const,
          patternId: "missing-validation",
          patternType: "ast" as const,
          codeSnippet: "function process(data) { return data.toUpperCase(); }"
        }
      ];

      const results = await explainGaps(gaps);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      
      // Check that each result is successful
      for (const result of results.values()) {
        expect(result.success).toBe(true);
      }
    });
  });

  describe("AI service integration", () => {
    it("should handle unconfigured AI service", async () => {
      // Mock unconfigured service
      const { createAIService } = await import("../../src/ai/service.js");
      vi.mocked(createAIService).mockReturnValue({
        isConfigured: vi.fn(() => false),
        completeJSON: vi.fn()
      });

      const gap = {
        filePath: "test.ts",
        description: "Test gap",
        category: "Security",
        line: 1, column: 1, confidence: "high" as const,
        context: "test code"
      };

      const result = await explainGap(gap);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });
  });
});