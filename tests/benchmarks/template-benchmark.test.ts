/**
 * Template rendering performance benchmarks.
 *
 * Target: p95 < 100ms per test generation
 */

import { describe, it, expect, beforeAll } from "vitest";

import { TemplateRenderer } from "@/templates/renderer.js";
import { CategoryStore } from "@/categories/store/category-store.js";

import type { TestTemplate } from "@/categories/schema/index.js";

import { resolve } from "path";

const DEFINITIONS_PATH = resolve(__dirname, "../../src/categories/definitions");

describe("Template Rendering Benchmarks", () => {
  let renderer: TemplateRenderer;
  let allTemplates: TestTemplate[];

  beforeAll(async () => {
    renderer = new TemplateRenderer();

    const store = new CategoryStore();
    await store.loadFromDirectory(DEFINITIONS_PATH);

    allTemplates = [];
    for (const category of store.toArray()) {
      allTemplates.push(...category.testTemplates);
    }

    console.log(`  Loaded ${allTemplates.length} templates for benchmarking`);
  });

  describe("single template rendering", () => {
    it("renders simple template in <5ms", () => {
      const template: TestTemplate = {
        id: "simple-test",
        language: "python",
        framework: "pytest",
        template: `def test_{{functionName}}():
    """Test {{functionName}} for security."""
    result = {{functionName}}({{testInput}})
    assert result is not None`,
        variables: [
          { name: "functionName", type: "string", description: "Function name", required: true },
          { name: "testInput", type: "string", description: "Test input", required: true },
        ],
      };

      const timings: number[] = [];

      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        renderer.renderTemplate(template, {
          functionName: "get_user",
          testInput: '"test_id"',
        });
        timings.push(performance.now() - start);
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

      console.log(`    Simple template: avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms`);

      expect(p95).toBeLessThan(5);
    });

    it("renders complex template with loops in <20ms", () => {
      const template: TestTemplate = {
        id: "complex-test",
        language: "python",
        framework: "pytest",
        template: `import pytest
from unittest.mock import Mock

class Test{{className}}Security:
    """Security tests for {{className}}."""
    
    {{#each testCases}}
    def test_{{name}}(self):
        """{{description}}"""
        input_data = {{input}}
        {{#if shouldRaise}}
        with pytest.raises({{exceptionType}}):
            {{functionCall}}(input_data)
        {{#else}}
        result = {{functionCall}}(input_data)
        assert result == {{expected}}
        {{/if}}
    
    {{/each}}
    
    @pytest.mark.parametrize("payload", [
        {{#each payloads}}
        "{{this}}",
        {{/each}}
    ])
    def test_rejects_malicious_input(self, payload):
        with pytest.raises(ValueError):
            {{functionCall}}(payload)`,
        variables: [
          { name: "className", type: "string", description: "Class name", required: true },
          { name: "testCases", type: "array", description: "Test cases", required: true },
          { name: "payloads", type: "array", description: "Malicious payloads", required: true },
          { name: "functionCall", type: "string", description: "Function to call", required: true },
        ],
      };

      const variables = {
        className: "UserService",
        functionCall: "user_service.get_user",
        testCases: [
          { name: "valid_input", description: "Test with valid input", input: '"123"', shouldRaise: false, expected: '{"id": "123"}' },
          { name: "sql_injection", description: "Test SQL injection", input: '"\'; DROP TABLE users;--"', shouldRaise: true, exceptionType: "ValueError" },
          { name: "empty_input", description: "Test empty input", input: '""', shouldRaise: true, exceptionType: "ValueError" },
        ],
        payloads: [
          "'; DROP TABLE users;--",
          "1 OR 1=1",
          "' UNION SELECT * FROM passwords--",
          "<script>alert(1)</script>",
        ],
      };

      const timings: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        renderer.renderTemplate(template, variables);
        timings.push(performance.now() - start);
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

      console.log(`    Complex template: avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms`);

      expect(p95).toBeLessThan(20);
    });

    it("renders deeply nested template in <50ms", () => {
      const template: TestTemplate = {
        id: "nested-test",
        language: "typescript",
        framework: "jest",
        template: `describe('{{className}}', () => {
  {{#each categories}}
  describe('{{name}}', () => {
    {{#each tests}}
    {{#if enabled}}
    test('{{description}}', {{#if async}}async {{/if}}() => {
      {{#each setupSteps}}
      {{this}}
      {{/each}}
      
      {{#if shouldThrow}}
      expect(() => {{action}}).toThrow({{errorType}});
      {{#else}}
      const result = {{#if async}}await {{/if}}{{action}};
      expect(result).{{matcher}}({{expected}});
      {{/if}}
    });
    {{/if}}
    {{/each}}
  });
  {{/each}}
});`,
        variables: [
          { name: "className", type: "string", description: "Class name", required: true },
          { name: "categories", type: "array", description: "Test categories", required: true },
        ],
      };

      const variables = {
        className: "PaymentProcessor",
        categories: [
          {
            name: "validation",
            tests: [
              { description: "validates card number", enabled: true, async: false, setupSteps: ["const processor = new PaymentProcessor();"], action: "processor.validate('4111111111111111')", shouldThrow: false, matcher: "toBe", expected: "true" },
              { description: "rejects invalid card", enabled: true, async: false, setupSteps: ["const processor = new PaymentProcessor();"], action: "processor.validate('invalid')", shouldThrow: true, errorType: "ValidationError" },
            ],
          },
          {
            name: "processing",
            tests: [
              { description: "processes payment", enabled: true, async: true, setupSteps: ["const processor = new PaymentProcessor();", "const mockGateway = jest.fn();"], action: "processor.process({ amount: 100 })", shouldThrow: false, matcher: "toHaveProperty", expected: "'transactionId'" },
              { description: "handles gateway timeout", enabled: true, async: true, setupSteps: ["const processor = new PaymentProcessor({ timeout: 100 });"], action: "processor.process({ amount: 100 })", shouldThrow: true, errorType: "TimeoutError" },
            ],
          },
        ],
      };

      const timings: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        renderer.renderTemplate(template, variables);
        timings.push(performance.now() - start);
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

      console.log(`    Nested template: avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms`);

      expect(p95).toBeLessThan(50);
    });
  });

  describe("batch rendering", () => {
    it("renders 10 templates in <100ms total", () => {
      const templates = allTemplates.slice(0, 10);

      const sampleVariables = {
        functionName: "get_user",
        className: "UserService",
        methodName: "authenticate",
        testInput: '"test_value"',
        expected: '{"success": true}',
        errorType: "ValueError",
        moduleName: "auth",
      };

      const start = performance.now();

      for (const template of templates) {
        renderer.renderTemplate(template, sampleVariables);
      }

      const elapsed = performance.now() - start;

      console.log(`    10 templates: ${elapsed.toFixed(2)}ms (${(elapsed / templates.length).toFixed(2)}ms/template)`);

      expect(elapsed).toBeLessThan(100);
    });

    it("renders 50 templates in <500ms total", () => {
      const templates = allTemplates.slice(0, 50);

      const sampleVariables = {
        functionName: "process_payment",
        className: "PaymentService",
        methodName: "charge",
        testInput: '{"amount": 100}',
        expected: '{"status": "success"}',
        errorType: "PaymentError",
        moduleName: "payments",
      };

      const start = performance.now();

      for (const template of templates) {
        renderer.renderTemplate(template, sampleVariables);
      }

      const elapsed = performance.now() - start;

      console.log(`    50 templates: ${elapsed.toFixed(2)}ms (${(elapsed / templates.length).toFixed(2)}ms/template)`);

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("real template performance", () => {
    it("all loaded templates render in <100ms each", () => {
      const slowTemplates: Array<{ id: string; time: number }> = [];

      const sampleVariables = {
        functionName: "handle_request",
        className: "RequestHandler",
        methodName: "process",
        testInput: '{"data": "test"}',
        expected: "true",
        errorType: "Error",
        moduleName: "handlers",
        maliciousInput: '"; DROP TABLE users;--',
        vulnerableCode: 'cursor.execute(f"SELECT * FROM users WHERE id = {id}")',
        safeCode: 'cursor.execute("SELECT * FROM users WHERE id = ?", (id,))',
      };

      for (const template of allTemplates) {
        const start = performance.now();
        renderer.renderTemplate(template, sampleVariables);
        const elapsed = performance.now() - start;

        if (elapsed > 100) {
          slowTemplates.push({ id: template.id, time: elapsed });
        }
      }

      if (slowTemplates.length > 0) {
        console.log("    Slow templates:");
        for (const t of slowTemplates) {
          console.log(`      ${t.id}: ${t.time.toFixed(2)}ms`);
        }
      }

      expect(slowTemplates.length).toBe(0);
    });
  });
});

describe("Template Parsing Performance", () => {
  let renderer: TemplateRenderer;

  beforeAll(() => {
    renderer = new TemplateRenderer();
  });

  it("parses placeholders in <1ms for typical template", () => {
    const template = `
import pytest
from {{module}} import {{className}}

class Test{{className}}:
    def test_{{methodName}}_with_valid_input(self):
        instance = {{className}}()
        result = instance.{{methodName}}({{validInput}})
        assert result == {{expectedOutput}}
    
    def test_{{methodName}}_with_invalid_input(self):
        instance = {{className}}()
        with pytest.raises({{exceptionType}}):
            instance.{{methodName}}({{invalidInput}})
`;

    const timings: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      renderer.parsePlaceholders(template);
      timings.push(performance.now() - start);
    }

    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

    console.log(`    Placeholder parsing: avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms`);

    expect(p95).toBeLessThan(1);
  });

  it("validates syntax in <5ms for complex template", () => {
    const template = `
{{#if useAsync}}
async function {{functionName}}() {
{{#else}}
function {{functionName}}() {
{{/if}}
  {{#each steps}}
  {{#if isAwait}}await {{/if}}{{action}};
  {{/each}}
  
  {{#unless skipReturn}}
  return {{returnValue}};
  {{/unless}}
}
`;

    const timings: number[] = [];

    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      renderer.validateSyntax(template);
      timings.push(performance.now() - start);
    }

    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)] ?? 0;

    console.log(`    Syntax validation: avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms`);

    expect(p95).toBeLessThan(5);
  });
});
