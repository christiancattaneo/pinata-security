import { describe, it, expect, beforeEach } from "vitest";

import {
  TemplateRenderer,
  TemplateRenderError,
  createRenderer,
  type RenderOptions,
} from "@/templates/index.js";
import type { TestTemplate, TemplateVariable } from "@/categories/schema/index.js";

describe("TemplateRenderer", () => {
  let renderer: TemplateRenderer;

  beforeEach(() => {
    renderer = new TemplateRenderer();
  });

  // Helper to create test templates
  function createTestTemplate(
    template: string,
    variables: TemplateVariable[] = [],
    overrides: Partial<TestTemplate> = {}
  ): TestTemplate {
    return {
      id: "test-template",
      language: "typescript",
      framework: "jest",
      template,
      variables,
      ...overrides,
    };
  }

  // Helper to create variable definitions
  function createVariable(
    name: string,
    type: "string" | "number" | "boolean" | "array" | "object" = "string",
    required = true,
    defaultValue?: unknown
  ): TemplateVariable {
    return {
      name,
      type,
      description: `Variable ${name}`,
      required,
      defaultValue,
    };
  }

  describe("parsePlaceholders", () => {
    it("extracts single placeholder", () => {
      const placeholders = renderer.parsePlaceholders("Hello {{name}}!");
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0]).toMatchObject({
        match: "{{name}}",
        name: "name",
      });
    });

    it("extracts multiple placeholders", () => {
      const placeholders = renderer.parsePlaceholders(
        "{{greeting}} {{name}}, welcome to {{place}}!"
      );
      expect(placeholders).toHaveLength(3);
      expect(placeholders.map((p) => p.name)).toEqual(["greeting", "name", "place"]);
    });

    it("handles duplicate placeholders", () => {
      const placeholders = renderer.parsePlaceholders(
        "{{name}} said hello to {{name}}"
      );
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0]?.name).toBe("name");
      expect(placeholders[1]?.name).toBe("name");
    });

    it("returns empty array for no placeholders", () => {
      const placeholders = renderer.parsePlaceholders("Hello world!");
      expect(placeholders).toHaveLength(0);
    });

    it("handles camelCase variable names", () => {
      const placeholders = renderer.parsePlaceholders(
        "{{userName}} {{userEmail}} {{firstName}}"
      );
      expect(placeholders.map((p) => p.name)).toEqual([
        "userName",
        "userEmail",
        "firstName",
      ]);
    });

    it("handles underscores in variable names", () => {
      const placeholders = renderer.parsePlaceholders(
        "{{user_name}} {{first_name}}"
      );
      expect(placeholders.map((p) => p.name)).toEqual(["user_name", "first_name"]);
    });

    it("ignores invalid placeholder formats", () => {
      const placeholders = renderer.parsePlaceholders(
        "{{ space }} {{123invalid}} {{}} {single}"
      );
      expect(placeholders).toHaveLength(0);
    });

    it("provides correct indices", () => {
      const template = "Hello {{name}}!";
      const placeholders = renderer.parsePlaceholders(template);
      expect(placeholders[0]?.startIndex).toBe(6);
      expect(placeholders[0]?.endIndex).toBe(14);
      expect(template.slice(6, 14)).toBe("{{name}}");
    });
  });

  describe("getVariableNames", () => {
    it("returns unique variable names", () => {
      const names = renderer.getVariableNames(
        "{{a}} {{b}} {{a}} {{c}} {{b}}"
      );
      expect(names).toEqual(["a", "b", "c"]);
    });

    it("returns empty array for no variables", () => {
      const names = renderer.getVariableNames("No variables here");
      expect(names).toEqual([]);
    });
  });

  describe("validateVariables", () => {
    it("passes validation for all required variables provided", () => {
      const template = createTestTemplate(
        "Hello {{name}}!",
        [createVariable("name")]
      );
      const result = renderer.validateVariables(template, { name: "World" });
      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
    });

    it("fails for missing required variables", () => {
      const template = createTestTemplate(
        "Hello {{name}} {{age}}!",
        [createVariable("name"), createVariable("age", "number")]
      );
      const result = renderer.validateVariables(template, { name: "World" });
      expect(result.valid).toBe(false);
      expect(result.missingRequired).toContain("age");
    });

    it("passes when optional variable is missing", () => {
      const template = createTestTemplate(
        "Hello {{name}} {{suffix}}!",
        [createVariable("name"), createVariable("suffix", "string", false)]
      );
      const result = renderer.validateVariables(template, { name: "World" });
      expect(result.valid).toBe(true);
    });

    it("uses default values for missing required variables", () => {
      const template = createTestTemplate(
        "Hello {{name}}!",
        [createVariable("name", "string", true, "Default")]
      );
      const result = renderer.validateVariables(template, {});
      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
    });

    it("detects type mismatches for string", () => {
      const template = createTestTemplate(
        "Hello {{name}}!",
        [createVariable("name", "string")]
      );
      const result = renderer.validateVariables(template, { name: 123 });
      expect(result.valid).toBe(false);
      expect(result.typeErrors).toContain(
        "Variable 'name' expected type 'string' but got 'number'"
      );
    });

    it("detects type mismatches for number", () => {
      const template = createTestTemplate(
        "Age: {{age}}",
        [createVariable("age", "number")]
      );
      const result = renderer.validateVariables(template, { age: "25" });
      expect(result.valid).toBe(false);
      expect(result.typeErrors).toContain(
        "Variable 'age' expected type 'number' but got 'string'"
      );
    });

    it("detects type mismatches for boolean", () => {
      const template = createTestTemplate(
        "Active: {{active}}",
        [createVariable("active", "boolean")]
      );
      const result = renderer.validateVariables(template, { active: "true" });
      expect(result.valid).toBe(false);
      expect(result.typeErrors).toContain(
        "Variable 'active' expected type 'boolean' but got 'string'"
      );
    });

    it("detects type mismatches for array", () => {
      const template = createTestTemplate(
        "Items: {{items}}",
        [createVariable("items", "array")]
      );
      const result = renderer.validateVariables(template, { items: "not an array" });
      expect(result.valid).toBe(false);
      expect(result.typeErrors).toContain(
        "Variable 'items' expected type 'array' but got 'string'"
      );
    });

    it("detects type mismatches for object", () => {
      const template = createTestTemplate(
        "Config: {{config}}",
        [createVariable("config", "object")]
      );
      const result = renderer.validateVariables(template, { config: "not an object" });
      expect(result.valid).toBe(false);
      expect(result.typeErrors).toContain(
        "Variable 'config' expected type 'object' but got 'string'"
      );
    });

    it("accepts arrays for array type", () => {
      const template = createTestTemplate(
        "Items: {{items}}",
        [createVariable("items", "array")]
      );
      const result = renderer.validateVariables(template, { items: [1, 2, 3] });
      expect(result.valid).toBe(true);
      expect(result.typeErrors).toHaveLength(0);
    });

    it("accepts objects for object type", () => {
      const template = createTestTemplate(
        "Config: {{config}}",
        [createVariable("config", "object")]
      );
      const result = renderer.validateVariables(template, { config: { key: "value" } });
      expect(result.valid).toBe(true);
      expect(result.typeErrors).toHaveLength(0);
    });

    it("detects unknown variables in strict mode", () => {
      const strictRenderer = new TemplateRenderer({ strict: true });
      const template = createTestTemplate(
        "Hello {{name}}!",
        [createVariable("name")]
      );
      const result = strictRenderer.validateVariables(template, {
        name: "World",
        extra: "value",
      });
      expect(result.unknownVariables).toContain("extra");
    });

    it("handles placeholders used but not defined", () => {
      const template = createTestTemplate(
        "Hello {{name}} {{undefinedVar}}!",
        [createVariable("name")]
      );
      const result = renderer.validateVariables(template, { name: "World" });
      expect(result.missingRequired).toContain("undefinedVar");
    });
  });

  describe("substituteVariables", () => {
    it("substitutes single variable", () => {
      const result = renderer.substituteVariables(
        "Hello {{name}}!",
        { name: "World" }
      );
      expect(result.content).toBe("Hello World!");
      expect(result.substituted).toContain("name");
    });

    it("substitutes multiple variables", () => {
      const result = renderer.substituteVariables(
        "{{greeting}} {{name}}!",
        { greeting: "Hello", name: "World" }
      );
      expect(result.content).toBe("Hello World!");
      expect(result.substituted).toEqual(["greeting", "name"]);
    });

    it("substitutes duplicate placeholders", () => {
      const result = renderer.substituteVariables(
        "{{name}} met {{name}}",
        { name: "Alice" }
      );
      expect(result.content).toBe("Alice met Alice");
    });

    it("uses default values from variable definitions", () => {
      const result = renderer.substituteVariables(
        "Hello {{name}}!",
        {},
        [createVariable("name", "string", true, "Default")]
      );
      expect(result.content).toBe("Hello Default!");
    });

    it("provided values override defaults", () => {
      const result = renderer.substituteVariables(
        "Hello {{name}}!",
        { name: "Override" },
        [createVariable("name", "string", true, "Default")]
      );
      expect(result.content).toBe("Hello Override!");
    });

    it("tracks unresolved variables", () => {
      const lenientRenderer = new TemplateRenderer({ allowUnresolved: true });
      const result = lenientRenderer.substituteVariables(
        "Hello {{name}} {{missing}}!",
        { name: "World" }
      );
      expect(result.content).toBe("Hello World {{missing}}!");
      expect(result.unresolved).toContain("missing");
    });

    it("stringifies numbers", () => {
      const result = renderer.substituteVariables(
        "Count: {{count}}",
        { count: 42 }
      );
      expect(result.content).toBe("Count: 42");
    });

    it("stringifies booleans", () => {
      const result = renderer.substituteVariables(
        "Active: {{active}}",
        { active: true }
      );
      expect(result.content).toBe("Active: true");
    });

    it("stringifies arrays as JSON", () => {
      const result = renderer.substituteVariables(
        "Items: {{items}}",
        { items: [1, 2, 3] }
      );
      expect(result.content).toBe("Items: [1,2,3]");
    });

    it("stringifies objects as JSON", () => {
      const result = renderer.substituteVariables(
        "Config: {{config}}",
        { config: { key: "value" } }
      );
      expect(result.content).toBe('Config: {"key":"value"}');
    });

    it("handles null values as empty string", () => {
      const result = renderer.substituteVariables(
        "Value: {{val}}",
        { val: null }
      );
      expect(result.content).toBe("Value: ");
    });

    it("handles undefined values as empty string", () => {
      const result = renderer.substituteVariables(
        "Value: {{val}}",
        { val: undefined }
      );
      expect(result.content).toBe("Value: ");
    });
  });

  describe("renderTemplate", () => {
    it("renders template with all variables", () => {
      const template = createTestTemplate(
        "class {{className}} {\n  {{methodName}}() {}\n}",
        [createVariable("className"), createVariable("methodName")]
      );

      const result = renderer.renderTemplate(template, {
        className: "UserService",
        methodName: "authenticate",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe(
          "class UserService {\n  authenticate() {}\n}"
        );
        expect(result.data.substituted).toContain("className");
        expect(result.data.substituted).toContain("methodName");
      }
    });

    it("fails in strict mode for missing required variables", () => {
      const template = createTestTemplate(
        "class {{className}} {}",
        [createVariable("className")]
      );

      const result = renderer.renderTemplate(template, {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(TemplateRenderError);
        expect(result.error.context?.["errors"]).toContain(
          "Missing required variables: className"
        );
      }
    });

    it("fails in strict mode for type mismatches", () => {
      const template = createTestTemplate(
        "count: {{count}}",
        [createVariable("count", "number")]
      );

      const result = renderer.renderTemplate(template, { count: "not a number" });

      expect(result.success).toBe(false);
    });

    it("succeeds in non-strict mode with missing variables", () => {
      const lenientRenderer = new TemplateRenderer({
        strict: false,
        allowUnresolved: true,
      });

      const template = createTestTemplate(
        "Hello {{name}}!",
        [createVariable("name")]
      );

      const result = lenientRenderer.renderTemplate(template, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("Hello {{name}}!");
        expect(result.data.unresolved).toContain("name");
      }
    });

    it("includes imports and fixtures in result", () => {
      const template = createTestTemplate(
        "test content {{var}}",
        [createVariable("var")],
        {
          imports: ["import { expect } from 'vitest'"],
          fixtures: ["const mockDb = createMockDb()"],
        }
      );

      const result = renderer.renderTemplate(template, { var: "value" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.imports).toContain("import { expect } from 'vitest'");
        expect(result.data.fixtures).toContain("const mockDb = createMockDb()");
      }
    });

    it("applies options override", () => {
      const strictRenderer = new TemplateRenderer({ strict: true });
      const template = createTestTemplate(
        "Hello {{name}}!",
        [createVariable("name")]
      );

      // Override with non-strict
      const result = strictRenderer.renderTemplate(
        template,
        {},
        { strict: false, allowUnresolved: true }
      );

      expect(result.success).toBe(true);
    });
  });

  describe("renderTemplates", () => {
    it("renders multiple templates", () => {
      const templates = [
        createTestTemplate("Template 1: {{var}}", [createVariable("var")]),
        createTestTemplate("Template 2: {{var}}", [createVariable("var")]),
      ];

      const result = renderer.renderTemplates(templates, { var: "value" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0]?.content).toBe("Template 1: value");
        expect(result.data[1]?.content).toBe("Template 2: value");
      }
    });

    it("fails on first template error", () => {
      const templates = [
        createTestTemplate("Template 1: {{required}}", [createVariable("required")]),
        createTestTemplate("Template 2: {{var}}", [createVariable("var")]),
      ];

      const result = renderer.renderTemplates(templates, { var: "value" });

      expect(result.success).toBe(false);
    });
  });

  describe("hasNestedPlaceholders", () => {
    it("detects nested placeholders", () => {
      expect(renderer.hasNestedPlaceholders("{{outer{{inner}}}}")).toBe(true);
    });

    it("returns false for normal placeholders", () => {
      expect(renderer.hasNestedPlaceholders("{{normal}} {{another}}")).toBe(false);
    });

    it("returns false for adjacent placeholders", () => {
      expect(renderer.hasNestedPlaceholders("{{first}}{{second}}")).toBe(false);
    });
  });

  describe("collectImports and collectFixtures", () => {
    it("collects and deduplicates imports", () => {
      const results = [
        {
          content: "",
          substituted: [],
          unresolved: [],
          imports: ["import A", "import B"],
          fixtures: [],
        },
        {
          content: "",
          substituted: [],
          unresolved: [],
          imports: ["import B", "import C"],
          fixtures: [],
        },
      ];

      const imports = renderer.collectImports(results);
      expect(imports).toEqual(["import A", "import B", "import C"]);
    });

    it("collects and deduplicates fixtures", () => {
      const results = [
        {
          content: "",
          substituted: [],
          unresolved: [],
          imports: [],
          fixtures: ["fixture1", "fixture2"],
        },
        {
          content: "",
          substituted: [],
          unresolved: [],
          imports: [],
          fixtures: ["fixture2", "fixture3"],
        },
      ];

      const fixtures = renderer.collectFixtures(results);
      expect(fixtures).toEqual(["fixture1", "fixture2", "fixture3"]);
    });
  });

  describe("placeholder formats", () => {
    it("supports mustache format (default)", () => {
      const mustacheRenderer = new TemplateRenderer({ placeholderFormat: "mustache" });
      const result = mustacheRenderer.substituteVariables(
        "Hello {{name}}!",
        { name: "World" }
      );
      expect(result.content).toBe("Hello World!");
    });

    it("supports dollar format", () => {
      const dollarRenderer = new TemplateRenderer({ placeholderFormat: "dollar" });
      const result = dollarRenderer.substituteVariables(
        "Hello ${name}!",
        { name: "World" }
      );
      expect(result.content).toBe("Hello World!");
    });

    it("supports percent format", () => {
      const percentRenderer = new TemplateRenderer({ placeholderFormat: "percent" });
      const result = percentRenderer.substituteVariables(
        "Hello %(name)s!",
        { name: "World" }
      );
      expect(result.content).toBe("Hello World!");
    });
  });

  describe("createTemplate static method", () => {
    it("creates template with defaults", () => {
      const template = TemplateRenderer.createTemplate(
        "test {{var}}",
        [createVariable("var")]
      );

      expect(template.id).toBe("custom-template");
      expect(template.language).toBe("typescript");
      expect(template.framework).toBe("jest");
      expect(template.template).toBe("test {{var}}");
    });

    it("creates template with overrides", () => {
      const template = TemplateRenderer.createTemplate(
        "test {{var}}",
        [createVariable("var")],
        {
          id: "my-template",
          language: "python",
          framework: "pytest",
          description: "My test template",
        }
      );

      expect(template.id).toBe("my-template");
      expect(template.language).toBe("python");
      expect(template.framework).toBe("pytest");
      expect(template.description).toBe("My test template");
    });
  });

  describe("createRenderer factory", () => {
    it("creates renderer with options", () => {
      const renderer = createRenderer({ strict: false });
      expect(renderer).toBeInstanceOf(TemplateRenderer);
    });

    it("creates renderer with default options", () => {
      const renderer = createRenderer();
      expect(renderer).toBeInstanceOf(TemplateRenderer);
    });
  });

  describe("edge cases", () => {
    it("handles empty template", () => {
      const template = createTestTemplate("", []);
      const result = renderer.renderTemplate(template, {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("");
      }
    });

    it("handles template with only placeholders", () => {
      const template = createTestTemplate(
        "{{a}}{{b}}{{c}}",
        [createVariable("a"), createVariable("b"), createVariable("c")]
      );
      const result = renderer.renderTemplate(template, {
        a: "1",
        b: "2",
        c: "3",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("123");
      }
    });

    it("handles special characters in values", () => {
      const result = renderer.substituteVariables(
        "Pattern: {{pattern}}",
        { pattern: "\\d+\\.\\d+" }
      );
      expect(result.content).toBe("Pattern: \\d+\\.\\d+");
    });

    it("handles multiline templates", () => {
      const template = createTestTemplate(
        `class {{className}} {
  constructor() {
    this.{{propName}} = null;
  }
}`,
        [createVariable("className"), createVariable("propName")]
      );

      const result = renderer.renderTemplate(template, {
        className: "Test",
        propName: "value",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("class Test {");
        expect(result.data.content).toContain("this.value = null;");
      }
    });

    it("handles unicode in variable values", () => {
      const result = renderer.substituteVariables(
        "Message: {{msg}}",
        { msg: "こんにちは 🎉" }
      );
      expect(result.content).toBe("Message: こんにちは 🎉");
    });

    it("handles very long variable values", () => {
      const longValue = "x".repeat(10000);
      const result = renderer.substituteVariables(
        "Value: {{val}}",
        { val: longValue }
      );
      expect(result.content).toBe(`Value: ${longValue}`);
    });

    it("handles SQL-like template content", () => {
      const template = createTestTemplate(
        `SELECT * FROM {{tableName}} WHERE id = {{id}}`,
        [createVariable("tableName"), createVariable("id")]
      );

      const result = renderer.renderTemplate(template, {
        tableName: "users",
        id: "123",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("SELECT * FROM users WHERE id = 123");
      }
    });

    it("handles braces in non-placeholder context", () => {
      const result = renderer.substituteVariables(
        "JSON: { key: {{value}} }",
        { value: '"test"' }
      );
      expect(result.content).toBe('JSON: { key: "test" }');
    });

    it("handles placeholder at start and end", () => {
      const result = renderer.substituteVariables(
        "{{prefix}}content{{suffix}}",
        { prefix: "START-", suffix: "-END" }
      );
      expect(result.content).toBe("START-content-END");
    });
  });

  describe("real-world template scenarios", () => {
    it("renders pytest SQL injection test template", () => {
      const template = createTestTemplate(
        `import pytest

class Test{{className}}SQLInjection:
    """SQL injection tests for {{functionName}}"""
    
    @pytest.mark.parametrize("payload", [
        "'; DROP TABLE {{tableName}}; --",
        "' OR '1'='1",
    ])
    def test_rejects_injection(self, payload):
        with pytest.raises({{exceptionClass}}):
            {{functionCall}}(payload)`,
        [
          createVariable("className"),
          createVariable("functionName"),
          createVariable("tableName"),
          createVariable("exceptionClass"),
          createVariable("functionCall"),
        ]
      );

      const result = renderer.renderTemplate(template, {
        className: "UserService",
        functionName: "authenticate",
        tableName: "users",
        exceptionClass: "ValueError",
        functionCall: "user_service.authenticate",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("class TestUserServiceSQLInjection:");
        expect(result.data.content).toContain("DROP TABLE users");
        expect(result.data.content).toContain("pytest.raises(ValueError)");
        expect(result.data.content).toContain("user_service.authenticate(payload)");
      }
    });

    it("renders jest XSS test template", () => {
      const template = createTestTemplate(
        `describe('{{componentName}}', () => {
  const XSS_PAYLOADS = [
    '<script>alert("xss")</script>',
    '{{maliciousPayload}}',
  ];

  test.each(XSS_PAYLOADS)('sanitizes %s', (payload) => {
    const result = {{renderFunction}}(payload);
    expect(result).not.toContain('<script>');
  });
});`,
        [
          createVariable("componentName"),
          createVariable("maliciousPayload"),
          createVariable("renderFunction"),
        ]
      );

      const result = renderer.renderTemplate(template, {
        componentName: "UserProfile",
        maliciousPayload: '<img src=x onerror="alert(1)">',
        renderFunction: "render",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("describe('UserProfile'");
        expect(result.data.content).toContain('onerror="alert(1)"');
      }
    });
  });
});
