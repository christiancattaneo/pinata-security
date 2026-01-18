import { describe, it, expect } from "vitest";
import {
  CategorySchema,
  CategoryBaseSchema,
  RiskDomainSchema,
  TestLevelSchema,
  PrioritySchema,
  SeveritySchema,
  LanguageSchema,
  RISK_DOMAINS,
  TEST_LEVELS,
  LANGUAGES,
} from "@/categories/schema/index.js";

describe("CategorySchema", () => {
  describe("RiskDomainSchema", () => {
    it("accepts valid risk domains", () => {
      for (const domain of RISK_DOMAINS) {
        expect(RiskDomainSchema.parse(domain)).toBe(domain);
      }
    });

    it("rejects invalid domain", () => {
      expect(() => RiskDomainSchema.parse("invalid")).toThrow();
    });

    it("contains expected domains", () => {
      expect(RISK_DOMAINS).toContain("security");
      expect(RISK_DOMAINS).toContain("data");
      expect(RISK_DOMAINS).toContain("concurrency");
    });
  });

  describe("TestLevelSchema", () => {
    it("accepts valid test levels", () => {
      for (const level of TEST_LEVELS) {
        expect(TestLevelSchema.parse(level)).toBe(level);
      }
    });

    it("contains expected levels", () => {
      expect(TEST_LEVELS).toContain("unit");
      expect(TEST_LEVELS).toContain("integration");
      expect(TEST_LEVELS).toContain("system");
      expect(TEST_LEVELS).toContain("chaos");
    });
  });

  describe("PrioritySchema", () => {
    it("accepts P0, P1, P2", () => {
      expect(PrioritySchema.parse("P0")).toBe("P0");
      expect(PrioritySchema.parse("P1")).toBe("P1");
      expect(PrioritySchema.parse("P2")).toBe("P2");
    });

    it("rejects invalid priority", () => {
      expect(() => PrioritySchema.parse("P3")).toThrow();
      expect(() => PrioritySchema.parse("high")).toThrow();
    });
  });

  describe("SeveritySchema", () => {
    it("accepts valid severities", () => {
      expect(SeveritySchema.parse("critical")).toBe("critical");
      expect(SeveritySchema.parse("high")).toBe("high");
      expect(SeveritySchema.parse("medium")).toBe("medium");
      expect(SeveritySchema.parse("low")).toBe("low");
    });
  });

  describe("LanguageSchema", () => {
    it("accepts valid languages", () => {
      for (const lang of LANGUAGES) {
        expect(LanguageSchema.parse(lang)).toBe(lang);
      }
    });

    it("contains expected languages", () => {
      expect(LANGUAGES).toContain("python");
      expect(LANGUAGES).toContain("typescript");
      expect(LANGUAGES).toContain("go");
    });
  });

  describe("CategoryBaseSchema", () => {
    const validCategory = {
      id: "sql-injection",
      version: 1,
      name: "SQL Injection",
      description: "Detect and test for SQL injection vulnerabilities in database queries",
      domain: "security",
      level: "integration",
      priority: "P0",
      severity: "critical",
      applicableLanguages: ["python", "typescript"],
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };

    it("accepts valid category", () => {
      const result = CategoryBaseSchema.safeParse(validCategory);
      expect(result.success).toBe(true);
    });

    it("rejects invalid ID format", () => {
      const invalid = { ...validCategory, id: "SQL_Injection" };
      const result = CategoryBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects ID starting with number", () => {
      const invalid = { ...validCategory, id: "1sql-injection" };
      const result = CategoryBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const invalid = { ...validCategory, name: "" };
      const result = CategoryBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects short description", () => {
      const invalid = { ...validCategory, description: "Short" };
      const result = CategoryBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects empty languages array", () => {
      const invalid = { ...validCategory, applicableLanguages: [] };
      const result = CategoryBaseSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("coerces date strings to Date objects", () => {
      const withStrings = {
        ...validCategory,
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01",
      };
      const result = CategoryBaseSchema.safeParse(withStrings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
      }
    });

    it("accepts optional CVEs", () => {
      const withCves = { ...validCategory, cves: ["CVE-2024-1234"] };
      const result = CategoryBaseSchema.safeParse(withCves);
      expect(result.success).toBe(true);
    });

    it("validates reference URLs", () => {
      const validRefs = { ...validCategory, references: ["https://example.com"] };
      expect(CategoryBaseSchema.safeParse(validRefs).success).toBe(true);

      const invalidRefs = { ...validCategory, references: ["not-a-url"] };
      expect(CategoryBaseSchema.safeParse(invalidRefs).success).toBe(false);
    });
  });
});
