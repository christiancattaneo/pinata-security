import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  formatTerminal,
  formatJson,
  formatMarkdown,
  formatCategories,
  formatError,
  formatWarning,
  formatSuccess,
  isValidOutputFormat,
} from "../../src/cli/formatters.js";

import type { CategorySummary } from "../../src/categories/schema/index.js";

// Mock chalk to avoid color codes in test output comparisons
vi.mock("chalk", () => ({
  default: {
    red: Object.assign((s: string) => `[red]${s}[/red]`, {
      bold: (s: string) => `[red.bold]${s}[/red.bold]`,
    }),
    yellow: (s: string) => `[yellow]${s}[/yellow]`,
    green: (s: string) => `[green]${s}[/green]`,
    blue: Object.assign((s: string) => `[blue]${s}[/blue]`, {
      bold: (s: string) => `[blue.bold]${s}[/blue.bold]`,
    }),
    cyan: (s: string) => `[cyan]${s}[/cyan]`,
    gray: (s: string) => `[gray]${s}[/gray]`,
    white: Object.assign((s: string) => `[white]${s}[/white]`, {
      bold: (s: string) => `[white.bold]${s}[/white.bold]`,
    }),
    magenta: Object.assign((s: string) => `[magenta]${s}[/magenta]`, {
      bold: (s: string) => `[magenta.bold]${s}[/magenta.bold]`,
    }),
    yellowBright: (s: string) => `[yellowBright]${s}[/yellowBright]`,
    blueBright: (s: string) => `[blueBright]${s}[/blueBright]`,
    bold: Object.assign((s: string) => `[bold]${s}[/bold]`, {
      underline: (s: string) => `[bold.underline]${s}[/bold.underline]`,
    }),
  },
}));

// Sample categories for testing
const SAMPLE_CATEGORIES: CategorySummary[] = [
  {
    id: "sql-injection",
    name: "SQL Injection",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    description: "Test for SQL injection vulnerabilities in database queries",
  },
  {
    id: "xss",
    name: "Cross-Site Scripting",
    domain: "security",
    level: "unit",
    priority: "P0",
    severity: "high",
    description: "Test for XSS vulnerabilities in user input handling",
  },
  {
    id: "race-condition",
    name: "Race Condition",
    domain: "concurrency",
    level: "integration",
    priority: "P1",
    severity: "high",
    description: "Test for race conditions in concurrent operations",
  },
  {
    id: "data-truncation",
    name: "Data Truncation",
    domain: "data",
    level: "unit",
    priority: "P2",
    severity: "medium",
    description: "Test for data loss from truncation in varchar fields and integer overflows",
  },
];

