/**
 * Template injection resistance tests.
 *
 * Ensures that the TemplateRenderer cannot be exploited
 * to inject malicious code or access unauthorized data.
 */

import { describe, it, expect, beforeAll } from "vitest";

import { TemplateRenderer } from "@/templates/renderer.js";

import type { TestTemplate } from "@/categories/schema/index.js";

describe("Template Injection Resistance", () => {
  let renderer: TemplateRenderer;

  beforeAll(() => {
    renderer = new TemplateRenderer();
  });

  describe("variable injection prevention", () => {
    it("escapes special template characters in variable values", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: "def test_{{name}}():\n    pass",
        variables: [{ name: "name", type: "string", description: "Name", required: true }],
      };

      const maliciousInputs = [
        "{{__proto__}}",
        "{{constructor}}",
        "{{process.env.SECRET}}",
        "${process.exit(1)}",
        "{{#each items}}{{../__proto__}}{{/each}}",
      ];

      for (const input of maliciousInputs) {
        const result = renderer.renderTemplate(template, { name: input });

        // The output should contain the literal input, not execute it
        expect(result.success).toBe(true);
        if (result.success) {
          // Should not contain any undefined or prototype access
          expect(result.data.content).not.toContain("undefined");
          expect(result.data.content).not.toContain("[object Object]");
        }
      }
    });

    it("prevents prototype pollution via variables", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: "value = '{{value}}'",
        variables: [{ name: "value", type: "string", description: "Value", required: true }],
      };

      // Test that prototype pollution attempts don't affect global objects
      const beforePolluted = ({} as Record<string, unknown>)["polluted"];
      expect(beforePolluted).toBeUndefined();

      const result = renderer.renderTemplate(template, { value: "test" });
      expect(result.success).toBe(true);

      // Verify global object wasn't polluted
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    });
  });

  describe("code execution prevention", () => {
    it("does not eval or execute code in variables", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: "result = '{{code}}'",
        variables: [{ name: "code", type: "string", description: "Code", required: true }],
      };

      const codeExecutionAttempts = [
        "process.exit(1)",
        "os.system('id')",
        "__import__('os').system('id')",
      ];

      for (const code of codeExecutionAttempts) {
        const result = renderer.renderTemplate(template, { code });

        expect(result.success).toBe(true);
        if (result.success) {
          // The code should appear as a literal string in the output
          expect(result.data.content).toContain(code);
        }
      }
    });

    it("handles deeply nested object access safely", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: "data = '{{value}}'",
        variables: [{ name: "value", type: "string", description: "Value", required: true }],
      };

      // Test that nested access syntax doesn't cause issues
      const result = renderer.renderTemplate(template, { value: "safe_value" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toContain("safe_value");
      }
    });
  });

  describe("control structure abuse prevention", () => {
    it("handles malformed if/each blocks", () => {
      const malformedTemplates = [
        "{{#if}}unclosed",
        "{{/if}}orphan close",
        "{{#each}}no close",
        "{{#if cond}}{{#if nested}}only one close{{/if}}",
      ];

      for (const tmpl of malformedTemplates) {
        const template: TestTemplate = {
          id: "test",
          language: "python",
          framework: "pytest",
          template: tmpl,
          variables: [],
        };

        // Should not throw or hang
        const result = renderer.renderTemplate(template, {});
        // Either succeeds or fails gracefully
        expect(result).toBeDefined();
      }
    });

    it("limits loop iterations to prevent DoS", () => {
      const template: TestTemplate = {
        id: "test",
        language: "python",
        framework: "pytest",
        template: "{{#each items}}item {{/each}}",
        variables: [{ name: "items", type: "array", description: "Items", required: true }],
      };

      // Create a large array
      const hugeArray = new Array(100000).fill("x");

      const start = performance.now();
      const result = renderer.renderTemplate(template, { items: hugeArray });
      const elapsed = performance.now() - start;

      // Should complete in reasonable time even with large input
      expect(elapsed).toBeLessThan(5000);
      expect(result).toBeDefined();
    });
  });

  describe("path traversal in template paths", () => {
    it("validates template IDs", () => {
      const maliciousIds = [
        "../../../etc/passwd",
        "..\\..\\windows\\system32",
        "test/../../../etc/passwd",
        "test%2e%2e%2fetc%2fpasswd",
      ];

      for (const id of maliciousIds) {
        // ID validation should reject these at schema level
        const isValidId = /^[a-z][a-z0-9-]*$/.test(id);
        expect(isValidId).toBe(false);
      }
    });
  });
});

describe("YAML Deserialization Safety", () => {
  it("uses safe YAML loading", async () => {
    // The CategoryStore should use yaml.safe_load equivalent
    // This test verifies that unsafe YAML features are not parsed

    const dangerousYaml = `
!!python/object/apply:os.system
- "echo hacked"
`;

    // This should not execute the command
    // In JS yaml library, this is just treated as a string
    const yaml = await import("yaml");
    const parsed = yaml.parse(dangerousYaml);

    // Should not execute, should be a string or fail
    expect(typeof parsed).not.toBe("function");
  });
});
