import type {
  Category,
  DetectionPattern,
  TestTemplate,
  Example,
} from "@/categories/index.js";

/**
 * Create a test category with defaults
 */
export function createTestCategory(overrides?: Partial<Category>): Category {
  return {
    id: "test-sql-injection",
    version: 1,
    name: "Test SQL Injection",
    description: "Test category for SQL injection vulnerabilities in database queries",
    domain: "security",
    level: "integration",
    priority: "P0",
    severity: "critical",
    applicableLanguages: ["python", "typescript"],
    detectionPatterns: [createTestPattern()],
    testTemplates: [createTestTemplate()],
    examples: [createTestExample()],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

/**
 * Create a test detection pattern with defaults
 */
export function createTestPattern(
  overrides?: Partial<DetectionPattern>
): DetectionPattern {
  return {
    id: "test-pattern",
    type: "regex",
    language: "python",
    pattern: "execute\\s*\\(",
    confidence: "high",
    description: "Test pattern for detecting SQL execution calls",
    ...overrides,
  };
}

/**
 * Create a test template with defaults
 */
export function createTestTemplate(
  overrides?: Partial<TestTemplate>
): TestTemplate {
  return {
    id: "test-template",
    language: "python",
    framework: "pytest",
    template: `
import pytest

class Test{{className}}SQLInjection:
    """SQL injection tests for {{functionName}}"""
    
    @pytest.mark.parametrize("malicious_input", [
        "'; DROP TABLE users; --",
        "1 OR 1=1",
    ])
    def test_rejects_sql_injection(self, malicious_input):
        with pytest.raises(ValueError):
            {{functionCall}}(malicious_input)
`.trim(),
    variables: [
      {
        name: "className",
        type: "string",
        description: "Name of the class being tested",
        required: true,
      },
      {
        name: "functionName",
        type: "string",
        description: "Name of the function being tested",
        required: true,
      },
      {
        name: "functionCall",
        type: "string",
        description: "Full function call expression",
        required: true,
      },
    ],
    ...overrides,
  };
}

/**
 * Create a test example with defaults
 */
export function createTestExample(overrides?: Partial<Example>): Example {
  return {
    name: "test-example",
    concept: "SQL injection via string concatenation allows attackers to execute arbitrary SQL",
    vulnerableCode: 'cursor.execute("SELECT * FROM users WHERE id = " + user_id)',
    testCode: `
def test_sql_injection_prevented():
    with pytest.raises(ValueError):
        get_user("'; DROP TABLE users; --")
`.trim(),
    language: "python",
    severity: "critical",
    ...overrides,
  };
}