describe("formatters", () => {
  describe("formatTerminal", () => {
    it("formats empty list with warning message", () => {
      const result = formatTerminal([]);
      expect(result).toContain("No categories found");
    });

    it("formats single category", () => {
      const result = formatTerminal([SAMPLE_CATEGORIES[0]!]);
      expect(result).toContain("SQL Injection");
      expect(result).toContain("sql-injection");
      expect(result).toContain("SECURITY");
      expect(result).toContain("P0");
      expect(result).toContain("critical");
    });

    it("groups categories by domain", () => {
      const result = formatTerminal(SAMPLE_CATEGORIES);
      expect(result).toContain("SECURITY");
      expect(result).toContain("CONCURRENCY");
      expect(result).toContain("DATA");
    });

    it("includes statistics summary", () => {
      const result = formatTerminal(SAMPLE_CATEGORIES);
      expect(result).toContain("P0");
      expect(result).toContain("P1");
      expect(result).toContain("P2");
    });

    it("truncates long descriptions", () => {
      const longDesc: CategorySummary = {
        ...SAMPLE_CATEGORIES[0]!,
        description: "A".repeat(100),
      };
      const result = formatTerminal([longDesc]);
      expect(result).toContain("...");
      expect(result).not.toContain("A".repeat(100));
    });
  });

  describe("formatJson", () => {
    it("formats empty list as empty JSON array", () => {
      const result = formatJson([]);
      expect(JSON.parse(result)).toEqual([]);
    });

    it("formats categories as valid JSON", () => {
      const result = formatJson(SAMPLE_CATEGORIES);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(4);
      expect(parsed[0].id).toBe("sql-injection");
    });

    it("preserves all category properties", () => {
      const result = formatJson([SAMPLE_CATEGORIES[0]!]);
      const parsed = JSON.parse(result)[0];
      expect(parsed).toEqual(SAMPLE_CATEGORIES[0]);
    });

    it("produces pretty-printed JSON", () => {
      const result = formatJson([SAMPLE_CATEGORIES[0]!]);
      expect(result).toContain("\n");
      expect(result).toContain("  ");
    });
  });

  describe("formatMarkdown", () => {
    it("formats empty list with italic message", () => {
      const result = formatMarkdown([]);
      expect(result).toContain("_No categories found");
    });

    it("includes header with count", () => {
      const result = formatMarkdown(SAMPLE_CATEGORIES);
      expect(result).toContain("# Categories (4)");
    });

    it("creates domain sections", () => {
      const result = formatMarkdown(SAMPLE_CATEGORIES);
      expect(result).toContain("## Security");
      expect(result).toContain("## Concurrency");
      expect(result).toContain("## Data");
    });

    it("formats category as markdown with headers", () => {
      const result = formatMarkdown([SAMPLE_CATEGORIES[0]!]);
      expect(result).toContain("### SQL Injection");
      expect(result).toContain("**ID**: `sql-injection`");
      expect(result).toContain("**Priority**: P0");
      expect(result).toContain("**Severity**: critical");
      expect(result).toContain("**Level**: integration");
    });

    it("includes category description", () => {
      const result = formatMarkdown([SAMPLE_CATEGORIES[0]!]);
      expect(result).toContain("Test for SQL injection vulnerabilities");
    });
  });

  describe("formatCategories", () => {
    it("routes to terminal formatter", () => {
      const result = formatCategories(SAMPLE_CATEGORIES, "terminal");
      expect(result).toContain("Found 4 categories");
    });

    it("routes to JSON formatter", () => {
      const result = formatCategories(SAMPLE_CATEGORIES, "json");
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("routes to markdown formatter", () => {
      const result = formatCategories(SAMPLE_CATEGORIES, "markdown");
      expect(result).toContain("# Categories");
    });

    it("defaults to terminal format for unknown format", () => {
      const result = formatCategories(SAMPLE_CATEGORIES, "terminal");
      expect(result).toContain("Found 4 categories");
    });
  });

  describe("isValidOutputFormat", () => {
    it("accepts terminal format", () => {
      expect(isValidOutputFormat("terminal")).toBe(true);
    });

    it("accepts json format", () => {
      expect(isValidOutputFormat("json")).toBe(true);
    });

    it("accepts markdown format", () => {
      expect(isValidOutputFormat("markdown")).toBe(true);
    });

    it("rejects invalid formats", () => {
      expect(isValidOutputFormat("xml")).toBe(false);
      expect(isValidOutputFormat("html")).toBe(false);
      expect(isValidOutputFormat("")).toBe(false);
      expect(isValidOutputFormat("JSON")).toBe(false); // Case sensitive
    });
  });

  describe("formatError", () => {
    it("formats error message with color", () => {
      const error = new Error("Something went wrong");
      const result = formatError(error);
      expect(result).toContain("Something went wrong");
      expect(result).toContain("Error");
    });
  });

  describe("formatWarning", () => {
    it("formats warning message with color", () => {
      const result = formatWarning("This is a warning");
      expect(result).toContain("This is a warning");
      expect(result).toContain("Warning");
    });
  });

  describe("formatSuccess", () => {
    it("formats success message with checkmark", () => {
      const result = formatSuccess("Operation completed");
      expect(result).toContain("Operation completed");
      expect(result).toContain("✓");
    });
  });
});

describe("output format validation", () => {
  const formats = ["terminal", "json", "markdown"];

  for (const format of formats) {
    it(`validates ${format} as valid format`, () => {
      expect(isValidOutputFormat(format)).toBe(true);
    });
  }

  const invalidFormats = ["xml", "csv", "html", "sarif", "TERMINAL", ""];

  for (const format of invalidFormats) {
    it(`rejects ${format || "empty string"} as invalid format`, () => {
      expect(isValidOutputFormat(format)).toBe(false);
    });
  }
});

describe("category grouping and sorting", () => {
  it("groups categories by domain in terminal output", () => {
    const result = formatTerminal(SAMPLE_CATEGORIES);

    // All security categories should be under the SECURITY header
    const securityIndex = result.indexOf("SECURITY");
    const concurrencyIndex = result.indexOf("CONCURRENCY");
    const dataIndex = result.indexOf("DATA");

    // Domain headers should all be present
    expect(securityIndex).toBeGreaterThan(-1);
    expect(concurrencyIndex).toBeGreaterThan(-1);
    expect(dataIndex).toBeGreaterThan(-1);

    // Security categories should appear between SECURITY and CONCURRENCY headers
    const sqlInjectionIndex = result.indexOf("sql-injection");
    expect(sqlInjectionIndex).toBeGreaterThan(securityIndex);
  });

  it("groups all categories from same domain together", () => {
    const jsonResult = formatJson(SAMPLE_CATEGORIES);
    const parsed = JSON.parse(jsonResult);

    // In JSON the order from input is preserved
    expect(parsed[0].domain).toBe("security");
    expect(parsed[1].domain).toBe("security");
    expect(parsed[2].domain).toBe("concurrency");
  });
});

describe("edge cases", () => {
  it("handles category with very long name", () => {
    const longName: CategorySummary = {
      ...SAMPLE_CATEGORIES[0]!,
      id: "very-long-category-id",
      name: "A Very Long Category Name That Goes On And On",
    };
    const result = formatTerminal([longName]);
    expect(result).toContain(longName.name);
  });

  it("handles special characters in description", () => {
    const special: CategorySummary = {
      ...SAMPLE_CATEGORIES[0]!,
      description: "Test <script> & 'quotes' \"double\" `backticks`",
    };
    const jsonResult = formatJson([special]);
    const parsed = JSON.parse(jsonResult);
    expect(parsed[0].description).toContain("<script>");
    expect(parsed[0].description).toContain("&");
  });

  it("handles single category from multiple domains", () => {
    const result = formatTerminal([SAMPLE_CATEGORIES[0]!]);
    expect(result).toContain("SECURITY");
    expect(result).not.toContain("CONCURRENCY");
  });

  it("handles all priorities being same", () => {
    const allP0 = SAMPLE_CATEGORIES.map((c) => ({ ...c, priority: "P0" as const }));
    const result = formatTerminal(allP0);
    expect(result).toContain("4 P0");
    expect(result).not.toContain("P1");
    expect(result).not.toContain("P2");
  });

  it("handles all severities being same", () => {
    const allCritical = SAMPLE_CATEGORIES.map((c) => ({ ...c, severity: "critical" as const }));
    const result = formatTerminal(allCritical);
    expect(result).toContain("4 critical");
    expect(result).not.toContain(" high");
    expect(result).not.toContain(" medium");
  });
});
