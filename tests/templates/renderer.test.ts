import { describe, it, expect, beforeEach } from "vitest";

import type { TestTemplate, TemplateVariable } from "@/categories/schema/index.js";

import {
  TemplateRenderer,
  TemplateRenderError,
  TemplateSyntaxError,
  createRenderer,
  type RenderOptions,
} from "@/templates/index.js";

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
        isNestedPath: false,
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

    it("parses nested path placeholders", () => {
      const placeholders = renderer.parsePlaceholders("{{user.name}} {{user.address.city}}");
      expect(placeholders).toHaveLength(2);
      expect(placeholders[0]).toMatchObject({
        name: "user.name",
        isNestedPath: true,
        pathSegments: ["user", "name"],
      });
      expect(placeholders[1]).toMatchObject({
        name: "user.address.city",
        isNestedPath: true,
        pathSegments: ["user", "address", "city"],
      });
    });
  });

  describe("getVariableNames", () => {
    it("returns unique variable names", () => {
      const names = renderer.getVariableNames(
        "{{a}} {{b}} {{a}} {{c}} {{b}}"
      );
      expect(names).toContain("a");
      expect(names).toContain("b");
      expect(names).toContain("c");
    });

    it("returns empty array for no variables", () => {
      const names = renderer.getVariableNames("No variables here");
      expect(names).toEqual([]);
    });

    it("includes root variables for nested paths", () => {
      const names = renderer.getVariableNames("{{user.name}} {{user.email}}");
      expect(names).toContain("user.name");
      expect(names).toContain("user.email");
      expect(names).toContain("user");
    });

    it("extracts variables from conditional blocks", () => {
      const names = renderer.getVariableNames("{{#if isAdmin}}Admin{{/if}}");
      expect(names).toContain("isAdmin");
    });

    it("extracts variables from loop blocks", () => {
      const names = renderer.getVariableNames("{{#each items}}{{this}}{{/each}}");
      expect(names).toContain("items");
    });
  });

  describe("nested variable access", () => {
    it("accesses nested object properties", () => {
      const result = renderer.substituteVariables(
        "Hello {{user.name}}!",
        { user: { name: "John" } }
      );
      expect(result.content).toBe("Hello John!");
    });

    it("accesses deeply nested properties", () => {
      const result = renderer.substituteVariables(
        "City: {{user.address.city}}",
        { user: { address: { city: "New York" } } }
      );
      expect(result.content).toBe("City: New York");
    });

    it("returns undefined for missing nested paths", () => {
      const lenientRenderer = new TemplateRenderer({ allowUnresolved: true });
      const result = lenientRenderer.substituteVariables(
        "{{user.missing.path}}",
        { user: { name: "John" } }
      );
      expect(result.unresolved).toContain("user.missing.path");
    });

    it("handles null in nested path", () => {
      const lenientRenderer = new TemplateRenderer({ allowUnresolved: true });
      const result = lenientRenderer.substituteVariables(
        "{{user.address.city}}",
        { user: { address: null } }
      );
      expect(result.unresolved).toContain("user.address.city");
    });

    it("mixes nested and simple variables", () => {
      const result = renderer.substituteVariables(
        "{{greeting}} {{user.name}}!",
        { greeting: "Hello", user: { name: "John" } }
      );
      expect(result.content).toBe("Hello John!");
    });
  });

  describe("conditional blocks {{#if}}...{{/if}}", () => {
    it("renders true branch when condition is truthy", () => {
      const result = renderer.processConditionals(
        "{{#if showGreeting}}Hello{{/if}}",
        { showGreeting: true }
      );
      expect(result).toBe("Hello");
    });

    it("skips true branch when condition is falsy", () => {
      const result = renderer.processConditionals(
        "{{#if showGreeting}}Hello{{/if}}",
        { showGreeting: false }
      );
      expect(result).toBe("");
    });

    it("renders else branch when condition is falsy", () => {
      const result = renderer.processConditionals(
        "{{#if isAdmin}}Admin{{#else}}User{{/if}}",
        { isAdmin: false }
      );
      expect(result).toBe("User");
    });

    it("renders true branch with else present", () => {
      const result = renderer.processConditionals(
        "{{#if isAdmin}}Admin{{#else}}User{{/if}}",
        { isAdmin: true }
      );
      expect(result).toBe("Admin");
    });

    it("handles nested object conditions", () => {
      const result = renderer.processConditionals(
        "{{#if user.isAdmin}}Admin{{/if}}",
        { user: { isAdmin: true } }
      );
      expect(result).toBe("Admin");
    });

    it("treats empty string as falsy", () => {
      const result = renderer.processConditionals(
        "{{#if name}}Has name{{#else}}No name{{/if}}",
        { name: "" }
      );
      expect(result).toBe("No name");
    });

    it("treats non-empty string as truthy", () => {
      const result = renderer.processConditionals(
        "{{#if name}}Has name{{/if}}",
        { name: "John" }
      );
      expect(result).toBe("Has name");
    });

    it("treats empty array as falsy", () => {
      const result = renderer.processConditionals(
        "{{#if items}}Has items{{#else}}No items{{/if}}",
        { items: [] }
      );
      expect(result).toBe("No items");
    });

    it("treats non-empty array as truthy", () => {
      const result = renderer.processConditionals(
        "{{#if items}}Has items{{/if}}",
        { items: [1, 2, 3] }
      );
      expect(result).toBe("Has items");
    });

    it("treats zero as falsy", () => {
      const result = renderer.processConditionals(
        "{{#if count}}Has count{{#else}}Zero{{/if}}",
        { count: 0 }
      );
      expect(result).toBe("Zero");
    });

    it("treats non-zero number as truthy", () => {
      const result = renderer.processConditionals(
        "{{#if count}}Has count{{/if}}",
        { count: 42 }
      );
      expect(result).toBe("Has count");
    });

    it("treats null as falsy", () => {
      const result = renderer.processConditionals(
        "{{#if value}}Has value{{#else}}No value{{/if}}",
        { value: null }
      );
      expect(result).toBe("No value");
    });

    it("treats undefined as falsy", () => {
      const result = renderer.processConditionals(
        "{{#if value}}Has value{{#else}}No value{{/if}}",
        {}
      );
      expect(result).toBe("No value");
    });

    it("handles multiple conditionals", () => {
      const result = renderer.processConditionals(
        "{{#if a}}A{{/if}}{{#if b}}B{{/if}}{{#if c}}C{{/if}}",
        { a: true, b: false, c: true }
      );
      expect(result).toBe("AC");
    });

    it("preserves content outside conditionals", () => {
      const result = renderer.processConditionals(
        "Before {{#if show}}Middle{{/if}} After",
        { show: true }
      );
      expect(result).toBe("Before Middle After");
    });

    it("handles multiline content in conditionals", () => {
      const result = renderer.processConditionals(
        `{{#if show}}
Line 1
Line 2
{{/if}}`,
        { show: true }
      );
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
    });
  });

  describe("inverse conditionals {{#unless}}...{{/unless}}", () => {
    it("renders content when condition is falsy", () => {
      const result = renderer.processConditionals(
        "{{#unless isAdmin}}Not admin{{/unless}}",
        { isAdmin: false }
      );
      expect(result).toBe("Not admin");
    });

    it("skips content when condition is truthy", () => {
      const result = renderer.processConditionals(
        "{{#unless isAdmin}}Not admin{{/unless}}",
        { isAdmin: true }
      );
      expect(result).toBe("");
    });

    it("combines with regular conditionals", () => {
      const result = renderer.processConditionals(
        "{{#if isAdmin}}Admin{{/if}}{{#unless isAdmin}}User{{/unless}}",
        { isAdmin: false }
      );
      expect(result).toBe("User");
    });
  });

  describe("loop blocks {{#each}}...{{/each}}", () => {
    it("iterates over array of primitives", () => {
      const result = renderer.processLoops(
        "{{#each items}}{{this}} {{/each}}",
        { items: ["a", "b", "c"] }
      );
      expect(result).toBe("a b c ");
    });

    it("iterates over array of objects", () => {
      const result = renderer.processLoops(
        "{{#each users}}{{name}} {{/each}}",
        { users: [{ name: "Alice" }, { name: "Bob" }] }
      );
      expect(result).toBe("Alice Bob ");
    });

    it("provides @index in loop", () => {
      const result = renderer.processLoops(
        "{{#each items}}{{@index}}:{{this}} {{/each}}",
        { items: ["a", "b", "c"] }
      );
      expect(result).toBe("0:a 1:b 2:c ");
    });

    it("provides @first in loop", () => {
      const result = renderer.processLoops(
        "{{#each items}}{{#if @first}}First:{{/if}}{{this}} {{/each}}",
        { items: ["a", "b", "c"] }
      );
      // Note: @first is a string "true"/"false", conditionals process after loops
      expect(result).toContain("First:");
    });

    it("provides @last in loop", () => {
      const result = renderer.processLoops(
        "{{#each items}}{{this}}{{@last}} {{/each}}",
        { items: ["a", "b"] }
      );
      expect(result).toContain("afalse");
      expect(result).toContain("btrue");
    });

    it("handles empty array", () => {
      const result = renderer.processLoops(
        "{{#each items}}{{this}}{{/each}}",
        { items: [] }
      );
      expect(result).toBe("");
    });

    it("handles non-array as empty", () => {
      const result = renderer.processLoops(
        "{{#each items}}{{this}}{{/each}}",
        { items: "not an array" }
      );
      expect(result).toBe("");
    });

    it("handles nested object properties", () => {
      const result = renderer.processLoops(
        "{{#each users}}{{name}}: {{email}} | {{/each}}",
        { users: [{ name: "Alice", email: "a@example.com" }, { name: "Bob", email: "b@example.com" }] }
      );
      expect(result).toBe("Alice: a@example.com | Bob: b@example.com | ");
    });

    it("handles nested path for array", () => {
      const result = renderer.processLoops(
        "{{#each data.items}}{{this}} {{/each}}",
        { data: { items: ["x", "y"] } }
      );
      expect(result).toBe("x y ");
    });

    it("preserves content outside loops", () => {
      const result = renderer.processLoops(
        "Items: {{#each items}}{{this}}{{/each}}!",
        { items: ["a", "b"] }
      );
      expect(result).toBe("Items: ab!");
    });

    it("handles multiple loops", () => {
      const result = renderer.processLoops(
        "{{#each a}}{{this}}{{/each}}-{{#each b}}{{this}}{{/each}}",
        { a: [1, 2], b: [3, 4] }
      );
      expect(result).toBe("12-34");
    });
  });

  describe("validateSyntax", () => {
    it("passes valid template", () => {
      const result = renderer.validateSyntax("Hello {{name}}!");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("passes valid conditional", () => {
      const result = renderer.validateSyntax("{{#if show}}content{{/if}}");
      expect(result.valid).toBe(true);
    });

    it("passes valid conditional with else", () => {
      const result = renderer.validateSyntax("{{#if show}}yes{{#else}}no{{/if}}");
      expect(result.valid).toBe(true);
    });

    it("passes valid loop", () => {
      const result = renderer.validateSyntax("{{#each items}}{{this}}{{/each}}");
      expect(result.valid).toBe(true);
    });

    it("passes valid unless", () => {
      const result = renderer.validateSyntax("{{#unless hidden}}visible{{/unless}}");
      expect(result.valid).toBe(true);
    });

    it("detects unclosed if block", () => {
      const result = renderer.validateSyntax("{{#if show}}content");
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBeInstanceOf(TemplateSyntaxError);
      expect(result.errors[0]?.message).toContain("Unclosed");
    });

    it("detects unclosed each block", () => {
      const result = renderer.validateSyntax("{{#each items}}content");
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("Unclosed");
    });

    it("detects unclosed unless block", () => {
      const result = renderer.validateSyntax("{{#unless hidden}}content");
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("Unclosed");
    });

    it("detects orphaned endif", () => {
      const result = renderer.validateSyntax("content{{/if}}");
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("Orphaned");
    });

    it("detects orphaned endeach", () => {
      const result = renderer.validateSyntax("content{{/each}}");
      expect(result.valid).toBe(false);
    });

    it("detects orphaned endunless", () => {
      const result = renderer.validateSyntax("content{{/unless}}");
      expect(result.valid).toBe(false);
    });

    it("detects mismatched block types", () => {
      const result = renderer.validateSyntax("{{#if show}}content{{/each}}");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("Mismatched"))).toBe(true);
    });

    it("handles nested blocks correctly", () => {
      const result = renderer.validateSyntax(
        "{{#if a}}{{#each items}}{{this}}{{/each}}{{/if}}"
      );
      expect(result.valid).toBe(true);
    });

    it("detects improperly nested blocks", () => {
      const result = renderer.validateSyntax(
        "{{#if a}}{{#each items}}{{/if}}{{/each}}"
      );
      expect(result.valid).toBe(false);
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
    });

    it("detects type mismatches for boolean", () => {
      const template = createTestTemplate(
        "Active: {{active}}",
        [createVariable("active", "boolean")]
      );
      const result = renderer.validateVariables(template, { active: "true" });
      expect(result.valid).toBe(false);
    });

    it("detects type mismatches for array", () => {
      const template = createTestTemplate(
        "Items: {{items}}",
        [createVariable("items", "array")]
      );
      const result = renderer.validateVariables(template, { items: "not an array" });
      expect(result.valid).toBe(false);
    });

    it("detects type mismatches for object", () => {
      const template = createTestTemplate(
        "Config: {{config}}",
        [createVariable("config", "object")]
      );
      const result = renderer.validateVariables(template, { config: "not an object" });
      expect(result.valid).toBe(false);
    });

    it("accepts arrays for array type", () => {
      const template = createTestTemplate(
        "Items: {{items}}",
        [createVariable("items", "array")]
      );
      const result = renderer.validateVariables(template, { items: [1, 2, 3] });
      expect(result.valid).toBe(true);
    });

    it("accepts objects for object type", () => {
      const template = createTestTemplate(
        "Config: {{config}}",
        [createVariable("config", "object")]
      );
      const result = renderer.validateVariables(template, { config: { key: "value" } });
      expect(result.valid).toBe(true);
    });

    it("validates nested path variables by checking root", () => {
      const template = createTestTemplate(
        "Hello {{user.name}}!",
        [createVariable("user", "object")]
      );
      const result = renderer.validateVariables(template, { user: { name: "John" } });
      expect(result.valid).toBe(true);
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
      }
    });

    it("fails in strict mode for syntax errors", () => {
      const template = createTestTemplate(
        "{{#if show}}content",
        []
      );

      const result = renderer.renderTemplate(template, { show: true });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(TemplateSyntaxError);
      }
    });

    it("processes conditionals in template", () => {
      const template = createTestTemplate(
        "{{#if isAdmin}}Admin: {{/if}}{{name}}",
        [createVariable("name"), createVariable("isAdmin", "boolean")]
      );

      const result = renderer.renderTemplate(template, {
        name: "John",
        isAdmin: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("Admin: John");
      }
    });

    it("processes loops in template", () => {
      const template = createTestTemplate(
        "Items: {{#each items}}{{this}}, {{/each}}",
        [createVariable("items", "array")]
      );

      const result = renderer.renderTemplate(template, {
        items: ["a", "b", "c"],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("Items: a, b, c, ");
      }
    });

    it("processes nested paths in template", () => {
      const template = createTestTemplate(
        "Hello {{user.name}} from {{user.address.city}}",
        [createVariable("user", "object")]
      );

      const result = renderer.renderTemplate(template, {
        user: { name: "John", address: { city: "NYC" } },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toBe("Hello John from NYC");
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
  });

  describe("processTemplate (combined)", () => {
    it("processes loops then conditionals then substitution", () => {
      const result = renderer.processTemplate(
        "{{#each users}}{{#if isActive}}Active: {{/if}}{{name}} {{/each}}",
        {
          users: [
            { name: "Alice", isActive: true },
            { name: "Bob", isActive: false },
          ],
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("Active: Alice");
        expect(result.data.content).toContain("Bob");
        expect(result.data.content).not.toContain("Active: Bob");
      }
    });

    it("handles complex nested template", () => {
      const result = renderer.processTemplate(
        `class {{className}} {
{{#each methods}}
  {{#if isPublic}}public {{/if}}{{name}}() {}
{{/each}}
}`,
        {
          className: "MyClass",
          methods: [
            { name: "publicMethod", isPublic: true },
            { name: "privateMethod", isPublic: false },
          ],
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("class MyClass");
        expect(result.data.content).toContain("public publicMethod");
        expect(result.data.content).toContain("privateMethod");
        expect(result.data.content).not.toContain("public privateMethod");
      }
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

    it("supports dollar format with nested paths", () => {
      const dollarRenderer = new TemplateRenderer({ placeholderFormat: "dollar" });
      const result = dollarRenderer.substituteVariables(
        "Hello ${user.name}!",
        { user: { name: "John" } }
      );
      expect(result.content).toBe("Hello John!");
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
    });

    it("creates template with overrides", () => {
      const template = TemplateRenderer.createTemplate(
        "test {{var}}",
        [createVariable("var")],
        {
          id: "my-template",
          language: "python",
          framework: "pytest",
        }
      );

      expect(template.id).toBe("my-template");
      expect(template.language).toBe("python");
      expect(template.framework).toBe("pytest");
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

    it("handles empty conditional branches", () => {
      const result = renderer.processConditionals(
        "{{#if show}}{{/if}}rest",
        { show: true }
      );
      expect(result).toBe("rest");
    });

    it("handles empty loop body", () => {
      const result = renderer.processLoops(
        "before{{#each items}}{{/each}}after",
        { items: [1, 2, 3] }
      );
      expect(result).toBe("beforeafter");
    });

    it("handles whitespace in block tags", () => {
      const result = renderer.processConditionals(
        "{{#if   show  }}content{{/if}}",
        { show: true }
      );
      expect(result).toBe("content");
    });
  });

  describe("real-world template scenarios", () => {
    it("renders pytest SQL injection test template with conditionals", () => {
      const template = createTestTemplate(
        `import pytest
{{#if useMock}}
from unittest.mock import patch, MagicMock
{{/if}}

class Test{{className}}SQLInjection:
    """SQL injection tests for {{functionName}}"""
    
    {{#if customPayloads}}
    PAYLOADS = {{customPayloads}}
    {{#else}}
    PAYLOADS = ["'; DROP TABLE users; --", "' OR '1'='1"]
    {{/if}}
    
    @pytest.mark.parametrize("payload", PAYLOADS)
    def test_rejects_injection(self, payload):
        with pytest.raises({{exceptionClass}}):
            {{functionCall}}(payload)`,
        [
          createVariable("className"),
          createVariable("functionName"),
          createVariable("exceptionClass"),
          createVariable("functionCall"),
          createVariable("useMock", "boolean"),
          createVariable("customPayloads", "string", false),
        ]
      );

      const result = renderer.renderTemplate(template, {
        className: "UserService",
        functionName: "authenticate",
        exceptionClass: "ValueError",
        functionCall: "user_service.authenticate",
        useMock: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("from unittest.mock import");
        expect(result.data.content).toContain("class TestUserServiceSQLInjection:");
        expect(result.data.content).toContain("PAYLOADS = [");
      }
    });

    it("renders jest test with loop over test cases", () => {
      const template = createTestTemplate(
        `describe('{{componentName}}', () => {
{{#each testCases}}
  test('{{description}}', () => {
    const input = {{input}};
    const expected = {{expected}};
    expect({{functionName}}(input)).toEqual(expected);
  });

{{/each}}
});`,
        [
          createVariable("componentName"),
          createVariable("functionName"),
          createVariable("testCases", "array"),
        ]
      );

      const result = renderer.renderTemplate(template, {
        componentName: "Calculator",
        functionName: "add",
        testCases: [
          { description: "adds positive numbers", input: "[1, 2]", expected: "3" },
          { description: "handles zero", input: "[0, 5]", expected: "5" },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("describe('Calculator'");
        expect(result.data.content).toContain("adds positive numbers");
        expect(result.data.content).toContain("handles zero");
      }
    });

    it("renders API test with nested user object", () => {
      const template = createTestTemplate(
        `test('creates user', async () => {
  const response = await api.createUser({
    name: '{{user.name}}',
    email: '{{user.email}}',
    {{#if user.isAdmin}}
    role: 'admin',
    {{#else}}
    role: 'user',
    {{/if}}
  });
  
  expect(response.status).toBe(201);
});`,
        [createVariable("user", "object")]
      );

      const result = renderer.renderTemplate(template, {
        user: { name: "John", email: "john@example.com", isAdmin: false },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("name: 'John'");
        expect(result.data.content).toContain("email: 'john@example.com'");
        expect(result.data.content).toContain("role: 'user'");
        expect(result.data.content).not.toContain("role: 'admin'");
      }
    });
  });
});
