import { describe, it, expect } from "vitest";
import {
  DetectionPatternSchema,
  DetectionResultSchema,
  PatternTypeSchema,
  PATTERN_TYPES,
} from "@/categories/schema/index.js";

describe("PatternSchema", () => {
  describe("PatternTypeSchema", () => {
    it("accepts valid pattern types", () => {
      for (const type of PATTERN_TYPES) {
        expect(PatternTypeSchema.parse(type)).toBe(type);
      }
    });

    it("contains expected types", () => {
      expect(PATTERN_TYPES).toContain("ast");
      expect(PATTERN_TYPES).toContain("regex");
      expect(PATTERN_TYPES).toContain("semantic");
    });
  });

  describe("DetectionPatternSchema", () => {
    const validPattern = {
      id: "sql-string-concat",
      type: "regex",
      language: "python",
      pattern: "execute\\s*\\(.*%.*\\)",
      confidence: "high",
      description: "Detects SQL queries built with string concatenation or formatting",
    };

    it("accepts valid pattern", () => {
      const result = DetectionPatternSchema.safeParse(validPattern);
      expect(result.success).toBe(true);
    });

    it("rejects invalid ID format", () => {
      const invalid = { ...validPattern, id: "SQL_Pattern" };
      const result = DetectionPatternSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects empty pattern string", () => {
      const invalid = { ...validPattern, pattern: "" };
      const result = DetectionPatternSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects short description", () => {
      const invalid = { ...validPattern, description: "Short" };
      const result = DetectionPatternSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("accepts optional negativePattern", () => {
      const withNegative = {
        ...validPattern,
        negativePattern: "execute\\s*\\(.*\\?.*\\)",
      };
      const result = DetectionPatternSchema.safeParse(withNegative);
      expect(result.success).toBe(true);
    });

    it("accepts optional frameworks", () => {
      const withFrameworks = {
        ...validPattern,
        frameworks: ["django", "flask"],
      };
      const result = DetectionPatternSchema.safeParse(withFrameworks);
      expect(result.success).toBe(true);
    });

    it("accepts AST pattern type", () => {
      const astPattern = {
        ...validPattern,
        type: "ast",
        pattern: 'call(func=attribute(attr="execute"))',
      };
      const result = DetectionPatternSchema.safeParse(astPattern);
      expect(result.success).toBe(true);
    });

    it("accepts semantic pattern type", () => {
      const semanticPattern = {
        ...validPattern,
        type: "semantic",
        pattern: "User input flows to SQL query without sanitization",
      };
      const result = DetectionPatternSchema.safeParse(semanticPattern);
      expect(result.success).toBe(true);
    });
  });

  describe("DetectionResultSchema", () => {
    const validResult = {
      patternId: "sql-string-concat",
      categoryId: "sql-injection",
      filePath: "src/db/queries.py",
      lineStart: 45,
      lineEnd: 47,
      codeSnippet: 'cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)',
      confidence: "high",
    };

    it("accepts valid detection result", () => {
      const result = DetectionResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it("rejects non-positive line numbers", () => {
      const invalid = { ...validResult, lineStart: 0 };
      const result = DetectionResultSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("accepts optional context", () => {
      const withContext = {
        ...validResult,
        context: {
          functionName: "get_user",
          className: "UserRepository",
        },
      };
      const result = DetectionResultSchema.safeParse(withContext);
      expect(result.success).toBe(true);
    });
  });
});
